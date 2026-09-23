---
name: lyrics-pipeline
description: Lấy, lưu và hiển thị lời bài hát cho music-app (Phase 4) gồm đo độ phủ, tra cứu LRCLIB, đọc lời nhúng trong tag, script Python căn thời gian hoặc nhận dạng lời bằng Whisper/Demucs, endpoint /lyrics/:id, parser LRC và màn hình lời đồng bộ trong Now Playing, thêm và sửa lời thủ công ngay trong app, tô dần từng chữ (karaoke), trình sửa lời nâng cao trong dashboard. Dùng skill này mỗi khi làm việc với lời bài hát, file .lrc, lyrics, karaoke, tools/lyrics-py, hoặc khi người dùng nói "lời bài hát", "lyrics", "hiện lời khi hát", "bài này không có lời". Không bắt đầu trước khi Phase 3 đạt nghiệm thu và người dùng đồng ý.
---

# Lời bài hát (Phase 4)

Thiết kế đầy đủ ở `docs/PLAN.md` mục 13.2. Skill này là quy tắc thực thi.

## Bối cảnh quan trọng

Thư viện của người dùng gồm **cả nhạc Việt lẫn nhạc nước ngoài**. Chưa kiểm chứng: (1) độ phủ của LRCLIB với nhạc Việt, (2) chất lượng Whisper khi nhận dạng tiếng Việt được hát. **Không được giả định** hai điều này. Phải đo trước (bước L0).

## Điều kiện bắt đầu

1. `docs/STATUS.md` cho thấy Phase 3 đạt nghiệm thu.
2. Người dùng đồng ý làm phần lời.
3. Bước L3/L4 (Python) chỉ làm sau khi có kết quả L0 **và** người dùng duyệt. Trước khi làm, hỏi người dùng máy có card NVIDIA không (ảnh hưởng tốc độ nhận dạng).

## Các bước

| Bước | Việc | Ngôn ngữ | Điều kiện |
|---|---|---|---|
| **L0** | Đo độ phủ: lấy khoảng 30 bài ngẫu nhiên (nửa Việt, nửa ngoại), tra LRCLIB, báo tỷ lệ có lời có timestamp / chỉ lời thường / không có, **tách theo nhóm ngôn ngữ** | TS | Làm đầu tiên, luôn luôn |
| **L1** | Tra cứu thật: tag nhúng → LRCLIB. Lưu lời, Worker `/lyrics/:id`, app hiển thị | TS | Luôn làm |
| **L1b** | Tô dần từng chữ theo nhạc bằng nội suy (mức 2) | TS | Ngay sau L1 |
| **L2** | **Thêm và sửa lời ngay trong app** (dán, sửa chữ, chỉnh lệch, chạm để đồng bộ), lưu ở `lyrics-manual/` | TS | Theo yêu cầu của người dùng, sau L1 |
| **L2b** | Trình sửa lời nâng cao trong dashboard | TS | Tuỳ chọn |
| **L3** | Căn thời gian cho bài **chỉ có lời thường** (forced alignment) | Python | Tuỳ chọn, cần duyệt |
| **L4** | Nhận dạng lời từ giọng hát cho bài không có lời | Python | Tuỳ chọn, cần duyệt, chỉ khi thử nghiệm cho thấy đáng làm |

Sau L0, trình bày kết quả cho người dùng bằng bảng số liệu thật và đề xuất, không tự quyết định làm L3/L4.

## Lệnh

| Lệnh | Việc làm |
|---|---|
| `pnpm indexer lyrics --coverage --sample 30` | L0: báo cáo độ phủ, không ghi gì |
| `pnpm indexer lyrics` | L1: tra cứu cho bài chưa có lời, lưu kết quả |
| `pnpm indexer lyrics --retry-missing` | Thử lại các bài từng không tìm thấy |
| `pnpm indexer lyrics --align` / `--asr` | L3 / L4: gọi script Python |
| `pnpm indexer backup --only lyrics-manual` | Tải toàn bộ `lyrics-manual/` từ R2 về `backups/` trên PC |

Mọi lệnh hỗ trợ `--dry-run` và `--concurrency`. Tiếp tục được khi bị ngắt: bỏ qua bài đã xong.

## Mô hình dữ liệu

Thêm vào `packages/shared` và gắn vào `TrackSchema` như trường tuỳ chọn:

```ts
export const LyricsRefSchema = z.object({
  file: z.string(),                       // "lyrics/{id}.lrc" hoặc "lyrics/{id}.txt"
  format: z.enum(['lrc', 'elrc', 'txt']), // lrc = mốc theo dòng, elrc = mốc theo từng chữ, txt = lời thường
  source: z.enum(['sidecar', 'embedded', 'lrclib', 'aligned', 'asr', 'manual']),
  language: z.string().optional(),        // 'vi', 'en', ...
  reviewed: z.boolean().default(false),
});
export type LyricsRef = z.infer<typeof LyricsRefSchema>;
```

