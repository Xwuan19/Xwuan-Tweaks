/**
 * @file youtube_adblock.js
 * YouTube — chặn quảng cáo ở tầng mạng cho Shadowrocket / Surge / Loon.
 *
 * Đây là bản port sang môi trường module mạng của các tweak iOS phổ biến
 * (YTLite, YouMod, ytkace). Chúng sửa app ở tầng ObjC/Logos nên KHÔNG dùng
 * được nếu không sideload IPA; bản này chỉ đụng HTTP body.
 *
 * Xem docs: products/youtube/README.md
 * Cú pháp module: products/spotify/audit/shadowrocket-module-syntax.md
 *
 * Kiến trúc: KHÔNG dùng protobufjs (105 KB, không cần thiết). Chỉ cần đọc/ghi
 * wire format ở mức độ field, giữ nguyên byte của mọi field không sửa. Nhờ vậy
 * field lạ do YouTube thêm về sau vẫn đi qua nguyên vẹn.
 */

// ============================================================
// CẤU HÌNH — đổi ở đây, không sửa phần dưới
// ============================================================

/* Số field protobuf, đối chiếu từ hai nguồn độc lập:
 *   - blockads-android  tunnel/internal/mitm/youtube_proto.go  (GPL-3.0)
 *   - imitm             internal/modules/youtube/player_ads.go (MIT)
 * Cả hai đều dùng 7 = adPlacements, 68 = adSlots. */
var FIELD_AD_PLACEMENTS = 7;
var FIELD_AD_SLOTS = 68;

/* 153515154 = elementRenderer. Đây là field chứa một thẻ nội dung trong feed.
 * Cùng giá trị ở cả hai nguồn trên. */
var FIELD_ELEMENT_RENDERER = 153515154;

/* Một elementRenderer nhỏ hơn ngưỡng này gần như chắc chắn không phải ad card
 * (ad card luôn có tracker + advertiser + layout data). Dùng để tránh xoá nhầm
 * item ngắn. */
var MIN_AD_ELEMENT_SIZE = 200;

/* Chuỗi nhận dạng ad/survey nằm BÊN TRONG một elementRenderer. Chỉ xoá khi
 * element khớp một trong các pattern này VÀ không chứa elementRenderer con
 * (ad shelf chứa nhiều item lồng nhau — xoá cả shelf sẽ mất nội dung thật). */
var FEED_AD_PATTERNS = [
    'pagead',
    'adClientParams',
    'adLayoutLoggingData',
    'brandInteraction',
    'visitAdvertiser',
    'ad_cpn',
    'adPlacement',
    'Sponsored',
    'promoted',
    '_survey',
    'compact_survey',
    'survey.eml'
];

/* Shorts: ad reel nhận dạng qua các pattern riêng. `isAd` chuỗi thuần quá dễ
 * khớp nhầm nên đi kèm cặp byte {0x82,0x01,0x02,0x08,0x01} — đó là
 * field 16 (reelWatchEndpoint) → field 1 = varint 1, tức cờ adClientParams. */
var SHORTS_AD_PATTERNS = [
    'pagead',
    'adClientParams',
    'adLayoutLoggingData',
    'brandInteraction',
    'reelAdRenderer',
    'visitAdvertiser',
    'ad_cpn',
    'adPlacement'
];
var PAT_IS_AD = [0x82, 0x01, 0x02, 0x08, 0x01];

var LOG_PREFIX = '[youtube-adblock]';

/* ============================================================
// WIRE FORMAT — đọc / ghi protobuf không cần schema
// ============================================================ */

function ytLog(msg) {
    try { console.log(LOG_PREFIX + ' ' + msg); } catch (_) {}
}

/* Đọc varint tại `pos`. Trả { value, next } hoặc null nếu cụt. */
function readVarint(buf, pos, end) {
    var result = 0;
    var shift = 0;
    while (pos < end) {
        var b = buf[pos++];
        /* Dùng phép nhân thay vì << để không bị tràn số ở 32 bit: giá trị
         * field number lớn nhất ở đây là 153515154 * 8 vẫn nằm trong 2^32
         * nhưng length của message lớn có thể vượt. */
        result += (b & 0x7f) * Math.pow(2, shift);
        if ((b & 0x80) === 0) return { value: result, next: pos };
        shift += 7;
        if (shift > 63) return null;
    }
    return null;
}

/* Ghi varint vào mảng số. */
function writeVarint(value, out) {
    while (value > 0x7f) {
        out.push((value & 0x7f) | 0x80);
        value = Math.floor(value / 128);
    }
    out.push(value & 0x7f);
}

