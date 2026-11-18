# `products/` — sản phẩm nhiều phần

Dành cho sản phẩm **không gói gọn trong một file module** — tức là có nhiều hướng triển
khai, có dữ liệu dùng chung, hoặc có tài liệu riêng theo từng hướng.

| Sản phẩm | Trạng thái |
|---|---|
| `spotify/` | Hướng on-device chạy được; hướng server mới có tài liệu |

## Khi nào dùng `products/`, khi nào dùng `modules/` + `scripts/`

| | `modules/` + `scripts/` | `products/<tên>/` |
|---|---|---|
| Bản chất | một module + một vài script JS | nhiều phần, nhiều hướng |
| Cấu trúc | phẳng | có `README.md` riêng + thư mục con theo hướng |
| Ví dụ | Locket | Spotify |

Sản phẩm đơn giản thì **đừng** tạo `products/` — cứ đặt trong `modules/` + `scripts/` như Locket.

Xem [spotify/README.md](spotify/README.md).
