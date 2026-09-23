# Quy tắc cho AI Agent (music-app)

Dự án: app nghe nhạc cá nhân trên iPhone (Expo + React Native + TypeScript), backend Cloudflare Worker + R2, indexer chạy trên PC.
Người dùng **không code**, giao việc cho Agent. Người dùng dùng **Windows**, không có Mac, cài app bằng sideload. Thiết bị: iPhone 16, iOS 27. Workspace dùng chung tên `@music-app/shared`. Root `package.json` phải có `packageManager` và các script `typecheck`, `lint`, `test`.

## Đọc trước khi làm
1. `docs/STATUS.md`: đang ở phase nào, việc nào đã xong, việc nào đang chờ người dùng.
2. `docs/PLAN-SUMMARY.md`: tóm tắt và bản đồ tài liệu. Chỉ đọc các mục của `docs/PLAN.md` liên quan tới phase đang làm, **không cần đọc cả plan**. Làm giao diện thì đọc thêm `docs/SCREENS.md`. Không hiểu thuật ngữ thì xem `docs/GLOSSARY.md`.
3. Skill trong `.agents/skills/` khớp với việc đang làm (xem bảng bên dưới).

## Skills của dự án
| Skill | Dùng khi |
|---|---|
| `phase-workflow` | Bắt đầu/tiếp tục một phase, báo cáo kết quả, sửa lỗi |
| `rntp-audio` | Mọi việc liên quan phát nhạc, lock screen, queue, ReplayGain, shuffle, kiểm tra gapless, crossfade (thử nghiệm) |
| `ios-build-sideload` | GitHub Actions build `.ipa`, cài bằng Sideloadly, biến thể dev/production |
| `music-indexer` | CLI trên PC: dọn tag, đo loudness, sinh `library.json`, upload R2 |
| `cloudflare-music-api` | Worker: auth, `/api/library`, stream Range, covers, state |
| `mobile-conventions` | Cấu trúc thư mục, UI (NativeWind), state, Hàng đợi và Nghe gần đây, xử lý token sai, màn hình Debug, cảnh báo hết hạn chứng chỉ |
| `lyrics-pipeline` | Phase 4: lời bài hát (LRCLIB, Python căn thời gian/nhận dạng), thêm/sửa lời ngay trong app, tô dần từng chữ, `/lyrics/:id`. Chỉ làm khi Phase 3 đạt và người dùng đồng ý |
| `local-dashboard` | Phase 4: dashboard web chạy local, `overrides.json`, bảo mật server local. Chỉ làm khi Phase 3 đạt và người dùng đồng ý |
| `offline-downloads` | Phase 4: nghe offline, tải về máy, chỉ tải qua Wi-Fi, quản lý dung lượng. Chỉ làm khi MVP đạt và người dùng đồng ý |

Nếu công cụ của bạn không tự nạp skill, hãy mở file `.agents/skills/<tên>/SKILL.md` tương ứng và làm theo.

## Phạm vi (đóng băng)
- Chỉ làm việc có trong `docs/STATUS.md` và `docs/PLAN.md`. **Không tự thêm tính năng.**
- Ý tưởng mới: ghi vào `docs/IDEAS.md` (mục "Danh sách chờ") và báo người dùng. **Không đề xuất lại** các mục "Đã loại".
- Giao diện (màn hình, tab, bố cục) theo `docs/SCREENS.md`. Không tự bịa màn hình.
- Test dùng dữ liệu mẫu trong `@music-app/shared/testing` và `fixtures/`, không dùng dữ liệu thật của người dùng.

## Ngôn ngữ
- Trả lời người dùng bằng **tiếng Việt**, ngắn gọn, đi thẳng vào vấn đề. Người dùng không code nên tránh thuật ngữ khi không cần, và hướng dẫn thao tác thủ công theo từng bước đánh số.
- Tên hàm, biến, class, keyword giữ **tiếng Anh**. Chuỗi hiển thị trong app bằng tiếng Việt.
- Thêm comment ngắn bằng tiếng Việt cho logic phức tạp.

