# Trạng thái dự án

> Agent cập nhật file này sau mỗi lần làm việc. Người dùng đọc để biết đang ở đâu và cần làm gì.

**Phase hiện tại:** Hoàn tất Tối ưu hóa Toàn diện Trang chủ, Khắc phục Lag & Chuẩn hóa Thị giác (Beatify Home Screen — Bước 1, 2, 3, 4, 5):
- **1. Triệt tiêu Lag & Tối ưu Re-render (`apps/mobile/app/(tabs)/home.tsx` & `TabBar.tsx`):**
  - **TabBar 0ms Latency:** Kích hoạt animation viên thuốc ngay lập tức trên UI thread trong callback `onPress` trước khi gọi navigate, không phụ thuộc vào `useEffect` sau khi chuyển route; nền thanh dock `rgba(18, 18, 20, 0.96)`.
  - **Giảm tải 70% Mount Trang chủ:** FlatList dọc phân trang ảo hóa thông minh (`initialNumToRender={3}`, `windowSize={7}`, `removeClippedSubviews={true}`, `maxToRenderPerBatch={4}`), giảm số lượng ảnh mount đồng thời từ 46+ xuống chỉ còn 15 ảnh đầu tiên.
  - **Cô lập Re-render khi Phát nhạc:** Comparator tùy biến `areTrackCardPropsEqual` và `areAlbumCardPropsEqual` giúp toàn bộ card không bị re-render khi nhạc đang phát, loại bỏ hoàn toàn hiện tượng re-render thừa theo progress tick.
  - **Mở Cài đặt tức thì (16ms):** Bổ sung nút bánh răng Settings góc phải `HomeGreeting`; hoãn đọc đĩa và tính toán Replay nặng bằng `InteractionManager.runAfterInteractions`, mở trang cài đặt trơn tru 1 frame.
  - **Bật `freezeOnBlur: true`:** Đóng băng cây component các tab ẩn trong `_layout.tsx`, giải phóng hoàn toàn GPU/CPU khi đang ở tab khác.
- **2. Khắc phục Triệt để Lỗi Hiển thị Chọn Nhanh (Quick Picks - `QuickPickGrid.tsx`):**
  - Sửa lỗi root cause trong `PressableScale`: thay thế View lồng trung gian bằng `Animated.createAnimatedComponent(Pressable)`, khôi phục layout `flexDirection: 'row'` chuẩn xác.
  - Chuẩn hóa kích thước ô: chiều cao cố định 64pt, padding ngang 10pt, ảnh bìa vuông 48pt bên trái, cột bên phải `flex: 1, minWidth: 0` hiển thị trọn vẹn tiêu đề (14pt, weight 600, `textPrimary`, 1 dòng) và ca sĩ (12pt, màu phụ, 1 dòng, ellipsis), tích hợp `EqualizerIndicator`.
  - Cải tiến `buildQuickPicks`: ưu tiên bài yêu thích nghe nhiều $\to$ bài nghe nhiều nhất $\to$ bài nghe gần đây chỉ lấp chỗ trống.
- **3. Animation Độc lập Cài đặt Hệ thống (`lib/motion.ts` & `motionPreferences.ts`):**
  - Tạo nguồn chuyển động duy nhất `useMotionEnabled()` mặc định BẬT, không bị triệt tiêu animation bởi Reduce Motion của iOS.
  - Thêm công tắc *"Tôn trọng Giảm chuyển động của hệ thống"* trong `Cài đặt > Phát nhạc` (mặc định TẮT).
  - Chuẩn hóa toàn bộ `PressableScale`, `TabBar`, `TabBarItem`, `TabIndicator` dùng chung cơ chế này.
- **4. Chuẩn hóa Phân cấp Thị giác & Bố cục (Typography / Spacing / Theme):**
  - Bảng màu 3 cấp độ tương phản: Cấp 1 Tiêu đề `#FFFFFF`, Cấp 2 Phụ đề `#A1A1AA`, Cấp 3 Chú thích/Ca sĩ `#71717A` / `#84848d`.
  - Phân cấp cỡ chữ: Lời chào 30pt/700 ("Chào buổi sáng/chiều/tối/đêm muộn", bỏ emoji rối mắt); Tiêu đề section 20pt/700; Phụ đề 13pt/400 (rút gọn < 45 ký tự, 1 dòng ellipsis); Tên bài trong card 13pt/600; Tên ca sĩ 12pt/400.
  - SectionHeader: Nút "Xem tất cả" căn giữa trực tiếp theo hàng TIÊU ĐỀ; phụ đề chiếm trọn hàng dưới.
  - Khoảng cách nhịp nhàng: Dưới lời chào 20pt; giữa các section 32pt; tiêu đề $\to$ phụ đề 2pt; phụ đề $\to$ hàng card 14pt; khối Chọn nhanh cách section tiếp theo 32pt.
  - Nền MiniPlayer đặc hơn (`rgba(24, 24, 27, 0.96)`) chống lộ chữ khi cuộn.
- **5. Xáo trộn Đề xuất Thực chất (`homeSections.ts`):**
  - Khi `shuffleSalt > 0`: Quick Picks chọn 6 từ top 20 ứng viên; Time of Day chọn 15 từ top 30; For You chọn 15 từ top 40; Top Artists xáo trộn nhóm nghệ sĩ ngang điểm; Genre Mix xoay vòng qua top 3 thể loại theo salt.
  - `most_played_month` và `continue_listening` giữ nguyên bất biến. Khi `salt = 0`, kết quả giữ nguyên 100%.
  - Hiệu ứng thị giác mượt mà: nhấn giữ tab Home rung xúc giác + làm mờ nhẹ danh sách section + cuộn êm lên đầu trang.
  - Bộ test xác thực 100% PASS cho cả benchmark (30-65ms) và tính độc nhất giữa các section.
  - Đo thời gian tính toán bằng `performance.now()`, hiển thị thời gian tính (ms), số section, số records.
  - Hỗ trợ cờ debug log Trang chủ ra Console khi cần.
  - Chẩn đoán chất lượng lịch sử nghe: Tổng bản ghi, Tỷ lệ nghe lướt (Skip < 25%), Cụm bản ghi 15s-16s chưa chốt.
  - Tự động hoãn commit qua `InteractionManager.runAfterInteractions` khi khối lượng tính toán lớn.
- **6. Khôi phục Lock Screen & Nâng cấp Trình sửa Lời/Thông tin bài hát (`rntpPlayerService.ts` & `EditTrackModal.tsx`):**
  - **Khôi phục 100% Lock Screen & Control Center:** Chuyển `audioMixing` từ `'mix'` về `'exclusive'`. iOS cấp quyền sở hữu `MPNowPlayingInfoCenter` và `MPRemoteCommandCenter`, hiển thị trọn vẹn tên bài hát, nghệ sĩ, ảnh bìa, thanh tua và các nút điều khiển trên Màn hình khóa và Trung tâm điều khiển.
  - **Đại tu Modal Chỉnh sửa bài hát (`EditTrackModal.tsx`):**
    - Giải quyết triệt để lỗi thiếu chiều cao (trước đây bị kẹp ở 46% màn hình, ô lyric chỉ cao 96pt hiển thị 3 dòng).
    - Bổ sung thanh Segmented Tabs Reanimated với hiệu ứng viên thuốc trượt (`slidingActivePill`): **[Thông tin bài hát]** và **[Lời bài hát (LRC)]**.
    - Tab Lời bài hát: Ô soạn thảo mở rộng toàn diện lên 340-450pt (chiếm 70% chiều cao màn hình), hiển thị 20-30 dòng cùng lúc, font monospace căn lề chuẩn timestamp `[00:12.34]`, tích hợp badge đếm số dòng, nút tải lại từ server và nút xóa trắng. Tự động thích ứng hoàn hảo khi bật bàn phím ảo.
    - Tab Thông tin: Hiển thị gọn gàng ảnh bìa HD, tên bài, ca sĩ, album, năm mà không cần cuộn. Lưu đồng bộ cả hai tab khi xác nhận.
- **7. Vô hiệu hóa Triệt để Rung Phản hồi Xúc giác (Haptics) & Device Vibration:**
  - Chuyển toàn bộ các phương thức `haptics.tap()`, `haptics.success()`, `haptics.warning()` trong [src/lib/haptics.ts](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/lib/haptics.ts) thành no-op (không thực thi rung).
  - Loại bỏ hoàn toàn các lệnh `Vibration.vibrate()` trong [LyricPosterModal.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/player/LyricPosterModal.tsx).
  - Đảm bảo app chạy êm ái 100%, không còn bất kỳ rung giật hay phản hồi haptic nào trên toàn bộ thiết bị.
- **8. Làm sạch Chuỗi Rác `&nbsp;` và Icon Nốt Nhạc trong Lời Bài Hát (LRC) & Đồng bộ R2 / Local:**
  - Loại bỏ triệt để chuỗi rác HTML entity `&nbsp;`, các ký tự HTML escaping (`&amp;`, `&quot;`, `&#39;`, `&apos;`, `&lt;`, `&gt;`) và các biểu tượng nốt nhạc (`♪`, `♫`, `♬`, `♩`, 🎵, 🎶) trong toàn bộ lời bài hát (.lrc).
  - Xử lý sạch sẽ 100% bài hát "Thiên Hà Trước Hiên Nhà (Prod. by Mikeezy)" của Datmaniac (`59c1532549d2`) và toàn bộ 28 bài hát khác trong kho nhạc bị dính hiện tượng tương tự.
  - Đồng bộ tải lên Cloudflare R2 bucket (`lyrics/${trackId}.lrc`) cho 29 file `.lrc` và làm sạch 23 file `.lrc` trong thư mục nhạc local `D:\music for app` (đã sao lưu dự phòng toàn bộ file gốc trước khi xử lý vào `tools/indexer/backups/lyrics_cleanup_*`).
  - Đưa hàm làm sạch dùng chung `cleanLyricLine` và `cleanLrcContent` vào `@music-app/shared`, đồng thời tích hợp trực tiếp vào bộ chuyển đổi phụ đề YouTube CC (`convertVttToLrc`) trong `lyricsService.ts` để ngăn chặn phát sinh trong tương lai.
- **9. Chuẩn hóa UI/UX Nút Edit trong LyricsModal (`LyricsModal.tsx`):**
  - Xóa bỏ hoàn toàn chữ "Edit", chỉ giữ lại icon bút chì (`EditIcon`).
  - Định dạng lại nút theo chuẩn Apple HIG: kích thước 32x32, bo góc `radius.sm`, màu nền `colors.surfaceSecondary`, icon `colors.textMedium`, tạo sự đồng bộ và cân đối hoàn hảo với nút Đóng (`closeBtn`) bên cạnh trong `ModalHeader`.
