# AGENTS.md — hướng dẫn cho AI agent

> File này dành cho **agent** (Claude Code, Cursor, Codex, Arena…) làm việc trên
> repo này. Đọc hết trước khi sửa bất cứ thứ gì. Cập nhật: **2026-11-19**.
>
> Người đọc không phải agent: bắt đầu từ [`README.md`](README.md) và
> [`HANDOFF.md`](HANDOFF.md) (trạng thái + quyết định đã chốt).

---

## 1. Repo này làm gì, trong 30 giây

Mở khoá tính năng của app iOS bằng **can thiệp tầng mạng**. Không jailbreak,
không sửa IPA, không sideload.

Hai hướng **độc lập**, đừng trộn:

| | Hướng A — module | Hướng B — server |
|---|---|---|
| Chạy ở đâu | trong app proxy **trên máy user** | **VPS** của mình |
| User cần gì | cài Shadowrocket + cert MITM | cài **1 profile `.mobileconfig`** |
| Code | `products/*/module/`, `products/*/engine/` | `proxy/` (Go), `deploy/` |
| DNS | không cần | **bắt buộc** (A + **AAAA**) |
| Trạng thái | ✅ chạy được (Spotify xác nhận trên máy thật) | 🚧 code xong, chưa dựng |

App đang hỗ trợ: **Locket** (chính), **Spotify**, **YouTube**.

---

## 2. Đọc gì trước

Theo thứ tự, đừng nhảy:

1. `HANDOFF.md` — trạng thái, quyết định đã chốt, cạm bẫy. **Đây là nguồn sự thật.**
2. Thư mục bạn định sửa — mỗi thư mục có `README.md` riêng.
3. File test của phần đó trong `tests/` — test nói rõ hành vi kỳ vọng hơn README.

Trạng thái hướng DNS/server: xem `deploy/README.md`. Nếu tài liệu nào nói hướng
này "đang chờ" hay "chưa có code", tài liệu đó cũ — `deploy/install.sh` đã có.

---

## 3. Chạy test

```bash
for f in $(find tests -name '*.test.js' | sort); do node --test "$f"; done
```

**Kỳ vọng: 164 pass, 0 fail.** Nếu số khác, bạn (hoặc phiên trước) đã làm hỏng
gì đó — sửa trước khi làm việc mới.

```bash
node --test tests/products/locket_remoteconfig.test.js   # 35
node --test tests/products/locket_revenuecat.test.js     # 29
node --test tests/products/youtube_*.test.js             # 50
node --test tests/deploy/install_script.test.js          # 9
```

`go test` / `go vet` **chưa chạy được** trong sandbox không có Go. Đừng nói
"Go build OK" nếu bạn chưa thật sự chạy. Trên VPS thì `deploy/install.sh` build
thật — đó là lần kiểm chứng đầu tiên.

---

## 4. Chạy trên máy (hướng A) — việc agent hay phải hướng dẫn user

Agent **không** cài được gì lên iPhone của user. Việc của agent là đưa đúng
**một URL** và đúng **ba bước**.

### Locket

```
https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/products/locket/module/locket.module
```

1. Shadowrocket → **Config → ⓘ → HTTPS Decrypt → Generate new CA → Install
   Certificate** → iOS **Cài đặt > Giới thiệu > Tin cậy chứng chỉ** → bật.
2. Dán URL trên vào **Config → Module → +**.
3. Bật VPN, **全局路由 = 配置** (global routing = Config). Không phải "Proxy".

Sau khi cài, module **chỉ sửa Remote Config**. Phần RevenueCat mặc định
`argument=report` — nó **không sửa gì**. Đây là chủ ý, xem §6.

### Đọc kết quả (không xem được log)

Shadowrocket **không có** trình xem log script. `console.log` không hiện ở đâu.
`$notification.post` **không tồn tại** trong runtime của nó.

Đừng bao giờ hướng dẫn user "xem log" hay "bật debug=true".

Hai kênh thật:

