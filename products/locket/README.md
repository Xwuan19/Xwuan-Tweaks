# `locket/` — Locket, hướng can thiệp Firebase Remote Config

Mục tiêu: mở các cờ tính năng của Locket **ở tầng HTTP**, không cần jailbreak,
không cần IPA đã sửa, không cần máy chủ.

## Quyết định thiết kế: chỉ Remote Config, không đụng RevenueCat

Đây là điểm khác biệt so với mọi module Locket Gold đang lưu hành, và nó là
quyết định kỹ thuật chứ không phải sở thích.

| | RevenueCat (`api.revenuecat.com`) | Firebase Remote Config |
|---|---|---|
| Nội dung | `subscriber.entitlements` — quyền mua | `entries{}` — cờ bật/tắt tính năng |
| Có chữ ký số | **có** — `Trusted Entitlements`, iOS SDK 4.25+ | không |
| SDK tự kiểm tra | có, bật mặc định từ 5.15 (`verification` = `.failed`) | không |
| Sửa được ở tầng HTTP | **đánh cược** — không có private key của RevenueCat | được |
| Sửa bị phát hiện | có cờ hiệu rõ ràng cho app | không có cờ nào |

RevenueCat **không bao giờ** bị đụng ở đây. Bỏ hẳn nó đi, vì:

1. Nếu app kiểm tra `verification`, module sẽ im lặng không có tác dụng — và
   người dùng không có cách nào biết vì sao.
2. Trả response giả mà SDK đánh dấu `failed` còn tệ hơn không làm gì: nó cho
   app một tín hiệu "đang bị can thiệp".
3. Remote Config không có chữ ký. Cùng công sức, xác suất thành công cao hơn
   nhiều, và không để lại dấu vết đáng ngờ.

Hệ quả cần nói rõ: **module này mở cờ, không mở quyền.** Nếu Locket backend tự
kiểm tra tài khoản mỗi lần gọi API thì cờ chỉ đổi được giao diện. Không có
cách nào vượt qua điều đó ở tầng HTTP — của bất kỳ ai.

## Cấu trúc

```
locket/
├── engine/
│   ├── locket_remoteconfig.js   # http-response: đọc/sửa entries{}
│   └── locket_selftest.js       # http-request: đọc kết quả chẩn đoán
├── module/
│   └── locket-remoteconfig.module
└── README.md
```

Test: `node --test tests/products/locket_remoteconfig.test.js` — 29 test.

## Dùng

### 1. Cài module

```
https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/products/locket/module/locket-remoteconfig.module
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

## Vì sao không dùng module Locket Gold đang lưu hành

Các module phổ biến (`vanhytt/locket_pro`, `nghieee/modules-shadowrocket`) đều
sửa `api.revenuecat.com`. Với RevenueCat 4.25+ thì đó là đánh cược, và hai lỗi
cụ thể có trong code của họ:

- `$done({})` ở nhánh fallback — **body rỗng, không phải passthrough**. Mọi
  response không khớp pattern đều bị làm hỏng.
- Giả định body là JSON thuần, không xử lý gzip/protobuf, và `JSON.parse` lỗi
  thì rơi vào nhánh `$done({})` ở trên.
- `expires_date: 2099` là mốc dễ bị kiểm tra hợp lý bắt được.

So sánh có ích: nếu một module đang lưu hành chạy được trên máy bạn, nghĩa là
app đó **không** kiểm tra `verification`. Nếu nó im lặng, chưa kết luận được
gì — có thể chỉ là lỗi `$done({})`.

## Hướng đã loại

| Hướng | Vì sao loại |
|---|---|
| Server MITM giữ cổng 443 | cần IPv4 riêng có 443 thô; Vercel/Netlify/Cloudflare/Render gia hạn (terminate) TLS ở edge, không phục vụ được cert cho hostname của người khác |
| `api.revenuecat.com` | chữ ký Trusted Entitlements, xem đầu file |
| Sửa qua NextDNS Rewrites | DNS chỉ trả IP; tầng sửa body vẫn phải có máy chủ giữ 443 |

Nếu sau này có VPS: engine này dùng lại được, chỉ cần port `applyFlags` sang Go
và thay phần runtime `$request/$response`.
