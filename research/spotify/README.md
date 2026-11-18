# Spotify Research (Shadowrocket MITM + Protobuf)

Thư mục nghiên cứu can thiệp Spotify bằng Shadowrocket module (`[Rule]`, `[URL Rewrite]`, `[Header Rewrite]`, `[MITM]`, `[Script]`).

> **Trạng thái:** engine patch đã chạy được và có test (`spotify_ucs.js`),
> module Shadowrocket đã đầy đủ marker (`modules/spotify-premium-ucs.module`),
> **nhưng chưa coi là bản phát hành** — xem phần "Giới hạn" bên dưới.
> Quy trình phát hành (chuyển lên `modules/`, `scripts/` root) vẫn giữ nguyên như README gốc của repo.

## Đọc trước

- **[notes/eevee-reincarnated-audit.md](notes/eevee-reincarnated-audit.md)** — đối chiếu
  với `SideloadLabs/EeveeSpotifyReincarnated` 7.5.0: kiến trúc 5 tầng, wire format
  đã xác minh, 260 rule UCS, và **danh sách những gì DNS/HTTP không làm được**.
- **[notes/shadowrocket-module-syntax.md](notes/shadowrocket-module-syntax.md)** — cú pháp
  module Shadowrocket đã đối chiếu với module chạy thật: `$done` với binary body,
  `max-size`, `[Header Rewrite]` không có tiền tố type, `_ reject-200`,
  `h2 = true`, và **checklist test trên điện thoại**. Đọc cái này trước khi sửa
  module, nếu không sẽ lặp lại đúng các lỗi đã từng làm module im lặng.
- [notes/shadowrocket-notes.md](notes/shadowrocket-notes.md) — ghi chú Shadowrocket ban đầu (giữ nguyên).

## Giới hạn (quan trọng)

EeveeSpotifyReincarnated là **tweak nhúng trong app**: nó vá protobuf qua network
hook *và* vá ObjC runtime (117 hook group), UI layer, ad service, chống logout.
Module Shadowrocket chỉ chạm được lớp HTTP.

| Tính năng | Module Shadowrocket | Ghi chú |
|---|---|---|
| Chặn quảng cáo (Home/Search/NPV/in-stream) | ✅ phần lớn | qua `[URL Rewrite]` + flag UCS |
| Chặn popup upsell / winback | ⚠️ một phần | popup đã lưu trong SQLite vẫn hiện |
| UI Premium (`type`, `player-license`...) | ✅ | nếu patch được body |
| Play on-demand / queue, crossfade, automix | ✅ phần lớn | 9.2 dùng `nebula` + `remote-config-resolver` |
| Offline / Very High / Jam / Connect | ❌ | server-side, không thể |
| Chống logout tự động | ⚠️ một phần | `[URL Rewrite]` chặn `logout`/`token/revoke`/`session/purge`/`sign-out`/`auth/expire`/`DeleteToken`. Đủ cho ca thường, không đủ khi app tự xoá credential trong Keychain |

## Cấu trúc

- `modules/`
  - **`spotify-premium-ucs.module`** — module chính: QUIC block, 14 pattern ads/upsell/
    session-protection, 8 host block, `[Header Rewrite]` xoá cache validator,
    MITM spclient (`h2 = true`), 4 script hook trỏ `spotify_ucs.js`.
  - `spotifyVIP-local.module` — bản nghiên cứu cũ (devchristian1337), giữ tham chiếu.
  - `ref-spotifyVIP.module` — module gốc tham chiếu từ `yfamilys.com`.
  - `EeveeSpotify-DNS-Rewrite.module` — khung nghiên cứu ban đầu (stub passthrough).
- `scripts/`
  - **`spotify_ucs.js`** — engine patch protobuf tự chứa (không cần protobufjs,
    không gọi mạng). Patch 4 loại payload: `bootstrap`, `customize`,
    `nebula attributes`, `remote-config-resolver`. Chế độ `full` / `ads` / `off`
    qua `argument=`, thêm `debug` để bật log chẩn đoán.
  - `spot-proto-eevee.js`, `eevee_spotify.js`, `spot-*.js` — bản tham chiếu cũ.
