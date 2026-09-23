# Plan & Tech Stack: App nghe nhạc cá nhân (iOS)

> Phiên bản 2.2. Dự án do **AI Agent viết code**, người dùng không code: vai trò của bạn là giao việc, chạy build, cài app và nghiệm thu trên iPhone. **Bản tóm tắt:** `docs/PLAN-SUMMARY.md`. **Lịch sử thay đổi:** `docs/CHANGELOG.md`. **Ý tưởng chờ và đã loại:** `docs/IDEAS.md`.

## 1. Mục tiêu và phạm vi

- Nghe nhạc stream từ cloud, khoảng 300-400 bài, dùng cá nhân.
- Tắt màn hình vẫn phát, lock screen hiển thị tên bài, ảnh bìa, nút điều khiển (giống Spotify).
- Không qua App Store, không có Mac (sideload bằng Sideloadly hoặc AltStore).
- Toàn bộ mã nguồn dùng **TypeScript**. Xử lý nhạc trên PC gọi tool ngoài (`ffmpeg`, `beets`).
- Âm lượng giữa các bài được chuẩn hóa (ReplayGain).
- Có **album** (tự sinh từ tag) và **playlist** (bạn tự tạo).

### 1.1. Thiết bị và điều kiện đã xác nhận

- iPhone 16 chạy **iOS 27**. PC Windows, không có Mac.
- Có thẻ VISA để bật R2 (R2 cần một bước đăng ký, dùng hạn mức miễn phí hằng tháng). Nếu thẻ bị từ chối, kiểm tra với ngân hàng xem đã bật giao dịch quốc tế/online chưa. Nếu vẫn không được thì cần phương án khác, hiện chưa có trong plan.
- Việc gia hạn app mỗi 7 ngày do người dùng đảm nhận.
- Repo **private**.
- **Ngoài phạm vi:** CarPlay (cần quyền đặc biệt do Apple cấp, gần như chắc chắn không dùng được với Apple ID miễn phí, chưa kiểm chứng) và widget. Bluetooth trên xe thông thường vẫn hiện tên bài nhờ metadata trên lock screen. Bạn cũng đã quyết định **không làm** chế độ tiết kiệm dữ liệu (bản nhạc bitrate thấp) và đếm lượt nghe. Không nên làm: sửa tag bài hát từ app iPhone (chỉ sửa ở dashboard, ngoại lệ là lời bài hát), equalizer, mix kiểu DJ, dashboard đưa lên cloud. Danh sách đầy đủ các ý tưởng đã loại nằm ở `docs/IDEAS.md`.

## 2. Kiến trúc tổng thể

```
┌──────────────┐   Bearer token    ┌────────────────────┐      ┌──────────────┐
│  iPhone App  │ ────────────────► │ Cloudflare Worker  │ ───► │ Cloudflare   │
│ Expo + RNTP  │ ◄──────────────── │ (Hono + Zod)       │ ◄─── │ R2 (nhạc,    │
└──────────────┘  JSON + stream    └────────────────────┘      │ cover, json) │
                                                               └──────▲───────┘
┌────────────────────────────────────────────┐   upload (S3 API)      │
│ Indexer CLI (PC)                           │ ───────────────────────┘
│ beets (dọn tag) → ffmpeg (loudness/convert)│
│ → music-metadata (đọc tag) → library.json  │
└────────────────────────────────────────────┘
```

## 3. Tech stack

| Tầng | Công nghệ | Lý do |
|---|---|---|
| **Mobile** | Expo (development build) + React Native + TS strict | Build cloud không cần Mac |
| Điều hướng | `expo-router` | File-based, chuẩn của Expo |
| Audio | `@rntp/player` (RNTP v5) | Lock screen, Control Center, queue, background, hỗ trợ New Architecture |
| Client state | Zustand (+ `persist`) | Player, favorites, playlist |
| Server state | TanStack Query (+ persist) | Cache thư viện, mở app nhanh, xem được khi mất mạng |
| Styling | NativeWind (Tailwind cho RN) | Đúng ưu tiên Tailwind, mobile-first |
| Danh sách dài | `@shopify/flash-list` | 400 bài cuộn mượt |
| Lưu local | MMKV | Nhanh, cần dev build (đã có) |
| Bí mật | `expo-secure-store` | Lưu token API trên máy, không nằm trong bundle |
| **Backend** | Cloudflare Workers + **Hono** + **Zod** | Free tier đủ dùng, TS thuần, validate đầu vào |
| Lưu trữ | Cloudflare R2 | Không tính phí băng thông ra, hỗ trợ Range request |
| **Xử lý nhạc (PC)** | `beets` (cần Python cài sẵn, chỉ dùng như tool), `ffmpeg`, `music-metadata`, AWS SDK S3 | Đủ tính năng, code vẫn là TypeScript |
| Monorepo | pnpm workspaces | Chia sẻ schema giữa app, API, CLI |
| Chất lượng code | ESLint, Prettier, Vitest, `expo-doctor` | `expo-doctor` kiểm tra thư viện có tương thích New Architecture |
| **CI/CD** | GitHub Actions (macOS runner) | Build `.ipa` chưa ký, ký bằng Sideloadly |
| Dashboard (Phase 4) | Vite + React + TS + Tailwind, server local Hono (`@hono/node-server`) | Chạy ở `localhost`, dùng lại code indexer, không cần hosting |
| Lời bài hát (Phase 4) | Tra cứu LRCLIB (TypeScript). Tuỳ chọn: Python + Faster-Whisper/Demucs | Tra cứu trước, AI chỉ dùng cho bài còn thiếu và cần duyệt |

Quy tắc phiên bản (xem thêm mục 12.7 về iOS 27): dùng Expo SDK **ổn định** mới nhất tại lúc bắt đầu, không dùng bản beta, **khoá phiên bản** trong `package.json` và chỉ nâng cấp khi có lý do (mỗi lần nâng cấp là một lần rủi ro cho thư viện native).

## 4. So sánh phương án

### 4.1. Backend

| Phương án | Độ phức tạp | Bảo mật | Nhận xét |
|---|---|---|---|
| A. R2 public + JSON | Thấp nhất | Ai có link đều nghe được | Nhanh, khó mở rộng |
| **B. R2 + Worker (chọn)** | Trung bình | Có token, API nhất quán, Zod validate | Cân bằng nhất, vẫn miễn phí |
| C. Navidrome tự host | Trung bình | Tốt | Tự đọc tag, nhưng phải có máy chạy 24/7 |

### 4.2. Xử lý nhạc trên PC

| Phương án | Nhận xét |
|---|---|
| A. Indexer thuần TS | Đơn giản nhưng không có loudness và dọn tag |
| **B. Indexer TS + `ffmpeg`/`beets` (chọn)** | Gần đủ tính năng, một ngôn ngữ chính |
| C. Indexer Python riêng | Chỉ cần nếu sau này muốn phân tích BPM, gợi ý bài tương tự |

### 4.3. Thư viện audio

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| **`@rntp/player` (RNTP v5)** (chọn) | Bộ điều khiển lock screen và remote event đầy đủ, queue native, hỗ trợ New Architecture | v5 dùng giấy phép thương mại. README ghi **dùng cá nhân và học tập miễn phí**, còn trang giá chỉ liệt kê gói thương mại (99€/tháng). Phase 0 cần đọc `rntp.dev/terms` để chắc chắn |
| `react-native-track-player` v4 (MIT) | Miễn phí | Chưa hỗ trợ New Architecture, phải vá native bằng `patch-package`, dễ vỡ khi nâng cấp |
| `expo-audio` (MIT, dự phòng) | Cài đơn giản, có playlist, background và lock screen metadata | Tài liệu chỉ nêu nút seek tiến/lùi trên lock screen, không nêu next/previous, ít điều khiển remote hơn |

Yêu cầu cốt lõi của bạn là lock screen giống Spotify (có next/previous), nên chọn RNTP v5. Nếu Phase 0 gặp vấn đề về giấy phép hoặc build, chuyển sang `expo-audio`. Toàn bộ app chỉ gọi player qua một lớp `PlayerService` để việc đổi thư viện chỉ ảnh hưởng một chỗ.

### 4.4. Dashboard quản lý

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Không làm | Đơn giản, Agent tập trung vào app | Quản lý bằng dòng lệnh |
| B. Dashboard trên cloud | Truy cập từ mọi nơi | Tốn công nhất, thêm bề mặt bảo mật (đăng nhập admin), Worker không chạy được `ffmpeg`, lặp logic với indexer |
| **C. Dashboard local (chọn, làm ở Phase 4)** | Dùng lại code indexer, có sẵn `ffmpeg`/`beets`, không lộ ra internet, không cần hosting | Chỉ dùng khi ngồi trước PC |

Chưa làm trước Phase 3 vì rủi ro lớn nhất hiện tại nằm ở Phase 0 (player, build, sideload).

## 5. Lưu trữ và giới hạn free

### 5.1. Số liệu (Cloudflare R2, kiểm tra tại `developers.cloudflare.com/r2/pricing`)

| Hạng mục | Free mỗi tháng | Vượt free |
|---|---|---|
| Dung lượng | 10 GB | 0,015 USD/GB/tháng |
| Class A (ghi, liệt kê) | 1 triệu request | 4,50 USD/triệu |
| Class B (đọc) | 10 triệu request | 0,36 USD/triệu |
| Băng thông ra | Miễn phí | Miễn phí |

Ước tính dung lượng: MP3/AAC 320kbps khoảng 10 MB/bài, nên 400 bài ≈ **4 GB**, dưới ngưỡng free. Dung lượng gấp đôi (20 GB) tốn khoảng 0,15 USD/tháng, 100 GB tốn khoảng 1,35 USD/tháng. Dùng cá nhân thì số request đọc cũng rất thấp so với hạn mức.

### 5.2. Có nên tạo tài khoản thứ hai để fallback khi vượt free? **Không nên**

- Chi phí trả phí quá nhỏ so với công sức quản lý hai tài khoản (hai bộ credential, phân luồng bài theo tài khoản, sao lưu, lỗi khó dò).
- Tạo nhiều tài khoản chỉ để lách hạn mức thường bị coi là vi phạm điều khoản dịch vụ, có nguy cơ bị khoá.
- Vượt free **không làm dừng dịch vụ**, chỉ bị tính phí theo mức dùng thực tế.

Thứ tự xử lý khi gần chạm 10 GB:

1. **Giảm dung lượng:** chuyển FLAC sang AAC 256kbps hoặc MP3 V0 bằng `ffmpeg` (một lệnh trong indexer).
2. **Trả phí R2:** vài chục cent mỗi tháng. Đặt cảnh báo chi phí trong Cloudflare dashboard để không bị bất ngờ.
3. **Chỉ khi thật sự cần free thêm:** dùng **nhà cung cấp khác** (ví dụ Backblaze B2, kiểm tra lại hạn mức free trước khi dùng) làm nơi chứa phần dư. Đây là hai dịch vụ khác nhau, không phải hai tài khoản cùng một dịch vụ.

### 5.3. Thiết kế sẵn để đổi hoặc thêm nơi lưu (không tốn công)

- Tầng API dùng interface `StorageRepository`, hiện chỉ có `R2Repository`.
- Trường `storage` trong schema mỗi bài mặc định là `'r2'`, để sau này thêm nơi lưu khác mà không đổi cấu trúc dữ liệu.
- Key trên R2 đặt theo **`id` bài hát**, không dùng tên file gốc (tránh lỗi dấu tiếng Việt và khoảng trắng).

```ts
// apps/api/src/repositories/storageRepository.ts
export interface ObjectRange {
  offset: number;
  length?: number;
}

export interface StoredObject {
  body: ReadableStream;
  size: number;
  etag: string;
  contentType: string;
}

// Mọi nơi lưu (R2, B2...) chỉ cần implement interface này
export interface StorageRepository {
  head(key: string): Promise<{ size: number; etag: string } | null>;
  get(key: string, range?: ObjectRange): Promise<StoredObject | null>;
}
```

### 5.4. Bố cục bucket

```
bucket/
├── library.json          # tracks + albums (do indexer sinh)
├── state.json            # playlists + favorites (Phase 4, đồng bộ)
├── music/{id}.mp3
├── lyrics/{id}.lrc       # (Phase 4) lời bài hát UTF-8, hoặc .txt nếu không có mốc thời gian
├── lyrics-manual/{id}.lrc # (Phase 4) lời bạn thêm/sửa trong app, indexer không bao giờ ghi vào đây
└── covers/{albumId}.jpg  # ảnh bìa theo album, dùng chung cho các bài cùng album
```

### 5.5. Sao lưu