- File lời lưu UTF-8, chuẩn hóa **NFC** (dấu tiếng Việt).
- **Không nhúng nội dung lời vào `library.json`** (400 bài × vài KB làm file nặng). App tải theo từng bài và cache.
- Lời do người dùng thêm/sửa nằm ở `lyrics-manual/`, tách khỏi `lyrics/`. **Indexer và script Python không bao giờ ghi hoặc xoá `lyrics-manual/`.** Có test cho điều này. Bài có `reviewed: true` trong `library.json` cũng không bị ghi đè.
- Lưu cả kết quả "không tìm thấy" trong state (kèm thời điểm) để không hỏi lại mỗi lần sync. `--retry-missing` mới thử lại.

## Tra cứu (L1)

- Thứ tự: **file `.lrc` (hoặc `.txt`) cùng tên nằm cạnh file nhạc** → lời nhúng trong tag (`music-metadata`) → LRCLIB. Bản `lyrics-manual/` (nếu có) luôn thắng tất cả.
- **File cạnh nhạc (`source: 'sidecar'`)**: do người dùng cung cấp nên coi như đã duyệt. Đọc UTF-8 (chấp nhận BOM) và UTF-16 có BOM, chuẩn hóa NFC. Không giải mã được thì bỏ qua và báo cảnh báo, **không đoán bảng mã**. File đổi thì lần `sync` sau cập nhật `lyrics/{id}`, không đụng `lyrics-manual/`. Giới hạn 64 KB giống các nguồn khác.
- LRCLIB: gọi `get` theo `track_name`, `artist_name`, `album_name`, `duration`, nếu không thấy thì dùng `search` dự phòng. Trả về gồm lời thường và lời có timestamp dạng LRC. **Đối chiếu tài liệu LRCLIB hiện hành** trước khi viết (đường dẫn, tham số, giới hạn).
- Gửi `User-Agent` nhận diện ứng dụng. Giới hạn tốc độ thấp, retry có backoff, xử lý 404 là "không có", không phải lỗi.
- Chuẩn hóa NFC trước khi gửi. Với nhạc Việt, khi không thấy có thể thử thêm biến thể bỏ dấu của tên bài/nghệ sĩ, nhưng **phải kiểm tra độ lệch thời lượng** (ngưỡng cấu hình được, ví dụ ±3 giây) để tránh gán nhầm bài.
- Kết quả không chắc chắn (khớp qua `search`, thời lượng lệch nhiều) đặt `reviewed: false` và hiện ở danh sách "cần duyệt" trong dashboard.
- Bài `instrumental` thì ghi nhận là không có lời, không coi là lỗi.
- **Không đăng lời lên bất kỳ dịch vụ công cộng nào.**

## Script Python (L3/L4, tuỳ chọn)

- Thư mục `tools/lyrics-py/`, quản lý bằng `uv`, khoá phiên bản, có README ngắn cách cài trên Windows.
- **Hợp đồng bằng JSON:** TS ghi file công việc (danh sách `{ id, audioPath, language, lyricsText? }`), gọi script, đọc file kết quả và **validate bằng Zod** trước khi dùng. Python không tự ghi vào R2 hay `library.json`.
- `language` do TS truyền vào rõ ràng cho từng bài (lấy từ tag, hoặc suy ra từ lời/tiêu đề), **không để mô hình tự nhận diện** vì dễ nhận nhầm ở bài Việt pha tiếng Anh. Cho phép người dùng sửa `language` trong dashboard.
- L3: dùng công cụ căn thời gian có sẵn (forced alignment bằng Whisper) để gán timestamp cho lời đã có, xuất LRC.
- L4: tách giọng bằng Demucs (tuỳ chọn, tốn thời gian) rồi nhận dạng bằng Faster-Whisper, xuất LRC hoặc văn bản. Kết quả ASR luôn `reviewed: false`.
- Mô hình lớn cần GPU. **Chưa có số đo tốc độ trên máy người dùng**: đo trên 3-5 bài rồi ước tính tổng thời gian cho cả thư viện trước khi chạy hàng loạt, và báo con số đó cho người dùng.
- Trước khi chạy cả thư viện: thử trên khoảng **10 bài Việt** và **10 bài ngoại**, đưa kết quả cho người dùng tự nghe và đọc để đánh giá. Nếu tiếng Việt sai nhiều, nói thẳng như vậy và đề xuất phương án (bỏ qua, hoặc soạn tay bằng dashboard cho bài yêu thích).
- Chọn mô hình theo phần cứng: bản lớn khi có GPU, bản nhỏ hơn khi chỉ có CPU. Nêu rõ đánh đổi giữa tốc độ và độ đúng, không hứa chất lượng.