```bash
# 1. Mở Safari trên máy đã bật proxy:
https://firebaseremoteconfig.googleapis.com/xwuan-selftest
# Rồi vào 数据 > 代理, tìm dòng ?xwuan-report=v1;rc...;pay...;req...

# 2. Thêm &probe=true vào argument, rồi xem 数据 > 代理:
#    firebaselogging.googleapis.com/v1/xwuan-probe?xwuan=rc&st=ok&n=42&fl=3
```

---

## 5. Chạy trên VPS (hướng B)

### Trước khi làm gì: kiểm tra 3 thứ

1. **IPv4 công khai + cổng 443 TCP thô.** Không NAT, không qua CDN.
   Vercel/Netlify/Cloudflare/Render/VibeHosting **không dùng được** — edge của
   họ kết thúc TLS và chọn cert từ kho của họ.
2. **Có quyền ghi DNS** của domain dùng cho DoH.
3. **Chưa có gì nghe cổng 443** (`ss -lntp | grep :443`). Ubuntu trên một số
   nhà cung cấp có nginx sẵn.

### Cài

```bash
ssh root@<ip>
curl -fsSL https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/deploy/install.sh -o install.sh
sudo bash install.sh
sudo bash install.sh --status
```

### Ba lỗi sẽ gặp nếu bỏ qua — agent phải nhắc trước

| Lỗi | Hậu quả | Cách đúng |
|---|---|---|
| Ghi A mà **không** ghi AAAA | iOS ưu tiên IPv6 → kết nối **đi thẳng tới CDN**, MITM bị bỏ qua hoàn toàn. Triệu chứng: "module không chạy" | Ghi `AAAA → ::` cho **từng** hostname hijack |
| Chặn QUIC bằng `DROP` | Mỗi kết nối treo 1–3 s trước khi rơi về TCP → app chậm, user tưởng hỏng | `iptables -I INPUT -p udp --dport 443 -j REJECT --reject-with icmp-port-unreachable` |
| Bật UFW sau khi thêm 443 mà chưa có rule 22 | **Tự khoá SSH ra khỏi máy** | Rule 22 trước; script không tự `ufw enable`. Bị khoá → console nhà cung cấp → `--firewall-off` |

### Mảnh còn thiếu — nói thẳng, đừng giả vờ đã xong

`proxy/main.go` **luôn** là MITM: `GetConfigForClient` ký cert cho **mọi** SNI
bằng CA của mình. **Không có nhánh DoH.**

Hai lựa chọn, và agent phải hỏi user chọn cái nào:

- **A (khuyến nghị, không sửa code):** DoH dùng **NextDNS** (đã có Rewrites),
  VPS chỉ làm proxy 443. Không cần Let's Encrypt, không cần `DOMAIN`.
- **B (phải sửa code):** demux theo SNI trong `GetConfigForClient` — SNI là
  domain của mình → cert Let's Encrypt + xử lý `/dns-query`; SNI khác → ký
  bằng CA.

### Hostname cần ghi DNS (chỉ Remote Config)

```
firebaseremoteconfig.googleapis.com
firebaseremoteconfigrealtime.googleapis.com
us-central1-locket-4252a.cloudfunctions.net
firebaselogging.googleapis.com          ← chặn dấu vết
firebaselogging-pa.googleapis.com
```

**Không** `api.revenuecat.com` — lý do ở §6. Chi tiết:
[`products/locket/dns/README.md`](products/locket/dns/README.md).

### Kiểm tra thật sự đã thông

```bash
# Từ máy khác. issuer PHẢI là CA của bạn, không phải của Google.
openssl s_client -connect <ip>:443 -servername firebaseremoteconfig.googleapis.com \
  </dev/null 2>/dev/null | openssl x509 -noout -issuer -subject
```

Sai issuer = request chưa tới proxy: DNS sai, hoặc thiếu AAAA, hoặc 443 bị
nginx chiếm. Kiểm tra theo thứ tự đó.

---