| Dữ liệu | Nằm ở đâu | Sao lưu thế nào |
|---|---|---|
| Nhạc gốc | PC | Chép ra ổ ngoài hoặc dịch vụ khác ít nhất mỗi tháng. R2 **không** phải bản sao lưu duy nhất |
| `index-state.json`, `overrides.json`, lời sửa tay | PC + R2 (`_meta/`) | Bản trên R2 là sao lưu tự động. Chép thêm sang ổ ngoài |
| Playlist, favorites | App (Phase 3), R2 `state.json` (Phase 4) | Xuất JSON, rồi Sync |
| Lời bạn thêm/sửa trong app (Phase 4) | R2 `lyrics-manual/` | `pnpm indexer backup` (hoặc nút Sao lưu trong dashboard) tải về `backups/` trên PC, rồi chép sang ổ ngoài |
| Ảnh bìa tuỳ chỉnh và lịch sử chỉnh sửa (Phase 4) | PC (`tools/indexer/.state/`) | Nằm trong cùng lệnh `pnpm indexer backup` |
| Mã nguồn | GitHub (private) | Đã có lịch sử phiên bản |
| Secret (`.env`, token, khoá R2) | PC | Lưu trong trình quản lý mật khẩu, không nằm trong repo |

**Sao lưu một nút (Phase 4):** `pnpm indexer backup` (dashboard có nút tương ứng) gom các mục trên vào `backups/<ngày-giờ>/` kèm `manifest.json` (danh sách file, kích thước, sha1). `pnpm indexer restore --from <thư mục>` mặc định **chỉ hiển thị thay đổi**, chỉ ghi khi bạn xác nhận. Thư mục `backups/` bị `.gitignore` vì chứa dữ liệu cá nhân.

Mất dữ liệu trên R2 không làm mất nhạc vì nhạc gốc vẫn còn: chạy lại `pnpm indexer sync` để dựng lại. Chi tiết thao tác ở `docs/RUNBOOK.md`.

### 5.6. Cách đưa nhạc vào thư viện (hiện tại)

| Cách | Trạng thái | Ghi chú |
|---|---|---|
| Chép file vào thư mục nhạc trên PC, rồi `pnpm indexer sync` | **Có, là cách chính** | Indexer đọc tag, đo loudness, upload lên R2 |
| Đọc file `.lrc` nằm cạnh file nhạc | Phase 4 (mục 13.2) | Chỉ là nguồn lời, không phải nhập nhạc |
| Kéo thả file trong dashboard | Phase 4 (mục 13.1, trang "Nhập nhạc") | Xem trước tag và trùng lặp, chép vào `MUSIC_IMPORT_DIR`, rồi đồng bộ |
| Nhập từ link tải trực tiếp `.mp3`/`.m4a` | Phase 4, **tuỳ chọn**, làm sau cùng | Chỉ file nhạc trực tiếp, không hỗ trợ link trang web hay video |
| Gửi file từ iPhone | Chưa có | Chưa nằm trong kế hoạch |


## 6. Modules của app

| # | Module | Chức năng | Phase |
|---|---|---|---|
| 1 | **Core** | API client, theme, cấu hình, xử lý lỗi, màn hình Debug | 0-1 |
| 2 | **Connection** | Màn hình kết nối lần đầu: nhập Server URL và token, kiểm tra bằng `GET /api/health`, lưu token vào SecureStore. Khi token sai hoặc đã đổi (lỗi 401) hiện màn hình nhập lại, giữ nguyên dữ liệu đã cache | 2 |
| 3 | **Library** | Danh sách bài hát (sắp xếp, cuộn nhanh A-Z), kéo để làm mới, cache offline | 2 |
| 4 | **Player** | Phát, tạm dừng, next/prev, seek, shuffle (đặc tả mục 13.3), repeat, queue, Now Playing, MiniPlayer, lock screen, ReplayGain | 2 |
| 5 | **Search** | Tìm theo tên bài, ca sĩ, album. **Bỏ dấu tiếng Việt** khi so khớp | 3 |
| 6 | **Albums** | Duyệt album (tự sinh từ tag), chi tiết album, phát cả album | 3 |
| 7 | **Playlists** | Tạo, đổi tên, xoá, thêm/bớt bài, sắp xếp lại, phát | 3 |
| 8 | **Favorites** | Thích/bỏ thích bài, danh sách yêu thích | 3 |
| 9 | **Settings** | Server, xoá cache, phiên bản build, xuất/nhập playlist, cảnh báo sắp hết hạn chứng chỉ ký (nếu đọc được, mục 12.8), cài đặt tải offline | 3 |
| 10 | **Sync** | Đồng bộ playlist và favorites lên `state.json` | 4 |
| 11 | **Offline** | Tải bài, album, playlist, yêu thích về máy. **Chỉ tải qua Wi-Fi** (mặc định bật). Quản lý dung lượng (mục 13.4) | 4 |
| 12 | **Lyrics** | Hiển thị lời đồng bộ, tô dần theo nhạc, thêm và sửa lời ngay trong app (mục 13.2) | 4 |
| 13 | **Extras** | Sleep timer | 4 |
| 14 | **Transitions** | Crossfade (thử nghiệm, mục 13.3) | 4 |
| 15 | **Queue & Recents** | Màn hình Hàng đợi (xem, kéo sắp xếp, xoá, "Phát tiếp theo"). "Nghe gần đây" (lưu trên máy, tối đa 200 bài, không đồng bộ) | 2 (hàng đợi), 3 (nghe gần đây) |
| 16 | **Artists** | Duyệt theo nghệ sĩ: danh sách nghệ sĩ, trang nghệ sĩ (album và bài). Tạo từ danh sách bài trên máy, dùng tên đã gộp ở dashboard | 3 |

Sơ đồ màn hình, điều hướng và bố cục: xem `docs/SCREENS.md` (nguồn duy nhất về giao diện).

Hàm chuẩn hóa văn bản cho tìm kiếm:

```ts
// packages/shared/src/text/normalizeText.ts (dùng chung: indexer, app, dashboard; xem mục 8.1)
// Bỏ dấu tiếng Việt và đưa về chữ thường để so khớp: "Sơn Tùng" -> "son tung"
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
```

## 7. Schema và API

### 7.1. Album và Playlist khác nhau thế nào

| | **Album** | **Playlist** |
|---|---|---|
| Nguồn | Tự sinh từ tag khi chạy indexer | Bạn tự tạo trong app |
| Sửa được | Không (chỉ đọc) | Có (đổi tên, thêm/bớt/sắp xếp bài) |
| Lưu ở đâu | `library.json` trên R2 | Local trong app (Phase 3), đồng bộ `state.json` (Phase 4) |

Schema có cả hai. `id` của bài hát là **`sha1(nội dung file gốc).slice(0, 12)`** và indexer lưu bảng ánh xạ để giữ nguyên `id` khi bạn sửa tag hoặc đổi tên file. Nhờ vậy playlist không bị hỏng khi chạy lại indexer. Bài nào bị xoá khỏi thư viện thì playlist bỏ qua bài đó và hiện thông báo.

### 7.2. Schema dùng chung

```ts
// packages/shared/src/schemas.ts
// Zod 4: dùng z.iso.datetime() (thay cho z.string().datetime() của Zod 3). Phiên bản công cụ ghim ở pnpm-workspace.yaml.
import { z } from 'zod';

import { LyricsRefSchema } from './lyrics'; // Phase 4, xem mục 13.2

export const TrackSchema = z.object({
  id: z.string(),                       // ổn định, xem mục 7.1
  title: z.string(),
  artist: z.string(),
  albumId: z.string().optional(),
  album: z.string().optional(),
  trackNumber: z.number().int().optional(),
  discNumber: z.number().int().optional(),
  year: z.number().int().optional(),
  genre: z.string().optional(),
  duration: z.number(),                 // giây
  file: z.string(),                     // key trong storage, vd "music/a1b2c3d4e5f6.mp3"
  storage: z.enum(['r2']).default('r2'),
  cover: z.string().optional(),         // vd "covers/{albumId}.jpg"
  loudnessLufs: z.number().optional(),  // độ ồn tích hợp (LUFS)
  replayGain: z.number().optional(),    // dB cần chỉnh (thường âm)
  lyrics: LyricsRefSchema.optional(),   // Phase 4
});
export type Track = z.infer<typeof TrackSchema>;

export const AlbumSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  year: z.number().int().optional(),
  cover: z.string().optional(),
  trackIds: z.array(z.string()),        // đã sắp theo số thứ tự bài
  coverVersion: z.string().optional(),  // 8 ký tự đầu của sha1 ảnh bìa, app thêm vào URL để cache tự làm mới khi đổi ảnh
});
export type Album = z.infer<typeof AlbumSchema>;

// Toàn bộ thư viện, sinh bởi indexer
export const LibrarySchema = z.object({
  version: z.literal(1),
  generatedAt: z.iso.datetime(),
  tracks: z.array(TrackSchema),
  albums: z.array(AlbumSchema),
});
export type Library = z.infer<typeof LibrarySchema>;

export const PlaylistSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  trackIds: z.array(z.string()),        // tham chiếu Track.id
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Playlist = z.infer<typeof PlaylistSchema>;

// Dữ liệu người dùng, dùng cho lưu local, xuất/nhập và đồng bộ
export const UserStateSchema = z.object({
  version: z.literal(1),
  updatedAt: z.iso.datetime(),
  playlists: z.array(PlaylistSchema),
  favoriteIds: z.array(z.string()),
});
export type UserState = z.infer<typeof UserStateSchema>;

// Mã lỗi dùng chung: Worker trả về, app đổi thành thông báo tiếng Việt
export const ERROR_CODES = [
  'INVALID_TOKEN',
  'NOT_FOUND',
  'INVALID_ID',
  'VALIDATION_ERROR',
  'PAYLOAD_TOO_LARGE',
  'RANGE_NOT_SATISFIABLE',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// Dữ liệu của GET /api/health (đọc nhanh từ metadata của library.json)
export const HealthSchema = z.object({
  apiVersion: z.string(),
  dataVersion: z.number().int(),
  libraryGeneratedAt: z.iso.datetime().nullable(),
  trackCount: z.number().int().nullable(),
  albumCount: z.number().int().nullable(),
});
export type Health = z.infer<typeof HealthSchema>;

// Response chuẩn cho toàn bộ API JSON
export interface ApiResponse<T> {
  status: number;
  message: string;
  data: T | null;
  error: ErrorCode | null;
}
```

### 7.3. Endpoint

Response JSON luôn theo dạng `{ status, message, data, error }`. `/stream` và `/covers` trả binary nên không theo format này.

| Method | Endpoint | Mô tả | Phase |
|---|---|---|---|
| GET | `/api/library` | Tracks + albums trong **một** request, hỗ trợ `ETag`/`If-None-Match` | 1 |
| GET | `/api/health` | Kiểm tra kết nối và tình trạng dữ liệu (`HealthSchema`). Nhẹ: đọc metadata của `library.json` bằng `head()`, không đọc cả thư viện. Token trong header | 1 |
| GET | `/stream/:id` | Stream audio, hỗ trợ `Range` để tua | 1 |
| GET | `/covers/:albumId` | Ảnh bìa | 1 |
| GET, HEAD | `/lyrics/:id` | Lời bài hát (`text/plain`, UTF-8). Trả bản `manual` nếu có, không thì bản tự động. Header `X-Lyrics-Source`, `X-Lyrics-Format`. 404 nếu không có | 4 |
| PUT | `/lyrics/:id` | Lưu lời do bạn thêm/sửa vào `lyrics-manual/`. **Token trong header**, tối đa 64 KB | 4 |
| DELETE | `/lyrics/:id` | Xoá bản của bạn, quay về bản tự động. **Token trong header** | 4 |
| GET | `/api/lyrics/manual` | Danh sách `id` có bản do bạn thêm/sửa | 4 |
| GET | `/api/state` | Lấy `UserState` | 4 |
| PUT | `/api/state` | Lưu `UserState` (last-write-wins theo `updatedAt`, validate bằng Zod) | 4 |

Với 300-400 bài, `library.json` chỉ khoảng vài trăm KB, nên gộp tracks và albums trong một request là đủ và giảm số lần gọi API.

### 7.4. Tương thích phiên bản dữ liệu

- `library.json` và `state.json` có trường `version`.
- Quy tắc: chỉ thêm trường **tuỳ chọn**, không đổi nghĩa hoặc xoá trường đã có. Bắt buộc phá vỡ tương thích thì mới tăng `version`.
- App gặp `version` lớn hơn mức nó hiểu thì hiện "Cần cập nhật app" và tiếp tục dùng bản cache cũ, **không crash**.
- Ở app, parse chặt với các trường cốt lõi và bỏ qua các trường lạ.

