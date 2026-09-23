---
name: rntp-audio
description: Hướng dẫn phát nhạc trong app music-app bằng React Native Track Player v5 (@rntp/player), gồm background audio, lock screen, Control Center, nút next/previous/seek, queue, shuffle, repeat, ReplayGain và spike Phase 0. Dùng skill này mỗi khi động đến phát nhạc, player, queue, MiniPlayer, Now Playing, lock screen, tai nghe, âm lượng từng bài, hoặc khi cân nhắc đổi sang expo-audio, kể cả khi người dùng chỉ nói "nhạc bị dừng", "không hiện trên màn hình khoá", "bấm next không chạy".
---

# Phát nhạc với `@rntp/player` (RNTP v5)

## Những điều đã xác định (đừng suy đoán ngoài phần này)

- Package là **`@rntp/player`** (v5). **Không phải** `react-native-track-player` v4: tên package và API khác nhau. Không dùng lại code mẫu của v4 (`Capability`, `Event.RemoteNext`, `registerPlaybackService`...) khi chưa đối chiếu với tài liệu v5.
- v5 yêu cầu **New Architecture** (Fabric + TurboModules) và React Native 0.74 trở lên. Expo SDK 55 trở lên luôn bật New Architecture.
- v5 dùng giấy phép thương mại. README ghi dùng **cá nhân và học tập được miễn phí**, nhưng trang giá chỉ liệt kê gói thương mại. Chưa xác nhận điều khoản chi tiết.
- Không chạy trên Expo Go. Cần development build.
- Tài liệu: `https://rntp.dev/docs`. Điều khoản: `https://www.rntp.dev/terms`.

## Việc đầu tiên: đọc tài liệu và xác nhận giấy phép

1. Đọc tài liệu cài đặt v5 cho Expo và phần background mode/iOS trước khi viết bất kỳ dòng code audio nào. Ghi lại vào `docs/STATUS.md` phiên bản đã dùng và cách khai báo setup.
2. Đọc điều khoản dùng cá nhân. Nếu không rõ hoặc yêu cầu khoá/đăng ký, **dừng và hỏi người dùng**. Phương án dự phòng là `expo-audio` (xem cuối file).

## Kiến trúc: bọc thư viện sau một lớp

Toàn bộ app chỉ nói chuyện với `PlayerService`, không import thư viện audio ở component, để đổi thư viện chỉ sửa một file.

```ts
// apps/mobile/src/services/player/types.ts
import type { Track } from '@music-app/shared';

export type RepeatMode = 'off' | 'track' | 'queue';

export interface PlayerState {
  isPlaying: boolean;
  isBuffering: boolean;
  activeTrackId: string | null;
  positionSec: number;
  durationSec: number;
  bufferedSec: number | null; // null nếu thư viện không cung cấp phần đã tải
}

// Giao diện độc lập với thư viện audio
export interface IPlayerService {
  setup(): Promise<void>;
  playQueue(tracks: Track[], startIndex: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seekTo(seconds: number): Promise<void>;
  setRepeatMode(mode: RepeatMode): Promise<void>;
  addToQueue(track: Track): Promise<void>;
  playNext(track: Track): Promise<void>;
  removeFromQueue(index: number): Promise<void>;
  moveInQueue(from: number, to: number): Promise<void>;
  getQueue(): Promise<Track[]>;
  subscribe(listener: (state: PlayerState) => void): () => void;
}
```

Triển khai thật nằm ở `apps/mobile/src/services/player/rntpPlayerService.ts`. Cú pháp gọi thư viện lấy **theo tài liệu v5**.

## Yêu cầu chức năng

| Yêu cầu | Ghi chú |
|---|---|
| Phát nền khi tắt màn hình | `UIBackgroundModes: ['audio']` trong `app.config.ts` (đã có trong plan) và cấu hình audio session theo tài liệu |
| Lock screen/Control Center | Hiện `title`, `artist`, `artwork`, `duration`, thanh tiến trình đúng |
| Nút play/pause/next/previous/seek | Bật đủ trên lock screen, Control Center và tai nghe |
| Chuyển bài tự động | Hết bài tự sang bài kế theo repeat mode |
| Rút tai nghe | Tự dừng (thư viện thường có tuỳ chọn cho việc này, đối chiếu tài liệu) |
| Cuộc gọi/báo thức | Dừng và tiếp tục hợp lý |
| Công tắc im lặng | Vẫn có tiếng |
| Nhớ hàng đợi | Lưu queue, bài đang phát, vị trí vào MMKV, khôi phục khi mở lại |
| Lỗi mạng | Báo lỗi dễ hiểu bằng tiếng Việt, cho thử lại, không crash. Lỗi `INVALID_TOKEN` (401) không chỉ báo lỗi mà chuyển sang luồng nhập lại token của app (skill `mobile-conventions`) |

