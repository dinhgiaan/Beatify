# Sơ đồ màn hình và điều hướng

**Đây là nguồn duy nhất về giao diện app.** Agent không tự thêm màn hình, tab hay đổi bố cục khi chưa hỏi. Muốn đổi, sửa file này trước và để người dùng duyệt. File này chỉ mô tả bằng chữ và hình ASCII. Muốn xem hình minh hoạ thì nhờ vẽ mockup dựa trên file này.

## Nguyên tắc chung

- **Tối là mặc định**, có bản sáng theo hệ thống. Ảnh bìa là trung tâm. Một màu nhấn duy nhất.
- Lưới 4 pt, vùng chạm tối thiểu 44 pt, tôn trọng safe area. Dùng phông hệ thống (hiển thị đúng dấu tiếng Việt), không cố định chiều cao để chữ lớn theo hệ thống vẫn không vỡ.
- Màu, cỡ chữ, khoảng cách là **token** trong cấu hình Tailwind (NativeWind), không viết màu rời trong component.
- Chuỗi hiển thị tiếng Việt nằm trong `src/constants/strings.ts`.
- Mọi danh sách có 4 trạng thái: đang tải, lỗi (có nút thử lại), rỗng, có dữ liệu.

## Bản đồ

```
Mở app
 ├─ Chưa có kết nối ──► Kết nối (nhập URL + token) ──► Thư viện
 └─ Đã có kết nối ────► Thanh tab
                         ├─ Thư viện   [ Bài hát | Album | Nghệ sĩ ]
                         ├─ Tìm kiếm
                         ├─ Playlist   [ Yêu thích, các playlist ]
                         └─ Cài đặt
      MiniPlayer nằm ngay trên thanh tab, ở mọi tab
      MiniPlayer ─chạm─► Đang phát (toàn màn hình, vuốt xuống để đóng)
                            ├─ Bìa ⇄ Lời (chạm để đổi qua lại)
                            └─ Hàng đợi (bảng trượt lên)
      Trang chi tiết (Album, Nghệ sĩ, Playlist) được đẩy vào từ mọi tab
```

## Danh sách màn hình

| Màn hình | Route gợi ý (expo-router) | Nội dung | Phase |
|---|---|---|---|
| Kết nối | `app/connect` | URL, token, nút Kiểm tra kết nối (`/api/health`), lưu. Cũng là nơi nhập lại token khi lỗi 401 | 2 |
| Thư viện | `app/(tabs)/library` | Ba phân đoạn: Bài hát (A-Z, cuộn nhanh, kéo để làm mới), Album (lưới bìa), Nghệ sĩ | 2 (Bài hát), 3 (Album, Nghệ sĩ) |
| Tìm kiếm | `app/(tabs)/search` | Ô tìm bỏ dấu, kết quả nhóm theo Bài hát, Album, Nghệ sĩ, Playlist | 3 |
| Playlist | `app/(tabs)/playlists` | Yêu thích, danh sách playlist, nút tạo mới | 3 |
| Cài đặt | `app/(tabs)/settings` | Kết nối, Nghe offline (Phase 4), Cache, Xuất/nhập playlist, Debug, Về app (phiên bản, commit, chứng chỉ nếu đọc được) | 2 đến 3 |
| Đang phát | `app/now-playing` (modal) | Bìa, tên bài, nghệ sĩ, thanh tiến trình, shuffle, trước, phát/tạm dừng, sau, repeat, nút Hàng đợi, Lời, Thêm vào playlist, Yêu thích | 2 |
| Hàng đợi | `app/queue` (bảng trượt) | Đang phát, danh sách tiếp theo, kéo để sắp xếp, vuốt để xoá | 2 |
| Chi tiết Album | `app/album/[id]` | Bìa, danh sách bài, Phát tất cả, Phát ngẫu nhiên | 3 |
| Chi tiết Nghệ sĩ | `app/artist/[key]` | Album và bài của nghệ sĩ. `key` là `normalizeText(tên)` đã mã hoá cho URL | 3 |
| Chi tiết Playlist | `app/playlist/[id]` | Danh sách bài, sắp xếp lại, đổi tên, xoá | 3 |
| Thêm vào playlist | bảng trượt | Chọn playlist hoặc tạo mới | 3 |
| Soạn lời | `app/lyrics-editor/[id]` | Dán, sửa chữ, chỉnh lệch, chạm để đồng bộ | 4 |
| Debug | `app/(tabs)/settings/debug` | Commit, dữ liệu `/api/health`, nhật ký lỗi, nút Copy | 2 |

