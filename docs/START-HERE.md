# Bắt đầu ở đây (chỉ dùng Antigravity)

Toàn bộ dự án làm bằng **Antigravity**: nó thấy cả thư mục dự án, chạy lệnh (có bước bạn duyệt) và tự đọc lại repo mỗi phiên. Không cần chuyển file qua lại giữa các công cụ.

## Cài đặt (một lần)
1. Tạo thư mục repo trên PC, giải nén **`music-app-repo-start.zip` vào đó, đúng một lần**. Gói này đã gộp sẵn bộ kit và kết quả Phase 0 bước 1 (monorepo, schema dùng chung, CI, workflow build), đã kiểm tra chạy được.
2. Mở thư mục đó làm **workspace** trong Antigravity.
3. Antigravity đọc `AGENTS.md` ở gốc và skill ở `.agents/skills/` theo các nguồn mình thấy. Vị trí và tên cấu hình có thể khác giữa bản IDE và CLI, và thay đổi theo phiên bản. Nếu nó không nhận, bảo nó đọc `AGENTS.md` và mở file `SKILL.md` tương ứng, vì `AGENTS.md` đã có bảng chỉ đường.
4. Cài đặt an toàn nên bật:
   - Giữ **tắt** quyền để Agent đọc hoặc sửa file ngoài workspace.
   - Giữ bước **duyệt lệnh terminal**. Đừng bật chế độ tự chạy mọi lệnh (Turbo) cho việc xoá file, đẩy code hoặc triển khai.
   - Tên tuỳ chọn có thể khác theo phiên bản, nếu không thấy thì chọn mức thận trọng nhất.
5. Nhạc mẫu: chép 5-10 bài vào `fixtures/music/` theo `fixtures/README.md` (không bị commit). Thư mục nhạc thật nằm ngoài workspace nên Agent không thấy.

## Mỗi phiên làm việc
1. Nói ngắn gọn việc cần làm. Lần đầu: "làm tiếp theo `docs/STATUS.md`". Sau đó: "làm tiếp", hoặc "sửa lỗi này" kèm log từ màn hình Debug.
2. **Mỗi phiên một mục nhỏ** trong `docs/STATUS.md`, đừng giao cả phase một lượt.
3. Duyệt các lệnh Agent xin chạy. Từ chối lệnh nào nằm trong "vùng cấm" của `AGENTS.md`.
4. Cuối phiên, Agent cập nhật `docs/STATUS.md`. Bạn xem lại thay đổi rồi commit.
5. Nếu Agent báo "cần build lại `.ipa`: CÓ", làm theo mục 3 của `docs/RUNBOOK.md`.

## Việc Agent làm được và việc chỉ bạn làm được

| Agent làm (bạn duyệt lệnh) | Chỉ bạn làm |
|---|---|
| Viết code, chạy `typecheck`, `lint`, `test`, `git commit` | Tạo tài khoản và repo GitHub, đăng ký R2 (thẻ VISA), tạo API token |
| Đẩy code lên GitHub, tạo file cấu hình | Bấm chạy workflow **Build iOS**, tải file `.ipa` |
| Viết hướng dẫn từng bước cho các việc trên | Cài app bằng Sideloadly, gia hạn 7 ngày |
| | Thử trên iPhone theo `docs/ACCEPTANCE.md` |

## Lưu ý
- `docs/STATUS.md` là file "sống", Agent tự cập nhật. Nếu sau này bạn nhận được bản kit mới, **đừng ghi đè** file này.
- Gặp thuật ngữ lạ thì xem `docs/GLOSSARY.md`. Gặp lỗi thì xem `docs/TROUBLESHOOTING.md` trước khi hỏi Agent.
- **Đóng băng phạm vi:** đừng thêm tính năng mới cho tới khi bạn dùng MVP (Phase 0 đến 2) ít nhất hai tuần. Ý tưởng mới thì nói với Agent để ghi vào `docs/IDEAS.md`.
- Gói `music-app-claude-web-pack.zip` và `music-app-agent-kit.zip` cũ không còn cần dùng.
