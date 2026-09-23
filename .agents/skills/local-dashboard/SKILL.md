---
name: local-dashboard
description: Xây dựng dashboard web chạy local trên PC (Phase 4) để quản lý thư viện nhạc của music-app gồm duyệt thư viện, nhập nhạc bằng kéo thả, sửa metadata không phá huỷ bằng overrides.json, xem trước khi sync, thống kê dung lượng R2, chạy sync có tiến trình, và bảo mật server local (bind 127.0.0.1, token phiên, kiểm tra Host/Origin). Dùng skill này mỗi khi làm việc trong tools/dashboard hoặc tools/indexer/src/server, lệnh "pnpm indexer ui", overrides.json, hoặc khi người dùng nói "dashboard", "trang quản lý", "sửa tên bài", "sửa tag", "xem trước khi upload". Không bắt đầu trước khi Phase 3 đạt nghiệm thu và người dùng đồng ý.
---

# Dashboard local (Phase 4)

Chi tiết thiết kế ở `docs/PLAN.md` mục 13.1. Skill này là quy tắc thực thi.

## Điều kiện bắt đầu

1. `docs/STATUS.md` cho thấy Phase 3 đã đạt nghiệm thu.
2. Người dùng đã đồng ý làm dashboard. Nếu chưa rõ thì hỏi trước.
3. Nếu chưa đủ điều kiện, chỉ ghi ý tưởng vào STATUS, không viết code.

## Kiến trúc

- Server local nằm trong `tools/indexer/src/server/` (Hono + `@hono/node-server`), **dùng lại services của indexer** (scan, ffmpeg, id, r2, library builder). Không viết lại logic ở dashboard.
- Giao diện ở `tools/dashboard/` (Vite + React + TypeScript + Tailwind, TanStack Query). Build tĩnh ra `dist/`, server local phục vụ file tĩnh.
- API dưới tiền tố `/local-api`, response luôn `{ status, message, data, error }`, input validate bằng Zod, schema dùng chung từ `packages/shared`.
- Lệnh `pnpm indexer ui` khởi động server, in URL kèm token phiên, mở trình duyệt mặc định. Chế độ dev dùng proxy của Vite tới server local.

| Endpoint | Việc làm |
|---|---|
| `GET /local-api/library` | Thư viện đã gộp overrides, kèm cờ "thiếu ảnh bìa", "thiếu tag", "nghi trùng" |
| `PATCH /local-api/tracks/:id/override` | Ghi override một bài (Zod `TrackOverrideSchema`) |
| `GET /local-api/sync/preview` | Diff: bài mới, đổi tên/di chuyển, sắp loại, lỗi |
| `POST /local-api/sync` | Bắt đầu sync sau khi người dùng bấm áp dụng |
| `GET /local-api/sync/events` | Tiến trình và log theo thời gian thực (SSE) |
| `GET /local-api/stats` | Số bài/album, tổng dung lượng, ước tính R2 so với 10GB, phân bố loudness |
| `GET /local-api/library-report` | Báo cáo Sức khoẻ thư viện (`LibraryHealthReportSchema`) |
| `GET /local-api/artists`, `PUT /local-api/artist-aliases` | Danh sách tên nghệ sĩ và gộp tên |
| `GET /local-api/covers`, `PUT /local-api/albums/:id/cover`, `DELETE /local-api/albums/:id/cover` | Quản lý ảnh bìa (tải ảnh lên, gỡ ảnh tuỳ chỉnh) |
| `GET /local-api/overrides/history`, `POST /local-api/overrides/restore` | Lịch sử và khôi phục `overrides.json` |
| `POST /local-api/backup`, `GET /local-api/backups` | Sao lưu một nút và danh sách bản sao lưu |
| `POST /local-api/import/upload` | Nhận file (multipart, theo luồng) vào thư mục tạm, trả về mã lô |
| `GET /local-api/import/:batchId` | Bảng xem trước của lô (trạng thái từng file) |
| `PATCH /local-api/import/:batchId/items/:itemId` | Sửa tag trong bảng xem trước, chọn bỏ qua hoặc vẫn thêm |
| `POST /local-api/import/:batchId/commit` | Chép các file đã chọn vào `MUSIC_IMPORT_DIR` (chỉ thêm file mới) |
| `DELETE /local-api/import/:batchId` | Huỷ lô, hoặc hoàn tác lô trước khi đồng bộ |
| `POST /local-api/import/from-url` | (Tuỳ chọn, làm sau cùng) Tải file nhạc từ link trực tiếp vào thư mục tạm |