/* Tách danh sách field trong khoảng [pos, end).
 * Mỗi phần tử: { num, wire, start, end, valStart }
 *   start/end: toàn bộ field (cả tag) — dùng để copy nguyên byte
 *   valStart : bắt đầu phần value — dùng để đệ quy
 * Trả null nếu cấu trúc hỏng; caller phải passthrough. */
function readFields(buf, pos, end) {
    var fields = [];
    while (pos < end) {
        var start = pos;
        var tag = readVarint(buf, pos, end);
        if (!tag) return null;
        pos = tag.next;
        var num = Math.floor(tag.value / 8);
        var wire = tag.value & 0x07;
        if (num === 0) return null;

        var valStart;
        if (wire === 0) {
            var v = readVarint(buf, pos, end);
            if (!v) return null;
            valStart = pos;
            pos = v.next;
        } else if (wire === 2) {
            var len = readVarint(buf, pos, end);
            if (!len) return null;
            valStart = len.next;
            pos = valStart + len.value;
            if (pos > end) return null;
        } else if (wire === 5) {
            valStart = pos;
            pos = pos + 4;
            if (pos > end) return null;
        } else if (wire === 1) {
            valStart = pos;
            pos = pos + 8;
            if (pos > end) return null;
        } else {
            /* wire 3/4 (group cũ) không tồn tại trong InnerTube. Gặp là bỏ. */
            return null;
        }
        fields.push({ num: num, wire: wire, start: start, end: pos, valStart: valStart });
    }
    return fields;
}

/* Nối nhiều Uint8Array. */
function concatChunks(chunks) {
    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < chunks.length; j++) {
        out.set(chunks[j], off);
        off += chunks[j].length;
    }
    return out;
}

/* Ghép lại một field từ các mảng số (tag + length + payload). */
function wrapBytesField(num, payload) {
    var head = [];
    writeVarint(num * 8 + 2, head);
    writeVarint(payload.length, head);
    var out = new Uint8Array(head.length + payload.length);
    out.set(head, 0);
    out.set(payload, head.length);
    return out;
}

/* Đổi danh sách chuỗi sang mảng byte MỘT LẦN lúc khởi tạo.
 * Lỗi đã từng mắc: so sánh trực tiếp `buf[i] !== needle[0]` khi needle là
 * string — number !== char luôn đúng nên không bao giờ khớp. Phải so byte với
 * byte. */
function toBytePatterns(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
        var s = list[i];
        var b = new Uint8Array(s.length);
        for (var j = 0; j < s.length; j++) b[j] = s.charCodeAt(j) & 0xff;
        out.push(b);
    }
    return out;
}

function containsAscii(buf, start, end, needle) {
    var first = needle[0];
    var last = end - needle.length;
    outer:
    for (var i = start; i <= last; i++) {
        if (buf[i] !== first) continue;
        for (var j = 1; j < needle.length; j++) {
            if (buf[i + j] !== needle[j]) continue outer;
        }
        return true;
    }
    return false;
}

function containsAnyAscii(buf, start, end, patterns) {
    for (var i = 0; i < patterns.length; i++) {
        var p = patterns[i];
        if (typeof p === 'string') p = toBytePatterns([p])[0];
        if (containsAscii(buf, start, end, p)) return true;
    }
    return false;
}

/* Chuyển các pattern khai báo phía trên sang byte lúc khởi tạo. */
var FEED_AD_BYTES = toBytePatterns(FEED_AD_PATTERNS);
var SHORTS_AD_BYTES = toBytePatterns(SHORTS_AD_PATTERNS);

/* ============================================================
// /youtubei/v1/player — bỏ adPlacements + adSlots
// ============================================================ */

/* Trả về { bytes, removed } — `removed` là số field đã xoá, để caller biết có
 * cần ghi lại body hay không. */
function cleanPlayer(buf, pos, end) {
    var fields = readFields(buf, pos, end);
    if (!fields) return null;

    var chunks = [];
    var removed = 0;
    for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if ((f.num === FIELD_AD_PLACEMENTS || f.num === FIELD_AD_SLOTS) && f.wire === 2) {
            removed++;
            continue;
        }
        chunks.push(buf.subarray(f.start, f.end));
    }
    if (removed === 0) return { bytes: buf.subarray(pos, end), removed: 0 };
    return { bytes: concatChunks(chunks), removed: removed };
}

/* ============================================================
// Feed (browse / next / search) — xoá elementRenderer là ad
// ============================================================ */

/* Trả true nếu khoảng [start,end) có chứa một elementRenderer con. */
function hasNestedElementRenderer(buf, start, end, depth) {
    if (depth > 6) return false;
    var fields = readFields(buf, start, end);
    if (!fields) return false;
    for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.wire !== 2) continue;
        if (f.num === FIELD_ELEMENT_RENDERER) return true;
        if (hasNestedElementRenderer(buf, f.valStart, f.end, depth + 1)) return true;
    }
    return false;
}

