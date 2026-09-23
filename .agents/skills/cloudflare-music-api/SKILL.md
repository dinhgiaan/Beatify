---
name: cloudflare-music-api
description: Xây dựng và kiểm thử Cloudflare Worker (Hono + Zod + R2) cho app music-app gồm xác thực token, /api/library, stream audio hỗ trợ HTTP Range (tua bài), /covers, /api/state đồng bộ playlist, wrangler secrets và kiểm tra bằng curl. Dùng skill này mỗi khi làm việc trong apps/api, wrangler.toml, R2 binding, Range/206/416, ETag, lỗi 401/403/404 khi stream, "không tua được", "nhạc không phát từ server", hoặc khi thêm endpoint mới.
---

# Worker API (apps/api)

Kiến trúc lớp: **routes (controller) → services (logic) → repositories (truy cập R2)**. Framework Hono, validate bằng Zod, schema dùng chung từ `packages/shared`. Interface `StorageRepository` bọc R2 để sau này đổi hoặc thêm nơi lưu (xem `docs/PLAN.md` mục 5.3).

## Endpoint

| Method | Path | Xác thực | Trả về |
|---|---|---|---|
| GET | `/api/library` | Header `Authorization: Bearer <token>` | JSON `{ status, message, data: Library, error }`, có `ETag` |
| GET | `/api/health` | Header `Authorization: Bearer <token>` | JSON `{ status, message, data: Health, error }`. Nhẹ: dùng `head()` của R2 lấy metadata của `library.json` (`trackCount`, `albumCount`, `generatedAt`, `dataVersion`), không đọc cả file |
| GET, HEAD | `/stream/:id` | Query `?t=<token>` | Binary audio, hỗ trợ Range |
| GET | `/covers/:albumId` | Query `?t=<token>` | Ảnh JPEG |
| GET, HEAD | `/lyrics/:id` (Phase 4) | Query `?t=<token>` | `text/plain; charset=utf-8`. Ưu tiên bản `lyrics-manual/`, không có thì bản `lyrics/`. Header `X-Lyrics-Source`, `X-Lyrics-Format`. 404 nếu không có |
| GET | `/waveforms/:id` (Phase 1, tuỳ chọn) | Query `?t=<token>` | JSON đỉnh sóng, `Cache-Control` dài (dữ liệu không đổi trừ khi bài đổi). 404 nếu chưa có, app coi là bình thường |
| PUT | `/lyrics/:id` (Phase 4) | **Header** Bearer | Lưu `{ format, content }` vào `lyrics-manual/`. Tối đa 64 KB |
| DELETE | `/lyrics/:id` (Phase 4) | **Header** Bearer | Xoá bản manual |
| GET | `/api/lyrics/manual` (Phase 4) | Bearer | `{ ids: string[] }` các bài có bản manual |
| GET | `/api/state` (Phase 4) | Bearer | `UserState` |
| PUT | `/api/state` (Phase 4) | Bearer | Lưu `UserState` sau khi Zod validate |

- Response JSON luôn `{ status, message, data, error }`, kể cả lỗi (vd `{ status: 401, message: 'Unauthorized', data: null, error: 'INVALID_TOKEN' }`). Endpoint binary trả lỗi theo cùng định dạng JSON khi thất bại.
- `/stream` và `/covers` dùng token dạng query vì lock screen iOS không luôn gửi được header tuỳ chỉnh. `/api/*` dùng header.

## Mã lỗi

Mọi phản hồi lỗi có `error` là một `ErrorCode` từ `@music-app/shared`, không tự đặt chuỗi. Ánh xạ: 401 `INVALID_TOKEN`, 404 `NOT_FOUND`, 400 `INVALID_ID` hoặc `VALIDATION_ERROR`, 413 `PAYLOAD_TOO_LARGE`, 416 `RANGE_NOT_SATISFIABLE`, 409 `CONFLICT`, 500 `INTERNAL_ERROR`. App dựa vào mã này để chọn thông báo tiếng Việt và để chuyển sang luồng nhập lại token khi gặp `INVALID_TOKEN`. Thêm mã mới phải thêm ở `@music-app/shared` và cập nhật bảng thông báo của app.

## Chống lạm dụng

- **Bucket R2 riêng tư:** chỉ Worker truy cập qua binding. Không bật `r2.dev`, không gắn tên miền công khai. Kiểm tra bằng cách thử mở trực tiếp một file (ACCEPTANCE P1.7).
- **Giới hạn tần suất:** đặt luật ở Cloudflare cho `/stream` và `/covers` (theo IP). Chưa kiểm chứng gói free cho bao nhiêu luật: đọc tài liệu Cloudflare, nếu không đủ thì ghi vào STATUS và chỉ dựa vào cảnh báo chi phí. Không tự viết bộ đếm trong Worker bằng KV vì mỗi lần đếm là một lần ghi, dễ vượt hạn mức ghi (cần kiểm tra).
- **Nâng cấp sau khi người dùng yêu cầu:** URL ký có hạn (app xin token ngắn hạn qua `POST /api/session`, `/stream` chỉ nhận token đó). Việc này đổi hợp đồng API và app, nên không làm sớm.
- Cảnh báo chi phí ở Cloudflare (`docs/RUNBOOK.md` mục 7).

## Bảo mật