- `tools/sync_ucs_rules.py` — đồng bộ rule UCS + attribute server-authoritative
  từ upstream, ghi `data/ucs-rules.json` và khối GENERATED trong `spotify_ucs.js`.
- `data/ucs-rules.json` — snapshot 260 rule (diff được khi upstream đổi).
- `profiles/Spotify.mobileconfig` — profile DoH tham chiếu.
- `raw-data/` — domain/endpoint thô.

## Cài đặt

1. Thêm module:
   `https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/research/spotify/modules/spotify-premium-ucs.module`
2. Bật **HTTPS Decryption / MITM** trong Shadowrocket, cài CA rồi bật tin cậy trong
   iOS Settings > General > About > Certificate Trust Settings.
3. Settings > UDP > **Enable Forwarding** (UDP đi direct/reject là script không
   thấy body).
4. Mở Spotify, đăng nhập, đợi ~30 giây.
5. Muốn chỉ chặn quảng cáo: sửa 4 dòng `[Script]` thành `argument=ads`.
6. Muốn soi trên máy thật: `argument=full&debug=true` rồi xem log
   ([checklist](notes/shadowrocket-module-syntax.md#11-checklist-test-trên-điện-thoại)).

### Ba lỗi cú pháp đã sửa (đừng tái phạm)

| Lỗi cũ | Hậu quả trên máy thật | Sửa |
|---|---|---|
| `$done({})` ở nhánh passthrough | Shadowrocket hiểu là body rỗng → Spotify loading mãi | trả nguyên body gốc |
| `http-request <regex> header-del ...` | `http-request` bị coi là phần của regex → không xoá được validator → 304 → không có body | bỏ tiền tố type |
| `[Rule] ... (PROTOCOL,QUIC)` | `QUIC` không phải token của Shadowrocket → rule không có hiệu lực | `PROTOCOL,UDP` |
| `reject-dict` trong `[URL Rewrite]` | chưa thấy dùng trong module thật nào | `reject-200` |
| `max-size=-1` | ý nghĩa mâu thuẫn giữa các nguồn | số dương lớn `8388608` |

## Kiểm thử

```bash
node --test tests/research/spotify_ucs.test.js
```

14 test dựng payload protobuf thật (bootstrap/customize/nebula/remote-config),
kiểm tra attribute, rule `remove`/`setBool`/`forceBool`, cohort ad flag,
passthrough khi `304`/`mode=off`, payload rác không làm crash, và quan trọng nhất:

- `$done` trả `Uint8Array` với engine `webview` / `ArrayBuffer` với `jsc`
- passthrough phải trả **nguyên byte gốc**, không được `{}`
- không bao giờ kèm `status`/`headers` khi trả body
- `argument=debug` bật log chẩn đoán

## Đồng bộ khi upstream cập nhật

```bash
git clone --depth 1 https://github.com/SideloadLabs/EeveeSpotifyReincarnated /tmp/eevee
python3 research/spotify/tools/sync_ucs_rules.py /tmp/eevee
node --test tests/research/spotify_ucs.test.js
git diff research/spotify/data/ucs-rules.json   # xem rule mới
```

Xem diff JSON để quyết định có cần cập nhật `spotify_ucs.js` không (nếu chỉ thêm
rule thì không cần).

## Giấy phép / nguồn

Rule và giá trị attribute được trích từ EeveeSpotifyReincarnated (**GPL-3.0**).
Không có mã Swift/protobuf nào của upstream được copy vào repo này; chỉ có
danh sách cấu hình dạng dữ liệu + logic viết lại độc lập. Xem §8 trong audit.

> Bản demo DoH server local cũ đã được chuyển sang `archive/spotify-doh-demo/`.
