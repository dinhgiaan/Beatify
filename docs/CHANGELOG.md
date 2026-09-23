# Lịch sử thay đổi của plan

Bản mới nhất ở trên. Đây là lịch sử để tham khảo, Agent không cần đọc khi làm việc.

## Thay đổi v2.2

| Thay đổi | Lý do |
|---|---|
| Thanh tiến trình đổi từ dạng trơn sang **dạng sóng âm** (waveform): indexer tạo dữ liệu đỉnh sóng bằng `ffmpeg`, lưu ở `waveforms/{id}.json` trên R2, app vẽ | Người dùng chọn thêm tính năng này |
| Thêm **phương án dự phòng dạng trơn** khi bài chưa có dữ liệu sóng (bài mới nhập, hoặc chưa chạy `pnpm indexer waveform`) | Không được để mất khả năng tua bài nếu thiếu dữ liệu |
| Vạch đánh dấu dòng lời trên thanh: **để lại `docs/IDEAS.md`, chờ người dùng quyết định** (đã giải thích, chưa chốt) | |

## Thay đổi v2.1

| Thay đổi | Lý do |
|---|---|
| Thêm đặc tả **thanh tiến trình (timeline)** vào `docs/SCREENS.md`: kéo để tua, chạm để tua, hiển thị thời gian, cập nhật mượt, trạng thái đang tải, vạch tiến trình ở MiniPlayer | Plan chỉ ghi có "thanh tiến trình" mà chưa nói hành vi. Đây là phần cốt lõi của MVP (Phase 2) |
| Thêm 5 mục thử (26 đến 30) vào `ACCEPTANCE.md`, cập nhật skill `rntp-audio` và `mobile-conventions` | Đồng bộ |
| Ghi vào `docs/IDEAS.md` (danh sách chờ): thanh dạng sóng âm, vạch đánh dấu dòng lời trên thanh | Chưa làm vì đang đóng băng phạm vi, chờ bạn quyết định |
| Sửa lỗi dấu câu ở mục "Tiêu chí xong" của Phase 1 | Lỗi do nối chuỗi ở bản trước |

## Thay đổi v2.0

| Thay đổi | Lý do |
|---|---|
| Tách lịch sử thay đổi khỏi `PLAN.md` sang file này, thêm `docs/PLAN-SUMMARY.md` (tóm tắt và bản đồ tài liệu) | `PLAN.md` đã dài hơn 1.100 dòng, Agent dễ mất tập trung. Giờ Agent đọc theo tầng: STATUS, tóm tắt, rồi chỉ các mục của phase đang làm |
| **Đóng băng phạm vi** và thêm `docs/IDEAS.md` (danh sách chờ và các ý tưởng đã loại) | Plan đã phình to trước khi có MVP |
| Thêm `docs/SCREENS.md`: sơ đồ màn hình, điều hướng, bố cục | Trước đây chỉ ghi dùng `expo-router`, Agent sẽ tự bịa giao diện |
| App có thêm duyệt theo **Nghệ sĩ** (Phase 3) | Gộp nghệ sĩ ở dashboard chỉ có giá trị khi app xem được theo nghệ sĩ |
| **Bucket R2 riêng tư**, luật giới hạn tần suất, URL ký có hạn là nâng cấp sau | Bảo vệ khi token hoặc link stream bị lộ |
| **Dữ liệu mẫu** `@music-app/shared/testing` và chế độ demo (chỉ biến thể development) | Agent không thấy thư viện thật, cần dữ liệu để test app, Worker, dashboard |
| Giữ **`.ipa` bản tốt gần nhất** (`builds/known-good/`), **smoke test 5 phút** sau mỗi build (ACCEPTANCE mục S), mục RUNBOOK quay lại bản cũ | Artifact GitHub chỉ giữ 14 ngày |
| Thêm `docs/GLOSSARY.md` và `docs/TROUBLESHOOTING.md` | Bạn không code nên cần từ điển và bảng xử lý lỗi thường gặp |

## Thay đổi v1.9