- Token lưu bằng `wrangler secret put API_TOKEN`. Khi chạy local dùng `apps/api/.dev.vars` (không commit).
- **Thao tác ghi (`PUT`, `DELETE`) chỉ nhận token qua header `Authorization`, không bao giờ qua query**, vì URL có query dễ bị ghi lại. Validate body bằng Zod, chuẩn hóa NFC, giới hạn 64 KB.
- So sánh token bằng hàm **thời gian hằng số** (constant-time), không dùng `===` trực tiếp.
- **Không log URL đầy đủ hoặc query** vì chứa token. Log đường dẫn không kèm query.
- Chỉ phục vụ key thuộc tiền tố `music/`, `covers/` và (Phase 4) `lyrics/`, `lyrics-manual/`. Từ chối mọi thứ khác, đặc biệt `_meta/` và `library.json` thô, bằng cách dựng key từ `id` sau khi validate định dạng `id` (chỉ ký tự hex, độ dài cố định), không nối chuỗi từ input của người dùng.
- Thiếu hoặc sai token: 401. Không phân biệt "thiếu" và "sai" trong thông báo.

## Stream với Range (phần dễ sai nhất)

Tua bài và lock screen trên iOS phụ thuộc vào Range đúng chuẩn.

- Luôn trả `Accept-Ranges: bytes`, `Content-Type` đúng theo đuôi file, `ETag`, `Content-Length`.
- Không có header `Range`: trả **200** với toàn bộ file.
- Có `Range: bytes=start-end`, `bytes=start-`, hoặc `bytes=-suffix`: trả **206** với `Content-Range: bytes start-end/total` và `Content-Length` bằng độ dài đoạn.
- Range không hợp lệ hoặc vượt kích thước: **416** với `Content-Range: bytes */total`.
- HEAD phải trả cùng header như GET nhưng không có body.
- R2 binding hỗ trợ đọc theo khoảng (tuỳ chọn `range` khi `get`, có thể nhận offset/length hoặc trực tiếp header Range). Đối chiếu tài liệu R2 Workers API hiện hành trước khi viết, và viết hàm parse Range thành hàm thuần có test.
- Không tải toàn bộ file vào bộ nhớ Worker, phải chuyển tiếp `ReadableStream`.

## `/api/library`

- Đọc `library.json` từ R2, parse bằng `LibrarySchema`, trả trong `data`.
- Hỗ trợ `ETag` và `If-None-Match` (trả 304 khi không đổi) để app làm mới thư viện gần như không tốn băng thông.
- Có thể cache ngắn bằng Cache API của Worker. Không cache thứ gì chứa token ở tầng dùng chung.

## Ảnh bìa

`GET /covers/:albumId?v=<coverVersion>&t=<token>`. Khi có `v`: `Cache-Control: private, max-age=31536000, immutable`. Dùng `private` vì token nằm trong query, tránh bộ nhớ đệm dùng chung trả ảnh mà không kiểm tra token. Không có `v` thì cache ngắn kèm `ETag`. Ảnh đổi thì `coverVersion` đổi nên URL đổi, cache cũ không bị dính.

## `/api/state`
## `/api/state` (Phase 4)

- Body validate bằng `UserStateSchema`. Chiến lược **last-write-wins theo `updatedAt`**: nếu `updatedAt` của bản gửi cũ hơn bản đang lưu, trả 409 kèm bản hiện tại để app hợp nhất.
- Lưu tại `state.json` trong R2. Giới hạn kích thước body (ví dụ 1 MB).

## Mã dùng chung

Worker import từ `@music-app/shared`: `isValidTrackId` và `isValidAlbumId` (kiểm tra `id` trước khi dựng key), `LYRICS_MAX_BYTES` và `utf8ByteLength` (giới hạn 64 KB giống app), `detectLyricsFormat` và `parseLrc` (kiểm tra nội dung lời khi lưu), các schema Zod. **Không định nghĩa lại** các hàm và hằng số này trong Worker. Vì `packages/shared` chỉ có TypeScript thuần nên bundle được bằng wrangler.


## Cấu hình

- `wrangler.toml`: khai báo R2 binding (ví dụ `MUSIC_BUCKET`), tên Worker, `compatibility_date`. Kiểu môi trường (`Env`) khai báo bằng TypeScript.
- Không đặt secret trong `wrangler.toml`.
- Triển khai: `wrangler deploy`. Người dùng cần đăng nhập `wrangler login` (viết hướng dẫn từng bước).
- Free plan của Workers có giới hạn request mỗi ngày, hiện dư cho dùng cá nhân. Nhắc người dùng kiểm tra trang giá Cloudflare trước khi dựa vào con số cụ thể.

## Kiểm tra bằng curl (Windows dùng `curl.exe`)

```bash
# Không token: kỳ vọng 401
curl.exe -i http://localhost:8787/api/library

# Có token: kỳ vọng 200 và JSON đúng schema
curl.exe -i -H "Authorization: Bearer $env:API_TOKEN" http://localhost:8787/api/library

# Range: kỳ vọng 206 và Content-Range
curl.exe -i -H "Range: bytes=0-99" "http://localhost:8787/stream/<id>?t=<token>"

# Range sai: kỳ vọng 416
curl.exe -i -H "Range: bytes=999999999-" "http://localhost:8787/stream/<id>?t=<token>"
```

## Test cần có (Vitest)

- Parse Range: các dạng hợp lệ, không hợp lệ, vượt kích thước, suffix.
- Middleware auth: thiếu token, sai token, đúng token (header và query).
- Từ chối `id` sai định dạng và mọi đường dẫn `_meta/`.
- Định dạng response chuẩn cho cả thành công và lỗi.
- Lyrics (Phase 4): ưu tiên bản manual, `PUT/DELETE` từ chối token qua query, từ chối body quá lớn, `format` và `id` sai.
- `/api/health`: 401 khi thiếu token, 200 đúng số bài từ metadata, không đọc cả `library.json`.
- Mọi lỗi dùng đúng `ErrorCode` (test theo từng tình huống).
- `/covers/`: có `v` thì có `immutable`, không có `v` thì không.
- Test dùng dữ liệu từ `@music-app/shared/testing`, không dùng thư viện thật.
