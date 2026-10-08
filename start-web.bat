@echo off
chcp 65001 > nul
echo ===================================================
echo   BEATIFY MANAGEMENT CONSOLE - LOCAL WEB SERVER
echo ===================================================
echo.
echo Đang mở trình duyệt tới http://127.0.0.1:4000 ...
start http://127.0.0.1:4000
echo Đang khởi động máy chủ Beatify...
echo (Giữ cửa sổ này mở trong khi sử dụng Web Console)
echo.
pnpm ui
pause