| Thay đổi | Lý do |
|---|---|
| Dashboard có trang **Nhập nhạc** (kéo thả): xem trước tag và trùng lặp, sửa tag trong bảng, chép vào `MUSIC_IMPORT_DIR`, hoàn tác trước khi đồng bộ | Trước đây plan không có cách thêm nhạc nào trong dashboard, đó là thiếu sót trong thiết kế |
| Nhập từ **link tải trực tiếp** (tuỳ chọn, làm sau cùng), chặn địa chỉ nội bộ, **không hỗ trợ** link trang web hay video | Cách thay thế hợp lệ, không có bộ trích xuất cho từng trang |
| **Ngoại lệ duy nhất** cho quy tắc "không ghi vào thư mục nhạc" của Agent: Nhập nhạc chỉ thêm file mới, không ghi đè, không xoá | Nhập nhạc buộc phải ghi file, nên giới hạn chặt |

## Thay đổi v1.8

| Thay đổi | Lý do |
|---|---|
| **Nhóm A (10 mục):** màn hình Hàng đợi và Nghe gần đây, xử lý token sai (nhập lại), cảnh báo sắp hết hạn chứng chỉ (thử ở spike), `GET /api/health`, mã lỗi dùng chung, đọc file `.lrc` cạnh file nhạc, trang Sức khoẻ thư viện, gộp nghệ sĩ, lịch sử chỉnh sửa `overrides.json`, sao lưu một nút | Bạn chọn thêm cả 10 mục |
| **Nghe offline** (mục 13.4) có tuỳ chọn **chỉ tải qua Wi-Fi** (mặc định bật) | Bạn chọn |
| **Quản lý ảnh bìa** trong dashboard, kèm `Album.coverVersion` để app làm mới cache khi đổi ảnh | Bạn chọn |
| **Không thêm:** đếm lượt nghe, chế độ tiết kiệm dữ liệu | Bạn quyết định không cần |
| Ghi rõ **cách đưa nhạc vào thư viện hiện có** (mục 5.6) | Trả lời câu hỏi về import |
| Skill mới `offline-downloads`, cập nhật 7 skill và `AGENTS.md` | Đồng bộ |

## Thay đổi v1.7

| Thay đổi | Lý do |
|---|---|
| Thêm mục **8.1 Quy tắc mã dùng chung (`packages/shared`)**: hàm nào từ hai nơi trở lên dùng thì để ở shared, chỉ TypeScript thuần | Tránh viết hai bản bị lệch giữa app, Worker, indexer và dashboard |
| Chuyển vào shared: `normalizeText`, kiểm tra `id`, hằng số, `utf8ByteLength`, `formatTime`, tìm kiếm, parser LRC, nội suy chữ, schema overrides | Đây là các hàm mà từ hai nơi trở lên cùng cần |
| **Test "golden" cho `normalizeText`** | `albumId` tính từ nó, đổi cách chuẩn hóa sẽ đổi `albumId` cả thư viện |
| Thư mục parser LRC tên `lrc/`, không dùng `lyrics/` | Tránh trùng với file `lyrics.ts` đã có |
| Cập nhật `AGENTS.md` và 5 skill cho đồng bộ | Agent không viết lại các hàm này ở nơi khác |

## Thay đổi v1.6

| Thay đổi | Lý do |
|---|---|
| **Thêm và sửa lời ngay trong app** (dán lời, sửa chữ, chỉnh lệch thời gian, chạm để đồng bộ). Bản của bạn lưu ở `lyrics-manual/`, indexer không bao giờ ghi vào | Bạn muốn tự thêm lời cho bài chưa có và sửa lời hiện có |
| **Tô dần theo nhạc** với 3 mức: cả dòng, từng chữ bằng nội suy, từng chữ theo mốc thật (định dạng `elrc`) | Nhìn theo lời như karaoke. Mốc thời gian thật từng chữ khó có sẵn cho nhạc Việt nên mức 2 dùng nội suy |
| Mục **13.3 Phát nhạc mượt và shuffle**: kiểm tra gapless ở spike, đặc tả shuffle, crossfade thử nghiệm, không làm mix kiểu DJ | Plan trước chỉ có ReplayGain và shuffle/repeat sơ lược |
| Worker: `PUT/DELETE /lyrics/:id`, `GET /api/lyrics/manual`. Thao tác ghi chỉ nhận token qua header | Cho phép ghi lời từ app một cách an toàn |

## Thay đổi v1.5