## URL stream và ảnh bìa

- `url`: `${baseUrl}/stream/${track.id}?t=${token}`.
- `artwork`: `${baseUrl}/covers/${track.albumId}?t=${token}&v=${album.coverVersion}` khi có `cover` (`v` giúp cache làm mới khi đổi ảnh).
- Bài đã tải offline (skill `offline-downloads`): dùng đường dẫn file cục bộ thay cho URL stream. Kiểm chứng thư viện phát được từ `file://`.
- Token đọc từ SecureStore lúc dựng URL. **Không log URL đầy đủ** vì có token.
- Lý do dùng query: lock screen iOS không luôn gửi được header tuỳ chỉnh.

## ReplayGain

Mỗi lần đổi bài, đặt volume theo `replayGain` của bài:

```ts
// apps/mobile/src/utils/gainToVolume.ts
// Đổi dB sang hệ số volume tuyến tính, tối đa 1 (không khuếch đại)
export function gainToVolume(gainDb: number | undefined): number {
  if (gainDb === undefined) return 1;
  return Math.min(1, Math.pow(10, gainDb / 20));
}
```

Cần test: `undefined` → 1, `0` → 1, `-6` → khoảng 0.5, giá trị dương → chặn ở 1.

## Spike Phase 0 (làm trước mọi thứ khác)

Mục tiêu: chứng minh chuỗi **thư viện audio + New Architecture + build cloud + sideload + lock screen** chạy được trên iPhone thật, trước khi đầu tư vào phần còn lại.

1. App tối thiểu, một màn hình: nút Play/Pause, phát một MP3 từ URL công khai (người dùng cung cấp hoặc dùng file của họ đặt trên R2 public tạm), có metadata giả (title, artist, artwork).
2. Khai báo player service và các nút remote theo tài liệu v5.
3. Build bản `development` bằng workflow (skill `ios-build-sideload`), hướng dẫn người dùng cài.
4. Người dùng thử mục **P0.1 đến P0.6** trong `docs/ACCEPTANCE.md`, trên **iPhone 16 chạy iOS 27**. Khả năng tương thích của RNTP v5 với iOS 27 và Expo SDK 57 **chưa được kiểm chứng**, nên spike phải xác nhận app hiển thị nội dung (không màn hình trắng/đen) và ghi kết quả vào bảng giả định trong `docs/STATUS.md`.

**Tiêu chí đạt:** phát khi khoá màn hình 10 phút, lock screen hiện đúng thông tin, có nút next/previous hoạt động.

## Phương án dự phòng: `expo-audio`

Chuyển sang `expo-audio` nếu giấy phép RNTP v5 không phù hợp hoặc spike thất bại vì lỗi thư viện. Những gì tài liệu Expo nêu:
- Bật phát nền bằng config plugin (`enableBackgroundPlayback`) và `setAudioModeAsync({ shouldPlayInBackground: true, interruptionMode: 'doNotMix' })`.
- Lock screen: `player.setActiveForLockScreen(true, { title, artist, albumTitle, artworkUrl })`. Bắt buộc `interruptionMode: 'doNotMix'` thì lock screen mới gắn với player.
- Tuỳ chọn lock screen chỉ nêu `showSeekBackward` và `showSeekForward`. **Tài liệu không nêu nút next/previous**, nên phải thử trên iPhone thật xem có hiện không và báo người dùng kết quả.
- Có `useAudioPlaylist` (add/insert/remove/next/previous/skipTo, sự kiện `trackChanged`), có `preload`, không có cache offline dựng sẵn.
- Vì đã có `IPlayerService`, việc chuyển chỉ sửa file triển khai.

## Thanh tiến trình và vị trí phát

Giao diện theo `docs/SCREENS.md` mục "Thanh tiến trình". Phần player phụ trách dữ liệu:

- `PlayerService` là nguồn duy nhất về vị trí và thời lượng. Phát ra `positionSec`, `durationSec` và `bufferedSec` (có thể `null`). Tần suất báo tiến trình của thư viện lấy **theo tài liệu v5**, không hứa trước.
- Giao diện nội suy vị trí cục bộ giữa các lần báo (dựa vào thời điểm nhận và trạng thái đang phát), không tự đặt bộ đếm riêng lệch với player. Dùng chung cơ chế này với tô dần lời.
- `seekTo` chỉ gọi khi người dùng **thả tay** hoặc chạm một điểm, không gọi liên tục trong lúc kéo. Sau khi tua, bỏ qua các lần báo vị trí cũ đến muộn để thanh không nhảy lại.
- Thời lượng: ưu tiên `duration` trong thư viện cho tới khi player báo số thực tế. Lệch quá 2 giây thì dùng số của player.
- Phải xử lý: tua khi đang tạm dừng, tua khi đang tải, tua lỗi (giữ vị trí cũ, báo lỗi), hết bài.
- Lỗi mạng khi tua dùng chung luồng lỗi mạng ở trên. Lỗi `INVALID_TOKEN` chuyển sang luồng nhập lại token.
- Kiểm chứng ở spike: player có báo phần đã tải không, tần suất báo tiến trình, độ chính xác khi tua vào giữa file MP3. Ghi kết quả vào STATUS. Sóng âm là hình ảnh tĩnh (không phải dữ liệu từ player), nên không thuộc trách nhiệm của `PlayerService`, chỉ cần `positionSec`/`durationSec` để tô đúng phần đã phát trên sóng.

