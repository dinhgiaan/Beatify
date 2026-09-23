---
name: mobile-conventions
description: Quy ước code cho app Expo React Native (TypeScript) của music-app gồm cấu trúc thư mục Atomic Design theo feature, NativeWind, FlashList, Zustand + MMKV, TanStack Query, SecureStore, màn hình Kết nối, Search bỏ dấu tiếng Việt, Albums, Playlists, Favorites, màn hình Debug và quản lý dependency native. Dùng skill này mỗi khi tạo hoặc sửa màn hình, component, hook, store, hoặc thêm thư viện vào apps/mobile, kể cả khi người dùng chỉ nói "thêm nút", "làm màn hình", "đổi giao diện", "tìm kiếm không ra", "lưu playlist".
---

# Quy ước app mobile (apps/mobile)

## Cấu trúc thư mục

```
apps/mobile/
├── app.config.ts            # biến thể development/production (APP_VARIANT)
├── app/                     # expo-router: chỉ chứa route, mỏng, gọi vào features
└── src/
    ├── components/          # Atomic Design dùng chung: atoms / molecules / organisms
    ├── features/            # mỗi tính năng một thư mục
    │   ├── connection/      # màn hình Kết nối (URL + token)
    │   ├── library/  player/  queue/  recents/  artists/  search/  albums/  playlists/  favorites/  lyrics/  offline/  settings/
    │   └── <feature>/{components,hooks,store,services,types}.ts(x)
    ├── hooks/               # hook dùng chung
    ├── services/            # apiClient, secureStorage, player/ (bọc thư viện audio)
    ├── store/               # store dùng chung (nếu không thuộc feature nào)
    └── utils/               # gainToVolume, buildShuffleOrder (chỉ app dùng). Hàm dùng chung ở packages/shared
```

- Route trong `app/` chỉ lắp ráp. Logic nằm trong `features/` và `hooks/`.
- Một component một trách nhiệm (SOLID). Trùng lặp thì rút ra atom/molecule/hook (DRY).
- Import type từ `@music-app/shared`, không khai báo lại.

## Giao diện

- **NativeWind (Tailwind)**, mobile-first, ưu tiên **dark mode** vì là app nghe nhạc, có hỗ trợ light theo hệ thống.
- Vùng chạm tối thiểu 44×44 pt. Tôn trọng safe area (notch, home indicator).
- Chuỗi hiển thị **tiếng Việt**, gom vào một nơi (`src/constants/strings.ts`) để dễ sửa.
- Danh sách bài hát dùng `@shopify/flash-list`. Ảnh bìa dùng `expo-image` có cache, URL có `&v=<Album.coverVersion>` để đổi ảnh thì cache tự làm mới.
- Mọi màn hình có đủ 4 trạng thái: đang tải, lỗi (có nút thử lại), rỗng, có dữ liệu.
- Nút và ảnh có `accessibilityLabel` bằng tiếng Việt.

## State và dữ liệu

| Loại | Công cụ | Ghi chú |
|---|---|---|
| Thư viện từ server | TanStack Query + persist (MMKV) | Cache để mở app nhanh và xem được khi offline. Làm mới bằng kéo xuống, dùng `ETag` |
| Player, queue | Zustand | Đồng bộ với `IPlayerService`, lưu queue/bài đang phát/vị trí vào MMKV |
| Playlists, favorites | Zustand + persist (MMKV) | Hình dạng khớp `UserStateSchema` để xuất/nhập và đồng bộ về sau |
| Token API | `expo-secure-store` | **Không** dùng MMKV/AsyncStorage cho token, không đặt vào biến `EXPO_PUBLIC_*` |

- Dữ liệu từ server luôn `parse` bằng Zod trước khi dùng. Dữ liệu sai thì báo lỗi rõ, không crash.
- Playlist tham chiếu `trackIds`. Khi mở playlist, bỏ qua id không còn trong thư viện và hiện thông báo "N bài không còn trong thư viện".
- Không lưu đường dẫn tuyệt đối của file cục bộ (UUID thư mục app trên iOS có thể đổi). Lưu tên file và ghép đường dẫn khi dùng.

## Lời bài hát (Phase 4)

Module `features/lyrics/`, xem skill `lyrics-pipeline`: hiển thị đồng bộ, tô dần từng chữ, thêm và sửa lời ngay trong app (lưu qua `PUT /lyrics/:id`, giữ bản nháp cục bộ trong MMKV). Parser LRC và hàm nội suy là hàm thuần có test, nằm ở `packages/shared` (dùng chung với dashboard và Worker). Chỉ là JS/TS nên không cần build lại `.ipa`.

## Điều hướng và màn hình

Theo `docs/SCREENS.md`, đó là **nguồn duy nhất** về giao diện. Không tự thêm màn hình, tab hay đổi bố cục khi chưa hỏi người dùng. Cấu trúc route của expo-router theo file đó (được đổi tên route cho hợp lý nhưng giữ đúng cấu trúc). Màu, cỡ chữ, khoảng cách là token trong cấu hình Tailwind.

## Nghệ sĩ (Phase 3)

