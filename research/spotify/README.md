# Spotify Research (Shadowrocket MITM + Protobuf)

Thư mục nghiên cứu can thiệp Spotify bằng Shadowrocket module (`[Rule]`, `[URL Rewrite]`, `[Header Rewrite]`, `[MITM]`, `[Script]`) — **chưa phát hành chính thức** (khi ổn định sẽ tách bản hoàn chỉnh lên `modules/` và `scripts/` ở root).

## Cấu trúc
- `modules/`
  - `spotifyVIP-local.module` — module mẫu nghiên cứu với script local (`spot-*.js`)
  - `EeveeSpotify-DNS-Rewrite.module` — khung nghiên cứu MITM + Script hooks (stub passthrough)
  - `ref-spotifyVIP.module` — bản module gốc tham chiếu từ `yfamilys.com` (`devchristian1337`)
- `scripts/`
  - `eevee_spotify.js` — khung JS passthrough (`http-response`, binary protobuf)
  - `spot-gabo.js`, `spot-NoHomeAd.js`, `spot-NoScrollAd.js`, `spot-NoSearchAd.js`, `spot-proto-eevee.js`, `spot-proto-ev3.js` — script tham chiếu xử lý ads & protobuf
- `notes/shadowrocket-notes.md` — ghi chú cơ chế, endpoint và hướng hoàn thiện
- `raw-data/`
  - `spotify-dns-raw-data.txt` — tổng hợp domain/endpoint Spotify
  - `eevee-repo-extracted.txt` — URL/domain trích thô từ `whoeevee/EeveeSpotifyReborn` (branch `swift`)
- `profiles/Spotify.mobileconfig` — profile DoH tham chiếu

> Bản demo DoH server local cũ đã được chuyển sang `archive/spotify-doh-demo/`.
