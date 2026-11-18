# `locket/` — Locket: hai hướng, ba module

Mục tiêu: mở tính năng của Locket **ở tầng HTTP**, không jailbreak, không IPA
đã sửa. Hướng "chỉ cài profile" cần IPv4 riêng — xem `dns/README.md`.

## Chọn module

| Module | Đụng RevenueCat | Rủi ro | Khi nào dùng |
|---|---|---|---|
| `module/locket-remoteconfig.module` | **không** | thấp — không giả entitlement, không có chữ ký nào bị kiểm | thử trước, và khi chỉ cần cờ |
| `module/locket-full.module` | **có** | cao hơn — thêm entitlement vào response tài khoản thật | khi bản remote config không đủ, và đã chạy `report` |

Thứ tự đúng: **remote-config trước**. Nếu nó đủ thì không cần bản full.

## RevenueCat: được ở module, không được ở DNS

RevenueCat ký số response (Trusted Entitlements, iOS SDK 4.25+). Mã nguồn công
khai cho thấy đường kiểm tra là *fail-closed*:

```
missingSignature  /  missingSignedPayload  /  payloadSignatureMismatch  /
invalidIntermediateKey      ->  verification = .failed
```

Sửa body thì chắc chắn `failed`. Nhưng `.failed` chỉ là **thông tin** — theo
docs chính thức, "verification results are informational only — your app must
check the verification result and decide how to handle it". SDK không tự chặn;
việc từ chối là do code của app.

Vì vậy ở tầng module có ba khả năng, và chế độ `report` phân biệt chúng:

| `sig=` ở bước report | Nghĩa | Kết quả patch |
|---|---|---|
| `n` | endpoint **không** có header chữ ký | sửa sạch, `verification = notRequested` |
| tên header | có ký, app có thể không kiểm tra | có thể chạy, có thể `failed` |
| tên header + app có kiểm tra | — | Gold không hiện |

Qua DNS thì khác hẳn, và đó là lý do `dns/README.md` **bỏ hẳn**
`api.revenuecat.com`:

| | Module (trên máy) | DNS (server của mình) |
|---|---|---|
| Ai sửa | Shadowrocket | server của mình |
| `ETag` gốc | giữ được — engine chỉ trả `body` | không kiểm soát được |
| `304 Not Modified` | hook request xoá `If-None-Match` → buộc 200 | không điều khiển được |
| `payloadSignatureMismatch` | có thể tránh | **gần như chắc chắn** |

Cùng một cơ chế khiến "RevenueCat ở module là được" khiến "RevenueCat qua DNS
là không".

## Cấu trúc

```
locket/
├── engine/
│   ├── locket_remoteconfig.js   # http-response: sửa entries{} (dùng cho cả module và server)
│   ├── locket_selftest.js       # http-request: đọc chẩn đoán remote config
│   ├── locket_revenuecat.js     # http-response: thêm entitlement (module full)
│   ├── locket_rc_request.js     # http-request: xoá If-None-Match để tránh 304
│   └── locket_rc_selftest.js    # http-request: đọc tên entitlement + tình trạng chữ ký
├── module/
│   ├── locket-remoteconfig.module   # chỉ Remote Config
│   └── locket-full.module           # Remote Config + RevenueCat entitlement
├── dns/
│   └── README.md                # hướng profile + server, KHÔNG có RevenueCat
└── README.md
```

Test: **58 test** — `locket_remoteconfig.test.js` (30) + `locket_revenuecat.test.js` (28).

## Dùng

### 1. Cài module

Bản an toàn (chỉ Remote Config) — **bắt đầu ở đây**:

```
https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/products/locket/module/locket-remoteconfig.module
```

Bản đầy đủ (thêm RevenueCat entitlement) — chỉ sau khi đã chạy `report`:

```
https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/products/locket/module/locket-full.module
```

Bật HTTPS Decrypt + trust CA (Config > ⓘ > HTTPS Decrypt > Generate new CA >
Install Certificate, rồi Cài đặt > Giới thiệu > Tin cậy chứng chỉ).
Module chỉ chạy khi **全局路由 = 配置**.

### 2. Chạy `capture` TRƯỚC — không được bỏ qua

Đổi `argument=flags` thành `argument=capture` trong module (2 dòng hook).

Kill hẳn Locket rồi mở lại. Mở Safari:

```
https://firebaseremoteconfig.googleapis.com/xwuan-selftest
```

Vào `数据 > 代理`, tìm dòng có `?xwuan-report=...`. Đọc `eg=` — đó là **tên
key thật và giá trị thật** của app.

Lý do bắt buộc: tên key do Locket đặt, không ai đoán được. `capture` không sửa
gì cả, nó chỉ cho bạn thấy cái gì đang ở đó. Đoán tên key là cách chắc chắn
nhất để module "không làm gì mà cũng không báo lỗi".

### 3. Bật `flags`

Đổi argument về `flags` (hoặc `flags&probe=true` để có dòng chẩn đoán). Kill
Locket, mở lại.

Engine lật cờ **chỉ khi** thoả cả ba điều kiện:

- tên key có token giống cờ (`gold`, `premium`, `pro`, `vip`, `subscri`,
  `entitle`, `paywall`, `unlock`, …)
- tên key **không** có token loại trừ (`url`, `price`, `product`, `id`,
  `endpoint`, …)
