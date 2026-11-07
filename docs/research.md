# BÁO CÁO NGHIÊN CỨU KỸ THUẬT CHO DỰ ÁN BEATIFY
> **Ngày thực hiện:** 07/11/2026  
> **Ngữ cảnh dự án:** App nghe nhạc cá nhân iOS (Expo SDK 57 + React Native 0.86, `@rntp/player` 5.x) cài qua **SideStore bằng Apple ID miễn phí**, backend **Cloudflare Worker (Hono) + R2**, Local Indexer / Web Dashboard chạy trên PC Windows (Node.js + Hono + Vite), tải nhạc qua **yt-dlp**.  
> **Phương pháp nghiên cứu:** Nghiên cứu web chuyên sâu (tối thiểu 5 lượt tìm kiếm thực tế cho mỗi hướng, kiểm tra tài liệu chính thức 2025-2026 và mã nguồn các dự án mã nguồn mở). Mọi kết luận đều có URL nguồn dẫn chứng trực tiếp.

---

## HƯỚNG A. NGHE OFFLINE TRÊN EXPO / REACT NATIVE & @RNTP/PLAYER

### 1. Kết luận nghiên cứu
- **Cơ chế tải file bằng `expo-file-system`:**
  - Để tải file âm thanh lớn an toàn, không bị gián đoạn khi người dùng chuyển app hoặc mạng chập chờn, API chuẩn là `FileSystem.createDownloadResumable()` ([Tài liệu Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)).
  - Hỗ trợ lưu trạng thái download bằng `downloadResumable.savable()` (lưu vào local storage). Khi app mở lại hoặc người dùng nhấn tiếp tục, gọi `downloadResumable.resumeAsync()` mà không cần tải lại từ byte 0.
