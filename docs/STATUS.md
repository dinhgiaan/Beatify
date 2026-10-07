# Trạng thái dự án

> Agent cập nhật file này sau mỗi lần làm việc. Người dùng đọc để biết đang ở đâu và cần làm gì.

**Phase hiện tại:** Phase 0, bước 1 (monorepo, `packages/shared`, CI, workflow build) đã khởi tạo git và commit xong, chờ link remote GitHub để push và xác nhận CI xanh
**Cập nhật lần cuối:** 2026-10-08
**Quy tắc phạm vi:** đóng băng, không thêm tính năng mới cho tới khi dùng MVP ít nhất hai tuần. Ý tưởng mới ghi vào `docs/IDEAS.md`.

## Thiết bị và điều kiện
- iPhone 16, **iOS 27 bản chính thức**.
- PC Windows. Có thẻ VISA (cần bật được R2, kiểm tra ở Phase 0).
- Người dùng tự lo việc gia hạn app mỗi 7 ngày.
- Ngoài phạm vi: CarPlay, widget.

## Quyết định đã chốt
- Audio: `@rntp/player` (RNTP v5), dự phòng `expo-audio`. Giấy phép dùng cá nhân: **chưa xác nhận** (đọc `https://www.rntp.dev/terms` ở Phase 0).
- Backend: Cloudflare Worker (Hono + Zod) + R2. Không dùng nhiều tài khoản để lách giới hạn free.
- Token nhập trong app, lưu SecureStore.
- Ký app: Apple ID miễn phí + Sideloadly/AltStore (gia hạn 7 ngày).
- Bundle ID: **`com.dinhgiaan.beatify`** (bản dev: `com.dinhgiaan.beatify.dev`).
- Expo SDK: **57 ổn định + Xcode 26.x ghim**, chưa dùng SDK 58 beta (xem `docs/PLAN.md` mục 12.7).
- MVP = Phase 0 đến 2. Phase 3 trở đi làm sau khi đã dùng thật.
- Công cụ (khoá phiên bản chính xác, khai báo chung ở `pnpm-workspace.yaml` mục `catalog`): Node 22, pnpm 12.5.1 (`packageManager`), TypeScript 6.0.3 (typescript-eslint 8.70 chỉ hỗ trợ TypeScript dưới 6.1), Zod 4.6.5, Vitest 5.0.1, ESLint 10.11.0, Prettier 3.9.8.
- Runner build: nhãn **`macos-26`** (ghim, không dùng `macos-latest`) + Xcode **26.6** tại `/Applications/Xcode_26.6.app`. Nguồn: danh sách phần mềm image macos-26 (runner-images, image 20260831) ghi Xcode 26.6 là bản mặc định và có Xcode 26.0 đến 26.5. Cần kiểm tra lại nếu image đổi.
- Repo: **private** (`https://github.com/dinhgiaan/Beatify`). Phút macOS bị giới hạn (hệ số 10, khoảng 200 phút macOS/tháng nếu gói Free), nên chỉ build khi cần, dùng dev client + hot reload cho thay đổi JS/TS, và đặt `timeout-minutes` thấp. Kiểm tra mức đã dùng ở GitHub → Settings → Billing and plans → Usage.

