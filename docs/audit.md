# BÁO CÁO AUDIT TOÀN DIỆN DỰ ÁN BEATIFY
> **Ngày thực hiện:** 07/11/2026  
> **Phạm vi kiểm tra:** Toàn bộ mã nguồn `apps/mobile`, `tools/dashboard`, `tools/indexer`, `apps/api`, `packages/shared`.  
> **Nguyên tắc:** **CHỈ KIỂM TRA & ĐÁNH GIÁ MÃ NGUỒN HIỆN CÓ, TUYỆT ĐỐI CHƯA SỬA CODE.** Mọi nhận định đều bám sát 100% vào code thực tế, có số dòng và đường dẫn file minh chứng cụ thể.

---

## 1. DANH SÁCH TÍNH NĂNG HIỆN CÓ (SUY RA TRỰC TIẾP TỪ CODE)

### 1.1. App iOS (`apps/mobile`)
Tất cả các tính năng dưới đây đều được hiện thực trực tiếp trong `apps/mobile/app/index.tsx` và các component con:

1. **Điều khiển phát nhạc (Player Engine):**
   - Phát/tạm dừng (Play/Pause), chuyển bài kế tiếp (Next), quay lại bài trước (Previous).
   - Tua nhanh/lùi thời gian ±5 giây ([index.tsx#L476-L484](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L476-L484)).
   - Thanh tua bài tương tác (Interactive Seek Bar): Chạm trực tiếp vào vị trí bất kỳ trên thanh tiến trình để nhảy đến mốc thời gian ([index.tsx#L486-L495](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L486-L495)).
   - Chế độ lặp lại (Repeat Mode): Xoay vòng giữa Tắt (`off`), Lặp 1 bài (`track`), Lặp toàn bộ danh sách (`queue`) ([index.tsx#L497-L503](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L497-L503)).
   - Trộn bài thông minh (Smart Shuffle): Thuật toán Fisher-Yates cải tiến kết hợp tính năng **"Bí mật hàng đợi" (Mystery Queue)** — ẩn tên và nghệ sĩ của các bài sắp phát để tạo bất ngờ cho người nghe ([index.tsx#L505-L530](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L505-L530), [index.tsx#L1023-L1033](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L1023-L1033)).
   - Tự động cân bằng âm lượng ReplayGain theo chuẩn EBU R128 qua hàm `gainToVolume()` khi chuyển bài ([rntpPlayerService.ts#L50-L57](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/player/rntpPlayerService.ts#L50-L57)).

2. **Sắp xếp danh sách phát thông minh:**
   - Đan xen ca sĩ (Smart Interleaving): Thuật toán đan xen ca sĩ tự động phân tán các bài cùng nghệ sĩ ([index.tsx#L656-L661](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L656-L661)).
   - Sắp xếp linh hoạt theo Ca sĩ (`artist`) hoặc Tên bài A-Z (`title`) ([index.tsx#L627-L636](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L627-L636)).

3. **Lời bài hát đồng bộ (Synced Lyrics):**
   - Modal hiển thị lời bài hát (.lrc hoặc .txt) đồng bộ thời gian thực ([LyricsModal.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/LyricsModal.tsx)).
   - Tìm kiếm dòng lời đang phát bằng Binary Search $O(\log N)$ ([LyricsModal.tsx#L76-L80](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/LyricsModal.tsx#L76-L80)).
   - Tự động cuộn mượt mà bám sát tọa độ pixel của từng câu hát ([LyricsModal.tsx#L83-L92](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/LyricsModal.tsx#L83-L92)).
   - Hỗ trợ nhấn vào từng dòng lời để tua nhạc đến đúng thời điểm đó ([LyricsModal.tsx#L125-L135](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/LyricsModal.tsx#L125-L135)).

4. **Quản lý Danh sách phát & Yêu thích (Playlists & Favorites):**
   - Tạo mới, chỉnh sửa, xóa danh sách phát; thêm/bớt bài hát vào playlist ([PlaylistModal.tsx#L90-L130](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/PlaylistModal.tsx#L90-L130)).
   - Đánh dấu yêu thích bài hát với rung phản hồi haptic ([index.tsx#L216-L225](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L216-L225)).
   - Hợp nhất thông minh 2 chiều (Bidirectional Merge) giữa máy iPhone và Cloudflare R2 (`/api/state`), bảo toàn thay đổi từ cả 2 phía ([index.tsx#L169-L180](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L169-L180)).

5. **Chỉnh sửa & Xóa bài hát ngay trên iPhone:**
   - Modal chỉnh sửa metadata (Tên bài, Ca sĩ, Album, Năm phát hành, Lời bài hát) ([EditTrackModal.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/EditTrackModal.tsx)).
   - Cập nhật giao diện tức thì (Optimistic UI) và gửi request đồng bộ lên Cloudflare Worker qua `PATCH /api/tracks/:id` ([index.tsx#L537-L584](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L537-L584)).
   - Chuyển bài hát vào thùng rác trên R2 qua `DELETE /api/tracks/:id` ([index.tsx#L586-L625](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L586-L625)).

6. **Kết nối & Thiết lập nhanh (Zero-Config Connection):**
   - Nhận diện Deep Link (`beatify://connect?api=...&token=...`) khi quét mã QR từ camera iPhone hoặc Dashboard ([index.tsx#L294-L340](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L294-L340)).
   - Lưu trữ vĩnh viễn cấu hình máy chủ vào file JSON nội bộ thiết bị ([index.tsx#L313-L318](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L313-L318)).
   - Hỗ trợ phát trực tiếp URL âm thanh tùy ý bên ngoài ([index.tsx#L430-L451](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L430-L451)).

7. **Hồ sơ & Thống kê Beatify Replay:**
   - Đo đạc thời lượng nghe thực tế và chỉ ghi nhận lượt nghe khi bài phát qua mốc 15 giây ([index.tsx#L378-L408](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L378-L408)).
   - Thống kê nghe nhạc theo Tuần / Tháng / Năm / Kỷ niệm: Tổng số phút, top bài hát, top nghệ sĩ, thời điểm nghe nhiều nhất ([ProfileModal.tsx#L90-L150](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/ProfileModal.tsx#L90-L150)).
   - Hệ thống danh hiệu / thành tựu (Milestones) mở khóa theo số giờ và lượt nghe ([ProfileModal.tsx#L70-L89](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/ProfileModal.tsx#L70-L89)).
   - Cơ chế ghi dữ liệu atomic an toàn chống hỏng file ([statsStorage.ts](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/stats/statsStorage.ts)).

8. **Màn hình & Bảng thông tin Debug hệ thống:**
   - Hiển thị Build SHA ([index.tsx#L1137-L1140](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L1137-L1140)).
   - Tự động bóc tách ngày hết hạn chứng chỉ Sideload 7 ngày từ file `embedded.mobileprovision` ([index.tsx#L256-L287](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L256-L287)).
   - Đo lường độ trễ Gapless $\Delta t$ thực tế giữa hai bài hát ([index.tsx#L1147-L1151](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L1147-L1151)).
   - Giám sát hàng đợi ghi đĩa và trạng thái khôi phục file tạm `.tmp` ([index.tsx#L1153-L1174](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L1153-L1174)).

---

### 1.2. Web Admin (`tools/dashboard` & `tools/indexer`)
Suy ra từ router `tools/dashboard/src/app/App.tsx` và server `tools/indexer/src/server/index.ts`:

1. **Bảng điều khiển (Dashboard - `DashboardPage.tsx`):**
   - Thống kê dung lượng R2 (đã dùng / giới hạn 10GB miễn phí, phần trăm sử dụng).
   - Thống kê dung lượng và số lượng bài hát chưa đồng bộ (chờ tải lên R2).
   - Kiểm tra môi trường hệ thống: `yt-dlp Engine`, `ffmpeg Engine`, `Node.js Runtime`.
   - Kết nối iPhone: Hiển thị modal mã QR tích hợp sẵn API URL và Token để quét nhanh.

2. **Nguồn nhạc YouTube (`YoutubeMusicPage.tsx`, `DownloadedVideosManagerPage.tsx`, `HistoryPage.tsx`):**
   - Tìm kiếm bài hát, album, danh sách phát trên YouTube hoặc dán link video trực tiếp.
   - Tải âm thanh chất lượng cao về máy tính qua `yt-dlp` và `ffmpeg`.
   - Chạy tác vụ nền có báo cáo tiến trình thời gian thực qua Server-Sent Events (`/api/jobs/:id/events`).
   - Tự động đo ReplayGain, bóc tách và nhúng thumbnail thành ảnh bìa.
   - Quản lý các file đã tải: Phát thử âm thanh trực tiếp trên web, xem/sửa lời bài hát, chỉnh sửa metadata thẻ ID3, tải trực tiếp lên Cloudflare R2, chuyển thư mục lưu trữ (Relocate Downloads), xóa file tải.

3. **Kho nhạc - Thư viện (`LibraryPage.tsx`):**
   - Duyệt toàn bộ danh mục bài hát với phân trang (50 / 100 / 200 / Tất cả bài).
   - Tìm kiếm không phân biệt dấu tiếng Việt theo Tên bài, Nghệ sĩ, Album.
   - Lọc bài hát theo định dạng (MP3, FLAC, M4A, AAC...).
   - Đo ReplayGain hàng loạt cho các bài chưa đo qua ffmpeg (`/local-api/tracks/batch-replaygain`).
   - Sửa metadata hàng loạt (Batch Override): Cập nhật Ca sĩ, Album cho nhiều bài cùng lúc.
   - Thay đổi ảnh bìa tùy chỉnh cho từng bài hát hoặc album.
   - Chuyển bài hát vào thùng rác (đơn lẻ hoặc hàng loạt).

4. **Trình phát nhạc tích hợp trên Web (Audio Dock Player - `Layout.tsx`):**
   - Player dock cố định phía dưới màn hình hỗ trợ Play/Pause, Next, Prev, Seek, Mute, Volume Slider.
   - Chế độ lặp lại nâng cao: Lặp vô hạn hoặc lặp chính xác theo số lần người dùng chọn (1 đến $N$ lần).
   - Màn hình Lời bài hát mở rộng toàn trang: Hiển thị lời LRC chạy theo nhạc với hiệu ứng mờ dòng và tự động cuộn (Spotify-style).
   - Thẻ thông tin nghệ sĩ khi di chuột (Artist Hover Card).

5. **Quản lý Nghệ sĩ (`ArtistsPage.tsx`):**
   - Danh sách nghệ sĩ được tổng hợp tự động từ kho nhạc.
   - Gộp nghệ sĩ (Merge Artists): Tạo bí danh alias trong `overrides.json` để đồng nhất tên nghệ sĩ viết sai chính tả.
   - Tải ảnh đại diện nghệ sĩ (từ file cục bộ hoặc tự động lấy từ YouTube Channel).
   - Áp dụng metadata ảnh bìa vào file ảnh `.jpg` của nghệ sĩ.
   - Mở trực tiếp thư mục của nghệ sĩ trên Windows Explorer qua lệnh hệ thống.

6. **Quản lý Danh sách phát trên Web (`PlaylistsPage.tsx`):**
   - Xem, tạo, sửa, xóa các Playlist.
   - Xem danh sách bài hát yêu thích (Favorites).
   - Đồng bộ 2 chiều dữ liệu trạng thái với Cloudflare R2 qua `/local-api/state`.

7. **Thùng rác (`TrashPage.tsx`):**
   - Xem các bài hát đã bị ẩn/xóa.
   - Khôi phục bài hát về thư viện (đơn lẻ hoặc hàng loạt).
   - Xóa vĩnh viễn (Purge): Đánh dấu loại bỏ vĩnh viễn khỏi thư viện.

8. **Trình khám phá thư mục Windows (File System Explorer):**
   - Khám phá cây thư mục của máy tính từ Web UI (`/local-api/fs/explore`).
   - Duyệt các ổ đĩa trên Windows (`C:\`, `D:\`, `E:\`...).
   - Tạo thư mục mới (`/local-api/fs/mkdir`), đổi tên thư mục (`/local-api/fs/rename`), xóa thư mục (`/local-api/fs/delete`).

9. **Đồng bộ Cloudflare R2 (`SyncModal.tsx`):**
   - Quét sự sai khác giữa kho nhạc máy tính và Cloudflare R2.
   - Kiểm tra các file mồ côi (Orphan tracks/covers) trên R2 (`/local-api/r2/orphans`).
   - Tải lên bài hát, ảnh bìa, file `library.json`, `overrides.json` lên R2 có thanh tiến trình.
   - Xóa các file mồ côi khỏi R2 (`/local-api/r2/prune`).

---

## 2. KIẾN TRÚC HỆ THỐNG

### 2.1. Cách phát nhạc (AVPlayer / AVAudioEngine)
- **App iOS (`apps/mobile`):**
  - Dự án sử dụng thư viện `@rntp/player` phiên bản `5.9.2` ([package.json#L13](file:///d:/apps%20on%20phone/Beatify/apps/mobile/package.json#L13)).
  - Trong iOS, `@rntp/player` được xây dựng hoàn toàn dựa trên **`AVQueuePlayer` và `AVPlayer`** của Apple AVFoundation framework.
  - **Không sử dụng `AVAudioEngine`**: Dự án không dùng các node xử lý âm thanh cấp thấp (`AVAudioPlayerNode`, `AVAudioUnitTimePitch`, `AVAudioMixerNode`). Mọi tác vụ phát, dừng, nhảy bài, tua vị trí đều điều khiển gián tiếp qua `TrackPlayer.play()`, `TrackPlayer.pause()`, `TrackPlayer.seekTo()`, `TrackPlayer.setMediaItems()`.
  - ReplayGain được áp dụng bằng cách gọi hàm `TrackPlayer.setVolume(volume)` trong sự kiện `MediaItemTransition` ([rntpPlayerService.ts#L55](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/player/rntpPlayerService.ts#L55)).

- **Web Admin (`tools/dashboard`):**
  - Sử dụng đối tượng chuẩn của trình duyệt: `HTMLAudioElement` (`<audio ref={audioRef} />`) trong `Layout.tsx`.

### 2.2. Cơ chế Cache và Nghe Offline
- **Nghe Offline trên App iOS:** **CHƯA CÓ (CHƯA TRIỂN KHAI)**.
  - Mã nguồn trong `apps/mobile/src/services/player/rntpPlayerService.ts` (dòng 82) gán trực tiếp URL luồng từ xa (`url: track.file`).
  - Trong `apps/mobile` không hề có bất kỳ tiến trình tải xuống âm thanh (Audio Downloader) hay bộ đệm file nhạc cục bộ nào.
  - Thư viện `expo-file-system` chỉ được dùng để lưu các file JSON dữ liệu nhỏ:
    - Cấu hình server: `beatify_server_config.json` ([index.tsx#L117](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L117)).
    - Trạng thái playlist & favorites: `beatify_user_state.json` ([index.tsx#L118](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L118)).
    - Lịch sử nghe nhạc Replay: `beatify_listening_stats.json` ([statsStorage.ts#L11](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/stats/statsStorage.ts#L11)).
- **Cache trên Web Admin & Local Server:**
  - `tools/indexer/src/server/index.ts` duy trì các biến in-memory:
    - `cachedScannedTracks`: Mảng chứa toàn bộ bài hát đã quét ([index.ts#L50](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L50)).
    - `cachedCovers`: `Map<string, Buffer>` lưu buffer ảnh bìa JPEG trong RAM ([index.ts#L51](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L51)).
    - `cachedR2TrackKeys` & `cachedR2CoverKeys`: Cache danh sách key trên R2 với TTL 30-60 giây ([index.ts#L53-L63](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L53-L63)).
    - `cachedStatusResponse`: Cache phản hồi trạng thái với TTL 25 giây ([index.ts#L95-L98](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L95-L98)).

### 2.3. Giao tiếp API giữa App, Web và Backend Cloudflare Worker
Hệ thống bao gồm 2 server độc lập:

1. **Cloudflare Worker Backend (`apps/api`):**
   - Chạy trên nền tảng Hono, phục vụ App iOS và đồng bộ từ xa với Cloudflare R2:
     - `GET /api/library`: Trả về toàn bộ danh mục bài hát và album từ `library.json` (có hỗ trợ ETag / 304 Not Modified).
     - `GET, HEAD /stream/:id`: Stream file âm thanh từ R2, hỗ trợ đầy đủ HTTP Range (206 Partial Content / 416 Range Not Satisfiable).
     - `GET /covers/:albumId`: Trả về file ảnh bìa JPEG của album (Cache-Control: 1 năm nếu có `?v=`, 1 giờ nếu không có).
     - `GET, HEAD /lyrics/:id`: Trả về nội dung lời bài hát (.lrc hoặc .txt), ưu tiên `lyrics-manual/` trước rồi đến `lyrics/`.
     - `PATCH /api/tracks/:id`: Cập nhật metadata và lời bài hát, đồng thời cập nhật `library.json` và `_meta/overrides.json` trên R2.
     - `DELETE /api/tracks/:id`: Xóa bài hát khỏi `library.json`, đánh dấu `hidden: true` trong `_meta/overrides.json`.
     - `GET, PUT /api/overrides`: Đồng bộ file `_meta/overrides.json`.
     - `GET, PUT /api/state`: Lưu và hợp nhất danh sách phát / yêu thích (`user_state.json`).

2. **Local Studio Server (`tools/indexer`):**
   - Chạy local trên PC người dùng tại `http://127.0.0.1:4000`, phục vụ web admin:
     - Các endpoint `/local-api/*`: Quản lý kho nhạc, quét file, sửa tag, ReplayGain, Import, Trash, đồng bộ R2.
     - Các endpoint `/api/youtube-music/*`: Tìm kiếm, tải video qua yt-dlp, quản lý file đã tải, phát SSE sự kiện.

### 2.4. Cơ chế Xác thực (Authentication)
- **Cloudflare Worker Backend (`apps/api`):**
  - Sử dụng Token bí mật đối xứng (`API_TOKEN` từ Cloudflare Worker Secrets).
  - Middleware xác thực chạy ở tất cả các route ([index.ts#L23-L50](file:///d:/apps%20on%20phone/Beatify/apps/api/src/index.ts#L23-L50)).
  - Chấp nhận token qua:
    - Header `Authorization: Bearer <token>` (dùng cho các API REST).
    - Query parameter `?t=<token>` (dùng cho stream âm thanh và tải ảnh bìa/lời bài hát từ thẻ `<audio>` hoặc thư viện native không set được header).
  - Xác thực an toàn bằng hàm so sánh hằng thời gian `timingSafeEqual()` chống Timing Attack ([auth.ts#L5-L26](file:///d:/apps%20on%20phone/Beatify/apps/api/src/utils/auth.ts#L5-L26)).
- **Web Admin / Local Server (`tools/indexer`):**
  - **HOÀN TOÀN KHÔNG CÓ XÁC THỰC:** Server chạy không yêu cầu bất kỳ token, cookie hay session nào; cấu hình CORS mở tự do `app.use('*', cors())` ([index.ts#L151](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L151)).

---

## 3. KIỂM TRA APP IOS THEO CHECKLIST

| Tiêu chí | Trạng thái trong code | Đánh giá chi tiết & Vị trí code |
|---|---|---|
| **Background audio** | **ĐẠT** | Khai báo `ios.infoPlist.UIBackgroundModes = ['audio']` trong [app.config.ts#L17](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app.config.ts#L17). Cho phép iOS tiếp tục phát âm thanh khi màn hình tắt hoặc chuyển app. |
| **Now Playing info** | **ĐẠT** | Trong [rntpPlayerService.ts#L80-L90](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/player/rntpPlayerService.ts#L80-L90), hàm `playQueue` truyền đầy đủ `title`, `artist`, `albumTitle`, `duration`, `artworkUrl` vào `TrackPlayer.setMediaItems()`. RNTP tự động map thông tin này sang `MPNowPlayingInfoCenter` trên iOS. |
| **Remote Command (Lock Screen / Tai nghe)** | **ĐẠT** | Cấu hình tại [rntpPlayerService.ts#L32-L40](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/player/rntpPlayerService.ts#L32-L40) với `PlayPause`, `Next`, `Previous`, `Seek` và `handling: 'native'`. Các nút điều khiển trên Lock Screen, Control Center và nút bấm tai nghe hoạt động chuẩn xác. |
| **Xử lý rút tai nghe (Becoming Noisy)** | **ĐẠT** | Cấu hình `handleAudioBecomingNoisy: true` tại [rntpPlayerService.ts#L28](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/player/rntpPlayerService.ts#L28). Khi rút tai nghe hoặc ngắt kết nối Bluetooth, iOS tự động tạm dừng phát nhạc, tránh phát tiếng ra loa ngoài. |
| **Xử lý cuộc gọi đến (Interruption)** | **MỨC CƠ BẢN** | Cuộc gọi đến được quản lý bởi cơ chế mặc định của `AVAudioSessionCategoryPlayback` trong RNTP (tạm dừng khi chuông reo). Tuy nhiên, trong code JS **chưa đăng ký listener `Event.PlaybackInterruption`** để cập nhật trạng thái UI hoặc xử lý resume thông minh sau khi kết thúc cuộc gọi. |
| **AirPlay Route Picker** | **CHƯA CÓ TRONG APP** | Trong giao diện app ([index.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx)) **không có nút chọn thiết bị AirPlay** (`AVRoutePickerView` hoặc `MPVolumeView`). Người dùng chỉ có thể chuyển AirPlay thủ công thông qua Control Center của iOS. |
| **Gapless Playback** | **CHƯA HOÀN THIỆN** | RNTP dùng `AVQueuePlayer` nên có khả năng phát bài kế tiếp. Tuy nhiên, code hiện tại chỉ dừng ở mức **đo lường độ trễ $\Delta t$** bằng đồng hồ thời gian thực (`now - this.lastTrackEndTime`) ([rntpPlayerService.ts#L43-L49](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/player/rntpPlayerService.ts#L43-L49)), chưa can thiệp buffer chuẩn sample-accurate gapless. |
| **Crossfade** | **CHƯA CÓ** | Không có cơ chế Crossfade (trộn mờ chuyển bài). Để làm crossfade chuẩn trên iOS cần 2 player độc lập hoặc `AVAudioEngine` trộn âm lượng 2 luồng. |
| **Bộ nhớ đệm (Buffering)** | **TỐI THIỂU** | Lấy được `progress.buffered` từ RNTP ([rntpPlayerService.ts#L201](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/player/rntpPlayerService.ts#L201)) và hiện icon loading khi `isBuffering === true` ([index.tsx#L783](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L783)). Không có thanh hiển thị tiến trình đã đệm (buffered bar) trên Seekbar và không cho phép cấu hình dung lượng bộ đệm. |
| **Nghe Offline** | **CHƯA CÓ** | Toàn bộ các bài hát đều phát trực tuyến từ URL ([rntpPlayerService.ts#L82](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/player/rntpPlayerService.ts#L82)). Chưa có cơ chế tải file âm thanh về bộ nhớ trong của iPhone. |
| **Accessibility (VoiceOver)** | **CHƯA ĐẠT** | Toàn bộ các nút bấm chính (`TouchableOpacity` trong [index.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx)) đều **thiếu thuộc tính `accessible={true}`**, `accessibilityLabel`, `accessibilityHint` và `accessibilityRole`. Trình đọc màn hình VoiceOver sẽ chỉ đọc được các icon dưới dạng nút không có nhãn. |
| **Dynamic Type** | **CHƯA ĐẠT** | Tất cả các kiểu chữ trong `styles` của [index.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx) đều gán kích thước cố định bằng số nguyên (`fontSize: 20`, `fontSize: 13`, `fontSize: 12`...) và có `numberOfLines={1}`. Khi người dùng tăng kích thước chữ trong cài đặt Trợ năng của iOS, giao diện sẽ bị vỡ hoặc mất chữ. |
| **Dark Mode** | **CỐ ĐỊNH DARK** | Khai báo `userInterfaceStyle: 'dark'` trong [app.config.ts#L11](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app.config.ts#L11). Toàn bộ màu nền và chữ trong [index.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx) đều gán cứng mã màu tối (`#0a0a0a`, `#181818`, `#282828`). Ứng dụng không hỗ trợ Light Mode và không phản hồi theo cài đặt giao diện của hệ điều hành. |

---

## 4. KIỂM TRA WEB ADMIN / LOCAL STUDIO

### 4.1. Upload hàng loạt & Nhập nhạc
- **Upload YouTube hàng loạt:** Hoạt động tốt thông qua `youtubeJobRunner.ts` và hàng đợi tải về tuần tự/song song, phát thông báo tiến trình SSE (`/api/jobs/:id/events`).
- **Upload file từ máy tính (Local Import):**
  - **PHÁT HIỆN LỖI SAI KHỚP ENDPOINT (BUG):**
    - File giao diện `tools/dashboard/src/modules/import/ImportPage.tsx` gọi:
      - Xem trước: `/local-api/import/preview` ([ImportPage.tsx#L78](file:///d:/apps%20on%20phone/Beatify/tools/dashboard/src/modules/import/ImportPage.tsx#L78))
      - Xác nhận: `/local-api/import/commit` ([ImportPage.tsx#L45](file:///d:/apps%20on%20phone/Beatify/tools/dashboard/src/modules/import/ImportPage.tsx#L45))
    - File modal `tools/dashboard/src/modules/youtube-music/components/LocalImportReviewModal.tsx` cũng gọi:
      - Xem trước: `/local-api/import/preview` ([LocalImportReviewModal.tsx#L72](file:///d:/apps%20on%20phone/Beatify/tools/dashboard/src/modules/youtube-music/components/LocalImportReviewModal.tsx#L72))
      - Xác nhận: `/local-api/import/commit` ([LocalImportReviewModal.tsx#L97](file:///d:/apps%20on%20phone/Beatify/tools/dashboard/src/modules/youtube-music/components/LocalImportReviewModal.tsx#L97))
    - **NHƯNG** phía backend server `tools/indexer/src/server/index.ts` lại định nghĩa tên endpoint khác hoàn toàn:
      - Xem trước: `/local-api/import/inspect` ([index.ts#L880](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L880))
      - Xác nhận: `/local-api/import/confirm` ([index.ts#L992](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L992))
    - **Hậu quả:** Tính năng nhập nhạc từ file kéo thả sẽ nhận mã lỗi `404 Not Found` khi gửi request lên server.

### 4.2. Sửa Metadata & Tính toàn vẹn
- **Sửa metadata đơn lẻ & hàng loạt:** Hỗ trợ sửa tiêu đề, nghệ sĩ, album, năm phát hành, lời bài hát và ảnh bìa. Có endpoint `/local-api/tracks/batch-override` ([index.ts#L1497](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L1497)) cho phép gán ca sĩ hoặc album cho nhiều bài cùng lúc.
- **Bảo toàn dữ liệu gốc (Non-destructive):** Toàn bộ các chỉnh sửa metadata trên Web và App đều được lưu vào file `_meta/overrides.json` ([overridesManager.ts](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/services/overridesManager.ts)). File âm thanh gốc trong `MUSIC_SOURCE_DIR` không hề bị ghi đè, sửa đổi hay di chuyển, tuân thủ nghiêm ngặt quy tắc dự án.

### 4.3. Xử lý trùng lặp (Duplicate Detection)
- **ID bài hát (Track ID):** Được tính bằng 12 ký tự đầu mã băm SHA-1 của toàn bộ nội dung file âm thanh: `crypto.createHash('sha1').update(fileBuffer).digest('hex').slice(0, 12)` ([scanner.ts#L21-L25](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/services/scanner.ts#L21-L25)). Do đó, hai file giống hệt nhau về bit sẽ có chung ID.
- **ID album (Album ID):** Được tính từ SHA-1 của chuỗi đã chuẩn hóa: `sha1(normalize(albumArtist) + '|' + normalize(album)).slice(0, 12)` ([scanner.ts#L75-L76](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/services/scanner.ts#L75-L76)).
- **Trùng lặp tải YouTube:** Kiểm tra theo `videoId` và tên file đã chuẩn hóa trong `downloads/metadata.json`.

### 4.4. Phân quyền (RBAC) & Xác thực
- **Local Server (`tools/indexer/src/server/index.ts`):** **HOÀN TOÀN KHÔNG CÓ PHÂN QUYỀN VÀ XÁC THỰC**.
  - Server mở tại port `4000` với cấu hình `app.use('*', cors())`.
  - Không có phiên đăng nhập, không có API Key, không có phân chia quyền Admin vs Viewer. Bất kỳ ai truy cập được port 4000 đều có toàn quyền điều khiển kho nhạc và hệ thống tệp.

### 4.5. Validation đầu vào
- **Cloudflare Worker Backend:** Đạt chuẩn. Mọi input đều validate qua schema Zod (`UpdateTrackSchema`, `OverridesSchema`, `UserStateSchema`) và hàm kiểm tra định dạng hex 12 ký tự `isValidTrackId()`, `isValidAlbumId()`.
- **Local Studio Server:** Không đồng đều:
  - Một số endpoint có kiểm tra Zod (`TrackOverrideSchema`, `RelocateDownloadsRequestSchema`, `UserStateSchema`).
  - Một số endpoint quan trọng **chỉ ép kiểu TypeScript thô (`as ...`) mà không parse Zod hay kiểm tra runtime**, ví dụ:
    - `POST /local-api/import/confirm`: `const items = body.items as Array<{...}>;` ([index.ts#L995](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L995)).
    - `POST /local-api/fs/mkdir`: `const body = (await c.req.json()) as { parentPath: string; folderName: string };` ([index.ts#L1709](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L1709)).
    - `POST /local-api/fs/rename`: `const body = (await c.req.json()) as { currentPath: string; newName: string };` ([index.ts#L1746](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L1746)).

### 4.6. Lỗ hổng Bảo mật Nghiêm trọng (Security Vulnerabilities)
1. **Lỗ hổng Cross-Origin Remote File Deletion / Arbitrary Directory Exploration (RCE / CSRF Risk):**
   - **Vị trí:** [tools/indexer/src/server/index.ts#L151](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L151), [#L1611-L1704](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L1611-L1704), [#L1782-L1827](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L1782-L1827).
   - **Mô tả:** Server cấu hình `cors()` cho phép tất cả các nguồn (`*`). Đồng thời, server mở endpoint `/local-api/fs/explore` cho phép liệt kê toàn bộ các ổ đĩa `C:\`, `D:\`, `E:\` của máy tính Windows và endpoint `/local-api/fs/delete` cho phép xóa thư mục đệ quy `await fs.rm(normPath, { recursive: true, force: true })`.
   - **Nguy cơ:** Khi người dùng đang chạy server indexer trên máy và lướt web trên một trang web độc hại bất kỳ, trang web đó có thể chạy JavaScript ngầm gửi HTTP POST tới `http://127.0.0.1:4000/local-api/fs/delete` để xóa bất kỳ thư mục nào trên máy tính của người dùng (ngoại trừ ổ đĩa gốc và thư mục `MUSIC_SOURCE_DIR`).
   - **Vi phạm tiêu chuẩn:** Vi phạm quy tắc bảo mật server local trong `.agents/skills/local-dashboard/SKILL.md` (yêu cầu bind 127.0.0.1, token phiên, kiểm tra Host/Origin).

---

## 5. VẤN ĐỀ HIỆU NĂNG (PERFORMANCE ISSUES)

### 5.1. Nghẽn Disk I/O và CPU nghiêm trọng tại `GET /local-api/tracks`
- **Vị trí:** [tools/indexer/src/server/index.ts#L421-L431](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L421-L431).
- **Mã nguồn:**
  ```typescript
  const rawScanned: ScannedTrack[] = [];
  for (const f of files) {
    const item = await scanAudioFile(f);
    if (item) {
      rawScanned.push(item);
      ...
    }
  }
  ```
- **Phân tích:** Trong mỗi lần gọi `GET /local-api/tracks`, server duyệt qua **toàn bộ file trong thư mục nhạc**, sau đó gọi `scanAudioFile(f)` -> hàm này gọi `calculateTrackId(filePath)` đọc toàn bộ file vào RAM (`fs.readFile(filePath)`) để băm SHA-1 và gọi `mm.parseFile(filePath)`.
- **Hậu quả:** Nếu thư viện có 1.000 bài hát FLAC (dung lượng ~20GB), mỗi lần người dùng bấm vào trang Thư viện, server sẽ đọc 20GB từ ổ cứng và tính toán SHA-1 từ đầu. Điều này làm đơ máy, nghẽn Disk I/O 100% và phản hồi API cực kỳ chậm chạp.

### 5.2. Rò rỉ và Phình to Bộ nhớ RAM (Memory Heap Bloat) do Cache Ảnh Bìa Thô
- **Vị trí:** [tools/indexer/src/server/index.ts#L51](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L51), [#L426-L429](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L426-L429).
- **Mã nguồn:**
  ```typescript
  const cachedCovers = new Map<string, Buffer>();
  ...
  if (item.coverBuffer) {
    if (item.track.albumId) cachedCovers.set(item.track.albumId, item.coverBuffer);
    if (item.track.id) cachedCovers.set(item.track.id, item.coverBuffer);
  }
  ```
- **Phân tích:** Ảnh bìa nhúng trong file nhạc thường có độ phân giải lớn (1000x1000 đến 3000x3000px, nặng từ 1MB đến 5MB). Biến toàn cục `cachedCovers` lưu trữ toàn bộ các `Buffer` này trong bộ nhớ heap của Node.js mà **không có cơ chế giới hạn dung lượng (LRU Cache)**.
- **Hậu quả:** Với kho nhạc 500 album, RAM của tiến trình Node.js có thể phình to lên tới 2GB - 3GB, dẫn đến lỗi `JavaScript heap out of memory` gây sập server.

### 5.3. Ảnh bìa nặng không được nén / thu nhỏ (Lack of Thumbnail Resizing)
- **Vị trí:** [apps/api/src/index.ts#L216-L258](file:///d:/apps%20on%20phone/Beatify/apps/api/src/index.ts#L216-L258), [tools/indexer/src/server/index.ts#L595-L598](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L595-L598).
- **Phân tích:** Cả Cloudflare Worker và Local Server đều phục vụ nguyên vẹn file ảnh bìa gốc cho mọi nơi (kể cả icon thumbnail nhỏ 40x40px trong danh sách bài hát).
- **Hậu quả:** Khi cuộn danh sách bài hát trên điện thoại hoặc web, thiết bị phải tải hàng chục file ảnh nặng 3MB-5MB qua mạng, gây giật lag và tiêu tốn băng thông 4G/5G của người dùng.

### 5.4. Render danh sách dài không dùng Virtualization trên App iOS
- **Vị trí:** [apps/mobile/app/index.tsx#L687](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L687), [#L1035-L1128](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L1035-L1128).
- **Mã nguồn:**
  ```tsx
  <ScrollView contentContainerStyle={styles.container}>
    ...
    {tracks.map((track, idx) => {
      ...
      return (<View key={track.id} ...>{...}</View>);
    })}
  </ScrollView>
  ```
- **Phân tích:** Màn hình chính của app iOS sử dụng `<ScrollView>` và hàm `.map()` để vẽ danh sách bài hát. Không sử dụng `FlatList` hay `FlashList`.
- **Hậu quả:** Toàn bộ $N$ bài hát cùng các phần tử giao diện, nút bấm, biểu tượng SVG đều được khởi tạo và gắn vào cây DOM native cùng một lúc. Khi thư viện có từ 200 - 1.000 bài trở lên, app sẽ bị giật khung hình (frame drop), thời gian mở app kéo dài và có thể bị hệ điều hành iOS kill vì chiếm dụng quá nhiều bộ nhớ.

### 5.5. Thiếu phân trang ở tầng Backend và các trang Danh mục trên Web
- **Vị trí:**
  - `tools/dashboard/src/modules/artists/pages/ArtistsPage.tsx` ([ArtistsPage.tsx#L400-L500](file:///d:/apps%20on%20phone/Beatify/tools/dashboard/src/modules/artists/pages/ArtistsPage.tsx#L400-L500)): Render toàn bộ nghệ sĩ và bài hát con cùng lúc không có phân trang.
  - `tools/dashboard/src/modules/library/LibraryPage.tsx` ([LibraryPage.tsx#L300-L303](file:///d:/apps%20on%20phone/Beatify/tools/dashboard/src/modules/library/LibraryPage.tsx#L300-L303)): Đã có phân trang UI (50/100/200), nhưng chỉ là **phân trang ở client** sau khi đã tải trọn vẹn toàn bộ mảng dữ liệu khổng lồ từ `/local-api/tracks`.

### 5.6. Tác vụ thừa và Chi phí R2 (Class A / Class B Operations)
- **Vị trí:** [apps/api/src/repositories/storageRepository.ts#L51-L67](file:///d:/apps%20on%20phone/Beatify/apps/api/src/repositories/storageRepository.ts#L51-L67).
- **Mã nguồn:**
  ```typescript
  const listResult = await this.bucket.list({ prefix: `music/${id}`, limit: 1 });
  const target = listResult.objects[0];
  ...
  const object = await this.bucket.get(key, r2Range ? { range: r2Range } : undefined);
  ```
- **Phân tích:** Mỗi khi phát nhạc hoặc tua bài (gửi yêu cầu Range), Worker trước tiên gọi `bucket.list()` (thao tác Class A - có tính phí cao hơn) để tìm phần mở rộng của file âm thanh (`.mp3`, `.m4a`), sau đó mới gọi `bucket.get()` (thao tác Class B) để lấy dữ liệu.
- **Hậu quả:** Nhân đôi số lượng request lên Cloudflare R2 cho mỗi lượt phát nhạc, làm tăng độ trễ bắt đầu phát bài (Time-To-First-Byte) và làm tăng chi phí vận hành nếu thư viện lớn.

---

## 6. BẢNG TỔNG HỢP VẤN ĐỀ & ĐƯỜNG DẪN FILE CỤ THỂ

| STT | Phân loại | Vấn đề phát hiện | Mức độ nghiêm trọng | Đường dẫn file & Dòng code cụ thể |
|:---:|---|---|:---:|---|
| **1** | **Bảo mật** | CORS mở tự do `*`, không có xác thực, cho phép duyệt toàn bộ ổ đĩa máy tính Windows (`C:\`, `D:\`) qua API | **CRITICAL** | [tools/indexer/src/server/index.ts#L151](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L151)<br>[tools/indexer/src/server/index.ts#L1611-L1704](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L1611-L1704) |
| **2** | **Bảo mật** | Endpoint xóa thư mục đệ quy qua Web (`/local-api/fs/delete`) không có token/Host check, có nguy cơ bị trang web ngoài trigger CSRF xóa dữ liệu | **CRITICAL** | [tools/indexer/src/server/index.ts#L1782-L1827](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L1782-L1827) |
| **3** | **Lỗi chức năng** | Sai khớp endpoint Nhập nhạc: Frontend gọi `/local-api/import/preview` và `/commit` trong khi Backend định nghĩa `/inspect` và `/confirm` (gây lỗi 404 khi nhập nhạc) | **HIGH** | [tools/dashboard/src/modules/import/ImportPage.tsx#L45](file:///d:/apps%20on%20phone/Beatify/tools/dashboard/src/modules/import/ImportPage.tsx#L45)<br>[tools/indexer/src/server/index.ts#L880](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L880)<br>[tools/indexer/src/server/index.ts#L992](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L992) |
| **4** | **Hiệu năng** | `GET /local-api/tracks` đọc toàn bộ file âm thanh và tính lại mã băm SHA-1 trên mỗi request, làm nghẽn Disk I/O và CPU | **HIGH** | [tools/indexer/src/server/index.ts#L421-L431](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L421-L431)<br>[tools/indexer/src/services/scanner.ts#L21-L25](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/services/scanner.ts#L21-L25) |
| **5** | **Hiệu năng** | `cachedCovers` lưu toàn bộ buffer JPEG thô trong RAM Node.js `Map` không có eviction policy (dễ gây Out Of Memory) | **HIGH** | [tools/indexer/src/server/index.ts#L51](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L51)<br>[tools/indexer/src/server/index.ts#L426-L429](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L426-L429) |
| **6** | **Hiệu năng** | Danh sách bài hát trên App iOS dùng `<ScrollView>` + `.map()` thay vì `FlatList` / `FlashList`, gây tụt khung hình và quá tải bộ nhớ khi danh sách dài | **HIGH** | [apps/mobile/app/index.tsx#L687](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L687)<br>[apps/mobile/app/index.tsx#L1035-L1128](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L1035-L1128) |
| **7** | **Chi phí / Độ trễ** | Hàm phát âm thanh `getAudioStream` trên Cloudflare Worker gọi `bucket.list` trước rồi mới gọi `bucket.get`, nhân đôi số request và phát sinh chi phí Class A R2 | **MEDIUM** | [apps/api/src/repositories/storageRepository.ts#L51-L67](file:///d:/apps%20on%20phone/Beatify/apps/api/src/repositories/storageRepository.ts#L51-L67) |
| **8** | **Hiệu năng** | Ảnh bìa không có phiên bản thumbnail thu nhỏ, trả nguyên ảnh gốc 1:1 nặng từ 2MB đến 5MB cho cả icon nhỏ | **MEDIUM** | [apps/api/src/index.ts#L216-L258](file:///d:/apps%20on%20phone/Beatify/apps/api/src/index.ts#L216-L258)<br>[tools/indexer/src/server/index.ts#L595-L598](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts#L595-L598) |
| **9** | **Trợ năng (A11y)** | Nút bấm trên App iOS thiếu `accessibilityLabel`, `accessibilityRole`, không tương thích trình đọc màn hình VoiceOver | **MEDIUM** | [apps/mobile/app/index.tsx#L701-L739](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L701-L739)<br>[apps/mobile/app/index.tsx#L788-L842](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L788-L842) |
| **10** | **Trợ năng (A11y)** | Kiểu chữ trên App iOS gán cứng số nguyên, không hỗ trợ Apple Dynamic Type | **LOW** | [apps/mobile/app/index.tsx#L1301-L1313](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L1301-L1313) |
| **11** | **Giao diện** | App iOS cố định Dark Mode (`#0a0a0a`), không hỗ trợ Light Mode hay đồng bộ theo hệ thống | **LOW** | [apps/mobile/app.config.ts#L11](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app.config.ts#L11)<br>[apps/mobile/app/index.tsx#L1233](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L1233) |
| **12** | **Tính năng âm thanh**| App iOS chưa có nút AirPlay Route Picker trong màn hình, thiếu Crossfade Engine, chưa hỗ trợ Nghe Offline | **FEATURE GAP** | [apps/mobile/src/services/player/rntpPlayerService.ts](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/player/rntpPlayerService.ts)<br>[apps/mobile/app/index.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx) |


---

## 7. ĐÁNH GIÁ TƯƠNG THÍCH SIDESTORE & MẠNG NỘI BỘ (LOCAL NETWORK)

> **Bối cảnh sử dụng:** Dự án dùng cho cá nhân, build ra file `.ipa` chưa ký bằng GitHub Actions (`macos-26`), sau đó cài lên iPhone bằng SideStore sử dụng tài khoản Apple ID miễn phí (Free Apple Developer Account). Web quản lý nhạc chạy local trên PC (`http://127.0.0.1:4000`), app kết nối qua mạng Wi-Fi nội bộ.

### 7.1. Kiểm tra Entitlements & Capabilities
- **Tình trạng file `.entitlements`:**
  - Dự án hiện tại **không có file `.entitlements` nào** trong `apps/mobile`.
  - Trong [`apps/mobile/app.config.ts#L16-L18`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app.config.ts#L16-L18), cấu hình duy nhất là:
    ```typescript
    infoPlist: {
      UIBackgroundModes: ['audio'],
    }
    ```
- **Khả năng tương thích với Apple ID miễn phí:**
  - `UIBackgroundModes: ['audio']` là một khóa cấu hình trong `Info.plist`, **không phải là Entitlement đặc biệt** yêu cầu tài khoản trả phí ($99/năm). Thuộc tính này hoạt động 100% bình thường với Apple ID miễn phí khi ký qua SideStore/AltStore/Sideloadly.
  - Dự án **hoàn toàn không chứa các Entitlement cấm** đối với tài khoản miễn phí như:
    - `com.apple.developer.associated-domains` (Universal Links)
    - `aps-environment` (Push Notifications)
    - `com.apple.developer.in-app-payments` (Apple Pay)
    - `com.apple.developer.carplay-audio` (CarPlay)
    - `com.apple.developer.networking.wifi-info` (Truy cập SSID Wi-Fi)
- **Kết luận về khả năng cài đặt:** SideStore sẽ **KHÔNG bị từ chối ký hay lỗi profile** do thiếu quyền hoặc vướng capability trả phí. Bản IPA unsigned từ CI hoàn toàn sạch và ký được ngay.

---

### 7.2. Số lượng Target / Extension & Hạn ngạch App ID
- **Số lượng Target / Extension trong code:**
  - Dự án chỉ có duy nhất **1 Target chính** (`Beatify` / `Beatify Dev`).
  - **Không có bất kỳ App Extension nào:** Không có Widget Extension (`WidgetKit`), Live Activity (`ActivityKit`), Share Extension, Siri Intent hay Notification Service Extension.
- **Tiêu tốn App ID:**
  - Dự án chỉ tiêu tốn đúng **1 App ID** (`com.dinhgiaan.beatify`).
- **Tác động đến tài khoản Apple ID miễn phí:**
  - Apple ID miễn phí có giới hạn gắt gao: **tối đa 10 App IDs đăng ký trong 7 ngày** và **tối đa 3 App hoạt động cùng lúc (Active Apps)** trên iPhone.
  - Bản thân SideStore đã chiếm 1 App ID và 1 slot App hoạt động.
  - Khi cài Beatify, người dùng chỉ tiêu tốn thêm 1 App ID và 1 slot ($1 + 1 = 2$ slots). Người dùng vẫn còn dư 1 slot để cài thêm 1 ứng dụng khác. Đây là một lợi thế lớn của Beatify khi không dùng Extension.

---

### 7.3. Cách tìm Server & Cấu hình Info.plist (Cloudflare Worker / ATS / Local Network) [XÁC NHẬN BẰNG CODE]
- **Bản chất kết nối của App iOS:**
  - **App iOS THỰC TẾ CHỈ KẾT NỐI VỚI CLOUDFLARE WORKER**, **hoàn toàn KHÔNG gọi tới server local trên PC (port 4000)**. Port 4000 là server cục bộ chỉ dành riêng cho Web Dashboard.
  - Các API mà app iOS gọi thông qua [`MusicApiClient`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/api/musicApiClient.ts) (`/api/library`, `/api/tracks/:id`, `/api/state`, `/lyrics/:id`) đều hướng tới địa chỉ Cloudflare Worker (`serverUrl`).
- **Nguồn của `serverUrl` và Mã QR:**
  - Trong [`apps/mobile/app/index.tsx#L107-L136`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L107-L136): Nạp từ `process.env.EXPO_PUBLIC_API_URL` (mặc định dev là `http://127.0.0.1:8787`) hoặc file cấu hình `beatify_server_config.json`.
  - Dòng code sinh mã QR tại [`tools/dashboard/src/modules/sync/ConnectAppModal.tsx#L35-L39`](file:///d:/apps%20on%20phone/Beatify/tools/dashboard/src/modules/sync/ConnectAppModal.tsx#L35-L39):
    ```typescript
    const deepLink = React.useMemo(() => {
      const cleanUrl = apiUrl.trim().replace(/\/+$/, '');
      const cleanToken = apiToken.trim();
      return `beatify://connect?api=${encodeURIComponent(cleanUrl)}&token=${encodeURIComponent(cleanToken)}`;
    }, [apiUrl, apiToken]);
    ```
    Mã QR sinh ra URL của Cloudflare Worker (lấy từ `localStorage('beatify_mobile_api_url')` hoặc mặc định `http://127.0.0.1:8787`). **Mã QR KHÔNG sinh ra IP:4000**.
- **Kiểm chứng cấu hình ATS (`NSAppTransportSecurity`) thực tế từ Expo Prebuild:**
  - Chạy kiểm tra thực tế bằng lệnh `npx expo config --type introspect` trên dự án, kết quả sinh ra trong `Info.plist` của Expo SDK 57:
    ```json
    "NSAppTransportSecurity": {
      "NSAllowsArbitraryLoads": true,
      "NSExceptionDomains": {
        "localhost": {
          "NSExceptionAllowsInsecureHTTPLoads": true
        }
      }
    }
    ```
  - **Kết luận đã kiểm chứng:** Expo SDK 57 template mặc định **tự động chèn `NSAllowsArbitraryLoads: true`** vào `Info.plist`. Do đó, ngay cả khi kết nối HTTP (như khi test Worker local qua `http://`), **iOS ATS KHÔNG hề chặn kết nối**.
- **Đánh giá về Quyền Mạng cục bộ (`NSLocalNetworkUsageDescription`):**
  - Khi Cloudflare Worker được deploy production, nó chạy trên domain **HTTPS public** (`https://<project>.<subdomain>.workers.dev`).
  - Request đi thẳng ra Internet công cộng, **hoàn toàn KHÔNG chạm vào dải IP mạng LAN (`192.168.x.x`)**, vì vậy **KHÔNG cần quyền Local Network** và iOS sẽ không bao giờ hỏi quyền này trong quá trình sử dụng thông thường. (Chỉ khi dev chạy Worker nội bộ máy tính `http://192.168.x.x:8787` thì mới liên quan đến mạng LAN).

---

### 7.4. Nơi lưu trữ Dữ liệu Offline / Cache & Rủi ro khi SideStore Refresh / Cài lại [XÁC NHẬN BẰNG CODE]
- **Thư mục lưu trữ trong code:**
  - Cấu hình server: `FileSystem.documentDirectory + 'beatify_server_config.json'` ([`index.tsx#L117`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L117)).
  - Danh sách phát & Yêu thích: `FileSystem.documentDirectory + 'beatify_user_state.json'` ([`index.tsx#L118`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L118)).
  - Thống kê nghe nhạc: `FileSystem.documentDirectory + 'beatify_listening_stats.json'` ([`statsStorage.ts#L11`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/stats/statsStorage.ts#L11)).
  - Hồ sơ cá nhân: `FileSystem.documentDirectory + 'beatify_user_profile.json'` ([`statsStorage.ts#L12`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/stats/statsStorage.ts#L12)).
- **Vị trí vật lý trên iOS:**
  - `FileSystem.documentDirectory` tương ứng với thư mục `<Application_Home>/Documents/` bên trong App Sandbox.
- **Khi SideStore Refresh (Gia hạn chứng chỉ định kỳ 7 ngày):**
  - **DỮ LIỆU HOÀN TOÀN KHÔNG BỊ MẤT**. SideStore refresh ứng dụng bằng cách ký lại file nhị phân và cập nhật lại `embedded.mobileprovision` trực tiếp mà không xóa container của ứng dụng. Thư mục `Documents/` được bảo tồn 100%.
- **Khi người dùng Cài lại app hoặc Gỡ bỏ app (Reinstall):**
  - **Trường hợp gỡ cài đặt (Delete App) rồi cài lại:** iOS xóa toàn bộ App Sandbox. Tất cả file trong `Documents/` **SẼ MẤT HẾT** (trừ playlist/favorites đã đồng bộ lên Cloudflare R2).
  - **Trường hợp cài đè (Update in-place):** Giữ nguyên dữ liệu với điều kiện Bundle Identifier không bị thay đổi.

---

### 7.5. Xử lý khi Mất kết nối Server [XÁC NHẬN BẰNG CODE]
- **Tình trạng trong code:**
  - **Khi khởi động app không có mạng:** App bắt lỗi trong `try/catch` tại [`index.tsx#L181-L183`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L181-L183), in `console.warn` và tiếp tục sử dụng dữ liệu offline đã lưu trong `beatify_user_state.json`. Không bị crash app.
  - **Khi bấm đồng bộ thủ công lúc mất mạng:** Hiện popup thông báo `Alert.alert('Lỗi kết nối Cloudflare', msg)` và cập nhật dòng trạng thái ([`index.tsx#L666-L670`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L666-L670)).
  - **Khi sửa/xóa bài hát lúc mất mạng:** Áp dụng Optimistic UI cập nhật giao diện máy trước, sau đó lưu trạng thái `"Lưu cục bộ thành công (Đồng bộ Cloudflare thất bại: ...)"` ([`index.tsx#L577-L580`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L577-L580)).
  - **Khi đang phát nhạc mà mất kết nối:** Nhạc sẽ dừng lại, icon loading hiển thị xoay tròn liên tục tại [`index.tsx#L783`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L783).
- **Hạn chế:**
  - App chưa tích hợp thư viện kiểm tra trạng thái mạng (`@react-native-community/netinfo`), không tự động phát hiện khi iPhone có Internet trở lại để tự động reconnect.

---

### 7.6. Rủi ro Đổi Bundle ID & Phụ thuộc trong Code [XÁC NHẬN BẰNG CODE]
- **SideStore có đổi Bundle ID không?**
  - **Có thể xảy ra:** SideStore có tính năng tự động thêm tiền tố/hậu tố vào Bundle ID để tránh xung đột với các App ID đã tồn tại trên Apple Developer Portal của tài khoản miễn phí.
- **Mức độ phụ thuộc Bundle ID trong code:**
  - Khai báo tại [`apps/mobile/app.config.ts#L15`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app.config.ts#L15): `com.dinhgiaan.beatify`.
  - Trong toàn bộ mã nguồn TypeScript: **Không có logic nào kiểm tra hoặc so sánh cố định chuỗi `com.dinhgiaan.beatify`**.
  - Tính năng Deep Link mở app sử dụng URL Scheme riêng `scheme: 'beatify'` ([`app.config.ts#L8`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app.config.ts#L8)), hoàn toàn độc lập với Bundle ID.
  - Không sử dụng App Group hay Keychain Access Group.
- **Rủi ro mất dữ liệu nếu Bundle ID bị đổi khi cài lại:**
  - Nếu SideStore đổi Bundle ID từ `com.dinhgiaan.beatify` sang một định danh khác (ví dụ `com.dinhgiaan.beatify.123`), iOS sẽ coi đây là một ứng dụng hoàn toàn mới và cấp một thư mục Sandbox mới.
  - Toàn bộ dữ liệu trong thư mục `Documents/` của bản cài cũ sẽ không thể đọc được bởi bản cài mới. Người dùng cần lưu ý tắt tùy chọn đổi Bundle ID trong SideStore khi cập nhật.

---

### 7.7. BẢNG RỦI RO KHI CÀI QUA SIDESTORE (ĐÃ HIỆU CHỈNH THEO THỰC TẾ)

| Hạng mục | Mức độ rủi ro | Phân loại | File liên quan | Đánh giá thực tế từ mã nguồn | Cách khắc phục đề xuất |
|---|:---:|:---:|---|---|---|
| **Thay đổi Bundle ID làm mất dữ liệu** | **TRUNG BÌNH** | XÁC NHẬN BẰNG CODE | [`apps/mobile/app.config.ts#L15`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app.config.ts#L15) | Nếu SideStore tự sinh hậu tố ngẫu nhiên cho Bundle ID khi cài lại/update, iOS sẽ tạo container mới và app mất quyền truy cập dữ liệu cũ trong `Documents/`. | Giữ cố định Bundle ID trong cài đặt của SideStore; đồng bộ thường xuyên Playlists/Favorites lên Cloudflare R2 làm backup. |
| **Gỡ cài đặt làm mất dữ liệu local** | **TRUNG BÌNH** | XÁC NHẬN BẰNG CODE | [`apps/mobile/src/services/stats/statsStorage.ts`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/stats/statsStorage.ts) | File lưu trong Sandbox `Documents/`. Nếu người dùng xóa hẳn app thay vì cài đè khi refresh/cập nhật, toàn bộ lịch sử nghe Replay sẽ bị xóa. | SideStore chỉ cần cài đè (In-place update) hoặc refresh chứng chỉ 7 ngày; không xóa app trước khi cài mới. |
| **Mất kết nối Internet khi đang stream** | **THẤP** | XÁC NHẬN BẰNG CODE | [`apps/mobile/app/index.tsx#L783`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx#L783)<br>[`apps/mobile/src/services/player/rntpPlayerService.ts`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/player/rntpPlayerService.ts) | Khi mất mạng Internet giữa chừng, audio dừng phát và vòng quay loading hiển thị vô tận mà không có nút Thử lại. | Bổ sung lắng nghe lỗi từ RNTP để chuyển sang thông báo "Mất kết nối Internet" kèm nút Retry. |
| **Chặn kết nối HTTP (ATS)** | **KHÔNG CÓ / RẤT THẤP** | XÁC NHẬN BẰNG CODE | [`apps/mobile/app.config.ts`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app.config.ts) | **Đã kiểm chứng bằng `npx expo config --type introspect`**: Expo SDK 57 template tự động chèn `NSAllowsArbitraryLoads: true` vào `Info.plist`. Đồng thời app kết nối tới Cloudflare Worker production qua HTTPS. | Không cần can thiệp. |
| **Quyền Mạng cục bộ (Local Network)** | **KHÔNG CÓ / RẤT THẤP** | XÁC NHẬN BẰNG CODE | [`apps/mobile/src/services/api/musicApiClient.ts`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/services/api/musicApiClient.ts) | App iOS gọi thẳng tới Cloudflare Worker (Internet public), **không kết nối vào mạng LAN (port 4000 của PC)**, nên iOS không yêu cầu quyền Local Network. | Không cần can thiệp (chỉ cần nếu dev muốn test Worker local qua `http://192.168.x.x:8787`). |

---
*Báo cáo được hoàn thành tự động theo đúng yêu cầu kiểm toán toàn diện mã nguồn. Chưa có bất kỳ thay đổi mã nguồn nào được thực hiện.*