## Worker

Xem thêm skill `cloudflare-music-api`.

| Method | Path | Xác thực | Việc làm |
|---|---|---|---|
| GET, HEAD | `/lyrics/:id?t=<token>` | Query | Trả bản `manual` nếu có, không thì bản tự động. `Content-Type: text/plain; charset=utf-8`, header `X-Lyrics-Source: manual\|auto` và `X-Lyrics-Format: lrc\|elrc\|txt`. 404 nếu không có |
| PUT | `/lyrics/:id` | **Header `Authorization`** | Lưu vào `lyrics-manual/{id}.{format}`. Body Zod `{ format, content }` |
| DELETE | `/lyrics/:id` | **Header `Authorization`** | Xoá bản manual (quay về bản tự động) |
| GET | `/api/lyrics/manual` | Header | Danh sách `id` có bản manual |

- Chỉ nhận `id` đúng định dạng, dựng key từ `id`, không nối chuỗi từ input.
- Thao tác ghi (`PUT`, `DELETE`) **chỉ nhận token qua header**, không nhận query.
- `content` tối đa 64 KB (đếm byte UTF-8), chuẩn hóa NFC và xuống dòng `\n`. `format` chỉ nhận `lrc`, `elrc`, `txt`. Mỗi bài chỉ giữ một định dạng manual: khi ghi định dạng mới thì xoá file manual định dạng cũ của bài đó.
- Không log query, không log nội dung lời.
- Worker và app dùng chung từ `@music-app/shared`: `LYRICS_MAX_BYTES`, `utf8ByteLength`, `isValidTrackId`, `detectLyricsFormat` và `parseLrc` (kiểm tra nội dung hợp lệ), để hai bên không lệch giới hạn.

## App

- Module **Lyrics** trong `features/lyrics/`, hook `useLyrics(trackId)` dùng TanStack Query (cache, persist).
- **Parser LRC là hàm thuần có test**: nhiều mốc thời gian trên một dòng, thẻ `[offset:±ms]`, `mm:ss.xx` và `mm:ss.xxx`, dòng rác/thẻ metadata (`[ar:]`, `[ti:]`), dòng rỗng, mốc không tăng dần. Đặt trong `packages/shared/src/lrc/` (dùng chung app, dashboard, Worker), gồm `parseLrc`, `stringifyLrc`, `detectLyricsFormat`, `applyOffset`.
- Hiển thị trong Now Playing:
  - `lrc`: tô sáng dòng đang hát theo vị trí phát (cập nhật khoảng 250 ms, không dựng lại cả danh sách), tự cuộn, chạm vào dòng để tua tới đó.
  - `txt`: văn bản cuộn tay.
  - Không có lời: thông báo tiếng Việt thân thiện, không lỗi.
- Font hiển thị đúng dấu tiếng Việt. Dòng dài tự xuống dòng.
- **Tô dần theo nhạc** (`docs/PLAN.md` mục 13.2), 3 mức:
  1. Tô sáng cả dòng đang hát (mặc định).
  2. Tô dần từng chữ bằng **nội suy**: chia dòng theo khoảng trắng, chia thời gian giữa mốc dòng này và mốc dòng kế theo số ký tự của từng chữ, có giới hạn tối đa cho dòng cuối. Không cần dữ liệu thêm. Viết thành hàm thuần `interpolateWordTimes(line, startSec, endSec)` trong `packages/shared/src/lrc/`.
  3. Tô theo mốc thật từng chữ khi lời là `elrc`.
- Vẽ mỗi chữ là một `Text` riêng, đổi màu khi tới mốc. Thuần JS, không cần build lại. Quét màu mượt cần masked view (native, phải build lại): chỉ làm khi người dùng yêu cầu.
- Vị trí phát: nội suy cục bộ giữa các lần player báo tiến trình (dựa vào thời điểm nhận và trạng thái đang phát) để chữ đổi màu đều, không giật. Ngừng cập nhật khi app ở nền hoặc màn hình lời không hiển thị.
- Chỉ dựng lại các chữ đổi trạng thái, không dựng lại cả danh sách. Kiểm tra bằng bài dài (200 dòng trở lên).
- Tua bài hoặc đổi bài: tính lại dòng và chữ hiện tại ngay từ vị trí mới.
- Công tắc bật/tắt tô dần từng chữ (mức 2) trong Settings.
- Parser hỗ trợ `[mm:ss.xx]`, `[mm:ss.xxx]`, nhiều mốc trên một dòng, thẻ `[offset:]`, mốc từng chữ `<mm:ss.xx>` (LRC mở rộng).
- Tải lời **lười** (chỉ khi mở màn hình lời) và tải trước bài kế tiếp nếu tiện. Tính năng này chỉ là JS/TS nên **không cần build lại `.ipa`** (báo rõ trong báo cáo).

