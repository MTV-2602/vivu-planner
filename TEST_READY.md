# TEST READY — ViVu Planner End-to-End Test Suite

**Published Date**: 2026-10-29  
**Author**: Vinh TestWriter (`teamwork_test_writer_e2e_1`)  
**Status**: `TEST_READY` (All Tiers Specified & Contract Tests Verified)  
**Target Project**: ViVu Planner (Web & Android Pixel_5)

---

## 1. Test Suite Summary & Statistics

The comprehensive opaque-box test suite for ViVu Planner has been designed, verified, and published in `TEST_INFRA.md`. All test cases strictly follow **Category-Partition**, **Boundary Value Analysis (BVA)**, **Pairwise Combinations**, and **Real-World Workload Testing**.

| Tier | Category | Number of Test Cases | Verification Scope | Status |
|---|---|---|---|---|
| **Tier 1** | Primary Feature Coverage | **60 Test Cases** | All 12 Features (5 tests per feature) | **READY** |
| **Tier 2** | Boundary Value & Corner Cases | **60 Test Cases** | All 12 Features (5 edge/corner cases per feature) | **READY** |
| **Tier 3** | Cross-Feature Combinations | **15 Test Cases** | Pairwise combinations across Auth, CAPTCHA, Trip Creation, Calendar DnD, and Deep Links | **READY** |
| **Tier 4** | Real-World Application Workloads | **8 Comprehensive Scenarios** | End-to-end multi-step user persona workflows | **READY** |
| **Total** | **Comprehensive E2E Suite** | **143 Test Cases** | Complete cross-platform coverage (Android & Web) | **READY** |

### Automated Unit & Contract Test Execution
- **Test File**: `backend/src/modules/trips/__tests__/e2e_contracts.test.ts`
- **Tests Added**: 20 new deterministic contract tests covering Turnstile Fail-Closed logic, Google OAuth dynamic redirect URI resolution, PKCE exchange protection, strict email matching, and Calendar DnD item transformations.
- **Pass Rate**: **100% (20/20 PASS)**
- **Full Backend Suite Status**: **207/207 PASS** (Duration: ~20.1s).

---

## 2. Feature Coverage Inventory (12 Features)

1. **Turnstile WebView Rendering (Android Native & Web)**: TC-T1-F01-(01..05), TC-T2-F01-(01..05)
2. **Turnstile Error UI & Retry Mechanism**: TC-T1-F02-(01..05), TC-T2-F02-(01..05)
3. **Turnstile Timeout Watchdog (10s Guard)**: TC-T1-F03-(01..05), TC-T2-F03-(01..05)
4. **Turnstile Token Verification & Fail-Closed**: TC-T1-F04-(01..05), TC-T2-F04-(01..05)
5. **Google OAuth Dynamic Redirect URI**: TC-T1-F05-(01..05), TC-T2-F05-(01..05)
6. **Google OAuth Dismissal Resilience**: TC-T1-F06-(01..05), TC-T2-F06-(01..05)
7. **Google OAuth Single-Use PKCE Protection**: TC-T1-F07-(01..05), TC-T2-F07-(01..05)
8. **Google Account Linking on Mobile**: TC-T1-F08-(01..05), TC-T2-F08-(01..05)
9. **Trip Creation Flow (AI Auto & Pro Workspace)**: TC-T1-F09-(01..05), TC-T2-F09-(01..05)
10. **Itinerary Drag-and-Drop & Standby Cart Tray**: TC-T1-F10-(01..05), TC-T2-F10-(01..05)
11. **Android Emulator Verification (Pixel_5)**: TC-T1-F11-(01..05), TC-T2-F11-(01..05)
12. **Non-Regression & Navigation Protection**: TC-T1-F12-(01..05), TC-T2-F12-(01..05)

---

## 3. Playbook for Phase 4: Vinh Runner

The Test Runner agent (`Vinh Runner`) must execute the automated tests and capture objective visual and system evidence into `test/` following these steps:

### Step 1: Clean & Reset Media Directory
```powershell
Remove-Item -Recurse -Force test\*.png, test\*.jpg, test\*.log -ErrorAction SilentlyContinue
```

### Step 2: Run Contract & Logic Verification
```powershell
npx --prefix backend tsx --test backend/src/modules/trips/__tests__/e2e_contracts.test.ts
```

### Step 3: Run Playwright E2E Verification
Launch Playwright against running web frontend (`http://localhost:8081`):
1. Navigate to `/dang-nhap` and `/dang-ky`:
   - Verify Turnstile container renders.
   - Capture screenshot: `test/01_auth_turnstile_web.png`.
2. Test Google OAuth initiation:
   - Click "Đăng nhập bằng Google", capture redirect URL.
   - Capture screenshot: `test/02_google_oauth_prompt.png`.
3. Test Trip Creation & Calendar Workspace:
   - Navigate to `/chuyen-di/moi`.
   - Submit trip wizard, transition to GoogleCalendarWorkspace.
   - Drag or quick-add place from Standby Cart Tray to Day 1.
   - Capture screenshot: `test/03_itinerary_drag_and_drop.png`.

### Step 4: Run Android Emulator Verification (Pixel_5)
```powershell
# Verify emulator online
adb devices

# Take visual screenshot of Android screen
adb exec-out screencap -p > test/android_screen.png

# Capture Turnstile & Auth logcat lines
adb logcat -d -s "ReactNativeJS" "Turnstile" "Google Auth" > test/android_auth.log
```

### Step 5: Clean Ephemeral Test Scripts
Remove any temporary test scripts (`test_*.js`, `debug_*.js`) from root, frontend, and backend directories before concluding the run.

---

## 4. Playbook for Phase 5: Vinh Reviewer (Visual Inspector)

The Test Reviewer (`Vinh Reviewer`) must independently inspect the media artifacts in `test/` and contrast against the 143 test cases in `TEST_INFRA.md`:
1. **Turnstile Visual Inspection**:
   - Confirm Turnstile widget is visibly loaded with checkmark "Đã xác minh ✓" or active checkbox.
   - Confirm absence of blank white box, 403 bot error, or stuck spinner.
2. **Google OAuth & Redirect Inspection**:
   - Check `test/android_auth.log` confirms `Linking.createURL('dang-nhap')` produced valid URI (`vivuplanner://dang-nhap` or `exp://...`).
   - Confirm single code exchange completed without double-fetch error.
3. **Trip & Workspace Drag-and-Drop Inspection**:
   - Check `test/03_itinerary_drag_and_drop.png` shows scheduled event in calendar time slot and corresponding decrement from Khay giỏ hàng tray.
4. **Final Status Declaration**:
   - Provide objective table of verified TCs and conclude `OVERALL_STATUS`: `APPROVED` or `FIX_REQUIRED`.

---

## 5. Artifact Manifest

- `TEST_INFRA.md`: Project root test architecture, methodology, and 143 test case specifications.
- `TEST_READY.md`: Test readiness declaration, runner instructions, and traceability inventory.
- `backend/src/modules/trips/__tests__/e2e_contracts.test.ts`: Automated test assertions for security, auth, and calendar contracts.
