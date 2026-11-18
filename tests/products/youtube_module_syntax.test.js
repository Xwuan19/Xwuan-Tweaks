// Bộ test bảo vệ CÚ PHÁP module YouTube và sự nhất quán giữa module ↔ engine.
//
// Lý do tồn tại: bản module Spotify đầu tiên có 4 lỗi cú pháp mà test protobuf
// không bắt được, khiến module im lặng trên điện thoại. File này khẳng định
// module YouTube chỉ dùng những dạng đã đối chiếu với module Shadowrocket
// đang chạy thật, và mọi `script-path` đều trỏ tới file có thật trong repo.
//
// Nguồn chuẩn: products/spotify/audit/shadowrocket-module-syntax.md
//
// Chạy: node --test tests/products/youtube_module_syntax.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MODULE_PATH = path.resolve(__dirname, '../../products/youtube/module/youtube-adblock.module');
const ENGINE_PATH = path.resolve(__dirname, '../../products/youtube/engine/youtube_adblock.js');
const RAW = fs.readFileSync(MODULE_PATH, 'utf8');
const LINES = RAW.split('\n');

/** Gom dòng theo section [...] (bỏ comment và dòng trống). */
function sections() {
  const out = {};
  let current = null;
  LINES.forEach((line, idx) => {
    const trimmed = line.trim();
    const header = trimmed.match(/^\[([^\]]+)\]$/);
    if (header) { current = header[1]; out[current] = out[current] || []; return; }
    if (!trimmed || trimmed.startsWith('#')) return;
    if (current) out[current].push({ line: idx + 1, text: trimmed });
  });
  return out;
}

const S = sections();

// ─── metadata ──────────────────────────────────────────────────────────────

