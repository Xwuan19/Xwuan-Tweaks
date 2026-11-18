# `public/` — site tĩnh + profile phát hành

Vercel phục vụ thư mục này ở root. Đây là **mặt tiền** của hướng B: user vào web, tải
profile, cài, xong — không cần app.

## File quan trọng

| File | Vai trò |
|---|---|
| `Xwuan_DNS.mobileconfig` | **Profile phát hành.** Đã ký, gồm DNS DoH payload + Root CA payload. Đây là thứ user thực sự cài |
| `index.html` | Landing page (hero, tính năng, hướng dẫn, FAQ). Bản mirror: `admin/public/index.html` |
| `admin.html` | UI quản trị NextDNS (gọi `/api/admin/*`). Không có bản mirror |
| `admin/index.html` | Redirect stub 1 dòng → `/admin.html` |
| `css/`, `fonts/`, `images/` | Asset của landing page (vendor stylesheet + font đã hash tên) |

## Quy ước bắt buộc

- **Không dùng Tailwind `bg-white`** trong container `.site-index`. File
  `css/202soeubg-ydc.72604.css` định nghĩa `--color-white: #1a1200` (nâu đen), nên
  `bg-white` ra màu đen. Dùng `background: #fff !important` hoặc CSS scoped.
- **Sửa `index.html` thì phải copy sang `admin/public/index.html`** (quy ước 1:1, xem
  `HANDOFF.md`). Nếu xác nhận `admin/` không phải deployment riêng thì bỏ quy ước này
  và xoá bản mirror.
- **Không đổi tên file trong `images/`, `fonts/`, `css/`** — tên đã hash, HTML trỏ trực tiếp.

## Về `Xwuan_DNS.mobileconfig`

File này là **CMS-signed** (PKCS#7), không phải plist trơn. Muốn đọc nội dung:

```bash
openssl smime -verify -noverify -inform DER -in public/Xwuan_DNS.mobileconfig -out /tmp/p.plist
python3 -c "import plistlib;print(plistlib.load(open('/tmp/p.plist','rb')))"
```

Ký lại sau khi đổi nội dung (ví dụ đổi IP proxy) là bắt buộc — file không ký sẽ bị iOS
cảnh báo "chưa xác minh".
