---
name: music-indexer
description: CLI TypeScript trên PC để quét thư mục nhạc, đọc tag, tạo id ổn định, đo loudness (ReplayGain) bằng ffmpeg, tách ảnh bìa theo album, sinh library.json (tracks và albums) và upload lên Cloudflare R2. Dùng skill này mỗi khi làm việc với tools/indexer, library.json, id bài hát, album, cover, beets, ffmpeg, chuyển mã FLAC sang AAC/MP3, upload R2 bằng S3 API, hoặc khi người dùng nói "thêm nhạc mới", "sync nhạc", "playlist bị mất bài", "id đổi".
---

# Indexer (tools/indexer)

Chạy trên PC của người dùng, biến thư mục nhạc thành thư viện trên R2. Ngôn ngữ TypeScript, gọi tool ngoài (`ffmpeg`, `beets`) như tiến trình con. Schema lấy từ `packages/shared` (`TrackSchema`, `AlbumSchema`, `LibrarySchema`), **không định nghĩa lại**.

## Lệnh (chạy được trên Windows)

| Lệnh | Việc làm |
|---|---|
| `pnpm indexer scan` | Quét `MUSIC_SOURCE_DIR`, đọc tag, tính id, in bảng tóm tắt (không upload) |
| `pnpm indexer normalize` | Đo loudness từng bài (bỏ qua bài đã đo và file không đổi) |
| `pnpm indexer build-index` | Sinh `library.json` từ kết quả scan/normalize, validate bằng `LibrarySchema` |
| `pnpm indexer upload` | Upload file mới hoặc thay đổi, rồi `library.json` |
| `pnpm indexer sync` | Chạy tuần tự cả bốn bước |
| `pnpm indexer ui` | (Phase 4) Khởi động dashboard local, xem skill `local-dashboard` |
| `pnpm indexer lyrics` | (Phase 4) Lời bài hát, xem skill `lyrics-pipeline` |
| `pnpm indexer backup [--only <mục>]` | (Phase 4) Gom dữ liệu quan trọng vào `backups/<ngày-giờ>/`, xem mục "Sao lưu và khôi phục" |
| `pnpm indexer waveform` | (Tuỳ chọn) Tạo dữ liệu đỉnh sóng cho bài chưa có |
| `pnpm indexer restore --from <thư mục>` | (Phase 4) Khôi phục. Mặc định chỉ hiển thị thay đổi, chỉ ghi khi người dùng xác nhận |
| `pnpm indexer import <file hoặc thư mục>` | (Phase 4) Phân tích, báo trùng và chép file mới vào `MUSIC_IMPORT_DIR`. Dashboard gọi cùng mã (`importService`), xem skill `local-dashboard` mục Nhập nhạc |

Cờ hữu ích: `--dry-run` (không upload), `--concurrency <n>` (mặc định 2-4 cho ffmpeg), `--transcode <aac256|mp3v0>` (chỉ chuyển mã file FLAC/lossless).

## Biến môi trường (`tools/indexer/.env`, không commit)

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `MUSIC_SOURCE_DIR`. Đọc bằng Zod, thiếu biến nào thì báo rõ tên biến đó và dừng. Không log giá trị secret. Phase 4 thêm `MUSIC_IMPORT_DIR` (mặc định `<MUSIC_SOURCE_DIR>/_imported`).

## Id ổn định (quan trọng nhất)

Playlist và favorites tham chiếu bằng `Track.id`, nên id **không được đổi** khi người dùng sửa tag hoặc đổi tên file.

- Id mới = `sha1(nội dung file gốc).slice(0, 12)`.
- Indexer lưu bảng trạng thái `tools/indexer/.state/index-state.json`: mỗi mục gồm `sourcePath`, `size`, `mtimeMs`, `sha1`, `id`.
- Quy tắc ghép id, theo thứ tự:
  1. `sourcePath` đã có trong state: **giữ id cũ** (kể cả khi nội dung thay đổi vì `beets` sửa tag).
  2. `sourcePath` mới nhưng `sha1` trùng một mục cũ đã biến mất: file bị **đổi tên/di chuyển**, giữ id cũ.
  3. Còn lại: file mới, id mới.
