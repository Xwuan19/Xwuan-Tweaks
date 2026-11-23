#!/usr/bin/env bash
# ============================================================================
# install.sh — dựng Locket MITM proxy trên VPS Ubuntu/Debian sạch
#
# Đã tính cho: LunaCloud VPS Eco 1 (1 vCPU, 1 GB RAM, 20 GB SSD, Ubuntu).
# Chạy được trên mọi VPS có IPv4 công khai và cổng 443 thô.
#
#   sudo bash install.sh                 # dựng lần đầu (hoặc cập nhật binary)
#   sudo bash install.sh --regen-ca      # sinh lại CA (mọi máy phải cài lại profile)
#   sudo bash install.sh --status        # xem trạng thái, KHÔNG đổi gì
#   sudo bash install.sh --firewall-off  # mở lại UFW 22 (nếu bạn tự khoá mình ra)
#
# NGUYÊN TẮC: không bao giờ xoá state cũ. Systemd unit chỉ được tạo nếu đã tạo
# xong và đã test — trước khi có unit thì binary chạy trong screen, nên SSH
# ngắt giữa lúc cài không làm bạn mất đường vào.
#
# AN TOÀN: script này KHÔNG mở cổng 22 ra ngoài thêm lần nào, và không tắt
# firewall có sẵn. Nó chỉ THÊM rule cho 443 và (tuỳ chọn) giới hạn 443 theo IP.
# ============================================================================

set -euo pipefail

DOMAIN="${DOMAIN:-locket.vibecodevietnam.io.vn}"
APP_USER="locket"
APP_DIR="/opt/locket-proxy"
CA_DIR="/etc/locket-proxy/ca"
BIN="${APP_DIR}/locket-proxy"
UNIT="/etc/systemd/system/locket-proxy.service"
STATE_DIR="/var/lib/locket-proxy"
GO_VERSION="1.22.10"
REPO_RAW="https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main"

# ── màu ─────────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;36m'; N='\033[0m'
else
  R=''; G=''; Y=''; B=''; N=''
fi
say()  { printf "${B}==>${N} %s\n" "$*"; }
ok()   { printf "${G}  ✓${N} %s\n" "$*"; }
warn() { printf "${Y}  !${N} %s\n" "$*"; }
die()  { printf "${R}  ✗ %s${N}\n" "$*" >&2; exit 1; }

# ── tham số ─────────────────────────────────────────────────────────────────
MODE="install"
case "${1:-}" in
  --status)       MODE="status" ;;
  --regen-ca)     MODE="regen" ;;
  --firewall-off) MODE="fw-off" ;;
  --help|-h)      sed -n '2,30p' "$0"; exit 0 ;;
  "") ;;
  *) die "tham số không hiểu: $1  (dùng --help)" ;;
esac

[ "$(id -u)" -eq 0 ] || die "phải chạy bằng root:  sudo bash $0"

