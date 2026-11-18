# Xwuan-Tweaks

Tổng hợp module, script và hạ tầng mở khóa tính năng (hiện tại: **Locket Gold VIP** — quay video 60s có tiếng, Photobooth 4-cut, AI Likeness Filters, Khung Widget & Caption VIP, chặn quảng cáo) phát triển bởi **Xwuan** ([@Xwuan19](https://github.com/Xwuan19)).

---

## Link Cài Đặt Chính Thức (Raw)

Sao chép trực tiếp link **Raw** tương ứng với ứng dụng bạn đang dùng:

| Tính năng | Ứng dụng | Link Raw cài đặt |
| --- | --- | --- |
| **Locket VIP (All-in-One)** | Shadowrocket | `https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/modules/Locket_VIP.module` |
| **Locket VIP (RemoteConfig)** | Surge | `https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/modules/Locket_RemoteConfig.sgmodule` |
| **Locket VIP (RemoteConfig)** | Loon | `https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/modules/Locket_RemoteConfig.plugin` |
| **Locket VIP (RemoteConfig)** | Quantumult X | `https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/modules/Locket_RemoteConfig.snippet` |
| **Locket VIP (RemoteConfig)** | Stash | `https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/modules/Locket_RemoteConfig.stoverride` |

> [!IMPORTANT]
> **2 bước bắt buộc để kích hoạt Locket VIP thành công:**
> 1. Bật **Giải mã HTTPS (HTTPS Decryption / MitM)** và tin cậy chứng chỉ gốc trong `Cài đặt > Cài đặt chung > Giới thiệu > Cài đặt tin cậy chứng nhận`.
> 2. **Xóa app Locket rồi tải lại từ App Store** ở lần cài đầu tiên để xóa cache SQLite của Firebase Remote Config (sau đó dùng bình thường không cần xóa lại).

---

## Cấu Trúc Thư Mục

```text
Xwuan-Tweaks/
├── modules/               # Chính thức: file cấu hình cài thẳng (.module, .sgmodule, .plugin, .snippet, .stoverride)
├── scripts/               # Chính thức: mã nguồn JS đang hoạt động được modules/ trỏ tới
├── assets/                # Chính thức: icon và khung ảnh VIP (frames/)
│
├── research/              # Nghiên cứu: spotify/, reference_nightmarket/ & công cụ quét endpoint (scanner/)
├── archive/               # Lưu trữ: scripts/ cũ & spotify-doh-demo/ (bản demo DoH cũ)
│
├── public/                # Web Portal (Vercel — cài profile Xwuan_DNS.mobileconfig 1-click)
├── api/                   # Vercel Serverless API
├── admin/                 # Thư viện backend & tài nguyên quản trị DNS
├── proxy/                 # Backend TLS MITM Proxy (Go trên Fly.io)
├── ca/                    # Root CA Certificate
├── nextdns/               # NextDNS API helper
├── supabase/              # Cấu hình & migration Supabase
└── tests/                 # Bộ kiểm thử tự động (Node & Go)
```

---

## Quy Trình Phát Triển & Kiểm Thử

1. **Nghiên cứu & thử nghiệm**: Lưu tài liệu phân tích, mẫu tham khảo hoặc công cụ quét tại `research/`.
2. **Phát hành chính thức**: Đưa script đã test ổn định vào `scripts/`, gắn link Raw vào file cấu hình trong `modules/` và cập nhật bảng cài đặt ở trên. Chuyển bản cũ hết dùng sang `archive/`.
3. **Đồng bộ Go Proxy**: Khi có payload mới, đồng bộ vào `proxy/handler/firebase.go` hoặc `proxy/handler/revenuecat.go`.
4. **Kiểm thử trước khi push**:
   - Node tests: `node --test tests/*.test.js tests/*/*.test.js`
   - Go proxy tests: `go test ./tests/proxy/...`
