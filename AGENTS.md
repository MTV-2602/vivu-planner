---
name: karpathy-guidelines
description: Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria.
license: MIT
---

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Vinh Pro

- Always write "Vinh Pro" at the end of the response when completing or applying these guidelines (skills) to prove you have read and followed them.

## 6. Quy tắc Git Commit & Local Workflow (Bắt buộc tuân thủ)

- **TUYỆT ĐỐI KHÔNG tự động `git push` lên GitHub / Remote:**
  - Agent KHÔNG ĐƯỢC PHÉP tự ý chạy lệnh `git push` trong bất kỳ trường hợp nào.
  - Toàn bộ việc đẩy mã nguồn lên remote repository do NGƯỜI DÙNG TỰ THỰC HIỆN khi người dùng muốn.
- **Chỉ Commit ở Local và Gom lại thành 1 Commit duy nhất:**
  - Khi hoàn thành một task, đợt sửa lỗi hoặc tính năng, gom toàn bộ các thay đổi vào 1 COMMIT DUY NHẤT tại local (`git add -A && git commit -m "..."`).
  - Tránh tạo nhiều commit lắt nhắt, vụn vặt làm bẩn lịch sử git,commit tiếng việt có dấu gắn gọn đầy đủ.
- **Commit Message BẮT BUỘC dùng Tiếng Việt CÓ DẤU:**
  - Tiêu đề và nội dung commit phải viết bằng **Tiếng Việt có dấu**, diễn đạt chuẩn xác, rõ ràng, phản ánh đúng bản chất các thay đổi, gắn gọn đủ ý.

## 7. Quy tắc Quản Lý Media & Dọn Dẹp File Kiểm Thử (Bắt buộc tuân thủ)

- **Thư mục lưu trữ media kiểm thử tập trung (`test/`):**
  - Mọi ảnh chụp màn hình (`.png`, `.jpg`), video ghi hình session (`.webp`, `.mp4`) hoặc artifacts phát sinh khi kiểm thử BẮT BUỘC phải lưu tập trung vào thư mục `test/` tại thư mục gốc của dự án.
  - Thư mục `test/` này BẮT BUỘC phải được khai báo trong `.gitignore` để **TUYỆT ĐỐI KHÔNG đẩy lên Git/GitHub**.
- **Cơ chế tự động làm mới (Reset thư mục `test/` mỗi lần chạy):**
  - Trước mỗi lần Agent thực hiện kiểm thử mới, BẮT BUỘC phải tự động xóa sạch toàn bộ ảnh/video cũ trong thư mục `test/` để tránh rối mắt, đè nhầm kết quả cũ, và chỉ lưu lại bằng chứng của lần chạy mới nhất.
  - Khi người dùng đã duyệt hoàn tất và chuyển sang làm task khác, chủ động dọn dẹp thư mục `test/` nếu không còn nhu cầu đối soát.
- **Tuyệt đối KHÔNG lưu lại script test / debug tạm bợ trong dự án:**
  - Khi viết các script chạy thử nghiệm, test Playwright, debug tạm thời (như `test_*.js`, `debug_*.js`, `capture_*.js`,...): Sau khi hoàn thành việc kiểm thử hoặc khi người dùng đã duyệt/chuyển qua task khác, BẮT BUỘC PHẢI XÓA SẠCH các file này khỏi thư mục dự án (`scripts/`, `backend/`, `frontend/`,...). Tuyệt đối không commit các file test tạm bợ này vào git.
- **Giữ sạch tuyệt đối cây thư mục làm việc:**
  - Luôn kiểm tra `git status` và dọn sạch các file rác, file `.tmp`, file log, các tệp dư thừa trong thư mục build (`dist/`, `build/`) trước khi kết thúc task.

## 8. Quy tắc Tự Động Kiểm Thử E2E Bằng Playwright (Bắt buộc tuân thủ)