## Phase 0: Nền tảng và spike
- [x] Monorepo pnpm (`apps/mobile`, `apps/api`, `tools/indexer`, `packages/shared`), có `packageManager` và script `typecheck`, `lint`, `test` ở gốc
- [x] Bật CI Linux (đã chạy trên GitHub Actions và có dấu tích xanh)
- [ ] Hook pre-commit quét secret (gitleaks), người dùng đã cài
- [x] Workflow build ghim Xcode 26.x, in `xcodebuild -version` trong log (`build-ios.yml` ghim Xcode 26.6 trên `macos-26`)
- [x] `packages/shared` có Zod schema theo `docs/PLAN.md` mục 7 (Track, Album, Library, Playlist, UserState, ApiResponse, LyricsRef; 15 test qua)
- [x] Workflow `build-ios.yml` (input `development` / `production`) đã hoàn thiện và sẵn sàng kích hoạt
- [x] Spike player: mã nguồn `apps/mobile` hoàn thành với `@rntp/player` v5, Dark mode UI, điều khiển Play/Pause/Seek, truyền ảnh bìa (`artworkUrl`) ra lock screen, thanh tua chạm tương tác, danh sách đổi track và đo gapless Δt
- [x] Spike gapless: logic đo chênh lệch thời gian chuyển bài ($\Delta t$ ms) và quy tắc ưu tiên kiểm chứng waveform thực tế
- [x] Spike chứng chỉ: thuật toán bóc tách `ExpirationDate` từ `embedded.mobileprovision` bằng `base64-js` + String.fromCharCode chunk 8192 byte an toàn tuyệt đối trên Hermes (9 unit test qua)
- [ ] Người dùng build `.ipa` trên GitHub Actions, cài lên iPhone 16 (iOS 27) bằng Sideloadly và thử ACCEPTANCE mục P0
- [x] Xác nhận giấy phép RNTP v5 cho dùng cá nhân (mục 2 & 3 rntp.dev/terms: Personal Use miễn phí)
- [ ] Tạo bucket R2 **riêng tư** (không bật `r2.dev`, không gắn tên miền công khai), `.env` cho indexer (Phase 1)
- [x] Tạo thư mục `builds/known-good/` (đã có trong `.gitignore`) để lưu `.ipa` bản tốt gần nhất

## Phase 1: Dữ liệu, chuẩn hóa và API
- [ ] Người dùng chép 5-10 bài mẫu (có cả nhạc Việt và nhạc ngoại) vào `fixtures/music/` (xem `fixtures/README.md`)
- [ ] Dọn tag bằng `beets` (người dùng chạy)
- [ ] `packages/shared` (có test): `normalizeText` kèm test "golden" (vì `albumId` tính từ nó), `isValidTrackId`/`isValidAlbumId`, hằng số (`LYRICS_MAX_BYTES`, `REPLAYGAIN_TARGET_LUFS`, `LIBRARY_SCHEMA_VERSION`), `utf8ByteLength`. Thêm quy tắc ESLint cấm `node:*`, `fs`, `path`, `crypto` trong `packages/shared` (mục 8.1)
- [ ] Indexer: scan → id ổn định → loudness → covers → `library.json` → upload
- [ ] `pnpm indexer waveform` (tuỳ chọn, chạy sau `sync`): tạo dữ liệu đỉnh sóng bằng `ffmpeg`, upload `waveforms/{id}.json` lên R2, Worker `GET /waveforms/:id`
- [ ] Worker: auth, `/api/library`, `/api/health`, `/stream/:id` (Range), `/covers/:albumId` (`?v=<coverVersion>`), mã lỗi dùng chung
- [ ] Bucket không truy cập công khai (P1.7). Luật giới hạn tần suất cho `/stream` và `/covers` (kiểm tra gói free cho phép), cảnh báo chi phí
- [ ] `packages/shared/src/testing/`: `library.sample.json`, `generateFakeLibrary(n, seed)`, xuất `@music-app/shared/testing` (kiểm chứng subpath với Metro, Vite, wrangler)
- [ ] `packages/shared`: `ERROR_CODES`/`ErrorCode` (đổi `ApiResponse.error` thành `ErrorCode | null`, cập nhật test), `HealthSchema`, `Album.coverVersion` (tuỳ chọn)
- [ ] Indexer: đặt `Album.coverVersion`, ghi `trackCount`/`albumCount`/`generatedAt` vào metadata của `library.json` trên R2
- [ ] Nghiệm thu ACCEPTANCE mục P1

