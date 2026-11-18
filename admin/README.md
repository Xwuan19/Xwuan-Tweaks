# `admin/` — thư viện backend & tài nguyên web

**Đây không phải một app độc lập** — nó là nơi chứa logic backend mà `api/` re-export,
cộng thêm một bản sao của site tĩnh.

> ⚠️ **Chưa rõ `admin/` có phải một Vercel project thứ hai không.** `admin/` có
> `package.json` riêng (nguyên nhân gốc) và từng có `vercel.json` riêng — file đó **đã bị
> xoá** vì trùng hệt bản ở root. Xem mục "Cần xác nhận".

## Cấu trúc

| Đường dẫn | Vai trò | Ai dùng |
|---|---|---|
| `lib/auth.js` | JWT admin (generate / verify), so mật khẩu | `api/admin/*.js`, tests |
| `lib/db.js` | Supabase client: accounts, usage | `api/*.js`, tests |
| `lib/nextdns.js` | NextDNS API: tạo/xoá/đổi tên tài khoản, đọc usage | `api/*.js`, tests |
| `lib/mobileconfig.js` | Sinh XML profile, đọc profile đã ký, lấy CA base64 | `admin/api/generate-profile.js`, tests |
| `api/generate-profile.js` | Handler đầy đủ cho `/api/generate-profile` | `api/generate-profile.js` re-export |
| `public/` | **Bản sao** của `public/` ở root (~122 file, 5.3 MB) | Không có code nào trong repo đọc |
| `package.json` | Chỉ để `npm test` trỏ về `../tests/admin/` | — |

## Quan hệ với `public/` ở root

`admin/public/` và `public/` **giống nhau 1:1**, trừ:

- `public/` có thêm `admin.html` (UI quản trị) và `admin/index.html` (redirect stub)
- `admin/public/` có `.gitkeep` (đã xoá)

`admin/lib/mobileconfig.js` tìm file profile theo **4 đường dẫn fallback**, gồm cả hai vị trí:

```js
'../../public/Xwuan_DNS.mobileconfig'
'../public/Xwuan_DNS.mobileconfig'
'public/Xwuan_DNS.mobileconfig'
'admin/public/Xwuan_DNS.mobileconfig'
```

Nghĩa là xoá `admin/public/` **không làm hỏng** phần đọc profile.

## Cần xác nhận (trước khi dọn tiếp)

Câu hỏi duy nhất: **`admin/` có từng được deploy thành một Vercel project riêng không?**

- **Không** → xoá `admin/public/` (giảm 5.3 MB trùng lặp), giữ nguyên `lib/` + `api/`.
  Đây là kết quả mong muốn.
- **Có** → giữ nguyên, và **khôi phục `admin/vercel.json`** (nội dung = bản ở root) hoặc
  khai báo Root Directory trong dashboard Vercel.

Cách kiểm tra: vào Vercel dashboard xem có project nào có Root Directory = `admin`.
Nếu mọi project đều dùng root thì câu trả lời là "không".

## Khi sửa `public/`

Nếu `admin/public/` vẫn được giữ, sửa `public/index.html` thì **phải copy sang
`admin/public/index.html`** để giữ 1:1 — đây là quy ước đã chốt trong `HANDOFF.md`.

## Test

```bash
node --test tests/admin/*.test.js
```

6 file test phủ: auth, db, index_html, nextdns, profile, proxy_filters.
