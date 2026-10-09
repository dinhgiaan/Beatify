# Checklist nghiệm thu trên iPhone thật

Cách dùng: sau mỗi lần cài bản mới, thử từng mục, đánh dấu Đạt/Lỗi và ghi chú. Gửi các mục **Lỗi** cho Agent kèm ảnh chụp màn hình bảng Debug ở cuối màn hình chính.

Bản build đang thử: `__________` (dòng `Build SHA` hiển thị trong bảng Debug ở cuối màn hình chính, biến thể: **development**)  
Ngày ký chứng chỉ: `__________` (ghi rõ ngày ký để theo dõi hạn 7 ngày)

## S: Smoke test sau mỗi bản build (khoảng 5 phút)
Chạy sau **mỗi** lần cài bản mới, trước khi làm việc khác. Có mục lỗi thì **đừng** coi bản này là "bản tốt".
| # | Việc thử | Kỳ vọng | Kết quả |
|---|---|---|---|
| S1 | Mở app | Không văng, có nội dung (không màn hình trắng hoặc đen) | ☐ Đạt ☐ Lỗi |
| S2 | Cuộn xuống cuối màn hình chính xem bảng Debug | Dòng `Build SHA` và `Hạn chứng chỉ` hiển thị thông tin | ☐ Đạt ☐ Lỗi |
| S3 | Phát một bài | Có tiếng | ☐ Đạt ☐ Lỗi |
| S4 | Khoá màn hình 1 phút | Vẫn phát, lock screen đúng tên bài và nút hoạt động | ☐ Đạt ☐ Lỗi |
| S5 | (Từ Phase 2) Bật chế độ máy bay rồi mở lại app | Thư viện đã cache vẫn xem được | ☐ Đạt ☐ Lỗi |
| S6 | (Từ Phase 3) Tìm một bài, mở một playlist | Đúng kết quả | ☐ Đạt ☐ Lỗi |

Đạt hết thì chép file `.ipa` vào `builds/known-good/` (thay bản cũ) để có đường quay lại.

## P0: Bộ tiêu chí nghiệm thu thiết bị thật Phase 0 (Bảng C3 — 15 tiêu chí)
Điều kiện chuẩn: iPhone 16 iOS 27, Wi-Fi ~50 Mbps, pin > 20%, nhiệt độ máy bình thường (không quá nóng do sạc nhanh), file MP3 ~5MB. Ghi lại điều kiện đo môi trường khi thử nghiệm. Đo ≥ 3 lần cho mỗi tiêu chí (nếu kết quả sát ngưỡng, đo thêm để tăng độ tin cậy).  
*Lưu ý quan trọng:*
- Build biến thể **development** để không bị chặn kết nối HTTP local.
- **Trần thời gian debug:** Tối đa 2 giờ debug cho mỗi điều kiện dừng cụ thể gặp phải; **khi tổng thời gian debug tích lũy chạm trần 4 giờ thì dừng toàn bộ Phase 0 bất kể còn điều kiện nào khác**.

*Quy tắc điều kiện dừng Phase 0 (8 điều kiện dừng — tính nhất quán theo từng loại):*  
- **P0.1 (Thời gian phát — tính theo trung bình):** Đo 3 lần, tính trung bình. Trung bình ≤ 3s = PASS; 3–5s = Đạt có cảnh báo. Kích hoạt dừng khi **Trung bình > 5s sau tối đa 2 giờ debug**.  
- **Lỗi tất định (P0.2a, P0.4a.2):** Kích hoạt dừng khi **3/3 lần đo đều thất bại** sau tối đa 2 giờ debug.  
- **Lỗi cài đặt (P0.6):** Kích hoạt dừng khi **cả Sideloadly và AltStore** đều không cài hoặc không mở được app.  
- **Lỗi chập chờn / độ tin cậy (P0.2c, P0.3, P0.4a.1, P0.4b):** Kích hoạt dừng khi **≥ 2/3 lần đo thất bại**.  