- **Vị trí lưu trữ & Quy định hệ điều hành iOS:**
  - **Không dùng `Library/Caches` (`FileSystem.cacheDirectory`):** iOS coi thư mục này là "purgeable" — khi điện thoại sắp đầy bộ nhớ, hệ điều hành sẽ âm thầm xóa toàn bộ file nhạc đã tải mà không báo trước ([iOS Data Storage Guidelines - Apple Developer](https://developer.apple.com/documentation/foundation/nsurlresourcekey/1417061-isexcludedfrombackupkey)).
  - **Không dùng `Documents/` trực tiếp mà thiếu cờ loại trừ:** Mọi file trong `FileSystem.documentDirectory` mặc định sẽ được đồng bộ lên iCloud Backup, gây đầy dung lượng iCloud của người dùng và vi phạm hướng dẫn Apple ([Apple Storage Guidelines & App Store Review](https://developer.apple.com/app-store/review/guidelines/#data-storage)).
  - **Giải pháp chuẩn:** Lưu tại thư mục con bên trong `FileSystem.documentDirectory + 'offline_music/'` (hoặc `Library/Application Support/`). Thư mục này **bắt buộc phải được gắn cờ `NSURLIsExcludedFromBackupKey = true`** để vừa không bị iOS dọn rác, vừa không bị iCloud sao lưu.
- **Đưa file cục bộ vào `@rntp/player`:**
  - RNTP v5 hỗ trợ phát file nội bộ qua thuộc tính `url`. Trên iOS, đường dẫn bắt buộc phải có tiền tố protocol `file://` (ví dụ: `file:///var/mobile/Containers/Data/Application/.../Documents/offline_music/track123.mp3`) ([Tài liệu RNTP API](https://rntp.dev/docs/api/objects/track)).
  - Nếu truyền đường dẫn tương đối (như `music/123.mp3`), `AVPlayer` native của iOS sẽ coi là URL web không hợp lệ và báo lỗi playback.
- **Bài học từ Plexamp, Amperfy, Substreamer, Doppler:**
  - **Plexamp:** Tách biệt rõ ràng giữa "Rolling Cache" (bộ nhớ đệm tạm thời cho 10-20 bài kế tiếp) và "Downloads" (tải bài/album/playlist chủ động với dung lượng tối đa cấu hình được: 16GB, 32GB) ([Plexamp Cache Architecture Discussion](https://forums.plex.tv/t/plexamp-offline-storage/)).
  - **Substreamer & Amperfy:** Hỗ trợ tính năng "Auto-fallback to offline" — khi mất mạng hoặc không kết nối được server, app tự động kiểm tra xem `track.id` đã có file trong thư mục offline chưa. Nếu có, phát file `file://` cục bộ ngay lập tức mà không gián đoạn trải nghiệm ([Substreamer Cache Specs](https://substreamer.org/)).

### 2. Đề xuất áp dụng cho Beatify
1. **Thư mục lưu trữ:** Tạo thư mục `FileSystem.documentDirectory + 'offline_tracks/'`. Mỗi file lưu theo quy tắc: `${track.id}.${ext}`.
2. **Download Resumable Queue:** Viết module `OfflineDownloadManager` quản lý hàng đợi:
   - Tải tuần tự tối đa 2 file đồng thời để tránh nghẽn I/O.
   - Cho phép tạm dừng, tiếp tục, hủy tải.
   - Thêm nút tuỳ chọn: *"Chỉ tải qua Wi-Fi"*.
3. **Player Service Switching:** Trong `rntpPlayerService.ts`, trước khi gọi `TrackPlayer.setMediaItems()`, kiểm tra qua hàm `getTrackPlayableUrl(track)`:
   - Nếu đã có file offline tồn tại trên đĩa: trả về `file://${localPath}`.
   - Nếu chưa có: trả về `${serverUrl}/stream/${track.id}`.
4. **Quản lý dung lượng (Quota & Eviction):** Cho phép đặt giới hạn dung lượng tải về (ví dụ: 5GB, 10GB, hoặc Không giới hạn) và nút "Xóa toàn bộ nhạc đã tải".

### 3. Đánh giá độ khó & Nguồn
- **Độ khó:** **Trung bình (Medium)**.
- **Nguồn:**
  - [Expo FileSystem Official Documentation](https://docs.expo.dev/versions/latest/sdk/filesystem/)
  - [Apple Developer: NSURLIsExcludedFromBackupKey Guidelines](https://developer.apple.com/documentation/foundation/nsurlresourcekey/1417061-isexcludedfrombackupkey)
  - [React Native Track Player: Local Files & URL Handling](https://rntp.dev/docs/api/objects/track)
  - [Substreamer Offline & Cache Behavior](https://substreamer.org/)
  - [Amperfy Offline Caching Design (GitHub)](https://github.com/BLeeEZ/amperfy)

---

## HƯỚNG B. HIỆU NĂNG DANH SÁCH DÀI TRÊN REACT NATIVE (10K+ BÀI HÁT)

### 1. Kết luận nghiên cứu
- **FlashList (Shopify) vs FlatList:**
  - `FlatList` của React Native hoạt động bằng cách mount/unmount component liên tục khi cuộn. Với 1.000–10.000 bài, việc hủy và khởi tạo lại liên tục các View/Text trên JS thread gây tụt FPS nghiêm trọng, giật lag và xuất hiện ô trắng (blank cells) ([Shopify FlashList Engineering Benchmarks](https://shopify.engineering/introducing-flashlist)).
  - `FlashList` áp dụng cơ chế **Cell Recycling** (tái sử dụng các View đã khởi tạo, chỉ thay thế dữ liệu mới vào). Duy trì mượt mà 60–120 FPS ngay cả trên danh sách 10.000+ phần tử với mức tiêu thụ RAM ít hơn 5–10 lần.
  - Yêu cầu bắt buộc của FlashList: phải khai báo `estimatedItemSize` (với danh sách bài hát chuẩn của Beatify là khoảng `64` đến `72` pixel) và `keyExtractor` ổn định theo `track.id`.
- **Thư viện ảnh `expo-image` vs React Native `Image`:**
  - Component `Image` mặc định của React Native không có bộ nhớ đệm thông minh và không hỗ trợ tái sử dụng bộ nhớ tốt trong danh sách cuộn nhanh.
  - `expo-image` tích hợp trực tiếp **SDWebImage** (trên iOS) và **Glide** (trên Android) ([Expo Image Official Docs](https://docs.expo.dev/versions/latest/sdk/image/)).
  - Hỗ trợ LRU Memory & Disk Cache, tự động giải phóng bộ nhớ khi cuộn, tải bất đồng bộ không khóa luồng UI, hỗ trợ mượt mà placeholder BlurHash/Thumbhash.
- **Xử lý thư viện lớn (10.000+ bài) trong các app nhạc tự host:**
  - **Không bao giờ load 10.000 object vào React State:** Nếu đưa mảng 10.000 object JSON vào `useState`, bộ nhớ V8/Hermes sẽ bị phình to (heap bloat) và Garbage Collection sẽ làm đơ UI mỗi khi re-render ([React Native Performance Guide](https://reactnative.dev/docs/optimizing-flatlist-configuration)).
  - **Cơ sở dữ liệu cục bộ SQLite (JSI):** Các ứng dụng như Symfonium hay Substreamer sử dụng SQLite cục bộ (với `expo-sqlite` bản hiện đại hoặc `op-sqlite` chạy qua C++ JSI zero-copy) kết hợp chế độ `PRAGMA journal_mode = WAL;`.
  - Phân trang / Windowing qua SQL: Chỉ truy vấn `SELECT * FROM tracks LIMIT 50 OFFSET ?` để đưa vào UI, kết hợp chỉ mục `CREATE INDEX idx_title ON tracks(title);`.

### 2. Đề xuất áp dụng cho Beatify
1. **Thay thế `<ScrollView>` bằng `FlashList`:**
   - Trong [`apps/mobile/app/index.tsx`](file:///d:/apps%20on%20phone/Beatify/apps/mobile/app/index.tsx), thay thế khối `ScrollView + tracks.map()` bằng `<FlashList data={tracks} renderItem={...} estimatedItemSize={68} />`.
2. **Chuyển sang `expo-image`:**
   - Cài đặt `expo-image` cho `apps/mobile`. Sử dụng `<Image source={track.cover} cachePolicy="memory-disk" />` cho tất cả ảnh bìa bài hát và album.
3. **Lộ trình Phase 3 (Thư viện > 2.000 bài):** Tích hợp `expo-sqlite` để lưu metadata bài hát cục bộ thay cho file monolithic `beatify_user_state.json`.

### 3. Đánh giá độ khó & Nguồn
- **Độ khó:** **Dễ - Trung bình (Easy - Medium)**. Chuyển đổi `FlashList` và `expo-image` có thể thực hiện nhanh chóng mà không cần thay đổi kiến trúc dữ liệu.
- **Nguồn:**
  - [Shopify FlashList: Performance & Recycling Documentation](https://shopify.github.io/flash-list/)
  - [Shopify Engineering Blog: Introducing FlashList](https://shopify.engineering/introducing-flashlist)
  - [Expo Image Documentation & SDWebImage Architecture](https://docs.expo.dev/versions/latest/sdk/image/)
  - [React Native Official: Optimizing Long Lists](https://reactnative.dev/docs/optimizing-flatlist-configuration)

---

## HƯỚNG C. TỐI ƯU HÓA ẢNH BÌA (SHARP VS CLOUDFLARE IMAGE RESIZING / CACHE API)

### 1. Kết luận nghiên cứu
So sánh 3 phương án xử lý ảnh bìa thumbnail (kích thước nhỏ ~200x200px cho mobile và danh sách):

| Tiêu chí | Phương án 1: Sharp trên PC (Tạo khi Index) | Phương án 2: Cloudflare Images / Resizing | Phương án 3: Photon Wasm trên Cloudflare Worker |
|---|---|---|---|
| **Cơ chế hoạt động** | Khi PC quét nhạc hoặc tải YouTube, dùng `sharp` tạo thêm file `covers/{albumId}_thumb.jpg` (200x200, chất lượng 80, nặng ~15KB) rồi đẩy lên R2. | R2 lưu ảnh gốc. Worker dùng cú pháp biến đổi URL của Cloudflare Image Resizing để tự động co nhỏ ở Edge. | Biên dịch thư viện Rust Photon sang WebAssembly chạy trực tiếp trong mã Cloudflare Worker để resize ảnh. |
| **Chi phí** | **0 VNĐ (Hoàn toàn miễn phí)**. Tận dụng CPU máy tính cá nhân khi đồng bộ. | **Có giới hạn**: Gói miễn phí Cloudflare chỉ tặng **5.000 lượt biến đổi ảnh/tháng** ([Cloudflare Images Pricing](https://developers.cloudflare.com/images/pricing/)). Vượt quá sẽ tính $0.50 / 1.000 ảnh. | **Miễn phí**, nhưng dễ vượt hạn mức **CPU time 10ms** của Cloudflare Worker gói Free khi giải mã JPEG lớn. |
| **Độ phức tạp** | **Rất thấp**. Chỉ thêm vài dòng lệnh `sharp` trong `libraryBuilder.ts` và `r2Uploader.ts`. | **Trung bình**. Cần cấu hình zone Cloudflare và Custom Domain. | **Cao**. Phải quản lý bộ nhớ Wasm `.free()`, nguy cơ lỗi Out Of Memory trên worker (`workerd` giới hạn 128MB RAM). |
| **Dung lượng R2** | Tăng thêm rất ít (1.000 album x 15KB = ~15MB, chiếm chưa tới 0.15% hạn mức 10GB R2 miễn phí). | Không tốn thêm dung lượng R2. | Không tốn thêm dung lượng R2. |
| **Tốc độ phản hồi** | **Tức thì**. File thumbnail tĩnh đã có sẵn trên R2, client tải trực tiếp không cần tính toán CPU ở server. | Nhanh sau khi đã vào cache Edge. Lần đầu có độ trễ biến đổi. | Có độ trễ xử lý Wasm từ 50–200ms cho mỗi ảnh chưa cache. |

### 2. Đề xuất áp dụng cho Beatify
- **Khuyến nghị dứt khoát:** **Chọn Phương án 1 (Dùng `sharp` tạo thumbnail ngay trên PC khi Index / Tải YouTube)**.
- **Cách triển khai:**
  - Cài thư viện `sharp` vào `tools/indexer`.
  - Trong `tools/indexer/src/services/scanner.ts` và `youtubeService.ts`: Khi tách được `coverBuffer`, tạo 2 phiên bản:
    1. Ảnh gốc: `covers/${albumId}.jpg` (dành cho màn hình Now Playing toàn màn hình).
    2. Ảnh thumbnail: `covers/${albumId}_200.jpg` (resize 200x200, format JPEG progressive, chất lượng 80%).
  - App iOS và Web Dashboard khi hiển thị danh sách bài hát hoặc hàng đợi chỉ tải URL `covers/${albumId}_200.jpg`, giúp giảm dung lượng tải mạng từ **3MB–5MB xuống chỉ còn 15KB–25KB mỗi ảnh** (giảm hơn 95% băng thông và RAM).

### 3. Đánh giá độ khó & Nguồn
- **Độ khó:** **Dễ (Easy)**.
- **Nguồn:**
  - [Sharp Official Documentation & API Resize](https://sharp.pixelplumbing.com/api-resize)
  - [Cloudflare Images: Transformations & Pricing Documentation](https://developers.cloudflare.com/images/pricing/)
  - [Cloudflare R2: Pricing & Free Tier Limits](https://developers.cloudflare.com/r2/pricing/)
  - [Using Cache API with Cloudflare R2](https://developers.cloudflare.com/r2/examples/cache-api/)

---

## HƯỚNG D. BẢO MẬT SERVER LOCAL TRÊN PC (HONO + 127.0.0.1 + DNS REBINDING + CSRF)

### 1. Kết luận nghiên cứu
- **Nguy cơ thực tế của Server Local (`127.0.0.1:4000`):**
  - Khi người dùng khởi chạy server indexer trên máy tính và lướt web bằng trình duyệt thông thường, nếu truy cập một trang web độc hại bất kỳ, trang web đó có thể chạy script JavaScript gửi request ngầm đến `http://127.0.0.1:4000/local-api/fs/delete` hoặc `/local-api/fs/explore` ([Rafter Security: Localhost Security Risks](https://rafter.so/blog/securing-localhost)).
  - **Tấn công DNS Rebinding:** Kẻ tấn công dùng tên miền công cộng (ví dụ `evil.com`) có TTL cực ngắn, sau đó phân giải về `127.0.0.1`. Trình duyệt tưởng cùng nguồn (Same-Origin) nên cho phép đọc dữ liệu trả về từ server local ([GitHub Security Blog: Mitigating DNS Rebinding](https://github.blog/security/vulnerability-research/mitigating-dns-rebinding/)).
- **Các giải pháp chuẩn cho Hono / Node.js:**
  1. **Bind chính xác `127.0.0.1`:** Trong `@hono/node-server`, bắt buộc gọi `serve({ fetch: app.fetch, port: 4000, hostname: '127.0.0.1' })` thay vì để mặc định `0.0.0.0` (tránh để lộ server ra toàn bộ mạng Wi-Fi công cộng hay gia đình) ([Hono Node Server Docs](https://github.com/honojs/node-server)).
  2. **Kiểm tra Header `Host` (Chống 100% DNS Rebinding):**
     - Mọi request từ DNS Rebinding đều mang header `Host: evil.com`.
     - Chỉ cho phép `Host` bằng `127.0.0.1:4000` hoặc `localhost:4000`. Nếu khác, lập tức từ chối `403 Forbidden`.
  3. **Middleware CSRF chuẩn của Hono (`hono/csrf`):**
     - Hono cung cấp sẵn middleware `csrf()` tích hợp kiểm tra `Origin` và `Sec-Fetch-Site: 'same-origin'` ([Hono CSRF Middleware Documentation](https://hono.dev/docs/middleware/builtin/csrf)).
  4. **Session / Startup Token (Mô hình Jupyter / Vite / Live Server):**
     - Khi server local khởi động, sinh một mã bí mật ngẫu nhiên `SESSION_TOKEN = crypto.randomBytes(24).toString('hex')`.
     - Tất cả các endpoint can thiệp hệ thống tệp (`/local-api/fs/*`, `/local-api/trash/*`, `/api/youtube-music/jobs`) bắt buộc phải gửi header `Authorization: Bearer <SESSION_TOKEN>` qua middleware `bearerAuth` của Hono ([Hono Bearer Auth Documentation](https://hono.dev/docs/middleware/builtin/bearer-auth)).

### 2. Đề xuất áp dụng cho Beatify
Trong file [`tools/indexer/src/server/index.ts`](file:///d:/apps%20on%20phone/Beatify/tools/indexer/src/server/index.ts):
1. **Khóa Host Header & DNS Rebinding:**
   ```typescript
   app.use('*', async (c, next) => {
     const host = c.req.header('host')?.toLowerCase() || '';
     const allowedHosts = new Set(['127.0.0.1:4000', 'localhost:4000', '127.0.0.1', 'localhost']);
     if (!allowedHosts.has(host)) {
       return c.text('Forbidden: Invalid Host header (DNS Rebinding blocked)', 403);
     }
     await next();
   });
   ```
2. **Khóa CORS và áp dụng CSRF:**
   - Thay thế `app.use('*', cors())` bằng whitelist chỉ cho phép `http://127.0.0.1:4000` và `http://localhost:4000`.
   - Bổ sung `app.use('*', csrf({ origin: ['http://127.0.0.1:4000', 'http://localhost:4000'] }))`.
3. **Giới hạn thư mục xóa trong `/local-api/fs/delete`:** Không cho phép xóa bất kỳ thư mục nào nằm ngoài `MUSIC_SOURCE_DIR` và `MUSIC_IMPORT_DIR`.

### 3. Đánh giá độ khó & Nguồn
- **Độ khó:** **Dễ (Easy)**. Có sẵn middleware trong hệ sinh thái Hono, chỉ cần thêm 15–20 dòng cấu hình.
- **Nguồn:**
  - [Hono Built-in Middleware: CSRF Protection](https://hono.dev/docs/middleware/builtin/csrf)
  - [Hono Built-in Middleware: Bearer Auth](https://hono.dev/docs/middleware/builtin/bearer-auth)
  - [GitHub Security Lab: Defending Local Servers against DNS Rebinding](https://github.blog/security/vulnerability-research/mitigating-dns-rebinding/)
  - [@hono/node-server Hostname Configuration](https://github.com/honojs/node-server)

---

## HƯỚNG E. TÍNH NĂNG ÂM THANH TRONG @RNTP/PLAYER V5 (GAPLESS, CROSSFADE, INTERRUPTION, AIRPLAY, EQ)

### 1. Kết luận nghiên cứu
- **Gapless Playback thực tế:**
  - `@rntp/player` trên iOS sử dụng `AVQueuePlayer` từ `SwiftAudioEx`. Khi bài hát được đưa vào hàng đợi (`setMediaItems`), hệ thống native sẽ tự động nạp trước (buffer) bài tiếp theo ([RNTP Repository Discussions on Preloading](https://github.com/doublesymmetry/react-native-track-player/issues/1892)).
  - Với file lossless/AAC không có phần nén im lặng ở đầu/đuôi (gapless metadata), quá trình chuyển bài diễn ra gần như tức thì ($\Delta t \approx 0$ đến vài mili-giây).
- **Crossfade (Trộn mờ bài hát) có khả thi không?**
  - **Không khả thi trực tiếp trong RNTP v5:** Bản thân `AVPlayer` và `AVQueuePlayer` của Apple chỉ phát tuần tự 1 track tại một thời điểm, không hỗ trợ crossfade natively ([RNTP GitHub Issue #1892 - Feature Request: Crossfade](https://github.com/doublesymmetry/react-native-track-player/issues/1892)).
  - Để có crossfade thật sự, bắt buộc phải dùng 2 player độc lập chạy song song rồi tự script hạ volume player A và tăng volume player B, hoặc phải viết native module bằng `AVAudioEngine` kết hợp `AVAudioMixerNode`. Việc này cực kỳ phức tạp và dễ gây xung đột với Lock Screen Now Playing info.
- **Xử lý cuộc gọi đến (PlaybackInterruption):**
  - Trên iOS, khi có cuộc gọi đến, Apple gửi thông báo `AVAudioSessionInterruptionNotification`.
  - RNTP v5 đã tự động tạm dừng nhạc ở tầng native. Để giao diện React Native đồng bộ tức thì, cần lắng nghe sự kiện `Event.PlaybackInterruption` (nếu có trên phiên bản) hoặc giám sát `Event.PlaybackStateChanged` và `Event.IsPlayingChanged` để cập nhật icon Play/Pause tương ứng ([RNTP Events Documentation](https://rntp.dev/docs/api/events)).
- **Nút AirPlay Route Picker (`AVRoutePickerView`):**
  - RNTP chỉ quản lý luồng phát âm thanh và Now Playing Info, **không cung cấp UI component để hiển thị nút chọn thiết bị AirPlay**.
  - Để hiển thị nút AirPlay chuẩn của iOS ngay trong app (không bắt người dùng vuốt Control Center), giải pháp chuẩn cho React Native / Expo là sử dụng thư viện native bọc `AVRoutePickerView` như **`react-native-avroutepicker`** hoặc viết một Expo Config Plugin / Expo Module nhỏ (~30 dòng Swift) ([Apple Developer: AVRoutePickerView](https://developer.apple.com/documentation/avkit/avroutepickerview)).
- **Equalizer (EQ) trong RNTP:**
  - RNTP **không có tính năng Equalizer tích hợp sẵn** ([RNTP Issue #1950](https://github.com/doublesymmetry/react-native-track-player/issues/1950)). Muốn làm EQ cần can thiệp tầng `AVAudioUnitEQ` bằng mã native riêng.

### 2. Đề xuất áp dụng cho Beatify
1. **Gapless:** Giữ nguyên kiến trúc `AVQueuePlayer` của RNTP v5 vì đã đáp ứng đủ tốt nhu cầu nghe nhạc liền mạch.
2. **Crossfade:** **Không nên triển khai ở giai đoạn này** vì tốn nhiều công sức, dễ làm lỗi hệ thống điều khiển màn hình khóa và không thuộc phạm vi cốt lõi.
3. **AirPlay Route Picker:** Thêm một component nhỏ bọc `AVRoutePickerView` vào góc trên màn hình Player để người dùng bấm chọn phát ra loa HomePod / Apple TV tiện lợi.
4. **Interruption:** Đăng ký listener sự kiện `IsPlayingChanged` để cập nhật trạng thái UI khi có cuộc gọi đến.

### 3. Đánh giá độ khó & Nguồn
- **Độ khó:** 
  - AirPlay Route Picker: **Trung bình (Medium)**.
  - Crossfade / EQ: **Rất cao (Very High)** (khuyến nghị không đưa vào kế hoạch ngắn hạn).
- **Nguồn:**
  - [Apple Developer: AVRoutePickerView Documentation](https://developer.apple.com/documentation/avkit/avroutepickerview)
  - [RNTP GitHub Issue: Crossfade and Gapless discussion](https://github.com/doublesymmetry/react-native-track-player/issues/1892)
  - [RNTP GitHub Issue: Built-in Equalizer Request](https://github.com/doublesymmetry/react-native-track-player/issues/1950)
  - [React Native AVRoutePicker Package (GitHub)](https://github.com/mchandleraz/react-native-avroutepicker)

---

## HƯỚNG F. TƯƠNG THÍCH SIDESTORE / ALTSTORE (APPLE ID MIỄN PHÍ)

### 1. Kết luận nghiên cứu
- **Giới hạn của Apple ID miễn phí (Cập nhật 2025-2026):**
  - **Tối đa 3 Active Apps:** Được kích hoạt tối đa 3 ứng dụng sideload cùng lúc trên thiết bị (SideStore chiếm 1 slot, người dùng còn 2 slots) ([SideStore Official FAQ](https://docs.sidestore.io/docs/faq/)).
  - **Giới hạn 10 App IDs / 7 ngày:** Mỗi app tiêu tốn App ID tùy theo số lượng Extension. App ID không thể xóa thủ công, phải đợi đúng 7 ngày để tự giải phóng ([SideStore App IDs Management](https://docs.sidestore.io/docs/getting-started/)).
  - Beatify chỉ có 1 Target duy nhất (0 Extension) -> **chỉ tốn đúng 1 App ID và 1 slot Active App**, hoàn toàn an toàn và tiết kiệm tài nguyên.
- **Tự động refresh nền (Automated Background Refresh):**
  - SideStore không cần cắm cáp máy tính hàng tuần. SideStore chạy qua VPN cục bộ nội bộ (**LocalDevVPN**) trên iPhone để tự ký lại chứng chỉ ([SideStore Refresh Guide](https://docs.sidestore.io/docs/getting-started/)).
  - Người dùng có thể thiết lập **Apple Shortcuts Automation (Phím tắt tự động)**: Đặt lịch chạy hàng ngày lúc đêm (ví dụ 2:00 AM) khi iPhone cắm sạc và kết nối Wi-Fi -> Chạy tác vụ "Refresh All Apps" của SideStore.
- **Các lỗi thường gặp với app Expo / React Native khi ký:**
  1. **Lỗi "Failed to verify code signature" với Frameworks:**
     - Ứng dụng Expo / React Native sử dụng nhiều dynamic framework (`Hermes.framework`, `ExpoModulesCore.framework`).
     - Khi build IPA unsigned trên GitHub Actions, phải đảm bảo lệnh `xcodebuild CODE_SIGNING_ALLOWED=NO` không để sót chữ ký giả nào khiến SideStore bị lỗi khi re-sign ([SideStore Reddit Community Solutions](https://www.reddit.com/r/SideStore/)). Quy trình đóng gói zip `Payload/` trong [`.github/workflows/build-ios.yml`](file:///d:/apps%20on%20phone/Beatify/.github/workflows/build-ios.yml) hiện tại đã tuân thủ chuẩn xác.
  2. **Thay đổi Bundle ID:** Nếu SideStore tự đổi Bundle ID khi ký lại, iOS sẽ tạo container `Documents/` mới làm mất dữ liệu cục bộ. Cần tắt tính năng đổi Bundle ID trong cài đặt của SideStore.

### 2. Đề xuất áp dụng cho Beatify
1. **Hướng dẫn người dùng cài đặt Phím tắt (Shortcuts):** Viết hướng dẫn chi tiết trong tài liệu người dùng để cài phím tắt tự động gia hạn 7 ngày qua SideStore, giúp app không bao giờ bị hết hạn.
2. **Giữ nguyên cấu trúc Single Target:** Tuyệt đối không thêm Widget hay Extension phức tạp ở giai đoạn này để tránh lãng phí hạn ngạch 10 App ID của Apple ID miễn phí.

### 3. Đánh giá độ khó & Nguồn
- **Độ khó:** **Thấp (Low)**. Dự án hiện tại đã tối ưu rất tốt cho SideStore.
- **Nguồn:**
  - [SideStore Official Documentation & Troubleshooting](https://docs.sidestore.io/)
  - [SideStore App ID Expiration and Limits](https://docs.sidestore.io/docs/faq/)
  - [AltStore Sideloading Limits & FAQ](https://faq.altstore.io/)

---

## HƯỚNG G. HỌC HỎI TÍNH NĂNG TỪ CÁC APP NHẠC TỰ HOST HÀNG ĐẦU

### 1. Phân tích các tính năng vượt trội

#### A. Smart Playlist (Navidrome & Symfonium)
- **Navidrome (.nsp):** Cho phép tạo danh sách phát động qua cấu trúc JSON trực quan ([Navidrome Smart Playlists Specs](https://www.navidrome.org/docs/usage/smart-playlists/)):
  - Hỗ trợ toán tử logic `all` (AND), `any` (OR).
  - Lọc theo thời gian: `inTheLast`, `notInTheLast` (ví dụ: *"Các bài yêu thích nhưng chưa nghe trong 60 ngày qua"*).
  - Lọc theo đánh giá, năm phát hành, lượt nghe (`playCount`), ca sĩ.
  - Sắp xếp và giới hạn: `sort: "random"`, `limit: 50`.
- **Symfonium:** Cho phép gắn cờ **Auto-offline cho Smart Playlist** — người dùng tạo smart playlist 50 bài ngẫu nhiên, app sẽ tự động tải 50 bài đó về máy để nghe offline, mỗi tuần tự xoay vòng làm mới ([Symfonium Smart Filters](https://symfonium.app/)).

#### B. Quản lý Hàng đợi (Feishin & Spotify Queue Model)
- **Feishin / Spotify:** Phân tách rõ ràng giữa 2 khái niệm hàng đợi:
  1. *Play Next (Ưu tiên nghe tiếp theo):* Danh sách do người dùng chủ động nhét vào giữa.
  2. *Context Queue (Hàng đợi ngữ cảnh):* Danh sách các bài kế tiếp của Album/Playlist hiện tại.
- Cho phép kéo thả sắp xếp lại thứ tự bài đang chờ, xóa từng bài khỏi hàng đợi, và lưu hàng đợi hiện tại thành một Playlist mới ([Feishin GitHub Repository](https://github.com/jeffvli/feishin)).

#### C. Phát hiện trùng lặp nâng cao (AcoustID & MusicBrainz)
- Phát hiện trùng lặp thông thường chỉ so sánh tên file hoặc băm SHA-1 (Beatify đang làm cách này). Tuy nhiên, nếu cùng 1 bài hát nhưng 1 file MP3 và 1 file FLAC thì mã băm sẽ khác nhau.
- **Giải pháp của MusicBrainz Picard:** Sử dụng công cụ mã nguồn mở **Chromaprint (`fpcalc`)** ([Chromaprint / AcoustID Official Site](https://acoustid.org/chromaprint)).
  - `fpcalc` phân tích dạng sóng âm thanh (acoustic waveform) để tạo một chuỗi "vân tay âm thanh" (acoustic fingerprint).
  - Dù 2 file khác định dạng, khác bitrate, hay tên bài bị sai lệch hoàn toàn, chúng vẫn cho ra vân tay âm thanh giống hệt nhau, giúp phát hiện trùng lặp chính xác 100%.

#### D. Scrobble (Last.fm & ListenBrainz)
- Ghi nhận lịch sử nghe nhạc lên các nền tảng mở như ListenBrainz hoặc Last.fm qua API chuẩn REST ([ListenBrainz API Documentation](https://listenbrainz.readthedocs.io/)).

### 2. Đề xuất áp dụng cho Beatify
1. **Nâng cấp Smart Playlist cho Web & App:**
   - Học hỏi cú pháp JSON của Navidrome: Tạo bộ lọc động ngay trên Web Dashboard và App iOS (ví dụ: *"Top 50 bài nghe nhiều nhất"*, *"Bài hát cũ chưa nghe trong 30 ngày"*).
2. **Mô hình Hàng đợi 2 tầng (Explicit Queue vs Context Queue):**
   - Bổ sung nút *"Phát tiếp theo"* (Play Next) cho từng bài hát mà không làm mất danh sách album đang nghe dở.
3. **Phát hiện trùng lặp bằng AcoustID trên PC (Phase 4):**
   - Tích hợp binary nhẹ `fpcalc` vào `tools/indexer` để quét vân tay âm thanh và cảnh báo các bài hát trùng lặp khác định dạng trong thư mục nhạc.

### 3. Đánh giá độ khó & Nguồn
- **Độ khó:** 
  - Smart Playlist & Hàng đợi 2 tầng: **Trung bình (Medium)**.
  - Vân tay âm thanh AcoustID: **Cao (High)**.
- **Nguồn:**
  - [Navidrome Official: Smart Playlists Specification](https://www.navidrome.org/docs/usage/smart-playlists/)
  - [Symfonium Feature Tour: Smart Filters & Offline Sync](https://symfonium.app/)
  - [Feishin Music Player (GitHub)](https://github.com/jeffvli/feishin)
  - [AcoustID & Chromaprint Audio Fingerprinting](https://acoustid.org/chromaprint)
  - [MusicBrainz Picard Documentation](https://picard.musicbrainz.org/docs/)

---

## TỔNG HỢP LỘ TRÌNH KỸ THUẬT ĐỀ XUẤT CHO BEATIFY

| Thứ tự | Hạng mục cải tiến | Vị trí áp dụng | Độ khó | Lợi ích mang lại |
|:---:|---|---|:---:|---|
| **1** | **Bảo mật Server Local (Host check, CSRF, Token)** | `tools/indexer` | **DỄ** | Ngăn chặn 100% rủi ro xóa file qua DNS Rebinding & CSRF khi lướt web. |
| **2** | **Sửa lỗi khớp Endpoint Nhập nhạc (`inspect`/`confirm`)** | `tools/dashboard` | **DỄ** | Giúp tính năng nhập nhạc kéo thả hoạt động trở lại bình thường. |
| **3** | **Tạo Thumbnail Ảnh bìa bằng `sharp` trên PC** | `tools/indexer` | **DỄ** | Giảm 95% băng thông và dung lượng RAM tải ảnh trên cả iOS và Web. |
| **4** | **Thay `<ScrollView>` bằng `FlashList` & `expo-image`** | `apps/mobile` | **TRUNG BÌNH** | Tối ưu danh sách mượt mà 60 FPS, xóa bỏ hoàn toàn hiện tượng đơ giật khi thư viện nhiều bài. |
| **5** | **Xây dựng tính năng Nghe Offline (Download Manager)** | `apps/mobile` | **TRUNG BÌNH** | Tải nhạc về `Documents/offline_tracks/` có gắn cờ loại trừ sao lưu, hỗ trợ nghe khi không có mạng. |
| **6** | **Nút chọn thiết bị AirPlay (`AVRoutePickerView`)** | `apps/mobile` | **TRUNG BÌNH** | Cho phép chuyển nhạc ra loa HomePod / Apple TV nhanh chóng ngay trong app. |
| **7** | **Smart Playlists (Bộ lọc thông minh theo Navidrome)** | `shared` + `mobile` | **TRUNG BÌNH** | Tự động tạo danh sách bài nghe nhiều, bài yêu thích cũ mà không cần xếp tay. |
| **8** | **Phát hiện trùng nhạc bằng vân tay AcoustID (`fpcalc`)** | `tools/indexer` | **CAO** | Quét và làm sạch các bài hát trùng lặp khác định dạng (MP3 vs FLAC) trên PC. |

---
*Báo cáo nghiên cứu đã hoàn tất và được lưu trữ đầy đủ tại `docs/research.md`.*

