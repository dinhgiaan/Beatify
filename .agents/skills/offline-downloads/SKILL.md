---
name: offline-downloads
description: Nghe offline cho app music-app (Phase 4) gồm tải bài, album, playlist, yêu thích về iPhone, tuỳ chọn chỉ tải qua Wi-Fi (mặc định bật), hàng đợi tải, tạm dừng và tiếp tục, quản lý dung lượng, phát từ file cục bộ, lời và ảnh bìa dùng khi không có mạng. Dùng skill này mỗi khi làm việc với tải nhạc về máy, features/offline, expo-file-system, kiểm tra mạng Wi-Fi hay dữ liệu di động, dung lượng bộ nhớ, hoặc khi người dùng nói "nghe offline", "tải về máy", "chỉ tải bằng Wi-Fi", "hết dung lượng". Không bắt đầu trước khi MVP (Phase 2) đạt và người dùng đồng ý.
---

# Nghe offline (Phase 4)

Thiết kế đầy đủ ở `docs/PLAN.md` mục 13.4. Skill này là quy tắc thực thi.

## Điều kiện bắt đầu

1. `docs/STATUS.md` cho thấy MVP (Phase 0 đến 2) đã đạt nghiệm thu.
2. Người dùng đã đồng ý làm tính năng này.
3. Trước khi viết code chính, làm **thử nghiệm nhỏ** cho ba điều **chưa kiểm chứng** và ghi kết quả vào bảng giả định trong `docs/STATUS.md`:
   - Thư viện audio phát được từ file cục bộ (`file://`).
   - Tải có tiếp tục khi tắt màn hình hoặc khi app ở nền không.
   - Nhận biết đúng Wi-Fi và dữ liệu di động bằng thư viện mạng, kể cả khi dùng điểm phát Wi-Fi.

## Tính năng

| Tính năng | Mô tả |
|---|---|
| Tải | Từng bài, cả album, cả playlist, "Tải tất cả yêu thích" |
| **Chỉ tải qua Wi-Fi** | Tuỳ chọn trong Settings, **mặc định bật** |
| Quản lý tải | Tiến trình, tạm dừng, tiếp tục, huỷ, thử lại |
| Dung lượng | Tổng đã tải, xoá từng bài, xoá tất cả, giới hạn tuỳ chọn (không giới hạn, 2, 5, 10 GB) |
| Nghe offline | Bài đã tải tự phát từ file trên máy. Lời và ảnh bìa của bài đã tải xem được khi không có mạng |

## Chỉ tải qua Wi-Fi

- Tuỳ chọn lưu trong MMKV, **mặc định bật**.
- Khi tuỳ chọn bật mà đang dùng dữ liệu di động: **không bắt đầu tải**. Hàng đợi hiện "Đang chờ Wi-Fi" và tự tiếp tục khi có Wi-Fi (lắng nghe sự kiện đổi mạng). Không được tiêu dữ liệu di động.
- Đang tải mà mạng chuyển sang dữ liệu di động: dừng ngay, giữ phần đã tải để tiếp tục sau nếu tải tiếp tục được, chuyển sang "Đang chờ Wi-Fi".
- Tắt tuỳ chọn: cho tải qua dữ liệu di động sau khi hiện xác nhận có tổng dung lượng ước tính.
- Tuỳ chọn chỉ áp dụng cho **việc tải**. Nghe stream bình thường không bị ảnh hưởng.
- Điểm phát Wi-Fi (hotspot) có thể bị nhận nhầm là Wi-Fi thường. Settings có dòng chú thích. Nếu thư viện mạng cho biết kết nối "tốn phí" hoặc chế độ dữ liệu thấp (chỉ khi API hỗ trợ, cần kiểm chứng) thì coi như dữ liệu di động.
- Thư viện mạng: ưu tiên module của Expo. Thư viện có mã native thì **hỏi người dùng trước** và báo cần build lại `.ipa`.

## Lưu trữ

- File nằm trong thư mục `offline/` của app, tên `{id}.{ext}`. **Không lưu đường dẫn tuyệt đối** (UUID thư mục app trên iOS có thể đổi), chỉ lưu tên file và ghép đường dẫn lúc dùng.
- Chỉ mục `OfflineIndex` trong MMKV: `id → { file, size, etag, downloadedAt }`, có Zod schema. Chỉ mục hỏng thì dựng lại bằng cách quét thư mục.
- Tải vào file `.part`, xong kiểm tra kích thước (`Content-Length`, và ETag nếu có) rồi mới đổi tên. File `.part` mồ côi được dọn khi mở app.
- Kiểm tra dung lượng trống trước khi tải. Có giới hạn tuỳ chọn. Gần đầy thì báo và không tải thêm.
- Có nên loại file tải khỏi bản sao lưu iCloud của thiết bị hay không: chưa kiểm chứng cách làm với `expo-file-system`, đối chiếu tài liệu và hỏi người dùng.
- Cập nhật bản cũ: khi làm mới thư viện qua Wi-Fi, so ETag (`HEAD /stream/:id`) với bản đã lưu. Khác thì đánh dấu "có bản mới" và chỉ tải lại khi người dùng cho phép.

## Trình quản lý tải

- Hàng đợi tải, chạy song song tối đa 2 bài, có tiến trình từng bài và tổng.
- Tạm dừng, tiếp tục, huỷ, thử lại có backoff. Lỗi mạng không được làm hỏng file đã có.
- Tải khi ở nền: iOS giới hạn. **Chỉ đảm bảo tải khi app đang mở.** Chưa kiểm chứng tải tiếp khi tắt màn hình. Nếu không tiếp tục được thì ghi rõ trong app.
- URL tải dùng token trong query như stream, **không log URL đầy đủ**.
- Gặp `INVALID_TOKEN` khi đang tải: dừng hàng đợi và chuyển sang luồng nhập lại token (skill `mobile-conventions`).

## Phát và hiển thị

- `PlayerService` dùng đường dẫn cục bộ nếu bài đã tải, không thì dùng URL stream. Không đổi phần còn lại của player.
- Lời và ảnh bìa của bài đã tải phải xem được khi offline: tải trước và giữ bền vững (ảnh dùng cache đĩa của `expo-image` hoặc lưu kèm, lời lưu cùng chỉ mục, kể cả lời trong `lyrics-manual/`).
- Thư viện đã cache mở được khi không có mạng. Bài chưa tải hiện mờ, không phát được và có thông báo rõ.
- Biểu tượng trạng thái trên từng bài: chưa tải, đang tải, đã tải, chờ Wi-Fi, lỗi.

## Settings

Tổng dung lượng đã tải, danh sách bài đã tải (xoá từng bài), "Xoá tất cả", tuỳ chọn chỉ tải qua Wi-Fi, giới hạn dung lượng, chú thích về điểm phát Wi-Fi.

## Test cần có

- Máy trạng thái hàng đợi tải (hàm thuần): chờ Wi-Fi và đang tải chuyển qua lại, tạm dừng, huỷ, lỗi, hoàn tất.
- Dựng lại chỉ mục từ thư mục, dọn `.part`.
- Chọn nguồn phát (cục bộ hay stream).
- Tính dung lượng và giới hạn.
- Không cố test tải thật trong Vitest. Dùng `docs/ACCEPTANCE.md` mục G.

Chỉ là JS/TS thì không cần build lại `.ipa`. Thư viện mạng native hoặc thay đổi cấu hình native thì cần: hỏi trước.