| # | Tiêu chí | Kỳ vọng (PASS) | Lần 1 | Lần 2 | Lần 3 | Kết quả | Ghi chú & Quyết định nếu FAIL |
|---|---|---|---|---|---|---|---|
| P0.1 | Player setup & phát | Tiếng phát ≤ 3s sau khi tap Play (trung bình 3 lần đo: ≤ 3s PASS, 3–5s Cảnh báo) | | | | ☐ Đạt ☐ Lỗi | Delay 200ms sau setup; Trung bình > 5s sau ≤ 2h debug → **Dừng Phase 0** |
| P0.2a | Lock screen — Metadata | Hiển thị đúng tên bài, nghệ sĩ | | | | ☐ Đạt ☐ Lỗi | 3/3 lần luôn trống → **Dừng Phase 0** |
| P0.2b | Lock screen — Ảnh bìa | Hiển thị đúng artwork | | | | ☐ Đạt ☐ Lỗi | Không hiện → Chấp nhận tạm |
| P0.2c | Lock screen — Next/Prev | Bấm Next chuyển bài ≤ 1s | | | | ☐ Đạt ☐ Lỗi | Thử hybrid mode; ≥ 2/3 lần không chuyển bài → **Dừng Phase 0** |
| P0.3 | Background audio | Khóa màn hình vẫn phát: mốc 1 (≥ 5 phút), mốc 2 (≥ 30 phút) | | | | ☐ Đạt ☐ Lỗi | ≥ 2/3 lần < 5 phút → **Dừng Phase 0**; 5–30 phút → ghi nhận Phase 2 |
| P0.4a.1 | Tua vị trí trên app | Kéo thanh tua đến 60% → phát tiếp ≤ 2s | | | | ☐ Đạt ☐ Lỗi | Tăng/giảm buffer; ≥ 2/3 lần đo không phát tiếp ≤ 2s → **Dừng Phase 0** |
| P0.4a.2 | HTTP Range — Worker | Log Worker Cloudflare ghi nhận request có header `Range: bytes=X-` (mã 206) | | | | ☐ Đạt ☐ Lỗi | Kiểm tra Hono handler & console.log; 3/3 lần không có Range request → **Dừng Phase 0** |
| P0.4b | HTTP Range — Tua dồn dập | Tua 5 lần trong 10s → không crash văng app | | | | ☐ Đạt ☐ Lỗi | ≥ 2/3 lần app crash/văng → **Dừng Phase 0** |
| P0.5 | Gapless Δt | Đo ≥ 10 lần. Trung vị Δt ≤ 100ms (đo chính: local; phụ: stream) | | | | ☐ Đạt ☐ Lỗi | 100–300ms: ghi nhận; >300ms: ghi nhận (không block MVP) |
| P0.6 | Sideloadly iOS 27 | Cài thành công, mở app không crash trong 30s | | | | ☐ Đạt ☐ Lỗi | Thử AltStore; Cả hai công cụ fail → **Dừng Phase 0** |
| P0.7 | ExpirationDate chứng chỉ | Ngày trên Debug card khớp lần ký trên Sideloadly | | | | ☐ Đạt ☐ Lỗi | Không đọc được → Ghi nhận bỏ qua |
| P0.8 | Rút tai nghe vật lý | Rút tai nghe → nhạc dừng; cắm lại → không tự phát | | | | ☐ Đạt ☐ Lỗi | Không dừng → Sửa trước MVP |
| P0.9 | Tai nghe Bluetooth | Bấm Next/Prev trên tai nghe (AirPods) hoạt động chuẩn | | | | ☐ Đạt ☐ Lỗi | Không nhận tín hiệu → Ghi nhận |
| P0.10 | Mất mạng hoàn toàn | Tắt Wi-Fi và di động (SIM data tắt) → theo dõi 30s | | | | ☐ Đạt ☐ Lỗi | Crash văng app → Sửa trước MVP; Freeze → Phase 4 |
| P0.11 | Bền vững dữ liệu Stats & Xác minh Overwrite | **Chuẩn bị:** Gỡ cài đặt app cũ trên iPhone rồi cài mới lại (đảm bảo file stats chưa tồn tại trên đĩa để Bước A là lần ghi đầu tiên thật sự).<br>**Bước A (Tạo mới):** Nghe bài 1 > 15s → chờ dòng `Hàng đợi ghi đĩa` báo "Đã ghi xong" → dòng `Atomic Write Branch` hiện `moveAsync trực tiếp (tạo mới)` → **chụp toàn bộ bảng Debug (bao gồm cả dòng Khôi phục .tmp) trước khi kill** → vuốt kill app → mở lại → Profile nhận bài 1.<br>**Bước B (Kiểm chứng Overwrite thực tế):** Nghe bài 2 > 15s → chờ `Hàng đợi ghi đĩa` báo "Đã ghi xong" → quan sát `Atomic Write Branch` (`moveAsync trực tiếp (overwrite)` hay `fallback (delete + move)`) và dòng `Lỗi move trực tiếp` (nếu có) → **chụp toàn bộ bảng Debug trước khi kill** → vuốt kill app → mở lại → Profile nhận đủ 2 bài.<br>*Giới hạn diễn giải:* Nhãn overwrite thành công chứng minh Expo FileSystem cho phép di chuyển đè trên iOS 27 không ném lỗi; tính an toàn khi app bị kill giữa chừng được bảo đảm bởi cơ chế khôi phục `.tmp`. | | | | ☐ Đạt ☐ Lỗi | Mất toàn bộ lịch sử → Nâng ưu tiên B17 |
| P0.12 | Swipe kill khi đang phát | Vuốt tắt app khi đang phát → mở lại app không crash | | | | ☐ Đạt ☐ Lỗi | Mở lại bị crash → Sửa trước MVP |
| P0.13 | Chuyển mạng Wi-Fi → 4G | Tắt Wi-Fi khi 4G bật → app rebuffer rồi phát tiếp | | | | ☐ Đạt ☐ Lỗi | Dừng nhạc → Ghi nhận; Crash → Sửa trước MVP |
| P0.14 | Header Authorization RNTP | (Spike thử nghiệm riêng ở nhánh phụ): Gửi header Auth → Worker nhận đúng, không query `?t=` | | | | ☐ Đạt ☐ Lỗi | Không gửi header → Giữ tạm `?t=` |
| P0.15 | Cuộc gọi / Siri ngắt quãng | Có cuộc gọi → nhạc dừng → kết thúc → tự phát tiếp | | | | ☐ Đạt ☐ Lỗi | Không tự phát lại → Ghi nhận Phase 2 |


