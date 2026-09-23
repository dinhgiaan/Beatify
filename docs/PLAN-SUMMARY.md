# Tóm tắt kế hoạch (đọc file này trước, không cần đọc cả PLAN.md)

App nghe nhạc **cá nhân** trên iPhone 16 (iOS 27). Nhạc nằm trên cloud (Cloudflare R2), app stream về. Tắt màn hình vẫn phát, lock screen như Spotify. Không qua App Store, không có Mac, cài bằng sideload. Toàn bộ mã là TypeScript do Agent viết.

## Kiến trúc

```
iPhone (Expo + RNTP) ──token──► Cloudflare Worker (Hono + Zod) ──► R2 (nhạc, ảnh bìa, JSON)
                                                                     ▲
PC: Indexer CLI (beets, ffmpeg, music-metadata) ─── upload ──────────┘
PC: Dashboard local (127.0.0.1, dùng chung mã với indexer)
```

Monorepo pnpm: `apps/mobile`, `apps/api`, `tools/indexer`, `tools/dashboard`, `packages/shared` (mã dùng chung, TypeScript thuần).

## Các phase

| Phase | Nội dung | Ghi chú |
|---|---|---|
| 0 | Nền tảng, CI, build `.ipa`, **spike player** trên iPhone thật | Kiểm chứng các giả định trước khi làm tiếp |
| 1 | Indexer, Worker, `library.json`, ReplayGain | Nhạc lên R2, API chạy |
| 2 | App MVP: kết nối, thư viện, phát nhạc, lock screen, hàng đợi, shuffle | **Hết Phase 2 là có bản dùng được (MVP)** |
| 3 | Tìm kiếm, album, nghệ sĩ, playlist, yêu thích, nghe gần đây | Làm sau khi đã dùng MVP vài tuần |
| 4 | Lời bài hát, dashboard, offline, sao lưu, crossfade thử nghiệm | Tuỳ chọn, từng mục có điều kiện bắt đầu riêng |

**Đóng băng phạm vi:** không thêm tính năng mới cho tới khi dùng MVP ít nhất hai tuần. Ý tưởng mới ghi vào `docs/IDEAS.md`.

## Quyết định then chốt

- Audio: `@rntp/player` v5 (dự phòng `expo-audio`). Expo SDK 57 ổn định, Xcode 26.x ghim (vì iOS 27). Chưa dùng SDK 58 beta.
- Token nhập trong app (SecureStore), Worker kiểm tra. Stream và ảnh bìa dùng token trong query, thao tác ghi chỉ nhận token trong header.
- Bucket R2 riêng tư. Vượt free thì giảm dung lượng hoặc trả phí, không dùng nhiều tài khoản.
- `id` bài hát ổn định (băm nội dung). Playlist tham chiếu `id`. `normalizeText` có test "golden" vì `albumId` tính từ nó.
- Mã dùng từ hai nơi trở lên nằm ở `packages/shared`, chỉ TypeScript thuần.
- Chỉnh sửa metadata lưu ở `overrides.json`, không sửa file nhạc. Lời do người dùng sửa lưu ở `lyrics-manual/`, indexer không ghi vào.
- Agent không ghi vào thư mục nhạc (ngoại lệ duy nhất: trang Nhập nhạc của dashboard, chỉ thêm file mới).
- Mỗi lần build macOS tốn phút (repo private khoảng 200 phút macOS mỗi tháng), nên chỉ build khi cần và dùng dev client cho thay đổi JS/TS.

## Ngoài phạm vi

Xem `docs/IDEAS.md` mục "Đã loại". Đừng đề xuất lại.

## Bản đồ tài liệu: cần gì thì xem đâu

| Cần | Xem |
|---|---|
| Đang ở đâu, việc gì kế tiếp | `docs/STATUS.md` |
| Schema, API | `PLAN.md` mục 7 |
| Mã dùng chung, cấu trúc thư mục | `PLAN.md` mục 8 |
| Chuẩn hóa nhạc, ReplayGain | `PLAN.md` mục 9, skill `music-indexer` |
| Bảo mật, token | `PLAN.md` mục 10, skill `cloudflare-music-api` |
| Build `.ipa`, cài sideload, iOS 27 | `PLAN.md` mục 12, skill `ios-build-sideload` |
| Phát nhạc, shuffle, gapless, crossfade | `PLAN.md` mục 13.3, skill `rntp-audio` |
| Lời bài hát (thêm, sửa, tô dần) | `PLAN.md` mục 13.2, skill `lyrics-pipeline` |
| Dashboard (nhập nhạc, sức khoẻ thư viện, ảnh bìa...) | `PLAN.md` mục 13.1, skill `local-dashboard` |
| Nghe offline | `PLAN.md` mục 13.4, skill `offline-downloads` |
| Giao diện, màn hình, điều hướng | `docs/SCREENS.md`, skill `mobile-conventions` |
| Thử trên iPhone | `docs/ACCEPTANCE.md` |
| Việc lặp lại của người dùng | `docs/RUNBOOK.md` |
| Lỗi thường gặp | `docs/TROUBLESHOOTING.md` |
| Thuật ngữ | `docs/GLOSSARY.md` |
| Lịch sử thay đổi plan | `docs/CHANGELOG.md` |