/* Đệ quy, xoá elementRenderer khớp pattern ad. Trả { bytes, removed } hoặc
 * null nếu gặp cấu trúc lạ. */
function pruneAds(buf, pos, end, depth) {
    if (depth > 40) return null;
    var fields = readFields(buf, pos, end);
    if (!fields) return null;

    var chunks = [];
    var removed = 0;
    for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.wire !== 2) {
            chunks.push(buf.subarray(f.start, f.end));
            continue;
        }
        var size = f.end - f.start;
        if (f.num === FIELD_ELEMENT_RENDERER &&
            size >= MIN_AD_ELEMENT_SIZE &&
            containsAnyAscii(buf, f.valStart, f.end, FEED_AD_BYTES) &&
            !hasNestedElementRenderer(buf, f.valStart, f.end, 0)) {
            removed++;
            continue;
        }
        /* Đệ quy: chỉ thay khi con cũng có thay đổi, nếu không giữ nguyên byte */
        var sub = pruneAds(buf, f.valStart, f.end, depth + 1);
        if (sub === null) {
            chunks.push(buf.subarray(f.start, f.end));
        } else if (sub.removed > 0) {
            removed += sub.removed;
            chunks.push(wrapBytesField(f.num, sub.bytes));
        } else {
            chunks.push(buf.subarray(f.start, f.end));
        }
    }
    if (removed === 0) return { bytes: buf.subarray(pos, end), removed: 0 };
    return { bytes: concatChunks(chunks), removed: removed };
}

/* ============================================================
// Shorts (reel_watch_sequence) — bỏ entry là ad
// ============================================================ */

function isShortsAd(buf, start, end) {
    if (containsAnyAscii(buf, start, end, SHORTS_AD_BYTES)) return true;
    if (containsAscii(buf, start, end, PAT_IS_AD)) return true;
    return false;
}

function dropShortsAds(buf) {
    var fields = readFields(buf, 0, buf.length);
    if (!fields) return null;
    var chunks = [];
    var removed = 0;
    for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        /* Entry của reel sequence nằm ở field 1 hoặc 2 tuỳ version. */
        if ((f.num === 1 || f.num === 2) && f.wire === 2 && isShortsAd(buf, f.valStart, f.end)) {
            removed++;
            continue;
        }
        chunks.push(buf.subarray(f.start, f.end));
    }
    if (removed === 0) return { bytes: buf, removed: 0 };
    return { bytes: concatChunks(chunks), removed: removed };
}

/* ============================================================
// ENTRY
// ============================================================ */

/* Body của Shadowrocket có thể về dưới nhiều dạng. Chép lại đúng logic đã
 * kiểm chứng trong products/spotify/on-device/engine/spotify_ucs.js. */
function bodyToBytes(body) {
    if (!body) return null;
    if (body instanceof Uint8Array) return body;
    if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
        return new Uint8Array(body);
    }
    if (typeof body === 'object' && body.byteLength !== undefined && body.buffer) {
        return new Uint8Array(body.buffer, body.byteOffset || 0, body.byteLength);
    }
    if (typeof body === 'string') {
        var out = new Uint8Array(body.length);
        for (var i = 0; i < body.length; i++) out[i] = body.charCodeAt(i) & 0xff;
        return out;
    }
    return null;
}

/* Trả body đã sửa. Kiểu phải khớp engine:
 *   webview (mặc định cho http-response): Uint8Array bridge được
 *   jsc: bắt buộc ArrayBuffer, Uint8Array không bridge qua ObjC
 * Xem products/spotify/audit/shadowrocket-module-syntax.md mục 2. */
function buildDoneResponse(bytes) {
    var isJsc = typeof $environment !== 'undefined' && $environment &&
        typeof $environment['engine'] === 'string' &&
        $environment['engine'].toLowerCase().indexOf('jsc') >= 0;

    if (!isJsc) return { body: bytes };

    var ab = new ArrayBuffer(bytes.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < bytes.length; i++) view[i] = bytes[i];
    return { body: ab };
}

/* Passthrough: LUÔN trả nguyên body gốc. `$done({})` sẽ xoá body. */
function donePassthrough(bytes, reason) {
    if (reason) ytLog('passthrough: ' + reason);
    if (!bytes || bytes.length === 0) return $done({});
    return $done(buildDoneResponse(bytes));
}

function parseArgs() {
    var raw = (typeof $argument !== 'undefined' && $argument) ? String($argument) : '';
    var out = { mode: 'ads', debug: false };
    var parts = raw.split('&');
    for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split('=');
        var k = (kv[0] || '').trim();
        var v = (kv[1] || '').trim();
        if (k === 'debug') out.debug = (v === 'true' || v === '1' || v === '');
        else if (k === 'mode' && v) out.mode = v;
    }
    return out;
}