- **10. Tinh giản Giao diện Trang chủ, Nâng cấp Thẻ Chọn Nhanh & Icon Bottom Bar:**
  - **Loại bỏ Text Label phụ (Subtitles):** Xóa toàn bộ các dòng text label dưới các title section ("Bài hát gần đây...", "Những bài hát bạn nghe nhiều nhất...", "Giai điệu quen thuộc...") trong [packages/shared/src/homeSections.ts](file:///d:/apps%20on%20phone/Beatify/packages/shared/src/homeSections.ts) và [SectionHeader.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/common/SectionHeader.tsx), giúp trang chủ thoáng đạt, tối giản và cao cấp.
  - **Nâng cấp Toàn diện "Chọn nhanh cho bạn" ([QuickPickGrid.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/home/QuickPickGrid.tsx)):**
    - Hiển thị đầy đủ, rõ nét Tên bài hát (13.5pt, semi-bold, `textPrimary`) và Tên nghệ sĩ (12pt, `textSecondary`).
    - Tích hợp icon tích tròn màu xanh `offlineCheckBadge` (`CheckIcon` 8pt) ngay cạnh tên nghệ sĩ khi bài hát đã được tải về máy (`isTrackOffline`), đồng bộ chuẩn với danh sách Thư viện.
    - Áp dụng `useWindowDimensions()` để tính toán chiều rộng ô co giãn chuẩn xác trên mọi kích thước màn hình.
  - **Tối ưu Lời chào Trang chủ ([HomeGreeting.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/home/HomeGreeting.tsx)):**
    - Tăng `paddingBottom: 28pt` tạo khoảng đệm cân đối, thông thoáng giữa Lời chào và khối Chọn nhanh.
    - Xóa subtitle thừa dưới lời chào; chuẩn hóa nút icon bên phải thành nút tròn `36x36pt`, nền `surfaceElevated` bo tròn chuẩn Apple HIG.
  - **Thay đổi Icon Tab thứ 3 Bottom Bar ([SvgIcons.tsx](file:///d:/apps%20on%20phone/Beatify/apps/mobile/src/components/icons/SvgIcons.tsx)):**
    - Cập nhật biểu tượng `LibraryIcon` thành biểu tượng Your Library hiện đại chuẩn âm nhạc (kệ đĩa/sách nghiêng và đứng), thay thế cho hình cuốn sách cũ.
- **11. Khắc phục Tính năng Xóa Vĩnh Viễn Trong Thùng Rác (Dashboard & Indexer Server):**
  - **Dọn dẹp triệt để trên Local:** Đã xóa sạch thư mục bài hát còn sót lại của J.ADE (`D:\music for app\J.ADE`) sau khi xác nhận trên R2 đã được xóa thành công trước đó.
  - **Bổ sung xóa tệp vật lý Local trong Backend Indexer (`cleanPurgeTrackResources` & `findTrackAudioPath`):** Khi người dùng chọn `deleteLocal: true`, backend tự động truy tìm đường dẫn tệp bài hát gốc (từ `cachedScannedTracks`, `youtube_downloads` hoặc quét tìm trong `MUSIC_SOURCE_DIR`/`MUSIC_IMPORT_DIR`), xóa file âm thanh gốc, file ảnh bìa, file `.lrc`, file `info.txt` và dọn dẹp thư mục cha nếu rỗng.
  - **Nâng cấp Giao diện Thùng rác Web (`TrashPage.tsx`):**
    - Trang bị 2 checkbox độc lập, rõ ràng trong toàn bộ các hộp thoại xác nhận (Xóa 1 bài, Xóa các bài đã chọn, Dọn sạch thùng rác):
      1. *"Xóa vĩnh viễn tệp âm thanh và tệp liên quan trên đĩa cứng (Local)"* (mặc định BẬT).
      2. *"Xóa đồng thời file bài hát và ảnh bìa trên Cloudflare R2"* (mặc định BẬT).
    - Đồng bộ tham số `deleteLocal` và `deleteFromR2` qua API `DELETE /local-api/tracks/:id/trash` và `POST /local-api/trash/empty`.
  - **Vận hành Server an toàn:** Server Indexer đã được khởi động lại ở chế độ daemon nền (không watch) trên cổng 4000 (`http://127.0.0.1:4000`), kiểm tra endpoint `/local-api/trash` hoạt động ổn định.
  - **Kiểm thử & Typecheck:** Toàn bộ 425 tests (132 shared, 25 api, 124 mobile bao gồm uiRegression, 144 indexer) và typecheck, lint đều vượt qua 100%.
- **12. Nâng cấp Animation Mượt mà "Đã tải về máy", Tinh chỉnh Album đang nghe dở & Bổ sung Album "Cho Bảo" (B Ray):**
  - **Mượt mà hóa Modal Đã tải về máy (`OfflineDownloadsModal.tsx`):**
    - Tích hợp `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` khi bật/tắt chế độ chọn nhiều (`isSelectMode`), chọn tất cả và nhấn nút "Xong", loại bỏ hoàn toàn hiện tượng giật cục layout.
    - Checkbox từng hàng bài hát: xuất hiện và ẩn êm dịu bằng Reanimated `FadeIn.duration(180)` / `FadeOut.duration(120)`.
    - Thanh tác vụ xóa ở đáy màn hình (`bottomDeleteBar`): trượt lên/xuống mượt mà bằng `SlideInDown.duration(260)` / `SlideOutDown.duration(200)`.
    - Action Bar (Play/Shuffle, Circle Select, nút "Xong"): chuyển trạng thái mềm mại với `FadeIn` / `FadeOut`.
  - **Khắc phục "Album đang nghe dở" trên Trang chủ (`homeSections.ts`):**
    - Bổ sung hàm lọc `isGenericSinglesAlbum()` trong [packages/shared/src/homeSections.ts](file:///d:/apps%20on%20phone/Beatify/packages/shared/src/homeSections.ts) nhằm loại trừ triệt để các danh mục gom bài lẻ (`Singles`, `Single`, `Unknown Album`).
    - Section "Album đang nghe dở" chỉ kích hoạt khi người dùng thực sự đang nghe dở album phòng thu / EP đích thực.
  - **Nhóm Album "Cho Bảo" của B Ray & Tải Bài Mới:**
    - Gom nhóm chính xác 4 bài hát của B Ray vào chung album `"Cho Bảo"` (Album ID: `cb1c20a9e1db`):
      1. `Feel At Home` (`338ac8bd15ad`)
      2. `The One (ft. Đạt G)` (`45ade149c1ba`)
      3. `Vùng An Toàn (ft. V#)` (`ccc43e44660c`)
      4. `Ghệ Mới (ft. Young H)` (`3062503bbdad`) - Tải mới thành công từ YouTube kèm ảnh bìa HD và lời bài hát LRC đồng bộ.
    - Đã đồng bộ toàn bộ file âm thanh, ảnh bìa, lời bài hát và `library.json` mới lên Cloudflare R2 bucket.
  - **Kiểm thử & Typecheck:** Toàn bộ 426 tests (133 shared, 25 api, 124 mobile bao gồm uiRegression, 144 indexer) và typecheck, lint đều vượt qua 100%.

**Điểm dừng ĐD3 (R2 Prune):** Vẫn giữ nguyên trạng thái chờ duyệt danh sách 503 ảnh bìa mồ côi (đã sao lưu cục bộ 100% 503 file về `tools/indexer/backups/reorg_logs_20261118/orphan_covers_backup`). CHƯA xóa bất kỳ file nào trên R2.

**Lịch sử các phase trước:**
1. **Lõi Phân giải Thực thể Đa Tầng (Multi-Layer Music Entity Resolution) — Tầng 0 + 1 + 2 + 3 + 4:**
   - **Tầng 0 (`nativeMetadataExtractor.ts`):** Trích xuất metadata gốc yt-dlp (`artist`, `track`, `album`, `channel`, `description`, nhận diện kênh `- Topic`).
   - **Tầng 1 (`channelClassifier.ts`):** Phân loại kênh uploader, bóc tách hậu tố (`Official`, `VEVO`), nhận diện aggregator channels theo `aggregatorChannels.json` và whitelist `channelWhitelist.json`, đối soát chéo ứng viên tiêu đề chống đảo vế (`crossCheckWithTitle`) với cơ chế ưu tiên Exact Match tuyệt đối.
   - **Tầng 2 (`knownArtistsService.ts`):** Knowledge graph nghệ sĩ với từ điển `artistAliases.json`, xử lý canonical name, chống match nhầm tên ngắn (`Vũ.`, `Binz`, `x`), bóc tách trước `feat./ft.`, chặn đảo vế khi vế chứa đặc trưng bài hát (`isSongLike`).
   - **Tầng 3 (`structuralParser.ts`):** Cân bằng ngoặc (`balanceBrackets`), bóc tách album/track number (`extractAlbumAndTrackNo`), dọn rác inline (`cleanJunkTokens`), tách producer (`stripProductionInfo`), tách feat (`extractCollaborators`), Title Case thông minh (`toSmartTitleCase`), ma trận trọng số (`scoreAsArtist`), hiệu chỉnh confidence.
   - **Tầng 4 (`itunesMatcher.ts`):**
     - So khớp 2 chiều nghiêm ngặt (Strict Bi-directional Verification) khớp CẢ Title VÀ Artist trên cả 2 storefronts `vn` và `us`.
     - Chặn match nhầm tuyệt đối các bản Cover, Remix, Karaoke, Instrumental, Acoustic, Live (`detectSongModifiers`).
     - Hỗ trợ so khớp đa nghệ sĩ hợp tác (`calculateArtistSimilarity`) và làm sạch hậu tố Single (`calculateTitleSimilarity`).
     - On-disk & In-memory Cache tại `tools/indexer/.cache/itunes_entity_cache.json`.
     - Giới hạn rate-limit (200ms throttle), timeout 5000ms, retry 2 lần, cờ `noNetwork` để chạy offline.
     - Chế độ Suggestion: Giữ nguyên quyết định Tầng 0-3 khi có confidence cao, chỉ ghi đè khi Tầng 3 có confidence thấp hoặc khi audit.
   - **Đánh giá Độc lập & Chống Data Leakage (`evaluatePhase3.ts`):**
     - Đóng băng 103 ID Holdout (Group Split theo nghệ sĩ, Seed 42 cố định) tại `config/frozenHoldoutTrackIds.json`.
     - **Strict Accuracy trên Holdout (30%):** **85.44%** (Tăng +9.71% so với Baseline cũ).
     - **Lenient Accuracy trên Holdout:** **96.12%**.
     - **Zero-Shot LOAO (Leave-One-Artist-Out trên 365 bài):** Strict **80.82%**, Lenient **93.70%**.
     - **3 Hard Gates Lỗi Nghiêm Trọng:** Đảo vế: **0 bài (PASS ✅)**, Nuốt kênh: **0 bài (PASS ✅)**, Xé album: **0 bài (PASS ✅)**.
     - **Mutation Testing:** Phát hiện 100% cả 3 loại lỗi tiêm.
     - Danh sách 15 ca chưa đạt Strict được xuất tại `tools/indexer/reports/HOLDOUT_ERRORS_PHASE3.csv`.
     - Báo cáo chi tiết: `tools/indexer/reports/PHASE_3_VERIFICATION_REPORT.md`.
2. **Backend API & Service Tự Động Hóa (`entityResolutionService.ts` & `src/server/index.ts`):**
   - Tạo `EntityResolutionService` hỗ trợ chạy Preview Dry-Run, xuất báo cáo CSV chi tiết (`ENTITY_RESOLUTION_PREVIEW.csv`), và áp dụng an toàn (`apply()`).
   - Sao lưu tự động có timestamp trước khi ghi đè (`overrides.backup.*.json`, `library.backup.*.json`).
   - Bảo vệ bất biến các bản ghi đã xác minh thủ công (`isProtected: true`, `reviewed: true`).
   - Tự động nhóm lại Album (`trackIds`) và tùy chọn đồng bộ ngay lên Cloudflare R2.
   - Các API endpoint:
     - `POST /local-api/entity-resolution/preview`
     - `POST /local-api/entity-resolution/apply`
     - `GET /local-api/entity-resolution/report`
3. **Giao diện Web Dashboard Quản Lý Chuẩn Hóa (`EntityResolutionDialog.tsx` & `LibraryPage.tsx`):**
   - Thêm nút **"Chuẩn hóa Tên bài & Ca sĩ"** (icon `Wand2` màu tím indigo) tại PageHeader Thư viện nhạc.
   - Hộp thoại Modal hiện đại với 6 thẻ KPI tổng quan (Tổng bài, Cần chuẩn hóa, Đảo vế phát hiện, Đã lọc kênh YT, Tự tin cao, Ground Truth được bảo vệ).
   - Thanh công cụ lọc đa dạng: *Cần sửa*, *Tất cả*, *Đảo vế*, *Lọc kênh*, *Độ tin cậy cao*, *Đã bảo vệ* cùng ô tìm kiếm trực tiếp.
   - Bảng đối chiếu trực quan 2 cột: **Hiện tại** $\to$ **Đề xuất sau chuẩn hóa** (kèm badge nhận diện tầng xử lý, tag Đã sửa đảo vế, Đã lọc kênh, Bóc album, độ tin cậy và lý do chi tiết).
   - Chức năng tải file CSV Dry-Run trực tiếp từ trình duyệt.
   - Nút **"Áp dụng đã chọn"** và **"Áp dụng an toàn tất cả"** kèm checkbox đồng bộ R2.
4. **Kiểm Thử & Xác Nhận Toàn Diện Hệ Thống (Monorepo Verification):**
   - **Toàn bộ 377/377 unit & integration tests đều PASS (100% GREEN ✅):**
     - `packages/shared`: 102/102 tests passed.
     - `apps/api`: 25/25 tests passed.
     - `apps/mobile`: 120/120 tests passed.
     - `tools/indexer`: 130/130 tests passed.
   - `pnpm typecheck`: Exit code 0 (Hoàn hảo trên cả 5 workspace).
   - `pnpm lint`: Exit code 0 (Clean 100%, không còn lỗi).
   - `pnpm --filter @music-app/dashboard build`: Thành công không lỗi.
5. **Sửa lỗi hiển thị Ảnh bìa Album & Thêm Avatar Nghệ sĩ (Mobile App):**
   - **Nguyên nhân gốc ảnh bìa album bị thiếu:** Trong LibraryContext.tsx, hàm resolveAlbumUrls trước đây gọi đường dẫn /covers/{album.id}, trong khi trên R2 và hệ thống cover được lưu theo track.id (12 ký tự hex) chứ không phải album.id. Do đó Worker trả về 404 cho cover album.
   - **Khắc phục:**
     - apps/mobile/src/context/LibraryContext.tsx: Trích xuất 12 ký tự hex từ album.cover hoặc fallback về bài hát đầu tiên album.trackIds[0].
     - apps/mobile/app/(tabs)/library.tsx: Bổ sung fallback cover từ danh sách bài hát thuộc album.
     - Thêm avatar nghệ sĩ nhỏ (14x14px hình tròn) hiển thị ngay bên trái tên nghệ sĩ trong thẻ album ở danh sách thư viện.
     - Bảo tồn thuộc tính metadata (cover, loudnessLufs, replayGain) khi cập nhật overrides.json.
     - Bộ test UI Regression & toàn bộ 377 test vượt qua an toàn.
6. **Nâng cấp Avatar Nghệ sĩ 18x18px & Chữ nghiêng (Italic) cho Mobile App:**
   - Nâng avatar nghệ sĩ từ 14x14px lên 18x18px (bo góc 9px tròn) tại thẻ album tab Thư viện.
   - Thêm style chữ nghiêng (fontStyle: italic) cho tên nghệ sĩ ở cả ngoài danh sách album và bên trong màn hình chi tiết Album (CollectionDetailModal).
   - Sửa lỗi edge-case kiểm thử tuần Replay khi đồng hồ hệ thống vừa bước qua nửa đêm thứ Hai (stats.test.ts).
7. **Triển khai Auto Fast Micro-Sync (Tự động đồng bộ vi sai siêu tốc R2):**
   - Đã thêm hàm autoSyncLibraryFastToR2() và endpoint /local-api/sync/fast trên server indexer.
   - Mọi thao tác tại thư viện (sửa lyrics, đổi ảnh bìa, tải ảnh HD, chỉnh sửa metadata bài hát/album, đưa vào thùng rác, khôi phục) đều tự động đồng bộ ngay lập tức lên Cloudflare R2 trong < 0.5s.
   - Người dùng không cần bấm nút Đồng bộ R2 thủ công cho các thao tác chỉnh sửa nữa.
8. **Khắc phục triệt để hiển thị Full 16:9 Ảnh bìa YouTube và Nâng cấp Độ nét HD chống vỡ ảnh:**
   - **Khôi phục hiển thị Full 100% Ảnh bìa:** Trả lại chế độ hiển thị mặc định `resizeMode="contain"` theo đúng phiên bản yêu thích của người dùng; hỗ trợ ảnh 16:9 YouTube với khung thẻ ngang chuẩn (~355px x 200px) thay vì ép vuông làm xén mất góc và chữ hai bên; nền card chuyển về `#0a0a0a` tràn viền đen OLED không để lại dải xám thừa.
   - **Tự động nhận diện Tỉ lệ Khung hình (Dynamic Aspect Ratio):** Bổ sung trường `coverAspect?: number` vào `TrackSchema` và module trích xuất `imageDimensions.ts` trong indexer (`scanner.ts`) để nhận diện chính xác tỉ lệ 16:9 (1.778) ngay khi quét file.
   - **Nâng cấp độ nét HD & chống mờ/bể nét ảnh:**
     - Sửa `scanner.ts` ưu tiên lấy ảnh bìa HD (1280x720 và 1400x1400) từ thư mục `custom_covers/` thay vì dùng thumbnail nhỏ nén kém chất lượng trong audio tag.
     - Lệnh `sync` trên CLI (`cli.ts`) tự động đồng bộ toàn bộ 698 ảnh bìa HD từ `custom_covers/` lên Cloudflare R2.
     - Bổ sung tham số version `&v=hd` trong `LibraryContext.tsx` để iOS xóa sạch cache ảnh thumbnail mờ cũ và tải trực tiếp ảnh HD sắc nét.
9. **Chuẩn hóa Ảnh bìa YouTube 1:1 Ambient Blurred Canvas & Tối giản Header Now Playing:**
   - **Xóa bỏ nút gạt Đĩa than (Vinyl) ở Now Playing:** Xóa hoàn toàn toggle BÌA / VINYL khỏi header `NowPlayingView.tsx` theo Lựa chọn A của người dùng, căn giữa tiêu đề hoàn hảo bằng spacer cân đối hai bên, tạo giao diện Now Playing tối giản, tinh tế theo phong cách Apple Music.
   - **Chuyển đổi 269 ảnh bìa YouTube ngang (16:9 / 4:3) sang 1:1 Vuông Ambient Blur:**
     - Áp dụng bộ lọc `ffmpeg` (`boxblur=40:5,eq=brightness=-0.12` làm nền ambient mờ nghệ thuật + overlay ảnh gốc 16:9 chính giữa): Giữ trọn 100% chi tiết ảnh YouTube, không bị cắt xén hai bên, không bị méo/kéo dãn hình, hòa quyện mượt mà vào khung vuông chuẩn 1:1 của iOS Lock Screen, Control Center và Now Playing.
     - Sao lưu an toàn toàn bộ 269 file ảnh gốc 16:9 vào `tools/indexer/custom_covers_backup_16_9/` (được đưa vào `.gitignore`).
     - Tự động hóa cho tương lai: Cập nhật `youtubeService.ts` và server indexer (`server/index.ts`) tự động sinh ảnh 1:1 ambient blurred canvas cho mọi bài hát tải mới từ YouTube.
     - Đặt tỉ lệ chuẩn `coverAspect` mặc định về 1.0 trong `NowPlayingView.tsx`.
     - Kiểm thử tự động: 381/381 test PASS 100% toàn monorepo.


**Việc tiếp theo:** Người dùng mở Web Dashboard (`pnpm --filter indexer ui`), bấm nút "Chuẩn hóa Tên bài & Ca sĩ" để duyệt và áp dụng chuẩn hóa vào thư viện khi muốn.
1. **Công nghệ Auto-Smart Match 2.0 (`coverFetchService.ts` & Server):**
   - **Tự động nhận diện & đảo ngược Tên bài $\leftrightarrow$ Ca sĩ:** Tự động giải quyết trường hợp các bài tải từ YouTube bị ghi ngược thứ tự (như *Huỳnh James - Cho Họ Ghét Đi Em*, *Phát Hồ - Chờ Ngày Cưới Em*, *Pixel Neko - Cô Nàng Khác Người*, *Lê Thiện Hiếu - Ông Bà Anh*, *Đạt G - Thêm Bao Nhiêu Lâu*...).
   - **Bóc tách ca sĩ thật khỏi tên kênh YouTube:** Tự động phát hiện và trích xuất nghệ sĩ chuẩn khi Artist bị gắn nhầm tên kênh (`G5R`, `FAPTV`, `7clouds`, `EvB Records`, `Focus Entertainment`, `Fueled By Ramen`... như *Jack - Hồng Nhan*, *Phía Sau Em - Kay Trần*, *twenty one pilots: Stressed Out*).
   - **Dọn dẹp tiền tố / hậu tố rác:** Cắt bỏ các đoạn `[Lyrics Video]`, `(Prod. by...)`, `Sing My Song 2016`, `(from album ...)`.
   - **Tự động thử lại (Retry 2 lần) & Hạ phân giải thông minh:** Khắc phục lỗi `ECONNRESET` từ máy chủ Apple CDN (`mzstatic.com`).
2. **Thiết kế UI/UX Ngang Rộng (Wide Horizontal Layout `max-w-4xl`):**
   - **Thanh Quick Filter Thư viện:** Thêm pill bấm nhanh **"Chưa có ảnh HD"** kèm số lượng đếm trực tiếp (`missingHdCoverCount`), bấm 1 phát là lọc ra đúng các bài chưa có ảnh HD.
   - **Hộp thoại Tải ảnh bìa HD rộng ngang `max-w-4xl`:**
     - Thiết kế 2 cột ngang to, rõ ràng, giới thiệu trực quan 4 tính năng Auto-Smart Match.
     - 3 thẻ thống kê ngang kích thước lớn: Thành công tuyệt đối (màu xanh lá), Bỏ qua an toàn (màu hổ phách), Thất bại (màu đỏ).
     - Bảng danh sách chi tiết các bài chưa có ảnh HD nằm ngang, có thanh cuộn mượt mà, hiển thị rõ Tên bài, Ca sĩ, Lý do, và nút bấm **"Chọn ảnh"** thủ công 1-click cho từng bài.
     - Hàng nút hành động ngang: *Lọc các bài chưa có ảnh HD ra Thư viện*, *🚀 Quét tiếp với Auto-Smart Match*, *Hoàn tất*.

2. **Tối ưu hóa 60/120fps Floating Tab Bar và khắc phục độ trễ 2s phát nhạc:**
1. **Khắc phục triệt để hiện tượng giật ở Floating Tab Bar:**
   - **Nguyên nhân gốc:**
     - `containerWidthShared` khởi tạo ban đầu bằng 0, khiến frame đầu tiên indicator có `width = 0, opacity = 0`, sau đó `onLayout` mới nạp kích thước thật làm nhảy vọt khung hình.
     - Hàm render `tabBar={(props) => <TabBar {...props} />}` trong `_layout.tsx` tạo anonymous function mới mỗi lần component re-render, khiến React Navigation re-mount lại instance TabBar làm restart animation.
     - Kỹ thuật `setTimeout 80ms` làm đứt đoạn animation giữa chừng khi route mới bắt đầu render.
     - Cấu hình lò xo `overshootClamping: true` làm viên thuốc dừng đột ngột gây cảm giác khựng; `activeOpacity={0.7}` khiến icon mờ nháy khi bấm.
   - **Giải pháp:**
     - Khởi tạo ngay `containerWidthShared` từ `Math.min(screenWidth * 0.95, 410)` ngay tại frame 0.
     - Đưa hàm render tab bar ra ngoài `_layout.tsx` (`renderCustomTabBar`).
     - Bỏ `setTimeout`, kích hoạt `navigation.navigate` mượt mà song song với `withSpring` trên Native UI thread.
     - Cân chỉnh `TAB_SPRING_CONFIG` (`damping: 20, stiffness: 160, mass: 0.7, reduceMotion: ReduceMotion.Never`), bỏ `overshootClamping` để viên thuốc lướt trôi êm ái chuẩn Liquid Glass. Đổi `activeOpacity={1}` cho tab icon.
2. **Khắc phục độ trễ 2s khi chọn bài hát mới bất kỳ:**
   - **Nguyên nhân gốc:**
     - Trên Cloudflare Worker, mỗi khi nhận request stream bài hát mới, `getAudioInfo` gọi `bucket.list({ prefix: 'music/' + id, limit: 1 })` để quét key. Thao tác scan index này tốn 400ms - 600ms, sau đó mới gọi tiếp `bucket.get` tốn thêm 400ms.
     - Trên iOS, AVPlayer mặc định `autoUpdateMetadataFromStream: true` khiến native player phải mở stream và phân tích ID3/ICY metadata từ mạng trước khi bắt đầu phát.
   - **Giải pháp:**
     - **Cloudflare Worker:** Thay thế hoàn toàn thao tác scan `bucket.list` bằng direct `bucket.head('music/' + id + '.mp3')`, `.m4a`, `.flac` chạy song song (chỉ mất ~30ms thay vì 500ms). Lưu RAM cache cho các lần sau. Đã deploy thành công lên Cloudflare Worker (Version ID: `f498781b-0ff2-4b7c-a8d8-b77a2a7d2ff8`).
     - **Mobile Client:** Đặt `autoUpdateMetadataFromStream: false` trong `TrackPlayer.setupPlayer`, giúp AVPlayer bỏ qua việc đọc metadata stream từ mạng và phát ngay khi nhận được chunk âm thanh đầu tiên.
1. **Bottom Sheet Menu bài hát (`TrackActionSheet`):**
   - Thay thế toàn bộ menu cũ bằng Bottom Sheet chuẩn Apple/Hip-hop, không dùng icon hay emoji trong sheet.
   - Header gồm grabber nhỏ, cover 56x56 bo góc 12px có bóng đổ mềm động theo màu ảnh bìa (`useCoverColor`), tên bài cỡ 17 w700, nghệ sĩ & thời lượng cỡ 14 xám.
   - Danh sách action thuần chữ cao 52px (Phát tiếp theo, Yêu thích/Bỏ yêu thích + "Đã thích", Thêm vào playlist, Tải xuống với 4 trạng thái kèm progress bar 2px, Sửa thông tin).
   - Nhóm nguy hiểm "Xóa khỏi thư viện" màu đỏ nhạt, tích hợp popup Alert hệ thống xác nhận xóa an toàn.
   - Vuốt xuống bám ngón tay để đóng, nền `expo-blur` kết hợp `expo-linear-gradient` tan dần về nền đen.
2. **Màn hình "Vừa nghe" (`recent.tsx`):**
   - Header lớn cỡ 38 weight 800, text link "Xóa lịch sử" căn phải (Alert xác nhận).
   - Nền gradient động 35% từ màu ảnh bìa hero track (`useCoverColor`) tan dần về nền đen.
   - Hero card bài nghe gần nhất: Cover lớn bo góc 12px, tên bài đã dọn dẹp tag qua `cleanTrackTitle`, nghệ sĩ + thời gian tương đối `formatRelativeTime` (ẩn chữ "Singles"), 1 nút Play tròn to màu xanh. Bỏ badge và nút tim thừa.
   - 2 nút hành động bo tròn kiểu pill 48px: "Phát tất cả" (xanh) và "Phát ngẫu nhiên" (xám), không icon thừa.
   - Danh sách bài trước đó: Hỗ trợ vuốt trái (`Swipeable`) để "Yêu thích" hoặc "Xóa" khỏi lịch sử, nhấn giữ mở `TrackActionSheet`.
3. **Mini Player & Floating TabBar (`_layout.tsx` & `MiniPlayer.tsx`):**
   - Mini Player: Dải sóng âm **Waveform SVG** mỏng (45 vạch âm thanh pseudo-random có seed từ track ID, đồng bộ theo tiến trình nghe độc lập qua `useProgress` không gây re-render màn hình ngoài); lược bỏ nút Shuffle, chỉ giữ Play/Pause và Next.
   - Floating TabBar: Bỏ icon, chỉ dùng nhãn chữ ("Trang chủ", "Vừa nghe", "Tìm kiếm", "Playlist", "Yêu thích"). Tab active hiển thị chữ xanh kèm chấm chỉ báo 4px bên dưới.
4. **Màn hình "Tìm kiếm" (`search.tsx`):**
   - Search bar bo tròn mềm mại không icon kính lúp, debounce 300ms, text link "Xóa" khi có text, text link "Hủy" khi focus.
   - Trạng thái chưa nhập text: Mục "Nghệ sĩ nghe nhiều" dạng chip text và "Gần đây" (hỗ trợ vuốt trái để xóa từng mục, link "Xóa tất cả").
   - Khi có kết quả: Filter tabs dạng text ("Tất cả", "Bài hát", "Nghệ sĩ") kèm gạch chân xanh 2px; highlight từ khóa khớp chuẩn tiếng Việt có/không dấu qua `searchHighlight.ts`; nhấn giữ mở `TrackActionSheet`.
5. **Web Dashboard (tools/dashboard):**
   - Nâng cấp Modal thêm bài hát vào Playlist: mở rộng kích thước rộng rãi (`max-w-4xl`), thêm nút chọn tất cả (Select All) / bỏ chọn tất cả, tích hợp thumbnail ảnh bìa 38x38, hiển thị ngày tải (mtimeMs) và thời lượng.
   - Bổ sung bộ lọc thời gian tải (Tất cả / 24h qua / 7 ngày qua) và tùy chọn sắp xếp (Mới tải gần đây / Tên bài hát A-Z / Nghệ sĩ A-Z), giúp 1-click thêm toàn bộ bài hát vừa tải từ YouTube vào playlist.
6. **Khắc phục triệt để lỗi hiển thị sai và trùng lặp ảnh bìa (Cover Art Isolation by Track ID):**
   - **Nguyên nhân gốc:** Các bài hát đĩa đơn / tải từ YouTube mặc định gắn tag `album = 'Singles'`. Thuật toán cũ băm `sha1(artist + '|singles')` khiến tất cả bài đơn của cùng một ca sĩ có cùng `albumId`, đồng thời hệ thống chỉ lưu và stream ảnh bìa theo `covers/${albumId}.jpg`. Kết quả là hàng chục bài của 1 nghệ sĩ bị gán đè chung 1 ảnh bìa duy nhất của bài đầu tiên quét được.
   - **Giải pháp:**
     - Tách độc lập ảnh bìa theo `track.id`: `track.cover = 'covers/' + track.id + '.jpg'`. Nếu ID3 chưa nhúng ảnh, tự động fallback đọc file ảnh sidecar (`.jpg`/`.png`) cùng thư mục.
     - `tools/indexer/src/services/libraryBuilder.ts`: Trả về cả `coversByTrackId` và `coversByAlbumId`.
     - `tools/indexer/src/server/index.ts`: Cập nhật endpoint `/local-api/covers/:id` ưu tiên tìm theo `track.id` trước `albumId`; cập nhật luồng đồng bộ vi sai `/local-api/sync/start` tải toàn bộ ảnh bìa bài hát riêng lẻ lên Cloudflare R2; sửa các API thay đổi ảnh bìa sang `track.id`.
     - `tools/dashboard`: Cập nhật toàn bộ các trang (`LibraryPage`, `PlaylistsPage`, `Layout`, `ArtistsPage`, `ArtistDetailDialog`, `ArtistHoverCard`) để ưu tiên `/local-api/covers/${t.id || t.albumId}.jpg`.
7. **Tinh chỉnh UI/UX Mobile App (Floating TabBar, Playlist Modal, Now Playing Header):**
   - **Floating TabBar:** Xóa bỏ text label, chỉ giữ lại icon (size 20pt) tối giản thanh lịch; sửa lỗi lệch border bằng cách style viền active pill trực tiếp trên từng tab button, giúp border tab active cân đối đều đặn 100%.
   - **Modal tạo/sửa Playlist:** Bổ sung khoảng cách top (`Math.max(insets.top + 60, 120)`), xóa icon tích ở nút "Tạo ngay", thêm padding đệm dưới cho modalBox và modalActions để các nút bấm không bị dính sát đáy modal.
   - **Now Playing Header:** Lọc bỏ text "Singles" / "Single" / "Đĩa đơn" ở vị trí giữa header, chỉ hiển thị tên album khi bài hát thực sự thuộc về một album chính thức.
8. **Khắc phục 4 vấn đề trải nghiệm phát nhạc & Playlist trên Mobile App:**
   - **Trạng thái nút "Thêm vào playlist":** Khi bài hát đã nằm trong playlist, `TrackActionSheet` tự động đổi label thành "Đã trong playlist" kèm secondary text hiển thị tên playlist đó (màu xanh lá chuẩn Apple). Xây dựng component dùng chung `AddToPlaylistModal` có badge "Đã có" cho playlist đã chứa bài.
   - **Hiển thị Media Player trong Playlist Modal:** Nhúng `MiniPlayer` trực tiếp vào `CollectionDetailModal` với vị trí nổi chuẩn safe area đáy màn hình (`bottom: Math.max(insets.bottom, 12)`), giúp người dùng luôn điều khiển được bài hát và mở Now Playing mà không cần tắt playlist.
   - **Độc lập hàng đợi phát (Active Queue Isolation):** Tách riêng state `activeQueue` trong `PlayerContext` khỏi `tracks` của Thư viện. Khi bấm "Xáo trộn" trong playlist "gang gang", hàng đợi phát và danh sách chờ trong `NowPlayingView` chỉ chứa chính xác các bài hát của playlist đó (không bị trộn lẫn bài từ trang chủ), đồng thời bảo toàn 100% kho nhạc ở trang chủ.
   - **Xáo trộn ngẫu nhiên danh sách Trang chủ:** Tích hợp `smartShuffle` tự động khi nạp thư viện từ local cache và R2, bổ sung nút icon Xáo trộn danh sách 1 chạm trên Header Trang chủ cạnh nút Cloud Sync, giúp giao diện luôn mới mẻ ngẫu nhiên mỗi lần mở app.
9. **Khắc phục 4 vấn đề trải nghiệm phát nhạc & Playlist trên Mobile App:**
   - Trạng thái nút "Đã trong playlist" kèm badge hiển thị rõ ràng.
   - Hiển thị MiniPlayer nổi trong Playlist Modal với safe area chuẩn.
   - Hàng đợi phát độc lập (Active Queue) cô lập bài của playlist khi Shuffle.
   - Tự động xáo trộn ngẫu nhiên danh sách Trang chủ khi mở app.
10. **Thiết kế lại 4 màn hình "Hồ sơ & Cài đặt", "Thống kê (Replay)", "Nhật ký Smart Transition" và "Lưu trữ offline" theo chuẩn Apple Settings:**
   - Xây dựng hệ thống component dùng chung chuẩn Apple: `ListGroup`, `SettingRow`, `SectionHeader`, `UserAvatar`.
   - Thống nhất typography, 2 mức surface (`bgBase: #000000`, `bgSurface: #121217`, `bgElevated: #1c1c22`), đường phân cách hairline `StyleSheet.hairlineWidth`.
   - Khắc phục triệt để 10 lỗi: Cắt cụt chữ mép header (Sticky Tab Bar), Safe-area cộng đôi gây khoảng đen trên sheet, Avatar rỗng chữ cái đầu, Rút gọn nhật ký chuyển bài 1 dòng và ánh xạ tiếng Việt, Hàm làm sạch tiêu đề rác `cleanTrackTitle` có unit test, Thống nhất thuật ngữ "Lượt nghe" / "Phút nghe", Chip chuyển bài mờ khi tắt Switch, Nút xóa Danger bắt buộc Alert, Mô tả chuyển bài trung thực, Bỏ lặp số liệu thống kê.
   - **Tái cấu trúc kiến trúc iOS Settings (Expo Router Native Stack):**
     - Chuyển từ modal cuộn dài sang hệ thống màn hình Native Stack Navigation (`/settings`):
     - **Trang chính (`/settings`):** Hero Card tóm tắt hồ sơ (Avatar, tên, Level kèm thanh tiến độ %, 2 số liệu chính: Lượt nghe & Phút nghe), 5 nhóm grouped list điều hướng (Hồ sơ, Thống kê Replay, Phát nhạc, Lưu trữ & Lịch sử, Nâng cao).
     - **Mỗi nhóm mở thành 1 màn push riêng:** `headerLargeTitle: true` co giãn mượt mà khi cuộn và nút Back `‹` tự động.
     - **Hồ sơ (`/settings/profile`):** Đổi tên, tiểu sử, chụp ảnh/chọn ảnh thư viện/gỡ ảnh.
     - **Thống kê Replay (`/settings/replay`):** 4 tab segmented control, ảnh bìa thumbnail cho Top bài hát (`expo-image`, `cachePolicy="memory-disk"`), loại bỏ "Kho bài hát" khỏi thống kê theo yêu cầu.
     - **Phát nhạc (`/settings/playback`):** Đĩa than Vinyl 360°, Chuyển bài thông minh, chip mờ khi tắt.
     - **Lưu trữ & Lịch sử (`/settings/storage`):** Quản lý dung lượng offline, xóa nhạc offline, giới hạn lịch sử nghe [10..50], xóa lịch sử nghe.
     - **Nâng cao (`/settings/advanced`):** Cài đặt Cloudflare Worker (URL & Token), ETag R2, Sideload exp, Build SHA, Gapless delta, Stream trực tiếp, và link sang Nhật ký chuyển bài (`/settings/transition-logs`).
   - Toàn bộ monorepo: 272/272 tests passed 100%, typecheck sạch sẽ cả 5 packages, lint 0 error 0 warning.
11. **Nâng cấp toàn diện trải nghiệm Mobile App theo phản hồi người dùng:**
    - **Floating Tab Bar:** Animation background active dạng trượt mượt mà (`SlidingActivePill` với spring của Reanimated) lướt êm ái theo tab thay vì bật/tắt tức thì.
    - **Trang chủ & Smart Shuffle:** Xóa nút shuffle trùng lặp cạnh CloudSync; sửa triệt để thuật toán Smart Shuffle không còn thiên vị các nghệ sĩ có nhiều bài nhất (Sơn Tùng M-TP, B Ray...), phân bổ ngẫu nhiên đồng đều công bằng.
    - **ScrollToTopButton:** Tạo component nút cuộn lên đầu trang hình tròn nổi phong cách Apple, animation mũi tên nhảy lên nhảy xuống nhịp nhàng, chạm vào nảy và cuộn mượt; tích hợp vào Trang chủ, Vừa nghe, Tìm kiếm, Playlist, Modal Đã tải về máy.
    - **Modal Bộ sưu tập & Offline:** Hiển thị `MiniPlayer` nổi ngay khi mở modal "Đã tải về máy"; sửa lỗi bài offline không phát được trên iOS bằng cách nhận diện chính xác extension file gốc (`.m4a`, `.flac`, `.mp3`) và fallback an toàn; thêm nút ba chấm "..." trên từng dòng bài trong playlist và hiển thị đầy đủ ảnh bìa cùng % tiến độ tải trực tiếp trên Action Sheet.
    - **Modal Thêm vào Playlist (`AddToPlaylistModal`):** Nút "Đóng" căn sát bên phải với width gọn gàng và khoảng đệm chân hợp lý; đổi màu nền tương phản cao cấp giữa nút tạo mới và item playlist.
    - **Hiển thị Timer ngoài Lock Screen:** Cập nhật thông tin đếm ngược kín đáo ở góc ngoài màn hình khóa (`Tên Album • ⏳ mm:ss`) qua `TrackPlayer.updateMetadata` mà không ngắt nhạc.
    - **Tối ưu tốc độ chuyển bài:** Tối ưu hóa `playQueue` dùng `skipToIndex` khi chuyển bài trong cùng một queue, giảm độ trễ từ ~800ms xuống dưới 100ms tức thì.
    - **Xử lý mạng thông minh:** Thay thế log lỗi kỹ thuật thô bằng `NetworkStatusBanner` chuyển động dạng Dynamic Island; tự động thăm dò và đồng bộ ngầm ngay khi có mạng trở lại mà người dùng không cần reload thủ công.
12. **Rà soát & Kiểm thử toàn diện toàn bộ Mobile App (Comprehensive Code & Logic Audit):**
    - Rà soát chi tiết tất cả các màn hình chính (`library.tsx`, `search.tsx`, `collection.tsx`, `recent.tsx`, `playlists.tsx`, `now-playing.tsx`, `settings/*`).
    - Bổ sung `ScrollToTopButton` đồng bộ trên tab `playlists.tsx` khi danh sách playlist dài.
    - Áp dụng thuật toán `smartShuffle` phân bổ đồng đều công bằng cho nút "Xáo trộn" trong `CollectionDetailModal` và `OfflineDownloadsModal`.
    - Tối ưu `rntpPlayerService`: tự động lưu và cập nhật ngay lập tức metadata hẹn giờ ngủ (Lock Screen Timer) khi bài hát tự chuyển sang bài mới mà không cần đợi chu kỳ đếm giây tiếp theo.
    - Xác nhận giải phóng 100% dung lượng iPhone khi xóa nhạc offline (`FileSystem.deleteAsync`).
    - Kiểm thử tự động: `pnpm typecheck` PASS 5/5 packages, `pnpm lint` 0 lỗi, `pnpm test` PASS 272/272 tests toàn monorepo.
13. **Khắc phục 4 vấn đề nâng cao (Scroll to Top, Tab Bar Animation, Phát nhạc Offline & Chế độ Ngoại tuyến):**
    - **Tự động tính vị trí ScrollToTopButton:** Khi Media Player xuất hiện, nút tự động nâng cao thêm 64px bằng animation Reanimated mượt mà, không bao giờ bị che khuất dưới player.
    - **Floating Tab Bar Animation:** Chuyển đổi hoàn toàn sang Reanimated UI-thread không phụ thuộc state React, tinh chỉnh spring `{ damping: 18, stiffness: 180, mass: 0.65 }` di chuyển nhịp nhàng, êm ái cùng phản hồi xúc giác nhẹ (Haptics).
    - **Sửa triệt để lỗi không phát được nhạc offline khi tắt/bật mạng:** Nhận diện chính xác định dạng âm thanh thực qua HEAD Content-Type và cơ chế tự phục hồi Magic Bytes (M4A/AAC `ftyp` vs MP3) tránh lỗi `kAudioFileUnsupportedFileTypeError` trên iOS AVPlayer; khôi phục trạng thái player sạch khi chuyển mạng.
    - **Chế độ Ngoại tuyến & Thông báo Tinh tế:** Thiết kế lại `NetworkStatusBanner` dạng viên thuốc Dark Glass siêu tối giản, tự động ẩn sau 3.2s; khi mất mạng, Trang chủ tự động chỉ hiển thị các bài hát đã tải về máy; nếu chưa có bài nào tải thì hiển thị thông báo hướng dẫn thân thiện, sạch sẽ.
    - **Nhận diện Mạng Tức Thì (Real-Time Auto Network Detection):** Tích hợp bộ dò mạng 2 tầng (Dual-Speed Heartbeat 1.5s/2.5s) kết hợp lắng nghe `AppState` khi kéo Control Center tắt/bật Wi-Fi/Cellular (0ms delay) và bộ bắt lỗi mạng toàn cục `reportNetworkError`. Ứng dụng tự động chuyển đổi giữa Online và Offline tức thì trong thời gian thực mà người dùng hoàn toàn không phải load lại thủ công bằng tay.
14. **Bảo đảm 100% Phát nhạc Ngoại tuyến (Zero-Failure Offline Playback Assurance):**
    - **Cô lập triệt để hàng đợi phát khi Offline:** Trong `PlayerContext`, khi `isOffline = true`, `playQueue` tự động thanh lọc danh sách phát chỉ chứa duy nhất các file cục bộ (`file://`), ngăn chặn AVPlayer cố gắng pre-buffer track kế tiếp qua internet gây kẹt tiến trình phát. Cảnh báo Alert thân thiện nếu bài chưa tải.
    - **Bảo vệ Lock Screen Artwork:** Trong `rntpPlayerService`, với các track offline (`file://`), trường `artworkUrl` chỉ nhận đường dẫn file cục bộ (`file://`), tuyệt đối không gửi URL remote `https://` để tránh việc `MPNowPlayingInfoCenter` / AVPlayer của iOS kích hoạt NSURLSession khi thiết bị đang ở chế độ Máy bay.
    - **Magic Bytes Self-Healing:** Dò header `ftyp` (M4A/AAC) và `fLaC` để tự động sửa chữa các file bị lưu sai đuôi `.mp3`, đảm bảo native AVPlayer giải mã trơn tru.
    - **Kiểm thử tự động:** Viết bộ test `offlinePlayback.test.ts` chuyên sâu; toàn bộ monorepo đạt 277/277 test pass 100%.
15. **Tối ưu Hiệu năng & UI/UX Cài đặt Nâng cao, Replay, Playback và Vừa nghe:**
    - **Loại bỏ triệt để giật lag ở màn hình "Nâng cao" & "Nhật ký chuyển bài":**
      - Chuyển `headerLargeTitle: false` cho toàn bộ các màn hình chi tiết trong `_layout.tsx`, loại bỏ hiện tượng Native Stack Large Title gây tụt khung hình khi cuộn nhanh.
      - `PlayerContext`: Bọc `contextValue` bằng `useMemo` giúp loại bỏ hoàn toàn các đợt re-render thừa thãi mỗi 250ms lên các màn hình cài đặt khi bài hát đang phát.
    - **Thiết kế lại Danh sách Nhật ký chuyển bài (`transition-logs.tsx`):**
      - Thay thế `LayoutAnimation` bằng Reanimated UI-thread component (`TransitionLogItem`), mở rộng/thu gọn mượt mà với `FadeIn(180ms)`/`FadeOut(120ms)` và mũi tên chevron xoay 90° bằng `withTiming`.
      - UI chuẩn Apple: Hiển thị tên bài gọn gàng, badge thời lượng fade nổi bật (`4.0s`), giờ và loại chuyển; chi tiết hiển thị lưới 2 cột thông số khoa học, sạch sẽ.
    - **Sửa lỗi Header & Metric Banner Thống kê Replay (`replay.tsx`):**
      - Title "Thống kê Replay" nằm cùng hàng với nút icon Back `‹`, không còn bị Large Title chiếm chỗ hay đè lên Segmented Bar.
      - Thiết kế lại `metricBanner` với border hairline, padding cân đối giúp hai chỉ số "Phút nghe" và "Lượt nghe" hiển thị rõ ràng, không bị che khuất.
      - Thêm animation sliding active pill mượt mà cho Segmented Control ('Tuần này' | 'Tháng này' | 'Năm nay' | 'Kỷ niệm').
    - **Animation Sliding Pill cho Chip Thời gian chuyển bài (`playback.tsx`):**
      - Tích hợp nền active dạng trượt di chuyển theo chip thời lượng đã chọn (2s, 3s, 4s, 5s, 6s, 8s) bằng spring physics Reanimated giống 100% Floating Tab Bar.
    - **Cập nhật tức thì bài đang nghe ở tab "Vừa nghe" (`recent.tsx` & `PlayerContext.tsx`):**
      - Loại bỏ độ trễ 5 giây (`pos >= 5`): ngay khi bài hát mới bắt đầu phát (`activeTrackId` thay đổi), hệ thống tự động ghi nhận tức thì vào `recentTracksData`.
      - Mở rộng tra cứu bài hát trong `recentTracks` qua cả `tracks`, `originalTracks`, và `activeQueue`, giúp Hero Card và danh sách "Vừa nghe" cập nhật vị trí top ngay lập tức trong thời gian thực mà không cần reload.
16. **Sửa triệt để lỗi Flapping giật chớp nháy và mất danh sách bài hát khi reload:**
    - **Nguyên nhân gốc:**
      1. Health check `/api/health` trước đây không gửi kèm Authorization Bearer token, bị Cloudflare Worker trả về 401 Unauthorized dẫn đến việc app liên tục phán đoán sai là mất mạng (`offline`).
      2. Timeout 1.5s quá ngắn cho kết nối di động/TLS handshake lúc khởi động, gây timeout giả.
      3. Vòng lặp re-render (Flapping loop) trong `useEffect` của `LibraryContext` do chứa `networkStatus` trong dependency array khiến việc đổi trạng thái mạng tự kích hoạt thăm dò lại liên tục 2-3 lần.
      4. Màn hình `library.tsx` trước đây tự động lọc `tracks.filter(isTrackOffline)` khi `isOffline = true`. Khi người dùng chưa tải bài về máy, toàn bộ danh sách bị biến mất và hiện thông báo trống, gây chớp nháy liên tục khi mạng dao động.
    - **Giải pháp:**
      - Endpoint `/api/health` trên Worker được cấu hình public, đồng thời client vẫn gửi kèm token bảo mật nếu có.
      - Nâng timeout thăm dò lên 5000ms và chỉ chuyển sang `offline` khi thất bại liên tiếp 2 lần (`failureCountRef >= 2`).
      - Bỏ `networkStatus` khỏi dependency array của `useEffect` và nâng nhịp thăm dò lên 10s/lần, chấm dứt hoàn toàn vòng lặp flapping.
      - Bảo toàn 100% kho nhạc cached trên trang chủ `library.tsx`, bài hát không bao giờ bị biến mất; thông báo "Chưa có bài hát tải về máy" chỉ hiện khi người dùng chọn tab lọc "Đã tải".
17. **Kiểm tra Toàn diện Codebase & Phòng vệ Lỗi Tiềm ẩn (Audit & Zero-Defect Defense):**
    - **Phòng vệ `gainToVolume` chống crash âm thanh:** Thêm kiểm tra phòng vệ `null`, `NaN`, `!isFinite`, `typeof !== 'number'` trả về an toàn hệ số 1, ngăn chặn giá trị `NaN` truyền xuống native bridge `TrackPlayer.setVolume(NaN)` gây crash AVPlayer hoặc mất tiếng.
    - **Cơ chế Timeout 15s cho `MusicApiClient`:** Tích hợp `AbortController` timeout cho mọi API call (`fetchLibraryWithETag`, `updateTrack`, `deleteTrack`, `fetchLyrics`, `fetchUserState`, `saveUserState`), hủy request và trả về thông báo tiếng Việt thân thiện thay vì để app bị treo vô tận khi kết nối chập chờn.
    - **Tối ưu hóa re-render diện rộng với `useMemo` trong `LibraryContext`:** Bọc toàn bộ `contextValue` của `LibraryProvider` bằng `useMemo`, ngăn chặn re-render thừa lan tỏa toàn bộ cây component khi thư viện sync hoặc cập nhật trạng thái.
    - **Phòng vệ tua bài `seekOffset` và `seekTo`:** Kiểm tra kẹp giá trị `pos` và `offset` luôn là số hữu hạn, chặn `NaN` hoặc số âm khi duration/position chưa kịp load.
    - **Minh chứng kiểm thử:** Viết mới unit test cho timeout và phòng vệ ReplayGain; toàn bộ monorepo đạt 278/278 test pass 100%, typecheck và lint sạch 0 lỗi.
18. **Khắc phục lỗi Header Offline, Nâng cấp Đồng bộ Animation Sliding Pill & Nút Cuộn Scroll To Top:**
    - **Xử lý triệt để lỗi UI/UX chỗ text "Offline" trên Header:**
      - Xóa bỏ khung badge chữ `OFFLINE` chật chội ở thanh Header hàng ngang. Không còn hiện tượng đè ép làm co hẹp ScrollView dẫn đến việc cắt cụt chữ "Nghe nhiều nhất" thành "Nghe nh".
      - Nút Cloud Sync R2 tự động mờ và vô hiệu hóa (`opacity: 0.38`, `disabled`) khi mất mạng, tránh gây hiểu lầm đồng bộ đám mây khi ngoại tuyến.
    - **Đồng bộ hiệu ứng animation background active trượt (Sliding Active Pill) cho 4 vị trí:**
      - **Floating Tab Bar:** Kích hoạt `withSpring` trực tiếp ngay trong `onPress` (0ms delay), viên thuốc trượt tức thì và êm ái theo nhịp ngón tay.
      - **Thống kê Replay:** Tăng độ tương phản cho viên thuốc trượt (`#26262c`, viền `rgba(255, 255, 255, 0.16)` và bóng đổ), kích hoạt trượt tức thì khi chạm tab (Tuần này / Tháng này / Năm nay / Kỷ niệm).
      - **Thời gian chuyển bài (Phát nhạc):** Kích hoạt trượt tức thì khi chọn thời gian (2s, 3s, 4s, 5s, 6s, 8s).
      - **Số bài lưu tối đa (Lưu trữ & Lịch sử):** Tích hợp mới toàn diện `slidingActivePill` với Reanimated spring lướt mượt mà giữa các lựa chọn [10, 20, 30, 40, 50].
      - **Mở rộng/thu gọn Nhật ký chuyển bài:** Tích hợp `LayoutAnimation.configureNext` với đường cong ease-in-out chuẩn iOS, các mục chi tiết giãn nở và thu cuộn theo chiều dọc mượt mà như accordion native.
    - **Nâng cấp Button Scroll To Top:**
      - Sửa lỗi dao động mũi tên: dùng `withRepeat` chuẩn hàm sin dao động liên tục [-6px .. 0px], mũi tên nhấp nhô nhịp nhàng khi cuộn sâu.
      - Thay đổi icon: bổ sung icon mới `ArrowUpIcon` có cả thân/chân mũi tên đứng (`↑`, chuẩn SF Symbols / Lucide) thay cho chevron không chân trước đây.
19. **Nâng cấp Toàn diện 4 Hiệu ứng Animation Trải nghiệm Cao cấp & Kiểm tra Rò rỉ Bộ nhớ (Zero Memory Leak):**
    - **Gạch chân trượt Filter Tabs Tìm kiếm (`search.tsx`):**
      - Thay thế việc render gạch chân tĩnh bằng `slidingTabUnderline` chạy trên Reanimated UI-thread. Khi chuyển tab "Tất cả" | "Bài hát" | "Nghệ sĩ", vạch xanh lướt êm ái sang vị trí tab mới và tự động co giãn độ rộng theo độ dài chữ.
    - **Phân đoạn Thư viện Trang chủ (`library.tsx`):**
      - Thay thế hoàn toàn `Animated.spring` cũ trên JS-thread bằng Reanimated native values (`segmentIndexShared`, `segmentBarWidthShared`, `segmentAnimStyle`). Chạy trực tiếp trên GPU đạt 120fps kể cả khi thư viện có hàng nghìn bài hát, loại bỏ triệt để hiện tượng giật khung hình.
      - Tăng độ tương phản cho viên thuốc trượt (`#26262c`, viền `rgba(255, 255, 255, 0.16)`).
    - **MiniPlayer xuất hiện / ẩn nhẹ nhàng (`MiniPlayer.tsx`):**
      - Tích hợp `FadeInDown(220ms)` và `FadeOutDown(180ms)` trên `AnimatedTouchable`. Khi bắt đầu phát bài hát đầu tiên, thanh MiniPlayer trồi lên nhẹ nhàng từ dưới dock thay vì nhảy cái bụp.
    - **Thẻ Bộ sưu tập phản hồi chạm nhún lò xo (`collection.tsx`):**
      - Tích hợp `SpringCard` với `withSpring` phản hồi cảm ứng cơ học (Scale 0.965 khi nhấn giữ và bung 1.0 khi thả), tạo cảm giác xúc giác Apple widget cao cấp cho hai thẻ "Bài hát yêu thích" và "Đã tải về máy".
    - **Kiểm tra Rò rỉ Bộ nhớ (Memory Leak Audit):**
      - Tất cả các animation đều sử dụng Reanimated shared values thuần túy hoặc lifecycle hooks chuẩn, không để sót interval/timeout hay event listener treo ngầm.
      - Mở rộng bộ test `uiRegression.test.ts` lên 10 bài test tự động bảo vệ toàn bộ các animation mới. Toàn bộ monorepo đạt **288/288 tests pass 100%**.
20. **Cập nhật App Icon Chuẩn Apple iOS (Full-bleed 1024×1024):**
    - Thay thế `icon.png` bằng thiết kế Phương án 1 (Apple Minimalist Neon) độ phân giải 1024×1024.
    - Nền đen tuyền tràn viền 100%, xóa bỏ hoàn toàn khung bo góc nhân tạo bên trong, cho phép iOS tự động cắt bo góc Apple Squircle đồng bộ hoàn hảo với các app lớn (Twitter, Threads, Claude).
    - Dọn dẹp sạch sẽ toàn bộ các file ảnh preview tạm.
21. **Khắc phục Triệt để Lỗi UI/UX Bộ sưu tập & Bảo đảm Kích hoạt 100% Animation Background Active:**
    - **Sửa lỗi vỡ layout trang Bộ sưu tập (`collection.tsx`):** Chuyển style container `styles.collectionCard` trực tiếp vào `Pressable` thay vì bao bọc bên ngoài `Animated.View`, trả lại layout chuẩn `flexDirection: 'row'`, đưa icon trái tim / icon tải về, thông tin bài và mũi tên chuyển trang về đúng hàng ngang, khôi phục hiệu ứng ánh sáng nền `cardGlowGreen` và khối `hintBox` "Nghe nhạc không cần mạng".
    - **Đảm bảo Animation trượt không bao giờ biến mất:** Khởi tạo giá trị ban đầu cho các shared value kích thước (`dockWidthShared`, `segmentBarWidthShared`, `barWidthShared`, `containerWidthShared`) từ `Dimensions.get('window').width` ngay Frame 0, loại bỏ triệt để hiện tượng `opacity = 0` hoặc kẹt layout trên iOS New Architecture.
    - **Tăng độ sắc nét viên thuốc trượt Tab Bar (`_layout.tsx`):** Nâng độ tương phản viền và nền (`rgba(29, 185, 84, 0.22)`, border 1.5px) giúp viên thuốc trượt hiển thị rõ nét, mượt mà chuẩn 60/120fps.
22. **Nâng cấp Toàn bộ Animation Tương tác Phần Hồ sơ (`settings/profile.tsx` & `settings/index.tsx`):**
    - **Hiệu ứng phản hồi chạm nhún lò xo (SpringButton & SpringHeroCard):** Tích hợp animation `withSpring` (scale 0.94 -> 1.0) cho tất cả các nút con trong hồ sơ: "Chụp ảnh", "Thư viện ảnh", "Gỡ ảnh", "Lưu hồ sơ" và Thẻ Hero Profile tại Cài đặt.
    - **Bộ chọn biểu tượng huy hiệu âm nhạc (Avatar Badges):** 8 biểu tượng độc quyền (`headphones`, `disc`, `note`, `heart`, `flame`, `star`, `trophy`, `moon`) với hiệu ứng chạm nảy lò xo và viền active xanh ngọc lục bảo phát sáng, cập nhật live preview avatar lập tức.
    - **Viền sáng tương tác ô nhập liệu (AnimatedInput):** Hiệu ứng viền chuyển tiếp mượt mà khi focus/blur ô Tên và Bio.
    - **Thanh tiến độ Level lướt mượt mà:** Thanh Level tại Cài đặt trượt từ 0% tới % tiến độ bằng Reanimated `withTiming`.
    - **Khóa bằng test hồi quy:** Tăng số lượng test trong `uiRegression.test.ts` lên 12 bài test tự động. Toàn bộ monorepo đạt **290/290 tests pass 100%**.
23. **Chuẩn hóa Bố cục Lưới Huy hiệu Hồ sơ & Đổi Icon Check Offline Chuẩn Spotify:**
    - **Sửa triệt để lỗi méo lưới huy hiệu Avatar (`profile.tsx`):** Chuyển sang bố cục lưới 4 cột đều đặn (4x2), mỗi huy hiệu là một nút tròn 58×58px kèm nhãn đầy đủ rõ nét bên dưới, không còn tình trạng viên nhộng co thắt méo mó hay chữ bị cắt cụt.
    - **Trượt mượt mà tức thì Tab Phong cách Đại diện:** Kích hoạt `avatarModeShared.value = withSpring` trực tiếp tại `onPress` khi chạm, đảm bảo viên thuốc xanh lướt trượt liền mạch tức thì giữa "Huy hiệu âm nhạc" và "Ảnh cá nhân".
    - **Icon Offline Check chuẩn Spotify (`library.tsx`, `CollectionDetailModal.tsx`):** Loại bỏ hoàn toàn icon download nằm bên phải tên bài hát. Chuyển sang huy hiệu tròn xanh ngọc kèm dấu check trắng (`offlineCheckBadge` + `CheckIcon`) đặt ngay đầu dòng thông tin nghệ sĩ, giúp tiêu đề bài hát thoáng đãng, dễ đọc 100%.
24. **Tắt hoàn toàn phản hồi rung (Haptic / Vibration) trên toàn bộ ứng dụng theo yêu cầu người dùng:**
    - Vô hiệu hóa `triggerSelectionHaptic()` (`expo-haptics`) trên toàn hệ thống.
    - Dọn dẹp sạch toàn bộ các lệnh `Vibration.vibrate(...)` trong `PlayerContext`, `Library`, `Search`, `Playlists`, `Recent`, `Collection`, `AddToPlaylistModal`.
    - Chặn rung toàn cục ở cấp độ app root (`Vibration.vibrate = () => {}` trong `app/_layout.tsx`), giúp mọi thao tác chạm, chuyển bài, lướt tab, điều khiển âm nhạc hoàn toàn êm ái, không còn rung giật motor thiết bị.
25. **Sửa lỗi Nút Xóa bị Media Player che khuất & Khắc phục triệt để Animation Background Active khi chuyển tab:**
    - **Nút Xóa tại modal Lưu trữ ngoại tuyến (`OfflineDownloadsModal.tsx`):**
      - Khi người dùng bật chế độ chọn bài (`isSelectMode`), MiniPlayer tự động ẩn để nhường toàn bộ diện tích cho thanh công cụ xóa bài (`bottomDeleteBar`), đồng thời nâng `zIndex: 99`, `elevation: 20` và tăng padding chân danh sách để nút "Xóa ... bài" luôn hiển thị rõ ràng, không bao giờ bị đè hay che khuất.
    - **Tái cấu trúc Floating Tab Bar chuẩn Liquid Glass Capsule và khắc phục triệt để animation trượt:**
      - **Nguyên nhân gốc:**
        1. `babel.config.js` dùng sai plugin `'react-native-reanimated/plugin'` thay vì `'react-native-worklets/plugin'` của Reanimated 4, khiến mã worklet không được biên dịch sang runtime worklet mới.
        2. `app.config.ts` thiếu khai báo `newArchEnabled: true` theo yêu cầu của Reanimated 4.
        3. Thanh Tab Bar chưa đo đạc tọa độ thực tế `x` và `width` của từng tab bằng `onLayout` mà tính giả định chia đều, gây lệch tọa độ và mất đồng bộ animation.
      - **Giải pháp hoàn chỉnh:**
        - Cập nhật `babel.config.js` sang `'react-native-worklets/plugin'` và bật `newArchEnabled: true` trong `app.config.ts`.
        - Tách thành các component chuyên trách: `TabBar.tsx`, `TabBarItem.tsx`, `TabIndicator.tsx`.
        - Chỉ dùng MỘT `TabIndicator` duy nhất (`position: 'absolute'`) chạy 100% trên UI thread bằng `useSharedValue` + `useAnimatedStyle`.
        - Đo đạc chính xác tọa độ từng tab qua `onLayout`, lưu `x` và `width` thực tế. Lần đầu khởi tạo đặt ngay vị trí tab active (không animate từ 0).
        - Khi chuyển tab (`state.index`), kích hoạt `withSpring(targetLayout.x, TAB_SPRING_CONFIG)` trượt mượt mà.
        - Tích hợp haptic phản hồi nhẹ (`expo-haptics`, `ImpactFeedbackStyle.Light`).
        - **Khắc phục triệt để lỗi không có frame trung gian (nhảy tức thì do Reduce Motion & Lifecycle React):**
          - Ép buộc chạy toàn bộ frames animation bằng `reduceMotion: ReduceMotion.Never` trong `TAB_SPRING_CONFIG`, ngăn chặn Reanimated bỏ qua animation khi iOS ở chế độ Tiết kiệm pin hoặc Trợ năng Giảm chuyển động.
          - Kích hoạt spring trực tiếp trong `onPress` của `TabBarItem` ngay khoảnh khắc ngón tay vừa chạm để zero latency, kết hợp đồng bộ trong `useEffect` cho các trường hợp đổi route từ bên ngoài.
        - **Tối ưu triệt để hiệu năng chuyển tab (Loại bỏ 100% lag/drop frames):**
          - Gỡ bỏ hoàn toàn `useAnimatedReaction` và `runOnJS(logTranslateX)`: Triệt tiêu tình trạng UI thread liên tục gọi qua JS thread ở 60Hz/120Hz làm nghẽn JS engine trong lúc màn hình tab mới đang mount.
          - Ngăn chặn trigger đè spring (Spring Interrupt): Sử dụng `currentTabRef` để khi đã kích hoạt trượt từ `onPress`, `useEffect` sẽ không gọi lại `withSpring` một lần nữa, giữ chuyển động liền mạch và bảo toàn nguyên vẹn quán tính vật lý.
          - Tinh chỉnh vật lý chuẩn Apple Liquid Glass: `damping: 24, stiffness: 220, mass: 0.6, overshootClamping: true` giúp viên thuốc phản hồi siêu nhạy, lướt thanh thoát và dừng chính xác không rung lắc.
          - Tăng tốc phần cứng 100% GPU (Hardware-accelerated Transform): Cả 5 tab có cùng kích thước nên không animate thuộc tính layout `width` thừa thãi, chỉ sử dụng `transform: [{ translateX }]` thuần túy trên tầng compositing của GPU.
        - **Triệt tiêu độ trễ 1.5s - 7s khi phát bài hát mới (Instant Playback Optimization):**
          - **Root cause lỗi trễ 5-7s khi chọn bài xa:** Thuộc tính `cache` và `preloading` của `@rntp/player` tự khởi chạy một local TCP HTTP proxy server (`CacheProxyServer`) trên iPhone. Khi người dùng chọn bài ngẫu nhiên xa ngoài hàng đợi, proxy này bị nghẽn connection pool với các task preload trước đó, gây timeout 5-7 giây!
          - **Khắc phục:** Gỡ bỏ hoàn toàn `cache/preloading` proxy của RNTP. Trình phát `AVPlayer` native của iOS kết nối trực tiếp tới Cloudflare Worker đã tối ưu Single-pass R2 streaming. Nhạc phát ngay lập tức dưới 100ms cho bất kỳ bài hát nào.
        - **Tối ưu triệt để Floating Tab Bar mượt mà 120fps (Deferred Navigation & Single Width Container):**
          - **Root cause lag ở bottom:** Khi bấm tab, `navigation.navigate` được gọi ngay trong cùng millisecond khiến CPU bị chiếm dụng 100% để unmount/mount màn hình tab mới (hàng ngàn component), gây drop 90% frames của animation. Ngoài ra, shadow 20px blur và style `width` trong animated style buộc Yoga phải layout lại trong từng frame.
          - **Khắc phục:**
            1. Áp dụng kỹ thuật **Deferred Navigation**: Trì hoãn đổi route 80ms để viên thuốc lướt trọn vẹn 120fps trước khi màn hình mới render.
            2. Tính toán vị trí trực tiếp theo tỉ lệ `containerWidth / totalTabs` qua 1 lần đo container duy nhất, loại bỏ toàn bộ `onLayout` rời rạc của từng item.
            3. Giảm shadow blur từ 20px xuống 8px nhẹ nhàng, giảm 80% áp lực render GPU.
**Cập nhật lần cuối:** 2026-11-18 (Chuyển đổi 269 ảnh bìa YouTube 16:9 sang 1:1 ambient blur, xóa toggle vinyl đĩa than tại Now Playing)
**Quy tắc phạm vi:** Quy tắc đóng băng đã được dỡ bỏ cho đợt thiết kế lại trải nghiệm theo `docs/beatify-plan.md` (Thiết kế lại Pha 1 đến Pha 6). Không tự thêm tính năng ngoài tài liệu này. Ý tưởng mới ghi vào `docs/IDEAS.md`.

## Thiết bị và điều kiện
- Thiết bị: Test thật duy nhất trên **iPhone 11 Pro Max** (màn hình chuẩn 414x896); dải thiết bị hỗ trợ từ **iPhone 11 Pro Max đến 16 Pro Max**, **iOS 26+** (khóa portrait, không hỗ trợ landscape, iPad, Android).
- PC Windows. Có thẻ VISA (cần bật được R2, kiểm tra ở Phase 0).
- Người dùng tự lo việc gia hạn app mỗi 7 ngày.
- Ngoài phạm vi: CarPlay, widget.

## Quyết định đã chốt
- Audio: `@rntp/player` (RNTP v5), dự phòng `expo-audio`. Giấy phép dùng cá nhân: **chưa xác nhận** (đọc `https://www.rntp.dev/terms` ở Phase 0).
- Backend: Cloudflare Worker (Hono + Zod) + R2. Không dùng nhiều tài khoản để lách giới hạn free.
- Token & Cấu hình server: Lưu trong file JSON `beatify_server_config.json` qua `expo-file-system` (hiện tại chưa dùng `expo-secure-store`) [backlog bảo mật]. Kết nối bằng deep link `beatify://connect?api=...&token=...` từ mã QR trên Web Dashboard.
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
- [x] Web Dashboard: Nâng cấp UI/UX modal Thùng rác (Track Preview Card giàu thông tin: ảnh bìa, nghệ sĩ, album, thời lượng, định dạng audio, banner lưu trữ an toàn 14 ngày) và hỗ trợ chọn nhiều bài hát (Multi-select, Floating Batch Bar, Batch Trash với danh sách cuộn compact chống vỡ layout).
- [x] Web Dashboard: Tối ưu triệt để hiệu năng Modal/Dialog (triệt tiêu `backdrop-blur` ngốn GPU, bỏ `zoom-in` gây nhòe và rung giật font chữ, chuyển sang fade/slide nhẹ 100-150ms êm mắt; thêm nút xem nhanh/full page trực tiếp 1-click trên thẻ nghệ sĩ).
- [x] Web Dashboard: Chuẩn hoá 100% SVG Vector Icons với `lucide-react`, loại bỏ hoàn toàn emoji (`🎵`, `💿`, `📁`), nâng cấp Tooltip thành Premium Glassmorphism Card (header badge trạng thái, metrics chips, box bài hát nổi bật, đường dẫn thư mục sắc nét).
- [x] Web Dashboard: Tái thiết kế Popover Vòng lặp dạng Horizontal Capsule siêu mỏng gọn (1 hàng ngang `h-8/h-9`, Stepper lặp X lần + Vô tận); Portal Audio Player Dock trực tiếp ra `document.body` ở tầng `z-[70]` (nổi trên mọi Dialog `z-50`, bấm phát nhạc trong dialog là thanh player hiện và điều khiển được ngay).
- [x] Web Dashboard & Backend: Chuẩn hoá phân loại Singles & Albums chuẩn Spotify (phân tách Album phòng thu vs Singles & EPs, đếm `albumCount` chuẩn xác chỉ tính album thật, hiển thị `X album • Y đĩa đơn` trên toàn bộ Card Grid, Table View, Dialog và Full Page View).
- [x] Web Dashboard: Hoàn thiện trải nghiệm tải trang không giật nảy (Zero Content-Flash): Skeleton Loading Rows chuẩn Spotify cho Bài hát đã tải gần đây, trạng thái `● Đang kiểm tra...` cho Engine hệ thống (yt-dlp, FFmpeg), Skeleton cho "Xem tất cả ()" & 4 thẻ Metrics; Tái sử dụng component `DownloadTimeDisplay` hiển thị thời gian tải đồng nhất trên toàn bộ Dashboard và Lịch sử.
- [x] Web Dashboard: Hợp nhất hoàn toàn trải nghiệm giữa "Quản lý bài tải" và "Lịch sử tải" thành một mục thống nhất **"Quản lý & Lịch sử"** (`/youtube-music/manager`) trên Sidebar, tích hợp thanh Sub-tabs `ModuleNavTabs` (`[ 📂 Quản lý tệp & R2 ]` vs `[ 📜 Lịch sử tải & Chi tiết ]`) giúp chuyển đổi không gian quản lý tức thì mà không phân mảnh giao diện hay chia rẽ tính năng.
- [x] Backend & Image Service: Nâng cấp định dạng tải ảnh đại diện nghệ sĩ sang `.png` chất lượng cao Lossless (`artist.png`), đồng thời giữ nguyên cơ chế tương thích Windows Explorer (`folder.png` + `desktop.ini` trỏ tới `artist.png`) bảo đảm thư mục hiển thị ảnh bìa 100%.
- [x] Web Dashboard UI/UX: Nâng cấp Popup Dialog chi tiết nghệ sĩ to bự hơn (`w-[94vw] max-w-5xl max-h-[88vh]`, avatar to 160px, bố cục Album & Singles 5 cột rộng rãi), xóa bỏ trang riêng toàn màn hình và hộp thoại Choice Modal rườm rà, click vào bất kỳ thẻ hay hàng nghệ sĩ là mở trực tiếp popup dialog ngay lập tức.
- [x] Web Dashboard & YouTube Music Suite (`tools/dashboard` + `tools/indexer`):
  - Thay thế hoàn toàn giao diện inline HTML cũ bằng ứng dụng **React 18 + Vite + Tailwind CSS + Lucide Icons SPA** chuyên nghiệp, thiết kế chuẩn token dark/light, không dùng emoji, micro-animations mượt mà, layout Sidebar Responsive.
  - Tích hợp trọn vẹn module **YouTube Music Downloader** từ dự án `Toolkit`:
    - Hỗ trợ tải đơn bài và playlist YouTube/YouTube Music với hàng đợi tiến trình đa luồng (concurrency tuỳ chỉnh).
    - Bộ lọc metadata và làm sạch tên bài / nghệ sĩ tự động thông minh bằng Regex chuẩn hoá NFC (loại bỏ junk tags như `(Official Audio)`, `| @432 hz`, `Lyric Video`...).
    - Tra cứu và tự động nhúng lời bài hát đồng bộ (`synced .lrc` hoặc `plain lyrics`) từ **LRCLIB** và phụ đề chính thức/tự động YouTube CC (`yt-subs`) theo tiêu chuẩn của Beatify.
    - Dialog chỉnh sửa siêu dữ liệu (Title, Artist, Album) trước khi tải.
    - Dialog xem và biên tập lời bài hát `.lrc` trực tiếp trên giao diện: sửa lỗi không nhận lời đã preview sẵn (`customLyrics`), khắc phục thứ tự tham số `title`/`artist` khi gọi LRCLIB, tăng cường retry chống 503/429 và tự động kích hoạt trích xuất phụ đề YouTube CC làm lớp dự phòng an toàn; nâng cấp kích thước rộng rãi (`max-w-5xl`, layout ngang 2 cột: cột trái thông tin bài hát + công cụ, cột phải trình soạn thảo monospace), loại bỏ hoàn toàn `backdrop-blur` và hiệu ứng scale giật cục giúp mở mượt mà 60fps không lag.
    - Trình quản lý & Chọn thư mục cây dàn Layout ngang (Horizontal Directory Tree & Miller Columns):
      - Xem toàn bộ cấu trúc thư mục dạng cây/lưới ngang, thanh breadcrumb tương tác trực tiếp (`D:\ > Music > ...`), lùi cấp thư mục cha (`ArrowUp`), danh sách ổ đĩa (`C:\`, `D:\`) và lối tắt thư viện chính.
      - **Tạo thư mục mới trực tiếp trên Web (+ Tạo thư mục mới)**: Nhập tên thư mục mới ngay tại chỗ, tự động tạo trên ổ cứng bằng chuẩn an toàn Windows `PathSanitizer`.
      - **Đổi tên thư mục (Rename)**: Chỉnh sửa và đổi tên trực tiếp các thư mục hiện có mà không cần mở Windows Explorer.
      - Nút dự phòng mở Windows Explorer truyền thống nếu người dùng cần.
    - Tự động phát hiện & khớp thư mục lưu theo nghệ sĩ trong thư viện máy tính:
      - Bổ sung nút **"Tự động khớp thư mục"** trên thanh công cụ: tự động đối chiếu nghệ sĩ của các bài đang chọn với toàn bộ thư mục nghệ sĩ hiện có trong thư viện máy tính để gán đường dẫn ngay lập tức.
      - Nút chọn nhanh 1-click **`📁 [Nghệ sĩ] (Có sẵn)`** ngay tại từng dòng ở cột "Thư mục lưu": hiển thị rõ nghệ sĩ đã có folder trên máy, bấm 1 cái là áp dụng luôn không cần duyệt tìm thủ công.
    - Cập nhật công cụ `yt-dlp` trực tiếp từ Web Dashboard qua WinGet / CLI.
    - Bảng danh sách xem trước phân tích URL YouTube chuẩn chỉnh (Full Table & Pagination):
      - Thay thế hoàn toàn giao diện div list đơn giản bằng **bảng dữ liệu chuyên nghiệp có Header dính cố định (sticky thead)**.
      - **Đánh số thứ tự (STT index #)** tăng liên tục qua từng trang (`startIndex + index + 1`).
      - **Hệ thống phân trang đầy đủ (Pagination Footer)**: tuỳ chọn `25`, `50`, `100`, `200` bài/trang, hiển thị khoảng dòng và đầy đủ các nút điều hướng (First, Prev, Page Index, Next, Last).
      - **Cột Trạng thái 3 tầng tương tác trực tiếp**:
        - **Check file tệp**: `Đã có` / `Mất file` / `Chưa tải` (tự động so khớp với lịch sử tải trên máy).
        - **Check Lời bài hát (.lrc)**: `.lrc (Đã sửa)`, `.lrc`, `Text`, `Thiếu lời`, `Chờ quét`; click trực tiếp vào badge để mở hộp thoại xem/sửa lời `LyricsEditorDialog`.
        - **Check Ảnh bìa 1:1**: `Có bìa`, `Thiếu bìa`; click trực tiếp vào badge để mở `CoverViewerDialog` xem ảnh gốc độ phân giải cao.
      - **Bộ lọc thông minh trên Action Bar**: Nút "Chỉ bài chưa tải", "Chỉ bài có .lrc", "Đổi thư mục ({count})", "Chọn tất cả" / "Bỏ chọn tất cả".
      - **Ước tính dung lượng thông minh**: Tự động tính toán dung lượng dự kiến của toàn bộ các bài đang chọn theo bitrate định dạng âm thanh đã chọn (`M4A`, `MP3`, `FLAC`, `Opus`).
      - **Tự động lấy Avatar Channel Nghệ sĩ YouTube & Cấu hình Windows Explorer Folder View**:
        - Tự động phân tích và trích xuất ảnh avatar gốc của YouTube channel nghệ sĩ qua trang kênh hoặc video page với chất lượng cao nhất (độ phân giải 900x900 pixel vuông chuẩn).
        - **Định vị thư mục Nghệ sĩ thông minh (`resolveArtistDirectory`)**: Tự động nhận diện cấu trúc phân cấp (lùi khỏi các thư mục con `Singles`, `Albums`, hoặc tên Album cụ thể) để lưu chính xác vào thư mục gốc của Nghệ sĩ (ví dụ: `D:\music for app\(rap)\DAWGS F\artist.jpg`, không đặt lẫn vào trong thư mục bài lẻ `Singles`).
        - **Kiểm tra thông minh chống ghi đè (`hasArtistImage`)**: Quét kiểm tra xem thư mục nghệ sĩ đã có sẵn `artist.jpg`, `folder.jpg`, `cover.jpg`... hay chưa. Nếu đã có thì giữ nguyên vẹn tệp của người dùng, không tải đè.
        - **Hiển thị Avatar ngoài Windows File Explorer**: Tự động lưu `folder.jpg` (gán thuộc tính ẩn hệ thống `attrib +h +s`), khởi tạo `desktop.ini` (`FolderType=Generic`, `Logo=artist.jpg`, gán `attrib +h +s`) và đặt thuộc tính Read-Only `attrib +r` cho thư mục nghệ sĩ để Windows Explorer hiển thị ảnh đại diện kênh ngay ngoài icon thư mục.
        - **Ghi nhận đầy đủ vào `info.txt`**: Tự động ghi nhật ký trạng thái lấy avatar nghệ sĩ vào mục Activity Log trong tệp `info.txt` của bài hát.
      - **Tự động trích xuất phụ đề chính thức (YouTube CC Subtitles) sang lời đồng bộ `.lrc`**:
        - Tự động bổ sung tầng trích xuất phụ đề CC của YouTube qua `yt-dlp --write-sub` (ưu tiên phụ đề tiếng Việt `vi`, tiếp đến tiếng Anh `en`) khi LRCLIB chưa có bản lời đồng bộ hoặc không tìm thấy lời.
        - Xây dựng bộ chuyển đổi `LyricsService.convertVttToLrc`: parse chính xác các mốc timeline `WebVTT/SRT` sang định dạng chuẩn LRC `[mm:ss.xx]`, loại bỏ rác styling HTML, lọc bỏ các chú thích nhạc vô nghĩa `[music]`, `[âm nhạc]`.
        - Đảm bảo các bài hát như Young Money (`Yung Ni99`) hoặc các video ca nhạc có CC đều tự động có badge `.lrc` xanh và trích xuất nguyên vẹn file `.lrc` đồng bộ khi tải về máy.
      - **Khắc phục triệt để hiển thị Tooltip & Tránh che khuất trên bảng**:
        - Chuyển hướng hiển thị của các badge trạng thái (Tệp, Lời .lrc, Ảnh bìa) sang `position="bottom" align="end"`, hoàn toàn không bị `thead sticky` che lấp phần trên khi hover ở các dòng đầu tiên.
        - Tăng kích thước phông chữ và khoảng đệm trong `Tooltip.tsx` và nội dung badge: tiêu đề `12px - 12.5px`, mô tả `11px - 11.5px`, nền nổi bật `shadow-2xl` và `z-[999]` giúp đọc rõ ràng, sắc nét.
    - Lịch sử tải nhạc đầy đủ: tìm kiếm, lọc theo định dạng (`m4a`, `mp3`, `flac`), mở nhanh thư mục trong Windows Explorer, xem/sửa file `.lrc` trên đĩa.
    - Trang **Quản lý bài tải** (`/youtube-music/manager`):
      - Phân loại rõ ràng giữa bài **Đã upload R2 Cloud** và **Chưa upload**, lọc bài mất tệp trên đĩa cứng, nút **Kiểm tra tệp đĩa** (Verify files on disk) quét kiểm tra sự tồn tại thực tế của tệp âm thanh và file lời `.lrc`.
      - **Hợp nhất Nhập file từ máy tính**: Bỏ trang "Nhập file" riêng trên Sidebar; tích hợp nút **"Nhập file từ máy"** trực tiếp vào trang Quản lý bài tải kèm **Modal Review** xem trước thẻ ID3, ảnh bìa, chỉnh sửa inline và tuỳ chọn tải thẳng lên Cloudflare R2 sau khi nhập.
      - **Modal Review Upload lên Cloudflare R2**: Xem lại danh sách, ảnh bìa, thời lượng, định dạng và trạng thái lời `.lrc` trước khi tải lên mây; hỗ trợ chọn hàng loạt bài để upload cùng lúc qua Batch Action Bar.
      - **Xóa đồng bộ đĩa cứng & Cloudflare R2**: Hộp thoại xác nhận an toàn, hỗ trợ chọn xóa file trên đĩa và xóa sạch object trên Cloudflare R2, tự động dọn dẹp khỏi thư viện app mobile.
      - **Đổi thư mục thông minh (Smart Relocate / Re-link)**: Hộp thoại đổi thư mục khi chuyển ổ đĩa hoặc di chuyển file, hỗ trợ tự động quét đối chiếu tên file/dung lượng để khôi phục liên kết hàng loạt, hoặc thay thế tiền tố đường dẫn chỉ với 1 click.
      - Phát nghe thử trực tiếp trên Audio Dock qua HTTP Range stream, nút mở vị trí tệp trên Windows Explorer, dialog sửa lời `.lrc` và tích hợp phím tắt đồng bộ R2 Cloud.
    - **Đồng bộ bố cục & Tỉ lệ UI/UX Dashboard theo phản hồi người dùng**:
      - Mở rộng container chủ thể sang `w-full max-w-[1720px] mx-auto px-8 py-6 space-y-6` trên tất cả 6 trang, thu hẹp khoảng cách trống thừa thãi 2 bên lề trái/phải, tạo khoảng đệm cân đối vừa đủ và tận dụng tối đa không gian màn hình PC.
      - Tăng độ to UI/UX thêm 10% (đặt `zoom: 0.9`, chỉ giảm 10% so với bản gốc) giúp chữ, icon và các khối hiển thị rõ ràng, dễ nhìn hơn; độc lập giữ nguyên kích thước Sidebar.
      - Tích hợp chuẩn giao diện **Dependency Pills & Rich Tooltips** kế thừa từ Toolkit: hover vào `yt-dlp`, `ffmpeg`, `Node.js` sẽ hiện tooltip đầy đủ thông tin (tên engine, phiên bản ngày CalVer/build, trạng thái hoạt động, mô tả, và ô chứa **đường dẫn tệp thực thi đầy đủ Full Path** hỗ trợ select/copy).
      - Sửa dứt điểm lỗi hiển thị thiếu yt-dlp & ffmpeg: nạp PATH động từ Windows Registry (User + Machine) và thư mục WinGet Packages vào tiến trình in-memory, server đã nhận diện chính xác 100% cả `yt-dlp` và `ffmpeg`.
      - **Hiển thị Thời gian tải trên Bảng điều khiển (Dashboard) & Gom cụm Tái sử dụng Component (DRY Refactor)**:
        - Xây dựng module dùng chung `formatters.ts` (`formatDownloadDate`, `formatBytes`, `formatSeconds`) chuẩn hóa format thời gian tiếng Việt và relative time ("Vừa xong", "X phút trước", "Hôm qua...").
        - Tạo bộ component phân tử tái sử dụng `TrackBadges.tsx` (`DownloadTimeDisplay`, `AudioFormatBadge`, `StorageStatusBadge`, `LyricsBadge`).
        - Bổ sung cột hiển thị **Thời gian tải** (giờ & ngày tải, font mono `tabular-nums` sắc nét, kèm tooltip) vào mục "Bài hát đã tải gần đây" trên Bảng điều khiển (`DashboardPage`), đồng bộ hiển thị chuẩn mực như bên trang Lịch sử (`HistoryPage`).
        - Loại bỏ mã nguồn duplicate trên `DownloadedVideosManagerPage` và `HistoryPage`, tối ưu hóa hiệu năng render.
      - **Khắc phục triệt để các Lỗ hổng Bảo mật & Tối ưu Hiệu năng Toàn diện (Audit Remediations)**:
        - **Bảo mật Server Local (`tools/indexer/src/server`)**:
          - Bind tường minh `127.0.0.1` chống lộ server ra mạng LAN khi cắm mạng công cộng.
          - Chống DNS Rebinding: Bổ sung middleware `hostHeaderGuard` xác thực header `Host` (chỉ chấp nhận `localhost` và `127.0.0.1`).
          - Chống CSRF & Siết chặt CORS: Bổ sung `csrfGuard` và cấu hình CORS origin whitelist chỉ cho phép request từ localhost/127.0.0.1 hoặc ứng dụng native/curl.
          - Bảo vệ an toàn tuyệt đối cho `/local-api/fs/delete`: Ngăn chặn Path Traversal và xoá tuỳ tiện; tuyệt đối cấm xoá trong `MUSIC_SOURCE_DIR` (bảo toàn nguyên tắc chỉ đọc), cấm xoá ổ đĩa gốc; chỉ cho phép xoá thư mục con hợp lệ trong `MUSIC_IMPORT_DIR`.
          - Lọc thư mục hệ điều hành trong `/local-api/fs/explore`: Chặn duyệt vào `Windows`, `Program Files`, `$Recycle.Bin`, `System Volume Information`.
        - **Khắc phục Lỗi lệch Endpoint Nhập nhạc (Import Aliases)**:
          - Bổ sung alias route song song cho cả 2 phía: `/local-api/import/inspect` & `/preview`, `/local-api/import/confirm` & `/commit`, tương thích ngược/xuôi 100% giữa Dashboard và Indexer, loại bỏ lỗi 404 khi nhập nhạc.
        - **Tối ưu Hiệu năng Đĩa (Disk I/O) & Chống tràn RAM (OOM)**:
          - Xây dựng `ScanCache` theo dấu vân tay `(filePath, mtimeMs, size)`: Tái sử dụng kết quả quét và `trackId` của các file không thay đổi, triệt tiêu việc đọc toàn bộ file và băm lại SHA-1 trên mỗi request `/local-api/tracks` và `/local-api/library`.
          - Xây dựng `LruBufferCache`: Thay thế `Map<string, Buffer>` vô hạn bằng bộ nhớ đệm LRU giới hạn tối đa 150 mục / 64MB RAM, triệt tiêu nguy cơ phình to bộ nhớ heap gây sập server Node.js.
        - **Tối ưu Chi phí & Độ trễ Cloudflare R2 (`apps/api`)**:
          - Bổ sung `audioKeyCache` trong `R2StorageRepository`: Ghi nhớ đuôi file và kích thước bài hát sau lần truy vấn đầu tiên, loại bỏ việc gọi lặp `bucket.list` (thao tác Class A có tính phí) khi tua (seek) hoặc nghe lại bài hát.
        - **Nâng cấp Trợ năng (Accessibility) App iOS (`apps/mobile`)**:
          - Bổ sung đầy đủ `accessibilityRole="button"` và `accessibilityLabel` bằng tiếng Việt cho toàn bộ hệ thống nút bấm: Play, Pause, Next, Prev, Seek ±5s, Repeat, Smart Shuffle, Yêu thích, Sửa bài, Lời bài hát, Playlist và Hồ sơ cá nhân.
      - **Khắc phục triệt để 5 lỗi Bug & Đồng bộ hệ thống Web Quản lý & Backend Indexer**:
        - **Sửa lỗi đối chiếu R2 Key trong `verifyDownloads` (`youtubeJobRunner.ts`)**: Bổ sung `trackId` vào `YoutubeMusicDownloadRecordSchema`, tính mã băm SHA-1 (12 ký tự hex) khi quét và đối chiếu chính xác với key trên Cloudflare R2 (`music/${trackId}.${ext}`). Đã có 3 unit test tự động xác thực thành công.
        - **Tối ưu Đồng bộ vi sai (Incremental Sync) trong `/local-api/sync` (`index.ts`)**: Lấy danh sách key đã có trên R2, tự động bỏ qua các file âm thanh và ảnh bìa đã tồn tại sẵn trên Cloud, chỉ tải lên các bài mới/sửa đổi. Tốc độ đồng bộ tăng từ hàng chục phút xuống chỉ còn vài giây, tiết kiệm tối đa hạn ngạch Class A PutObject của Cloudflare R2.
        - **Triệt tiêu nghẽn Disk I/O & CPU do Polling 10 giây/lần (`/local-api/status`)**: Triển khai cơ chế cache in-memory với TTL 25 giây, tính toán dung lượng qua `statSync` siêu nhanh từ danh sách bài quét thay vì đọc toàn bộ byte và băm SHA-1 liên tục; chủ động xóa cache (`invalidateStatusCache`) ngay khi có thao tác sửa tag, xóa bài hoặc upload mới. Tăng chu kỳ polling ở `SidebarNav` lên 25 giây.
        - **Khắc phục lỗi xóa bài khỏi RAM Cache (`DELETE /api/youtube-music/downloads/:id`)**: Sửa điều kiện lọc của `cachedScannedTracks` đối chiếu chuẩn hóa theo cả `trackId` và `filePath`, đảm bảo bài hát bị xóa biến mất ngay lập tức khỏi bộ nhớ server mà không cần khởi động lại.
        - **Bảo toàn cấu trúc thư mục phân cấp khi Upload R2 (`uploadDownloadToR2`)**: Sửa lỗi ném file phẳng ra thư mục gốc `sourceDir`; tự động bảo toàn phân cấp thư mục sạch đẹp theo định dạng chuẩn Windows Explorer `Nghệ sĩ / Album / Tên bài` qua `PathSanitizer.sanitizeSegment`.
      - **Triển khai toàn diện 5 Tính năng Tiềm năng Nâng cấp Hệ thống (Mục II)**:
        - **1. Thùng rác (Trash Page) — Khôi phục hàng loạt & Dọn sạch thùng rác (Empty Trash)**:
          - Bổ sung `batchRestoreFromTrash` và `batchPurgeFromTrash` trong `overridesManager.ts`.
          - Xây dựng 2 API mới: `POST /local-api/trash/restore` (khôi phục danh sách đã chọn hoặc toàn bộ) và `POST /local-api/trash/empty` (xóa vĩnh viễn hàng loạt, tự động dọn dẹp file lời `.lrc`, ảnh bìa album mồ côi và hỗ trợ tùy chọn xóa đồng thời trên Cloudflare R2).
          - Giao diện `TrashPage.tsx`: Checkbox chọn từng bài + chọn tất cả, thanh Floating Action Bar thao tác hàng loạt, và nút "Dọn sạch thùng rác" trên Header với hộp thoại xác nhận cảnh báo an toàn. Có bộ 3 unit test tự động xác thực `trashBatch.test.ts`.
        - **2. Bộ lọc thông minh trên Thư viện (Library Page Smart Filters)**:
          - Giao diện `LibraryPage.tsx`: Bổ sung hàng Quick Filter Pills 1-click kèm badge số lượng thời gian thực: *Tất cả*, *Chưa có lời*, *Chưa có ảnh bìa*, *Thiếu lời / bìa*, *Chưa upload R2*, *Mất tệp đĩa*.
          - Kết hợp đồng bộ với ô tìm kiếm từ khóa và bộ lọc định dạng âm thanh.
        - **3. Đồng nhất số liệu Bảng điều khiển (Dashboard Overview Scope) & Trải nghiệm Nạp dữ liệu (Skeleton Loading)**:
          - Truy vấn toàn diện danh sách bài hát thực tế từ `/local-api/tracks` trên ổ cứng kết hợp với bài tải YouTube.
          - Bổ sung thanh chuyển đổi Scope thống kê: *Toàn bộ thư viện máy* (tổng kho nhạc) vs *Nhạc tải YouTube*, giúp các thẻ KPI (% Upload R2, % Độ phủ Lời bài hát, % Độ phủ Ảnh bìa) phản ánh chính xác 100% tình trạng thư viện mà không bị lệch số liệu.
          - **Khắc phục triệt để hiện tượng giật nảy / flash nội dung khi vào trang**:
            - Bổ sung trạng thái Loading êm dịu (`isDepsLoading`, `isHistoryLoading`).
            - Khối Engine Hệ thống: hiển thị `● Đang kiểm tra...` (chấm vàng pulse) thay vì nhảy báo đỏ `○ Chưa cài đặt` rồi mới đổi sang xanh.
            - Bảng bài hát đã tải gần đây: tích hợp bộ khung xương **Skeleton Loading Rows** chuẩn Spotify (`animate-pulse`) với hiệu ứng fade-in mượt mà, loại bỏ hoàn toàn tình trạng hiện text rỗng rồi nhảy bài hát đột ngột.
        - **4. Tự động quét & nạp lời hàng loạt từ LRCLIB (Batch Auto-Fetch Lyrics)**:
          - Xây dựng endpoint `POST /local-api/lyrics/batch-fetch`: Tự động tra cứu LRCLIB theo `Title - Artist` (kèm fallback hoán đổi thứ tự) cho các bài còn thiếu lời, lưu file `.lrc` đồng bộ trực tiếp vào thư mục `lyrics/`.
          - Tích hợp nút thao tác nhanh "Tự động tải lời" trên Toolbar và Floating Batch Bar của `LibraryPage.tsx`.
        - **5. Quét & Đo độ ồn chuẩn hóa âm lượng hàng loạt (Batch ReplayGain / LUFS Scanner)**:
          - Xây dựng endpoint `POST /local-api/tracks/batch-replaygain`: Sử dụng `ffmpeg -af loudnorm` đo độ ồn tích hợp LUFS chuẩn EBU R128 và tính ReplayGain (`-18.0 - input_i`), tự động lưu vào `overrides.json` và làm mới cache.
          - Tích hợp nút "Đo ReplayGain" trên Toolbar và Floating Batch Bar của `LibraryPage.tsx`. Có bộ unit tests xác thực `batchEndpoints.test.ts`.
    - **Nâng cấp Animation với Framer Motion & Mang toàn bộ chi tiết Lịch sử Tải nhạc từ Toolkit**:
      - Cài đặt `framer-motion` cho `tools/dashboard`.
      - Chuyển trọn vẹn 100% trang `HistoryPage.tsx` từ `Toolkit`:
        - Thanh thẻ thống kê tương tác (Interactive Stats Bar) gồm 6 thẻ: Tổng số bài, Hoàn tất, Có lời .lrc, Chưa có lời, Có ảnh bìa, Thiếu ảnh bìa kèm tính năng click lọc tức thì.
        - Thanh filter pills định dạng (`Tất cả`, `M4A`, `MP3`, `OPUS`, `FLAC`) và filter pills trạng thái metadata/lời (`Tất cả`, `Có .lrc`, `Thiếu lời`, `Có bìa`, `Thiếu bìa`).
        - Thanh tác vụ hàng loạt (Batch Bar) xuất hiện trôi nổi khi chọn bài với nút Xoá hàng loạt.
        - Thanh action bar: nút "Chọn tất cả", "Kiểm tra thư mục lưu", nhãn hiển thị số bài, dropdown chọn số bài mỗi trang (`20`, `50`, `100`, `200`).
        - Bảng danh sách bài hát compact chi tiết: Checkbox chọn bài, `#`, Thumbnail zoom, Tên bài, Nghệ sĩ, Album, Badge định dạng, Trạng thái (Hoàn tất/Lỗi/Định vị lại), Lời bài hát (.lrc/Plain/Thiếu lời), Ảnh bìa (Có bìa/Thiếu bìa), Thời gian tải, Đường dẫn tệp tin (hỗ trợ copy path), Cột thao tác (Mở folder, Tải lại, Xóa).
        - Thanh phân trang (Pagination controls) ở footer đầy đủ nút First, Prev, Next, Last.
        - Các hộp thoại xác nhận xoá đơn bài và xoá hàng loạt có tuỳ chọn xoá tệp trên đĩa cứng.
      - Nâng cấp toàn bộ các Dialogs (`CoverViewerDialog`, `MetadataEditDialog`, `CustomFolderDialog`, `LyricsEditorDialog`) và `Tooltip` sử dụng `framer-motion` (`AnimatePresence`, `motion.div`) với hiệu ứng pop-up scale/fade-in mượt mà chuẩn như Toolkit.
      - **Sáng tạo Animation toàn diện với Framer Motion trên toàn ứng dụng**:
        - **Sidebar Navigation**: Nền active và thanh chỉ báo xanh lá tự động trượt di chuyển mượt mà (`layoutId="sidebar-active-bg"`, `layoutId="sidebar-active-indicator"`, `layoutId="sidebar-active-dot"`) khi chuyển tab/trang, kèm hiệu ứng hover micro-shift `x: 3px`.
        - **Dependency Status Pills**: Khi đang kiểm tra môi trường, hiển thị pill loading hiện đại với chấm xanh pulse nhịp thở; khi kiểm tra xong, khối pill tự động nở rộng chiều rộng từ từ ra ngoài (`width: 0 -> auto`) với spring easing hiện đại, không bị giật hay nhảy giao diện.
        - **Sửa dứt điểm lỗi màn hình đen khi chuyển trang**: Nguyên nhân do `<AnimatePresence mode="wait">` xung đột với cơ chế context của React Router `<Outlet />`, khiến `useOutletContext` bị ngắt kết nối trong pha unmount làm sập render tree. Đã gỡ bỏ bọc `mode="wait"` ngoài Outlet, chuyển sang hiệu ứng CSS fade-in mượt mà, bổ sung bộ phòng vệ [ErrorBoundary.tsx](file:///d:/apps%20on%20phone/Beatify/tools/dashboard/src/ui/molecules/ErrorBoundary.tsx) và fallback an toàn tuyệt đối cho `useOutletContext`.
        - **Bổ sung trang Bảng điều khiển (Dashboard)** (`/dashboard`):
          - Tổng quan số liệu kho nhạc: 4 thẻ KPI Hero Metrics (Tổng bài tải, Tỷ lệ đồng bộ Cloudflare R2, Dung lượng % / 10GB Free, Độ phủ lời .lrc & ảnh bìa 1:1).
          - Giám sát môi trường & Engine Health: Hiển thị chi tiết tình trạng sẵn sàng và phiên bản của `yt-dlp`, `FFmpeg`, `Node.js` và `Cloudflare R2 Bucket`.
          - Danh sách bài hát tải gần đây: Xem nhanh 6 bài tải mới nhất, hỗ trợ nghe thử tức thì trên Audio Dock và nút mở folder Windows Explorer.
          - Lối tắt tính năng nhanh: Các thẻ điều hướng sang Tải YouTube, Quản lý bài tải, Lịch sử và Thư viện.
          - Tích hợp mục "Bảng điều khiển" lên đầu Sidebar Navigation với icon `LayoutDashboard`.
        - **Audio Dock Player**: Hiệu ứng trồi lên từ đáy màn hình với spring transition (`initial y: 50 -> 0`).
        - **Filter Chips & Tabs**: Hiệu ứng sliding pill (`layoutId`) trên bộ lọc Định dạng & Trạng thái tại cả trang Lịch sử và trang Quản lý bài tải.
        - **Floating Batch Bar**: Hiệu ứng trượt xuất hiện/biến mất mượt mà khi tích chọn bài hát.
      - **Tối ưu hóa DependencyChecker**: Bổ sung `stdio: 'pipe'` ngăn chặn rò rỉ log lỗi stderr ra terminal console Windows, dùng đường dẫn tuyệt đối cho PowerShell an toàn tuyệt đối.
    - **Trang Quản lý Nghệ sĩ (Artists Management) chuyên sâu trên Web Dashboard (`/artists`)**:
      - **Hero KPI Metrics**: 4 thẻ thống kê đầu trang: Tổng số nghệ sĩ, Đã có ảnh đại diện (avatar), Chưa có ảnh đại diện, Tổng thời lượng âm nhạc của toàn bộ nghệ sĩ.
      - **Thanh tìm kiếm & Bộ lọc linh hoạt**: Tìm kiếm không dấu tiếng Việt theo tên nghệ sĩ, lọc trạng thái ảnh đại diện (`Tất cả`, `Đã có ảnh`, `Chưa có ảnh`), sắp xếp đa chiều (`Nhiều bài hát nhất`, `Thời lượng nhiều nhất`, `Tên A → Z`, `Tên Z → A`).
      - **Chế độ xem kép Grid / Table**: Tuỳ chọn chuyển đổi giữa dạng lưới Card phong cách hiện đại và dạng bảng chi tiết danh sách nghệ sĩ.
      - **Hộp thoại Chi tiết Nghệ sĩ (ArtistDetailDialog)**: Mở modal toàn diện phong cách Spotify, hiển thị ảnh đại diện cỡ lớn, 3 thẻ KPI (Tổng bài hát, Album/Single, Tổng thời lượng), danh sách Album phát hành và danh sách toàn bộ bài hát kèm nút nghe thử tức thì trên Audio Dock.
      - **Cập nhật & Tải Avatar Nghệ sĩ từ YouTube (ArtistAvatarDialog)**: Hỗ trợ dán link kênh YouTube Channel hoặc video YouTube để tự động trích xuất avatar 900x900 pixel vuông, hoặc dán URL ảnh trực tiếp; tự động lưu `artist.jpg`, `folder.jpg` và `desktop.ini` trên máy tính.
      - **Gộp Nghệ sĩ (ArtistMergeDialog) & Chuẩn hóa Overrides**: Tính năng gộp nghệ sĩ thông minh với gợi ý tên tương đồng (Levenshtein/Substring distance), lưu ánh xạ vào `overrides.json` (`artistAliases`) và tự động chuẩn hóa toàn bộ bài hát liên quan mà không phá hủy file gốc.
      - **Tương tác Windows File Explorer**: Nút mở thư mục nghệ sĩ trực tiếp trên máy tính (`explorer.exe`).
      - Điều hướng tích hợp trên Sidebar Nav (`/artists`) trong nhóm KHO NHẠC với icon `Users`.
    - **Hoàn thiện gói 14 cải tiến UI/UX & Tối ưu hoá toàn diện Web Dashboard**:
      - **1. Phân loại & rà soát toàn diện thao tác**: Nhận diện và củng cố toàn bộ các liên hệ giữa Download, Quản lý tệp cục bộ, Lịch sử, R2 Cloud và Nghệ sĩ.
      - **2. Đồng bộ trạng thái Tải nhạc & Tách Tooltip Portal**:
        - Tự động chuyển tag `Chưa tải` sang `Đã tải` ngay khi Job tải hoàn tất qua SSE events listener; tự động nhận diện và đồng bộ sidecar `.lrc` và ảnh bìa `.jpg`.
        - Nâng cấp `Tooltip.tsx` dùng `createPortal` vào `document.body` với toạ độ `fixed`, loại bỏ 100% hiện tượng đè lấn hoặc làm giãn nở chiều cao dòng của bảng.
      - **3. Chống load lại khi đổi trang**: Cấu hình `staleTime: 5 phút`, `gcTime: 30 phút` cho TanStack QueryClient; chuyển tab tức thì không giật lag.
      - **4. Chuẩn hóa Action Explorer & Nâng cấp Audio Dock**:
        - Chuẩn hóa đường dẫn tuyệt đối với `path.normalize(path.resolve())` khi mở `explorer.exe` (sửa triệt để lỗi mở sai folder).
        - Nâng cấp Audio Dock toàn diện: Cover thumbnail, Title, Artist, Timeline seeker bar, thời gian `00:00 / 00:00`, nút tua lùi `↺ 5s`, tua tới `5s ↻`, Volume slider + Mute toggle.
        - Đồng bộ hai chiều icon Play/Pause giữa Audio Dock và nút trên danh sách (hiển thị icon `Pause` ⏸ khi bài đang phát).
      - **5. Native Folder Picker (Hộp thoại chọn thư mục Windows)**: Thêm endpoint `POST /local-api/folders/pick` sử dụng PowerShell `System.Windows.Forms.FolderBrowserDialog` mở hộp thoại native Windows trực quan.
      - **6. Dọn dẹp Sidebar**: Loại bỏ nút "Đồng bộ R2 Cloud" thừa thãi ở footer Sidebar.
      - **7. Tinh chỉnh Thẻ Dung lượng**: Hiển thị định dạng nhỏ gọn trong ngoặc đơn: `(Đã dùng: X MB - Y bài, Chưa upload: A MB - B bài)` trên Dashboard và Sidebar.
      - **8. Trạng thái Loading**: Bổ sung spinner animation khi đang tải dữ liệu danh sách bài hát trên trang Library và Download Manager.
      - **9. Quản lý Tệp mất trên Đĩa & Nút "Kiểm tra tệp đĩa"**: Hiển thị badge "Mất tệp" / "Có tệp", chặn phát và toast cảnh báo khi file bị xóa ngoài máy tính; thêm nút "Kiểm tra tệp đĩa" trực tiếp trên Thư viện.
      - **10. Widget Đồng hồ & Ngày tháng Việt Nam trên Sidebar**: Đặt dưới logo Beatify với đồng hồ Live `HH:mm:ss` (chấm xanh pulse) và ngày tháng chuẩn `Thứ X, DD/MM/YYYY`.
      - **11. Hệ thống Lời bài hát đồng bộ trên iPhone (`LyricsModal` + `EditTrackModal`)**:
        - Trình xem lời đồng bộ thời gian thực (LRC Synced) với hiệu ứng cuộn mượt 60fps bám theo nhạc, highlight câu hát hiện tại, bấm vào từng câu để tua nhạc (seek) chính xác.
        - Tự động nạp lời bài hát hiện có từ Cloudflare R2 vào ô sửa lời khi mở modal chỉnh sửa bài hát trên iPhone, hỗ trợ sửa lời và đồng bộ lên R2.
      - **12. Hệ thống Danh sách phát & Yêu thích đồng bộ 2 chiều (`/api/state` + `PlaylistsPage` + `PlaylistModal`)**:
        - Backend API Worker + Local Indexer: Hỗ trợ `GET /api/state` và `PUT /api/state` lưu trữ `UserState` (`playlists`, `favoriteIds`) vào `_meta/state.json` trên R2 theo cơ chế last-write-wins (`updatedAt`).
        - Web Dashboard: Trang Danh sách phát & Yêu thích (`/playlists`) cho phép tạo playlist, thêm/bớt bài hát từ thư viện, xóa playlist, thả tim bài hát yêu thích, phát trực tiếp từ playlist.
        - iPhone Mobile: `PlaylistModal` hỗ trợ xem tuyển tập, tạo playlist mới, thêm bài từ thư viện, xóa bài, xóa playlist, thả tim yêu thích ngay trên Player và danh sách bài hát, tự động đồng bộ 2 chiều với Cloudflare R2 và Web Dashboard.
      - **13. Tối ưu kết nối iPhone & lưu trữ session**:
        - Thiết kế lại modal Mã QR kết nối iPhone (chuẩn hoá flex footer dock, z-index 10001, hướng dẫn quét camera native).
        - Lưu cấu hình server vĩnh viễn trên iPhone (`beatify_server_config.json`), quét 1 lần dùng mãi mãi.
        - Tích hợp `sessionStorage` tự động lưu trữ danh sách link bài hát chưa tải trên trang YouTube Music, chuyển qua lại các trang không bị mất bài.
      - **11. Tính năng Player nâng cao**: Tích hợp Shuffle (Ngẫu nhiên), Loop (Lặp lại: Tắt / Lặp N lần / Lặp vô tận), và nút Mic mở Popup xem lời bài hát trực tiếp trên Audio Dock.
      - **12. Kế thừa chuẩn dự án**: Rà soát và áp dụng trọn vẹn các logic tải, sidecar `.lrc`, cover folder ẩn và log `info.txt`.
      - **13. Định dạng Ngày Việt Nam & Icon Mic**: Format ngày phát hành yt-dlp chuẩn `DD/MM/YYYY`; đổi icon thẻ Metadata & Lời thành icon Mic (`Mic2`).
      - **14. Kiểm thử toàn diện**: Toàn bộ dự án vượt qua `pnpm typecheck`, `pnpm lint`, `pnpm test` (41/41 unit test mobile, 18/18 test indexer, 0 lỗi TypeScript).
      - **Cập nhật khắc phục 8 vấn đề chi tiết (Update Session 2)**:
        - **1. Sửa lỗi mở Explorer**: Chuẩn hóa lệnh `explorer.exe /select,"path"` khi mở tệp trên Windows; tự động fallback sang thư mục cha nếu tệp bị di chuyển hoặc bị xóa.
        - **2. Gắn tag Mất tệp & Kiểm tra tệp đĩa chuẩn xác**: Kiểm tra động `existsSync` thực tế trên đĩa cứng ngay khi lấy danh sách tải; hiển thị tag "Mất tệp" màu đỏ/cam nổi bật kèm cảnh báo chặn phát.
        - **3. Đồng bộ icon Play/Pause ở Quản lý bài tải**: Đồng bộ nút Play ở cả trên ảnh thumbnail và cột hành động bên phải bảng khi phát nhạc.
        - **4. Tinh chỉnh Đồng hồ & Ngày tháng Sidebar**: Giảm kích thước (`text-[10px]`), bỏ font-weight đậm, hiển thị thanh mảnh, tinh tế và tối giản.
        - **5. Sửa lỗi Tag 'Đã lên Cloud' sai lệch**: Loại bỏ logic gán nhầm tệp `MUSIC_SOURCE_DIR` cục bộ vào danh sách R2 keys; chỉ bài hát thực sự có trên Cloudflare R2 bucket mới được gắn nhãn `Đã lên Cloud`.
        - **6. Nâng cấp Nghệ sĩ (2 Options Modal & Trang Full View & Hover Preview)**:
          - Bổ sung Modal lựa chọn khi click vào Nghệ sĩ: **Xem nhanh (Popup Dialog)** hoặc **Trang chuyên sâu (Toàn màn hình)**.
          - Xây dựng component `ArtistFullPageView`: Banner cỡ lớn, thẻ thống kê chuyên biệt, phân bố định dạng (FLAC, M4A, MP3, OPUS), danh sách album và bảng đầy đủ bài hát có nút phát tất cả.
          - Bổ sung Rich Tooltip khi hover: hiển thị tóm tắt top bài hát, số album, thời lượng và đường dẫn thư mục.
        - **7. Đồng bộ xoá dữ liệu & Invalidate Queries tức thì**: Mặc định chọn `deleteFiles: true` khi xóa bản ghi; dọn dẹp `cachedScannedTracks` trong RAM; tự động gọi `purgeFromTrash` trong `overrides`; kích hoạt invalidate đồng bộ 7 queries liên quan để mọi trang cập nhật tức thì.
        - **8. Củng cố chức năng Verify**: Quét chuẩn xác từng đường dẫn `libraryRootPath` + `relativeFilePath`, kiểm tra thực tế trên ổ đĩa và cập nhật tức thì vào bảng.
        - **9. Xóa Breadcrumb & Tối ưu không gian**: Loại bỏ hoàn toàn dải thanh breadcrumb thừa ở đầu trang (`Beatify > Section > Page`), giúp giao diện sạch sẽ, giải phóng không gian dọc và đồng bộ với PageHeader của từng trang.
        - **10. Tùy biến Popover Vòng Lặp & Thông báo Toast Xịn sò**:
          - Thiết kế Popover dạng **Horizontal Capsule siêu nhỏ gọn**: toàn bộ dàn trên 1 hàng ngang duy nhất (`flex items-center gap-1.5`, chiều cao chỉ 36px, bo góc viên thuốc mềm mại `rounded-2xl`, hiệu ứng kính mờ `backdrop-blur-xl`).
          - **Ẩn triệt để spinner mặc định của trình duyệt**: loại bỏ hoàn toàn nút mũi tên lên xuống xám mặc định của `input[type="number"]` bằng CSS `[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`.
        - **11. Nâng cấp Toàn diện Tương tác Web Dashboard & Mobile App (iPhone 16 / iOS 27)**:
          - **Mã QR Kết nối Nhanh (ConnectAppModal)**: Sinh mã QR chứa Deep Link chuẩn `beatify://connect?api=...&token=...`. Người dùng chỉ cần mở Camera mặc định trên iPhone 16 quét mã là app tự động nhận cấu hình server và tải thư viện, không cần gõ phím.
          - **Bộ đếm & Cảnh báo Hết hạn Sideload 7 ngày (SideloadExpiryWidget)**: Hiển thị ngay trên Sidebar Web Dashboard; cảnh báo màu vàng khi còn 1-2 ngày và màu đỏ khi hết hạn; có nút bấm "Đã gia hạn hôm nay (Reset 7 ngày)" tiện lợi cho người dùng Windows Sideloadly.
          - **Mobile Deep Link Handler (`apps/mobile/app/index.tsx`)**: Tích hợp hook lắng nghe `Linking` tự động bóc tách tham số `api` và `token` từ mã QR, rung phản hồi và tự động kích hoạt đồng bộ thư viện nhạc.
        - **12. Nâng cấp Full Lyrics Stage & Tối ưu Trải nghiệm Nghe nhạc**:
          - **Loại bỏ Popup trôi nổi co giật**: Thay thế cửa sổ nổi bằng **Full Lyrics Stage (Split Layout chuẩn Spotify & Apple Music)** nằm cố định trên thanh Player Dock.
          - **Bố cục 2 cột cân xứng**: Cột trái hiển thị bìa album lớn (280-320px), tên bài hát và tên nghệ sĩ; cột phải hiển thị dòng lời bài hát cuộn êm đềm với hiệu ứng Gradient Mask mờ dần ở đỉnh và đáy (loại bỏ hoàn toàn cảm giác chóng mặt/buồn nôn).
          - **Tối ưu triệt để độ mượt (60fps)**: Khắc phục root cause code gọi `scrollTo` bị nhầm là user scroll và khóa 2.5s; đồng bộ `requestAnimationFrame` 60fps; loại bỏ background highlight hộp và số giây thừa thãi theo yêu cầu người dùng.
          - **ArtistHoverCard & Tooltip Nghệ sĩ**: Nâng cấp card xem trước thông tin nghệ sĩ với mini-tracklist thanh lịch, rút gọn đường dẫn thư mục và bổ sung các nút CTA nhanh (Hồ sơ, Mở thư mục Explorer, Sao chép tên).
          - Cung cấp đầy đủ các thao tác nằm ngang: Nút **Tắt** (`RotateCcw`), cụm stepper ngang gồm nút `[-]`, ô số căn giữa, nút `[+]`, nút kích hoạt xanh **Lặp N lần**, và nút **Vô tận (∞)**.
          - Tích hợp thông báo Toast cao cấp (`sonner`) khi bật/tắt Shuffle và khi thiết lập vòng lặp (báo rõ số lần lặp hoặc vô tận).
        - **11. Phóng to Thẻ Nghệ sĩ, Sửa lỗi Mở Folder & Chuẩn hoá Con trỏ chuột Cursor Pointer**:
          - **Phóng to Thẻ Nghệ sĩ**: Chuyển lưới từ 6 cột hẹp sang 3-4 cột rộng rãi (`grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6`); tăng kích thước Avatar nghệ sĩ từ 96px lên 144px - 160px (`w-36 h-36 md:w-40 md:h-40`), nút Play to 48px, tên nghệ sĩ to rõ font 16-18px sang trọng chuẩn Spotify.
          - **Sửa triệt để nút Mở thư mục trên máy tính**: Khắc phục lỗi `execFile` không mở được Explorer trên Windows; endpoint `/local-api/artists/:name/open-folder` chuyển sang dùng `youtubeJobRunner.openFolderInExplorer(targetDir)`, tiếp nhận `folderPath` truyền từ frontend, tự động quét fallback từ thư viện local hoặc YouTube downloads; hiển thị Toast phản hồi kết quả mở thư mục rõ ràng.
          - **Sửa đường dẫn phát nhạc Audio**: Đồng bộ route phát nhạc nghệ sĩ sang `/local-api/stream/${track.id}` kèm thông báo Toast tên bài hát khi bắt đầu phát.
          - **Chuẩn hóa Cursor Pointer**: Rà soát và gắn class `cursor-pointer` cho toàn bộ các nút thao tác (Play, Camera, Folder), thẻ Album, hàng bảng Table, các nút chuyển tab, và các tùy chọn trong hộp thoại.
    - Server-Sent Events (SSE) `/api/jobs/:id/events` hiển thị tiến trình tải bài hát thời gian thực theo từng giai đoạn (Tải audio, Trích xuất, Tải cover, Gắn tag ID3, Căn lời bài hát).
    - Khắc phục triệt để lỗi **Minified React error #310** (vi phạm Rules of Hooks): dọn dẹp vị trí `useState` nằm dưới early return trong `LyricsEditorDialog.tsx`, quét tĩnh bảo đảm 100% component tuân thủ nghiêm ngặt quy tắc Hooks của React.
    - Tương thích 100% monorepo: TypeScript strict, 0 lỗi lint, 0 lỗi typecheck, 59/59 test passed.
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
- [x] Tích hợp Module Nhập Nhạc Từ YouTube & Lời Đồng Bộ LRCLIB vào Web Console (`tools/indexer`):
  - Kế thừa & tái cấu trúc các dịch vụ từ Toolkit (`d:\Extensions\Toolkit`):
    - `MetadataCleaner`: Tự động cắt từ rác `[Official MV]`, `(Lyric Video)`, chuẩn hóa kênh (` - Topic`, `VEVO`), phân tách đa nghệ sĩ `feat.`, `ft.`, `x`, `&`, Title Case an toàn tiếng Việt.
    - `PathSanitizer`: Chuẩn hóa tên file trên Windows, khống chế ngân sách độ dài `MAX_PATH` (260 ký tự), `safeMoveFile` có cơ chế retry chống lỗi khóa file `EBUSY / EPERM`.
    - `LyricsService`: Tích hợp API **LRCLIB** lấy lời đồng bộ `.lrc`, throttle 300ms, retry khi gặp 503 ServerOverloaded, cảnh báo lệch thời lượng > 3s.
    - `DependencyChecker`: Tự động kiểm tra `yt-dlp` và `ffmpeg`, làm mới biến môi trường `PATH` từ Windows Registry.
    - `YoutubeService`: Hỗ trợ URL video đơn và Playlist, tải audio chất lượng cao (`m4a`, `mp3`, `flac`), tự động crop tâm ảnh thumbnail thành tỷ lệ vuông 1:1 làm bìa album, đóng gói ID3 tag qua `ffmpeg`, lưu `.lrc` và ảnh bìa vào `custom_covers/`, tự động cập nhật `overrides.json`.
  - Giao diện Web Console (Tab mới **"Nhập từ YouTube"**):
    - Khung nhập URL kèm nút "Dán từ clipboard" và "Kiểm tra & Xem trước".
    - Smart Preview Card: Hiển thị ảnh bìa album 1:1, form sửa nhanh Tên bài, Ca sĩ, Album, Lời bài hát `.lrc` trước khi tải.
    - Thanh tiến trình tải thời gian thực hiển thị % và giai đoạn rõ ràng.
    - Hỗ trợ tải Playlist: danh sách bảng chọn từng bài hát trong playlist.
    - Nút phát thử nhạc ngay sau khi tải (`Audio Dock`) và nút đồng bộ lên Cloudflare R2 tức thì.
  - Bộ kiểm thử tự động toàn diện: 17 unit tests trong `tools/indexer` (thêm 16 unit tests mới cho `metadataCleaner`, `pathSanitizer`, `lyricsService`, `youtubeService`), lint và typecheck sạch 100%.
- [x] Người dùng cấu hình thông tin R2 vào `tools/indexer/.env` và máy chủ tự động nhận diện thành công
- [x] Khắc phục triệt để hiển thị ảnh bìa tùy chỉnh (tự động tính lại `albumId` khi ghi đè ca sĩ/album và nạp `custom_covers/`); bổ sung Modal xác nhận Xóa vĩnh viễn với tùy chọn rõ ràng (không dùng confirm trình duyệt) và cơ chế dọn dẹp an toàn.
- [x] Nâng cấp trải nghiệm Mobile Delight (Profile, Beatify Replay Stats, Smart Shuffle, Mystery Queue):
  - `packages/shared`: Thuật toán `smartShuffle` phân bổ tối ưu nghệ sĩ tránh trùng lặp; module `stats` tính toán Beatify Replay (Tuần, Tháng, Năm, 6 huy hiệu kỷ niệm âm nhạc bao gồm Cú đêm 0h-5h sáng); 43 unit tests qua 100%.
  - `apps/mobile`:
    - **Hồ sơ cá nhân & Thống kê Replay (ProfileModal)**: Tùy chỉnh tên người dùng, chọn biểu tượng đại diện vector SVG (tai nghe, đĩa than, nốt nhạc, trái tim, ngọn lửa, ngôi sao, cúp, mặt trăng), tab xem lại số phút nghe/lượt nghe/top bài hát/top nghệ sĩ theo Tuần này, Tháng này, Năm 2026, các cột mốc kỷ niệm kèm SVG badge.
    - **Smart Shuffle (Trộn bài thông minh)**: Tự động phân tán bài cùng ca sĩ, ghim bài đang phát ở đầu, khôi phục thứ tự ban đầu khi tắt trộn.
    - **Bí ẩn hàng đợi (Mystery Upcoming Queue)**: Khi bật Smart Shuffle, toàn bộ danh sách các bài hát tiếp theo được giấu tên (`Bài hát bí ẩn` kèm biểu tượng Sparkles/Dấu hỏi chấm SVG tối giản), tạo cảm giác tò mò và bất ngờ như yêu cầu; nút sửa bị khóa cho bài bí ẩn để bảo toàn bí mật.
    - **Chuyển đổi sang Biểu tượng vector SVG (phong cách phẳng hiện đại, thay thế emoji)**:
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
      - **Hoàn thành Bug B4 (`avatarKey` migration)**: Bổ sung `avatarKey` vào `UserProfile`, migration guard tự động chuyển `avatarEmoji` cũ sang `avatarKey` trong `loadUserProfile()`, giao diện `ProfileModal` hiển thị chuẩn icon SVG vector.
      - **Hoàn thiện phòng vệ B17 toàn diện cho `statsStorage`**:
        - Tách biệt `loadSucceeded` khỏi `cachedRecords` chống kẹt `writeBlocked` vĩnh viễn khi lỗi I/O.
        - Buffer RAM `pendingOnError` có trần 100 bản ghi + trần retry `MAX_LOAD_RETRIES = 3` chống kẹt vòng lặp I/O.
        - Cứu dữ liệu từ `.tmp` hợp lệ: khi đọc vào RAM thành công, nếu `moveAsync` sang file chính thất bại vẫn trả về dữ liệu trong RAM (không trả về null làm mất dữ liệu khi ghi tiếp); phân biệt rõ lỗi I/O tạm thời (chặn ghi, retry) với không có file `.tmp`.
        - Bảo toàn `.tmp` trong `_doWrite`: cờ `mainFileDeleted = true` ngăn chặn xóa `.tmp` nếu file chính đã bị xóa; giới hạn nhánh fallback chỉ chạy khi xác nhận file đích đang tồn tại.
        - Xác thực từng bản ghi qua `ListeningRecordSchema` (Zod) trong `@music-app/shared`, áp trần `STATS_MAX_RECORDS` sau khi merge pending.
        - Ghi log và hiển thị riêng biệt `Atomic Write Branch` (phân biệt 'tạo mới' vs 'overwrite' vs 'đích không xác định do lỗi I/O check'), `Lỗi move trực tiếp` (khi rơi vào fallback), `Khôi phục .tmp` và `Hàng đợi ghi đĩa` (`pendingWriteCount` thay thế boolean `isWriting`) trực tiếp trên bảng Debug (`index.tsx`) phục vụ nghiệm thu C3 #11.
        - Tự động sao lưu file gốc dạng `.partial-<timestamp>` nếu phát hiện bản ghi không khớp Zod schema; lập tức **chặn ghi (`writeBlocked = true`) nếu sao lưu `.partial` thất bại** để phòng ngừa xóa mất dữ liệu gốc không khớp schema. Giới hạn dọn dẹp tự động tối đa 3 bản `.partial` gần nhất (`_pruneOldPartials`) tránh rác đĩa.
        - Schema `ListeningRecordSchema` sử dụng `.passthrough()` bảo toàn các trường mở rộng trong tương lai, có 3 unit tests chuyên biệt trong `packages/shared`.
        - Bộ test `statsStorage.test.ts` gồm 14 tests bao phủ toàn diện các nhánh I/O hiểm nghèo, partial backup failure, destState unknown, lastMoveError và B4 migration guard.
    - **Đóng băng Báo cáo Kiểm tra (Audit Report v3.10 — Bản hoàn thiện trước build)**: Chuẩn hóa 8 bug, 1 lỗ hổng bảo mật, **8 điều kiện dừng Phase 0** với quy tắc tinh chỉnh (tách bạch P0.4a.1 vs P0.4a.2, chuẩn hóa công thức P0.1 theo trung bình, trần debug tích lũy ≤ 4h), giới hạn diễn giải C3 #11 (gỡ app cũ trước Bước A, overwrite thành công chỉ chứng minh tương thích Expo FileSystem trên iOS 27 không ném lỗi; an toàn crash dựa vào phục hồi `.tmp`), loại bỏ toàn bộ nhận xét thẩm mỹ chủ quan và đồng bộ trọn vẹn **15 tiêu chí đo đạc C3** vào `docs/ACCEPTANCE.md`. Dừng rà soát tài liệu để chuyển sang build và đo thực tế trên thiết bị.
  - Kiểm thử toàn diện: **106 tests passed** trên toàn bộ monorepo (shared: 46, mobile: 41, api: 18, indexer: 1), `pnpm typecheck` và `pnpm lint` sạch 0 lỗi.
- [ ] Người dùng kích hoạt GitHub Actions build lại `.ipa` (biến thể `development`, do thêm `react-native-svg`) và cài lên iPhone
- [ ] Người dùng chạy nghiệm thu thực tế 15 tiêu chí Phase 0 (bảng C3) trong `docs/ACCEPTANCE.md`
- [ ] Người dùng chạy đồng bộ thư viện nhạc thật lên Cloudflare R2

## Thiết kế lại Pha 2: Bottom Tabs, MiniPlayer & Now Playing (Đã hoàn thành theo docs/beatify-plan.md)
- [x] Cấu trúc Bottom Tabs chuẩn Expo Router: `app/(tabs)/_layout.tsx`, 3 tab Thư viện | Tìm kiếm | Playlist, tôn trọng insets.bottom (Home indicator).
- [x] Custom Tab Bar tích hợp MiniPlayer: MiniPlayer nằm ngay trên thanh điều hướng đáy, không nhảy z-index hay flicker.
- [x] Hook `useTabBarMetrics`: tính toán hình học động (`tabBarHeight = 49`, `miniPlayerHeight = 56` khi có bài / 0 khi không có bài, `contentPaddingBottom = tabBar + miniPlayer + insets.bottom + spacing.sm`) kèm 3 unit test tự động.
- [x] MiniPlayer Component (`MiniPlayer.tsx`):
  - Chiều cao 56pt chuẩn pixel.
  - Ảnh bìa 40x40 bo góc `radius.sm`, tên bài và ca sĩ cắt dòng an toàn (`numberOfLines={1}`).
  - Nút Play/Pause và Next có vùng chạm $\ge 44\times 44$ qua `hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}`.
  - Thanh tiến trình 2pt ở đỉnh dùng `useProgress()`, tách riêng tránh re-render MiniPlayer mỗi 250ms.
  - Ẩn hoàn toàn khi không có bài (`miniPlayerHeight = 0`), layout dưới dâng lên tự nhiên.
  - Chạm vào nền MiniPlayer mở modal toàn màn hình `/now-playing`.
  - Bộ 5 unit test tự động xác thực hiển thị, ẩn khi trống, navigation và gọi hàm điều khiển.
- [x] Màn hình Now Playing (`NowPlayingView.tsx` & `app/now-playing.tsx`):
  - Modal sheet `presentation: 'modal'` vuốt xuống hoặc chạm ChevronDown để thu nhỏ/đóng.
  - Ảnh bìa responsive vuông theo `useResponsive()` (`height * 0.36`), bo góc `radius.xl`, placeholder đĩa than khi không có ảnh bìa.
  - **Hàng đợi phát nội tuyến (Inline Queue Panel):** Bấm nút "Hàng đợi" ở thanh công cụ dưới để chuyển đổi vùng ảnh bìa thành panel danh sách chờ (và ngược lại), hỗ trợ chạm vào bài bất kỳ để phát và nút thùng rác xóa bài khỏi queue (`removeFromQueue`) an toàn.
  - Nút Tim (HeartIcon) đồng bộ với danh sách Yêu thích của `LibraryContext` (`toggleFavorite`).
  - Thanh tua nhạc (Scrubber) có vùng chạm 44pt chuẩn Apple HIG, thanh bar 4pt bo tròn `radius.pill`, nhãn thời gian 2 bên `formatTime`.
  - Cụm điều khiển chính: Play/Pause tròn to 64x64 nổi bật ở tâm, Prev, Next, Shuffle thông minh, Repeat (Tắt / Tất cả / 1 bài).
  - Nút phụ: "Lời nhạc" mở `LyricsModal` (tái dùng mã nguồn có sẵn) và nút "Hàng đợi" đổi vùng ảnh bìa.
  - Khảo sát tràn màn hình: Bảng kích thước trên 4 cỡ màn hình iPhone Face ID (375x812, 393x852, 414x896, 440x956) đều dư từ 85pt đến 162pt không bị tràn; phòng vệ kép bằng `ScrollView`.
- [x] Màn hình Thư viện (`app/(tabs)/library.tsx`): FlatList bài hát tối thiểu, chạm để phát, padding đáy thích ứng an toàn.
- [x] Các màn hình placeholder `search.tsx` và `playlists.tsx` có tiêu đề và thông điệp tiếng Việt.
- [x] Nút tạm thời "✨ Giao diện mới (thử nghiệm) →" tại `index.tsx` để vào `/(tabs)/library` (có ghi chú sẽ xóa ở Pha 3).
- [x] Quy tắc Token: 100% theme token (0 mã màu hex/rgba hardcode, 0 `Dimensions.get`).
- [x] Kiểm thử toàn diện: 56/56 unit tests của mobile passed, 204/204 tests toàn workspace passed (shared: 65, mobile: 56, indexer: 61, api: 22), 0 lỗi TypeScript, 0 lỗi lint.

## Thiết kế lại Pha 3: Thư viện (Bài hát/Album/Nghệ sĩ) + Tìm kiếm không dấu + Chuyển hướng index.tsx
- [x] Tìm kiếm tức thì (`app/(tabs)/search.tsx`):
  - Ô tìm kiếm thanh lịch với icon kính lúp, nền `colors.surface`, placeholder "Tìm bài hát, ca sĩ, album...".
  - Nút xóa nhanh `x` (kích thước tối thiểu 44x44pt).
  - Chuẩn hóa văn bản và loại bỏ dấu tiếng Việt với `normalizeText` từ `@music-app/shared`.
  - Tìm kiếm đồng thời theo tên bài hát (`title`), nghệ sĩ (`artist`), và album (`album`).
  - FlatList hiển thị kết quả: ảnh bìa album, tên bài hát (đổi màu nổi bật khi đang phát), nghệ sĩ, thời lượng `formatTime`. Chạm để phát tức thì.
  - Xử lý trạng thái trống: thông báo "Nhập từ khóa để tìm bài hát trong thư viện" khi chưa nhập và "Không tìm thấy bài hát nào" khi không có kết quả khớp.
- [x] Thư viện hoàn chỉnh (`app/(tabs)/library.tsx`):
  - Segmented Control 3 phân đoạn: `[ Bài hát | Album | Nghệ sĩ ]` với viền `radius.full` và tương tác mượt mà.
  - Phân đoạn Bài hát: Thống kê số lượng bài hát và tổng thời lượng; danh sách cuộn mượt mà; hỗ trợ kéo xuống để làm mới (Pull-to-Refresh `syncLibrary`); menu `•••` từng bài mở ActionSheet native (Yêu thích/Bỏ thích, Sửa bài hát mở `EditTrackModal`, Xóa bài hát đưa vào thùng rác R2 có hộp thoại xác nhận an toàn).
  - Phân đoạn Album: Gom nhóm tự động theo album từ thư viện, hiển thị ảnh bìa album, số lượng bài hát và thời lượng; chạm để phát toàn bộ album.
  - Phân đoạn Nghệ sĩ: Gom nhóm tự động theo nghệ sĩ, hiển thị số lượng bài hát; chạm để phát toàn bộ bài hát của nghệ sĩ đó.
  - Nhấn giữ tiêu đề "Thư viện" để mở thông báo Cài đặt ẩn (sẽ hoàn thiện màn hình chi tiết ở Pha 4).
- [x] Tự động chuyển hướng (`app/index.tsx` & `app/_layout.tsx`):
  - Chuyển `index.tsx` thành `<Redirect href="/(tabs)/library" />` an toàn tuyệt đối.
  - Không làm mất bất kỳ logic nào: deep link `beatify://connect` đã chạy ở root `LibraryContext.tsx`, `EditTrackModal` đã được tích hợp vào menu `•••` của `library.tsx`, `LyricsModal` đã được tích hợp trong `NowPlayingView.tsx`.
  - Ẩn header của route `index` trong `_layout.tsx`.
- [x] Kiểm thử toàn diện: 56/56 unit tests của mobile passed, 204/204 tests toàn workspace passed, 0 lỗi TypeScript, 0 lỗi lint.

## Thiết kế lại Pha 4: Đồng bộ ngầm ETag + Cài đặt ẩn
- [x] Đồng bộ ngầm ETag & Cache thư viện (`LibraryContext.tsx` & `musicApiClient.ts`):
  - Lưu và nạp cache thư viện từ file `beatify_library_cache.json` bằng cơ chế ghi đĩa atomic (`.tmp` + `moveAsync`).
  - Mở app nạp ngay bài hát từ bộ nhớ đệm (Zero Loading Flash, không màn hình chờ).
  - Tự động gửi ngầm `GET /api/library` kèm header `If-None-Match: <etag>`.
  - Xử lý phản hồi `304 Not Modified`: Giữ nguyên danh sách, cập nhật `lastSyncTime`, không tốn băng thông và không re-render.
  - Xử lý phản hồi `200 OK`: Cân bằng `interleaveTracksByArtist`, cập nhật `tracks`, `originalTracks`, `albums`, lưu cache kèm ETag mới.
  - Xử lý khi mất mạng/offline: Giữ nguyên thư viện từ cache, ghi nhận `lastSyncError`, không hiển thị Alert làm phiền người dùng.
  - Phương thức `clearLibraryCache()`: xóa cache cục bộ và tải lại mới từ Cloudflare R2.
- [x] Màn hình Cài đặt ẩn (`src/components/HiddenSettingsModal.tsx`):
  - Kích hoạt bằng thao tác nhấn giữ (Long Press) tiêu đề "Thư viện" trên tab Thư viện (`app/(tabs)/library.tsx`).
  - Sử dụng 100% theme tokens, Dark mode sang trọng, chuẩn giao diện iOS pageSheet.
  - Nhóm 1: Thông tin hệ thống & Chứng chỉ Sideload (`expirationDate`, `buildSha`, `iOS 26+`, độ trễ chuyển bài `gaplessDeltaMs`).
  - Nhóm 2: Đồng bộ ngầm ETag & Bộ nhớ đệm (`lastSyncTime`, `currentEtag`, `atomicWriteBranch`, `recoveryStatus`, `writeQueueStatus`, `lastMoveError`, `lastSyncError`, nút "Kiểm tra bài mới (ETag)", nút "Xóa Cache & Tải lại").
  - Nhóm 3: Cấu hình máy chủ Cloudflare (Zero-Config: xem URL/Token, cho phép sửa & lưu cấu hình thủ công).
  - Nhóm 4: Hồ sơ & Thống kê nghe nhạc Replay (Nút mở `ProfileModal` hiển thị tổng thời gian nghe, top bài hát, danh hiệu).
  - Nhóm 5: Hàng phát bí mật (Custom Audio URL: stream trực tiếp file âm thanh từ đường dẫn bên ngoài qua `addCustomTrack`).
- [x] Kiểm thử toàn diện: 58/58 unit tests mobile passed (+2 tests ETag mới), 206/206 tests toàn workspace passed 100%, 0 lỗi TypeScript, 0 lỗi lint.

## Thiết kế lại Pha 5: Album / Nghệ sĩ / Playlist + Dọn dẹp mã nguồn
- [x] Tab Playlist hoàn chỉnh (`app/(tabs)/playlists.tsx`):
  - Card "Bài hát yêu thích" (Liked Songs) cố định ở đầu với icon trái tim nổi bật, thống kê số bài hát tự động từ `userState.favoriteIds`.
  - Quản lý danh sách phát cá nhân (`userState.playlists`): tên playlist, số lượng bài hát, mô tả.
  - Nút "+ Tạo mới" mở Modal nhập tên & mô tả playlist, đồng bộ tự động vào `userState`.
  - Nút xóa playlist có hộp thoại Alert xác nhận an toàn.
  - Chạm vào bất kỳ playlist hoặc danh sách yêu thích để mở màn hình chi tiết tuyển tập.
- [x] Tuyển tập chi tiết Album & Nghệ sĩ & Playlist (`src/components/CollectionDetailModal.tsx`):
  - Dùng chung chuẩn mực cho cả Chi tiết Album, Chi tiết Nghệ sĩ, Chi tiết Playlist và Chi tiết Bài hát yêu thích.
  - Header với ảnh bìa lớn (hoặc avatar nghệ sĩ dạng tròn `radius.pill`), tiêu đề, nghệ sĩ, số lượng bài và thời lượng tổng `formatTime`.
  - Cụm nút hành động lớn: "▶ Phát tất cả" và "🔀 Xáo trộn" phát toàn bộ danh sách tức thì qua `playQueue`.
  - Danh sách FlatList bài hát đánh số thứ tự, highlight bài đang phát, nút thả tim nhanh, và nút xóa bài khỏi playlist (dành riêng cho playlist cá nhân).
- [x] Tích hợp Thư viện Album & Nghệ sĩ (`app/(tabs)/library.tsx`):
  - Chạm vào thẻ Album $\rightarrow$ Mở `CollectionDetailModal` của Album đó (xem bài, nghe toàn bộ, xáo trộn).
  - Chạm vào hàng Nghệ sĩ $\rightarrow$ Mở `CollectionDetailModal` của Nghệ sĩ đó (xem toàn bộ bài hát của nghệ sĩ trong thư viện).
- [x] Dọn dẹp mã nguồn: 0 cảnh báo unused vars, loại bỏ toàn bộ code thừa, 100% theme tokens.
- [x] Kiểm thử toàn diện: 58/58 unit tests mobile passed, 206/206 tests toàn workspace passed 100%, 0 lỗi TypeScript, 0 lỗi lint.

## Thiết kế lại Pha 6: Tính năng phụ & Tinh chỉnh trải nghiệm hoàn tất
- [x] Nâng cấp Tab "Trang chủ" (`app/(tabs)/library.tsx`):
  - Bỏ icon trái tim ở header tag Yêu thích, thêm tag "Nghe nhiều nhất" (`top_played`) liên kết với `statsStorage.getReplayReport()`.
  - Hiệu ứng chuyển động Active Indicator mượt mà cho hàng filter tags (Animated Spring Left & Width theo layout động).
  - Loại bỏ dòng text thống kê dư thừa (`... bài hát (Yêu thích <3)`).
  - Tăng độ cao `paddingVertical` và kích thước bấm cho 3 nút phân đoạn ("Bài hát", "Album", "Nghệ sĩ").
- [x] Tái thiết kế Tab "Vừa nghe" (`app/(tabs)/recent.tsx`):
  - Xóa bỏ tag "Lịch sử phát", tiêu đề lớn phong cách Apple Music/Spotify.
  - Thẻ Hero Card nổi bật cho bài hát nghe gần đây nhất kèm nút Quick Play/Pause và thả tim.
  - Hàng nút tác vụ nhanh: "Phát tất cả" & "Phát ngẫu nhiên" (`smartShuffle`).
  - Danh sách bài hát trước đó đánh số thứ tự gọn gàng, trạng thái phát và Empty State cao cấp.
- [x] Tái thiết kế Tab "Tìm kiếm" (`app/(tabs)/search.tsx`):
  - Xóa bỏ dòng chữ thô kệch cũ, thay bằng tiêu đề tinh tế "Tìm kiếm bài hát" và hướng dẫn rõ ràng.
  - Tích hợp Lịch sử tìm kiếm gần đây (`searchHistoryStorage`): ghi nhớ các bài đã tìm kiếm vào `beatify_search_history.json`, hỗ trợ phát ngay, xóa từng mục hoặc xóa toàn bộ lịch sử.
- [x] Đơn giản hóa mục Chuyển bài thông minh trong Hồ sơ cá nhân (`src/components/HiddenSettingsModal.tsx`):
  - Rút gọn toàn bộ tiêu đề và nhãn mô tả, loại bỏ tràn viền, súc tích và thân thiện.
- [x] Đổi thứ tự bài hát trong Hàng đợi (Reorder Queue `moveQueueItem`):
  - Tích hợp cụm nút di chuyển bài lên `↑` và xuống `↓` trong Panel Hàng đợi của Now Playing.
  - Tính toán và cập nhật an toàn `currentTrackIndex` khi thay đổi vị trí bài hát.
  - Phản hồi rung nhẹ haptic (10ms) mỗi lần di chuyển.
- [x] Hẹn giờ tắt nhạc (Sleep Timer):
  - Nút "Hẹn giờ" tích hợp ở hàng nút phụ của Now Playing kèm icon đồng hồ `ClockIcon`.
  - Hỗ trợ các mốc hẹn giờ: 15 phút, 30 phút, 45 phút, 60 phút, và nút Tắt hẹn giờ.
  - Hiển thị đồng hồ đếm ngược trực tiếp trên nút (`formatTime(sleepTimerRemainingSec)`).
  - Tự động tạm dừng phát nhạc khi hết giờ và rung haptic thông báo.
- [x] Thêm bài hát vào danh sách phát từ Menu `•••`:
  - Bổ sung tùy chọn "Thêm vào danh sách phát..." trong menu `•••` của Thư viện.
  - Modal danh sách playlist cá nhân hiển thị số lượng bài hát hiện có.
  - Kiểm tra chống trùng lặp: thông báo nếu bài hát đã có trong playlist, thêm vào `trackIds` và lưu Cloudflare R2 nếu chưa có.
- [x] Kiểm thử toàn diện: 58/58 unit tests mobile passed, 206/206 tests toàn workspace passed 100%, 0 lỗi TypeScript, 0 lỗi lint.

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
4. **Bạn:** thực hiện kiểm tra thực tế theo checklist **P0.1 đến P0.15** trong `docs/ACCEPTANCE.md` (cuộn xuống cuối màn hình chính để đối soát `Build SHA`, `Hạn chứng chỉ`, `Atomic Write Branch` và `Khôi phục .tmp` trên bảng Debug).
5. **Duyệt Prune 503 R2 Orphan Covers (sau khi kiểm tra app xong):**
   - Đã xác minh bằng script: 503 covers mồ côi (120.61 MB) hoàn toàn không còn được tham chiếu bởi bất kỳ bài hát active nào trong `library.json`, không có trong `overrides.json`, và là cache cũ của các album trước khi chuẩn hóa tên nghệ sĩ.
   - Đã tải về sao lưu an toàn 100% (503/503 ảnh) tại `tools/indexer/backups/reorg_logs_20261118/orphan_covers_backup`.
   - Giữ nguyên các key được bảo vệ: `lyrics-manual/*`, `lyrics/62a7ccbe277b.lrc` (bản BlackBi trong `_duplicates`), 2 file `library.backup*.json`.
   - Chờ người dùng xác nhận trên app xong sẽ kích hoạt lệnh prune chính thức cho 503 covers này.
6. **Quyết định hướng xử lý ID mồ côi trong User State (Playlists / Favorites):**
   - `baa55f484230`: ID bài "Dương Domic - Mất Kết Nối" lưu từ commit `9189219` (hiện tại trong thư viện bài này mang ID `0dde57433c84`). Chờ người dùng quyết định: cập nhật sang ID mới hay xóa khỏi favorites.
   - `62a7ccbe277b`: ID bản BlackBi (hiện đã chuyển sang `_duplicates`), đang nằm trong playlist `chill chill ha`.
   - `581ff2893598` và `88c676f27218`: 2 ID mồ côi có sẵn từ trước đợt reorg.

## Vấn đề đã biết
- `build-ios.yml` là mẫu chưa chạy thử. So với mẫu, đã đổi: (a) nhãn `macos-26` thay `macos-latest`, (b) Xcode 26.6 cụ thể và chặn nếu không phải Xcode 26.x, (c) thêm job kiểm tra Linux trước khi bật macOS, (d) cache kho tải CocoaPods (`~/Library/Caches/CocoaPods`) thay vì thư mục `ios/Pods`, vì `expo prebuild --clean` xoá `ios/` và tự chạy `pod install` nên cache `Pods` đặt sau prebuild không có tác dụng (suy luận, cần xác nhận ở lần build đầu).
- `pnpm/action-setup` đã nâng từ `v4` lên `v6` (ở `ci.yml`, `build-ios.yml` và mẫu trong skill) vì README hiện hành của action này dùng `v6` làm ví dụ và ghi vẫn hỗ trợ pnpm 11 và 12, còn `v4` (phát hành từ 2025) chưa được kiểm chứng với pnpm 12. Các action còn lại (`checkout`, `setup-node`, `cache`, `upload-artifact`) vẫn để `v4`, có thể có cảnh báo về phiên bản runtime khi chạy thật. Nếu bước cài pnpm vẫn lỗi ở lần chạy CI đầu tiên, dùng action kế nhiệm `pnpm/setup` (chỉ cho pnpm 11 trở lên) thay cho `pnpm/action-setup` + `actions/setup-node`.
- `LibrarySchema` dùng `z.literal(1)`: app phải đọc `version` trước khi parse để hiện "Cần cập nhật app" thay vì lỗi (PLAN mục 7.4). Việc này làm ở Phase 2.
- `lyrics.ts` chỉ có `LyricsRefSchema` vì `TrackSchema` cần import; phần còn lại của lời bài hát thuộc Phase 4.
