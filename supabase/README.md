# `supabase/` — schema & migration

Database cho các tài khoản NextDNS do `api/create-account.js` tạo.

| File | Nội dung |
|---|---|
| `migrations/*_create_nextdns_accounts.sql` | Bảng `nextdns_accounts`: id, email, password, profile id, usage |
| `migrations/*_add_profile_name_to_accounts.sql` | Thêm cột `profile_name` |
| `config.toml` | Cấu hình Supabase CLI local |

## Biến môi trường cần có

```
SUPABASE_URL
SUPABASE_SERVICE_KEY
```

`admin/lib/db.js` đọc hai biến này. Nếu thiếu, `db.test.js` vẫn pass vì test kiểm tra
đúng hành vi "không có config thì không crash" — nghĩa là **test không chứng minh được
kết nối thật hoạt động**.

## Khi sửa schema

Thêm file migration mới, không sửa file cũ (Supabase chạy theo thứ tự timestamp).
Sau đó cập nhật `admin/lib/db.js` tương ứng.
