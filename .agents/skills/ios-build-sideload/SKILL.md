---
name: ios-build-sideload
description: Build file .ipa chưa ký cho iOS bằng GitHub Actions (macOS runner, không cần Mac) và hướng dẫn người dùng cài lên iPhone bằng Sideloadly/AltStore, gồm biến thể development/production, dev client, hot reload, gia hạn 7 ngày và chi phí phút macOS. Dùng skill này mỗi khi viết hoặc sửa workflow build-ios.yml, app.config.ts, gặp lỗi build/prebuild/xcodebuild/pod install, hoặc khi người dùng hỏi cách cài app, ký lại app, app hết hạn, "build lại", "cài lên iPhone", "Sideloadly", "AltStore".
---

# Build `.ipa` không cần Mac và cài lên iPhone

Bối cảnh: người dùng dùng Windows, Apple ID miễn phí, không App Store. App ký bằng Sideloadly (hoặc AltStore) trên PC sau khi CI build ra `.ipa` **chưa ký**.

## Nguyên tắc

- Dùng **Continuous Native Generation**: không commit `ios/`, CI chạy `npx expo prebuild --platform ios` rồi `xcodebuild` với `CODE_SIGNING_ALLOWED=NO`.
- Hai biến thể (cài song song được vì khác bundle ID), điều khiển bằng biến môi trường `APP_VARIANT`:

| Biến thể | Bundle ID | Cấu hình | Dùng để |
|---|---|---|---|
| `development` | `com.<github-username>.beatify.dev` | Debug + `expo-dev-client` | Thử tính năng, hot reload từ PC |
| `production` | `com.<github-username>.beatify` | Release | Dùng hằng ngày, chạy độc lập |

- Apple ID miễn phí giới hạn **3 app sideload**. Dự án dùng 2. Không thêm biến thể thứ ba nếu chưa hỏi.
- Đổi `com.<github-username>` thành bundle ID thật do người dùng chọn (hỏi một lần, ghi vào `docs/STATUS.md`). **Chốt trước lần cài đầu tiên**: đổi bundle ID sau khi đã cài coi như tạo app mới, mất dữ liệu của app cũ (playlist chưa xuất, cache).

## Workflow mẫu

Bản mẫu ở `references/build-ios.template.yml`. **Chưa được chạy thử** nên khi triển khai phải chạy thật, đọc log và chỉnh theo lỗi thực tế (tên workspace/scheme, đường dẫn trong monorepo, phiên bản Node, cache). Điểm cần giữ:

- Trigger `workflow_dispatch` với input chọn `development` hoặc `production`.
- Tên workspace và scheme lấy động từ thư mục `ios/` sau prebuild, không hard-code.
- Gói `.app` vào `Payload/`, nén thành `.ipa`, upload làm artifact.
- Truyền mã commit vào build bằng `EXPO_PUBLIC_BUILD_SHA` để màn hình Debug hiển thị đúng bản build.
- Cache pnpm (qua `actions/setup-node`) và Pods để giảm thời gian.
- Root `package.json` có trường `packageManager` để `pnpm/action-setup` biết phiên bản.

## Chi phí phút macOS

- Repo **public**: runner macOS miễn phí.
- Repo **private** (gói Free): 2.000 phút/tháng, macOS tính **hệ số 10**, tương đương khoảng 200 phút macOS. Vì vậy chỉ build khi cần: đổi thư viện native, đổi `app.config.ts`, hoặc cần bản production mới.
- Đặt `timeout-minutes` cho job để build treo không đốt hết phút.
- Nhắc người dùng chọn repo public/private ở Phase 0 và ghi vào STATUS.

## Khi nào phải build lại

Người dùng **chỉ sử dụng bản build Production (.ipa)** cài qua Sideloadly trên Windows (không có máy Mac, không chạy Metro dev-server). Do đó, bất kỳ khi nào có cập nhật tính năng, chỉnh sửa logic hay giao diện JS/TS mà người dùng muốn sử dụng trên iPhone thì **bắt buộc phải trigger GitHub Actions build lại file .ipa Production** và tải về cài lại qua Sideloadly.
Khi báo cáo cho người dùng, luôn nêu rõ: **CÓ CẦN BUILD LẠI .IPA PRODUCTION** và nêu rõ bản chất (chỉ cập nhật mã JS/TS hay có can thiệp cấu hình native).