# ============================================================================
# STATUS
# ============================================================================
if [ "$MODE" = "status" ]; then
  say "Trạng thái"
  echo
  if systemctl is-active --quiet locket-proxy 2>/dev/null; then
    ok "service: $(systemctl is-active locket-proxy)"
  else
    warn "service: chưa chạy"
  fi
  echo "  binary : $([ -x "$BIN" ] && echo "có ($(stat -c%s "$BIN") byte)" || echo "chưa có")"
  echo "  CA cert: $([ -f "$CA_DIR/root-ca.crt" ] && echo "có" || echo "CHƯA CÓ")"
  echo "  CA key : $([ -f "$CA_DIR/root-ca.key" ] && echo "có (0600)" || echo "CHƯA CÓ")"
  if [ -f "$CA_DIR/root-ca.crt" ]; then
    echo "  hết hạn: $(openssl x509 -in "$CA_DIR/root-ca.crt" -noout -enddate | cut -d= -f2)"
    echo "  SHA256 : $(openssl x509 -in "$CA_DIR/root-ca.crt" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':')"
  fi
  echo
  echo "  cổng 443 TCP: $(ss -lntp 2>/dev/null | grep -c ':443 ' || true) listener"
  echo "  cổng 443 UDP: $(ss -lnu 2>/dev/null | grep -c ':443 ' || true) listener (0 = QUIC bị chặn, đúng)"
  echo
  echo "  UFW:"
  ufw status 2>/dev/null | sed 's/^/    /' || echo "    (chưa cài ufw)"
  echo
  echo "  Log 20 dòng cuối:"
  journalctl -u locket-proxy -n 20 --no-pager 2>/dev/null | sed 's/^/    /' || \
    tail -20 "$STATE_DIR/proxy.log" 2>/dev/null | sed 's/^/    /' || echo "    (chưa có log)"
  echo
  echo "  Test tại chỗ:"
  if curl -s --max-time 5 http://127.0.0.1:8080/healthz >/dev/null 2>&1; then
    ok "healthz trả lời"
  else
    warn "healthz không trả lời (proxy chưa chạy hoặc chưa có healthz — xem README)"
  fi
  exit 0
fi

# ============================================================================
# FIREWALL OFF — cứu khi tự khoá SSH
# ============================================================================
if [ "$MODE" = "fw-off" ]; then
  say "Mở lại cổng 22 cho mọi IP (khôi phục khi bị khoá SSH)"
  ufw allow 22/tcp || true
  ok "đã thêm: ufw allow 22/tcp"
  warn "Thoát ra thử SSH lại. Nếu vẫn vào được, siết lại bằng cách chạy install.sh"
  exit 0
fi

# ============================================================================
# KIỂM TRA MÔI TRƯỜNG
# ============================================================================
say "Kiểm tra môi trường"
. /etc/os-release 2>/dev/null || die "không đọc được /etc/os-release"
ok "$PRETTY_NAME"

PUBIP="$(curl -4fsS --max-time 10 https://api.ipify.org || curl -4fsS --max-time 10 https://ifconfig.me || true)"
[ -n "$PUBIP" ] || die "không lấy được IPv4 công khai (máy có ra được internet không?)"
ok "IPv4 công khai: $PUBIP"

# DNS của domain — cảnh báo nếu chưa trỏ về máy này
if command -v dig >/dev/null 2>&1 || command -v getent >/dev/null 2>&1; then
  RESOLVED="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
  if [ -z "$RESOLVED" ]; then
    warn "$DOMAIN chưa resolve. Ghi A record $DOMAIN → $PUBIP trước khi xin cert"
  elif [ "$RESOLVED" != "$PUBIP" ]; then
    warn "$DOMAIN đang trỏ $RESOLVED, không phải $PUBIP — Let's Encrypt sẽ từ chối"
  else
    ok "$DOMAIN → $PUBIP"
  fi
fi

# Kiểm tra cổng 443 đang bị ai chiếm chưa
if ss -lnt 2>/dev/null | grep -q ':443 '; then
  warn "cổng 443 TCP đã có process khác nghe. Nếu là nginx/apache của LunaCloud:"
  warn "  tắt nó (systemctl disable --now nginx) hoặc đổi cổng proxy trong file này"
  ss -lntp 2>/dev/null | grep ':443 ' | sed 's/^/    /'
fi

apt-get update -qq
apt-get install -y -qq curl ca-certificates openssl ufw \
  >/dev/null 2>&1 || die "apt install thất bại"
ok "gói nền đã cài"

# ============================================================================
# CA — sinh nếu chưa có
# ============================================================================
mkdir -p "$CA_DIR" "$STATE_DIR"
chmod 700 "$CA_DIR"