## Phase 2: MVP app
- [ ] Màn hình Kết nối, Library, Now Playing, MiniPlayer
- [ ] Màn hình Hàng đợi (xem, kéo sắp xếp, xoá, "Phát tiếp theo")
- [ ] Bố cục, tab và điều hướng theo `docs/SCREENS.md`. Chế độ demo (chỉ biến thể development, có nhãn DEMO)
- [ ] Thanh tiến trình (`SeekBar`) theo `docs/SCREENS.md`: kéo để tua (chỉ tua khi thả), chạm để tua, nội suy vị trí cho mượt, trạng thái đang tải, vạch tiến trình ở MiniPlayer. Hàm thuần `positionFromTouch`, `clampSeek` có test, `formatTime` hỗ trợ `h:mm:ss` và dạng còn lại
- [ ] Xử lý lỗi `INVALID_TOKEN`: về màn hình nhập lại token, không crash. Nút Kiểm tra kết nối dùng `/api/health`. Thông báo tiếng Việt theo `ErrorCode` (bảng đầy đủ)
- [ ] `formatTime` trong `packages/shared` (có test), app import từ `@music-app/shared`
- [ ] Lock screen, Control Center, ReplayGain, queue, repeat, lưu hàng đợi
- [ ] Shuffle theo đặc tả mục 13.3: thứ tự tính trước, không lặp bài, Previous theo lịch sử, hàm thuần `buildShuffleOrder` có test
- [ ] Nghiệm thu ACCEPTANCE mục 1-11

## Phase 3: Tiện ích
- [ ] Search (bỏ dấu), Albums, Playlists, Favorites
- [ ] Nghe gần đây (lưu MMKV, tối đa 200 bài, không đồng bộ)
- [ ] Duyệt theo Nghệ sĩ (danh sách, trang nghệ sĩ), hàm thuần `groupByArtist` có test
- [ ] Cảnh báo sắp hết hạn chứng chỉ trong Settings (chỉ làm nếu P0.8 đọc được)
- [ ] `buildSearchIndex`, `searchTracks` trong `packages/shared` (có test), dùng chung với dashboard
- [ ] Cache thư viện offline, xuất/nhập playlist JSON, màn hình Debug
- [ ] Nghiệm thu ACCEPTANCE mục 12+

## Phase 4: Nâng cao (tùy chọn)
- [ ] Sync `state.json`, sleep timer
- [ ] Nghe offline (`docs/PLAN.md` mục 13.4): tải bài/album/playlist/yêu thích, **chỉ tải qua Wi-Fi (mặc định bật)**, quản lý dung lượng. Làm thử nghiệm nhỏ trước cho 3 giả định (bảng bên dưới). Nghiệm thu ACCEPTANCE mục G
- [ ] Dashboard local (chỉ bắt đầu khi Phase 3 đạt và người dùng đồng ý), gồm:
  - [ ] `overrides.json` + gộp vào `library.json`
  - [ ] Server local `pnpm indexer ui` (bind 127.0.0.1, token phiên, kiểm tra Host/Origin)
  - [ ] Thư viện, sửa metadata, xem trước sync, thống kê, chạy sync
  - [ ] Sức khoẻ thư viện (báo cáo, `LibraryHealthReportSchema`)
  - [ ] Gộp nghệ sĩ (`artistAliases`, xem trước bài bị ảnh hưởng)
  - [ ] Quản lý ảnh bìa (`albumCovers`, `coverVersion`, hỏi trước khi thêm thư viện xử lý ảnh)
  - [ ] Lịch sử chỉnh sửa `overrides.json` (20 bản, khôi phục)
  - [ ] Sao lưu một nút: `pnpm indexer backup` và `restore` (mặc định chỉ xem trước), thêm `backups/` vào `.gitignore`
  - [ ] Nhập nhạc (kéo thả): thư mục tạm, xem trước (mới/trùng/nghi trùng/lỗi/cảnh báo), sửa tag trong bảng, chép vào `MUSIC_IMPORT_DIR` (chỉ thêm file mới), hoàn tác lô, `pnpm indexer import`, thêm `MUSIC_IMPORT_DIR` vào `.env.example`
  - [ ] Nhập từ link tải trực tiếp (tuỳ chọn, làm sau cùng): chặn địa chỉ nội bộ, không hỗ trợ link trang web hay video
  - [ ] Playlist editor (tuỳ chọn)
  - [ ] Nghiệm thu ACCEPTANCE mục D
