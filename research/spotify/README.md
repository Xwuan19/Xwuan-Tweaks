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
| Chống logout tự động | ❌ | cần hook `SPTAuthSessionImplementation` |

## Cấu trúc

- `modules/`
  - **`spotify-premium-ucs.module`** — module chính: QUIC block, ~40 marker ads/upsell,
    host block `aet/ad/ads.spotify.com`, `[Header Rewrite]` xoá cache validator,
    MITM spclient, 4 script hook trỏ `spotify_ucs.js`.
  - `spotifyVIP-local.module` — bản nghiên cứu cũ (devchristian1337), giữ tham chiếu.
  - `ref-spotifyVIP.module` — module gốc tham chiếu từ `yfamilys.com`.
  - `EeveeSpotify-DNS-Rewrite.module` — khung nghiên cứu ban đầu (stub passthrough).
- `scripts/`
  - **`spotify_ucs.js`** — engine patch protobuf tự chứa (không cần protobufjs,
    không gọi mạng). Patch 4 loại payload: `bootstrap`, `customize`,
    `nebula attributes`, `remote-config-resolver`. Chế độ `full` / `ads` / `off`
    qua `argument=`.
  - `spot-proto-eevee.js`, `eevee_spotify.js`, `spot-*.js` — bản tham chiếu cũ.
- `tools/sync_ucs_rules.py` — đồng bộ rule UCS + attribute server-authoritative
  từ upstream, ghi `data/ucs-rules.json` và khối GENERATED trong `spotify_ucs.js`.
- `data/ucs-rules.json` — snapshot 260 rule (diff được khi upstream đổi).
- `profiles/Spotify.mobileconfig` — profile DoH tham chiếu.
- `raw-data/` — domain/endpoint thô.

## Cài đặt

1. Thêm module:
   `https://raw.githubusercontent.com/Xwuan19/Xwuan-Tweaks/main/research/spotify/modules/spotify-premium-ucs.module`
2. Bật **HTTPS Decryption / MITM** trong Shadowrocket và cài + tin cậy CA.
3. Mở Spotify, đăng nhập, đợi ~30 giây (giai đoạn đăng nhập không bị can thiệp).
4. Muốn chỉ chặn quảng cáo: sửa 4 dòng `[Script]` thành `argument=ads`.

## Kiểm thử

```bash
node --test tests/research/spotify_ucs.test.js
```

11 test dựng payload protobuf thật (bootstrap/customize/nebula/remote-config),
kiểm tra attribute, rule `remove`/`setBool`/`forceBool`, cohort ad flag,
passthrough khi `304`/`mode=off`, và payload rác không làm crash.

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