| Thay đổi | Lý do |
|---|---|
| Thêm mục **12.7 iPhone 16 chạy iOS 27**: ghim Xcode 26.x, dùng Expo SDK 57 ổn định, chưa dùng SDK 58 beta | App build bằng SDK iOS 27 (Xcode 27) bắt buộc dùng UIScene, nếu không có thể không mở đúng trên iOS 27 |
| Thêm mục **5.5 Sao lưu** và **7.4 Tương thích phiên bản dữ liệu** | Tránh mất dữ liệu và tránh app cũ bị crash khi dữ liệu đổi định dạng |
| Thêm **`docs/RUNBOOK.md`**, mẫu **`ci.yml`** (Linux), quy tắc **vùng cấm** trong `AGENTS.md`, hook quét secret | Bạn không code nên cần sổ tay, kiểm tra tự động rẻ tiền và rào chắn cho Agent |
| Xoá mẫu `AGENTS.md` và prompt mẫu khỏi plan (mục 11.2, 11.5), chỉ giữ con trỏ | Tránh trùng lặp và lệch với file thật |
| Ghi rõ **MVP = Phase 0 đến 2**, **CarPlay và widget ngoài phạm vi** | Giữ phạm vi kiểm soát được |
| Ghi thiết bị đã xác nhận (mục 1.1) | iPhone 16, iOS 27, thẻ VISA, PC Windows |

## Thay đổi v1.4

| Thay đổi | Lý do |
|---|---|
| Thêm **Lời bài hát** (Phase 4, mục 13.2) theo các bước L0-L4, bắt đầu bằng đo độ phủ | Thư viện có cả nhạc Việt và nhạc ngoại, độ phủ và chất lượng nhận dạng tiếng Việt chưa kiểm chứng |
| Thêm `LyricsRefSchema`, endpoint `/lyrics/:id`, module Lyrics trong app | Hiển thị lời đồng bộ trong Now Playing |
| Thêm `tools/lyrics-py/` (Python, tuỳ chọn) | Whisper và Demucs là công cụ Python |
| Thêm skill `lyrics-pipeline` | Quy tắc thực thi riêng cho phần lời |

## Thay đổi v1.3

| Thay đổi | Lý do |
|---|---|
| Thêm **Dashboard local** (Phase 4, mục 13.1) chạy ở `127.0.0.1` trên PC, không đưa lên cloud | Sửa metadata, xem trước khi sync, thống kê mà không cần dòng lệnh. Worker không chạy được `ffmpeg` nên dashboard đặt cạnh indexer |
| Thêm **`overrides.json`**: chỉnh sửa metadata không phá huỷ, gộp vào `library.json` | Chạy lại `beets` hoặc `sync` không ghi đè chỉnh sửa tay |
| Thêm skill `local-dashboard` | Quy tắc riêng về bảo mật server local và cách gộp overrides |
| Repo chuyển sang **private** (mục 15) | Người dùng đã chọn |

## Nhật ký thay đổi so với v1.1

| Thay đổi | Lý do |
|---|---|
| **Đổi thư viện audio:** dùng `@rntp/player` (React Native Track Player **v5**), dự phòng `expo-audio`. Bỏ `react-native-track-player` v4 | v4 chưa hỗ trợ New Architecture và cần vá native. Expo SDK 55 trở lên bắt buộc New Architecture. `expo-audio` chưa có tài liệu cho nút next/previous trên lock screen (xem mục 4.3) |
| Thêm mục **Lưu trữ và giới hạn free** (mục 5), không dùng nhiều tài khoản để lách giới hạn | Chi phí vượt free rất thấp, nhiều tài khoản thì phức tạp và có rủi ro vi phạm điều khoản |
| Thêm **Modules của app** (mục 6) và schema **Album/Playlist/UserState** (mục 7) | Trả lời câu hỏi về module và playlist |
| **Token nhập trong app** thay vì nhúng vào bundle | Không có secret trong bundle hoặc CI |
| Thêm **Quy trình làm việc với AI Agent** (mục 11) và **Hướng dẫn cài và dùng trên iPhone** (mục 12) | Bạn không code, cần quy trình rõ ràng |
| Thêm **Phase 0 spike** (chạy thử player trên iPhone thật trước khi làm tiếp) | Xác nhận thư viện, build và sideload hoạt động sớm nhất |