Agent được đổi tên route cho hợp lý nhưng phải giữ đúng cấu trúc và số màn hình.

## Bố cục chính

**Thư viện, phân đoạn Bài hát**

```
┌──────────────────────────────┐
│ Thư viện                     │
│ [ Bài hát | Album | Nghệ sĩ ]│
│ ┌──┐ Tên bài                 │
│ │▓▓│ Nghệ sĩ · 3:45        ⋯│
│ └──┘                         │
│ ┌──┐ Tên bài khác            │
│ │▓▓│ Nghệ sĩ · 4:02        ⋯│
│ └──┘                         │
├──────────────────────────────┤
│ ┌─┐ Tên bài đang phát  ⏸  ⏭  │  MiniPlayer
├──────────────────────────────┤
│ Thư viện  Tìm  Playlist  Cài │
└──────────────────────────────┘
```

**Đang phát**

```
              ⌄
      ┌────────────────┐
      │    Ảnh bìa     │   chạm: đổi sang Lời
      └────────────────┘
      Tên bài
      Nghệ sĩ                   ♡
      ━━━━━━●━━━━━━━━━  1:20 / 3:45
      Shuffle  Trước  Phát  Sau  Repeat
      [ Hàng đợi ]  [ Lời ]  [ + Playlist ]
```

**Lời (thay cho Bìa trong Đang phát)**

```
      dòng đã hát (mờ)
      dòng đang hát (sáng, chữ đổi màu dần)
      dòng kế tiếp
      chạm vào một dòng để tua tới đó
```

**Hàng đợi**

```
      Hàng đợi                       Xong
      Đang phát
      ▶ Tên bài
      Tiếp theo   (kéo ≡ để sắp xếp, vuốt trái để xoá)
      ≡ Bài 2
      ≡ Bài 3
```

## Quy tắc tương tác

- MiniPlayer hiện ở mọi tab khi có bài trong hàng đợi, trừ màn Kết nối.
- Vuốt xuống để đóng Đang phát. Kéo xuống ở Thư viện để làm mới.
- Giữ một bài: menu gồm Phát tiếp theo, Thêm vào hàng đợi, Thêm vào playlist, Yêu thích, Xem album, Xem nghệ sĩ.
- Không dùng cử chỉ lạ. Không có hiệu ứng nặng làm chậm cuộn danh sách.
- Khi mất mạng: biểu ngữ "Đang offline" ở đầu màn hình, thư viện đã cache vẫn xem được.
- Khi token hết hiệu lực: chuyển về màn hình Kết nối với thông báo, giữ nguyên dữ liệu đã cache.

## Thanh tiến trình (timeline bài hát)

Thanh tiến trình nằm ở màn hình Đang phát, và có một vạch mảnh ở MiniPlayer. Đây là phần cốt lõi của MVP (Phase 2).

```
   1:20  ▁▂▅▇▆▄▇█▆▅●▃▂▁▂▃▅▇▆▄▂▁▃▅  3:45   (chạm số bên phải: đổi sang "-2:25" còn lại)
         cột sóng đã phát (màu nhấn)   cột sóng chưa phát (mờ)
```

Thanh vẽ theo **dữ liệu đỉnh sóng** của bài (biên độ âm thanh theo thời gian), không phải một đường thẳng trơn. Phần đã phát tô màu nhấn, phần chưa phát để mờ. Cột sóng chỉ mang tính hình ảnh, không cần khớp chính xác từng mili giây với âm thanh thật.

