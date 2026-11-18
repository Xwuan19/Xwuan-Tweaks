# HANDOFF — trạng thái repo

Tài liệu bàn giao: mỗi khi dừng việc, cập nhật file này để phiên sau (hoặc người khác)
không phải dò lại từ đầu.

**Cập nhật:** 2026-11-18

---

## Repo làm gì

Mở khoá tính năng app bằng can thiệp tầng mạng, cho iOS, theo **hai hướng**:

| Hướng | Cần gì | Nằm ở |
|---|---|---|
| **A — Module** (per-user) | App proxy (Shadowrocket / Surge / Loon / QX / Stash) | `modules/` + `scripts/` |
| **B — DNS + MITM server** (không cần app) | Cài 1 profile `.mobileconfig` | `proxy/` + `admin/` + `api/` + `public/` |

App đang hỗ trợ: **Locket** (chính) và **Spotify** (đang phát triển).

---

## Hiện trạng từng mảng

### Locket — hướng A (module) ✅ chạy được
- `modules/Locket_VIP.module` — bản all-in-one cho Shadowrocket
- `modules/Locket_RemoteConfig.{sgmodule,plugin,snippet,stoverride}` — cùng logic cho Surge / Loon / QX / Stash
- `scripts/locket_*.js` (6 file) — đều có module trỏ tới, không có file mồ côi
- Test: `tests/scripts/firebase_filters.test.js`

### Locket — hướng B (DNS + MITM) ✅ chạy được
- `public/Xwuan_DNS.mobileconfig` — profile đã ký, gồm DNS DoH + Root CA
- `proxy/` — Go MITM proxy (Fly.io), forging cert theo SNI, sửa `expires_date` RevenueCat + Firebase Remote Config + `api.locketcamera.com`
- `admin/` — thư viện backend: sinh profile, NextDNS API, Supabase
- `api/` — Vercel serverless: `generate-profile`, `create-account`, `check-usage`, `admin/*`
- Vanity index tại `public/index.html` và `admin/public/index.html` (giữ 1:1)

### Spotify — hướng A (module) ✅ chạy được, chưa test trên máy thật
- `products/spotify/on-device/` — module + engine patch protobuf
- Test: `tests/research/spotify_*.test.js` (21 test)

### Spotify — hướng B (server) 🚧 mới có tài liệu
- `products/spotify/server/README.md` — yêu cầu hạ tầng, kiến trúc, rủi ro
- **Chưa có code.** Đang chờ chốt: nhà cung cấp VPS, domain, OS, có gộp chung Locket không.

---

## Lệnh kiểm thử

```bash
node --test tests/*.test.js tests/*/*.test.js   # 35 test — phải xanh hết
go test ./tests/proxy/...                        # cần Go toolchain (sandbox hiện không có)
```

Kỳ vọng: `tests 35 / pass 35 / fail 0`.

---

## Quyết định đã chốt (đừng đảo lại)

1. **Miễn phí 100%.** Không thẻ giá, không gói trả phí, không CTA mua.
2. **Locket ưu tiên profile tĩnh đã ký** (`public/Xwuan_DNS.mobileconfig`) thay vì sinh
   động qua NextDNS API — để tránh rủi ro đăng ký thất bại.
3. **`public/` và `admin/public/` phải giữ giống nhau 1:1.** Sửa một bên thì copy sang bên kia.
   (Lý do lịch sử: hai deployment Vercel cùng phục vụ một UI. Nếu xác nhận chỉ còn một
   deployment, gộp lại — xem "Việc cần làm".)
4. **Spotify tách riêng trong `products/spotify/`,** không nhét vào `modules/` ở root.
   Lý do: nó là sản phẩm nhiều phần (on-device + server), không phải một file module.
5. **Bản tham chiếu của người khác để trong `archive/`,** không để cạnh bản đang dùng.

---

## Cạm bẫy đã gặp (đừng lặp lại)

- **`--color-white: #1a1200`** trong `admin/public/css/202soeubg-ydc.72604.css` khiến
  Tailwind `bg-white` thành màu đen. Dùng `background: #fff !important` hoặc CSS scoped.
- **Không dùng `reject-dict`** trong `[URL Rewrite]` của Shadowrocket — chưa thấy module
  thật nào dùng; dùng `reject-200`.
- **`$done({})` trong `binary-body-mode`** nghĩa là "body rỗng", không phải "giữ nguyên".
  Chi tiết: `products/spotify/audit/shadowrocket-module-syntax.md`.
- **`?v=` trong `script-path`** là cache-buster của Shadowrocket. Sửa script thì phải tăng.
- **Vercel và `admin/`:** `admin/` có `package.json` riêng nhưng **không có `vercel.json`
  riêng nữa** (đã xoá vì trùng hệt bản root). Nếu `admin/` từng là project Vercel thứ hai,
  cần trỏ lại về `vercel.json` ở root hoặc khai báo Root Directory trong dashboard.

---

## Việc cần làm

1. **Chốt `admin/` có phải deployment Vercel thứ hai không.** Nếu không → xoá
   `admin/public/` (5.3 MB trùng lặp) và trỏ `admin/lib/mobileconfig.js` chỉ về
   `public/Xwuan_DNS.mobileconfig`. Nếu có → giữ nguyên và ghi rõ trong README.
2. **Spotify hướng B:** chốt 4 mục trong `products/spotify/server/README.md` rồi viết code.
3. **`assets/`** hiện chỉ được tham chiếu qua URL tuyệt đối (`raw.githubusercontent.com`,
   `cdn.jsdelivr.net`) chứ không có code nào đọc bằng đường dẫn tương đối. Nếu đổi cấu
   trúc repo thì các URL đó vẫn phải giữ đúng đường dẫn `assets/...`.
4. **Chưa test Go proxy** trong môi trường này (không có `go`). Cần chạy `go test ./tests/proxy/...`
   ở máy có Go trước khi tin vào phần proxy.
