/**
 * @file locket_selftest.js
 * Đọc kết quả chẩn đoán của engine Locket Remote Config và xuất ra chỗ đọc được.
 *
 * VÌ SAO CẦN FILE NÀY
 * -------------------
 * Shadowrocket không có trình xem log script:
 *   - `数据 > 代理` chỉ liệt kê kết nối (URL / rule / protocol / MITM).
 *   - `console.log` của script không hiện ở đâu cả.
 * Nên engine ghi số liệu vào `$persistentStore`, file này đọc ra và nhét vào
 * query của một URL — đúng convention đã dùng cho YouTube (`youtube_selftest.js`).
 *
 * CÁCH DÙNG
 * ---------
 * Script này là `type=http-request`. Mở Safari trên máy đã bật proxy:
 *
 *     https://firebaseremoteconfig.googleapis.com/xwuan-selftest
 *
 * Rồi mở `数据 > 代理`, tìm dòng có `?xwuan-report=...` và đọc:
 *
 *   state=never_ran  -> engine chưa từng chạy. Kiểm tra MITM + CA + route.
 *   state=ran        -> engine có chạy. Đọc tiếp phase / keys / eg.
 *
 * QUAN TRỌNG: `eg` (examples) là thứ đáng đọc nhất khi chạy `argument=capture`.
 * Nó cho thấy tên key thật và giá trị thật của app — từ đó biết cờ nào cần
 * lật, thay vì đoán.
 */

var STORE_KEY = 'XwuanLocketDiag';

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
        report = 'v1;state=never_ran;hint=check_mitm_ca_and_route';
    } else {
        var ageSec = Math.round((Date.now() - (d.lastAt || 0)) / 1000);
        report = 'v1'
            + ';state=ran'
            + ';phase=' + encodeURIComponent(fmt(d.lastPhase))
            + ';reason=' + encodeURIComponent(fmt(d.reason))
            + ';mode=' + encodeURIComponent(fmt(d.mode))
            + ';n=' + encodeURIComponent(fmt(d.keyCount))
            + ';fl=' + encodeURIComponent(fmt(d.flipped))
            + ';b64=' + encodeURIComponent(fmt(d.b64Count))
            + ';in=' + encodeURIComponent(fmt(d.inBytes))
            + ';age=' + encodeURIComponent(ageSec + 's')
            + ';keys=' + encodeURIComponent(fmt(d.keys))
            + ';eg=' + encodeURIComponent(fmt(d.eg)).slice(0, 400);
    }

    /* Thay URL của chính request này bằng bản báo cáo. Vì đây là
     * http-request, Shadowrocket sẽ ghi URL mới vào log kết nối — đó là chỗ
     * duy nhất người dùng đọc được. */
    var base = url.split('?')[0];
    var out = base + '?xwuan-report=' + report;

    try {
        $done({ url: out });
    } catch (e) {
        $done({});
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