function youtubeMain() {
    var args = parseArgs();
    var url = (typeof $request !== 'undefined' && $request && $request.url) ? $request.url : '';
    var path = url.split('?')[0];

    var bytes = bodyToBytes(
        (typeof $response !== 'undefined' && $response) ? $response.body : null
    );
    if (!bytes || bytes.length === 0) {
        return donePassthrough(bytes, 'body rỗng (304? hoặc thiếu requires-body)');
    }
    if (args.debug) {
        ytLog('hook: ' + path + ' | body=' + bytes.length + ' bytes | head=' +
            bytes[0].toString(16) + ' ' + (bytes[1] || 0).toString(16));
    }
    if (args.mode === 'off') return donePassthrough(bytes, 'mode=off');

    var result = null;

    if (path.indexOf('/youtubei/v1/player') >= 0) {
        result = cleanPlayer(bytes, 0, bytes.length);
    } else if (path.indexOf('/youtubei/v1/get_watch') >= 0) {
        /* /get_watch bọc player ở field 1 → field 2. Đệ quy tìm player. */
        result = pruneAds(bytes, 0, bytes.length, 0);
        if (result && result.removed === 0) {
            var nested = cleanPlayerNested(bytes);
            if (nested) result = nested;
        }
    } else if (path.indexOf('/reel_watch_sequence') >= 0) {
        result = dropShortsAds(bytes);
    } else if (path.indexOf('/youtubei/v1/browse') >= 0 ||
               path.indexOf('/youtubei/v1/next') >= 0 ||
               path.indexOf('/youtubei/v1/search') >= 0) {
        result = pruneAds(bytes, 0, bytes.length, 0);
    }

    if (!result) return donePassthrough(bytes, 'endpoint không xử lý hoặc cấu trúc lạ');
    if (result.removed === 0) return donePassthrough(bytes, 'không có ad');

    ytLog('đã xoá ' + result.removed + ' mục | ' + bytes.length + ' -> ' +
        result.bytes.length + ' bytes | ' + path);
    return $done(buildDoneResponse(result.bytes));
}

/* /get_watch: player nằm ở 1 → 2. Thử dọn ở đó, không đụng phần còn lại. */
function cleanPlayerNested(buf) {
    var top = readFields(buf, 0, buf.length);
    if (!top) return null;
    var chunks = [];
    var removed = 0;
    for (var i = 0; i < top.length; i++) {
        var f = top[i];
        if (f.num !== 1 || f.wire !== 2) {
            chunks.push(buf.subarray(f.start, f.end));
            continue;
        }
        var inner = readFields(buf, f.valStart, f.end);
        if (!inner) { chunks.push(buf.subarray(f.start, f.end)); continue; }
        var innerChunks = [];
        var innerRemoved = 0;
        for (var j = 0; j < inner.length; j++) {
            var g = inner[j];
            if (g.num === 2 && g.wire === 2) {
                var p = cleanPlayer(buf, g.valStart, g.end);
                if (p && p.removed > 0) {
                    innerRemoved += p.removed;
                    innerChunks.push(wrapBytesField(g.num, p.bytes));
                    continue;
                }
            }
            innerChunks.push(buf.subarray(g.start, g.end));
        }
        if (innerRemoved > 0) {
            removed += innerRemoved;
            chunks.push(wrapBytesField(f.num, concatChunks(innerChunks)));
        } else {
            chunks.push(buf.subarray(f.start, f.end));
        }
    }
    if (removed === 0) return null;
    return { bytes: concatChunks(chunks), removed: removed };
}

/* Phần export cho test Node. Trong Shadowrocket thì `$request` tồn tại và
 * module.exports vô nghĩa nên nhánh này không chạy. */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        readVarint: readVarint,
        writeVarint: writeVarint,
        readFields: readFields,
        concatChunks: concatChunks,
        wrapBytesField: wrapBytesField,
        cleanPlayer: cleanPlayer,
        pruneAds: pruneAds,
        dropShortsAds: dropShortsAds,
        bodyToBytes: bodyToBytes,
        FIELD_AD_PLACEMENTS: FIELD_AD_PLACEMENTS,
        FIELD_AD_SLOTS: FIELD_AD_SLOTS,
        FIELD_ELEMENT_RENDERER: FIELD_ELEMENT_RENDERER
    };
}

if (typeof $request !== 'undefined') {
    try {
        youtubeMain();
    } catch (e) {
        ytLog('fatal: ' + e + ' | ' + (e && e.stack));
        var safe = bodyToBytes((typeof $response !== 'undefined' && $response) ? $response.body : null);
        donePassthrough(safe, 'exception');
    }
}
