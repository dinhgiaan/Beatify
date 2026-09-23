---
name: phase-workflow
description: Quy trình làm việc theo phase cho dự án music-app. Dùng skill này mỗi khi bắt đầu, tiếp tục hoặc kết thúc một phase, khi người dùng nói "làm phase", "tiếp tục", "làm tiếp", "xong chưa", "sửa lỗi", "bị lỗi", "không chạy", hoặc khi cần báo cáo kết quả công việc. Dùng cả khi người dùng chỉ dán log lỗi hoặc mô tả triệu chứng trên iPhone mà không nói rõ yêu cầu.
---

# Quy trình theo phase

Người dùng không code và không thể chạy hộ bạn trên iPhone, nên mỗi lượt làm việc phải để lại trạng thái rõ ràng: cái gì xong, cái gì cần người dùng làm, có phải build lại không.

## 1. Bắt đầu một phase

1. Đọc `docs/STATUS.md` (phase hiện tại, việc còn dở), rồi `docs/PLAN-SUMMARY.md`, rồi **chỉ các mục của `docs/PLAN.md` liên quan tới phase đang làm** (dùng bảng "Bản đồ tài liệu" trong summary). Không đọc cả plan nếu không cần.
2. Chỉ làm **đúng phase được giao**. Thấy việc của phase sau thì ghi vào STATUS, không làm trước.
3. Nếu thiếu thông tin chỉ người dùng biết (tên bucket, domain, repo public hay private...), hỏi **một lần, gộp tất cả câu hỏi**, trước khi code.
4. Chia phase thành các bước nhỏ, mỗi bước là một module hoàn chỉnh chạy được. Làm xong bước nào kiểm tra bước đó.
5. Ý tưởng hoặc tính năng không có trong STATUS/PLAN: ghi vào `docs/IDEAS.md` ("Danh sách chờ") và báo người dùng, **không tự làm**. Không đề xuất lại các mục "Đã loại".

## 2. Trong khi làm

- Dùng skill chuyên biệt khớp với việc: `rntp-audio`, `ios-build-sideload`, `music-indexer`, `cloudflare-music-api`, `mobile-conventions`.
- Thư mục và kiến trúc theo `docs/PLAN.md` mục 8. Muốn đổi cấu trúc thì nói với người dùng trước.
- Schema chỉ định nghĩa ở `packages/shared`.

## 3. Việc chỉ người dùng làm được

Các việc như tạo tài khoản Cloudflare, tạo bucket, tạo API token, `wrangler secret put`, chạy workflow build, cài bằng Sideloadly, thử trên iPhone: **viết hướng dẫn từng bước đánh số**, mỗi bước là một thao tác cụ thể (bấm vào đâu, gõ lệnh gì, kết quả mong đợi). Ghi các bước này vào mục "Việc đang chờ người dùng" trong `docs/STATUS.md` và trong báo cáo.

## 4. Có cần build lại `.ipa` không

Trả lời **CÓ** khi thay đổi thuộc một trong các loại sau, còn lại là **KHÔNG**:
- Thêm/bớt/nâng cấp thư viện có mã native (kể cả plugin Expo).
- Sửa `app.config.ts` ở phần `plugins`, `infoPlist`, `bundleIdentifier`, icon, splash.
- Nâng cấp Expo SDK hoặc React Native.
- Đổi phiên bản Xcode hoặc nhãn runner trong workflow (và phải hỏi người dùng trước).
- Sửa mã trong thư mục `ios/` (thường không nên có vì dùng `expo prebuild`).

Thay đổi chỉ ở JS/TS thì người dùng thấy ngay bằng `npx expo start --dev-client` với app **Beatify Dev**, không cần build lại.

## 5. Kiểm tra trước khi báo xong

- Chạy `pnpm typecheck && pnpm lint && pnpm test`, sửa đến khi qua.
- Viết test cho logic thuần (chuẩn hóa văn bản, `gainToVolume`, parse Range, tính id, gom album...). Không cố test phần cần thiết bị thật.
- Với API: chạy `wrangler dev` và kiểm tra bằng `curl.exe`.
- Chỉ ra mục nào trong `docs/ACCEPTANCE.md` cần người dùng thử.

## 6. Sửa lỗi

Thứ tự bắt buộc:
1. **Thu thập bằng chứng:** log từ màn hình Debug, log GitHub Actions, ảnh chụp, các bước tái hiện. Thiếu thì hỏi người dùng lấy, nói rõ lấy ở đâu.
2. **Tìm nguyên nhân gốc (root cause)** và nói rõ với người dùng nguyên nhân là gì, dựa trên bằng chứng nào. Nếu chưa chắc, nói chưa chắc và đề xuất cách xác minh.
3. **Sửa đúng nguyên nhân**, không vá triệu chứng.
4. Thêm test hoặc mục kiểm tra để lỗi không quay lại.
5. Báo có cần build lại không.

## 7. Kết thúc lượt làm việc

Cập nhật `docs/STATUS.md` (tick việc đã xong, ghi việc chờ người dùng, ghi vấn đề đã biết), rồi báo cáo theo mẫu trong `AGENTS.md`:
1. File đã tạo/sửa. 2. Lệnh đã chạy và kết quả. 3. Việc người dùng phải làm. 4. Cần build lại: CÓ/KHÔNG. 5. Mục ACCEPTANCE cần thử. 6. Đã cập nhật STATUS.

Báo cáo ngắn gọn, không kể lại toàn bộ quá trình.
