# Từ điển thuật ngữ (dành cho bạn)

| Thuật ngữ | Nghĩa đơn giản |
|---|---|
| **Agent** | Trợ lý AI viết code cho bạn (Antigravity) |
| **Repo** | Kho chứa toàn bộ mã và tài liệu của dự án, nằm trên GitHub |
| **Commit / push** | Lưu một mốc thay đổi / đẩy các mốc đó lên GitHub |
| **Monorepo** | Một repo chứa nhiều phần (app, API, công cụ) trong các thư mục riêng |
| **Node, pnpm** | Công cụ chạy và quản lý thư viện cho mã JavaScript/TypeScript trên PC |
| **TypeScript** | Ngôn ngữ lập trình của dự án |
| **Expo / React Native** | Bộ công cụ làm app iPhone bằng TypeScript |
| **Dev client** | Bản app đặc biệt cho phép thấy thay đổi code ngay, không cần build lại |
| **`.ipa`** | File cài đặt app iPhone |
| **Sideload** | Cài app không qua App Store, bằng Sideloadly hoặc AltStore |
| **Chứng chỉ 7 ngày** | Apple ID miễn phí chỉ ký app được 7 ngày, hết hạn thì phải ký lại |
| **Developer Mode** | Chế độ trên iPhone cần bật để chạy app sideload |
| **Bundle ID** | Mã định danh duy nhất của app, dạng `com.tên.musicapp` |
| **GitHub Actions / CI** | Máy chủ của GitHub tự chạy kiểm tra và build khi bạn đẩy code |
| **Runner** | Máy ảo mà GitHub Actions dùng để chạy (macOS dùng để build app iPhone) |
| **Artifact** | File kết quả của một lần chạy (ví dụ file `.ipa`), GitHub chỉ giữ 14 ngày |
| **Cloudflare Worker** | Chương trình nhỏ chạy trên Cloudflare, làm API cho app |
| **R2 / bucket** | Nơi lưu file (nhạc, ảnh bìa) trên Cloudflare. Bucket là một "thùng" chứa file |
| **Token** | Chuỗi bí mật để app chứng minh với API rằng nó được phép |
| **`.env`, secret** | File và giá trị bí mật (khoá, token). Không bao giờ đưa lên GitHub |
| **API / endpoint** | Cách app nói chuyện với server. Endpoint là một địa chỉ cụ thể, ví dụ `/api/health` |
| **Range request** | Cho phép tua bài mà không tải lại từ đầu |
| **Schema (Zod)** | Bản mô tả dạng dữ liệu hợp lệ, dùng để kiểm tra dữ liệu |
| **Indexer** | Công cụ trên PC đọc thư mục nhạc, đo âm lượng và đưa lên R2 |
| **`library.json`** | Danh sách toàn bộ bài hát và album mà app đọc |
| **Dashboard** | Trang web quản lý chạy trên PC của bạn (chỉ mở được ở máy đó) |
| **Overrides** | Các chỉnh sửa thông tin bài của bạn, lưu riêng, không sửa file nhạc gốc |
| **ReplayGain / LUFS** | Đo độ ồn để các bài phát cùng mức âm lượng |
| **Gapless / crossfade** | Chuyển bài liền mạch không có khoảng lặng / chồng nhỏ dần và lớn dần giữa hai bài |
| **LRC** | Định dạng file lời có mốc thời gian cho từng dòng |
| **MVP** | Bản dùng được đầu tiên, gồm phần cốt lõi (Phase 0 đến 2) |
| **Spike** | Bản thử nhỏ để kiểm tra một việc có làm được không trước khi đầu tư |
| **Phase** | Từng giai đoạn của kế hoạch |
| **`STATUS.md`** | Bảng tiến độ, Agent tự cập nhật |
| **`ACCEPTANCE.md`** | Danh sách việc bạn thử trên iPhone để xác nhận tính năng chạy đúng |
| **`RUNBOOK.md`** | Sổ tay các việc lặp lại của bạn |
