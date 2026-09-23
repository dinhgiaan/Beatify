# Bộ file cho AI Agent (music-app)

**Đọc `docs/START-HERE.md` trước.** Dự án làm hoàn toàn bằng Antigravity.

Giải nén vào **thư mục gốc của repo** (một lần duy nhất).

| File/thư mục | Vai trò |
|---|---|
| `docs/START-HERE.md` | Hướng dẫn cho bạn: gửi file nào, làm theo thứ tự nào |
| `AGENTS.md` | Quy tắc chung cho mọi Agent (Antigravity tự đọc) |
| `CLAUDE.md` | Trỏ tới `AGENTS.md` (chỉ cần khi dùng Claude Code) |
| `.agents/skills/*` | 9 skill riêng của dự án (Antigravity tự nạp). Agent khác thì mở `SKILL.md` khi cần |
| `docs/PLAN.md` | Kế hoạch đầy đủ (v1.5) |
| `docs/STATUS.md` | Tiến độ, Agent tự cập nhật |
| `docs/ACCEPTANCE.md` | Checklist bạn thử trên iPhone |
| `docs/RUNBOOK.md` | Sổ tay vận hành cho bạn |
| `docs/PLAN-SUMMARY.md` | Tóm tắt kế hoạch và bản đồ tài liệu. Agent đọc file này trước, không cần đọc cả `PLAN.md` |
| `docs/SCREENS.md` | Sơ đồ màn hình, điều hướng, bố cục |
| `docs/IDEAS.md` | Danh sách chờ và các ý tưởng đã loại |
| `docs/GLOSSARY.md` | Từ điển thuật ngữ cho bạn |
| `docs/TROUBLESHOOTING.md` | Bảng xử lý lỗi thường gặp cho bạn |
| `docs/CHANGELOG.md` | Lịch sử thay đổi của plan |
| `.github/workflows/` | `ci.yml` (kiểm tra trên Linux) và `build-ios.yml` (build `.ipa` trên macOS, chạy tay) |
| `packages/shared` | Schema Zod dùng chung (đã có test) |
| `fixtures/README.md` | Hướng dẫn chuẩn bị nhạc mẫu để Agent test |
| `.gitignore`, `*.example` | Không commit secret, mẫu biến môi trường |

Nếu sau này dùng Claude Code: sao chép `.agents/skills` thành `.claude/skills` (dùng bản sao, không dùng symlink vì Windows có thể không nhận).

Sau khi giải nén: `git init`, commit, rồi mở thư mục này bằng Agent. `.gitignore` đã loại `.env`, `.dev.vars`, `*.ipa` và `fixtures/music/`.
