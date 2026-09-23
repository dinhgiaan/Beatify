# Xử lý lỗi thường gặp (dành cho bạn)

Cách dùng: tìm dòng khớp triệu chứng, thử cách xử lý theo thứ tự. Không xử lý được thì dán log từ Settings → Debug → Copy (hoặc log của bước bị đỏ trên GitHub) cho Agent.

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| App văng ngay khi mở, hoặc mở ra màn hình trắng/đen | Chưa bật Developer Mode, chưa "Tin cậy" Apple ID, chứng chỉ đã hết hạn, hoặc lỗi tương thích iOS 27 với bản build | Làm lại các bước cài trong `docs/RUNBOOK.md` mục 2 và 3. Vẫn lỗi thì báo Agent (kèm việc bạn đã làm) |
| Báo không thể xác minh, hoặc không mở được sau khoảng 7 ngày | Chứng chỉ Apple ID miễn phí hết hạn | Cài lại `.ipa` bằng Sideloadly (cùng bundle ID), xem `docs/RUNBOOK.md` mục 2 |
| Sideloadly báo lỗi khi cài | Sideloadly hoặc iTunes/iCloud cũ, dùng bản Microsoft Store, hoặc đã đạt giới hạn App ID của Apple ID miễn phí | Cập nhật Sideloadly, dùng iTunes và iCloud bản tải từ trang Apple, thử lại. Vẫn lỗi thì thử AltStore hoặc Apple ID khác |
| `pnpm` không nhận lệnh | Chưa cài Node hoặc pnpm | Gõ `node -v` (phải từ 22.13), rồi `npm install -g pnpm@12.5.1` |
| CI trên GitHub báo đỏ | Lỗi mã, lỗi cài công cụ, hoặc lỗi cấu hình | Mở bước bị đỏ, copy log cho Agent |
| Build iOS báo đỏ | Lỗi thư viện native, sai phiên bản Xcode, hoặc hết phút macOS | Copy log cho Agent. Kiểm tra GitHub → Settings → Billing and plans → Usage xem còn phút không |
| Hết phút GitHub Actions | Repo private chỉ có khoảng 200 phút macOS mỗi tháng | Chờ sang tháng, hoặc chỉ build khi thật sự cần (Agent báo "cần build lại: CÓ") |
| `git push` bị từ chối | Nhánh khác nhau hoặc thiếu quyền | **Không dùng `--force`**. Hỏi lại Agent |
| Không kết nối được (màn hình Kết nối báo lỗi) | Sai địa chỉ Worker, sai token, Worker chưa triển khai, hoặc mất mạng | Kiểm tra địa chỉ và token. Mở `<địa chỉ Worker>/api/health` cùng token để thử. Token đã đổi thì nhập lại |
| Nhạc phát được nhưng không tua được | Worker không trả đúng phần dữ liệu khi tua (Range) | Báo Agent, đây là lỗi cần sửa ở Worker |
| Tắt màn hình thì nhạc dừng | Thiếu cấu hình phát nền, hoặc lỗi phiên âm thanh | Báo Agent. Kiểm tra bản build có đúng cấu hình phát nền |
| Lock screen không hiện tên bài, ảnh bìa hoặc nút | Thiếu thông tin bài, hoặc ảnh bìa không tải được | Báo Agent kèm bài cụ thể và log |
| Thư viện trống hoặc thiếu bài mới | Chưa chạy `pnpm indexer sync`, chưa kéo làm mới trong app, hoặc `library.json` chưa cập nhật | Chạy `sync`, rồi kéo xuống ở màn hình Thư viện để làm mới |
| Đổi ảnh bìa nhưng app vẫn hiện ảnh cũ | Cache ảnh | Chạy `sync`, kéo làm mới. Nếu vẫn cũ thì báo Agent (kiểm tra `coverVersion`) |
| Lời bài hát lệch so với giọng hát | Mốc thời gian của file lời không khớp bản nhạc của bạn | Dùng nút chỉnh lệch (±0,5 giây) trong app, hoặc sửa lời |
| Lời tiếng Việt bị lỗi dấu | File `.lrc` dùng bảng mã cũ | Lưu lại file ở dạng UTF-8 rồi chạy `sync`. Indexer không đoán bảng mã |
| Dung lượng hoặc chi phí Cloudflare tăng bất thường | Nhiều nhạc hơn dự kiến, hoặc token/link stream bị lộ | Xem mức dùng trong Cloudflare, đổi token (`docs/RUNBOOK.md` mục 4), báo Agent |
| Bản build mới hỏng, muốn quay lại | Lỗi của bản mới | Làm theo `docs/RUNBOOK.md` mục 10 (dùng `.ipa` trong `builds/known-good/`) |
