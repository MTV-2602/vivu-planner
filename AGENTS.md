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
  - Tránh tạo nhiều commit lắt nhắt, vụn vặt làm bẩn lịch sử git, commit tiếng Việt có dấu ngắn gọn đầy đủ.
- **Commit Message BẮT BUỘC dùng Tiếng Việt CÓ DẤU:**
  - Tiêu đề và nội dung commit phải viết bằng **Tiếng Việt có dấu**, diễn đạt chuẩn xác, rõ ràng, phản ánh đúng bản chất các thay đổi, ngắn gọn đủ ý.

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

## 9. Quy tắc Phân Công AI Team — 5 Vai Trò Chuẩn & Luồng 6 Phase Bắt Buộc

### Bảng phân vai & Model bắt buộc:
| Vai trò | Tên hiển thị (`description`) | Model | Trách nhiệm bắt buộc |
|---|---|---|---|
| **Manager** | (Phiên làm việc hiện tại) | Model hiện tại | Phân tích yêu cầu → Lập plan → Dispatch các worker → Thu thập kết quả → Duyệt cuối |
| **Developer Worker** | `Vinh Dev FE` / `Vinh Dev BE` / `Vinh Dev` | `gemini-3.8-flash-high` | Implement code, fix bug, refactor. Gọi song song khi có ≥2 task độc lập |
| **Test Case Writer** | `Vinh TestWriter` | `gemini-3.8-flash-high` | Phân tích tính năng vừa implement → Viết test case chi tiết (happy path + edge + error) |
| **Test Runner** | `Vinh Runner` | `gemini-3.8-flash-high` | Chạy Playwright E2E theo test case, chụp ảnh vào `test/`, báo cáo KHÁCH QUAN (KHÔNG tự kết luận PASS/FAIL) |
| **Test Reviewer / Visual Inspector** | `Vinh Reviewer` / `Vinh Tester` | `gemini-3.8-flash-high` | Độc lập soi ảnh `test/` (layout, data, anomaly), đối chiếu test case → Kết luận OVERALL_STATUS (PASS/FAIL) |
| **Fix Worker** | `Vinh Fixer` | `gemini-3.8-flash-high` | Fix lỗi cụ thể được Reviewer nêu ra |

### Luồng 6 Phase bắt buộc cho mọi task có code mới hoặc thay đổi giao diện:
```
PHASE 1 — PHÂN TÍCH (Manager tự làm):
  → Hiểu yêu cầu, xác định scope, lập kế hoạch

PHASE 2 — PHÁT TRIỂN (Dev Workers, song song khi có thể):
  → Vinh Dev FE: implement frontend
  → Vinh Dev BE: implement backend
  (Dispatch song song trong 1 message nếu không phụ thuộc nhau)

PHASE 3 — VIẾT TEST CASE:
  → Vinh TestWriter: viết test case đầy đủ (happy path + edge + negative)

PHASE 4 — CHẠY TEST:
  → Vinh Runner: nhận test case → chạy Playwright → chụp ảnh vào test/ → báo cáo khách quan → xóa script tạm

PHASE 5 — RÀ SOÁT ĐỘC LẬP:
  → Vinh Reviewer / Vinh Tester: đối chiếu từng TC, soi ảnh layout/data/anomaly → kết luận OVERALL_STATUS

PHASE 6 — MANAGER DUYỆT CUỐI (BẮT BUỘC):
  → Đọc toàn bộ chain, cross-check evidence với yêu cầu ban đầu
  → Quyết định: APPROVED | FIX_REQUIRED | RETEST_NEEDED
  → Nếu FIX_REQUIRED: điều phối Vinh Fixer → lặp lại Phase 4-5-6 đến khi PASS 100%
```

### ❌ CẤM TUYỆT ĐỐI:
- **Manager KHÔNG tự implement code**, dù chỉ 1 file nhỏ (trừ khi user chỉ hỏi đáp hoặc sửa ≤2 dòng nhỏ đơn giản).
- **Manager KHÔNG tự chạy Playwright** và **KHÔNG tự soi ảnh**.
- **KHÔNG để 1 agent làm tất cả** (tự code → tự test → tự soi ảnh).
- **Runner KHÔNG tự kết luận PASS/FAIL** (chỉ Reviewer làm).
- **Reviewer KHÔNG tự sửa code**.

### Cách gọi worker chuẩn bằng `task` tool:
- Luôn truyền `model: "gemini-3.8-flash-high"`.
- Luôn truyền `description: "Vinh [Vai trò]"` (ví dụ: `"Vinh Dev FE"`, `"Vinh Runner"`, `"Vinh Tester"`).
- Khi có ≥2 task độc lập, dispatch đồng thời trong cùng 1 message (`parallel first`).