## Bảo mật (không thương lượng)

Server này ghi được file và upload lên R2, nên phải chặt hơn một trang web bình thường.

1. **Chỉ bind `127.0.0.1`**, không bao giờ `0.0.0.0`. Có test kiểm tra địa chỉ bind.
2. **Token phiên** ngẫu nhiên (đủ dài, sinh bằng `crypto`) mỗi lần chạy, in ra terminal. Mọi request `/local-api` phải kèm token trong header. Thiếu hoặc sai: 401. So sánh hằng thời gian.
3. **Kiểm tra `Host`** chỉ nhận `127.0.0.1:<port>` và `localhost:<port>`, và **kiểm tra `Origin`** khi có. Sai thì 403. Mục đích: chặn trang web bất kỳ gọi vào localhost và tấn công DNS rebinding. Không bật CORS mở rộng.
4. **Chống path traversal:** client chỉ gửi `id`. Server tự tra đường dẫn từ state, `path.resolve` rồi kiểm tra còn nằm trong `MUSIC_SOURCE_DIR`. Không nhận đường dẫn từ client. Với Nhập nhạc: tên file từ client không bao giờ dùng làm đường dẫn (xem mục Nhập nhạc).
5. **Không trả secret R2** hay giá trị `.env` về trình duyệt, không log secret, không log token.
6. Thao tác ghi (override, sync) chỉ chạy khi người dùng chủ động bấm. Xoá file trên R2 luôn cần bước xác nhận riêng và hiển thị danh sách trước.

## Overrides (gộp không phá huỷ)

- File `overrides.json` theo `OverridesSchema` (`packages/shared`). Key là `Track.id`. Chỉ chứa trường người dùng đã sửa.
- **Không bao giờ sửa file nhạc gốc.** Dashboard không ghi tag vào file. Ngoại lệ duy nhất: Nhập nhạc chỉ **thêm file mới** vào `MUSIC_IMPORT_DIR`.
- Thứ tự gộp khi build: tag từ file → overrides từng bài → **gộp nghệ sĩ (`artistAliases`)** → **tính lại album và `albumId`** (chuẩn hóa bằng `normalizeText` của `@music-app/shared`), sắp lại `trackIds` → **ảnh bìa tuỳ chỉnh (`albumCovers`)**, tách lại cover theo `albumId` mới nếu cần → `library.json`.
- `hidden: true` loại bài khỏi `library.json` nhưng không xoá khỏi R2.
- Ghi file bằng ghi nguyên tử (ghi file tạm rồi đổi tên) để tránh hỏng khi tắt đột ngột.
- Sao lưu `_meta/overrides.json` lên R2 sau mỗi lần sync và khôi phục nếu file local mất (giống `index-state.json`).
- Id bài không còn tồn tại: giữ override một thời gian, hiển thị ở mục "mồ côi" để người dùng dọn, không tự xoá.
- Chạy lại `beets` hoặc `sync` **không được** làm mất override. Có test cho điều này.

## Xem trước và áp dụng sync

- Preview chỉ đọc, tính diff từ state hiện tại và R2, không upload gì.
- Áp dụng gọi lại đúng pipeline `sync` của indexer. Dashboard không có đường upload riêng.
- Hiển thị rõ số bài sẽ upload, dung lượng ước tính và số request ghi (Class A) sẽ dùng.
- Đang có một lần sync chạy thì từ chối bắt đầu lần thứ hai.