## P1: Dữ liệu và API (Phase 1)
Agent chạy các lệnh này và báo kết quả, người dùng chỉ cần xác nhận khi được yêu cầu.
| # | Việc kiểm tra | Kỳ vọng | Kết quả |
|---|---|---|---|
| P1.1 | `curl.exe` gọi `/api/library` không có token | 401 | ☐ Đạt ☐ Lỗi |
| P1.2 | Gọi `/api/library` có token | 200, JSON đúng schema, có `tracks` và `albums` | ☐ Đạt ☐ Lỗi |
| P1.3 | Gọi `/stream/:id` với `Range: bytes=0-99` | 206, có `Content-Range` | ☐ Đạt ☐ Lỗi |
| P1.4 | Chạy `sync` lần 2 khi không có nhạc mới | Không upload lại file nào, `id` không đổi | ☐ Đạt ☐ Lỗi |
| P1.5 | `curl.exe` gọi `/api/health` không có token, rồi có token | 401 khi không có token. 200 khi có token, số bài và số album khớp thư viện | ☐ Đạt ☐ Lỗi |
| P1.6 | Gọi `/stream/` với `id` sai định dạng | Trả lỗi có mã `INVALID_ID`, không phải lỗi chung | ☐ Đạt ☐ Lỗi |
| P1.7 | Mở thử một đường dẫn trực tiếp tới file trên R2 (không qua Worker), ví dụ địa chỉ `r2.dev` | Bị từ chối, bucket không có truy cập công khai | ☐ Đạt ☐ Lỗi |
| P1.8 | (Nếu đã bật luật giới hạn tần suất) gọi `/stream/<id>` liên tục nhiều lần trong thời gian ngắn | Bị chặn sau ngưỡng đã đặt, gọi bình thường vẫn được | ☐ Đạt ☐ Lỗi |

