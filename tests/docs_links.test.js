// Test tài liệu: AGENTS.md / README / HANDOFF phải trỏ tới file có thật, và số
// test ghi trong tài liệu phải khớp số test thật.
//
// Vì sao cần: repo này đã có lúc README ghi "35 test" khi thật là 156, và
// HANDOFF ghi "hướng DNS tạm dừng" khi deploy/ đã có. Agent đọc tài liệu sai sẽ
// làm sai — nên để máy kiểm tra thay vì tin người viết.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

function mdLinks(src) {
  // Chỉ lấy link nội bộ dạng [x](path) — bỏ http/https và neo #.
  const out = [];
  const re = /\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(src))) {
    const target = m[1].split('#')[0];
    if (!target || /^https?:/i.test(target)) continue;
    out.push(target);
  }
  return out;
}

test('AGENTS.md tồn tại và có các mục bắt buộc', () => {
  const s = read('AGENTS.md');
  for (const h of ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.', '## 8.', '## 9.']) {
    assert.ok(s.includes(h), `thiếu mục ${h}`);
  }
});

test('AGENTS.md: mọi link nội bộ trỏ tới file có thật', () => {
  const s = read('AGENTS.md');
  for (const target of mdLinks(s)) {
    const p = path.join(ROOT, target);
    assert.ok(fs.existsSync(p), `link chết trong AGENTS.md: ${target}`);
  }
});

test('README.md: mọi link nội bộ trỏ tới file có thật', () => {
  const s = read('README.md');
  for (const target of mdLinks(s)) {
    assert.ok(fs.existsSync(path.join(ROOT, target)), `link chết trong README.md: ${target}`);
  }
});

test('HANDOFF.md: mọi link nội bộ trỏ tới file có thật', () => {
  const s = read('HANDOFF.md');
  for (const target of mdLinks(s)) {
    assert.ok(fs.existsSync(path.join(ROOT, target)), `link chết trong HANDOFF.md: ${target}`);
  }
});

test('số test ghi trong tài liệu khớp số test thật', () => {
  // Đếm bằng chính node --test, không đếm bằng grep.
  // Bỏ CHÍNH file này khỏi vòng đếm: nếu không nó spawn lại chính nó, đệ quy
  // vô hạn và cả suite timeout.
  const self = path.basename(__filename);
  const files = execSync(`find ${ROOT}/tests -name '*.test.js' | sort`)
    .toString().trim().split('\n')
    .filter((f) => path.basename(f) !== self);
  let pass = 0;
  for (const f of files) {
    // Phải XOÁ NODE_TEST_CONTEXT: khi chạy trong `node --test`, biến này làm
    // process con coi mình là test-runner con và không in bảng tổng kết.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const r = require('node:child_process').spawnSync('node', ['--test', f], {
      cwd: ROOT, encoding: 'utf8', env
    });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = out.match(/^# pass (\d+)$/m);
    if (m) pass += Number(m[1]);
  }
  assert.ok(pass > 0, 'phải đếm được test');

  // `pass` ở trên KHÔNG gồm file này, nên tổng suite = pass + số test của chính
  // file này. Đếm số test của mình bằng số dòng bắt đầu bằng `test(`.
  const selfCount = (fs.readFileSync(__filename, 'utf8').match(/^test\(/gm) || []).length;
  const total = pass + selfCount;

  for (const doc of ['AGENTS.md', 'HANDOFF.md', 'README.md']) {
    const s = read(doc);
    const nums = [...s.matchAll(/(\d{2,4})\s*(?:pass|test)/gi)].map((m) => Number(m[1]));
    if (!nums.length) continue;
    assert.ok(
      nums.includes(total),
      `${doc} ghi số test không khớp: thấy ${[...new Set(nums)].join(',')} nhưng thật là ${total}`
    );
  }
});

test('README và AGENTS không còn nói hướng DNS "tạm dừng"', () => {
  for (const doc of ['README.md', 'AGENTS.md']) {
    const s = read(doc);
    assert.ok(
      !/hướng DNS.*tạm dừng|DNS.*tạm dừng cùng đợt/i.test(s),
      `${doc} còn nói hướng DNS tạm dừng, nhưng deploy/ đã có`
    );
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'deploy/install.sh')), 'deploy/install.sh phải tồn tại');
});

test('AGENTS.md cảnh báo đúng về $done({}) và TextDecoder', () => {
  const s = read('AGENTS.md');
  assert.ok(/\$done\(\{\}\).*body RỖNG/.test(s));
  assert.ok(s.includes('TextDecoder'));
});

test('AGENTS.md nói rõ chỉ Shadowrocket', () => {
  const s = read('AGENTS.md');
  assert.ok(/Chỉ Shadowrocket/i.test(s));
});
