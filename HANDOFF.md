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
| **B — DNS + MITM server** (không cần app) | Cài 1 profile `.mobileconfig` | `proxy/` + `admin/` + `nextdns/` + `ca/` |

App đang hỗ trợ: **Locket** (chính) và **Spotify** (đang phát triển).

---

## Đã gỡ web (2026-11-18)

Theo yêu cầu: tạm dừng web, tập trung DNS + module. Đã xoá **12 thư mục/file web**:

| Xoá | Trước đây là gì | Khôi phục |
|---|---|---|
| `public/` | Site landing (124 file, 5.3 MB) + profile đã ký | `git checkout fcb2d39 -- public` |
| `api/` | 6 Vercel route (generate-profile, create-account, check-usage, admin/*) | `git checkout fcb2d39 -- api` |
| `admin/public/` | Bản mirror 1:1 của `public/` (5.3 MB) | `git checkout fcb2d39 -- admin/public` |
| `admin/api/generate-profile.js` | Handler của route profile | `git checkout fcb2d39 -- admin/api` |
| `admin/lib/auth.js` | JWT admin, so mật khẩu | `git checkout fcb2d39 -- admin/lib/auth.js` |
| `admin/lib/db.js` | Supabase client | `git checkout fcb2d39 -- admin/lib/db.js` |
| `supabase/` | Schema + migration | `git checkout fcb2d39 -- supabase` |
| `vercel.json`, `.vercelignore` | Cấu hình deploy | `git checkout fcb2d39 -- vercel.json .vercelignore` |
| `tests/admin/{index_html,auth,db}.test.js` | Test của phần web | `git checkout fcb2d39 -- tests/admin` |

**Giữ lại vì thuộc DNS, không phải web:** `admin/lib/mobileconfig.js` (sinh profile DoH)
và `admin/lib/nextdns.js` (giữ `DOMAINS_TO_REWRITE`).

**Hệ quả cần biết:**
- `getSignedProfile()` giờ trả `null` — file `.mobileconfig` đã ký không còn trong repo.
  `generateMobileconfig()` vẫn sinh được XML chưa ký (iOS cài được nhưng hiện cảnh báo
  "chưa xác minh"). Muốn bản đã ký phải ký bằng `openssl smime -sign` — **chưa script hoá**.
- Luồng `create-account` / `check-usage` (NextDNS API + Supabase) không còn route gọi tới.
  `nextdns/index.js` vẫn còn và được test phủ, nhưng hiện chỉ là thư viện.
- Test: 35 → **31** (bỏ 4 test của `index_html`, `auth`, `db`, và handler profile).

## Hiện trạng từng mảng

### Locket — hướng A (module) ✅ chạy được
- `modules/Locket_VIP.module` — bản all-in-one cho Shadowrocket
- `modules/Locket_RemoteConfig.{sgmodule,plugin,snippet,stoverride}` — cùng logic cho Surge / Loon / QX / Stash
- `scripts/locket_*.js` (6 file) — đều có module trỏ tới, không có file mồ côi
- Test: `tests/scripts/firebase_filters.test.js`

### Locket — hướng B (DNS + MITM) ⚠️ code còn, phần phát hành đã gỡ
- `proxy/` — Go MITM proxy (Fly.io): forging cert theo SNI, sửa `expires_date` RevenueCat
  + Firebase Remote Config + `api.locketcamera.com`. **Còn nguyên.**
- `admin/lib/mobileconfig.js` — sinh profile DoH. **Còn nguyên** (công cụ chính).
- `nextdns/index.js` — client NextDNS + `DOMAINS_TO_REWRITE`. **Còn nguyên.**
- Profile đã ký phát hành cho user, web, và API: **đã gỡ** cùng đợt dọn web.

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
3. ~~`public/` và `admin/public/` phải giữ giống nhau 1:1.~~ **Không còn áp dụng** — cả hai
   đã bị gỡ khi tạm dừng web.
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

1. ~~Chốt `admin/` có phải deployment Vercel thứ hai không.~~ **Đã giải quyết** — toàn bộ
   `admin/public/` và cấu hình Vercel đã gỡ cùng đợt dọn web.
2. **Spotify hướng B:** chốt 4 mục trong `products/spotify/server/README.md` rồi viết code.
3. **`assets/`** hiện chỉ được tham chiếu qua URL tuyệt đối (`raw.githubusercontent.com`,
   `cdn.jsdelivr.net`) chứ không có code nào đọc bằng đường dẫn tương đối. Nếu đổi cấu
   trúc repo thì các URL đó vẫn phải giữ đúng đường dẫn `assets/...`.
4. **Chưa test Go proxy** trong môi trường này (không có `go`). Cần chạy `go test ./tests/proxy/...`
   ở máy có Go trước khi tin vào phần proxy.