## Chuyển bài mượt và shuffle

Đặc tả ở `docs/PLAN.md` mục 13.3.

**Gapless (kiểm tra ở spike):** phát hai bài liền nhau (một MP3, một M4A nếu có) và nghe có khoảng lặng không. Kết quả **không phải đạt/lỗi cứng** mà là dữ liệu để quyết định: ghi vào `docs/STATUS.md` có hay không, với định dạng nào. Nếu có khoảng lặng đáng kể, nêu phương án (đổi định dạng, cấu hình theo tài liệu v5) cho người dùng chọn. Đừng hứa gapless khi chưa nghe thử trên iPhone thật.

**Shuffle (Phase 2):**
- Thứ tự phát **tính trước** cho cả hàng đợi (Fisher-Yates), bài đang phát giữ ở đầu. Không chọn ngẫu nhiên lúc hết bài, vì cần biết bài kế để tải trước và hiện trên lock screen.
- Không lặp bài đến khi hết vòng. Sang vòng mới, bài đầu tiên khác bài cuối của vòng trước.
- Previous quay lại bài **đã nghe** (lịch sử), không phải bài đứng trước trong thứ tự shuffle.
- Bật shuffle khi đang phát: giữ bài hiện tại, xáo phần còn lại. Tắt shuffle: quay về thứ tự gốc và tiếp tục từ bài đang phát.
- Bài người dùng chèn ("Phát tiếp theo", "Thêm vào cuối") giữ nguyên vị trí, không bị xáo lại.
- Tuỳ chọn "Tránh cùng nghệ sĩ liền nhau" (mặc định bật, làm hết sức có thể).
- Áp dụng cho toàn thư viện, album, playlist, yêu thích.
- Lưu trạng thái shuffle, thứ tự, vị trí, lịch sử vào MMKV và khôi phục khi mở lại.
- Viết thành **hàm thuần** `buildShuffleOrder(trackIds, currentId, options, rng)`, `rng` truyền vào để test ổn định. Test: không lặp, giữ bài hiện tại ở đầu, tránh cùng nghệ sĩ, danh sách 0/1/2 bài, vòng mới không trùng bài cuối, phân bố không lệch khi chạy nhiều lần.
- Cách điều khiển hàng đợi của thư viện audio **theo tài liệu v5**. Nếu không sắp lại hàng đợi thuận tiện thì giữ thứ tự trong `PlayerService` và nạp lại một đoạn hàng đợi phía trước.

**Crossfade (Phase 4, thử nghiệm, chỉ khi người dùng yêu cầu):**
- Cần hai luồng âm thanh chồng nhau vài giây, đổi thông tin lock screen đúng lúc, và chạy khi tắt màn hình. RNTP là một hàng đợi trong một player nên có thể không hỗ trợ sẵn. `expo-audio` cho tạo nhiều player nhưng lock screen của nó gắn với một player tại một thời điểm (theo tài liệu). Cả hai hướng **chưa kiểm chứng**.
- Trước khi viết code, làm **thử nghiệm nhỏ** trên iPhone thật: hai bài, chồng 4 giây, khoá màn hình. Báo kết quả cho người dùng rồi mới quyết định.
- Nếu làm: mặc định TẮT, có công tắc và độ dài (2-8 giây), tính lại với ReplayGain của hai bài. Người dùng bấm Next/Previous giữa lúc chuyển thì kết thúc ngay đợt crossfade. Bài ngắn hơn thời lượng crossfade thì bỏ crossfade cho bài đó.
- Có thể cần mã native (Swift) và build lại `.ipa`: hỏi trước.

**Ngoài phạm vi:** mix kiểu DJ (khớp nhịp, khớp giọng) cần phân tích BPM/key và kéo giãn thời gian khi phát, không làm.

## Lỗi hay gặp

- Gọi setup player hai lần (hot reload, remount): dùng cờ khởi tạo một lần.
- Thử trên Expo Go: sẽ không chạy, phải dùng development build.
- Kết luận "đã chạy được" mà chưa thử trên iPhone thật: chỉ người dùng xác nhận được lock screen và tai nghe. Luôn yêu cầu họ thử theo `docs/ACCEPTANCE.md`.