Danh sách nghệ sĩ tạo **từ danh sách bài trên máy** (không cần API mới): khoá là `normalizeText(artist)`, tên hiển thị là cách viết xuất hiện nhiều nhất. Dùng tên đã gộp ở dashboard vì `library.json` đã áp dụng. Trang nghệ sĩ liệt kê album và bài. Hàm thuần `groupByArtist` có test (bỏ dấu, chữ hoa/thường, tên có ký tự đặc biệt).

## Chế độ demo (chỉ biến thể development)

Nạp `library.sample.json` từ `@music-app/shared/testing` và một URL nhạc mẫu do người dùng cung cấp, để làm giao diện và thử app khi chưa có Worker hay R2. Có nhãn "DEMO" rõ ràng. **Không có trong bản production.** Không ghi đè token hay dữ liệu thật.
## Thanh tiến trình (`SeekBar`)

Đặc tả hành vi ở `docs/SCREENS.md` mục "Thanh tiến trình". Thành phần `SeekBar` (molecule) nhận `position`, `duration`, `buffered` (có thể không có), `waveform` (mảng đỉnh sóng, có thể không có), `onSeekStart`, `onSeek` (khi kéo, chỉ để hiển thị), `onSeekEnd` (khi thả, lúc này mới gọi `PlayerService.seekTo`). Component subscribe vị trí riêng, không làm vẽ lại cả màn hình mỗi lần cập nhật. Vạch tiến trình mảnh ở MiniPlayer dùng chung dữ liệu vị trí, chỉ để xem. Đặt nhãn trợ năng cơ bản bằng tiếng Việt.

- Hàm thuần có test: `positionFromTouch(x, width, duration)` (chặn ở 0 và duration), `clampSeek`, và `formatTime` trong `@music-app/shared` (`m:ss`, `h:mm:ss`, dạng còn lại `-m:ss`).
- **Sóng âm:** tải `waveforms/{id}.json` (mảng khoảng 100 số 0-1) kèm khi mở màn hình Đang phát, cache như ảnh bìa. Vẽ bằng SVG hoặc `View` xếp cột, tô màu theo tỉ lệ `position/duration` (chỉ đổi màu cột, không vẽ lại toàn bộ mỗi khung hình). Không có dữ liệu (`waveform` là `undefined` hoặc rỗng, hoặc lỗi tải) thì `SeekBar` tự chuyển sang vẽ **dạng trơn**, không báo lỗi cho người dùng. Kiểm chứng hiệu năng vẽ khoảng 100 cột cập nhật liên tục trên Hermes ở spike hoặc khi làm Phase 2, ghi kết quả vào STATUS.
- Ngừng cập nhật khi màn hình không hiển thị hoặc app ở nền.

## Hàng đợi và Nghe gần đây

- **Hàng đợi** (`features/queue/`, Phase 2): xem hàng đợi hiện tại, đánh dấu bài đang phát, kéo để sắp xếp lại, vuốt để xoá, "Phát tiếp theo" và "Thêm vào cuối" từ mọi danh sách. Mọi thao tác đi qua `PlayerService` (xem skill `rntp-audio`), không gọi thư viện audio trực tiếp. Bài do người dùng chèn giữ nguyên vị trí khi shuffle.
- **Nghe gần đây** (`features/recents/`, Phase 3): lưu trên máy (MMKV), tối đa 200 bài, bài mới nhất ở trên, **không đồng bộ** lên server. Một bài chỉ tính là "đã nghe" khi phát ít nhất vài giây, không tính bài bị bỏ qua ngay. Bài không còn trong thư viện thì ẩn.
- Test hàm thuần: thêm vào lịch sử (bỏ trùng, giới hạn 200), sắp xếp lại hàng đợi, xoá bài đang phát.

## Xác thực và lỗi kết nối

- Mọi lỗi từ Worker mang một `ErrorCode` của `@music-app/shared`. App có bảng `Record<ErrorCode, string>` (thông báo tiếng Việt), khai báo đầy đủ để TypeScript báo lỗi nếu thiếu mã.
- Gặp `INVALID_TOKEN` (từ API, từ luồng phát nhạc hoặc từ tải offline): đặt trạng thái "cần nhập lại token" **một lần**, điều hướng tới màn hình nhập lại, không thử lại vô hạn, không crash. Giữ nguyên thư viện đã cache, playlist và cài đặt. Nhập token mới xong tự quay lại màn hình trước và làm mới thư viện.
- Nhập sai token ở màn hình Kết nối: báo bằng tiếng Việt, không lưu.
- Lỗi mạng (không có mạng, hết thời gian chờ) khác lỗi token: báo riêng, cho thử lại.

## Cảnh báo sắp hết hạn chứng chỉ (Phase 3, chỉ nếu spike xác nhận đọc được)