if [ "$MODE" = "regen" ]; then
  if [ -f "$CA_DIR/root-ca.key" ]; then
    BACKUP="$CA_DIR/root-ca.key.bak-$(date +%Y%m%d%H%M%S)"
    cp -a "$CA_DIR/root-ca.key" "$BACKUP"
    warn "CA cũ đã sao lưu: $BACKUP"
  fi
  warn "Sinh CA MỚI — mọi thiết bị phải cài lại profile"
  rm -f "$CA_DIR/root-ca.crt" "$CA_DIR/root-ca.key"
fi

if [ ! -f "$CA_DIR/root-ca.key" ]; then
  say "Sinh Root CA (RSA 4096, 10 năm)"
  openssl genrsa -out "$CA_DIR/root-ca.key" 4096 2>/dev/null
  chmod 600 "$CA_DIR/root-ca.key"
  openssl req -new -x509 \
    -key "$CA_DIR/root-ca.key" \
    -out "$CA_DIR/root-ca.crt" \
    -days 3650 \
    -subj "/C=VN/O=Xwuan Tweaks/CN=Xwuan Locket Root CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash"
  chmod 644 "$CA_DIR/root-ca.crt"
  ok "CA: $CA_DIR/root-ca.crt"
else
  ok "CA đã có, giữ nguyên"
fi

# ============================================================================
# BINARY — build trên máy (không cần Docker, 1 GB RAM là đủ)
# ============================================================================
NEED_BUILD=1
if [ -x "$BIN" ] && [ "$MODE" = "install" ] && [ "${FORCE_BUILD:-0}" != "1" ]; then
  # vẫn build lại: người dùng chạy lại script thường là để cập nhật
  NEED_BUILD=1
fi

if [ "$NEED_BUILD" = "1" ]; then
  say "Cài Go ${GO_VERSION} (nếu chưa có)"
  if ! command -v go >/dev/null 2>&1; then
    ARCH="$(dpkg --print-architecture)"
    case "$ARCH" in
      amd64) GOARCH="amd64" ;;
      arm64) GOARCH="arm64" ;;
      *) die "kiến trúc không hỗ trợ: $ARCH" ;;
    esac
    TARBALL="go${GO_VERSION}.linux-${GOARCH}.tar.gz"
    curl -fsSL --max-time 300 -o "/tmp/$TARBALL" "https://go.dev/dl/$TARBALL" \
      || die "tải Go thất bại"
    rm -rf /usr/local/go
    tar -C /usr/local -xzf "/tmp/$TARBALL"
    rm -f "/tmp/$TARBALL"
    ln -sf /usr/local/go/bin/go /usr/local/bin/go
    ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
  fi
  ok "$(go version)"

  say "Lấy mã nguồn (chỉ proxy/ + go.mod)"
  SRC="/tmp/locket-src"
  rm -rf "$SRC"; mkdir -p "$SRC/proxy"
  for f in main.go; do
    curl -fsSL --max-time 60 -o "$SRC/proxy/$f" "$REPO_RAW/proxy/$f" || die "tải proxy/$f thất bại"
  done
  for f in firebase.go locket_api.go photobooth.go revenuecat.go camera_filter_config.json; do
    curl -fsSL --max-time 120 -o "$SRC/proxy/handler/$f" "$REPO_RAW/proxy/handler/$f" \
      || die "tải proxy/handler/$f thất bại"
  done
  for f in ca.go cache.go; do
    curl -fsSL --max-time 60 -o "$SRC/proxy/tls/$f" "$REPO_RAW/proxy/tls/$f" || die "tải proxy/tls/$f thất bại"
  done
  curl -fsSL --max-time 30 -o "$SRC/go.mod" "$REPO_RAW/go.mod" || die "tải go.mod thất bại"
  ok "đã tải $(find "$SRC" -type f | wc -l) file"

  say "Build (CGO off, static)"
  mkdir -p "$APP_DIR"
  ( cd "$SRC" && CGO_ENABLED=0 GOOS=linux go build \
      -trimpath -ldflags="-s -w" -o "$BIN" ./proxy ) || die "build thất bại"
  chmod 755 "$BIN"
  ok "binary: $BIN ($(stat -c%s "$BIN") byte)"
