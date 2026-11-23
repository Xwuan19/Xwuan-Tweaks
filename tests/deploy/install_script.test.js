const { execSync } = require('child_process');
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SCRIPT = path.resolve(__dirname, '../../deploy/install.sh');
const S = fs.readFileSync(SCRIPT, 'utf8');

test('bash syntax hợp lệ', () => {
  execSync(`bash -n "${SCRIPT}"`);
});

test('có đủ 4 chế độ', () => {
  for (const m of ['--status', '--regen-ca', '--firewall-off', '--help']) {
    assert.ok(S.includes(m), `thiếu ${m}`);
  }
});

test('QUIC: dùng REJECT chứ không DROP', () => {
  assert.ok(S.includes('icmp-port-unreachable'));
  assert.ok(!/iptables .*--dport 443 .*-j DROP/.test(S), 'không được DROP UDP 443');
});

test('UFW: kiểm rule 22 trước khi thêm gì', () => {
  const idx22 = S.indexOf('22/tcp');
  const idx443 = S.indexOf('443/tcp >/dev/null');
  assert.ok(idx22 > 0 && idx443 > idx22, 'rule 22 phải xuất hiện trước 443');
});

test('KHÔNG tự bật ufw enable (tránh khoá SSH)', () => {
  const active = S.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.ok(!/^\s*ufw enable/m.test(active), 'không được tự ufw enable');
});

test('UA khớp với proxy/main.go: PORT + ROOT_CA_CRT_FILE + ROOT_CA_KEY_FILE', () => {
  assert.ok(S.includes('PORT=443'));
  assert.ok(S.includes('ROOT_CA_CRT_FILE'));
  assert.ok(S.includes('ROOT_CA_KEY_FILE'));
});

test('CA: basicConstraints CA:TRUE + keyCertSign', () => {
  assert.ok(S.includes('basicConstraints=critical,CA:TRUE'));
  assert.ok(S.includes('keyCertSign'));
});

test('systemd: bind 443 không cần root toàn phần', () => {
  assert.ok(S.includes('CAP_NET_BIND_SERVICE'));
  assert.ok(S.includes('NoNewPrivileges=true'));
  assert.ok(S.includes('Restart=always'));
});

test('mọi lần curl TẢI VỀ đều có --max-time (không treo vô hạn)', () => {
  // Chỉ xét lệnh tải thật: loại dòng apt, dòng gợi ý trong heredoc, comment.
  const lines = S.split('\n').filter((l) => {
    const t = l.trim();
    if (t.startsWith('#')) return false;
    if (t.startsWith('apt-get')) return false;
    if (!t.includes('curl ')) return false;
    return t.includes('-o ') || t.includes('-O ') || t.includes('-fsSL');
  });
  assert.ok(lines.length >= 4, `phải có ít nhất 4 lệnh tải, thấy ${lines.length}`);
  for (const c of lines) {
    assert.ok(c.includes('--max-time'), `thiếu timeout: ${c.trim().slice(0, 70)}`);
  }
});