`docs/PLAN.md` mục 12.8. Đọc ngày hết hạn từ file cấu hình ký nhúng trong app (chưa kiểm chứng, thử ở spike, ACCEPTANCE P0.8). Hàm thuần `parseProvisioningExpiry(text)` có test với đoạn dữ liệu mẫu. Settings hiện "Chứng chỉ còn N ngày", có biểu ngữ khi còn từ 2 ngày trở xuống. Không đọc được thì **ẩn hẳn** tính năng, không hiển thị thông tin không chắc chắn. Nếu cần thư viện native thì hỏi trước và báo cần build lại.

## Màn hình Kết nối (lần đầu)

- Nhập Server URL (có thể điền sẵn từ `EXPO_PUBLIC_DEFAULT_API_URL`) và token.
- Nút **Kiểm tra kết nối** gọi `GET /api/health` (nhẹ) và báo kết quả bằng tiếng Việt, kèm số bài và thời điểm tạo thư viện.
- Chỉ lưu khi kiểm tra thành công. Token lưu SecureStore. Có mục "Đăng xuất/đổi server" trong Settings.
- Không hiển thị token dạng chữ rõ sau khi lưu.

## Search bỏ dấu tiếng Việt

Khớp trên bản đã chuẩn hóa của cả từ khoá lẫn dữ liệu (title, artist, album). Chuẩn hóa dữ liệu **một lần** khi tải thư viện, không chuẩn hóa lại mỗi lần gõ.

```ts
// packages/shared/src/text/normalizeText.ts (app import từ '@music-app/shared', không viết bản riêng)
// Bỏ dấu tiếng Việt, chữ thường: "Sơn Tùng" -> "son tung"
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
```

Test bắt buộc: có dấu/không dấu, `Đ/đ`, chuỗi rỗng, chuỗi có nhiều khoảng trắng. Debounce ô tìm kiếm khoảng 200 ms.

## Màn hình Debug (Settings → Debug)

Vì không có Mac/Xcode, đây là kênh chính để người dùng đưa lỗi cho Agent.

- Hiện: mã commit bản build (`EXPO_PUBLIC_BUILD_SHA`), biến thể (dev/production), phiên bản app, Server URL (che token), số bài trong thư viện. Thêm: dữ liệu từ `/api/health` (thời điểm tạo thư viện, số bài, phiên bản dữ liệu) và số ngày còn lại của chứng chỉ ký (nếu đọc được).
- Nhật ký lỗi gần nhất (vòng đệm khoảng 100 dòng): thời điểm, nơi phát sinh, thông điệp. Ghi từ error boundary, lỗi mạng, lỗi player.
- Nút **Copy** đưa toàn bộ nội dung vào clipboard (`expo-clipboard`). **Che token và mọi query `t=`** trước khi copy.
- Nút xoá cache thư viện.

## Mã dùng chung

Hàm nào từ hai nơi trở lên cùng dùng thì nằm ở `packages/shared` và import từ `@music-app/shared`: `normalizeText`, `isValidTrackId`, hằng số (`LYRICS_MAX_BYTES`...), `utf8ByteLength`, `formatTime`, `searchTracks`, `parseLrc`/`stringifyLrc`/`applyOffset`/`interpolateWordTimes`. **Không viết bản riêng trong app.** Ở lại app: `gainToVolume`, `buildShuffleOrder`. Quy tắc đầy đủ ở `docs/PLAN.md` mục 8.1. Khi cần thêm hàm dùng chung: chỉ thêm khi phase cần, có test, và giữ TypeScript thuần (không React Native, không API của Node).


## Tương thích dữ liệu

- `library.json` và `state.json` có `version`. Chỉ thêm trường **tuỳ chọn**, không đổi nghĩa hay xoá trường cũ.
- Gặp `version` lớn hơn mức app hiểu: hiện "Cần cập nhật app", tiếp tục dùng bản cache cũ, **không crash**.
- Parse chặt với trường cốt lõi, bỏ qua trường lạ.

## Thêm dependency

1. Ưu tiên module có sẵn trong Expo SDK hiện tại. Cài bằng `npx expo install <package>` để đúng phiên bản.
2. Thư viện **có mã native** (kể cả plugin) cần: chạy `npx expo-doctor`, kiểm tra tương thích **New Architecture**, **hỏi người dùng trước**, rồi báo "cần build lại `.ipa`".
3. Thư viện thuần JS thì thêm được, nhưng vẫn cân nhắc kích thước bundle.
4. Khoá phiên bản, không nâng cấp Expo/React Native nếu không được yêu cầu.

## Kiểm tra trước khi báo xong

- `pnpm typecheck && pnpm lint && pnpm test` phải qua.
- Test logic thuần của app: `gainToVolume`, chuyển `Track` sang `PlayerTrack`, gom/sắp xếp playlist, hợp nhất `UserState`, `buildShuffleOrder`. Hàm dùng chung (`normalizeText`, parser LRC, `interpolateWordTimes`...) được test trong `packages/shared`. Cũng test: lịch sử Nghe gần đây, sắp xếp hàng đợi, bảng thông báo theo `ErrorCode` đầy đủ, `parseProvisioningExpiry`. Thêm `groupByArtist`. Thêm `positionFromTouch`, `clampSeek`.
- Chỉ ra mục `docs/ACCEPTANCE.md` cần thử trên iPhone.