## Phase 2 và 3: Trên iPhone
| # | Việc thử | Kỳ vọng | Kết quả | Ghi chú |
|---|---|---|---|---|
| 1 | Phát một bài, khoá màn hình 10 phút | Nhạc vẫn phát | ☐ Đạt ☐ Lỗi | |
| 2 | Xem lock screen và Control Center | Đúng tên bài, ca sĩ, ảnh bìa, thanh tiến trình | ☐ Đạt ☐ Lỗi | |
| 3 | Bấm play/pause/next/previous và kéo thanh tiến trình trên lock screen | Đều hoạt động | ☐ Đạt ☐ Lỗi | |
| 4 | Tai nghe có dây hoặc Bluetooth: bấm nút play/pause/next | Đều hoạt động | ☐ Đạt ☐ Lỗi | |
| 5 | Rút tai nghe khi đang phát | Nhạc tự dừng | ☐ Đạt ☐ Lỗi | |
| 6 | Có cuộc gọi hoặc báo thức khi đang phát | Nhạc dừng rồi tiếp tục hợp lý | ☐ Đạt ☐ Lỗi | |
| 7 | Bật công tắc im lặng của iPhone | Vẫn có tiếng nhạc | ☐ Đạt ☐ Lỗi | |
| 8 | Chuyển sang app khác 30 phút | Hết bài tự sang bài kế | ☐ Đạt ☐ Lỗi | |
| 9 | Đổi Wi-Fi sang 4G/5G hoặc mất mạng | Báo lỗi dễ hiểu, tự phục hồi khi có mạng | ☐ Đạt ☐ Lỗi | |
| 10 | Tắt hẳn app rồi mở lại | Nhớ hàng đợi và bài đang phát | ☐ Đạt ☐ Lỗi | |
| 11 | Phát liên tiếp vài bài âm lượng khác nhau | Âm lượng đều (ReplayGain) | ☐ Đạt ☐ Lỗi | |
| 12 | Tìm "son tung" khi có bài "Sơn Tùng" | Tìm thấy (bỏ dấu) | ☐ Đạt ☐ Lỗi | |
| 13 | Tạo playlist, thêm 3 bài, phát, tắt app mở lại | Playlist còn nguyên | ☐ Đạt ☐ Lỗi | |
| 14 | Mở tab Album, phát cả album | Đúng thứ tự bài | ☐ Đạt ☐ Lỗi | |
| 15 | Bật chế độ máy bay rồi mở app | Xem được thư viện đã cache, phát bài lỗi thì báo rõ | ☐ Đạt ☐ Lỗi | |
| 16 | Bật shuffle, phát toàn thư viện khoảng 20 bài | Không bài nào lặp lại trước khi hết vòng | ☐ Đạt ☐ Lỗi | |
| 17 | Bấm Previous khi đang shuffle | Quay lại đúng bài vừa nghe | ☐ Đạt ☐ Lỗi | |
| 18 | Tắt shuffle giữa chừng | Tiếp tục từ bài đang phát theo thứ tự gốc, không nhảy bài | ☐ Đạt ☐ Lỗi | |
| 19 | Bật shuffle rồi chọn "Phát tiếp theo" một bài | Bài đó phát ngay sau bài hiện tại | ☐ Đạt ☐ Lỗi | |
| 20 | Mở màn hình Hàng đợi, kéo đổi vị trí một bài, xoá một bài | Thứ tự phát đúng như đã sắp | ☐ Đạt ☐ Lỗi | |
| 21 | Nghe 5 bài rồi mở "Nghe gần đây" | Hiện đủ 5 bài, bài mới nhất ở trên, còn nguyên sau khi tắt app mở lại | ☐ Đạt ☐ Lỗi | |
| 22 | Đổi token trên Worker (RUNBOOK mục 4) rồi mở app | Hiện màn hình nhập lại token, không crash, thư viện đã cache vẫn xem được, nhập token mới xong dùng lại bình thường | ☐ Đạt ☐ Lỗi | |
| 23 | Nhập sai token ở màn hình Kết nối | Báo "token không đúng" bằng tiếng Việt, không lưu | ☐ Đạt ☐ Lỗi | |
| 24 | (Nếu spike đọc được) Xem Settings | Hiện số ngày còn lại của chứng chỉ, khớp lần ký gần nhất (lệch không quá 1 ngày) | ☐ Đạt ☐ Lỗi | |
| 25 | Mở tab Thư viện → Nghệ sĩ, chọn một nghệ sĩ | Thấy đúng album và bài. Sau khi gộp tên trong dashboard rồi sync, app chỉ còn một nghệ sĩ | ☐ Đạt ☐ Lỗi | |
| 26 | Kéo thanh tiến trình ở màn hình Đang phát rồi thả | Hiện thời gian tại ngón tay trong lúc kéo, thanh không nhảy lại, nhạc tua đúng tới vị trí thả | ☐ Đạt ☐ Lỗi | |
| 27 | Chạm vào giữa thanh | Tua tới đó | ☐ Đạt ☐ Lỗi | |
| 28 | Nhìn thanh khi đang phát khoảng 1 phút | Chạy đều, không giật. Thời gian đã phát và thời lượng khớp với đồng hồ | ☐ Đạt ☐ Lỗi | |
| 29 | Tua tới đoạn cuối khi mạng yếu | Hiện trạng thái đang tải rồi có tiếng, hoặc báo lỗi rõ và giữ vị trí cũ, thanh không treo | ☐ Đạt ☐ Lỗi | |
| 30 | Nhìn MiniPlayer khi đang phát | Có vạch tiến trình mảnh chạy theo | ☐ Đạt ☐ Lỗi | |
| 31 | Mở một bài đã có dữ liệu sóng âm | Thanh vẽ theo hình dạng sóng, không phải đường thẳng trơn | ☐ Đạt ☐ Lỗi | |
| 32 | Mở một bài **chưa** có dữ liệu sóng âm (nếu có bài nào) | Thanh vẫn hiện dạng trơn, tua bình thường, không lỗi | ☐ Đạt ☐ Lỗi | |