## 8. Cấu trúc monorepo

```
music-app/
├── AGENTS.md                        # Quy tắc cho AI Agent (mục 11.2)
├── docs/
│   ├── PLAN.md                      # Chính là file plan này
│   ├── STATUS.md                    # Tiến độ, Agent cập nhật
│   ├── RUNBOOK.md                   # Sổ tay vận hành cho bạn
│   └── ACCEPTANCE.md                # Checklist nghiệm thu trên iPhone (mục 11.6)
├── apps/
│   ├── mobile/                      # Expo app
│   │   ├── app.config.ts            # 2 biến thể: development / production (mục 12.5)
│   │   ├── app/                     # expo-router (màn hình)
│   │   └── src/
│   │       ├── components/          # Atomic Design: atoms / molecules / organisms
│   │       ├── features/            # library, player, queue, recents, search, albums, playlists, favorites, lyrics, offline, settings
│   │       ├── hooks/
│   │       ├── services/            # apiClient, playerService (bọc thư viện audio), secureStorage
│   │       ├── store/               # playerStore, playlistStore, favoritesStore
│   │       └── utils/               # gainToVolume, buildShuffleOrder (chỉ app dùng)
│   └── api/                         # Cloudflare Worker
│       └── src/
│           ├── routes/              # Controller: library.route, stream.route, state.route
│           ├── services/            # Business logic: libraryService, streamService
│           ├── repositories/        # StorageRepository, R2Repository
│           ├── middlewares/         # auth, error handler
│           └── index.ts
├── tools/
│   ├── indexer/                     # CLI xử lý nhạc
│   │   └── src/
│   │       ├── commands/            # scan, normalize, build-index, upload, sync, ui, backup, restore
│   │       ├── services/            # ffmpegService, metadataService, r2Service, idService, overridesService, coverService, backupService
│   │       ├── server/              # (Phase 4) server local cho dashboard, chỉ bind 127.0.0.1
│   │       └── index.ts
│   ├── dashboard/                   # (Phase 4) Vite + React + TS + Tailwind, build tĩnh do server local phục vụ
│   └── lyrics-py/                   # (Phase 4, tuỳ chọn) Python: căn thời gian/nhận dạng lời
├── packages/
│   └── shared/                      # Mã dùng chung, TypeScript thuần (mục 8.1)
│       └── src/
│           ├── schemas.ts           # Track, Album, Library, Playlist, UserState, ApiResponse (đã có)
│           ├── lyrics.ts            # LyricsRefSchema (đã có)
│           ├── constants.ts         # LYRICS_MAX_BYTES, REPLAYGAIN_TARGET_LUFS, LIBRARY_SCHEMA_VERSION
│           ├── errors.ts            # ERROR_CODES, ErrorCode
│           ├── health.ts            # HealthSchema
│           ├── ids/                 # isValidTrackId, isValidAlbumId
│           ├── text/                # normalizeText, utf8ByteLength
│           ├── format/              # formatTime
│           ├── testing/             # dữ liệu mẫu và bộ tạo thư viện giả, xuất riêng (@music-app/shared/testing)
│           ├── search/              # (Phase 3) buildSearchIndex, searchTracks
│           ├── lrc/                 # (Phase 4) parseLrc, stringifyLrc, detectLyricsFormat, applyOffset, interpolateWordTimes
│           ├── overrides.ts         # (Phase 4) TrackOverrideSchema, OverridesSchema
│           ├── libraryReport.ts     # (Phase 4) LibraryHealthReportSchema
│           └── index.ts
└── .github/workflows/               # ci.yml (Linux, rẻ), build-ios.yml (macOS, chạy tay)
```

### 8.1. Quy tắc mã dùng chung (`packages/shared`)

Nguyên tắc: **mã nào từ hai nơi trở lên cùng dùng thì để ở `packages/shared`, không sao chép.** Mã chỉ một nơi dùng thì ở lại nơi đó.

| Mã dùng chung | Ai dùng | Phase |
|---|---|---|
| Schema Zod, kiểu, `ApiResponse` | app, Worker, indexer, dashboard | Đã có |
| `normalizeText` | indexer (tính `albumId`), app và dashboard (tìm kiếm), tra cứu lời (biến thể bỏ dấu) | 1 |
| `isValidTrackId`, `isValidAlbumId` | Worker (kiểm tra `id` trước khi dựng key), app, indexer | 1 |
| `ERROR_CODES`, `ErrorCode`, `HealthSchema` | Worker (trả lỗi và health), app (đổi mã lỗi thành thông báo tiếng Việt), dashboard | 1 |
| Hằng số `LYRICS_MAX_BYTES`, `REPLAYGAIN_TARGET_LUFS`, `LIBRARY_SCHEMA_VERSION` | Worker và app (giới hạn lời), indexer và dashboard (mức chuẩn) | 1 |
| `utf8ByteLength` | Worker và app (kiểm tra giới hạn 64 KB cùng một cách) | 1 |
| `formatTime` | app, dashboard | 2 |
| Dữ liệu mẫu `library.sample.json`, `generateFakeLibrary(n, seed)` (xuất riêng ở `@music-app/shared/testing`) | Test của app, Worker, indexer, dashboard, và chế độ demo của app | 1 |
| `buildSearchIndex`, `searchTracks` | app, dashboard | 3 |
| `parseLrc`, `stringifyLrc`, `detectLyricsFormat`, `applyOffset`, `interpolateWordTimes` | app (hiển thị, sửa lời), dashboard (trình sửa lời), Worker (kiểm tra nội dung khi lưu) | 4 |
| `TrackOverrideSchema`, `OverridesSchema` | indexer, dashboard | 4 |
| `LibraryHealthReportSchema` | Dashboard (server tạo báo cáo, giao diện hiển thị) | 4 |

**Ở lại nơi dùng, không đưa vào shared:** `gainToVolume` và `buildShuffleOrder` (chỉ app), `mergeOverrides` và `buildAlbums` (indexer), tính `id` bằng băm (indexer, dùng API của Node), `R2Repository` (Worker).

Quy tắc:
1. **TypeScript thuần:** không React, React Native, DOM hay API của Node (`fs`, `path`, `crypto`, `Buffer`). Gói phải chạy được trên Hermes (app), Cloudflare Workers, Node và trình duyệt. Đếm byte UTF-8 bằng `utf8ByteLength` tự viết, không dùng `TextEncoder` hay `Buffer`. Tránh `Intl` (chưa kiểm chứng đầy đủ trên Hermes). Thêm quy tắc ESLint cấm import `node:*`, `fs`, `path`, `crypto` trong `packages/shared`.
2. **Mỗi hàm có test** trong `packages/shared`. Riêng `normalizeText` cần **test "golden"** cố định kết quả cho một danh sách chuỗi tiếng Việt và tiếng nước ngoài, vì `albumId` tính từ nó: đổi cách chuẩn hóa là đổi `albumId` cả thư viện và khoá ảnh bìa, coi như thay đổi phá vỡ tương thích.
3. Gói chỉ phụ thuộc Zod. Thêm dependency vào shared phải hỏi người dùng vì mọi nơi đều bị ảnh hưởng.
4. Xuất qua `src/index.ts`. Nơi dùng import từ `@music-app/shared`, không import đường dẫn sâu. Ngoại lệ: dữ liệu mẫu import từ `@music-app/shared/testing` để không nằm trong bundle production của app. Cách xuất (subpath `exports` hay cách khác) **chưa kiểm chứng** với Metro, Vite và wrangler.
5. Chỉ thêm hàm khi phase tương ứng cần, không viết trước.
6. Thư mục parser LRC đặt tên `lrc/`, không đặt `lyrics/`, để không trùng với file `lyrics.ts` đã có.
7. Hiện gói xuất trực tiếp mã nguồn TypeScript (`main` trỏ tới `src/index.ts`). Dashboard (Vite), Worker (wrangler) và app (Metro) về nguyên tắc dùng được, nhưng **chưa kiểm chứng với Metro trong pnpm workspace**, sẽ rõ khi thêm `apps/mobile` ở spike. Import nội bộ trong gói không có đuôi file, nên indexer phải chạy bằng công cụ như `tsx` chứ không phải Node thuần.

## 9. Chuẩn hóa nhạc (Phase 1)

### 9.1. Dọn metadata bằng `beets`

Sao lưu thư mục nhạc gốc trước, rồi chạy một lần:

```bash
# Nhận diện bài hát qua MusicBrainz, sửa tag, tải ảnh bìa còn thiếu
beet import D:/Music
```

### 9.2. Đo loudness bằng `ffmpeg`

Indexer đo độ ồn từng file, không sửa file gốc:

```ts
// tools/indexer/src/services/ffmpegService.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Mức chuẩn -18 LUFS: đủ thấp để hầu hết bài chỉ cần giảm, không cần tăng
const TARGET_LUFS = -18;

interface LoudnormResult {
  input_i: string; // độ ồn tích hợp (LUFS) dạng chuỗi
}

export async function measureLoudness(filePath: string): Promise<{
  loudnessLufs: number;
  replayGain: number;
}> {
  const { stderr } = await execFileAsync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', filePath,
    '-af', 'loudnorm=print_format=json',
    '-f', 'null', '-',
  ]);

  // ffmpeg in JSON ở cuối stderr, lấy khối {...} cuối cùng
  const match = stderr.match(/\{[\s\S]*\}\s*$/);
  if (!match) throw new Error(`Không đọc được kết quả loudnorm: ${filePath}`);

  const { input_i } = JSON.parse(match[0]) as LoudnormResult;
  const loudnessLufs = Number(input_i);

  return { loudnessLufs, replayGain: TARGET_LUFS - loudnessLufs };
}
```

### 9.3. Áp dụng trong app

Player chỉ cho volume từ 0 đến 1 (không khuếch đại), nên `replayGain` được quy đổi thành volume và chặn ở 1:

```ts
// apps/mobile/src/utils/gainToVolume.ts
// Đổi dB sang hệ số volume tuyến tính, tối đa 1
export function gainToVolume(gainDb: number | undefined): number {
  if (gainDb === undefined) return 1;
  return Math.min(1, Math.pow(10, gainDb / 20));
}
```

Mỗi lần đổi bài, `PlayerService` gọi hàm này và đặt volume cho player. Cú pháp gọi cụ thể **phải lấy theo tài liệu RNTP v5** (`rntp.dev/docs`), không dùng API của v4.

## 10. Bảo mật và biến môi trường

- **Token API nhập trong app** ở màn hình Kết nối lần đầu, lưu bằng `expo-secure-store`. Không nhúng token vào bundle và không cần secret trong GitHub Actions.
- **Token sai hoặc đã đổi:** mọi lỗi `INVALID_TOKEN` (kể cả từ luồng phát nhạc và tải offline) đưa app về màn hình nhập lại token, không crash, giữ nguyên dữ liệu đã cache và playlist. Không thử lại vô hạn.
- Worker chỉ trả **mã lỗi dùng chung** (`ErrorCode`), app tự đổi thành thông báo tiếng Việt.
- **Bucket R2 riêng tư:** chỉ Worker truy cập qua binding. Không bật `r2.dev`, không gắn tên miền công khai. Bucket mới thường mặc định riêng tư, nhưng vẫn phải kiểm tra bằng cách thử mở trực tiếp một file.
- **Nếu token hoặc link stream bị lộ:** đổi token (`docs/RUNBOOK.md` mục 4), xem mức dùng ở Cloudflare, và có luật giới hạn tần suất cho `/stream` và `/covers`. Nâng cấp sau nếu cần: URL ký có hạn (app xin token ngắn hạn qua API, `/stream` chỉ nhận token đó). Chưa làm ngay để giữ MVP gọn.
- Token phía Worker lưu bằng `wrangler secret put API_TOKEN`. Khi cần đổi token thì đổi ở Worker rồi nhập lại trong app.
- `/api/*` dùng header `Authorization: Bearer ...`. Lock screen của iOS không luôn gửi được header tùy chỉnh, nên `/stream` và `/covers` dùng token dạng query (`?t=...`). Muốn chặt hơn thì nâng cấp lên URL ký có hạn.
- R2 credentials (cho indexer) chỉ nằm trong `.env` trên PC của bạn, thêm `.env` vào `.gitignore`, không bao giờ nằm trong app.
- Không hard-code Secret Key, Database URL, API Key ở bất kỳ đâu.
- Dữ liệu vào Worker luôn validate bằng Zod.

## 11. Quy trình làm việc với AI Agent

### 11.1. Phân vai