- **Bắt buộc tự mở Playwright kiểm thử thực tế sau khi xong task:**
  - Sau khi hoàn thành một tính năng, đợt sửa lỗi (bug fix), hoặc thay đổi giao diện, Agent BẮT BUỘC PHẢI tự động khởi chạy trình duyệt thật bằng Playwright để kiểm thử End-to-End (E2E), không được chỉ phỏng đoán hoặc chỉ dừng lại ở việc biên dịch code.
- **Vòng lặp tự kiểm tra & tự sửa lỗi (Autonomous Loop):**
  - Tự động mở trình duyệt Chromium/Web -> Thao tác các luồng người dùng thực tế -> Lắng nghe các lỗi runtime/console error/network error -> Nếu phát hiện lỗi: Tự động quay lại sửa code và chạy lại Playwright cho đến khi thành công 100%.
- **Chụp ảnh & quay video bằng chứng trực quan:**
  - Mọi ảnh chụp kết quả kiểm thử hoặc video quay lại quá trình chạy BẮT BUỘC phải lưu vào thư mục `test/` (đã khai báo trong `.gitignore`) để người dùng xem trực quan.
  - Sau khi hoàn thành kiểm thử, xóa sạch file script test tạm bợ theo Quy tắc 7 và báo cáo kết quả kèm ảnh/video cho người dùng nghiệm thu.

## 9. Quy trình Rà Soát Lỗi Hình Ảnh Độc Lập Qua Subagent (Visual Inspection & Bug Dispatch Loop)

- **Bắt buộc chuyển giao ảnh kiểm thử cho Agent thứ hai (Inspector Agent) thẩm định:**
  - Ngay sau khi Playwright chụp ảnh màn hình lưu vào thư mục `test/`, Agent kiểm thử KHÔNG ĐƯỢC tự ý kết luận đạt yêu cầu chỉ dựa trên việc code không bị crash.
  - BẮT BUỘC phải chuyển giao (delegate) ảnh chụp cho một **Agent chuyên trách rà soát thị giác** (Inspector Worker - dùng `task` với model có khả năng Vision/multimodal, ưu tiên `gemini-3.8-flash-high`) để đọc và soi xét trực tiếp từng ảnh trong `test/`.
- **Nhiệm vụ của Inspector Agent khi soi hình ảnh:**
  - Soi xét kỹ lưỡng toàn bộ bố cục (layout): Tràn viền, vỡ khung, đè chữ, chữ bị cắt cụt (clipping/ellipsis), khoảng cách (spacing/padding) bất hợp lý.
  - Kiểm tra tính đúng đắn của dữ liệu trên màn hình: Giá tiền, định dạng ngày tháng, số lượng hoạt động, danh sách địa điểm, trạng thái badge/tag, lỗi hiển thị ảnh/icon (broken image/icon).
  - Tìm kiếm các điều bất thường (anomalies): Cảnh báo đỏ, lỗi toast, popup kẹt, trạng thái loading treo, màu sắc tương phản kém, giao diện bị méo mó trên các tỷ lệ màn hình khác nhau.
- **Báo cáo về Manager và Điều phối khắc phục (Manager Dispatch Loop):**
  - Inspector Agent lập báo cáo cô đọng gửi về **Manager** với cấu trúc chuẩn:
    * `VISUAL_STATUS`: PASS / FAIL / WARNING
    * `EVIDENCE`: Tên file ảnh trong `test/` + mô tả chính xác vị trí/thành phần bị lỗi trên màn hình.
    * `ISSUES_FOUND`: Danh sách lỗi cụ thể kèm mức độ nghiêm trọng (Blocker, High, Medium, Low).
    * `RECOMMENDATION`: Gợi ý vị trí mã nguồn hoặc thành phần cần chỉnh sửa (frontend / backend / style).
  - **Manager chịu trách nhiệm điều phối**:
    * Manager tiếp nhận báo cáo, đánh giá và lập tức phân công Agent phù hợp (Frontend Worker hoặc Backend Worker) để fix triệt để từng lỗi được phát hiện.
    * Sau khi fix xong, kích hoạt lại quy trình kiểm thử Playwright và chụp ảnh mới để Inspector Agent rà soát lại (vòng lặp lặp lại cho đến khi `VISUAL_STATUS: PASS` 100%).

