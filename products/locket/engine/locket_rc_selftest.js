/**
 * @file locket_rc_selftest.js
 * Đọc kết quả chẩn đoán RevenueCat và xuất ra một URL đọc được.
 *
 * CÁCH DÙNG
 * ---------
 * Trong Safari trên máy đã bật proxy:
 *
 *     https://api.revenuecat.com/v1/xwuan-selftest
 *
 * Rồi mở `数据 > 代理`, tìm dòng `?xwuan-report=...`. Đọc:
 *
 *   ent=          tên entitlement hiện có (rỗng = tài khoản chưa mua)
 *   entn=         số entitlement hiện có
 *   sub=          product id đang có (tối đa 3, để chọn `pid=` cho patch)
 *   sig=          tên header chữ ký tìm thấy ở response gần nhất
 *                 -> 'n'  nghĩa là endpoint KHÔNG được ký: patch sạch
 *                 -> tên header nghĩa là CÓ ký: có thể failed, xem README
 *   etag=y/n      response gần nhất có ETag không
 *   st=           phase gần nhất (report / patched / need_ek_pid /
 *                 not_modified / empty_body / parse_fail / gzip / exception)
 *
 * Đây là nơi lấy hai tham số cho `argument=patch`:
 *   ek=  lấy từ `ent=`  (nếu trống, xem README mục "khi ent rỗng")
 *   pid= lấy từ `sub=`  hoặc từ remote config đã capture
 */

var STORE_KEY = 'XwuanLocketRCDiag';

function readDiag() {
    try {
        if (typeof $persistentStore === 'undefined' || !$persistentStore.read) return null;
        var raw = $persistentStore.read(STORE_KEY);
        if (!raw) return null;
        return (typeof raw === 'string') ? JSON.parse(raw) : raw;
    } catch (e) {
        return null;
    }
}

function fmt(v) {
    if (v === undefined || v === null || v === '') return '-';
    return String(v);
}

function main() {
    var url = (typeof $request !== 'undefined' && $request && $request.url) ? $request.url : '';
    var d = readDiag();
    var report;

    if (!d) {
        report = 'v1;state=never_ran;hint=check_mitm_ca_and_request_hook';
    } else {
        var ageSec = Math.round((Date.now() - (d.lastAt || 0)) / 1000);
        report = 'v1'
            + ';state=ran'
            + ';st=' + encodeURIComponent(fmt(d.reason))
            + ';phase=' + encodeURIComponent(fmt(d.lastPhase))
            + ';entn=' + encodeURIComponent(fmt(d.entCount))
            + ';ent=' + encodeURIComponent(fmt(d.entKeys))
            + ';sub=' + encodeURIComponent(fmt(d.subKeys))
            + ';sig=' + encodeURIComponent(fmt(d.hasSigHeader))
            + ';etag=' + encodeURIComponent(fmt(d.hasEtag))
            + ';dropped=' + encodeURIComponent(fmt(d.dropped))
            + ';age=' + encodeURIComponent(ageSec + 's');
    }

    var base = url.split('?')[0];
    var out = base + '?xwuan-report=' + report;

    try {
        $done({ url: out });
    } catch (e) {
        try { $done({}); } catch (_) {}
    }
}

try {
    main();
} catch (e) {
    try { $done({}); } catch (_) {}
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { readDiag: readDiag };
}