## Nhập nhạc

Thiết kế ở `docs/PLAN.md` mục 13.1, phần "Nhập nhạc (chi tiết)". Đây là cách thêm nhạc trong dashboard, dùng chung mã với `pnpm indexer import` (skill `music-indexer`), không viết bản riêng.

**Luồng:** kéo thả → thư mục tạm `tools/indexer/.state/import-staging/<mã lô>/` → phân tích và xem trước → người dùng xác nhận → chép file mới vào `MUSIC_IMPORT_DIR` → mở xem trước đồng bộ → hoàn tác được trước khi áp dụng đồng bộ.

**Quy tắc ghi file (ngoại lệ duy nhất cho "không ghi vào thư mục nhạc")**
- Chỉ **thêm file mới** vào `MUSIC_IMPORT_DIR` (mặc định `<MUSIC_SOURCE_DIR>/_imported/<năm-tháng>/`). Ghi vào file tạm rồi đổi tên. **Không ghi đè** (trùng tên thì thêm hậu tố), không xoá, không sửa file có sẵn.
- Chỉ ghi sau khi người dùng bấm xác nhận. Việc Agent kiểm thử luôn dùng `fixtures/`, không dùng thư mục nhạc thật.
- Hoàn tác chỉ xoá đúng file mà lô đó đã chép (đối chiếu `manifest` và `sha1` còn khớp), có xác nhận, và chỉ trước khi đồng bộ được áp dụng. Sau đó dùng "ẩn bài".
- `manifest` của mỗi lô lưu ở `tools/indexer/.state/import-history/`. Thư mục tạm của lô bị bỏ dở quá 24 giờ được dọn khi khởi động.

**Phân tích (hàm thuần `analyzeImport(items, state)` trong `tools/indexer`, có test):** trạng thái Mới, Trùng (cùng `sha1`), Nghi trùng (cùng tên và nghệ sĩ, thời lượng lệch không quá 2 giây), Lỗi, Cảnh báo (thiếu tag, bitrate dưới 128 kbps, không có ảnh bìa). Sửa tag trong bảng lưu thành override theo `id` (`id` là `sha1` nên có ngay từ bước phân tích), không ghi vào file nhạc.

**An toàn khi nhận file**
- Kiểm tra loại file bằng **nội dung** (bộ đọc tag và âm thanh), không tin đuôi file hay `Content-Type` do client gửi.
- Giới hạn mỗi file (mặc định 300 MB), số file và tổng dung lượng mỗi lô (mặc định 500 file, 5 GB), kiểm tra dung lượng đĩa. Nhận theo luồng, không đọc cả file vào bộ nhớ.
- Tên file từ client **không bao giờ** thành đường dẫn. Hàm thuần `sanitizeFileName` tạo tên đích sạch: bỏ ký tự cấm của Windows và `..`, cắt khoảng trắng đầu cuối, tên dành riêng của Windows (`CON`, `NUL`...), giữ dấu tiếng Việt (NFC), giới hạn độ dài đường dẫn.

**Nhập từ link tải trực tiếp (tuỳ chọn, làm sau cùng)**
- Chỉ `http` và `https`. Phân giải tên miền rồi **chặn địa chỉ nội bộ** (loopback, mạng riêng, link-local, IPv6 tương ứng), kiểm tra lại sau **mỗi lần chuyển hướng**. Tối đa 3 lần chuyển hướng, có thời gian chờ, giới hạn kích thước, không gửi cookie hay thông tin đăng nhập.
- Chỉ nhận **file âm thanh trực tiếp**. Phản hồi là trang HTML, hoặc không đọc được thành âm thanh, thì dừng với thông báo "Đây không phải file nhạc trực tiếp".
- **Không hỗ trợ** link trang web, trang video hay dịch vụ streaming, và không viết bộ trích xuất riêng cho từng trang. Nếu người dùng yêu cầu, giải thích lý do (điều khoản dịch vụ và bản quyền) và đề xuất các cách nhập hợp lệ.