## D: Dashboard local (Phase 4, chỉ khi đã làm)
| # | Việc thử | Kỳ vọng | Kết quả | Ghi chú |
|---|---|---|---|---|
| D1 | Chạy `pnpm indexer ui`, mở URL in ra ở terminal | Dashboard mở được, thấy đủ bài | ☐ Đạt ☐ Lỗi | |
| D2 | Mở URL không có token (xoá phần token) | Bị từ chối | ☐ Đạt ☐ Lỗi | |
| D3 | Từ iPhone cùng Wi-Fi, thử mở địa chỉ IP của PC và cổng đó | Không truy cập được | ☐ Đạt ☐ Lỗi | |
| D4 | Sửa tên một bài, bấm xem trước sync | Bài đó hiện trong danh sách thay đổi, chưa upload gì | ☐ Đạt ☐ Lỗi | |
| D5 | Bấm áp dụng, rồi kéo làm mới trong app trên iPhone | App hiện tên mới | ☐ Đạt ☐ Lỗi | |
| D6 | Chạy lại `sync` (hoặc `beets`) | Tên đã sửa không bị mất | ☐ Đạt ☐ Lỗi | |
| D7 | Bấm hoàn tác một trường đã sửa | Về đúng giá trị gốc từ file | ☐ Đạt ☐ Lỗi | |
| D8 | Xem trang Thống kê | Số bài và dung lượng khớp với thực tế (sai lệch nhỏ chấp nhận được) | ☐ Đạt ☐ Lỗi | |
| D9 | Chuẩn bị vài bài thiếu ảnh bìa và một cặp bài trùng, mở trang Sức khoẻ thư viện | Đếm và liệt kê đúng | ☐ Đạt ☐ Lỗi | |
| D10 | Gộp hai tên nghệ sĩ viết khác nhau ("Sơn Tùng" và "Son Tung") thành một, chạy sync, làm mới app | App chỉ còn một tên, album gom đúng | ☐ Đạt ☐ Lỗi | |
| D11 | Thay ảnh bìa một album, chạy sync, làm mới app | Ảnh mới hiện trong app và trên lock screen, không dính ảnh cũ | ☐ Đạt ☐ Lỗi | |
| D12 | Sửa vài bài, mở Lịch sử chỉnh sửa, khôi phục bản trước | Về đúng trạng thái trước khi sửa | ☐ Đạt ☐ Lỗi | |
| D13 | Bấm Sao lưu | Có thư mục `backups/<ngày-giờ>/` với `manifest.json` liệt kê file | ☐ Đạt ☐ Lỗi | |
| D14 | Thử khôi phục từ bản sao lưu (xem trước) | Hiện danh sách thay đổi, chưa ghi gì cho tới khi bạn xác nhận | ☐ Đạt ☐ Lỗi | |
| D15 | Kéo thả 3 file: một bài mới, một bài đã có trong thư viện, một file không phải nhạc nhưng đổi đuôi thành `.mp3` | Bảng xem trước báo đúng: Mới, Trùng, Lỗi | ☐ Đạt ☐ Lỗi | |
| D16 | Sửa tên ca sĩ ngay trong bảng xem trước rồi xác nhận | File được chép vào `_imported`, chưa upload gì. Xem trước đồng bộ hiện bài mới với tên đã sửa | ☐ Đạt ☐ Lỗi | |
| D17 | Nhập lại đúng file vừa nhập | Báo Trùng, không chép thêm | ☐ Đạt ☐ Lỗi | |
| D18 | Nhập file có tên chứa dấu tiếng Việt và ký tự Windows không cho phép | Chép được, tên đích an toàn, không mất dấu | ☐ Đạt ☐ Lỗi | |
| D19 | Hoàn tác lô vừa nhập trước khi đồng bộ | Đúng những file của lô đó bị xoá khỏi `_imported`, file khác không bị đụng | ☐ Đạt ☐ Lỗi | |
| D20 | Kiểm tra trong thư mục nhạc gốc sau khi nhập | Không có file nào bị ghi đè, sửa hay xoá ngoài các file mới thêm | ☐ Đạt ☐ Lỗi | |
| D21 | (Nếu làm) Dán link trang web (không phải file nhạc), rồi link tới địa chỉ mạng nội bộ | Cả hai bị từ chối bằng thông báo tiếng Việt | ☐ Đạt ☐ Lỗi | |