## 6. Kiến thức không được đảo ngược

Mỗi mục dưới đây đã được kiểm chứng và có lý do. Đừng "cải tiến" mà không đọc
lý do trước.

### `$done({})` là **body RỖNG**, không phải passthrough

Nhánh không sửa gì **phải trả nguyên body gốc** (`$done({body: <body gốc>})`); với
binary thì trả `{bodyBytes}`. Trả `{}` làm hỏng response của app. Đây là lỗi
đã mắc **ba lần** trong repo này.

### Shadowrocket thiếu `TextDecoder` / `TextEncoder`

Engine phải tự viết UTF-8. Đây là lỗi đã làm chết script của module Spotify
phổ biến (`ReferenceError: TextEncoder is not defined`).

### Chỉ Shadowrocket. Không port sang Surge/Loon/QX/Stash/Egern

Quyết định của user (2026-11-19). Ba khác biệt không thể cầu:

1. `[Script] + type=http-response + argument=` là cú pháp Shadowrocket.
2. `binary-body-mode=1` + `$response.bodyBytes` → `{bodyBytes}`.
3. `$persistentStore.write(value, key)` — thứ tự tham số khác nhau giữa client.

Đừng thêm `$environment` detection rồi gọi đó là "hỗ trợ đa client".

### RevenueCat có chữ ký — `module` được, `DNS` không

RevenueCat ký số response (Trusted Entitlements, iOS SDK 4.25+). Đường kiểm tra
**fail-closed**:

```
missingSignature / missingSignedPayload / payloadSignatureMismatch /
invalidIntermediateKey      →  verification = .failed
```

`.failed` chỉ là **thông tin** — docs chính thức: *"informational only — your
app must check the verification result"*. SDK không chặn; **app** chặn.

| | Module (trên máy) | DNS (server của mình) |
|---|---|---|
| ETag/header gốc | giữ được nếu script **chỉ trả body** | không kiểm soát được |
| 304 Not Modified | hook request xoá `If-None-Match` → buộc 200 | không điều khiển được |
| `payloadSignatureMismatch` | có thể tránh | **gần như chắc chắn** |

⇒ Engine RevenueCat **chỉ trả `body`, không bao giờ trả `headers`**. Có test
khẳng định điều này (`doneCall.headers === undefined`). Đừng "sửa" thành
`{body, headers}`.

⇒ Ở hướng DNS, **bỏ hẳn** `api.revenuecat.com`. Chỉ Remote Config (JSON phẳng,
**không chữ ký**).

### Không đoán tên entitlement, không đoán tên key

`ek=` (entitlement) và `pid=` (product id) phải lấy từ chế độ `report` thật.
Tên key Remote Config phải lấy từ `capture`. Đoán là cách chắc chắn nhất để
module "chạy mà không làm gì".

### So khớp tên key theo **token**, không theo substring

`pro` không được khớp `project`, `product`, `process`. Có test riêng. Sửa
`isFlagKey()` mà làm hỏng test này là sửa cấu hình thật của app.

### DNS Rewrites trả **IP**, không trả cổng

Không có bản ghi nào (A/AAAA/CNAME) mang số port cho kết nối TCP thường. Nên
`IP:443` là bắt buộc, và `IP:8080`/`IP:5xxxx` vô dụng. Đây là lý do Vercel và
Vibe Hosting bị loại — không phải vì họ thiếu tính năng.

### CA riêng là **của mình**, không ai "lo" hộ

Cert là công khai; cái bí mật là **private key để ký cert con**. Không dịch vụ
DNS nào cấp được điều đó cho hostname của người khác. Một `.mobileconfig` chứa
được **cả** payload `com.apple.security.root` **và** `com.apple.dnsSettings.managed`
— xem `UpLocket_xwuan1.mobileconfig` ở root (file tham khảo, **không phải của mình**).

---

## 7. Đường dẫn & URL phải giữ đúng

Script được nạp qua **raw URL tuyệt đối** trên GitHub. Đổi đường dẫn = chết
module của mọi user.