**Giao diện:** khu vực thả file, tiến trình tải lên, bảng xem trước có lọc theo trạng thái, nút chọn "vẫn thêm" cho nghi trùng, ô chọn thư mục đích và kiểu đặt tên, nút Xác nhận và Hủy lô. Ở lần đầu mở trang hiện nhắc "chỉ nhập nhạc bạn có quyền sử dụng".

## Sức khoẻ thư viện

Hàm thuần `buildLibraryReport(library, state, options)` trong `tools/indexer` (có test), kết quả theo `LibraryHealthReportSchema` (đặt ở `packages/shared`, vì server tạo và giao diện đọc). Các nhóm kiểm tra: thiếu ảnh bìa, thiếu tag (title, artist, album; artist là `Unknown Artist` cũng tính), nghi trùng (cùng `sha1`, hoặc cùng title và artist với thời lượng lệch không quá 2 giây), loudness bất thường (ngưỡng cấu hình được, mặc định `|replayGain|` lớn hơn 10 dB), bitrate dưới 128 kbps, file không đọc được (lỗi giải mã), chưa có lời, ảnh bìa tuỳ chỉnh bị mồ côi. Mỗi nhóm có số lượng, danh sách bài và hành động (mở trình sửa, ẩn bài). Chỉ đọc, không tự sửa gì.

## Gộp nghệ sĩ

- Trang liệt kê các chuỗi nghệ sĩ khác nhau và số bài của từng chuỗi. Gợi ý các chuỗi giống nhau khi so sánh bằng `normalizeText` (bỏ dấu, chữ hoa/thường).
- Người dùng chọn nhiều chuỗi và đặt một tên chuẩn. Lưu vào `overrides.json` → `artistAliases` (khoá là `normalizeText(biến thể)`, giá trị là tên chuẩn). Áp dụng cho `artist` và `albumArtist`, so khớp cả chuỗi (chưa xử lý dạng "A feat. B").
- **Bắt buộc xem trước:** hiện danh sách bài và album bị ảnh hưởng trước khi lưu. Gộp làm `albumId` đổi nên phải chuyển khoá `albumCovers` tương ứng.
- Có test: gộp đúng, không gộp nhầm tên khác nhau, `albumId` tính lại, ảnh bìa tuỳ chỉnh đi theo.

## Ảnh bìa

- Lưới ảnh bìa theo album. Bộ lọc: thiếu bìa, ảnh nhỏ (cạnh dài dưới 300 px).
- Thay ảnh bằng cách tải lên, hoặc chọn một ảnh khác nhúng trong file của album đó, hoặc gỡ ảnh tuỳ chỉnh để quay về ảnh nhúng.
- **An toàn khi tải ảnh lên:** kiểm tra loại file bằng nội dung (JPEG, PNG, WebP), không tin đuôi file hay tên file; giới hạn kích thước (ví dụ 10 MB); tự đặt tên file lưu, không dùng tên người dùng; luôn resize và chuyển về JPEG. Thư viện xử lý ảnh cho Node (ví dụ `sharp`) là dependency mới, **hỏi người dùng trước** khi thêm.
- Ảnh lưu ở `tools/indexer/.state/covers-override/`, khai báo trong `overrides.json` → `albumCovers[albumId]`. Xem `docs/PLAN.md` mục 13.1 về `coverVersion` và về việc chuyển khoá khi `albumId` đổi.
- Không tự động tải ảnh từ dịch vụ bên ngoài.

## Lịch sử chỉnh sửa và sao lưu