fi

# user riêng, không cho login
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
  ok "tạo user hệ thống: $APP_USER"
fi
chown -R root:"$APP_USER" "$CA_DIR"
chmod 750 "$CA_DIR"
chmod 640 "$CA_DIR/root-ca.key"
chown "$APP_USER":"$APP_USER" "$STATE_DIR"

# ============================================================================
# SYSTEMD — tạo sau cùng, sau khi binary đã có và đã test chạy được
# ============================================================================
say "Kiểm tra binary chạy được (5 giây)"
if ! ( cd "$APP_DIR" && PORT=8080 ROOT_CA_CRT_FILE="$CA_DIR/root-ca.crt" \
       ROOT_CA_KEY_FILE="$CA_DIR/root-ca.key" \
       timeout 5 "$BIN" >"$STATE_DIR/probe.log" 2>&1 & ) ; then
  warn "không khởi động thử được — xem $STATE_DIR/probe.log"
fi
sleep 2
if grep -qi "listening" "$STATE_DIR/probe.log" 2>/dev/null; then
  ok "binary khởi động OK"
else
  warn "không thấy dòng 'listening' — vẫn tiếp tục, xem log nếu lỗi"
  sed 's/^/    /' "$STATE_DIR/probe.log" 2>/dev/null | head -10
fi
pkill -f "$BIN" 2>/dev/null || true

say "Tạo systemd unit"
cat > "$UNIT" <<UNITEOF
[Unit]
Description=Locket MITM Proxy (Xwuan)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
# PORT 443: nhận đúng cổng mà thiết bị kết nối. Không có cách khác — DNS
# không mang được số cổng.
Environment=PORT=443
Environment=ROOT_CA_CRT_FILE=${CA_DIR}/root-ca.crt
Environment=ROOT_CA_KEY_FILE=${CA_DIR}/root-ca.key
# Ghi log đủ để chẩn đoán, nhưng không log body
Environment=GODEBUG=http2server=0
ExecStart=${BIN}
Restart=always
RestartSec=3
# Chỉ cần bind 443 + đọc CA; không cần quyền khác
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=${CA_DIR}
StateDirectory=locket-proxy
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNITEOF

# quyền đọc key: group locket
chown root:"$APP_USER" "$CA_DIR/root-ca.key" "$CA_DIR/root-ca.crt"
chmod 640 "$CA_DIR/root-ca.key"

systemctl daemon-reload
systemctl enable locket-proxy >/dev/null 2>&1
systemctl restart locket-proxy
sleep 2
if systemctl is-active --quiet locket-proxy; then
  ok "service đang chạy"
else
  warn "service không chạy — xem: journalctl -u locket-proxy -n 50"
  journalctl -u locket-proxy -n 20 --no-pager | sed 's/^/    /' || true
fi

# ============================================================================
# FIREWALL — chỉ THÊM, không bao giờ xoá rule 22 có sẵn
# ============================================================================
say "Firewall (UFW)"
if ! ufw status 2>/dev/null | grep -q "Status: active"; then
  warn "UFW chưa bật. Script KHÔNG tự bật để tránh khoá SSH ngoài ý muốn."
  warn "Muốn bật:  ufw allow 22/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw enable"
else
  # 22 phải có TRƯỚC khi thêm gì
  if ! ufw status 2>/dev/null | grep -qE "^22/tcp\s+ALLOW"; then
    warn "Chưa có rule 22/tcp — thêm trước để không tự khoá mình"
    ufw allow 22/tcp >/dev/null
  fi
  ufw allow 443/tcp >/dev/null && ok "443/tcp ALLOW"
  ufw allow 443/udp >/dev/null && ok "443/udp ALLOW (để REJECT, xem dưới)"
fi