| Việc | Ai làm |
|---|---|
| Viết code, test, sửa lỗi, cập nhật tài liệu | **Agent** |
| Tạo tài khoản (GitHub, Cloudflare, Apple ID), tạo bucket R2, tạo API token, chạy `wrangler secret put` | **Bạn** (Agent hướng dẫn từng bước) |
| Chạy workflow build, tải `.ipa`, cài bằng Sideloadly | **Bạn** |
| Cắm tai nghe, khoá màn hình, kiểm tra trên iPhone thật | **Bạn** |
| Quét nhạc và upload (`pnpm indexer sync`) | **Bạn** chạy lệnh, Agent viết lệnh |

Agent không thể thử app trên iPhone thật, nên **checklist nghiệm thu** (mục 11.6) là cầu nối: bạn thử, báo kết quả, Agent sửa.

### 11.2. File `AGENTS.md` ở gốc repo

Nội dung thật nằm ở `AGENTS.md` trong bộ kit, không lặp lại ở đây để tránh lệch. Gồm: ngôn ngữ, quy tắc code, ràng buộc build, kiểm tra trước khi báo xong, **vùng cấm** cho Agent và mẫu báo cáo.

### 11.3. Vòng lặp mỗi tính năng

1. **Giao việc** cho Agent theo phase (mục 11.5).
2. Agent code, chạy `typecheck`, `lint`, `test`. Với API thì chạy thêm `wrangler dev` và kiểm tra bằng `curl`.
3. Agent báo cáo theo mẫu ở trên, gồm dòng "có cần build lại không".
4. Nếu **không cần build lại**: chạy `npx expo start --dev-client` trên PC, mở bản dev trên iPhone (cùng Wi-Fi) là thấy thay đổi ngay. Nếu **cần build lại**: chạy workflow build và cài lại (mục 12).
5. Bạn thử trên iPhone theo checklist, báo lại kết quả cho Agent kèm ảnh chụp màn hình hoặc nội dung log.

### 11.4. Cách báo lỗi khi không có Mac/Xcode

- App có **màn hình Debug** (Settings → Debug): hiện mã commit của bản build, danh sách lỗi gần nhất, nút **Copy**. Bạn dán nội dung đó cho Agent.
- Build hỏng trên GitHub: copy phần log lỗi của bước bị đỏ trong tab Actions, hoặc để Agent đọc log bằng GitHub CLI (`gh run view --log-failed`) nếu bạn đã đăng nhập `gh` trên PC.
- Lỗi khi đang chạy `expo start`: copy nội dung terminal.

### 11.5. Cách giao việc

Bạn chỉ cần nói ngắn gọn việc muốn làm (ví dụ "làm Phase 0", hoặc "sửa lỗi này" kèm log từ màn hình Debug). Agent tự đọc `AGENTS.md`, `docs/STATUS.md` và skill phù hợp, không cần prompt dài.

### 11.6. Checklist nghiệm thu trên iPhone (`docs/ACCEPTANCE.md`)

| # | Việc thử | Kỳ vọng |
|---|---|---|
| 1 | Phát một bài, khoá màn hình 10 phút | Nhạc vẫn phát |
| 2 | Xem lock screen và Control Center | Đúng tên bài, ca sĩ, ảnh bìa, thanh tiến trình |
| 3 | Bấm play/pause/next/previous và kéo thanh tiến trình trên lock screen | Đều hoạt động |
| 4 | Tai nghe có dây hoặc Bluetooth: bấm nút play/pause/next | Đều hoạt động |
| 5 | Rút tai nghe khi đang phát | Nhạc tự dừng |
| 6 | Có cuộc gọi hoặc báo thức khi đang phát | Nhạc dừng rồi tiếp tục hợp lý |
| 7 | Bật công tắc im lặng của iPhone | Vẫn có tiếng nhạc |
| 8 | Chuyển sang app khác 30 phút | Hết bài tự sang bài kế |
| 9 | Đổi Wi-Fi sang 4G/5G hoặc mất mạng | Báo lỗi dễ hiểu, tự phục hồi khi có mạng |
| 10 | Tắt hẳn app rồi mở lại | Nhớ hàng đợi và bài đang phát |
| 11 | Phát liên tiếp vài bài âm lượng khác nhau | Âm lượng đều (ReplayGain) |
| 12 | Tìm "son tung" khi bài tên "Sơn Tùng" | Tìm thấy (bỏ dấu) |

## 12. Hướng dẫn cài đặt và dùng trên iPhone

### 12.1. Chuẩn bị một lần

**Tài khoản:** GitHub, Cloudflare, Apple ID. Nên dùng một Apple ID riêng cho việc sideload để tách khỏi Apple ID chính.

**Trên PC Windows:**

| Cần cài | Ghi chú |
|---|---|
| Node.js LTS, pnpm, Git | Để Agent chạy được dự án |
| `ffmpeg` | Đo loudness, chuyển mã |
| Python và `beets` | Chỉ để dọn tag, không cần viết code Python |
| **iTunes và iCloud bản tải từ trang chủ Apple** | **Không dùng bản Microsoft Store**, nếu đã cài thì gỡ trước. Sideloadly cần các thành phần này |
| **Sideloadly** (hoặc AltStore) | Ký và cài `.ipa` bằng Apple ID |

**Trên iPhone:** bật **Developer Mode** (Cài đặt → Quyền riêng tư & Bảo mật → Chế độ nhà phát triển, rồi khởi động lại máy). Cắm cáp vào PC, chọn "Tin cậy máy tính này", mở iTunes một lần để nhận thiết bị.

### 12.2. Cài app lần đầu

1. Trên GitHub, vào tab **Actions** → chọn workflow build iOS → **Run workflow** → chọn biến thể `production` (bản dùng hằng ngày).
2. Chờ build xong. Tải **artifact**, giải nén file `.zip` để lấy file `.ipa`.
3. Mở **Sideloadly**, chọn iPhone, kéo file `.ipa` vào, nhập Apple ID, bấm **Start**. Nên bật tuỳ chọn tự làm mới (auto refresh).
4. Trên iPhone: **Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị** → chọn Apple ID của bạn → **Tin cậy**.
5. Mở app, ở màn hình **Kết nối** nhập Server URL (địa chỉ Worker) và token, bấm Kiểm tra, rồi Lưu.

### 12.3. Dùng hằng ngày

- Mở app, thư viện tự tải, chọn bài là phát. Tắt màn hình nhạc vẫn phát, điều khiển từ lock screen, Control Center hoặc tai nghe.
- **Thêm nhạc mới:** bỏ file vào thư mục nhạc trên PC, chạy `pnpm indexer sync` (dọn tag, đo loudness, upload, cập nhật `library.json`). Trong app kéo xuống để làm mới thư viện.
- **Playlist:** lưu trong app. Vào Settings → Xuất để sao lưu ra file JSON (Phase 3), hoặc dùng Sync (Phase 4).

### 12.4. Gia hạn mỗi 7 ngày (Apple ID miễn phí)

- **Auto refresh:** giữ Sideloadly (hoặc AltServer) chạy trên PC, iPhone cùng Wi-Fi với PC. App được ký lại tự động.
- **Nếu lỡ hết hạn:** app không mở được, chỉ cần cài lại `.ipa` bằng Sideloadly với **cùng bundle ID**, dữ liệu trong app thường được giữ.
- Muốn khỏi phải làm mới hằng tuần thì dùng tài khoản Apple Developer 99 USD/năm (chứng chỉ 1 năm).
- Apple ID miễn phí chỉ cài được tối đa **3 app sideload** cùng lúc. Dự án dùng 2 (bản dev và bản production).

### 12.5. Hai biến thể app: dev và production

| Biến thể | Bundle ID | Mục đích | Build |
|---|---|---|---|
| **Beatify Dev** | `com.<github-username>.beatify.dev` | Thử tính năng, hot reload từ PC | Debug + dev client |
| **Beatify** | `com.<github-username>.beatify` | Dùng hằng ngày, chạy độc lập | Release |

```ts
// apps/mobile/app.config.ts
import type { ExpoConfig } from 'expo/config';

const IS_DEV = process.env.APP_VARIANT === 'development';

const config: ExpoConfig = {
  name: IS_DEV ? 'Beatify Dev' : 'Beatify',
  slug: 'music-app',
  ios: {
    bundleIdentifier: IS_DEV ? 'com.<github-username>.beatify.dev' : 'com.<github-username>.beatify', // thay <github-username>, chốt trước lần cài đầu tiên
    infoPlist: { UIBackgroundModes: ['audio'] }, // bắt buộc để phát nền khi tắt màn hình
  },
};

export default config;
```

Khi chạy `npx expo start --dev-client` trên PC, mở app **Beatify Dev** trên iPhone (cùng Wi-Fi), nhập địa chỉ hoặc quét mã QR là thấy thay đổi code ngay, không cần build lại. Chỉ phải build lại khi thêm thư viện native hoặc đổi cấu hình native.

### 12.6. Chi phí build trên GitHub Actions

- Repo **public**: dùng runner macOS miễn phí, không giới hạn phút. Vì không có secret trong code nên đây là lựa chọn dễ nhất, nhưng mã nguồn sẽ công khai.
- Repo **private** (gói Free): có 2.000 phút mỗi tháng, mà macOS tính hệ số **10 lần**, tương đương khoảng 200 phút build macOS mỗi tháng. Một lần build thường mất vài chục phút (ước lượng, phụ thuộc cache), nên chỉ đủ khoảng vài lần build mỗi tháng.
- Cách tiết kiệm: cache pnpm và CocoaPods, chỉ build khi thay đổi native, dùng hot reload cho phần còn lại.

### 12.7. iPhone 16 chạy iOS 27: những điều cần biết

iOS 27 được giới thiệu tại WWDC ngày 8/6/2026, bản chính thức dự kiến khoảng tháng 9, nên công cụ và thư viện vẫn đang bắt kịp. Nếu máy bạn đang chạy **bản beta** thì rủi ro cao hơn, cần ghi vào `docs/STATUS.md`.

| Vấn đề | Thông tin đã thấy | Cách xử lý |
|---|---|---|
| **UIScene bắt buộc** | App build bằng SDK iOS 27 (Xcode 27) phải dùng vòng đời UIScene, nếu không sẽ không mở đúng trên iOS 27. Đã có báo cáo lỗi: app trống của Expo SDK 56 không khởi chạy khi build bằng Xcode 27 beta, và SDK 57.0.1 hiện màn hình trống trên iOS 27 beta. Điều kiện chỉ áp dụng khi **vừa** build bằng SDK iOS 27 **vừa** chạy trên iOS 27 | **Ghim Xcode 26.x** trên runner để app build bằng SDK iOS 26. Suy luận là app đó vẫn chạy trên iPhone iOS 27, **cần xác nhận ở spike Phase 0** |
| **Chọn Expo SDK** | SDK 57 ổn định (30/6/2026), có hỗ trợ scene tuỳ chọn từ bản 57.0.23. SDK 58 beta (15/9/2026) "built for iOS 27", scene mặc định, dùng React Native 0.88 bản RC | Mặc định **SDK 57 ổn định + Xcode 26.x**. Không dùng SDK 58 beta cho bản dùng hằng ngày. Chuyển SDK 58 khi có bản ổn định, sau khi chạy lại spike |
| **RNTP v5 trên iOS 27** | Chưa kiểm chứng | Spike Phase 0 trên iPhone 16 thật |
| **Sideloadly/AltStore trên iOS 27** | Một bài viết tháng 6 cho biết Developer Mode và ký chứng chỉ vẫn hoạt động. Trang Sideloadly ghi hỗ trợ "iOS 26+ và các bản tương lai". Chưa thấy xác nhận chính thức riêng cho iOS 27 bản chính thức | Thử sớm ở Phase 0. Dự phòng: AltStore hoặc SideStore. Không cập nhật iOS ngay khi vừa có bản mới |
| **Gia hạn không cần PC (tuỳ chọn)** | Theo một bài báo, AltStore Classic 2.3 có Remote AltServer để cài và làm mới không cần máy tính, và trên iOS 27 có thể ghép cặp ngay trên máy (cần Wi-Fi và LocalDevVPN). Chưa kiểm chứng | Có thể thử sau Phase 0 nếu muốn bớt phụ thuộc PC |

**Quy tắc cho Agent:** không đổi Xcode, nhãn runner, Expo SDK hay React Native khi chưa hỏi (đổi tức là phải build lại). Workflow phải chọn Xcode cụ thể theo danh sách phần mềm cài sẵn trên runner (kiểm tra danh sách `runner-images` hiện hành) và in ra `xcodebuild -version` trong log. Trước khi lên Xcode 27 hoặc SDK 58, phải bật scene lifecycle theo tài liệu Expo rồi chạy lại spike.

