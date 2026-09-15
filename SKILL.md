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
  + Agent KHÔNG ĐƯỢC PHÉP tự ý chạy lệnh `git push` trong bất kỳ trường hợp nào.
  + Toàn bộ việc đẩy mã nguồn lên remote repository do NGƯỜI DÙNG TỰ THỰC HIỆN khi người dùng muốn.
- **Chỉ Commit ở Local và Gom lại thành 1 Commit duy nhất:**
  + Khi hoàn thành một task, đợt sửa lỗi hoặc tính năng, gom toàn bộ các thay đổi vào 1 COMMIT DUY NHẤT tại local (`git add -A && git commit -m "..."`).
  + Tránh tạo nhiều commit lắt nhắt, vụn vặt làm bẩn lịch sử git.
- **Commit Message BẮT BUỘC dùng Tiếng Việt CÓ DẤU:**
  + Tiêu đề và nội dung commit phải viết bằng **Tiếng Việt có dấu**, diễn đạt chuẩn xác, rõ ràng, phản ánh đúng bản chất các thay đổi (ví dụ: `fix(hệ-thống): khắc phục triệt để lỗi phân quyền và tối ưu luồng tạo chuyến đi`).

