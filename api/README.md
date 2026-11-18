# `api/` — Vercel serverless functions

Endpoint HTTP công khai. Mỗi file = một route (Vercel file-system routing).

| File | Route | Chức năng |
|---|---|---|
| `generate-profile.js` | `GET /api/generate-profile` | Trả `Xwuan_DNS.mobileconfig` đã ký. Tham số: `?id=` (tên profile), `?xml=1` (sinh XML động thay vì trả bản đã ký) |
| `create-account.js` | `POST /api/create-account` | Tạo tài khoản NextDNS + lưu Supabase |
| `check-usage.js` | `GET /api/check-usage` | Kiểm tra số query NextDNS đã dùng |
| `admin/auth.js` | `POST /api/admin/auth` | Đăng nhập admin, trả JWT |
| `admin/accounts.js` | `/api/admin/accounts` | CRUD tài khoản NextDNS (cần JWT) |
| `admin/check-usage.js` | `/api/admin/check-usage` | Kiểm tra usage cho admin (cần JWT) |

## Quan hệ với `admin/`

**Logic thật nằm ở `admin/`**, không phải ở đây:

```
api/*.js            →  wrapper mỏng, phần lớn chỉ vài dòng
admin/lib/*.js      →  logic thật (auth, db, nextdns, mobileconfig)
admin/api/*.js      →  route handler đầy đủ mà api/generate-profile.js re-export
```

Ví dụ `api/generate-profile.js` chỉ 1 dòng:

```js
module.exports = require('../admin/api/generate-profile');
```

Lý do tồn tại cấu trúc này: Vercel cần thư mục `api/` ở root, còn logic được gom vào
`admin/` để test được (`tests/admin/*.test.js` require `admin/lib/...`).

## Khi sửa

- Sửa logic → vào `admin/lib/` hoặc `admin/api/`, **không** sửa `api/` (trừ khi thêm route mới).
- Thêm route mới → tạo file trong `api/`, re-export từ `admin/api/` nếu logic > ~20 dòng.
- Response profile **phải** có header `Content-Type: application/x-apple-aspen-config`
  — đã khai trong `vercel.json` ở root.
- Test: `node --test tests/admin/*.test.js`

## Cấu hình Vercel

`vercel.json` ở **root** (không phải trong `admin/` — bản trùng đã xoá). Khai báo
`cleanUrls` và header cho `.mobileconfig`.

`.vercelignore` loại `proxy`, `Dockerfile`, `fly.toml`, `ca/*.key` khỏi bundle.