## E: Lời bài hát (Phase 4, chỉ khi đã làm)
| # | Việc thử | Kỳ vọng | Kết quả | Ghi chú |
|---|---|---|---|---|
| E1 | Xem báo cáo độ phủ L0 | Có số liệu riêng cho nhạc Việt và nhạc ngoại | ☐ Đạt ☐ Lỗi | |
| E2 | Mở Now Playing với bài có lời đồng bộ | Dòng đang hát được tô sáng, khớp với giọng hát, tự cuộn | ☐ Đạt ☐ Lỗi | |
| E3 | Chạm vào một dòng lời | Nhạc tua tới đúng đoạn đó | ☐ Đạt ☐ Lỗi | |
| E4 | Mở bài chỉ có lời thường | Lời hiển thị, cuộn tay được | ☐ Đạt ☐ Lỗi | |
| E5 | Mở bài không có lời | Thông báo thân thiện, không lỗi | ☐ Đạt ☐ Lỗi | |
| E6 | Xem lời bài tiếng Việt | Dấu tiếng Việt hiển thị đúng, dòng dài xuống dòng | ☐ Đạt ☐ Lỗi | |
| E7 | Tua bài, rồi đổi bài | Lời theo kịp, không bị tô sáng sai dòng | ☐ Đạt ☐ Lỗi | |
| E8 | Sửa lời một bài trong dashboard, chạy lại `sync` | Bản sửa không bị ghi đè | ☐ Đạt ☐ Lỗi | |
| E9 | (Nếu làm L3/L4) Nghe và đọc thử 10 bài Việt và 10 bài ngoại | Bạn đánh giá được chất lượng và quyết định giữ hay bỏ | ☐ Đạt ☐ Lỗi | |
| E10 | Thêm lời cho bài chưa có bằng cách dán, lưu lại | Còn nguyên sau khi đóng app và mở lại | ☐ Đạt ☐ Lỗi | |
| E11 | Sửa một dòng lời có sẵn, rồi bấm "Khôi phục bản gốc" | Bản sửa hiện đúng, khôi phục đưa lời về ban đầu | ☐ Đạt ☐ Lỗi | |
| E12 | Bấm chỉnh lệch ±0,5 giây khi đang phát | Lời khớp hơn với giọng hát, giá trị được lưu | ☐ Đạt ☐ Lỗi | |
| E13 | Chạy lại `sync` sau khi sửa lời | Lời bạn sửa không bị ghi đè | ☐ Đạt ☐ Lỗi | |
| E14 | Bật tô dần từng chữ, xem một bài dài rồi tua | Chữ đổi màu đều theo nhạc, không giật, tua xong không tô sai dòng | ☐ Đạt ☐ Lỗi | |
| E15 | (Nếu làm) Dùng "Chạm để đồng bộ" cho một bài | Tạo được mốc thời gian, chỉnh lại từng dòng được | ☐ Đạt ☐ Lỗi | |
| E16 | Đặt file `.lrc` cùng tên cạnh một bài trong `fixtures/music/`, chạy `lyrics`, mở bài đó trong app | Lời hiện đúng, nguồn ghi là file cạnh nhạc, bản chỉnh tay (nếu có) vẫn thắng | ☐ Đạt ☐ Lỗi | |