- Nếu đổi tên **và** sửa nội dung cùng lúc thì sẽ ra id mới. Chấp nhận và in cảnh báo.
- Sao lưu state lên R2 tại `_meta/index-state.json` sau mỗi lần sync, và khôi phục từ đó nếu file local bị mất. Worker **không được** phục vụ tiền tố `_meta/`.
- Bài biến mất khỏi thư mục nguồn: không xoá khỏi R2 ngay, chỉ loại khỏi `library.json` và in danh sách để người dùng xác nhận trước khi xoá (`--prune`).

## Đọc tag và album

- Đọc bằng `music-metadata`: title, artist, albumArtist, album, trackNumber, discNumber, year, genre, duration.
- Thiếu title thì lấy tên file bỏ đuôi; thiếu artist thì `Unknown Artist`.
- `albumId = sha1(normalize(albumArtist ?? artist) + '|' + normalize(album)).slice(0, 12)`, trong đó `normalize` là **`normalizeText` của `@music-app/shared`** (không viết bản riêng) rồi cắt khoảng trắng thừa. Đổi hành vi của `normalizeText` sẽ làm `albumId` đổi, nên đó là thay đổi phá vỡ tương thích và phải có test "golden" cố định kết quả.
- Album chỉ đọc: `trackIds` sắp theo `discNumber` rồi `trackNumber`, cuối cùng theo title.
- Từ Phase 4, nếu có `overrides.json` thì gộp **sau khi đọc tag và trước khi gom album** (tag → overrides → library). Chi tiết ở skill `local-dashboard`. Trước Phase 4 chưa có overrides.
- Ảnh bìa: dùng ảnh nhúng đầu tiên phù hợp của bài đầu tiên trong album (`music-metadata` có hàm chọn cover). Lưu thành `covers/{albumId}.jpg`, nén về tối đa khoảng 600 px cạnh dài để nhẹ. Nếu chưa có thư viện xử lý ảnh, hỏi người dùng trước khi thêm dependency. Từ Phase 4, nếu có ảnh tuỳ chỉnh trong `covers-override/` (khai báo ở `overrides.json`, trường `albumCovers`) thì dùng ảnh đó trước. Đặt `Album.coverVersion` = 8 ký tự đầu của sha1 nội dung ảnh sau khi resize, để app và Worker làm mới cache khi đổi ảnh.

## Loudness (ReplayGain)

- Dùng `ffmpeg -af loudnorm=print_format=json -f null -`, lấy `input_i` (LUFS) từ JSON in ở cuối stderr.
- `replayGain = -18 - loudnessLufs` (dB). Mức chuẩn -18 LUFS để hầu hết bài chỉ cần giảm.
- **Không sửa file gốc.** Chỉ ghi `loudnessLufs` và `replayGain` vào `library.json`.
- Lưu kết quả đo trong state theo `sha1` để không đo lại.
- Gọi `execFile` với mảng tham số (không ghép chuỗi lệnh) để tránh lỗi với tên file có dấu, khoảng trắng.
- Giới hạn số ffmpeg chạy song song để không treo máy.

## Upload lên R2

