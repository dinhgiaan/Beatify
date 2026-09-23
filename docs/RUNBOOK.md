# Sổ tay vận hành (dành cho bạn, không cần biết code)

Các việc lặp lại, viết theo từng bước. Lệnh gõ trong terminal tại thư mục repo trên PC.

## 1. Thêm nhạc mới
1. Chép file nhạc vào thư mục nhạc gốc trên PC (`MUSIC_SOURCE_DIR`).
2. (Chỉ lần đầu, hoặc khi muốn dọn tag) chạy `beet import <thư mục>`. Nhớ sao lưu thư mục nhạc trước.
3. Chạy `pnpm indexer sync`. Lệnh này đo âm lượng, tạo danh sách, upload lên R2.
4. Mở app trên iPhone, kéo xuống ở màn hình Thư viện để làm mới.

**Cách khác (từ Phase 4):** mở dashboard, vào **Nhập nhạc**, kéo thả file, xem trước, xác nhận, rồi xem trước đồng bộ và áp dụng. Dashboard chỉ thêm file mới vào thư mục `_imported`, không đụng file có sẵn.

## 2. Gia hạn app (mỗi 7 ngày với Apple ID miễn phí)
1. Bật PC, mở Sideloadly (hoặc AltServer), để iPhone cùng Wi-Fi với PC.
2. Nếu bật auto refresh, app tự được ký lại. Nếu không, cắm cáp, kéo file `.ipa` mới nhất vào Sideloadly và bấm Start (cùng bundle ID thì dữ liệu trong app thường được giữ).
3. Nếu app đã hết hạn và không mở được: làm bước 2. Đừng gỡ app, vì gỡ sẽ mất dữ liệu trong app (playlist chưa xuất).
4. Nếu Settings có hiển thị "Chứng chỉ còn N ngày" thì xem để biết khi nào cần gia hạn (chỉ có nếu tính năng này đã làm, xem `docs/PLAN.md` mục 12.8).

## 3. Cập nhật app bằng bản build mới
1. Trên GitHub: tab **Actions** → chọn workflow build iOS → **Run workflow** → chọn `production` (hoặc `development`).
2. Chờ xong, tải artifact, giải nén `.zip` lấy `.ipa`.
3. Cài đè bằng Sideloadly (cùng bundle ID).
4. Thử xong (theo `docs/ACCEPTANCE.md` mục S) và thấy ổn thì chép file `.ipa` vào thư mục `builds/known-good/` trên máy bạn (thay bản cũ). GitHub chỉ giữ artifact 14 ngày.
5. Chỉ build khi Agent báo "cần build lại: CÓ". Mỗi lần build tốn phút macOS (repo private chỉ có khoảng 200 phút macOS mỗi tháng).

## 4. Đổi token API (khi nghi bị lộ, hoặc định kỳ)
1. Tạo chuỗi ngẫu nhiên dài mới.
2. Trong thư mục `apps/api`: chạy `wrangler secret put API_TOKEN` và dán chuỗi mới.
3. Trên iPhone: Settings → Kết nối, nhập lại token mới.
4. Cập nhật token trong `.dev.vars` trên PC nếu bạn chạy thử local.

## 5. Sao lưu (nên làm mỗi tháng)
| Việc | Cách làm |
|---|---|
| Nhạc gốc | Chép cả thư mục nhạc sang ổ ngoài hoặc dịch vụ lưu trữ khác. R2 không phải bản sao lưu duy nhất |
| Trạng thái indexer, chỉnh sửa metadata, lời sửa tay | Có bản tự động trên R2 (`_meta/`). Chép thêm thư mục `tools/indexer/.state/` và `overrides.json` sang ổ ngoài |
| Playlist | Trong app: Settings → Xuất, lưu file JSON ra Files. Từ Phase 4 có đồng bộ tự động |
| Lời bạn thêm/sửa, ảnh bìa tuỳ chỉnh, lịch sử chỉnh sửa (Phase 4) | Chạy `pnpm indexer backup` (hoặc bấm Sao lưu trong dashboard). Kết quả nằm ở `backups/<ngày-giờ>/`, rồi chép sang ổ ngoài. Khôi phục bằng `pnpm indexer restore --from <thư mục>`: mặc định chỉ hiển thị thay đổi, chỉ ghi khi bạn xác nhận |
| Mật khẩu, token, khoá R2, file `.env` | Lưu trong trình quản lý mật khẩu. **Không** để trong repo |

## 6. Khi PC hỏng hoặc đổi PC
1. Cài lại Node, pnpm, Git, `ffmpeg`, Python và `beets`, iTunes và iCloud (bản của Apple), Sideloadly.
2. `git clone` repo, `pnpm install`.
3. Tạo lại `.env` từ trình quản lý mật khẩu.
4. Chạy `pnpm indexer sync`. Trạng thái id của bài được khôi phục từ `_meta/` trên R2 nên playlist không bị hỏng.
5. Chép lại thư mục nhạc gốc từ bản sao lưu.

## 7. Kiểm tra chi phí (mỗi tháng)
- Cloudflare: R2 → dung lượng và số request so với mức miễn phí.
- GitHub: Settings → Billing and plans → Usage, xem phút Actions.

## 8. Khi app bị lỗi
1. Trong app: Settings → Debug → **Copy**.
2. Dán nội dung đó cho Agent, kèm mô tả việc bạn đã làm.
3. Nếu build trên GitHub hỏng: copy phần log đỏ ở bước bị lỗi.

## 9. Sau khi cập nhật iOS hoặc công cụ
- Không cập nhật iOS ngay khi vừa có bản mới. Chờ vài tuần để Sideloadly/AltStore bắt kịp (khuyến nghị chung, đặc biệt với iOS mới ra).
- Nếu sau khi cập nhật, Sideloadly báo lỗi: cập nhật Sideloadly và iTunes/iCloud (bản của Apple) lên bản mới nhất, cắm lại cáp và thử lại. Nếu vẫn lỗi, thử AltStore hoặc SideStore.
- Tuyệt đối không cập nhật Expo/React Native/Xcode nếu chưa hỏi Agent, vì có thể làm app không mở được.
## 10. Quay lại bản cũ khi bản mới hỏng
1. Lấy file `.ipa` trong `builds/known-good/` (bản bạn đã thử đạt smoke test).
2. Cài đè bằng Sideloadly (cùng bundle ID). Dữ liệu trong app thường được giữ.
3. Nếu bản cũ báo "Cần cập nhật app" vì dữ liệu đã đổi định dạng, nhờ Agent xem `docs/CHANGELOG.md` và quyết định (đưa dữ liệu về định dạng cũ hoặc sửa lỗi bản mới).
4. Báo lỗi của bản mới cho Agent kèm log từ màn hình Debug.