### 12.8. Cảnh báo sắp hết hạn chứng chỉ ký

Nỗi đau lớn nhất của sideload bằng Apple ID miễn phí là app hết hạn sau 7 ngày thì không mở được. Ý tưởng: Settings hiện "Chứng chỉ còn N ngày", và có biểu ngữ cảnh báo khi còn từ 2 ngày trở xuống.

- Nguồn dữ liệu: file cấu hình ký (`embedded.mobileprovision`) nằm trong gói app, có ngày hết hạn. **Chưa kiểm chứng** app đọc được từ mã JavaScript (đọc file trong thư mục gói app rồi tách trường ngày hết hạn). Sideloadly và AltStore ký lại file này mỗi lần làm mới, nên ngày sẽ được cập nhật.
- Cách làm: **thử ở spike** (ACCEPTANCE P0.8). Đọc được thì làm ở Phase 3, không đọc được thì bỏ và không hiển thị thông tin không chắc chắn (RUNBOOK vẫn nhắc gia hạn bằng tay).
- Hàm tách ngày là hàm thuần `parseProvisioningExpiry(text)` có test với đoạn dữ liệu mẫu. Nếu cần thư viện native thì hỏi trước (phải build lại `.ipa`).

## 13. Lộ trình (chia module)

> **MVP = Phase 0 đến 2.** Phase 3 trở đi chỉ làm sau khi bạn đã dùng thật vài tuần và biết mình còn thiếu gì. Dashboard và lời bài hát là tuỳ chọn. **Đóng băng phạm vi:** không thêm tính năng mới cho đến khi bạn dùng MVP ít nhất hai tuần. Ý tưởng mới ghi vào `docs/IDEAS.md`.

**Phase 0: Nền tảng và spike (làm trước tiên)**
- Khởi tạo monorepo pnpm, `packages/shared`, `AGENTS.md`, `docs/`.
- Workflow GitHub Actions build `.ipa` (có input chọn `development` hoặc `production`).
- **Spike player:** app tối thiểu phát một file MP3 từ URL công khai bằng `@rntp/player`, có lock screen. Build, cài lên iPhone và thử các mục 1-4 của checklist.
- Đọc `rntp.dev/terms` để xác nhận dùng cá nhân được miễn phí. Nếu không ổn, chuyển sang `expo-audio` và thử lại.
- Tạo bucket R2 **ở chế độ riêng tư** (không bật truy cập công khai `r2.dev`, không gắn tên miền công khai), cấu hình `.env`. Xác nhận bằng cách thử mở trực tiếp một file trên R2 không qua Worker và thấy bị từ chối (ACCEPTANCE P1.7).
- Tạo thư mục `builds/known-good/` trên máy (không nằm trong repo) để giữ `.ipa` bản tốt gần nhất, và chạy smoke test (ACCEPTANCE mục S) sau mỗi build.
- **Kiểm tra chuyển bài liền mạch (gapless):** phát hai bài liền nhau trong spike và ghi lại có khoảng lặng hay không (mục 13.3, ACCEPTANCE P0.7).
- **Thử đọc ngày hết hạn chứng chỉ ký** từ file cấu hình nhúng trong app (mục 12.8, ACCEPTANCE P0.8) và ghi kết quả.
- **Tiêu chí xong:** nhạc phát khi khoá màn hình, lock screen đúng thông tin, quy trình build → Sideloadly → mở app đã chạy được.

**Phase 1: Dữ liệu, chuẩn hóa và API**
- Dọn tag bằng `beets`.
- Indexer CLI: quét thư mục → đọc tag → sinh `id` ổn định → đo loudness → tách cover theo album → sinh `library.json` (tracks + albums) → upload R2. Đặt `Album.coverVersion`, và ghi `trackCount`, `albumCount`, `generatedAt` vào metadata của `library.json` trên R2 để `/api/health` đọc nhanh.
- Worker: auth middleware, `/api/library`, `/api/health`, `/stream/:id` (Range), `/covers/:albumId` (kèm `?v=<coverVersion>`), mã lỗi dùng chung (`ErrorCode`), error handler.
- **Chống lạm dụng:** đặt luật giới hạn tần suất cho `/stream` và `/covers` ở Cloudflare (chưa kiểm chứng gói free cho phép bao nhiêu luật) và bật cảnh báo chi phí (mục 10).
- `packages/shared/src/testing/`: dữ liệu mẫu `library.sample.json` và hàm `generateFakeLibrary(n, seed)` (mục 8.1), để test app, Worker, indexer, dashboard mà không cần R2.
- **Tiêu chí xong:** `curl` lấy được `library.json` và `/api/health`, tua bài bằng Range hoạt động.

**Phase 2: MVP app**
- Màn hình Kết nối (kiểm tra bằng `/api/health`, nhập lại token khi gặp lỗi 401), danh sách bài, Now Playing, MiniPlayer, màn hình Hàng đợi.
- Phát nhạc nền, lock screen/Control Center (play, pause, next, prev, seek), ReplayGain. Thanh tiến trình **dạng sóng âm** theo `docs/SCREENS.md` (kéo để tua, chạm để tua, nội suy vị trí cho mượt, trạng thái đang tải, vạch tiến trình ở MiniPlayer, phương án dự phòng dạng trơn khi thiếu dữ liệu sóng).
- Queue, shuffle, repeat, lưu hàng đợi khi tắt app. Shuffle theo đặc tả ở mục 13.3.
- **Tiêu chí xong:** checklist nghiệm thu mục 1-11 đạt.

**Phase 3: Tiện ích**
- Search (bỏ dấu tiếng Việt), Albums, Playlists, Favorites. Nghe gần đây.
- Cache thư viện để mở app nhanh và xem được khi offline.
- Xuất/nhập playlist ra JSON, màn hình Debug. Cảnh báo sắp hết hạn chứng chỉ trong Settings (chỉ làm nếu spike xác nhận đọc được).
- **Tiêu chí xong:** checklist mục 12 đạt, tạo và phát playlist bình thường.

**Phase 4: Nâng cao (tùy chọn)**
- Sync `state.json` qua Worker, sleep timer.
- **Nghe offline** (mục 13.4): tải bài, album, playlist, yêu thích, có tuỳ chọn chỉ tải qua Wi-Fi.
- Script Python phân tích BPM/key và gợi ý bài tương tự (nếu cần).
- **Dashboard local** (mục 13.1): chỉ bắt đầu sau khi Phase 3 đạt nghiệm thu và người dùng đồng ý. Gồm sức khoẻ thư viện, gộp nghệ sĩ, quản lý ảnh bìa, lịch sử chỉnh sửa và sao lưu. Có cả trang Nhập nhạc (kéo thả).
- **Lời bài hát** (mục 13.2): bắt đầu bằng L0 (đo độ phủ), các bước Python là tuỳ chọn.

### 13.1. Dashboard local (Phase 4, hướng C)

**Điều kiện bắt đầu:** Phase 3 đạt nghiệm thu và người dùng đồng ý làm.

**Mục tiêu:** quản lý thư viện bằng giao diện web chạy tại `http://127.0.0.1:<port>` trên PC, dùng lại code của indexer. Không đưa lên internet.

```
Trình duyệt (PC) ──► http://127.0.0.1:4173 ──► Server local (Hono, trong tools/indexer)
                                               ├─ dùng lại services: scan, ffmpeg, id, r2, library builder
                                               ├─ đọc/ghi: .state/, overrides.json
                                               └─ R2 qua S3 API (credentials chỉ nằm ở server)
```

Lệnh `pnpm indexer ui` khởi động server, in URL kèm token phiên và mở trình duyệt. Giao diện là một app Vite build tĩnh trong `tools/dashboard/dist`, server local phục vụ file tĩnh và API dưới tiền tố `/local-api`.

**Mã dùng chung:** dashboard import từ `@music-app/shared` (`normalizeText`, `searchTracks`, `formatTime`, `parseLrc`, `stringifyLrc`, `applyOffset`, `interpolateWordTimes`, `OverridesSchema`), **không viết lại** các hàm này. Xem mục 8.1.


**Tính năng, xếp theo ưu tiên:**

| # | Tính năng | Mô tả |
|---|---|---|
| 1 | Thư viện | Bảng bài hát, tìm bỏ dấu, sắp xếp, lọc "thiếu ảnh bìa", "thiếu tag", "nghi trùng" |
| 2 | **Nhập nhạc** | Kéo thả file hoặc thư mục vào trang, xem trước (tag, trùng lặp, lỗi), sửa tag ngay trong bảng, rồi chép vào `MUSIC_IMPORT_DIR`. Chỉ **thêm file mới**, không ghi đè hay xoá gì. Có tuỳ chọn nhập từ link tải trực tiếp (làm sau cùng) |
| 3 | Sửa metadata không phá huỷ | Sửa title, artist, albumArtist, album, số thứ tự, năm, genre, ẩn bài. Lưu vào `overrides.json`, **không sửa file nhạc gốc** |
| 4 | **Sức khoẻ thư viện** | Trang tổng hợp: thiếu ảnh bìa, thiếu tag (title, artist, album), nghi trùng, loudness bất thường, bitrate thấp (dưới 128 kbps), file không đọc được, chưa có lời, ảnh bìa tuỳ chỉnh bị mồ côi. Mỗi mục có số lượng, danh sách và nút mở trình sửa hoặc ẩn bài |
| 5 | **Nghệ sĩ (gộp tên)** | Liệt kê tên nghệ sĩ và số bài, gợi ý các tên giống nhau sau khi bỏ dấu và chữ hoa, chọn nhiều tên rồi gộp thành một tên chuẩn (lưu ở `artistAliases`). Xem trước danh sách bài bị ảnh hưởng |
| 6 | **Ảnh bìa** | Lưới ảnh bìa theo album, lọc thiếu bìa hoặc ảnh nhỏ, thay bằng ảnh tải lên, chọn ảnh khác nhúng trong file, gỡ ảnh tuỳ chỉnh |
| 7 | Xem trước khi sync | Danh sách bài mới, đổi tên/di chuyển, sắp bị loại, lỗi, cảnh báo trùng. Bấm áp dụng mới upload |
| 8 | Thống kê | Số bài, số album, tổng dung lượng, ước tính so với 10GB của R2, phân bố loudness |
| 9 | Chạy sync | Nút chạy và xem tiến trình, log theo thời gian thực (SSE) |
| 10 | **Lịch sử chỉnh sửa** | Giữ 20 bản `overrides.json` gần nhất, xem khác biệt, khôi phục một bản |
| 11 | **Sao lưu** | Nút gom dữ liệu vào `backups/` (cùng lệnh `pnpm indexer backup`), xem danh sách bản sao lưu |
| 12 | Playlist editor (tuỳ chọn, làm sau cùng) | Soạn playlist trên màn hình lớn qua `state.json`, last-write-wins theo `updatedAt` |

**Overrides (gộp không phá huỷ):**

```ts
// packages/shared/src/overrides.ts
import { z } from 'zod';

export const TrackOverrideSchema = z
  .object({
    title: z.string().optional(),
    artist: z.string().optional(),
    albumArtist: z.string().optional(),
    album: z.string().optional(),
    trackNumber: z.number().int().optional(),
    discNumber: z.number().int().optional(),
    year: z.number().int().optional(),
    genre: z.string().optional(),
    hidden: z.boolean().optional(), // ẩn khỏi thư viện trong app
  })
  .strict();

export const OverridesSchema = z.object({
  version: z.literal(1),
  updatedAt: z.iso.datetime(),
  tracks: z.record(z.string(), TrackOverrideSchema), // key là Track.id
  artistAliases: z.record(z.string(), z.string()).default({}), // key = normalizeText(tên biến thể), value = tên chuẩn
  albumCovers: z.record(z.string(), z.string()).default({}),   // key = albumId, value = tên file ảnh trong covers-override/
});
export type Overrides = z.infer<typeof OverridesSchema>;
```

Thứ tự gộp khi build: **tag đọc từ file → overrides từng bài → gộp nghệ sĩ (`artistAliases`) → album và `albumId` tính lại → ảnh bìa tuỳ chỉnh (`albumCovers`) → `library.json`**. Playlist tham chiếu `trackIds` nên không bị ảnh hưởng khi `albumId` đổi. `overrides.json` được sao lưu lên R2 tại `_meta/overrides.json`, giống `index-state.json`.

