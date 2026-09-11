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

## 6. Git Commit & Synchronization Guidelines (Xác Nhận Yes / No)
- **TUYỆT ĐỐI KHÔNG tự ý commit / push git liền:** Sau khi hoàn thành bất kỳ thay đổi nào, KHÔNG được tự ý chạy `git commit` hay `git push`.
- **Cơ chế Gộp (Squash):** Mọi thay đổi luôn được gom lại thành 1 commit duy nhất, rõ ràng, sạch sẽ; không commit vụn vặt, lan man.
- **Quy tắc phản hồi Yes / No từ Người dùng:**
  - Ở cuối mỗi phản hồi, agent hỏi người dùng xác nhận commit/push.
  - Người dùng chỉ cần trả lời **"yes"** (hoặc "y", "ok", "có") -> Agent lập tức gộp commit và push lên GitHub (đồng bộ cả TK1 và TK2).
  - Người dùng trả lời **"no"** (hoặc "n", "không", "chưa") -> Agent giữ nguyên toàn bộ thay đổi ở working tree / local (không commit, không push), tiếp tục thực hiện công việc tiếp theo và hỏi lại ở lần sau.
- **Quy trình Đồng bộ (TK1 & TK2) khi người dùng trả lời "yes":**
  1. Thực hiện commit tại `TK1` với thông điệp tiếng Việt mô tả toàn diện.
  2. Push lên remote repository của `TK1`.
  3. Đồng bộ các thay đổi từ `TK1` sang `TK2` (nằm tại `TK2/vivu-planner`, loại trừ `.git`, `node_modules`, `.expo`, `dist`).
  4. Tại thư mục `TK2/vivu-planner`, cấu hình Git:
     - `git config user.name "vinh-not-bot"`
     - `git config user.email "vinhvip4508@gmail.com"`
  5. Thực hiện commit và push các thay đổi tại `TK2/vivu-planner` lên remote repository.
  6. Có thể chạy file script `d:\ki7\EXE\dong_bo_project.bat` để tự động hóa toàn bộ quy trình đồng bộ và push này.