## F: Crossfade (Phase 4, thử nghiệm, chỉ khi đã làm)
| # | Việc thử | Kỳ vọng | Kết quả | Ghi chú |
|---|---|---|---|---|
| F1 | Bật crossfade 4 giây, để hai bài chuyển tự nhiên | Bài cũ nhỏ dần, bài mới lớn dần, không có khoảng lặng | ☐ Đạt ☐ Lỗi | |
| F2 | Khoá màn hình trong lúc chuyển bài | Vẫn mượt, lock screen đổi tên bài đúng lúc | ☐ Đạt ☐ Lỗi | |
| F3 | Bấm Next giữa lúc đang crossfade | Không chồng âm thanh lỗi, không crash | ☐ Đạt ☐ Lỗi | |
| F4 | Tắt crossfade | Trở về chuyển bài thường | ☐ Đạt ☐ Lỗi | |
## G: Nghe offline (Phase 4, chỉ khi đã làm)
| # | Việc thử | Kỳ vọng | Kết quả | Ghi chú |
|---|---|---|---|---|
| G1 | Tải một bài qua Wi-Fi, bật chế độ máy bay, phát bài đó | Phát được | ☐ Đạt ☐ Lỗi | |
| G2 | Bật "Chỉ tải qua Wi-Fi", tắt Wi-Fi bật dữ liệu di động, bấm tải một bài | Báo "Đang chờ Wi-Fi", không dùng dữ liệu di động. Bật lại Wi-Fi thì tự tải tiếp | ☐ Đạt ☐ Lỗi | |
| G3 | Đang tải giữa chừng thì chuyển từ Wi-Fi sang dữ liệu di động | Dừng ngay, chuyển sang "Đang chờ Wi-Fi", tiếp tục được sau đó | ☐ Đạt ☐ Lỗi | |
| G4 | Tải cả một album | Hiện tiến trình, đủ bài, phát offline được | ☐ Đạt ☐ Lỗi | |
| G5 | Vào Settings xem dung lượng, xoá một bài đã tải | Dung lượng giảm đúng, bài đó không còn phát offline | ☐ Đạt ☐ Lỗi | |
| G6 | Đặt giới hạn dung lượng nhỏ rồi tải vượt quá | Báo rõ, không tải thêm, không hỏng file đã có | ☐ Đạt ☐ Lỗi | |
| G7 | Ở chế độ máy bay, mở lời và ảnh bìa của bài đã tải | Xem được | ☐ Đạt ☐ Lỗi | |
| G8 | Tắt app khi đang tải rồi mở lại | Không có file hỏng, tiếp tục hoặc thử lại được | ☐ Đạt ☐ Lỗi | |
| G9 | Khoá màn hình khi đang tải | Ghi lại tải có tiếp tục hay không (dữ liệu để quyết định) | ☐ Có ☐ Không | |