- **Gộp nghệ sĩ:** khoá là `normalizeText(tên biến thể)`, giá trị là tên chuẩn. Áp dụng cho `artist` và `albumArtist`, so khớp cả chuỗi (chưa xử lý dạng "A feat. B").
- **Ảnh bìa tuỳ chỉnh:** file ảnh lưu ở `tools/indexer/.state/covers-override/`. Indexer dùng ảnh này trước, rồi mới tới ảnh nhúng, resize tối đa 600 px, JPEG. `Album.coverVersion` tính từ nội dung ảnh. Khi đổi album/nghệ sĩ làm `albumId` đổi, dashboard tự chuyển khoá `albumCovers` sang `albumId` mới, và báo ảnh mồ côi ở trang Sức khoẻ thư viện.
- **Lịch sử:** trước mỗi lần ghi `overrides.json`, chụp bản cũ vào `tools/indexer/.state/overrides-history/`, giữ 20 bản gần nhất, ghi nguyên tử.

**Nhập nhạc (chi tiết):** trang "Nhập nhạc" là cách thêm nhạc mới ngay trong dashboard, thay cho việc tự chép file vào thư mục nhạc. Lệnh tương đương: `pnpm indexer import <file hoặc thư mục>`, dashboard gọi cùng mã.

1. **Kéo thả** file hoặc cả thư mục (hoặc bấm chọn file) vào trang. File được đưa lên server local và **chỉ nằm ở thư mục tạm** `tools/indexer/.state/import-staging/<mã lô>/`, chưa đụng tới thư mục nhạc.
2. **Phân tích và xem trước:** với từng file, server đọc tag, tính `sha1` (cũng là `id` của bài) và so với thư viện hiện có.

| Trạng thái | Ý nghĩa |
|---|---|
| Mới | Chưa có trong thư viện |
| Trùng | Cùng `sha1` với bài đã có, mặc định bỏ qua |
| Nghi trùng | Cùng tên bài và nghệ sĩ, thời lượng lệch không quá 2 giây. Mặc định bỏ qua, bạn có thể chọn vẫn thêm |
| Lỗi | Không đọc được, không phải file nhạc, quá lớn |
| Cảnh báo | Thiếu tag, bitrate dưới 128 kbps, không có ảnh bìa |

   Có thể **sửa tag ngay trong bảng xem trước**: lưu thành override theo `id`, không ghi vào file nhạc.
3. **Xác nhận:** chọn thư mục đích (mặc định `MUSIC_IMPORT_DIR`, tức `<MUSIC_SOURCE_DIR>/_imported/<năm-tháng>/`), giữ tên gốc hoặc đổi thành `Nghệ sĩ - Tên bài`. Chỉ **thêm file mới**: ghi vào file tạm rồi đổi tên, **không ghi đè** (trùng tên thì thêm hậu tố), không xoá, không sửa file có sẵn.
4. **Xem trước đồng bộ:** sau khi chép, dashboard mở sẵn phần xem trước đồng bộ (tính năng 7). Upload lên R2 chỉ xảy ra khi bạn bấm áp dụng ở đó.
5. **Hoàn tác:** trước khi áp dụng đồng bộ, bấm hoàn tác lô để xoá đúng những file lô đó đã chép (kiểm tra `sha1` còn khớp, hỏi xác nhận). Sau khi đã đồng bộ thì dùng "ẩn bài" thay vì xoá file.
6. **Lịch sử nhập:** mỗi lô lưu `manifest` vào `tools/indexer/.state/import-history/` (nằm trong sao lưu).

**Nhập từ link tải trực tiếp (tuỳ chọn, làm sau cùng):** dán link tới **file nhạc** (`.mp3`, `.m4a`, `.flac`, `.wav`) mà bạn có quyền dùng, ví dụ file bạn tự lưu trữ hoặc nhạc Creative Commons. Server tải về thư mục tạm rồi đi qua cùng luồng xem trước ở trên. **Không hỗ trợ** link trang web, trang video hay dịch vụ streaming: nếu phản hồi là trang HTML hoặc không giải mã được thành âm thanh thì báo "Đây không phải file nhạc trực tiếp" và dừng. Không có bộ trích xuất riêng cho từng trang web.

Trang nhắc **"chỉ nhập nhạc bạn có quyền sử dụng"** ở lần đầu mở. Đây là **ngoại lệ duy nhất** cho quy tắc "không ghi vào thư mục nhạc" của Agent (xem `AGENTS.md`).

**Bảo mật riêng cho nhập nhạc** (bổ sung cho các quy tắc bên dưới):
- Kiểm tra loại file bằng **nội dung** (đọc bằng bộ đọc tag và âm thanh), không tin đuôi file hay `Content-Type` do client gửi.
- Giới hạn kích thước mỗi file (mặc định 300 MB), số file và tổng dung lượng mỗi lô (mặc định 500 file, 5 GB), kiểm tra dung lượng đĩa trống. Nhận dữ liệu theo luồng, không đọc cả file vào bộ nhớ.
- Tên file từ client **không bao giờ** được dùng làm đường dẫn: server tự đặt tên tạm, rồi tạo tên đích sạch (loại ký tự cấm của Windows và `..`, bỏ khoảng trắng đầu cuối, giữ dấu tiếng Việt, chuẩn hóa NFC, giới hạn độ dài đường dẫn).
- Dọn thư mục tạm của lô bị bỏ dở (quá 24 giờ) khi khởi động.
- Nhập từ link: chỉ `http` và `https`, phân giải tên miền rồi **chặn địa chỉ nội bộ** (loopback, mạng riêng, link-local), kể cả sau mỗi lần chuyển hướng. Tối đa 3 lần chuyển hướng, có thời gian chờ và giới hạn kích thước, không gửi cookie hay thông tin đăng nhập.

**Bảo mật (bắt buộc, vì server này ghi được file và upload R2):**
- Chỉ bind `127.0.0.1`, không bao giờ `0.0.0.0`. Điện thoại cùng Wi-Fi không truy cập được.
- Token phiên ngẫu nhiên mỗi lần chạy, in ra terminal, mọi request phải kèm token.
- Kiểm tra header `Host` và `Origin`, chống trang web khác gọi vào `localhost` và tấn công DNS rebinding. Không bật CORS rộng.
- Client chỉ gửi `id`, server tự dựng đường dẫn và kiểm tra nằm trong `MUSIC_SOURCE_DIR`. Không nhận đường dẫn tuỳ ý.
- Không trả secret R2 về trình duyệt. Mọi input validate bằng Zod.

**Tiêu chí xong:**
- Sửa tên bài trong dashboard, chạy sync, kéo làm mới trong app thì thấy tên mới.
- Chạy lại `beets` hoặc `sync` không làm mất chỉnh sửa.
- Xem trước sync liệt kê đúng bài mới/đổi tên/sắp loại và không upload gì trước khi bạn bấm áp dụng.
- Không truy cập được dashboard từ điện thoại trong cùng Wi-Fi.

### 13.2. Lời bài hát (Phase 4)

**Bối cảnh:** thư viện gồm cả **nhạc Việt và nhạc nước ngoài**. Độ phủ của nguồn tra cứu với nhạc Việt và chất lượng nhận dạng tiếng Việt được hát **chưa được kiểm chứng**, nên bắt đầu bằng đo thử, không quyết định trước.

**Điều kiện bắt đầu:** Phase 3 đạt nghiệm thu và người dùng đồng ý.

| Bước | Nội dung | Ngôn ngữ | Ghi chú |
|---|---|---|---|
| **L0** | Đo độ phủ: lấy khoảng 30 bài (nửa Việt, nửa ngoại), tra LRCLIB, báo tỷ lệ có lời có timestamp / chỉ lời thường / không có, theo từng nhóm ngôn ngữ | TypeScript | Làm đầu tiên |
| **L1** | Tra cứu thật: file `.lrc` cạnh file nhạc → tag nhúng → LRCLIB. Lưu `lyrics/{id}.lrc` hoặc `.txt`, Worker `/lyrics/:id`, app hiển thị lời đồng bộ | TypeScript | Luôn làm |
| **L1b** | Tô dần từng chữ theo nhạc bằng nội suy (mức 2), xem bên dưới | TypeScript | Làm cùng hoặc ngay sau L1 |
| **L2** | **Thêm và sửa lời ngay trong app:** dán lời, sửa chữ, chỉnh lệch thời gian, chạm để đồng bộ. Lưu ở `lyrics-manual/` | TypeScript | Theo yêu cầu của bạn, làm sau L1 |
| **L2b** | Trình sửa lời nâng cao trong dashboard trên PC (bảng dòng và mốc thời gian, danh sách cần duyệt) | TypeScript | Tuỳ chọn |
| **L3** | Căn thời gian cho bài chỉ có lời thường (forced alignment bằng Whisper) | Python | Tuỳ chọn |
| **L4** | Nhận dạng lời từ giọng hát (Demucs tách giọng + Faster-Whisper) cho bài không có lời | Python | Tuỳ chọn, chỉ khi thử nghiệm cho thấy đáng làm |

**Cách quyết định sau L0** (gợi ý, bạn chốt):
- Nhạc ngoại phủ cao thì L1 đã đủ cho nhóm này.
- Nhạc Việt phủ thấp thì cân nhắc L3/L4 cho nhóm Việt, nhưng **thử trên khoảng 10 bài Việt** trước và tự nghe, đọc để đánh giá. Nếu sai nhiều thì chấp nhận không có lời, hoặc soạn tay bằng dashboard cho các bài yêu thích.

**Mô hình dữ liệu** (thêm vào `packages/shared`):

```ts
// packages/shared/src/lyrics.ts
import { z } from 'zod';

export const LyricsRefSchema = z.object({
  file: z.string(),                       // "lyrics/{id}.lrc" hoặc "lyrics/{id}.txt"
  format: z.enum(['lrc', 'elrc', 'txt']), // lrc = mốc theo dòng, elrc = mốc theo từng chữ, txt = lời thường
  source: z.enum(['sidecar', 'embedded', 'lrclib', 'aligned', 'asr', 'manual']),
  language: z.string().optional(),        // 'vi', 'en', ...
  reviewed: z.boolean().default(false),
});
export type LyricsRef = z.infer<typeof LyricsRefSchema>;
```

`TrackSchema` có thêm trường `lyrics: LyricsRefSchema.optional()`.

**Quy tắc chính:**
- Lời **không nằm trong `library.json`** (400 bài × vài KB làm file nặng). App tải theo từng bài khi mở màn hình lời và cache lại.
- Lời lưu UTF-8, chuẩn hóa NFC để giữ đúng dấu tiếng Việt.
- Bài có `source: 'manual'` hoặc `reviewed: true` **không bao giờ bị pipeline ghi đè**.
- Lưu cả kết quả "không tìm thấy" để không hỏi lại mỗi lần sync, có lệnh `--retry-missing`.
- **File `.lrc` cạnh file nhạc** (cùng tên, đuôi `.lrc`, hoặc `.txt`): nguồn ưu tiên cao nhất vì do bạn cung cấp, `source: 'sidecar'`, coi như đã duyệt. Đọc UTF-8 (chấp nhận BOM) và UTF-16 có BOM. Không giải mã được thì bỏ qua và báo cảnh báo, **không đoán bảng mã**. File đổi thì lần `sync` sau cập nhật `lyrics/{id}`. Bản trong `lyrics-manual/` luôn thắng.
- Tra cứu LRCLIB phải nhẹ nhàng: gửi `User-Agent` nhận diện app, giới hạn tốc độ, retry có backoff. Với nhạc Việt có thể thử thêm biến thể bỏ dấu nhưng phải kiểm tra độ lệch thời lượng để tránh gán nhầm bài. Kết quả không chắc chắn đánh dấu `reviewed: false` để duyệt trong dashboard.
- Python (L3/L4) đặt ở `tools/lyrics-py/`, giao tiếp bằng file JSON, TS validate kết quả bằng Zod. `language` do TS truyền vào từng bài, không để mô hình tự nhận diện (dễ nhầm ở bài Việt pha tiếng Anh).
- Tốc độ nhận dạng phụ thuộc phần cứng (có card NVIDIA thì nhanh hơn nhiều). Chưa có số đo trên máy của bạn, cần đo trên 3-5 bài trước khi chạy cả thư viện.

**Trong app:** module Lyrics hiển thị trong Now Playing. Lời có mốc thời gian thì tô sáng dòng đang hát, tự cuộn và chạm để tua. Lời thường thì cuộn tay. Bài không có lời thì báo thân thiện. Parser LRC là hàm thuần có test. Parser LRC và hàm nội suy nằm ở `packages/shared/src/lrc/` để app, dashboard và Worker dùng chung.

**Thêm và sửa lời (bạn tự làm):** bạn có thể thêm lời cho bài chưa có, hoặc sửa lời hiện có, ngay trong app, không cần PC.