test('có đủ metadata #!name / #!desc / #!author', () => {
  assert.match(RAW, /^#!name=.+$/m);
  assert.match(RAW, /^#!desc=.+$/m);
  assert.match(RAW, /^#!author=Xwuan$/m);
});

test('không có BOM và không có CRLF', () => {
  assert.notStrictEqual(RAW.charCodeAt(0), 0xfeff, 'file không được có BOM');
  assert.ok(!RAW.includes('\r'), 'file không được dùng CRLF — Shadowrocket parse sai');
});

// ─── [Script] ──────────────────────────────────────────────────────────────

test('[Script] mỗi hook có requires-body=1 và binary-body-mode=1', () => {
  const scripts = S['Script'];
  assert.ok(scripts && scripts.length >= 5, 'phải có ít nhất 5 hook');
  scripts.forEach(({ line, text }) => {
    assert.match(text, /^[\w-]+\s*=\s*type=http-response,/, `dòng ${line}: phải là http-response`);
    assert.match(text, /requires-body=1/, `dòng ${line}: thiếu requires-body=1 → body rỗng`);
    assert.match(text, /binary-body-mode=1/, `dòng ${line}: thiếu binary-body-mode=1 → protobuf bị cắt`);
  });
});

test('[Script] không dùng engine=jsc cho hook binary', () => {
  (S['Script'] || []).forEach(({ line, text }) => {
    assert.ok(!/engine=jsc/.test(text), `dòng ${line}: jsc không bridge được Uint8Array`);
  });
});

test('[Script] max-size là số dương, không phải 0 hay -1', () => {
  (S['Script'] || []).forEach(({ line, text }) => {
    const m = text.match(/max-size=(-?\d+)/);
    assert.ok(m, `dòng ${line}: thiếu max-size`);
    assert.ok(Number(m[1]) > 0, `dòng ${line}: max-size phải > 0 (gặp ${m[1]})`);
  });
});

test('[Script] script-path trỏ tới engine có thật và có ?v= chống cache', () => {
  const engineRaw = 'https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/'
    + 'products/youtube/engine/youtube_adblock.js';
  (S['Script'] || []).forEach(({ line, text }) => {
    const m = text.match(/script-path=([^,]+)/);
    assert.ok(m, `dòng ${line}: thiếu script-path`);
    const url = m[1];
    assert.ok(url.startsWith(engineRaw), `dòng ${line}: script-path phải trỏ tới engine chuẩn`);
    assert.match(url, /\?v=\d{8}_\d+$/, `dòng ${line}: thiếu ?v= → user chạy code cũ`);
  });
});

test('[Script] có hook cho cả 4 nhóm endpoint đã implement', () => {
  const all = (S['Script'] || []).map((s) => s.text).join('\n');
  ['/player', '/get_watch', '/browse', '/next', '/search', '/reel_watch_sequence'].forEach((ep) => {
    assert.ok(all.includes(ep.replace('/', '\\/')), `thiếu hook cho ${ep}`);
  });
});

test('[Script] tên hook là duy nhất', () => {
  const names = (S['Script'] || []).map((s) => s.text.split('=')[0].trim());
  assert.strictEqual(new Set(names).size, names.length, 'có hook trùng tên');
});

// ─── [MITM] ────────────────────────────────────────────────────────────────

test('[MITM] dùng %APPEND% và h2 = true', () => {
  const mitm = S['MITM'];
  assert.ok(mitm, 'thiếu section [MITM]');
  const hostLine = mitm.find((l) => l.text.startsWith('hostname'));
  assert.ok(hostLine, 'thiếu hostname');
  assert.match(hostLine.text, /%APPEND%/, 'thiếu %APPEND% → ghi đè host của config user');
  assert.ok(mitm.some((l) => /^h2\s*=\s*true$/.test(l.text)), 'thiếu h2 = true');
});

test('[MITM] có host của mọi endpoint được hook', () => {
  const hostLine = S['MITM'].find((l) => l.text.startsWith('hostname')).text;
  assert.ok(hostLine.includes('youtubei.googleapis.com'), 'thiếu youtubei.googleapis.com');
});

// ─── [Rule] ────────────────────────────────────────────────────────────────

test('[Rule] dùng PROTOCOL,UDP chứ không phải PROTOCOL,QUIC', () => {
  const rules = S['Rule'] || [];
  assert.ok(rules.length > 0, 'thiếu section [Rule]');
  const joined = rules.map((r) => r.text).join('\n');
  assert.ok(!/PROTOCOL,\s*QUIC/.test(joined), 'QUIC không phải token của Shadowrocket');
  assert.ok(/PROTOCOL,\s*UDP/.test(joined), 'phải chặn UDP để ép YouTube rời QUIC');
});

// ─── [URL Rewrite] ─────────────────────────────────────────────────────────

test('[URL Rewrite] dùng dấu _ phân cách và action reject-200', () => {
  const rewrites = S['URL Rewrite'] || [];
  assert.ok(rewrites.length > 0, 'thiếu section [URL Rewrite]');
  rewrites.forEach(({ line, text }) => {
    assert.match(text, /^(\^|https?:)/, `dòng ${line}: phải bắt đầu bằng regex URL`);
    const m = text.match(/\s_\s(\S+)\s*$/);
    assert.ok(m, `dòng ${line}: thiếu " _ <action>" — thiếu _ thì cả dòng bị coi là regex`);
    assert.strictEqual(m[1], 'reject-200', `dòng ${line}: chỉ dùng reject-200 (gặp ${m[1]})`);
  });
});

// ─── engine ↔ module ───────────────────────────────────────────────────────

test('engine dùng đúng số field protobuf đã đối chiếu (7 và 68)', () => {
  const src = fs.readFileSync(ENGINE_PATH, 'utf8');
  assert.match(src, /var FIELD_AD_PLACEMENTS = 7;/, 'field adPlacements phải là 7');
  assert.match(src, /var FIELD_AD_SLOTS = 68;/, 'field adSlots phải là 68');
  assert.match(src, /var FIELD_ELEMENT_RENDERER = 153515154;/, 'elementRenderer phải là 153515154');
});

test('engine không bao giờ dùng $done({}) làm passthrough', () => {
  const src = fs.readFileSync(ENGINE_PATH, 'utf8');
  // Bỏ comment trước khi đếm: trong file có câu giải thích "$done({}) sẽ xoá
  // body" — nếu không lọc thì chính comment làm test fail.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  // $done({}) chỉ được phép ở đúng một chỗ: khi body vốn đã rỗng (304).
  const bare = code.match(/\$done\(\{\}\)/g) || [];
  assert.strictEqual(bare.length, 1, 'chỉ được có 1 chỗ $done({}) — nhánh body rỗng');
  assert.match(src, /function donePassthrough/, 'phải có donePassthrough trả body gốc');
});

test('engine trả ArrayBuffer khi chạy jsc, Uint8Array khi webview', () => {
  const src = fs.readFileSync(ENGINE_PATH, 'utf8');
  assert.match(src, /function buildDoneResponse/, 'thiếu buildDoneResponse');
  assert.match(src, /\$environment\[.engine.\]/, 'phải đọc engine từ $environment');
  assert.match(src, /new ArrayBuffer\(bytes\.length\)/, 'jsc phải nhận ArrayBuffer');
});

test('engine không require thư viện ngoài', () => {
  const src = fs.readFileSync(ENGINE_PATH, 'utf8');
  assert.ok(!/require\(['"](?!node:)?[a-z@]/i.test(src.replace(/module\.exports[\s\S]*$/, '')),
    'engine phải tự chứa, không require thư viện — Shadowrocket không có node_modules');
});

test('engine bọc entry trong try/catch để không bao giờ làm sập response', () => {
  const src = fs.readFileSync(ENGINE_PATH, 'utf8');
  assert.match(src, /try\s*\{\s*youtubeMain\(\);/, 'entry phải được bọc try/catch');
});