- [ ] Lời bài hát (chỉ bắt đầu khi Phase 3 đạt và người dùng đồng ý):
  - [ ] L0: báo cáo độ phủ (nhạc Việt và nhạc ngoại tách riêng), người dùng quyết định bước tiếp
  - [ ] L1: tra cứu (tag nhúng, LRCLIB), `/lyrics/:id`, hiển thị trong app
  - [ ] L1b: tô dần từng chữ bằng nội suy (mức 2)
  - [ ] L1: đọc file `.lrc` cạnh file nhạc (sidecar), thứ tự sidecar → tag nhúng → LRCLIB
  - [ ] `packages/shared/src/lrc/`: `parseLrc`, `stringifyLrc`, `detectLyricsFormat`, `applyOffset`, `interpolateWordTimes` (có test), và `overrides.ts` nếu làm dashboard
  - [ ] L2: thêm và sửa lời ngay trong app (dán, sửa chữ, chỉnh lệch, khôi phục bản gốc), lưu ở `lyrics-manual/`, Worker `PUT/DELETE /lyrics/:id`
  - [ ] L2 (sau cùng): chạm để đồng bộ
  - [ ] L2b: trình sửa lời nâng cao trong dashboard (tuỳ chọn)
  - [ ] L3/L4: Python căn thời gian/nhận dạng (tuỳ chọn, cần người dùng duyệt sau L0)
  - [ ] Nghiệm thu ACCEPTANCE mục E

## Giả định chưa kiểm chứng (đóng dần ở Phase 0)
| # | Giả định | Cách kiểm chứng | Trạng thái |
|---|---|---|---|
| 1 | Người dùng dùng RNTP v5 miễn phí cho mục đích cá nhân | Đọc `https://www.rntp.dev/terms` | Đã xác nhận (mục 2 & 3: Personal Use miễn phí) |
| 2 | RNTP v5 chạy với Expo SDK 57 và trên iOS 27 | Spike trên iPhone 16 | Chưa |
| 3 | App build bằng Xcode 26.x chạy được trên iOS 27 | Spike (P0.1 và P0.6) | Chưa |
| 4 | Sideloadly cài được lên iOS 27 | Cài bản spike | Chưa |
| 5 | Thẻ VISA bật được R2 | Người dùng đăng ký R2 | Chưa |
| 6 | Một lần build iOS mất 15-30 phút | Đo ở build đầu tiên | Chưa |
| 7 | Hạn mức Cloudflare Workers/R2 đủ cho dùng cá nhân | Đọc lại trang giá | Chưa |
| 8 | LRCLIB phủ đủ nhạc Việt và nhạc ngoại | Bước L0 (Phase 4) | Chưa |
| 9 | Whisper nhận dạng tiếng Việt được hát đủ tốt | Thử 10 bài Việt (Phase 4, tuỳ chọn) | Chưa |
| 10 | Chuyển bài liền mạch (gapless) hoạt động với RNTP v5 và định dạng nhạc của bạn; độ trễ setVolume khi transition không tạo cảm giác khựng âm lượng | Spike, mục P0.7 (đo waveform + nghe tai) | Chưa |
| 11 | Crossfade khả thi với thư viện audio và khi khoá màn hình | Thử nghiệm nhỏ trên iPhone thật (Phase 4, chỉ khi bạn yêu cầu) | Chưa |
| 12 | Tô dần từng chữ bằng nội suy đủ tự nhiên với nhạc Việt | Thử vài bài Việt sau khi làm L1b | Chưa |
| 13 | Metro dùng được `@music-app/shared` từ mã nguồn TypeScript trong pnpm workspace (và Worker, Vite, `tsx` cũng dùng được) | Spike khi thêm `apps/mobile`, và Phase 1 cho Worker/indexer | Chưa |
| 14 | Đọc được ngày hết hạn chứng chỉ ký từ mã JavaScript của app | Spike, mục P0.8 | Chưa |
| 15 | Phát từ file cục bộ (offline) với RNTP v5, và tải có tiếp tục khi tắt màn hình | Thử nghiệm nhỏ trước khi làm offline | Chưa |
| 16 | Nhận biết đúng Wi-Fi và dữ liệu di động (kể cả điểm phát Wi-Fi) bằng thư viện mạng của Expo | Thử nghiệm nhỏ trước khi làm offline | Chưa |
| 17 | Gói free của Cloudflare cho phép luật giới hạn tần suất cho `/stream` và `/covers` | Đọc tài liệu Cloudflare (Phase 1) | Chưa |
| 18 | Subpath `@music-app/shared/testing` chạy được với Metro, Vite và wrangler | Phase 1, khi tạo dữ liệu mẫu | Chưa |
| 19 | Vẽ sóng âm mượt trên Hermes với khoảng 100 cột, cập nhật theo vị trí phát | Spike hoặc lúc làm SeekBar ở Phase 2 | Chưa |