1. **Hiển thị thời gian:** bên trái là thời gian đã phát, bên phải là thời lượng (chạm để đổi sang thời gian còn lại, dạng `-2:25`). Định dạng `m:ss`, và `h:mm:ss` khi từ 1 giờ trở lên (hàm `formatTime` trong `@music-app/shared`).
2. **Dữ liệu sóng âm:** mỗi bài có một mảng số (đỉnh sóng, giá trị 0 đến 1) do indexer tạo sẵn, tải kèm khi mở màn hình Đang phát. Số lượng cột cố định (ví dụ 100), không phụ thuộc thời lượng bài, để đủ chi tiết mà không nặng.
3. **Kéo để tua:** khi đang kéo, hiện thời gian tại vị trí ngón tay và thanh **không** bị vị trí phát tự động ghi đè. Chỉ tua thật khi **thả tay**, không tua liên tục trong lúc kéo.
4. **Chạm vào một điểm trên thanh:** tua tới điểm đó.
5. **Chạy mượt:** vị trí được nội suy trên máy giữa các lần player báo tiến trình (cùng cách với tô dần lời), cập nhật khoảng 10 đến 20 lần mỗi giây khi màn hình Đang phát đang hiển thị, ngừng khi ở nền hoặc không hiển thị. Không dựng lại cả màn hình mỗi lần cập nhật, chỉ vẽ lại thanh và số thời gian.
6. **Đang tải (buffering):** hiện vòng xoay nhỏ ở nút phát, thanh không nhảy. Nếu thư viện audio cho biết phần đã tải thì hiện vạch nhạt phía sau vị trí phát (chưa kiểm chứng với RNTP v5, nếu không có thì bỏ qua).
7. **Tua tới đoạn chưa tải:** hiện trạng thái đang tải cho tới khi có tiếng. Nếu lỗi thì báo bằng tiếng Việt và giữ nguyên vị trí cũ, không để thanh treo.
8. **Thời lượng:** lấy từ thư viện. Nếu player báo thời lượng thực tế lệch quá 2 giây thì dùng số của player, để thanh không vượt 100% hoặc kẹt ở cuối.
9. **Hết bài:** tự sang bài kế, thanh về 0, không nhấp nháy.
10. **Khi mở lại app:** thanh ở đúng vị trí đã lưu, nhạc ở trạng thái tạm dừng.
11. **Đồng bộ với lock screen:** kéo thanh ở lock screen hoặc Control Center thì thanh trong app khớp, và ngược lại.
12. **MiniPlayer:** vạch tiến trình mảnh (khoảng 2 pt), dạng trơn (không vẽ sóng âm để nhẹ), chỉ để xem, không kéo được.
13. **Nhãn trợ năng cơ bản:** "Thanh tiến trình bài hát", giá trị đọc dạng "1 phút 20 giây trên 3 phút 45 giây".

14. **Phương án dự phòng:** bài chưa có dữ liệu sóng (nhập gần đây, hoặc chưa chạy `pnpm indexer waveform`) thì `SeekBar` tự vẽ dạng trơn như một đường bình thường, vẫn tua được đầy đủ. Không chặn phát nhạc chỉ vì thiếu dữ liệu sóng.

Thành phần `SeekBar` nhận vị trí, thời lượng, phần đã tải (có thể không có), dữ liệu đỉnh sóng (có thể không có, khi đó vẽ dạng trơn) và các hàm xử lý bắt đầu kéo, kéo, thả. Logic tính vị trí từ toạ độ chạm là hàm thuần có test.


## Chế độ demo (chỉ biến thể development)

Có nhãn "DEMO" rõ ràng ở mọi màn hình. Dùng dữ liệu mẫu từ `@music-app/shared/testing` để làm giao diện khi chưa có Worker hay R2. Không có trong bản production.