| Cách | Mô tả | Làm ở |
|---|---|---|
| Dán lời | Dán lời thường hoặc nội dung file `.lrc` vào ô soạn thảo, có xem trước | App |
| Sửa chữ | Sửa từng dòng của lời hiện có (đúng chính tả, dấu tiếng Việt), giữ nguyên mốc thời gian | App |
| Chỉnh lệch | Kéo lời sớm hoặc muộn cả bài (±0,5 giây mỗi lần bấm), lưu thành thẻ `[offset:]` chuẩn của LRC | App |
| Chạm để đồng bộ | Nghe bài, chạm mỗi khi bắt đầu một dòng, app ghi mốc thời gian rồi cho chỉnh lại từng dòng | App (làm sau cùng) |
| Trình sửa nâng cao | Bảng dòng/mốc thời gian trên màn hình lớn, danh sách "cần duyệt" | Dashboard (L2b) |

Quy tắc dữ liệu:
- Bản của bạn lưu ở `lyrics-manual/{id}.lrc|elrc|txt` trên R2. **Indexer và script Python không bao giờ ghi hoặc xoá thư mục này**, nên tra cứu lại hay chạy `sync` không thể ghi đè lời của bạn.
- `GET /lyrics/:id` ưu tiên bản của bạn, nếu không có mới trả bản tự động.
- Sửa lời tự động là **sao chép thành bản của bạn rồi sửa**. Có nút "Khôi phục bản gốc" để xoá bản của bạn.
- App không ghi vào `library.json` (do indexer sở hữu), nên không có hai nơi cùng ghi một file. Trạng thái "có bản của bạn" lấy từ `GET /lyrics/:id` và `GET /api/lyrics/manual`.
- Thao tác ghi (`PUT`, `DELETE`) chỉ nhận token qua **header**, không nhận qua query. Nội dung tối đa 64 KB, chuẩn hóa NFC (giữ dấu tiếng Việt), validate bằng Zod.
- Lỗi mạng khi lưu: giữ bản nháp trong app để lưu lại, không mất chữ đã gõ.
- Sao lưu: `pnpm indexer backup --only lyrics-manual` tải toàn bộ `lyrics-manual/` về `backups/` trên PC.

**Tô dần theo nhạc (karaoke):** 3 mức, chọn theo dữ liệu có sẵn.

| Mức | Hiển thị | Dữ liệu cần | Ghi chú |
|---|---|---|---|
| 1 | Tô sáng cả **dòng** đang hát, tự cuộn | Lời theo dòng (`lrc`) | Mặc định, có từ L1 |
| 2 | **Tô dần từng chữ** trong dòng đang hát | Lời theo dòng. App **nội suy** thời gian từng chữ giữa mốc bắt đầu dòng và mốc dòng kế | Không cần dữ liệu thêm. Tiếng Việt mỗi chữ thường là một âm tiết nên chia theo khoảng trắng khá tự nhiên (chưa kiểm chứng). Có thể lệch ở đoạn ngân dài hoặc nghỉ giữa dòng |
| 3 | Tô đúng **từng chữ theo giọng hát** | Mốc thời gian thật từng chữ, định dạng LRC mở rộng có thẻ `<mm:ss.xx>` trong dòng (`elrc`) | Theo những gì mình thấy, nguồn tra cứu chỉ có lời thường và lời theo dòng nên đừng mong có sẵn. Nguồn khả dĩ: căn thời gian từng chữ bằng Python (L3, chất lượng với tiếng Việt chưa kiểm chứng) hoặc bạn tự đồng bộ |

Cách vẽ: mỗi chữ là một thành phần `Text` riêng, đổi màu khi tới mốc của chữ đó (thuần JS, **không cần build lại**). Muốn "quét màu mượt" trong từng chữ thì cần thêm thư viện native (masked view) và build lại, chỉ làm khi bạn yêu cầu. Vị trí phát được nội suy cục bộ giữa các lần player báo tiến trình để chữ đổi màu đều tay, và ngừng cập nhật khi app ở nền. Có công tắc bật/tắt mức 2 trong Settings.

**Bản quyền:** lời bài hát có bản quyền. Chỉ dùng cho thư viện cá nhân, lưu trong bucket riêng có token, không chia sẻ công khai và không đăng lên dịch vụ công cộng. Đây không phải tư vấn pháp lý.

**Tiêu chí xong:**
- L0: có báo cáo tỷ lệ phủ theo từng nhóm ngôn ngữ.
- L1: bài có lời hiển thị đồng bộ trên iPhone, bài không có lời hiển thị thông báo, lời sửa tay không bị ghi đè khi chạy lại `sync`.
- L1b: chữ trong dòng đang hát đổi màu đều theo nhạc, không giật, tua bài không bị tô sai.
- L2: thêm được lời cho bài chưa có, sửa được lời hiện có, chỉnh lệch thời gian, khôi phục được bản gốc, chạy lại `sync` không làm mất lời đã sửa.
- L3/L4 (nếu làm): kết quả thử trên 10 bài Việt và 10 bài ngoại đã được bạn đánh giá.
- Tính năng hiển thị lời chỉ là JS/TS nên **không cần build lại `.ipa`**.

### 13.3. Phát nhạc mượt và shuffle

Hiện trạng trước v1.6: plan có ReplayGain (âm lượng đều giữa các bài) và shuffle/repeat sơ lược, chưa có gapless hay crossfade.

| Tính năng | Mô tả | Khả thi | Phase |
|---|---|---|---|
| Âm lượng đều | ReplayGain, đã có | Có | 1-2 |
| **Gapless** | Hai bài liền nhau không có khoảng lặng | Phụ thuộc thư viện audio và thông tin gapless trong file. **Chưa kiểm chứng với RNTP v5**, nên kiểm tra ở spike | 0 (kiểm tra) |
| **Crossfade** | Bài cũ nhỏ dần, bài mới lớn dần, chồng nhau 2-8 giây | Cần hai luồng âm thanh cùng lúc, đổi thông tin lock screen đúng lúc, chạy khi tắt màn hình. RNTP là một hàng đợi trong một player nên có thể không hỗ trợ sẵn. Rủi ro trung bình đến cao, **chưa kiểm chứng** | 4, thử nghiệm |
| Bỏ khoảng lặng đầu/cuối bài | Indexer đo đoạn lặng (`ffmpeg silencedetect`), app nhảy qua | Nhẹ nhưng phụ thuộc độ chính xác khi tua lúc bắt đầu bài | 4, tuỳ chọn |
| Mix kiểu DJ (khớp nhịp, khớp giọng) | Cần BPM, key và kéo giãn thời gian khi phát | Rất phức tạp | **Không làm** |

**Quyết định:**
1. Spike Phase 0 thêm bài thử gapless: phát hai bài liền nhau (một MP3, một M4A nếu có) và nghe có khoảng lặng không. Kết quả là dữ liệu để quyết định, ghi vào `STATUS.md`. Nếu có khoảng lặng đáng kể thì cân nhắc đổi định dạng hoặc cấu hình theo tài liệu thư viện, rồi đo lại.
2. Crossfade chỉ làm khi bạn thấy thật sự cần sau khi dùng thực tế, và bắt đầu bằng một thử nghiệm nhỏ trên iPhone thật (hai bài, chồng 4 giây, khoá màn hình). Mặc định tắt.
3. Không làm mix kiểu DJ.

**Đặc tả shuffle (Phase 2):**
1. Thứ tự phát **tính trước** cho cả hàng đợi (Fisher-Yates), bài đang phát giữ ở đầu. Không chọn ngẫu nhiên lúc hết bài, vì cần biết bài kế để tải trước, hiện trên lock screen và để gapless/crossfade hoạt động.
2. **Không lặp bài** đến khi hết vòng. Sang vòng mới, bài đầu tiên khác bài cuối của vòng trước.
3. Nút Previous quay lại **bài đã nghe** (lịch sử), không phải bài đứng trước trong thứ tự shuffle.
4. Bật shuffle khi đang phát: giữ bài hiện tại, xáo phần còn lại. Tắt shuffle: quay về thứ tự gốc và tiếp tục từ bài đang phát.
5. Bài bạn chèn ("Phát tiếp theo", "Thêm vào cuối") giữ nguyên vị trí, không bị xáo lại.
6. Tuỳ chọn "Tránh cùng nghệ sĩ liền nhau" (mặc định bật, làm hết sức có thể).
7. Áp dụng cho toàn thư viện ("Phát ngẫu nhiên"), album, playlist, yêu thích.
8. Lưu trạng thái shuffle, thứ tự, vị trí và lịch sử vào MMKV, khôi phục khi mở lại app.
9. Viết thành **hàm thuần** `buildShuffleOrder(trackIds, currentId, options, rng)`, `rng` truyền vào để test ổn định.
10. Phase 4 (tuỳ chọn): shuffle thông minh, ưu tiên bài yêu thích và ít nghe gần đây.

### 13.4. Nghe offline (Phase 4)

**Điều kiện bắt đầu:** MVP (Phase 0 đến 2) đạt và bạn đồng ý. Nên làm khi bạn hay nghe ở nơi mạng yếu hoặc muốn tránh dùng dữ liệu di động.

| Tính năng | Mô tả |
|---|---|
| Tải bài, album, playlist, yêu thích | Nút tải ở từng bài và từng danh sách, có "Tải tất cả yêu thích" |
| **Chỉ tải qua Wi-Fi** | Tuỳ chọn trong Settings, **mặc định bật** |
| Quản lý tải | Tiến trình, tạm dừng, tiếp tục, huỷ, thử lại |
| Quản lý dung lượng | Tổng dung lượng đã tải, xoá từng bài, xoá tất cả, giới hạn tuỳ chọn (không giới hạn, 2, 5, 10 GB) |
| Nghe offline | Bài đã tải tự phát từ file trên máy. Lời và ảnh bìa của bài đã tải xem được khi không có mạng |

**Chỉ tải qua Wi-Fi hoạt động thế nào:**
- Đang dùng dữ liệu di động mà tuỳ chọn bật thì **không bắt đầu tải**, hàng đợi hiện "Đang chờ Wi-Fi" và tự tiếp tục khi có Wi-Fi. Đang tải mà chuyển sang dữ liệu di động thì dừng ngay, giữ phần đã tải.
- Tắt tuỳ chọn thì cho tải qua di động sau khi hiện xác nhận có tổng dung lượng ước tính.
- Tuỳ chọn chỉ áp dụng cho việc tải. Nghe stream bình thường không bị ảnh hưởng.
- Điểm phát Wi-Fi (hotspot) có thể bị nhận nhầm là Wi-Fi thường. Settings ghi chú điều này.

**Lưu trữ:** file trong thư mục `offline/` của app, tên `{id}.{ext}`. Chỉ lưu tên file, không lưu đường dẫn tuyệt đối. Chỉ mục trong MMKV, tải vào file `.part` rồi kiểm tra kích thước mới đổi tên. Kiểm tra dung lượng trống trước khi tải. Khi thư viện có bản mới của bài (đổi ETag), đánh dấu "có bản mới" và chỉ tải lại khi bạn cho phép.

**Chưa kiểm chứng, cần thử nhỏ trước khi làm (ghi vào bảng giả định):**
1. Thư viện audio phát được từ file cục bộ.
2. Tải có tiếp tục khi tắt màn hình hay không. Nếu không, **chỉ đảm bảo tải khi app đang mở** và app ghi rõ.
3. Nhận biết đúng Wi-Fi và dữ liệu di động bằng thư viện mạng của Expo. Đây có thể là thư viện native, cần hỏi trước và build lại `.ipa`.

**Tiêu chí xong:** ACCEPTANCE mục G đạt.

## 14. Rủi ro cần biết