- giá trị hiện tại đúng là `false` / `0` / `no` / `off` / `disabled`

Không thoả thì để nguyên. **Thà bỏ sót còn hơn ghi đè cấu hình thật của app.**

### 4. Bản full: chạy `report` trước, rồi mới `patch`

Hook `locket-rc-response` **mặc định là `argument=report`** — nó không sửa gì.
Đây là chủ ý: bạn phải biết endpoint có được ký hay không trước khi quyết định.

```
① argument=report&probe=true
   → 数据 > 代理, tìm ?xwuan=rcpay&st=report&n=0&sig=?&etag=?
   → sig=n       endpoint KHÔNG có header chữ ký  → patch sẽ sạch
   → sig=<tên>   CÓ ký → patch có thể failed, cân nhắc
   → mở Safari: https://api.revenuecat.com/v1/xwuan-selftest
     đọc ent= (tên entitlement) và sub= (product id)

② argument=patch&ek=<ent>&pid=<sub>&probe=true
   → st=ok            đã chèn
   → st=already_present   đã có sẵn
   → st=need_ek_pid   thiếu tham số
   → st=not_modified  hook request chưa chạy — module vô dụng ở trạng thái này

③ Mở Locket, đọc kết quả. Chỉ có ba khả năng:
   Gold hiện + chạy được        → xong
   Gold hiện + không chạy       → backend Locket tự kiểm tra quyền
   Không có gì đổi              → app kiểm tra chữ ký
```

Không đoán tên entitlement. `ek=` và `pid=` phải lấy từ bước ①. Đoán là cách
chắc chắn nhất để module "chạy mà không làm gì".

## Đọc kết quả khi không xem được log

Shadowrocket không có trình xem log script. Hai kênh:

**Kênh 1 — một dòng trong `数据 > 代理`** (với `argument=...&probe=true`):

```
firebaselogging.googleapis.com/v1/xwuan-probe?xwuan=rc&st=ok&n=42&fl=3&b64=2
```

| Trường | Nghĩa |
|---|---|
| `st=ok` | engine chạy và thấy `entries` |
| `st=no_entries` | response không có `entries` (khác namespace? khác host?) |
| `st=no_template` | `state: NO_TEMPLATE` — app chưa cấu hình Remote Config |
| `st=gzip_body` | body nén, engine passthrough (xem "Giới hạn") |
| `st=parse_fail` | body không phải JSON |
| `st=empty_body` | không có body — kiểm tra `requires-body` |
| `n=` | số key trong Remote Config |
| `fl=` | số cờ đã lật |
| `b64=` | số giá trị base64 (nội dung nằm trong store) |

Probe **không** gửi tên key, giá trị, hay URL gốc. Chỉ số đếm.

**Kênh 2 — báo cáo gộp** qua `/xwuan-selftest` (mục 2 ở trên), có `keys=` và
`eg=`.

## Giới hạn đã biết

| Tình huống | Hành vi | Vì sao |
|---|---|---|
| Body gzip | passthrough nguyên byte, `st=gzip_body` | runtime Shadowrocket không có `DecompressionStream` |
| Response base64 chứa JSON lồng | **không** sửa bên trong | sẽ cần parser thật; hiện chỉ giải mã để đọc |
| Locket dùng A/B test | key khác nhau giữa các máy | `capture` là cách xử lý, không hard-code |
| Backend kiểm tra lại quyền | chỉ đổi giao diện | giới hạn của tầng HTTP |
| Realtime namespace | dùng cùng engine | cùng dạng `entries{}` |

## Về các module Locket Gold đang lưu hành

(`vanhytt/locket_pro`, `nghieee/modules-shadowrocket`) đều sửa
`api.revenuecat.com` + `api.locketcamera.com`. Cấu trúc của họ đúng — 3 bước
[xoá cache header] → [patch response] — và `locket-full.module` học đúng cấu
trúc đó.

Ba chỗ trong code của họ nên tránh:

- `$done({})` ở nhánh fallback — **body rỗng, không phải passthrough**. Mọi
  response không khớp pattern đều bị làm hỏng.
- Giả định body là JSON thuần, không xử lý gzip; `JSON.parse` lỗi thì rơi vào
  nhánh `$done({})` ở trên.
- `api.locketcamera.com` bị sửa — đó là API ảnh, lõi sản phẩm. `UpLocket`
  không đụng vào nó. Sửa ở đó dễ làm hỏng app mà không liên quan gì tới Gold.

Có một điều hữu ích: nếu một module như vậy chạy được trên máy bạn, nghĩa là
**app đó không kiểm tra `verification`** — bằng chứng thực nghiệm, đáng tin hơn
mọi suy luận từ docs.

## Hướng đã loại

| Hướng | Vì sao loại |
|---|---|
| Server MITM giữ cổng 443 | cần IPv4 riêng có 443 thô; Vercel/Netlify/Cloudflare/Render gia hạn (terminate) TLS ở edge, không phục vụ được cert cho hostname của người khác |
| `api.revenuecat.com` | chữ ký Trusted Entitlements, xem đầu file |
| Sửa qua NextDNS Rewrites | DNS chỉ trả IP; tầng sửa body vẫn phải có máy chủ giữ 443 |

Nếu sau này có VPS: engine này dùng lại được, chỉ cần port `applyFlags` sang Go
và thay phần runtime `$request/$response`.
