# YouTube — chặn quảng cáo ở tầng mạng

```
products/youtube/
├── engine/youtube_adblock.js   ← JS chạy trong sandbox Shadowrocket (tự chứa, 0 dependency)
├── module/youtube-adblock.module
└── README.md                    ← file này
```

## Cài đặt

Dán URL này vào Shadowrocket: **配置 > 模块 > ➕**

```
https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/products/youtube/module/youtube-adblock.module
```

Chạy được trên Shadowrocket, Surge, Loon (cùng cú pháp `[Script]` + `binary-body-mode`).

**Ba điều kiện bắt buộc** — thiếu một cái là module im lặng, không báo lỗi:

1. **HTTPS Decrypt bật + CA đã tin cậy.** Config > ⓘ > HTTPS Decrypt > Certificate > Generate new CA > Install Certificate, rồi iOS Settings > General > About > Certificate Trust Settings > bật tin cậy.
2. **UDP đi qua proxy** (Settings > UDP > Enable Forwarding). YouTube chạy HTTP/3 trên QUIC; QUIC lọt ra ngoài thì không đọc được body.
3. **iOS 15+.** Từ iOS 15 giới hạn bộ nhớ Network Extension tăng 15 MB → 50 MB.

## Làm được gì

| Nhóm | Cơ chế | Trạng thái |
|---|---|---|
| Quảng cáo đầu video / giữa video | Xoá field **7** `adPlacements` + field **68** `adSlots` khỏi `/youtubei/v1/player` | ✅ có code + test |
| Như trên nhưng qua `/get_watch` | Player lồng ở field `1 → 2`, dọn tại chỗ | ✅ có code + test |
| Ad card trong feed / tìm kiếm | Xoá `elementRenderer` là ad khỏi `/browse`, `/next`, `/search` | ✅ có code + test |
| Ad reel trong Shorts | Bỏ entry ad khỏi `/reel_watch_sequence` | ✅ có code + test |
| Endpoint quảng cáo / telemetry | `[URL Rewrite]` → `reject-200` | ✅ trong module |

## KHÔNG làm được (và nên biết vì sao)

Đây là giới hạn của kênh HTTP, không phải thiếu code:

| Không làm được | Vì sao | Muốn có thì phải |
|---|---|---|
| SponsorBlock | Cần UI + hook vào player timeline | Tweak Logos + sideload IPA |
| Tua/tắt quảng cáo, PiP, nền tối | Sửa trạng thái player trong app | Như trên |
| Download, chặn Shorts, đổi giao diện | Hook Objective-C vào ViewController | Như trên |
| Video chất lượng cao hơn hạn mức tài khoản | Server quyết định, đã ký trong streaming URL | Như trên |

Nói gọn: **module mạng sửa được "server trả gì", không sửa được "app làm gì với nó".** Các tweak bạn đưa làm cả hai; module này chỉ làm vế thứ nhất.

## Ba nguồn bạn đưa — dùng được bao nhiêu?