## Code
- **TypeScript strict**, không dùng `any`. Định nghĩa type/interface cho props, state, API response.
- Schema Zod đặt ở `packages/shared`, dùng chung cho app, API, indexer. Không định nghĩa lại type ở nơi khác.
- **Mã dùng chung:** hàm thuần được từ hai nơi trở lên dùng (chuẩn hóa văn bản, kiểm tra id, đọc file lời `.lrc`, tìm kiếm, hằng số) đặt trong `packages/shared`, **không sao chép**. Gói này chỉ chứa TypeScript thuần: không React, không React Native, không API của Node hay trình duyệt, vì phải chạy được trên app (Hermes), Worker, Node và trình duyệt. Chi tiết ở `docs/PLAN.md` mục 8.1.
- Frontend: **NativeWind (Tailwind)**, mobile-first, Atomic Design. Tuân thủ SOLID, DRY, Clean Code.
- API luôn trả `{ status, message, data, error }` (trừ endpoint binary). Validate đầu vào bằng **Zod**.
- **Không hard-code secret.** Dùng `.env` (không commit). Token người dùng nhập trong app và lưu bằng `expo-secure-store`.
- Tránh N+1 query, cache bằng TanStack Query, lazy load phía client.
- Script và lệnh phải chạy được trên **Windows** (dùng Node, tránh cú pháp chỉ có trong bash).

## Ràng buộc về build (quan trọng)
- Mỗi lần build `.ipa` tốn phút macOS trên GitHub Actions và người dùng phải cài lại bằng tay.
- **Không thêm thư viện native, không đổi plugin/`infoPlist` trong `app.config.ts`, không nâng cấp Expo/React Native nếu chưa hỏi người dùng.**
- Trước khi thêm bất kỳ dependency nào có mã native: chạy `npx expo-doctor`, kiểm tra tương thích **New Architecture**, rồi báo người dùng "cần build lại".
- Thay đổi chỉ trong JS/TS thì **không cần** build lại.
- **Không đổi phiên bản Xcode, nhãn runner, Expo SDK, React Native** khi chưa hỏi. Dự án ghim Xcode 26.x và Expo SDK 57 ổn định vì iOS 27 (xem `docs/PLAN.md` mục 12.7).

## Vùng cấm (không làm nếu chưa được người dùng xác nhận rõ ràng)
- Không ghi, sửa, xoá, di chuyển file trong `MUSIC_SOURCE_DIR` (chỉ đọc). Việc dọn tag bằng `beets` do người dùng tự chạy. **Ngoại lệ duy nhất:** tính năng Nhập nhạc của dashboard (Phase 4) chỉ được **thêm file mới** vào `MUSIC_IMPORT_DIR`, không ghi đè, không xoá, không sửa file có sẵn, và chỉ sau khi người dùng bấm xác nhận. Khi kiểm thử luôn dùng `fixtures/`, không dùng thư mục nhạc thật.
- Không xoá object trên R2 (`music/`, `covers/`, `lyrics/`, `_meta/`) khi chưa hiển thị danh sách cụ thể và được người dùng đồng ý.
- Không `git push --force`, không viết lại lịch sử, không xoá nhánh chính.
- Không commit `.env`, `.dev.vars`, token, khoá R2, file `.ipa`. Ở Phase 0 hãy thiết lập hook pre-commit quét secret (ví dụ gitleaks) và hướng dẫn người dùng cài.
- Không đổi bucket, tài khoản, domain, gói thanh toán, và không deploy production ngoài phạm vi phase đang làm.
- Không chạy lệnh xoá hàng loạt (`rm -rf`...) ngoài thư mục build hoặc thư mục tạm của dự án.
- Không gửi dữ liệu (lời, nhạc, log chứa token) tới dịch vụ bên ngoài không có trong plan.
- Không nâng cấp Expo SDK, React Native, Xcode khi chưa hỏi.
- Nếu một việc cần vượt các giới hạn trên: **dừng và hỏi**.

## Kiểm tra trước khi báo xong
Chạy và báo kết quả: `pnpm typecheck && pnpm lint && pnpm test`.
Với API: `pnpm --filter api dev` (wrangler) rồi kiểm tra bằng `curl.exe`.
Indexer: test bằng file mẫu trong `fixtures/music/` (người dùng tự chép vào, không commit), **không đọc thư mục nhạc thật nằm ngoài workspace**.
Bạn **không thử được trên iPhone thật**, nên hãy chỉ ra mục nào trong `docs/ACCEPTANCE.md` người dùng cần thử.

## Khi sửa lỗi
Nêu **nguyên nhân gốc (root cause)** trước, rồi mới sửa. Không sửa mò. Nếu thiếu log, hãy yêu cầu người dùng lấy log từ màn hình Debug trong app.

## Mẫu báo cáo khi xong việc
1. Danh sách file đã tạo/sửa.
2. Lệnh đã chạy và kết quả.
3. Việc người dùng phải làm thủ công (nếu có), theo từng bước.
4. Cần build lại `.ipa`: **CÓ / KHÔNG** (và vì sao).
5. Mục nào trong `docs/ACCEPTANCE.md` cần thử trên iPhone.
6. Đã cập nhật `docs/STATUS.md`.
