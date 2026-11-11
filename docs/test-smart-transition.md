# Hướng Dẫn Kiểm Thử Tính Năng Smart Transition (Beatify)

Tài liệu này cung cấp hướng dẫn từng bước và danh sách kiểm thử (checklist) chi tiết để nghiệm thu tính năng **Smart Transition (Chuyển bài thông minh theo BPM & Khóa Camelot)** trên iPhone thật.

---

## I. Hướng Dẫn Vận Hành Hệ Thống

### 1. Phân Tích Âm Thanh Thư Viện Trên PC (Chạy Indexer)
Để trích xuất các chỉ số `bpm`, `key` (Camelot), `introEnd`, `outroStart` vào metadata bài hát:
```bash
# Lệnh 1: Phân tích toàn bộ kho nhạc (có bộ đệm cache, tự động bỏ qua bài đã phân tích)
pnpm indexer analyze

# Lệnh 2: Xem kết quả quét
pnpm indexer scan

# Lệnh 3: Đồng bộ metadata hoàn chỉnh lên Cloudflare R2
pnpm indexer sync
```

### 2. Có Cần Build Lại File `.ipa` Không?
* **KHÔNG CẦN BUILD LẠI `.ipa`:** Tính năng Smart Transition được thiết kế 100% bằng TypeScript/JavaScript và sử dụng API sẵn có của `@rntp/player` (`setVolume`, `seekTo`, `skipToIndex`, `preload`).
* Bạn chỉ cần mở app Beatify hiện có trên iPhone hoặc chạy development client (Expo) để trải nghiệm ngay.

---

## II. Bảng Checklist Kiểm Thử Trên iPhone Thật

Hãy thực hiện lần lượt 5 kịch bản dưới đây và ghi nhận kết quả vào bảng:

| STT | Kịch bản kiểm thử | Thao tác thực hiện | Kết quả kỳ vọng đạt được | Kết quả thực tế |
|:---:|:---|:---|:---|:---:|
| **1** | **Màn hình sáng, 2 bài hợp BPM/Key** | Mở app, phát bài A đến gần cuối (hoặc tua đến trước mốc kết thúc khoảng 10 giây). | Bài A hạ dần âm lượng mượt mà (Equal-Power), chuyển giao ngay tại điểm dứt nhạc sang bài B tại mốc `introEnd`, không có khoảng lặng chết, âm lượng bài B giữ đúng chuẩn ReplayGain. | ☐ Đạt  ☐ Lỗi |
| **2** | **Khóa màn hình giữa bài, chờ tự chuyển** | Bật phát bài A, khóa màn hình iPhone. Chờ bài A phát hết và tự chuyển sang bài B trên màn hình khóa (Lock Screen). | Nhạc vẫn chuyển sang bài B bình thường, **âm lượng TUYỆT ĐỐI KHÔNG BỊ KẸT THẤP**. Khi mở sáng màn hình và vào Settings ➔ **Transition Log**, thấy bản ghi ghi nhận `APP STATE: BACKGROUND`, `Vol về: 100%` (hoặc đúng ReplayGain). | ☐ Đạt  ☐ Lỗi |
| **3** | **Bài thiếu metadata (Fallback an toàn)** | Phát bài hát chưa có metadata BPM/Key (hoặc bài MP3 mới thêm chưa chạy indexer). | App không bị crash, tự động chuyển bài mượt mà ở mốc 4 giây cuối theo ReplayGain cơ bản. | ☐ Đạt  ☐ Lỗi |
| **4** | **Chế độ An toàn (Safe Mode)** | Vào Cài đặt ➔ DJ Engine ➔ Bật **Chế độ an toàn (Safe Mode)**. Phát nhạc qua điểm chuyển. | App chuyển bài chính xác tại điểm `outroStart` ➔ `introEnd` mà không can thiệp hạ âm lượng qua JavaScript (phù hợp tuyệt đối nếu người dùng muốn loại bỏ rủi ro JS timer khi tắt màn hình). | ☐ Đạt  ☐ Lỗi |
| **5** | **Tai nghe Bluetooth & Nút Lock Screen (Next/Prev)** | 1. Khi màn hình khóa: bấm nút Next / Prev trên widget Lock Screen hoặc Control Center.<br>2. Trên tai nghe Bluetooth / AirPods: bấm đúp/chạm để chuyển bài tiếp hoặc bài trước.<br>3. Thử bấm Next ngay giữa lúc bài đang mờ dần (đang fade). | - Các nút điều khiển native trên Lock Screen và tai nghe Bluetooth hoạt động 100% nhạy bén.<br>- Nếu bấm chuyển bài giữa lúc đang fade: fade lập tức bị hủy an toàn, volume được khôi phục ngay về mức ReplayGain chuẩn của bài mới, không bị kẹt âm lượng hay giật tiếng.<br>- Rút tai nghe: nhạc tự động dừng an toàn (Audio Becoming Noisy). | ☐ Đạt  ☐ Lỗi |

---

## III. Cách Đọc và Chẩn Đoán Qua "Transition Log"

1. Mở app Beatify trên iPhone.
2. Tại màn hình chính hoặc tab Thư viện, mở modal **Cài đặt & Hồ sơ**.
3. Tại mục **CHUYỂN BÀI THÔNG MINH (SMART TRANSITION)**, bấm nút:  
   👉 **`[ 🎛️ Xem Nhật ký chuyển bài (Transition Log) ]`**
4. Trong màn hình chẩn đoán:
   - **Badge quan hệ Camelot:**
     - `CÙNG TÔNG`: Hai bài cùng khóa (vd: `8A` ➔ `8A`) ➔ Mix sâu 6 - 8s.
     - `BẬC 5 (±1H)`: Khóa kề nhau trên đồng hồ (vd: `8A` ➔ `9A`) ➔ Mix hài hòa 4 - 6s.
     - `ENERGY BOOST (+2H)`: Nhảy 2 giờ (vd: `8A` ➔ `10A`) ➔ Nâng tông tạo hưng phấn.
     - `KHÔNG TƯƠNG THÍCH`: Lệch tông ➔ Rút ngắn fade xuống 2 - 3s để tránh xung đột nốt.
   - **ΔBPM:** Chênh lệch nhịp (%) giữa 2 bài hát.
   - **App State:** `ACTIVE` (Foreground) hoặc `BACKGROUND` (khi màn hình đang khóa/tắt).
   - **Vol về:** Âm lượng mục tiêu mà hệ thống đã khôi phục (đảm bảo không bao giờ kẹt ở 0% hoặc 30%).
   - Nút **Làm mới** và nút **Xóa nhật ký** để bắt đầu đợt test mới.

