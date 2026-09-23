# Nhạc mẫu để test

Chép 5-10 bài nhạc mẫu vào `fixtures/music/` (thư mục này bị `.gitignore`, **không commit**).

Nên có đủ các trường hợp để Agent test được:
- Vài bài **nhạc Việt** (tên có dấu, nghệ sĩ có dấu) và vài bài **nhạc ngoại**.
- Một bài có ảnh bìa nhúng và một bài không có.
- Một bài có file `.lrc` cùng tên nằm cạnh (để thử đọc lời cạnh file nhạc).
- Một bài thiếu tag (chỉ có tên file).
- Nếu có: một bài FLAC (để thử chuyển mã) và hai bài cùng album (để thử gom album).
- Để thử Nhập nhạc (Phase 4): một bài đã có trong thư viện (để thử báo trùng) và một file không phải nhạc nhưng đổi đuôi thành `.mp3` (để thử báo lỗi).

Lý do: Agent (đặc biệt Antigravity) thường chỉ được đọc trong thư mục dự án, nên không thấy thư mục nhạc thật của bạn. Dùng file mẫu giúp test mà không phải cấp thêm quyền.