```
modules/Locket_VIP.module                       ← bản "all-in-one" cũ, vẫn là thứ README quảng cáo
products/locket/module/locket.module            ← bản mới (RevenueCat report + Remote Config)
products/youtube/module/youtube-adblock.module
products/spotify/on-device/module/spotify-premium-ucs.module
assets/...                                      ← được trỏ qua raw/jsdelivr
```

**`?v=YYYYMMDD_N` trong `script-path` là cache-buster.** Sửa bất kỳ file script
nào **phải** tăng số này, nếu không user nhận bản cũ từ cache Shadowrocket.

⚠️ **Hai bản Locket đang cùng tồn tại** và chưa được hợp nhất — xem §9.

---

## 8. Quy tắc làm việc

- **Tiếng Việt** với user.
- Trả lời bằng **giới hạn kỹ thuật cụ thể** (loại record nào tồn tại, ai kết
  thúc TLS, field protobuf số mấy), không chỉ nói "không được".
- **Không bịa kết quả test.** Nếu chưa chạy, nói chưa chạy.
- Mọi thay đổi cần **test đi kèm** trong `tests/`. Test hiện có mà fail vì
  thay đổi của bạn thì sửa test cho khớp hành vi **mới đúng**, nhưng phải nói
  rõ bạn đã đổi kỳ vọng gì và vì sao.
- Giữ workspace gọn: không file mồ côi, không README mâu thuẫn.
- Cập nhật `HANDOFF.md` khi đổi quyết định, và `AGENTS.md` khi phát hiện cạm bẫy mới.

### Việc KHÔNG được làm

- Không commit `*.key`, `ca/root-ca.key`, `.thevibehosting_key`.
- Không copy code từ `blockads-android` (GPL-3.0) — chỉ đọc hằng số.
- Không dùng `reject-dict` trong `[URL Rewrite]`; dùng `reject-200`.
- Không thêm `$notification.post` (không tồn tại trong Shadowrocket).
- Không tự bật `ufw enable` trong script cài.
- Không dùng `DROP` cho UDP 443.

---

## 9. Việc đang dở — kiểm tra trước khi bắt đầu

| # | Việc | Ghi chú |
|---|---|---|
| 1 | **Hai bản Locket chưa hợp nhất** | `modules/Locket_VIP.module` + `scripts/locket_*.js` (bản cũ, đầy đủ, 6591 dòng payload) và `products/locket/module/locket.module` (bản mới, có `report`, chưa có payload). README vẫn quảng cáo bản cũ. **Hỏi user muốn giữ cái nào trước khi sửa** |
| 2 | `nextdns/index.js` `DOMAINS_TO_REWRITE` có `api.revenuecat.com` + `api.locketcamera.com` | mâu thuẫn với §6 (hướng DNS bỏ RevenueCat). Chưa sửa vì có thể còn code khác phụ thuộc |
| 4 | Số test trong tài liệu dễ lạc hậu | `tests/docs_links.test.js` tự bắt; sửa số thì chạy lại suite để nó đối chiếu |
| 5 | **Chưa test on-device**: YouTube (`argument=ads&probe=true`), Locket (`rc.keys=`), Spotify | Đây là dữ liệu duy nhất còn thiếu. Mọi thứ khác là test Node |
| 6 | DoH + MITM cùng 443 | chưa có code — xem §5 "mảnh còn thiếu" |
| 7 | `tests/proxy/proxy_test.go` chưa chạy lần nào | Sandbox không có Go. Trên VPS: `cd /tmp/locket-src && go test ./tests/proxy/...` — cần `ca/root-ca.key`, mà file đó **không** nằm trong repo, phải copy từ `/etc/locket-proxy/ca/` |

Trước khi làm bất cứ việc gì lớn: **chạy test, đọc mục 9, hỏi user đang muốn
hướng A hay B.** Trộn hai hướng là nguồn lỗi lớn nhất trong repo này.
