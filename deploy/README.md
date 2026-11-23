# `deploy/` — dựng proxy trên VPS thật

Dùng khi bạn **đã thuê VPS** (LunaCloud, RackNerd, Oracle, GCP e2-micro…).
Không cần thiết cho đường module Shadowrocket — đường đó không có máy chủ.

Điều kiện duy nhất: **IPv4 công khai + cổng 443 thô (TCP)**. Không NAT, không
qua CDN.

## Một lệnh

```bash
ssh root@<ip-vps>
curl -fsSL https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/deploy/install.sh -o install.sh
sudo bash install.sh
```

Script làm: cài Go → tải `proxy/` → build tĩnh → sinh Root CA → user hệ thống
→ systemd (bind 443, `CAP_NET_BIND_SERVICE`) → UFW thêm 443 → `REJECT` UDP 443
để chặn QUIC.

```
--status        xem trạng thái, không đổi gì
--regen-ca      sinh lại CA (mọi máy phải cài lại profile)
--firewall-off  cứu khi tự khoá SSH
```

## Ba chỗ dễ làm hỏng, script đã tính

### 1. `DROP` UDP 443 là sai — phải `REJECT`

`DROP` làm client chờ hết timeout 1–3 giây cho **mỗi** kết nối trước khi rơi về
TCP. `REJECT --reject-with icmp-port-unreachable` làm iOS rơi về TCP trong vài
ms. Script dùng `REJECT`, và lưu rule qua reboot.

### 2. Thiếu bản ghi AAAA là mất toàn bộ MITM

iOS ưu tiên IPv6 (Happy Eyeballs, RFC 8305). Nếu chỉ ghi A mà để AAAA trỏ về
CDN thật thì kết nối **đi thẳng**, không qua proxy, và mọi thứ trông như "script
không chạy". Ghi `AAAA → ::` cho từng hostname bị hijack.

### 3. UFW bật sau khi thêm 443 mà chưa có 22 = tự khoá mình

Script kiểm rule 22 **trước** khi thêm bất cứ gì, và **không tự `ufw enable`**.
Nếu bạn tự bật và bị khoá: vào console của LunaCloud, chạy
`sudo bash install.sh --firewall-off`.

## Còn thiếu một mảnh: DoH và MITM cùng cổng 443

`proxy/main.go` hiện **luôn** đóng vai MITM: `GetConfigForClient` ký cert cho
mọi SNI bằng CA của mình. Không có nhánh nào phục vụ DoH.

Nhưng profile cần `ServerURL = https://<domain>/dns-query`, và iPhone sẽ kiểm
cert của hostname đó theo trust store. Hai lựa chọn:

| Cách | Việc phải làm | Rủi ro |
|---|---|---|
| **A. DoH ở domain khác** (khuyến nghị) | một VPS/worker riêng, hoặc DoH của NextDNS | thêm một điểm chết |
| **B. Cùng VPS, demux theo SNI** | `GetConfigForClient`: SNI = domain của mình → cert Let's Encrypt + xử lý `/dns-query`; SNI khác → ký bằng CA | phải sửa `proxy/main.go` |

Cách B cần sửa code. Cách A không cần — và với hướng "chỉ cài profile", dùng
DoH của NextDNS (đã có sẵn Rewrites) là **ít việc nhất**:

```
NextDNS → Rewrites: A + AAAA cho 3 host về IP của VPS
        → profile DoH của NextDNS
```

Khi chọn A, `DOMAIN` trong `install.sh` chỉ dùng để kiểm tra, không cần cert.

## Hostname cần ghi DNS

Chỉ Remote Config. **Không** `api.revenuecat.com` — xem
[`../locket/dns/README.md`](../locket/dns/README.md).

```
firebaseremoteconfig.googleapis.com
firebaseremoteconfigrealtime.googleapis.com
us-central1-locket-4252a.cloudfunctions.net
firebaselogging.googleapis.com            (chặn dấu vết)
firebaselogging-pa.googleapis.com
```

## Kiểm tra sau khi dựng

```bash
sudo bash install.sh --status

# từ máy khác — phải thấy cert do CA của bạn ký:
openssl s_client -connect <ip>:443 -servername firebaseremoteconfig.googleapis.com \
  </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject

# healthz (nếu proxy có route này)
curl -k https://<ip>/healthz
```

Nếu `issuer` **không** phải CA của bạn → request chưa tới proxy: DNS sai, hoặc
thiếu AAAA, hoặc cổng 443 đang bị nginx của nhà cung cấp chiếm.

## Bảo mật — đọc một lần

- `root-ca.key` ở `/etc/locket-proxy/ca/` (0600, group `locket`). Ai có nó **ký
  được cert cho mọi domain** mà máy bạn đã tin.
- Đừng commit key, đừng gửi qua chat, đừng để trong ảnh chụp màn hình.
- Nếu nghi lộ: `sudo bash install.sh --regen-ca`, rồi **mọi thiết bị phải cài
  lại profile**. Không có cách thu hồi từ xa.
- ToS: nhiều nhà cung cấp cấm "TLS-terminating proxy cho traffic không phát
  sinh từ ứng dụng bạn chạy". MITM cho thiết bị của chính bạn là vùng xám ở hầu
  hết. Đọc ToS trước khi thuê.