# ============================================================================
# QUIC — REJECT chứ không DROP
# ============================================================================
# Lý do: DROP làm client chờ hết timeout 1–3 giây cho mỗi kết nối trước khi
# rơi về TCP. REJECT kèm ICMP port-unreachable làm iOS rơi về TCP trong vài ms.
say "Chặn QUIC/HTTP3 bằng REJECT (không phải DROP)"
if iptables -C INPUT -p udp --dport 443 -j REJECT --reject-with icmp-port-unreachable 2>/dev/null; then
  ok "rule đã có"
else
  iptables -I INPUT -p udp --dport 443 -j REJECT --reject-with icmp-port-unreachable
  ok "đã thêm rule"
fi

# Lưu rule để sống qua reboot. netfilter-persistent nếu có, không thì iptables-save.
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save >/dev/null 2>&1 || true
  ok "đã lưu bằng netfilter-persistent"
elif command -v iptables-save >/dev/null 2>&1; then
  mkdir -p /etc/iptables
  iptables-save > /etc/iptables/rules.v4
  ok "đã lưu vào /etc/iptables/rules.v4"
  warn "Đảm bảo gói iptables-persistent đã cài, nếu không rule sẽ mất sau reboot:"
  warn "  apt install -y iptables-persistent"
else
  warn "không lưu được rule — sau reboot phải chạy lại script"
fi

# ============================================================================
# TỔNG KẾT
# ============================================================================
CA_B64="$(openssl x509 -in "$CA_DIR/root-ca.crt" -outform DER | base64 -w0)"
FP="$(openssl x509 -in "$CA_DIR/root-ca.crt" -noout -fingerprint -sha256 | cut -d= -f2)"

cat <<SUM

$(printf "${G}════════════════════════════════════════════════════════════════${N}")
$(printf "${G}  XONG${N}")
$(printf "${G}════════════════════════════════════════════════════════════════${N}")

  IPv4 của VPS       : ${PUBIP}
  Domain DoH         : ${DOMAIN}
  Cổng proxy         : 443 (TCP)
  CA fingerprint     : ${FP}

  CA cert (base64 DER, dán vào profile):
$(echo "$CA_B64" | fold -w 76 | sed 's/^/    /')

$(printf "${Y}  VIỆC TIẾP THEO — KHÔNG BỎ BƯỚC NÀO${N}")

  1. DNS tại tên miền của bạn (nơi bạn quản lý ${DOMAIN%%.*}):
       A     ${DOMAIN}                              → ${PUBIP}
       AAAA  ${DOMAIN}                              → (để trống hoặc ::)
     Và các bản ghi hijack (A, cùng IP):
       firebaseremoteconfig.googleapis.com
       firebaseremoteconfigrealtime.googleapis.com
       us-central1-locket-4252a.cloudfunctions.net
     Ghi AAAA về :: cho từng cái — thiếu bước này thì iPhone ưu tiên IPv6
     và kết nối đi thẳng tới CDN thật, bỏ qua MITM hoàn toàn.

  2. Cert cho DoH (Let's Encrypt), sau khi DNS đã trỏ đúng:
       apt install -y certbot
       certbot certonly --standalone -d ${DOMAIN}
     Cần thêm listener TLS 443 demux theo SNI — xem deploy/README.md mục
     "DoH + MITM cùng cổng 443". Proxy hiện tại CHƯA làm việc này.

  3. Cài profile .mobileconfig vào iPhone, rồi
     Cài đặt > Giới thiệu > Tin cậy chứng chỉ > bật CA.

  4. Kiểm tra:
       sudo bash $0 --status
       từ ngoài:  curl -kI https://${DOMAIN}/healthz

$(printf "${B}  GHI NHỚ${N})
     Tắt máy chủ này = mất DNS của máy đã cài profile. Giữ một resolver
     dự phòng trong cấu hình mạng, hoặc biết cách gỡ profile.

SUM

warn "Đừng đăng CA private key ở đâu. Nó ở ${CA_DIR}/root-ca.key (0600)."
warn "Ai có key đó ký được cert cho mọi domain mà máy bạn đã tin."