| Repo | Loại | Giấy phép | Dùng được gì |
|---|---|---|---|
| [YTLite](https://github.com/dayanch96/YTLite) ★5673 | Tweak Logos | không rõ (repo không có LICENSE) | **Chỉ để tham khảo danh sách tính năng.** Không copy code. |
| [YouMod](https://github.com/Tonwalter888/YouMod) ★820 | Tweak Logos | **GPL-3.0** | Danh sách hook (`Ads.x` 400 dòng) để đối chiếu. Copy là dính GPL cho toàn repo. |
| [ytkace](https://github.com/itzzace/ytkace) ★1170 | Tweak ObjC++ | **MIT** | Tương đối an toàn về pháp lý, nhưng vẫn là code inject — không port sang mạng được. |

Cả ba đều **inject vào app** nên không chạy nếu không sideload IPA. Chúng sửa được nhiều hơn hẳn — nhưng đổi lại user phải cài IPA đã patch, mất cập nhật App Store, và chấp nhận rủi ro tài khoản.

**Nguồn thật sự dùng được cho module mạng** là hai MITM server viết bằng Go, đều công khai và có code đọc được:

| Repo | Giấy phép | Đóng góp |
|---|---|---|
| [pass-with-high-score/blockads-android](https://github.com/pass-with-high-score/blockads-android) ★2767 | GPL-3.0 | `tunnel/internal/mitm/youtube_proto.go` — thuật toán prune `elementRenderer`, pattern Shorts |
| [xxdondi/imitm](https://github.com/xxdondi/imitm) | **MIT** | `internal/modules/youtube/player_ads.go` — xác nhận field 7/68 và cách bảo vệ để không xoá nhầm |

Từ hai nguồn đó mới chốt được **số field chính xác** (7 và 68). Không có bước này thì mọi module protobuf đều phải đoán, và đoán sai thì hoặc không chặn được gì, hoặc xoá mất nội dung thật.

Giấy phép của repo này là gì thì xem `README.md` gốc — nhưng lưu ý: ý tưởng/số field protobuf **không** thuộc phạm vi bảo hộ giống như code. Phần engine ở đây viết lại từ đầu, không dán dòng nào của GPL-3.0.

## Kiến trúc

Không dùng `protobufjs` (105 KB). Engine chỉ đọc/ghi **wire format ở mức field**:

```
tag (varint)  = field_number << 3 | wire_type
wire 0 = varint · wire 2 = length-delimited · wire 1/5 = fixed64/32
```

Vì sao chọn cách này:

- **Giữ nguyên byte field lạ.** Field YouTube thêm sau này không bị mất, vì engine chỉ copy `buf[start..end]` nguyên vẹn.
- **Không phụ thuộc schema.** Không cần `.proto` cập nhật mỗi lần YouTube đổi.
- **Không tốn bộ nhớ.** Không dựng object tree; chỉ mảng con trỏ vào buffer gốc. Network Extension chỉ có 50 MB.

Quy tắc an toàn:

| Tình huống | Hành vi |
|---|---|
| Cấu trúc protobuf hỏng | `readFields` trả `null` → passthrough nguyên body |
| Không tìm thấy ad | `removed === 0` → passthrough nguyên body |
| Exception bất kỳ | `try/catch` bao ngoài → passthrough nguyên body |
| Body rỗng (304) | `$done({})` — trường hợp duy nhất được phép |

**Không bao giờ** trả `body` rỗng cho một hook `binary-body-mode`: trong Shadowrocket, `$done({})` nghĩa là "thay body bằng rỗng", không phải "giữ nguyên". Đây là lỗi đã làm bản Spotify đầu tiên im lặng hoàn toàn.

## Chẩn đoán trên điện thoại

Sửa `argument` trong module thành `ads&debug=true` (Config > 模块 > module > 编辑参数), mở YouTube, xem log Shadowrocket:

| Log | Nghĩa |
|---|---|
| `[youtube-adblock] hook: /youtubei/v1/player \| body=NNN bytes \| head=0a 00` | Hook khớp ✅ |
| `đã xoá N mục \| A -> B bytes` | Patch có tác dụng ✅ |
| `passthrough: không có ad` | Hook chạy nhưng response này không có quảng cáo (bình thường) |
| `passthrough: body rỗng (304?)` | `requires-body` thiếu, hoặc QUIC chưa chặn → xem mục 3 điều kiện |
| **không có log nào** | Pattern không khớp, hoặc host chưa được MITM giải mã |
| `passthrough: exception` | Gửi log kèm vài dòng `head=` để soi wire format |

Xong thì đổi lại `argument=ads` để tắt log.

## Đã kiểm chứng gì

| Kiểm chứng | Cách làm | Kết quả |
|---|---|---|
| Wire format đọc/ghi đúng | Dựng protobuf thật bằng tay, round-trip qua engine | ✅ 14 test |
| Không mất byte field lạ | Test với field 9999 giả định YouTube thêm sau | ✅ |
| Không xoá nhầm nội dung | Test element < 200 B và ad shelf có element con | ✅ |
| Số field đúng | Đối chiếu 2 repo MITM độc lập | ✅ 7 và 68 |
| Cú pháp module chạy được | 17 test theo checklist đã dùng cho Spotify | ✅ |
| **Trên máy thật** | **Chưa ai chạy** | ❌ **cần bạn test** |

Dòng cuối là quan trọng: mọi thứ ở trên là test Node. Chưa có ai cài module này lên iPhone và mở YouTube. Trước khi phát cho ai, hãy tự chạy với `debug=true` và đối chiếu 4 dòng log ở trên.

## Việc còn có thể làm

1. **`/youtubei/v1/log_event` có thể chặn nhầm** — endpoint này cũng dùng cho watch-time tracking. Nếu lịch sử xem hoặc "tiếp tục xem" có vấn đề, bỏ dòng `reject-200` tương ứng trong `[URL Rewrite]` trước tiên.
2. **Chặn `imasdk.googleapis.com`** có thể làm hỏng video nhúng từ web khác. Nếu gặp, thêm ngoại lệ.
3. **Field 68 chưa chắc có ở mọi phiên bản app** — engine chỉ xoá khi thấy, không bắt buộc. Không có cũng không sao.
4. **Danh sách pattern feed dựa trên quan sát**, không phải hằng số giao thức. YouTube đổi tên nhãn là phải cập nhật. Cách phát hiện: feed không sạch nhưng `/player` sạch.
