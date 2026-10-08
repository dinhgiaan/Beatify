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

## Phase 1: Dữ liệu, chuẩn hóa, API & Web Dashboard
- [x] `packages/shared` (có test): `normalizeText`, `isValidTrackId`/`isValidAlbumId`, hằng số (`LYRICS_MAX_BYTES`, `REPLAYGAIN_TARGET_LUFS`, `LIBRARY_SCHEMA_VERSION`), `utf8ByteLength`, `ERROR_CODES`, `HealthSchema` (21 unit test qua)
- [x] Worker (`apps/api`): auth constant-time, `/api/library` (ETag), `/api/health` (head meta), `/stream/:id` (HTTP Range 206), `/covers/:albumId`, mã lỗi dùng chung (11 unit test qua)
- [x] Indexer (`tools/indexer`): scan → id sha1 ổn định → đọc tag `music-metadata` → cover album → `library.json` → upload R2 S3 SDK
- [x] Web Dashboard local (`tools/indexer/src/server`): server local Hono bind `127.0.0.1:4000`, giao diện Admin Console Dark Mode, kéo thả file nhạc kèm ảnh bìa hoặc chọn ảnh bìa chung/riêng ngay khi nhập, sửa metadata & ảnh bìa (`covers` - tự động dọn xoá ảnh cũ khi đổi hoặc gỡ), nhập/sửa lời bài hát (`lyrics` / `.lrc`), công cụ thao tác hàng loạt (Batch apply Ca sĩ/Album/Ảnh bìa chung), gợi ý autocomplete Ca sĩ/Album (datalist), xem trước & xác nhận nhập nhạc (Import Preview với ảnh bìa), Thùng rác lưu trữ 14 ngày (khôi phục/xoá vĩnh viễn), xác nhận xoá an toàn, nút chọn thư mục trực quan (Native Windows Folder Picker) cho từng path, nút đồng bộ lên Cloudflare R2
- [x] Tính năng Chỉnh sửa & Xóa bài hát trên Mobile và đồng bộ 2 chiều Cloudflare R2:
  - `packages/shared`: `UpdateTrackSchema`, hàm thuần `applyTrackUpdate`, `applyTrackDeletion` (25 unit test qua)
  - `apps/api`: `PATCH /api/tracks/:id` (sửa metadata & lyrics), `DELETE /api/tracks/:id` (đưa vào thùng rác trên R2), `GET/PUT /api/overrides` (đồng bộ 2 chiều với PC) (18 unit test qua)
  - `apps/mobile`: `EditTrackModal` (giao diện dark mode, form validation, dialog xác nhận xoá an toàn), `MusicApiClient` (kết nối Worker), Optimistic UI updates tức thì khi Sửa/Xóa, nút Sửa bài hát trong danh sách và Now Playing (13 unit test qua)
  - `tools/indexer`: `mergeRemoteOverrides` tự động hợp nhất các thay đổi từ R2/mobile vào PC
  - Sửa lỗi Thùng rác: khi "Hủy vĩnh viễn", đánh dấu `purged: true` để bài hát không bao giờ bị scanner quét lại vào danh sách, đồng thời biến mất khỏi thùng rác.
  - Đánh số thứ tự (STT index từ 1) đồng bộ cho tất cả bảng bài hát trên Web Dashboard và App Mobile.
  - Tinh chỉnh UI/UX màn hình phát nhạc trên Mobile: thay nút tua 5s bằng biểu tượng vòng cung `↺ 5` / `5 ↻`, nút chuyển bài tối giản chỉ dùng biểu tượng `⏮` / `⏭` (bỏ chữ Prev/Next), nút Lặp lại chuyển xuống dưới dùng tiếng Việt (`🔁 Lặp danh sách` / `🔂 Lặp 1 bài`), chuyển nút Chỉnh sửa bài hát thành biểu tượng cây bút `✎` mờ nhạt kín đáo ở góc phải.
  - Sửa lỗi tính dung lượng: dung lượng thư viện được tính chính xác theo các bài hát đang hoạt động (loại bỏ bài trong thùng rác / đã hủy vĩnh viễn), khắc phục hiện tượng 0 bài nhưng vẫn báo 5.4 MB.
  - Web Console: Bổ sung thanh nghe thử nhạc (Audio Preview Dock) ở chân trang, cho phép click vào bất kỳ dòng bài hát gần đây để phát tức thì; bổ sung Modal tiến trình đồng bộ R2 thời gian thực (Real-time Progress Bar) hiển thị rõ `%` và tên bài hát đang tải lên.
  - Sửa lỗi Nhập nhạc: tự động gỡ bỏ cờ `purged` và `hidden` khi người dùng nhập lại bài hát từng bị xóa trước đó, đảm bảo bài hát hiển thị ngay lập tức trong thư viện.
  - Hiển thị trạng thái đồng bộ Cloud R2 thời gian thực trên Web Console: cột `Cloud R2` cho từng bài hát (`● Đã lên R2` / `○ Chưa đồng bộ`), nhãn file lưu trữ R2 (`☁️ R2: <hash>.<ext>`) ngay dưới tên bài hát, và tỉ lệ đồng bộ trong thẻ Tổng quan R2.
  - Tính năng Dọn dẹp file thừa trên Cloudflare R2 (Prune Orphan Files): tự động quét so sánh và hiển thị danh sách các file mồ côi trên đám mây kèm dung lượng, cho phép người dùng bấm xác nhận để xóa sạch vĩnh viễn trên R2 mà không mất nhạc ngoài ý muốn. Đã dọn dẹp xóa sạch `music/4e116ee95e65.mp3` và cập nhật `library.json` trên R2 theo xác nhận của người dùng.
  - Nâng cấp UI/UX Web Console toàn diện (Batch Operations, Filter Pills, Sortable Columns, Enhanced Audio Dock):
    - Bộ lọc nhanh (Quick Filter Pills): "Tất cả", "Chưa lên R2", "Chưa có bìa" kèm số lượng bài cập nhật thời gian thực.
    - Sắp xếp cột linh hoạt (Sortable Columns): Bấm vào tiêu đề cột (Tên bài, Ca sĩ, Album, Dung lượng, Thời lượng) để đảo chiều tăng/giảm với ký hiệu mũi tên trực quan.
    - Thanh tác vụ hàng loạt (Floating Batch Bar): Hỗ trợ checkbox từng dòng hoặc chọn tất cả, thanh công cụ trôi nổi hiển thị số bài đang chọn và các thao tác: Đổi Ca sĩ hàng loạt, Đổi Album hàng loạt, Đổi Ảnh bìa hàng loạt, Chuyển vào Thùng rác hàng loạt.
    - Thanh phát nhạc chân trang nâng cao (Audio Dock): Bổ sung nút chuyển bài trước `⏮`, chuyển bài tiếp `⏭`, công tắc tự động chuyển bài `🔁 Tiếp: BẬT/Tắt`, và bộ phím tắt bàn phím tiện lợi (`Space` để Phát/Dừng, `←`/`→` tua 5s, `Shift+←`/`Shift+→` đổi bài).
    - Toàn bộ kịch bản kiểm tra tự động chạy thành công 100%, 57 unit tests passed, lint và typecheck sạch 100%.