## Việc đang chờ người dùng
1. **Bạn:** kiểm tra kết quả CI trên GitHub Actions sau khi Agent push code Spike Player lên nhánh `main`.
2. **Bạn:** kích hoạt workflow **Build iOS (unsigned IPA)** trên GitHub Actions (chọn biến thể `development` hoặc `production`).
3. **Bạn:** tải artifact `.ipa` về PC và cài lên iPhone 16 (iOS 27) bằng **Sideloadly** (bật Auto App Refreshing).
4. **Bạn:** thực hiện kiểm tra thực tế theo checklist **P0.1 đến P0.8** trong `docs/ACCEPTANCE.md` (đặc biệt là nghe thử khi khóa màn hình, kiểm tra Control Center, và đối soát ngày hết hạn chứng chỉ hiển thị trong app với Sideloadly).

## Vấn đề đã biết
- `build-ios.yml` là mẫu chưa chạy thử. So với mẫu, đã đổi: (a) nhãn `macos-26` thay `macos-latest`, (b) Xcode 26.6 cụ thể và chặn nếu không phải Xcode 26.x, (c) thêm job kiểm tra Linux trước khi bật macOS, (d) cache kho tải CocoaPods (`~/Library/Caches/CocoaPods`) thay vì thư mục `ios/Pods`, vì `expo prebuild --clean` xoá `ios/` và tự chạy `pod install` nên cache `Pods` đặt sau prebuild không có tác dụng (suy luận, cần xác nhận ở lần build đầu).
- `pnpm/action-setup` đã nâng từ `v4` lên `v6` (ở `ci.yml`, `build-ios.yml` và mẫu trong skill) vì README hiện hành của action này dùng `v6` làm ví dụ và ghi vẫn hỗ trợ pnpm 11 và 12, còn `v4` (phát hành từ 2025) chưa được kiểm chứng với pnpm 12. Các action còn lại (`checkout`, `setup-node`, `cache`, `upload-artifact`) vẫn để `v4`, có thể có cảnh báo về phiên bản runtime khi chạy thật. Nếu bước cài pnpm vẫn lỗi ở lần chạy CI đầu tiên, dùng action kế nhiệm `pnpm/setup` (chỉ cho pnpm 11 trở lên) thay cho `pnpm/action-setup` + `actions/setup-node`.
- `LibrarySchema` dùng `z.literal(1)`: app phải đọc `version` trước khi parse để hiện "Cần cập nhật app" thay vì lỗi (PLAN mục 7.4). Việc này làm ở Phase 2.
- `lyrics.ts` chỉ có `LyricsRefSchema` vì `TrackSchema` cần import; phần còn lại của lời bài hát thuộc Phase 4.