- Dùng `@aws-sdk/client-s3`: endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`.
- **Key theo id**, không theo tên file gốc: `music/{id}.{ext}`, `covers/{albumId}.jpg`, `library.json`, `_meta/index-state.json`. Phase 4 thêm `lyrics/{id}.*`. **Indexer không bao giờ ghi hoặc xoá `lyrics-manual/`** (lời do người dùng thêm/sửa).
- Đặt `ContentType` đúng (`audio/mpeg`, `audio/mp4`, `audio/flac`, `image/jpeg`, `application/json`).
- Chỉ upload file mới hoặc đổi (so sánh `sha1`/ETag/kích thước), để tiết kiệm request ghi (Class A).
- Upload file audio lớn theo multipart nếu SDK hỗ trợ, có retry khi mạng lỗi.
- **Upload `library.json` sau cùng**, để app không bao giờ thấy bài mà file chưa có trên R2. Kèm `customMetadata` (`trackCount`, `albumCount`, `generatedAt`, `dataVersion`) để Worker trả `/api/health` nhanh bằng `head()`.
- Validate `LibrarySchema.parse()` trước khi upload. Sai schema thì dừng, không upload.

## Nhập nhạc (Phase 4)

`importService` dùng chung cho lệnh `import` và dashboard. Các bước: đưa file vào thư mục tạm `tools/indexer/.state/import-staging/<mã lô>/` → phân tích (`analyzeImport`, hàm thuần) → chờ xác nhận → chép **chỉ file mới** vào `MUSIC_IMPORT_DIR` → ghi `manifest` vào `tools/indexer/.state/import-history/`. `id` là `sha1` nên có ngay lúc phân tích, cho phép lưu override cho bài trước khi đồng bộ.

- Đây là **ngoại lệ duy nhất** của quy tắc "không ghi vào `MUSIC_SOURCE_DIR`": chỉ thêm file mới, ghi vào file tạm rồi đổi tên, không ghi đè (trùng tên thì thêm hậu tố), không xoá, không sửa file có sẵn. Chi tiết an toàn ở skill `local-dashboard`.
- Mặc định `MUSIC_IMPORT_DIR` là thư mục con `_imported` của `MUSIC_SOURCE_DIR`, để lần `scan` thường lệ tự quét được. Nếu người dùng đặt ra ngoài thì `scan` phải quét cả hai thư mục.
- Nhập từ link (tuỳ chọn) nằm trong `urlFetchService`, có bảo vệ chặn địa chỉ nội bộ, và không có bộ trích xuất riêng cho từng trang web.

## Dữ liệu sóng âm cho thanh tiến trình (Phase 1, tuỳ chọn)

Dùng cho thanh tiến trình dạng sóng âm (`docs/SCREENS.md` mục "Thanh tiến trình"), **không bắt buộc** để app phát và tua nhạc (`SeekBar` tự vẽ dạng trơn khi thiếu dữ liệu).

- Với mỗi bài, dùng `ffmpeg` để lấy khoảng **100 giá trị biên độ** trải đều theo thời gian (ví dụ lọc `astats` hoặc `showwavespic` rồi lấy mẫu, đối chiếu tài liệu `ffmpeg` khi viết, chuẩn hoá về 0-1).
- Lưu vào `waveforms/{id}.json`, dạng `{ version: 1, peaks: number[] }`. File nhỏ (dưới 1 KB), không đặt vào `library.json` để tránh làm phình file đó.
- Chạy riêng lệnh `waveform` (không nằm trong `sync` mặc định) để `sync` thường ngày không chậm đi. Bỏ qua bài đã có dữ liệu (so theo `sha1`).
- Worker: `GET /waveforms/:id?t=<token>`, 404 nếu chưa có (app coi 404 là bình thường, chuyển sang vẽ trơn, không phải lỗi).

## Sao lưu và khôi phục (Phase 4)



- `backup` gom: `tools/indexer/.state/` (index-state, `overrides.json`, `overrides-history`, `covers-override`), trên R2 gồm `_meta/`, `lyrics-manual/`, `state.json`, `library.json`. Ghi vào `backups/<yyyy-MM-dd-HHmm>/` kèm `manifest.json` (danh sách file, kích thước, sha1). Giữ 10 bản gần nhất, chỉ dọn bản cũ trong thư mục `backups/` và hỏi xác nhận lần đầu.
- `--only` cho phép chọn một nhóm: `lyrics-manual`, `state`, `overrides`, `covers`.
- `restore --from` mặc định chỉ hiển thị khác biệt. Chỉ ghi khi người dùng xác nhận rõ ràng, ghi lên R2 phải hiển thị danh sách trước (vùng cấm của `AGENTS.md`). Không xoá dữ liệu hiện có ngoài những gì `manifest.json` nêu.
- `backups/` bị `.gitignore` vì chứa dữ liệu cá nhân và lời bài hát có bản quyền.
- Dashboard gọi cùng mã này, không viết bản riêng.

## Việc chỉ người dùng làm

- Tạo bucket R2 và API token (quyền Object Read & Write cho bucket đó), điền `.env`.
- Chạy `beet import` **một lần trước lần index đầu tiên** (beets sửa tag và có thể đổi đường dẫn file). Nhắc sao lưu thư mục nhạc gốc trước.
- Chạy `pnpm indexer sync` khi thêm nhạc. Viết hướng dẫn từng bước cho họ.

## Test cần có

- Ghép id: giữ id khi đổi tag, giữ id khi đổi tên, id mới khi file mới.
- Gom album và sắp xếp bài.
- Chuẩn hóa văn bản (dấu tiếng Việt, `Đ/đ`).
- Parse kết quả `loudnorm` từ stderr mẫu.
- `library.json` mẫu qua được `LibrarySchema`.