- [x] Người dùng cấu hình thông tin R2 vào `tools/indexer/.env` và máy chủ tự động nhận diện thành công
- [x] Khắc phục triệt để hiển thị ảnh bìa tùy chỉnh (tự động tính lại `albumId` khi ghi đè ca sĩ/album và nạp `custom_covers/`); bổ sung Modal xác nhận Xóa vĩnh viễn với tùy chọn rõ ràng (không dùng confirm trình duyệt) và cơ chế dọn dẹp an toàn.
- [x] Nâng cấp trải nghiệm Mobile Delight (Profile, Beatify Replay Stats, Smart Shuffle, Mystery Queue):
  - `packages/shared`: Thuật toán `smartShuffle` phân bổ tối ưu nghệ sĩ tránh trùng lặp; module `stats` tính toán Beatify Replay (Tuần, Tháng, Năm, 6 huy hiệu kỷ niệm âm nhạc bao gồm Cú đêm 0h-5h sáng); 43 unit tests qua 100%.
  - `apps/mobile`:
    - **Hồ sơ cá nhân & Thống kê Replay (ProfileModal)**: Tùy chỉnh tên người dùng, chọn biểu tượng đại diện vector SVG (tai nghe, đĩa than, nốt nhạc, trái tim, ngọn lửa, ngôi sao, cúp, mặt trăng), tab xem lại số phút nghe/lượt nghe/top bài hát/top nghệ sĩ theo Tuần này, Tháng này, Năm 2026, các cột mốc kỷ niệm kèm SVG badge.
    - **Smart Shuffle (Trộn bài thông minh)**: Tự động phân tán bài cùng ca sĩ, ghim bài đang phát ở đầu, khôi phục thứ tự ban đầu khi tắt trộn.
    - **Bí ẩn hàng đợi (Mystery Upcoming Queue)**: Khi bật Smart Shuffle, toàn bộ danh sách các bài hát tiếp theo được giấu tên (`Bài hát bí ẩn` kèm biểu tượng Sparkles/Dấu hỏi chấm SVG tối giản), tạo cảm giác tò mò và bất ngờ như yêu cầu; nút sửa bị khóa cho bài bí ẩn để bảo toàn bí mật.
    - **Chuyển đổi 100% sang Biểu tượng SVG (chuẩn Apple Music & Spotify)**:
      - Loại bỏ hoàn toàn tất cả emoji và icon ký tự Unicode thô khỏi ứng dụng.
      - Tích hợp `react-native-svg` (v15.15.4 ghim chuẩn theo Expo SDK 57).
      - Xây dựng hệ thống SVG Icons tại `src/components/icons/SvgIcons.tsx` (Play, Pause, Next, Prev, Seek ±5s, Shuffle, Repeat, RepeatOne, Profile, Edit, Trash, Close, Disc, Star, Trophy, Moon, Flame, Check, Question).
      - **Cần build lại `.ipa`**: Do thêm thư viện native `react-native-svg`.
    - **Theo dõi lịch sử nghe**: Tự động ghi nhận lượt nghe nếu bài hát phát trên 15 giây lưu vào bộ nhớ cục bộ an toàn `statsStorage`.
    - Phản hồi xúc giác rung nhẹ (`Vibration.vibrate(10)`), hiệu ứng viền phát sáng ambient mờ ảo.
    - **Kiểm tra và vá lỗi phòng thủ (Defensive Coding Audit)**:
      - Tối ưu `formatTime` hỗ trợ giờ:phút:giây (`h:mm:ss`) cho podcast/bài hát dài, xử lý an toàn `NaN`, âm, vô cực.
      - Xử lý đồng bộ `originalTracks` và `tracks`: đảm bảo khi xóa hoặc sửa bài lúc đang bật Smart Shuffle thì khi tắt shuffle không bị hồi sinh bài đã xóa hoặc mất thay đổi.
      - Khắc phục `currentTrackIndex`: tự động lùi vị trí khi xóa bài đứng trước bài đang phát, giữ vững bài đang nghe không bị nhảy sai.
      - Tua nhạc an toàn: khống chế tua trong khoảng `[0, totalDuration]`, không bao giờ tua tràn thời lượng hoặc lùi xuống âm.
      - Bọc `try/catch` an toàn cho các thao tác player (`skipToNext`, `skipToPrevious`, `skipToIndex`, `seekTo`), ngăn chặn hoàn toàn exception khi ở cuối danh sách.
      - Chuẩn hóa URL đồng bộ Cloudflare R2: tự động cắt bỏ khoảng trắng và dấu gạch chéo cuối để tránh lỗi 404.
      - Giới hạn lưu trữ 10.000 bản ghi lịch sử nghe tối đa trong `statsStorage` tránh phình dung lượng.
  - Kiểm thử toàn diện: **89/89 tests passed (100%)** trên toàn bộ monorepo, `pnpm typecheck` và `pnpm lint` sạch 100%.
- [ ] Người dùng kích hoạt GitHub Actions build lại `.ipa` (vì đã thêm `react-native-svg`) và cài lên iPhone
- [ ] Người dùng chạy đồng bộ thư viện nhạc thật lên Cloudflare R2

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