## iOS 27 và Xcode (quan trọng)

Thiết bị của người dùng là iPhone 16 chạy iOS 27. Chi tiết và nguồn ở `docs/PLAN.md` mục 12.7. Tóm tắt quy tắc:

- App build bằng SDK iOS 27 (Xcode 27) bắt buộc dùng UIScene lifecycle, nếu không có thể không mở đúng trên iOS 27. Đã có báo cáo app Expo trống hoặc không khởi chạy khi build bằng Xcode 27 beta.
- **Ghim Xcode 26.x** trong workflow. Đừng dùng `macos-latest` mà không chọn Xcode: nhãn này có thể chuyển sang image mặc định dùng Xcode 27. Kiểm tra danh sách phần mềm của `runner-images` hiện hành, chọn bằng `xcode-select` và in `xcodebuild -version` cùng `xcodebuild -showsdks` vào log.
- Dùng **Expo SDK 57 ổn định**. Không dùng SDK 58 beta cho bản hằng ngày.
- Việc app build bằng Xcode 26.x chạy được trên iOS 27 là suy luận, cần người dùng xác nhận bằng mục P0.1 và P0.6 trong `docs/ACCEPTANCE.md`.
- Không đổi Xcode, runner, Expo SDK khi chưa hỏi người dùng. Đổi tức là phải build lại.

## Hướng dẫn cài cho người dùng (đưa nguyên văn khi cần)

Chuẩn bị một lần:
1. Trên PC cài **iTunes** và **iCloud** bản tải từ trang chủ Apple, **không dùng bản Microsoft Store** (nếu đã cài thì gỡ trước). Cài **Sideloadly**.
2. Trên iPhone bật **Developer Mode**: Cài đặt → Quyền riêng tư & Bảo mật → Chế độ nhà phát triển → Bật → khởi động lại.
3. Cắm cáp, chọn "Tin cậy máy tính này", mở iTunes một lần để nhận thiết bị.

Mỗi lần cài:
1. GitHub → tab **Actions** → chọn workflow build iOS → **Run workflow** → chọn biến thể.
2. Chờ xong, tải **artifact** về, giải nén `.zip` lấy file `.ipa`.
3. Mở Sideloadly, chọn iPhone, kéo `.ipa` vào, nhập Apple ID, bấm **Start**. Nên bật auto refresh.
4. Lần đầu: iPhone → Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị → chọn Apple ID → **Tin cậy**.
5. Cài đè bản mới với **cùng bundle ID** thì dữ liệu trong app thường được giữ.

Gia hạn: chứng chỉ Apple ID miễn phí hết hạn sau **7 ngày**. Giữ Sideloadly (hoặc AltServer) chạy trên PC, iPhone cùng Wi-Fi để tự làm mới. Nếu app đã hết hạn thì cài lại `.ipa` cùng bundle ID.

## Lỗi hay gặp và hướng xử lý

| Triệu chứng | Nguyên nhân thường gặp | Hướng xử lý |
|---|---|---|
| `expo prebuild` lỗi plugin | Plugin/thư viện chưa tương thích SDK hiện tại | Chạy `npx expo-doctor`, đối chiếu phiên bản |
| `pod install` lỗi | Thư viện chưa hỗ trợ New Architecture | Kiểm tra tài liệu thư viện, tìm bản mới, hỏi người dùng trước khi đổi |
| Không tìm thấy `.app` | Sai đường dẫn `Build/Products/<Config>-iphoneos` | In `ls` thư mục build trong log rồi chỉnh |
| Sideloadly báo lỗi Apple ID | Đã đạt giới hạn App ID mỗi tuần hoặc 3 app | Gỡ bớt app sideload, đợi hoặc dùng Apple ID khác |
| App mở rồi thoát ngay | Chưa bật Developer Mode hoặc chưa tin cậy | Làm lại bước chuẩn bị 2 và bước 4 |