| Rủi ro | Cách xử lý |
|---|---|
| Giấy phép RNTP v5 (thương mại, cá nhân miễn phí theo README) có thể đổi | Đọc `rntp.dev/terms` ở Phase 0. `PlayerService` bọc thư viện nên chuyển sang `expo-audio` chỉ ảnh hưởng một chỗ |
| Thư viện native không tương thích khi nâng cấp Expo/React Native | Khoá phiên bản, chạy `npx expo-doctor`, không nâng cấp nếu không cần |
| Agent không thử được trên iPhone thật | Checklist nghiệm thu, màn hình Debug, Phase 0 spike |
| Apple ID miễn phí hết hạn sau 7 ngày, tối đa 3 app | Auto refresh bằng Sideloadly/AltServer, hoặc lên tài khoản Developer 99 USD/năm |
| Hết phút macOS trên GitHub Actions (repo private) | Dùng repo public, cache, hot reload để giảm số lần build |
| Cloudflare đổi điều kiện free hoặc chi phí vượt free | Đặt cảnh báo chi phí, giảm dung lượng bằng chuyển mã, có `StorageRepository` để đổi nơi lưu |
| `beets` sửa nhầm tag | Sao lưu thư mục nhạc gốc trước, xem lại ở bước xác nhận |
| Mất nhạc gốc | Giữ bản sao trên PC hoặc ổ ngoài, không xem R2 là nơi duy nhất |
| Mất playlist khi gỡ và cài lại app | Xuất JSON định kỳ (Phase 3), Sync (Phase 4) |
| Dashboard local bị trang web khác gọi vào `localhost` | Chỉ bind `127.0.0.1`, token phiên, kiểm tra `Host`/`Origin` (mục 13.1) |
| Dashboard làm chậm việc kiểm chứng player | Chỉ bắt đầu sau Phase 3, cần người dùng đồng ý |
| LRCLIB phủ ít nhạc Việt | Đo ở bước L0 trước, sau đó mới quyết định làm L3/L4 hoặc soạn tay |
| AI nhận dạng sai lời tiếng Việt | Thử trên 10 bài trước, kết quả AI luôn `reviewed: false` và cần duyệt, không tự ghi đè lời đã duyệt |
| Nhận dạng lời chạy quá lâu trên CPU | Đo 3-5 bài trước khi chạy cả thư viện, chạy tiếp được khi bị ngắt |
| Lời bài hát có bản quyền | Chỉ dùng cá nhân, bucket riêng có token, không chia sẻ hay đăng lên dịch vụ công cộng |
| Không có mốc thời gian theo từng chữ cho nhạc Việt | Dùng nội suy (mức 2). Mốc thật (mức 3) chỉ khi có nguồn hoặc bạn tự đồng bộ |
| Chữ đổi màu giật hoặc tốn pin trên bài dài | Nội suy vị trí cục bộ, chỉ dựng lại chữ đổi trạng thái, ngừng cập nhật khi ở nền, kiểm tra bằng bài dài |
| Lời sửa tay bị mất hoặc bị ghi đè | Lưu ở `lyrics-manual/`, indexer không ghi vào, có lệnh sao lưu |
| Chuyển bài bị ngắt quãng (không gapless) | Kiểm tra ở spike, ghi kết quả, cân nhắc định dạng hoặc cấu hình trước khi làm crossfade |
| Crossfade không khả thi với thư viện audio hiện tại hoặc khi khoá màn hình | Thử nghiệm nhỏ trên iPhone thật trước, mặc định tắt, có thể cần mã native |
| Mã dùng chung dùng API của nền tảng (Node, DOM) làm hỏng app hoặc Worker | Quy tắc TypeScript thuần ở mục 8.1, kèm quy tắc ESLint cấm import `node:*`, `fs`, `path`, `crypto` trong `packages/shared` |
| Đổi `normalizeText` làm đổi `albumId` cả thư viện | Test "golden" cố định kết quả, coi mọi thay đổi là phá vỡ tương thích |
| Metro không dùng được `@music-app/shared` từ mã nguồn TypeScript trong pnpm workspace | Kiểm chứng ở spike khi thêm `apps/mobile`. Nếu lỗi, thêm bước build cho gói shared |
| Tải offline chỉ chạy khi app đang mở, hoặc nhận nhầm Wi-Fi/dữ liệu di động (điểm phát Wi-Fi) | Thử nghiệm nhỏ trước, ghi rõ giới hạn trong app, mặc định chỉ tải qua Wi-Fi |
| Không đọc được ngày hết hạn chứng chỉ từ app | Thử ở spike. Nếu không đọc được thì bỏ tính năng, dùng RUNBOOK nhắc gia hạn bằng tay |
| Đổi ảnh bìa nhưng app vẫn hiện ảnh cũ do cache | `Album.coverVersion` nằm trong URL ảnh, đổi ảnh thì URL đổi |
| Gộp nghệ sĩ nhầm làm gom nhầm album | Xem trước danh sách bài bị ảnh hưởng, có lịch sử `overrides.json` để hoàn tác |
| Khôi phục sao lưu ghi đè dữ liệu hiện có | `restore` mặc định chỉ xem trước, ghi cần bạn xác nhận |
| Nhập file độc hại, quá lớn hoặc tên file nguy hiểm | Kiểm tra bằng nội dung, giới hạn kích thước, tên đích do server đặt, chỉ thêm file mới |
| Nhập từ link bị lợi dụng để truy cập mạng nội bộ (SSRF) | Chặn địa chỉ nội bộ sau khi phân giải và sau mỗi lần chuyển hướng, chỉ chấp nhận file âm thanh |
| Thư mục nhạc gốc bị trộn lẫn file nhập | Chép vào thư mục con `_imported/<năm-tháng>/`, có manifest và hoàn tác trước khi đồng bộ |
| Nhập trùng bài đã có | So `sha1` và tên, nghệ sĩ, thời lượng. Mặc định bỏ qua |
| Token hoặc link stream bị lộ, người lạ ngốn request | Bucket riêng tư, luật giới hạn tần suất ở Cloudflare, cảnh báo chi phí, đổi token (RUNBOOK mục 4). Nâng cấp sau: URL ký có hạn |
| Bản build mới hỏng và không còn bản cũ để quay lại | Giữ `.ipa` bản tốt gần nhất trên máy (`builds/known-good/`), artifact GitHub chỉ giữ 14 ngày |
| Plan và tài liệu quá lớn, Agent mất tập trung | `docs/PLAN-SUMMARY.md`, đọc theo phase, đóng băng phạm vi, ý tưởng mới vào `docs/IDEAS.md` |
| Agent tự bịa giao diện, mỗi phiên một kiểu | `docs/SCREENS.md` là bản duyệt duy nhất về màn hình và điều hướng |
| App build bằng SDK iOS 27 không mở đúng trên iOS 27 (UIScene) | Ghim Xcode 26.x, dùng Expo SDK 57 ổn định, kiểm tra ở spike (mục 12.7) |
| Công cụ sideload chưa bắt kịp iOS 27 | Thử sớm ở Phase 0, dự phòng AltStore/SideStore, không cập nhật iOS ngay khi có bản mới |
| Thẻ VISA bị từ chối khi bật R2 | Kiểm tra giao dịch quốc tế/online với ngân hàng. Nếu vẫn không được thì cần phương án khác (chưa có trong plan) |
| Agent làm thao tác nguy hiểm (xoá file, xoá dữ liệu R2, lộ secret) | Vùng cấm trong `AGENTS.md`, hook quét secret, mọi thao tác xoá cần bạn xác nhận |
| App cũ crash khi định dạng dữ liệu đổi | Quy tắc chỉ thêm trường tuỳ chọn, kiểm tra `version` (mục 7.4) |

## 15. Các quyết định mặc định (chỉnh nếu thấy chưa hợp)

1. Backend theo phương án **B** (R2 + Worker), không dùng Navidrome.
2. Xử lý nhạc theo phương án **B** (TypeScript + `ffmpeg` + `beets`).
3. Audio dùng **`@rntp/player` v5**, dự phòng `expo-audio`.
4. Không dùng nhiều tài khoản để lách giới hạn free. Vượt free thì giảm dung lượng, rồi trả phí R2.
5. Chuẩn hóa âm lượng bằng `replayGain` trong `library.json`, mức chuẩn -18 LUFS.
6. Token nhập trong app, lưu bằng SecureStore.
7. Playlist và favorites lưu local ở Phase 3, đồng bộ ở Phase 4.
8. Định dạng nhạc **MP3/M4A 320kbps** (hoặc AAC 256kbps nếu cần tiết kiệm).
9. Một người dùng, một token, chưa có đăng ký/đăng nhập.
10. **Apple ID miễn phí + Sideloadly/AltStore** trước, lên Developer sau nếu thấy phiền.
11. Repo **private** (người dùng đã chọn): chấp nhận ít lần build macOS, dùng dev client và hot reload để giảm số lần build.
12. **Dashboard local** làm ở Phase 4, sau khi Phase 3 đạt. Không làm dashboard trên cloud.
13. Chỉnh sửa metadata lưu trong `overrides.json`, không sửa file nhạc gốc.
14. **Lời bài hát:** đo độ phủ (L0) trước, tra cứu (L1) là mặc định, các bước Python (L3/L4) chỉ làm khi bạn duyệt sau L0.
15. Lời lưu thành file riêng `lyrics/{id}.lrc|txt`, không nhúng vào `library.json`. Lời đã sửa tay hoặc đã duyệt không bị ghi đè.
16. Thiết bị iPhone 16, iOS 27. Dùng **Expo SDK 57 ổn định + Xcode 26.x đã ghim**, chưa dùng SDK 58 beta (mục 12.7).
17. **MVP = Phase 0 đến 2.** Phase 3 trở đi làm sau khi đã dùng thật.
18. CI Linux (`ci.yml`) chạy typecheck, lint, test. Build macOS chỉ chạy tay.
19. Có sao lưu định kỳ (mục 5.5), sổ tay `docs/RUNBOOK.md` và vùng cấm cho Agent.
20. CarPlay và widget nằm ngoài phạm vi.
21. Lời bạn thêm/sửa lưu ở `lyrics-manual/`, indexer không bao giờ ghi vào. Sửa lời tự động là sao chép rồi sửa, khôi phục được.
22. Tô dần từng chữ mặc định bằng nội suy (mức 2). Mốc thật từng chữ (mức 3) chỉ khi có dữ liệu.
23. Shuffle tính trước thứ tự, không lặp bài, Previous theo lịch sử (mục 13.3), làm ở Phase 2.
24. Gapless kiểm tra ở spike, crossfade là thử nghiệm ở Phase 4, mix kiểu DJ không làm.
25. Thao tác ghi của API chỉ nhận token qua header.
26. Mã từ hai nơi trở lên cùng dùng nằm ở `packages/shared`, chỉ TypeScript thuần (mục 8.1). Mã chỉ một nơi dùng ở lại nơi đó.
27. Parser LRC ở `packages/shared/src/lrc/`, `normalizeText` ở `packages/shared/src/text/`, đều có test. `normalizeText` có test "golden".
28. Có quy tắc ESLint cấm API của Node trong `packages/shared`.
29. Nhóm A (10 mục) được thêm vào plan: xem changelog v1.8. Nghe offline có tuỳ chọn **chỉ tải qua Wi-Fi, mặc định bật**. Quản lý ảnh bìa nằm trong dashboard.
30. **Không làm:** đếm lượt nghe, chế độ tiết kiệm dữ liệu, sửa tag từ app iPhone, equalizer, mix kiểu DJ, dashboard trên cloud.
31. `Album.coverVersion` nằm trong URL ảnh bìa để cache tự làm mới. Worker trả `Cache-Control` kiểu `private` vì token nằm trong query.
32. Worker chỉ trả mã lỗi dùng chung (`ErrorCode`), app tự đổi thành thông báo tiếng Việt.
33. `pnpm indexer backup` và `restore` là cách sao lưu chính, `restore` mặc định chỉ xem trước.
34. Dashboard có trang **Nhập nhạc** (kéo thả) ở Phase 4. Chỉ **thêm file mới** vào `MUSIC_IMPORT_DIR`, không ghi đè, không xoá, và cần bạn xác nhận. Đây là ngoại lệ duy nhất cho quy tắc "không ghi vào thư mục nhạc" của Agent.
35. Nhập từ link tải trực tiếp là tuỳ chọn, chỉ cho file nhạc trực tiếp. **Không hỗ trợ** link trang web, trang video hay dịch vụ streaming.
36. Gửi file từ iPhone: chưa có, chưa nằm trong kế hoạch.
37. **Đóng băng phạm vi:** không thêm tính năng mới cho tới khi bạn dùng MVP ít nhất hai tuần. Ý tưởng mới ghi vào `docs/IDEAS.md`, các ý tưởng đã loại cũng ghi ở đó.
38. Agent đọc tài liệu theo tầng: `STATUS.md`, rồi `PLAN-SUMMARY.md`, rồi chỉ các mục `PLAN.md` của phase đang làm, rồi skill khớp việc.
39. Màn hình và điều hướng theo `docs/SCREENS.md`. App có thêm duyệt theo Nghệ sĩ (Phase 3).
40. Bucket R2 riêng tư, có luật giới hạn tần suất (nếu gói free cho phép). URL ký có hạn là nâng cấp sau.
41. Dữ liệu mẫu và thư viện giả nằm ở `@music-app/shared/testing`. App có chế độ demo chỉ trong biến thể `development`.
42. Giữ `.ipa` bản tốt gần nhất, chạy smoke test sau mỗi build (ACCEPTANCE mục S).