- **Lịch sử:** trước mỗi lần ghi `overrides.json`, chụp bản cũ vào `tools/indexer/.state/overrides-history/`, giữ 20 bản gần nhất, ghi nguyên tử. Trang lịch sử hiển thị thời điểm, tóm tắt thay đổi và cho khôi phục một bản (có xem khác biệt trước; khôi phục cũng tạo thêm một bản lịch sử).
- **Sao lưu:** nút Sao lưu gọi đúng mã của `pnpm indexer backup` (skill `music-indexer`), không viết bản riêng. Hiển thị danh sách bản sao lưu và thông tin `manifest.json`. Khôi phục luôn xem trước rồi mới ghi khi người dùng xác nhận.

## Trình sửa lời (Phase 4, bước L2)

Xem skill `lyrics-pipeline` (mục L2b). Dashboard là bản nâng cao của trình sửa lời trong app: bảng dòng và mốc thời gian, đổi ngôn ngữ, danh sách "cần duyệt" và "không có lời". Lưu vào `lyrics-manual/` qua cùng API `PUT/DELETE /lyrics/:id`, không tạo đường lưu riêng, và không bao giờ ghi vào `lyrics/`.

## Giao diện

- Tiếng Việt, tìm kiếm bỏ dấu: import `normalizeText` và `searchTracks` từ `@music-app/shared`, dùng chung với app, **không sao chép**. Trình sửa lời dùng `parseLrc`, `stringifyLrc`, `applyOffset`, `interpolateWordTimes` cũng từ `@music-app/shared`.
- Bảng 400 dòng không cần ảo hóa danh sách. Sửa tại chỗ (inline) và hiển thị trường đã bị override bằng dấu hiệu rõ ràng, có nút hoàn tác về giá trị gốc.
- Đủ 4 trạng thái: đang tải, lỗi, rỗng, có dữ liệu.
- Không dùng thư viện native hay thứ gì ảnh hưởng đến app iPhone. Dashboard **không** làm thay đổi `apps/mobile`, nên không cần build lại `.ipa`. Nhớ ghi rõ điều này trong báo cáo.

## Test cần có (Vitest)

- Gộp overrides: từng trường, `hidden`, album/`albumId` tính lại.
- Overrides không mất sau khi build lại từ nguồn có tag mới.
- Middleware: sai token, sai `Host`, sai `Origin`, đúng cả ba.
- Path traversal: `id` lạ, đường dẫn thoát khỏi `MUSIC_SOURCE_DIR`.
- Diff preview: mới, đổi tên, sắp loại, không đổi.
- Server chỉ bind `127.0.0.1`.

Vì Agent không nhìn thấy giao diện như người dùng, hãy chạy thử `pnpm indexer ui` và kiểm tra API bằng `curl.exe`. Nếu công cụ của bạn có trình duyệt tự động thì dùng để kiểm tra luồng chính. Phần còn lại nhờ người dùng thử theo mục D trong `docs/ACCEPTANCE.md`.
- Sức khoẻ thư viện: từng nhóm kiểm tra với dữ liệu mẫu, ngưỡng cấu hình được.
- Gộp nghệ sĩ và ảnh bìa: `albumId` đổi thì khoá `albumCovers` đi theo, ảnh mồ côi được báo.
- Tải ảnh lên: từ chối file không phải ảnh dù đuôi đúng, quá lớn, tên file có đường dẫn lạ.
- Lịch sử: giữ đúng 20 bản, khôi phục tạo thêm bản lịch sử.
- Nhập nhạc: `analyzeImport` (mới, trùng, nghi trùng, lỗi, cảnh báo), `sanitizeFileName` (ký tự cấm, `..`, tên dành riêng, độ dài, giữ dấu tiếng Việt), file đổi đuôi thành `.mp3` bị từ chối, không ghi đè khi trùng tên, hoàn tác chỉ xoá đúng file của lô.
- Nhập từ link (nếu làm): chặn loopback, mạng riêng, link-local (cả sau chuyển hướng), từ chối trang HTML, quá số lần chuyển hướng, quá kích thước.