## Thêm và sửa lời (L2)

Người dùng muốn tự thêm lời cho bài chưa có và sửa lời hiện có ngay trong app, không cần PC. Thiết kế ở `docs/PLAN.md` mục 13.2.

**Nguyên tắc dữ liệu**
- Bản của người dùng nằm ở `lyrics-manual/{id}.{lrc|elrc|txt}` trên R2. Indexer và script Python không bao giờ ghi hoặc xoá thư mục này, nên tra cứu lại hay `sync` không thể ghi đè.
- Sửa lời tự động là **sao chép thành bản manual rồi sửa** (copy-on-write). Nút "Khôi phục bản gốc" gọi `DELETE`.
- App không ghi vào `library.json` (do indexer sở hữu). Trạng thái manual lấy từ `GET /lyrics/:id` (header `X-Lyrics-Source`) và `GET /api/lyrics/manual`.
- Sao lưu: `pnpm indexer backup --only lyrics-manual`.

**Trình sửa trong app** (mỗi mục một phiên, theo thứ tự)
1. **Dán lời:** ô soạn thảo nhiều dòng, dán lời thường hoặc nội dung `.lrc`. Tự nhận dạng định dạng (có thẻ `[mm:ss.xx]` thì `lrc`, có thêm `<mm:ss.xx>` trong dòng thì `elrc`, còn lại `txt`). Có xem trước trước khi lưu.
2. **Sửa chữ từng dòng**, giữ nguyên mốc thời gian.
3. **Chỉnh lệch cả bài:** nút ±0,5 giây, lưu thành thẻ `[offset:±ms]` chuẩn của LRC, xem thử ngay khi đang phát.
4. **Chạm để đồng bộ (làm sau cùng):** phát bài, chạm mỗi khi bắt đầu một dòng để ghi mốc thời gian, rồi cho chỉnh lại từng dòng (nút ±0,1 giây, chạm dòng để tua nghe lại).
5. Luôn có Hoàn tác trước khi lưu và xác nhận khi thoát mà chưa lưu.

**Lưu ý kỹ thuật**
- Giữ NFC khi dán để không mất dấu tiếng Việt.
- Lỗi mạng khi lưu: giữ bản nháp cục bộ (MMKV), cho lưu lại, không mất chữ đã gõ.
- Sửa trên hai thiết bị: last-write-wins, hiện thời điểm sửa gần nhất.

**Dashboard (L2b, tuỳ chọn):** bảng dòng và mốc thời gian trên màn hình lớn, danh sách "cần duyệt" và "không có lời", đổi `language`. Dùng chung API `PUT/DELETE /lyrics/:id`, không tạo đường lưu riêng.

## Bản quyền

Lời bài hát có bản quyền. Chỉ dùng cho thư viện cá nhân, lưu trong bucket riêng có token, không chia sẻ công khai. Nhắc người dùng điều này ở lần làm đầu tiên. Đây không phải tư vấn pháp lý.

## Test cần có (Vitest)

- Parser LRC: các trường hợp ở trên. Test nằm trong `packages/shared`.
- Chuẩn hóa NFC và biến thể bỏ dấu khi truy vấn.
- Ngưỡng độ lệch thời lượng: nhận/từ chối đúng.
- Indexer và script Python không bao giờ ghi hoặc xoá `lyrics-manual/`.
- Parser LRC: thẻ `[offset:]`, mốc từng chữ `<mm:ss.xx>`, nhiều mốc trên một dòng.
- `interpolateWordTimes`: tổng thời gian bằng khoảng dòng, các mốc tăng dần, dòng một chữ, dòng cuối.
- Tính dòng/chữ hiện tại sau khi tua.
- Worker: `PUT/DELETE` từ chối token qua query, từ chối nội dung quá 64 KB, `format` sai, `id` sai.
- Cache "không tìm thấy" và `--retry-missing`.
- Validate hợp đồng JSON với Python bằng Zod (kết quả sai định dạng bị từ chối).
- Worker: `id` sai định dạng, thiếu token, không có lời.

## Việc chỉ người dùng làm

- Duyệt kết quả L0 và quyết định có làm L3/L4 không.
- Cài Python, `uv`, và driver GPU nếu dùng GPU (Agent viết hướng dẫn từng bước).
- Nghe và đọc thử kết quả trên 10 bài Việt, 10 bài ngoại.
- Kiểm tra hiển thị lời trên iPhone theo mục E trong `docs/ACCEPTANCE.md`.
- Sidecar: BOM UTF-8, UTF-16 có BOM, mã hoá không giải mã được (bỏ qua và cảnh báo), file quá lớn, `.txt` không có mốc thời gian.
