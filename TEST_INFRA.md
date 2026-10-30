# ViVu Planner — Test Infrastructure & Comprehensive E2E Test Suite Matrix

## 1. Executive Summary & Architecture Overview

This document specifies the opaque-box test infrastructure and end-to-end (E2E) test suite for **ViVu Planner**, specifically validating the core features and critical bug fixes requested in `ORIGINAL_REQUEST.md` and planned in `PROJECT.md`:
1. **Cloudflare Turnstile CAPTCHA on Android & Web** (Login & Register, Fail-Closed security, timeout watchdog, Native WebView rendering).
2. **Google Sign-In (OAuth)** (Deep link handling, Chrome Custom Tabs dismissal resilience, single-use PKCE exchange protection, account linking).
3. **Trip Creation Flow** (4-step wizard, AI Auto generation, Pro Workspace, candidate pool initialization).
4. **Itinerary Drag-and-Drop and Standby Cart Tray (Khay giỏ hàng)** (Web Pointer DnD + Mobile tactile scheduling, day-to-day item migration, calendar synchronization).
5. **Non-Regression & Cross-Platform Integrity** (Email/password authentication, route protection, mobile/web layout parity).

### Test Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       E2E Testing Harness Layer                             │
├──────────────────────────────────────┬──────────────────────────────────────┤
│          Web Testing Suite           │         Android Testing Suite        │
│   (Playwright Chromium / WebKit)     │    (Android Pixel_5 Emulator + ADB)  │
├──────────────────────────────────────┼──────────────────────────────────────┤
│  • Headless / Headed Chromium        │  • Pixel_5 API 33/34 AVD             │
│  • Viewports: 1280x800 & 390x844     │  • Native WebView Turnstile Bridge   │
│  • Pointer Drag & Drop Simulation    │  • Chrome Custom Tabs OAuth Flow     │
│  • Deep Link Callback Mocking        │  • Tactile Scheduling & Gestures     │
├──────────────────────────────────────┴──────────────────────────────────────┤
│                        Execution & Assertion Layer                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Tier 1: Feature Coverage (>=5 test cases per feature, 60+ TCs)           │
│  • Tier 2: Boundary Value & Corner Cases (>=5 TCs per feature, 60+ TCs)     │
│  • Tier 3: Pairwise & Cross-Feature Integration (15+ TCs)                   │
│  • Tier 4: Real-World Workload Scenarios (8+ Comprehensive E2E Journeys)    │
│  • Total Test Suite: 143 Exhaustive Test Cases                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                          Target Under Test (SUT)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Frontend: Expo SDK 56 / React 19 / React Native 0.85 (Port 8081)         │
│  • Backend: Express 4.19 TypeScript (Port 4000)                             │
│  • Auth / DB: Supabase PostgreSQL / GoTrue Auth / Realtime                  │
│  • External Services: Cloudflare Turnstile API, Google OAuth 2.0, Gemini AI  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Test Design Methodology

Our testing approach combines four proven software engineering testing methodologies to guarantee zero escape defects:

### 2.1 Category-Partition (Equivalence Partitioning)
We partition all input domains, system environments, and interaction states into discrete equivalence classes:
- **Platform Partition**: `[Web-Desktop (>=1024px), Web-Mobile (<768px), Android Emulator (Pixel_5 Native WebView), Android Standalone APK]`.
- **Authentication Mode**: `[Email/Password Login, Email/Password Signup, Google OAuth Sign-in, Google Account Linking, Session Resume]`.
- **CAPTCHA State**: `[Valid Active Token, Expired Token, Missing/Blank SiteKey, Network Failure / Script Unreachable, 10s Watchdog Timeout]`.
- **OAuth Callback**: `[Custom Scheme vivuplanner://, Expo Go Scheme exp://, Cancelled/Dismissed Custom Tab, Tampered Auth Code, Replayed Code]`.
- **Trip Mode**: `[AI Auto 4-Step Wizard, Pro Workspace Mode, Manual Template, Existing Draft Finalization]`.
- **Workspace State**: `[Khay Giỏ Hàng Standby Tray Empty, Standby Tray Populated (1-20 items), Calendar Scheduled (Day 1-N), Reorder Collision]`.

### 2.2 Boundary Value Analysis (BVA)
Tests specifically target boundary limits and transition edges:
- **Turnstile Timeout Watchdog**: 9.5s (should still wait), 10.0s (exact threshold trigger), 10.5s (watchdog error displayed).
- **Budget Values**: 0 VNĐ (invalid), 100,000 VNĐ (minimum single activity threshold), 499 VNĐ (auto-scale multiplier trigger), 500,000 VNĐ (exact scaling boundary).
- **Trip Duration**: 1 day (minimum boundary), 3 days (standard), 14 days (maximum supported duration), 0 days or negative days (rejected).
- **Time Slots**: 07:00 (earliest calendar slot), 22:00 (latest calendar slot), 23:59 (overflow boundary).
- **Cart Capacity**: 0 items (empty state UI), 1 item, 20 items (standard), 100+ items (pagination / scroll stress).

### 2.3 Pairwise (All-Pairs Orthogonal Combinations)
Critical cross-feature interactions are combined orthogonally:
- `[Platform: Web vs Android]` × `[Auth: Password vs Google]` × `[CAPTCHA: Pass vs Error vs Retry]` × `[Trip: AI Auto vs Pro Workspace]` × `[Itinerary Action: Drag to Day vs Move to Cart]`.

### 2.4 Real-World Application Workloads
End-to-end realistic workflows covering user journeys with real latency, asynchronous delays, page refreshes, and app backgrounding/resuming.

---

## 3. Test Environment & Artifact Management Protocol

### 3.1 Environment Specification
| Component | Configuration | Host / URL |
|---|---|---|
| OS | Windows 11 Pro 64-bit | Localhost |
| Node.js | v20.x+ | Localhost |
| Frontend Server | Expo SDK 56 (Metro Bundler) | `http://localhost:8081` |
| Backend Server | Node Express TypeScript (Port 4000) | `http://localhost:4000` |
| Android Emulator | Google Pixel_5, API Level 33/34, Google Play | `emulator-5554` |
| ADB Bridge | Android SDK Platform-Tools | Port 5037 |
| Playwright | v1.63.0 (Chromium, Firefox, WebKit) | Headless / Headed |
| Supabase | Local / Staging GoTrue Auth & PostgreSQL | Configured in `.env` |

### 3.2 Test Media Management Protocol (`test/` Directory)
In strict accordance with project rule 7:
1. **Centralized Media Folder**: All test artifacts, screenshots (`.png`, `.jpg`), session videos (`.webp`, `.mp4`), and network dumps MUST be saved exclusively into `d:\ki7\EXE\TK1\test\`.
2. **Git Hygiene**: `test/` is excluded by `.gitignore` and MUST NEVER be committed to Git.
3. **Automated Directory Reset**: Before every test suite execution, the test runner clears all previous images and videos from `test/` to ensure deterministic, clean test evidence.
4. **Temporary Script Cleanup**: All ephemeral test scripts (e.g. `test_*.js`, `debug_*.js`, `capture_*.js`) generated during execution MUST be cleanly deleted after the run.
5. **Screenshot Naming Convention**:
   - `test/TC_[TIER]_[FEATURE_ID]_[STEP_NAME]_[STATUS].png`
   - Example: `test/TC_T1_F01_turnstile_rendered_PASS.png`

---

## 4. Comprehensive 4-Tier Test Suite Matrix

### 4.1 TIER 1: FEATURE COVERAGE (Unit & Functional Verification)
*(Minimum 5 test cases per feature across all 12 features = 60 test cases)*

#### Feature 1: Turnstile WebView Rendering (Android Native & Web)
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F01-01** | F1: Turnstile Rendering | Normal render on Android Emulator Login | Pixel_5 emulator, Login screen open | 1. Open `/dang-nhap`.<br>2. Observe Turnstile component container. | WebView loads Turnstile widget via `vivuai.vercel.app` baseUrl without 403 bot error or blank screen. Sizing minHeight 70-75px. |
| **TC-T1-F01-02** | F1: Turnstile Rendering | Normal render on Android Emulator Register | Pixel_5 emulator, Register screen open | 1. Open `/dang-ky`.<br>2. Observe Turnstile component container. | Turnstile widget renders with interactive challenge checkbox or auto-verified state within 3 seconds. |
| **TC-T1-F01-03** | F1: Turnstile Rendering | Normal render on Web Desktop | Desktop Chromium, 1280x800, `/dang-nhap` | 1. Navigate to `/dang-nhap`.<br>2. Inspect DOM container `#cf-turnstile-container`. | Cloudflare script `challenges.cloudflare.com` loads; iframe injects cleanly into container. |
| **TC-T1-F01-04** | F1: Turnstile Rendering | Normal render on Web Mobile Viewport | Mobile Chromium, 390x844, `/dang-ky` | 1. Navigate to `/dang-ky`.<br>2. Check responsive layout. | Turnstile container scales to 100% width, no horizontal overflow, label "Xác minh bảo mật chống bot" visible. |
| **TC-T1-F01-05** | F1: Turnstile Rendering | Clean unmount and remount on tab toggle | Switch between Login and Register tabs | 1. Click "Đăng ký ngay".<br>2. Click "Đăng nhập ngay". | `window.turnstile.remove()` called; previous widget removed; new widget mounts cleanly without ID collision. |

#### Feature 2: Turnstile Error UI & Retry Mechanism
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F02-01** | F2: Error UI & Retry | Network offline trigger on Native WebView | Device offline or Cloudflare domain blocked | 1. Block `challenges.cloudflare.com`.<br>2. Open `/dang-nhap`. | Fallback error UI displays: Alert icon, error message "Mã bảo vệ CAPTCHA gặp lỗi khi xác thực", retry button visible. |
| **TC-T1-F02-02** | F2: Error UI & Retry | User clicks Retry button after network recovery | Error state displayed on screen | 1. Restore network connectivity.<br>2. Click "Thử lại" (`cf-turnstile-retry-btn`). | Component resets state to loading, removes failed script tag, re-injects script, and renders widget successfully. |
| **TC-T1-F02-03** | F2: Error UI & Retry | Missing Site Key Fail-Closed Warning | `EXPO_PUBLIC_TURNSTILE_SITE_KEY=''` | 1. Clear site key in env.<br>2. Open `/dang-ky`. | Renders warning box `cf-turnstile-missing-key`: "Chưa cấu hình Cloudflare Turnstile Site Key. Đăng ký tạm thời bị vô hiệu hóa". |
| **TC-T1-F02-04** | F2: Error UI & Retry | Token expiration callback handling | Active token expires after TTL | 1. Trigger `expired-callback` from Turnstile API. | `setIsVerified(false)` triggers; token is cleared; checkmark icon turns back to pending shield; submit button disables. |
| **TC-T1-F02-05** | F2: Error UI & Retry | Sizing integrity in error state | Screen width 360px to 1080px | 1. Trigger error state.<br>2. Inspect layout dimensions. | Container maintains padding 12px, border radius 12px, error text wraps cleanly without text clipping. |

#### Feature 3: Turnstile Timeout Watchdog
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F03-01** | F3: Timeout Watchdog | 10-second script load watchdog fire | Script hanging / blackholed HTTP request | 1. Mock script URL to hang indefinitely.<br>2. Wait 10,000ms. | Watchdog timer cancels script loading, triggers `onError('load_failed')`, and presents user-friendly error UI. |
| **TC-T1-F03-02** | F3: Timeout Watchdog | Watchdog cancelled on successful early load | Normal network (load within 1.5s) | 1. Load script normally.<br>2. Monitor watchdog timer handle. | Timeout handle cleared on `handleLoad`; no false-positive timeout errors logged. |
| **TC-T1-F03-03** | F3: Timeout Watchdog | Multiple retries reset watchdog timer | Failed load, user taps retry | 1. Trigger timeout.<br>2. Tap retry.<br>3. Monitor new watchdog cycle. | Watchdog timer re-arms for exactly 10s on the new retry attempt without leaking past intervals. |
| **TC-T1-F03-04** | F3: Timeout Watchdog | Component unmount before watchdog expires | User navigates away at t=4s | 1. Open `/dang-nhap`.<br>2. Navigate to `/` at t=4s. | Cleanup function clears active watchdog timer; no "cannot update unmounted component" React warning. |
| **TC-T1-F03-05** | F3: Timeout Watchdog | Native WebView script timeout detection | Android emulator WebView script hang | 1. Inject unresponsive script in WebView.<br>2. Wait 10s. | Android host detects WebView timeout and switches container from spinner to reload UI. |

#### Feature 4: Turnstile Token Verification
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F04-01** | F4: Token Verification | Successful token acquisition on Login | Turnstile challenge solved | 1. Complete interactive or auto challenge.<br>2. Capture `postMessage` / callback. | Valid non-empty token string received; `isVerified=true`; UI displays "Đã xác minh ✓" with green checkmark. |
| **TC-T1-F04-02** | F4: Token Verification | Successful token acquisition on Register | Turnstile challenge solved on Register | 1. Complete challenge on `/dang-ky`. | Token captured; `isSignupSubmissionAllowed` returns `{ allowed: true }`; Register button activates. |
| **TC-T1-F04-03** | F4: Token Verification | Token passed into Supabase signIn options | Acquired valid token | 1. Fill email & password.<br>2. Click Đăng nhập. | `buildSupabaseSignInOptions({ captchaToken })` returns `{ captchaToken: '...' }`; payload forwarded to Supabase. |
| **TC-T1-F04-04** | F4: Token Verification | Token passed into Supabase signUp options | Acquired valid token | 1. Fill full name, email, password.<br>2. Click Đăng ký. | `buildSupabaseSignUpOptions` returns `{ data: { full_name }, captchaToken: '...' }`; forwarded to Supabase. |
| **TC-T1-F04-05** | F4: Token Verification | Token single-use consumption and reset | After successful or failed submit | 1. Submit login form.<br>2. Observe token state after response. | `setCaptchaToken(null)` and `turnstileRef.current?.reset()` called; token cannot be replayed for subsequent requests. |

#### Feature 5: Google OAuth Dynamic Redirect URI
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F05-01** | F5: Google Redirect URI | Dynamic URI generation for Web | Web browser at `http://localhost:8081` | 1. Click "Đăng nhập bằng Google" on Web.<br>2. Inspect OAuth redirect URL. | Redirect URI evaluates dynamically to `${window.location.origin}/dang-nhap` (`http://localhost:8081/dang-nhap`). |
| **TC-T1-F05-02** | F5: Google Redirect URI | Dynamic URI generation for Android Standalone | Standalone Android build (`com.vivuplanner.app`) | 1. Click "Đăng nhập bằng Google".<br>2. Inspect `Linking.createURL`. | Redirect URI evaluates to `vivuplanner://dang-nhap`. |
| **TC-T1-F05-03** | F5: Google Redirect URI | Dynamic URI generation for Expo Go | Expo Go client on Android emulator | 1. Launch via Expo Go.<br>2. Click Google login. | Redirect URI evaluates to `exp://<host>:8081/--/dang-nhap`. |
| **TC-T1-F05-04** | F5: Google Redirect URI | Web production origin fallback | Production web environment | 1. Simulate production domain `https://vivuai.vercel.app`. | Redirect URI evaluates to `https://vivuai.vercel.app/dang-nhap`. |
| **TC-T1-F05-05** | F5: Google Redirect URI | Deep link listener registration | App launch on Android | 1. Mount AuthScreen.<br>2. Inspect `Linking.addEventListener('url')`. | Event listener registers for incoming deep link callbacks and disposes on unmount. |

#### Feature 6: Google OAuth Dismissal Resilience
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F06-01** | F6: Dismissal Resilience | User closes Chrome Custom Tab via 'X' | Custom Tab open with Google login | 1. Tap 'X' button on Chrome Custom Tab.<br>2. Observe app state. | App returns to AuthScreen without crashing; `googleLoading` resets to false; no false-negative unhandled error banner. |
| **TC-T1-F06-02** | F6: Dismissal Resilience | Android Back button pressed during OAuth | Custom Tab open | 1. Press Android Hardware Back Button. | WebBrowser session resolves with `type: 'cancel'` or `'dismiss'`; loading state clears gracefully. |
| **TC-T1-F06-03** | F6: Dismissal Resilience | App switch during OAuth and resume | Custom Tab open | 1. Switch to Home screen.<br>2. Switch back to ViVu Planner. | Auth session remains intact; user can continue or cancel without orphaned spinners. |
| **TC-T1-F06-04** | F6: Dismissal Resilience | Duplicate dismiss event handling | Fast double-tap on close | 1. Emit consecutive dismiss events. | Handled idempotently; no unhandled promise rejections. |
| **TC-T1-F06-05** | F6: Dismissal Resilience | Re-initiating Google login after dismissal | Post-dismissal state | 1. Dismiss Google OAuth tab.<br>2. Tap "Đăng nhập bằng Google" again. | Opens fresh Custom Tab session cleanly; no lingering locked state. |

#### Feature 7: Google OAuth PKCE Protection
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F07-01** | F7: PKCE Protection | Single authorization code exchange | OAuth callback with `?code=VALID_CODE` | 1. Receive callback URL with auth code.<br>2. Exchange code via `exchangeCodeForSession`. | Code exchanged successfully; user session created; token stored in secure storage. |
| **TC-T1-F07-02** | F7: PKCE Protection | Guard against duplicate code exchange | Same code delivered twice (deep link race) | 1. Simulate simultaneous WebBrowser return and `Linking.addEventListener`. | Guard flag ensures `exchangeCodeForSession` executes exactly once; duplicate call ignored. |
| **TC-T1-F07-03** | F7: PKCE Protection | Invalid / Expired authorization code | Tampered or expired code `?code=EXPIRED` | 1. Receive callback with expired code. | Gracefully caught; displays "Không thể đăng nhập bằng Google. Vui lòng thử lại sau"; no app crash. |
| **TC-T1-F07-04** | F7: PKCE Protection | Implicit access token hash callback | Callback with `#access_token=...&refresh_token=...` | 1. Receive hash callback URL.<br>2. Call `supabase.auth.setSession`. | Session set correctly; navigates to user workspace. |
| **TC-T1-F07-05** | F7: PKCE Protection | PKCE Code Verifier preservation | App memory trim during browser session | 1. Background app during OAuth.<br>2. Resume app. | Code verifier retrieved from storage; exchange completes smoothly. |

#### Feature 8: Google Account Linking on Mobile
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F08-01** | F8: Account Linking | Link matching Google account on Mobile | Logged in as `user@example.com` | 1. Call `linkGoogleAccount()`.<br>2. Complete OAuth for `user@example.com`. | Account linked; `isGoogleLinked=true`; `googleIdentityEmail='user@example.com'`. |
| **TC-T1-F08-02** | F8: Account Linking | Reject mismatched Google email on Linking | Logged in as `user@example.com` | 1. Attempt linking with `other@gmail.com`. | Strict email matching detects mismatch; triggers `unlinkIdentity`; stores warning `vivu_link_error`. |
| **TC-T1-F08-03** | F8: Account Linking | Unlink Google account cleanly | Account currently linked to Google | 1. Call `unlinkGoogleAccount()`. | `supabase.auth.unlinkIdentity` called; Google identity removed; `isGoogleLinked=false`. |
| **TC-T1-F08-04** | F8: Account Linking | Native WebBrowser session for mobile linking | Mobile environment (Android) | 1. Trigger `linkGoogleAccount` on Android. | Opens WebBrowser auth session with `vivuplanner://` redirect rather than failing silently. |
| **TC-T1-F08-05** | F8: Account Linking | UI toggle reflects Google link status | User Profile screen | 1. View Google linking status row. | Button displays "Đã liên kết" with checkmark if linked, or "Liên kết tài khoản Google" if unlinked. |

#### Feature 9: Trip Creation Flow (AI Auto & Pro Workspace)
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F09-01** | F9: Trip Creation | 4-step wizard completion (AI Auto) | Logged-in user, `/chuyen-di/moi` | 1. Step 1: Destination "Đà Nẵng", dates.<br>2. Step 2: Traveler count.<br>3. Step 3: Preferences.<br>4. Step 4: Click Tạo chuyến đi. | POST `/api/trips` executes; AI generates itinerary; redirects to trip detail `/chuyen-di/:id`. |
| **TC-T1-F09-02** | F9: Trip Creation | Pro Workspace creation mode | User with Pro entitlement or Pro toggle | 1. Select Pro Workspace mode.<br>2. Fill trip parameters.<br>3. Submit. | Trip created with `is_ai_pro=true`, candidate pool populated; navigates to GoogleCalendarWorkspace. |
| **TC-T1-F09-03** | F9: Trip Creation | Minimum budget validation | Dates set for 3 days, 2 persons | 1. Enter budget 50,000 VNĐ. | Wizard enforces minimum budget validation; alerts user before sending invalid payload. |
| **TC-T1-F09-04** | F9: Trip Creation | Date range validation (start < end) | Wizard Step 1 | 1. Set start date 2026-11-10, end date 2026-11-05. | Submit button disabled or validation error displayed: "Ngày kết thúc phải sau ngày bắt đầu". |
| **TC-T1-F09-05** | F9: Trip Creation | Candidate pool pre-generation | City selection "Đà Nẵng" | 1. Observe candidate places pool in workspace. | Default places (Bà Nà Hills, Cầu Rồng, Bãi biển Mỹ Khê) loaded into Khay giỏ hàng standby tray. |

#### Feature 10: Itinerary Drag-and-Drop & Standby Cart Tray
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F10-01** | F10: Drag-and-Drop & Cart | Drag item from Standby Cart into Calendar Day 1 | Calendar workspace open, Standby Tray has items | 1. Pointer down on standby item.<br>2. Drag over Day 1 slot at 09:00.<br>3. Release drop. | Item added to Day 1 at 09:00; removed from Standby Tray; backend sync triggered. |
| **TC-T1-F10-02** | F10: Drag-and-Drop & Cart | Move scheduled event back to Standby Cart | Event scheduled on Day 1 | 1. Click "Chuyển về giỏ hàng" or drag to cart. | Event removed from Day 1; returned to Standby Cart Tray as unscheduled place; backend synced. |
| **TC-T1-F10-03** | F10: Drag-and-Drop & Cart | Reorder events within same day | 2 events in Day 1 (09:00 and 14:00) | 1. Drag 14:00 event above 09:00 event. | Events re-sequenced; PUT `/api/trips/days/:dayId/reorder-items` called with new sequence. |
| **TC-T1-F10-04** | F10: Drag-and-Drop & Cart | Quick Add item via button on Mobile | Mobile tactile mode (no mouse pointer) | 1. Tap "+ Thêm vào lịch" on standby place card.<br>2. Select Day 2. | Place scheduled directly into Day 2 without requiring mouse drag-and-drop; tray updates. |
| **TC-T1-F10-05** | F10: Drag-and-Drop & Cart | Standby Cart persistence across reloads | 3 items in Standby Cart | 1. Reload page or restart mobile app.<br>2. Open trip workspace. | Standby Cart items preserved from `trips.preferences.draft_cart` or `/api/trips/:id/cart`. |

#### Feature 11: Android Emulator Verification
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F11-01** | F11: Android Verification | Pixel_5 emulator screen rendering | Pixel_5 running at 1080x2340 | 1. Open ViVu Planner.<br>2. Check safe area insets. | Top status bar and bottom gesture bar clear of content; header and nav bars properly positioned. |
| **TC-T1-F11-02** | F11: Android Verification | Keyboard avoidance on Android | Input focus on password field | 1. Tap password text input. | Soft keyboard opens; form container pans up (`KeyboardAvoidingView`); submit button remains visible. |
| **TC-T1-F11-03** | F11: Android Verification | Native WebView touch interaction | Turnstile challenge on Android | 1. Tap CAPTCHA checkbox in WebView. | Touch event passes cleanly through WebView; checkbox checks; postMessage sends token to React Native. |
| **TC-T1-F11-04** | F11: Android Verification | Deep link intent handling | Emulator ADB intent `vivuplanner://dang-nhap` | 1. Execute `adb shell am start -d "vivuplanner://dang-nhap"`. | App catches deep link and activates corresponding screen route. |
| **TC-T1-F11-05** | F11: Android Verification | Visual screenshot evidence capture in `test/` | Pixel_5 active session | 1. Capture screen via ADB screencap to `test/`. | High-fidelity screenshot saved in `test/`; file size > 50KB; clear visual evidence. |

#### Feature 12: Non-Regression Protection
| TC ID | Feature | Test Description | Input / Precondition | Execution Steps | Authoritative Expected Output |
|---|---|---|---|---|---|
| **TC-T1-F12-01** | F12: Non-Regression | Standard Email/Password Login on Web | Existing user account | 1. Fill email & password.<br>2. Complete Turnstile.<br>3. Submit. | Logs in successfully; JWT session set; redirects to trips dashboard `/chuyen-di`. |
| **TC-T1-F12-02** | F12: Non-Regression | Standard Email/Password Login on Android | Existing user account | 1. Fill credentials on Android emulator.<br>2. Complete Turnstile.<br>3. Submit. | Logs in successfully; session persists in AsyncStorage; navigates to mobile dashboard. |
| **TC-T1-F12-03** | F12: Non-Regression | Admin user role redirection | Account with `role='admin'` | 1. Log in with admin credentials. | App reads admin role from JWT / profiles and navigates to `/admin` dashboard. |
| **TC-T1-F12-04** | F12: Non-Regression | Protected route guard redirects unauthenticated | No active session | 1. Attempt to navigate directly to `/chuyen-di/moi`. | Redirects to `/dang-nhap` with `redirect_after_login` preserved in storage. |
| **TC-T1-F12-05** | F12: Non-Regression | Sign out clears session and storage | Logged-in session | 1. Tap "Đăng xuất" in profile menu. | Supabase session signed out; AsyncStorage auth keys removed; redirects to `/dang-nhap`. |

---

### 4.2 TIER 2: BOUNDARY & CORNER CASES
*(Minimum 5 test cases per feature across all 12 features = 60 test cases)*

#### Feature 1: Turnstile WebView Rendering (Boundaries)
- **TC-T2-F01-01**: Ultra-narrow viewport (320px width) — Turnstile widget adapts gracefully without clipping or horizontal page scrolling.
- **TC-T2-F01-02**: Fast repeated mount/unmount (rapid clicking between Login and Register tabs 10 times in 2 seconds) — No memory leaks or unhandled DOM exception.
- **TC-T2-F01-03**: WebView process kill (simulated low-memory Android termination) — Host app detects crash and renders reload fallback rather than freezing.
- **TC-T2-F01-04**: Heavy CPU throttling (6x slowdown) — Turnstile loads and initializes within extended watchdog tolerance without crashing.
- **TC-T2-F01-05**: Dark mode styling boundary — Turnstile theme prop toggles between `light` and `dark` with appropriate container background contrast.

#### Feature 2: Turnstile Error UI & Retry (Boundaries)
- **TC-T2-F02-01**: 5 consecutive network retry failures — Error message updates with attempt count; Retry button remains responsive and non-blocking.
- **TC-T2-F02-02**: Cloudflare API returns HTTP 503 Service Unavailable — Error handler maps 503 to "Máy chủ xác thực quá tải. Vui lòng thử lại sau".
- **TC-T2-F02-03**: Whitespace-only Site Key (`'   '`) — Treated as missing site key; Fail-Closed security warning displayed immediately.
- **TC-T2-F02-04**: Expired token submitted right at expiration instant — Backend rejects with `captcha_failed`; frontend resets widget and informs user.
- **TC-T2-F02-05**: Rapid clicking on Retry button — Throttled/debounced to prevent flooding script injections into document head.

#### Feature 3: Turnstile Timeout Watchdog (Boundaries)
- **TC-T2-F03-01**: Script response arrives at exactly 9.9 seconds — Watchdog does not fire; widget renders successfully.
- **TC-T2-F03-02**: Script response arrives at 10.1 seconds — Watchdog fires at 10.0s, displays error, and safely ignores late script payload.
- **TC-T2-F03-03**: Network drops to 0 kbps halfway through script download — Error listener or watchdog triggers cleanup cleanly.
- **TC-T2-F03-04**: 0ms timeout configuration edge case — System falls back to default 10,000ms safety limit.
- **TC-T2-F03-05**: System sleep/wake during 10s watchdog countdown — Clock jump handled safely without premature timeout or indefinite hang.

#### Feature 4: Turnstile Token Verification (Boundaries)
- **TC-T2-F04-01**: Oversized token string (4096+ characters) — Token parsed and sent in payload without buffer truncation or memory error.
- **TC-T2-F04-02**: Token containing special characters (`+`, `/`, `=`, `_`, `-`) — Base64URL encoding preserved completely through bridge.
- **TC-T2-F04-03**: Form submission attempted during `isVerifying` intermediate state — Submit button disabled; prevents race conditions.
- **TC-T2-F04-04**: Submitting form with null vs empty string token — Both rejected cleanly by `isSignupSubmissionAllowed` with `reason: 'missing_token'`.
- **TC-T2-F04-05**: Token verification under simulated 2000ms latency — Loading spinner displays on submit button; disables multi-clicks.

#### Feature 5: Google OAuth Dynamic Redirect URI (Boundaries)
- **TC-T2-F05-01**: Redirect URI with nested deep-link subpath (`vivuplanner://dang-nhap?step=2`) — Path and query parsed correctly without stripping.
- **TC-T2-F05-02**: Expo Go redirect containing IP with non-standard port (`exp://192.168.1.100:19000/--/dang-nhap`) — Resolved cleanly.
- **TC-T2-F05-03**: URL containing internationalized domain characters — UTF-8 encoded properly before launching browser session.
- **TC-T2-F05-04**: Null or undefined origin fallback in headless testing — Falls back safely to default `https://vivuai.vercel.app`.
- **TC-T2-F05-05**: Trailing slashes inconsistency (`vivuplanner://` vs `vivuplanner:///`) — Normalized automatically by linking parser.

#### Feature 6: Google OAuth Dismissal Resilience (Boundaries)
- **TC-T2-F06-01**: Custom Tab dismissed within 200ms of opening (instant dismiss) — Handled cleanly; UI state restored immediately.
- **TC-T2-F06-02**: Custom Tab open for 15+ minutes before dismissal — Auth session timeout detected; returns cleanly to login form.
- **TC-T2-F06-03**: Inbound phone call interrupts Custom Tab — Android OS pauses activity; resuming app retains session state without crash.
- **TC-T2-F06-04**: User clears app from recent apps while Custom Tab is visible — Subsequent app launch starts in fresh, clean unauthenticated state.
- **TC-T2-F06-05**: Rapid alternating between Google Login and Email Login buttons — Buttons disabled while `googleLoading` is active.

#### Feature 7: Google OAuth PKCE Protection (Boundaries)
- **TC-T2-F07-01**: Double execution of deep link handler within 50ms (OS event bounce) — Mutex flag blocks second exchange; logs debug notice.
- **TC-T2-F07-02**: Authorization code replay after successful login — Second exchange returns 400 invalid_grant; user session unaffected.
- **TC-T2-F07-03**: Malformed authorization code (symbols, SQL injection vectors, 10k chars) — Rejected before API call or by Supabase auth.
- **TC-T2-F07-04**: Network disconnect during `exchangeCodeForSession` call — Throws network error; user given clear retry action.
- **TC-T2-F07-05**: Code exchange succeeds but user profile fetch fails — Session preserved; default fallback profile created locally.

#### Feature 8: Google Account Linking on Mobile (Boundaries)
- **TC-T2-F08-01**: Email matching case-insensitivity (`User@Example.COM` vs `user@example.com`) — Treated as matching; linking succeeds.
- **TC-T2-F08-02**: Email with plus addressing (`user+test@example.com` vs `user@example.com`) — Strict comparison rejects mismatch cleanly.
- **TC-T2-F08-03**: Account linking attempted with unverified Google email — Supabase rejection handled with clear error message.
- **TC-T2-F08-04**: Unlink requested when Google is the ONLY login method (no password set) — Warns user or enforces setting password first.
- **TC-T2-F08-05**: Rapid consecutive link and unlink requests — State changes serialized; prevents race conditions on user profile.

#### Feature 9: Trip Creation Flow (Boundaries)
- **TC-T2-F09-01**: Minimum possible budget (100,000 VNĐ) — Handled; budget estimation applies low-tier activity selection.
- **TC-T2-F09-02**: Shorthand budget auto-scale threshold (entering 450 vs 450000) — Auto-scaled to 450,000 VNĐ; user confirmed.
- **TC-T2-F09-03**: Maximum trip duration boundary (14 days) — Generates full 14 day schedules without payload timeout.
- **TC-T2-F09-04**: Destination city with mixed casing, diacritics, or trailing whitespace ("  đà nẵng  ") — Normalized to canonical "Đà Nẵng".
- **TC-T2-F09-05**: Zero quota remaining for Free user attempting AI generation — Triggers upgrade modal; prevents 500 server crash.

#### Feature 10: Itinerary Drag-and-Drop & Cart (Boundaries)
- **TC-T2-F10-01**: Empty Standby Cart Tray (0 items) — Displays helpful empty state placeholder "Chưa có địa điểm nào trong giỏ hàng".
- **TC-T2-F10-02**: Dragging item outside valid calendar bounds (drag to header or footer) — Drop cancelled; item snaps back to original position.
- **TC-T2-F10-03**: Scheduling 15 items in a single day — Time slots stack or scroll vertically; no visual overlap or clipped cards.
- **TC-T2-F10-04**: Fast drag-and-drop operations (5 items moved in 2 seconds) — Optimistic UI updates state immediately; sync debounced to backend.
- **TC-T2-F10-05**: Scheduling at boundary hours (07:00 start, 21:30 finish) — Fits within timeline range; duration calculations correct.

#### Feature 11: Android Emulator Verification (Boundaries)
- **TC-T2-F11-01**: Device orientation change (Portrait to Landscape) — Responsive layout recalculates; workspace switches to side-by-side view.
- **TC-T2-F11-02**: System font scale set to Largest (Accessibility 1.5x) — Text flows without truncation or overflowing button boundaries.
- **TC-T2-F11-03**: Android Dark Theme system toggle — UI colors adapt smoothly; text remains legible with high contrast ratios.
- **TC-T2-F11-04**: Low memory warning triggered by Android OS — App purges unneeded image caches; retains active trip state.
- **TC-T2-F11-05**: Airplane mode toggled during active workspace session — Offline banner appears; changes queued locally for retry.

#### Feature 12: Non-Regression Protection (Boundaries)
- **TC-T2-F12-01**: Email with unicode whitespace or trailing spaces — Trimmed automatically before auth request.
- **TC-T2-F12-02**: Password with maximum length (128 characters) and special symbols — Handled without hashing overflow.
- **TC-T2-F12-03**: Token refresh right at JWT 1-hour expiration — Silent refresh succeeds in background; user uninterrupted.
- **TC-T2-F12-04**: Corrupted session data in AsyncStorage — App catches JSON parse error, clears bad key, prompts clean login.
- **TC-T2-F12-05**: Deep linking to non-existent route (`vivuplanner://unknown-screen`) — Falls back safely to home screen `/`.

---

### 4.3 TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise & Integration)
*(15 Comprehensive Multi-Module Integration Scenarios)*

| TC ID | Modules / Features | Scenario Description | Expected Outcome |
|---|---|---|---|
| **TC-T3-01** | F1 + F4 + F12 | Register new account on Android Emulator with Turnstile + Email verification | Register form validates CAPTCHA token, signs up user, creates profile record, and routes to dashboard. |
| **TC-T3-02** | F1 + F2 + F4 | Turnstile network glitch on Android, user taps Retry, acquires token, logs in | Error UI displays, retry reloads widget, token acquired, login succeeds without page reload. |
| **TC-T3-03** | F5 + F6 + F7 | Google Sign-in on Android with temporary browser dismiss then successful retry | First dismiss handled cleanly; second attempt completes OAuth; single-use PKCE exchange creates session. |
| **TC-T3-04** | F5 + F7 + F12 | Google Sign-in on Web Chrome with deep link callback and session persistence | OAuth redirects to `/dang-nhap`, exchanges code, navigates to `/chuyen-di`, survives browser refresh. |
| **TC-T3-05** | F7 + F8 + F12 | Google Account Linking on Mobile for existing email/password user | User logs in with password, links Google account via Chrome Custom Tab, both login methods work. |
| **TC-T3-06** | F8 + F12 | Prevent account takeover: Linking Google account with mismatched email | Linking rejected; warning message saved; primary account remains untouched. |
| **TC-T3-07** | F9 + F10 | Create AI Trip for Đà Nẵng, then move places between Standby Cart and Calendar | 4-step wizard generates trip; candidate places populate Standby Cart; places can be scheduled into Day 1-3. |
| **TC-T3-08** | F9 + F10 + F12 | Pro Workspace mode trip creation with custom budget and drag-and-drop scheduling | Pro Workspace trip created with `is_ai_pro=true`; candidate pool populated; manual scheduling syncs to DB. |
| **TC-T3-09** | F1 + F5 + F9 | New user Google Sign-In on Android immediately creating their first trip | OAuth sign-in grants user free quota; user enters wizard; AI creates itinerary; persists to Supabase. |
| **TC-T3-10** | F10 + F11 | Tactile drag-and-drop on Android Emulator Pixel_5 with Khay giỏ hàng | Standby tray items touch-dragged or quick-added into Calendar days on Android emulator without UI freeze. |
| **TC-T3-11** | F4 + F9 + F12 | Session expiry during trip creation wizard; re-login with Turnstile | Re-login preserves wizard form state via storage; user completes creation without re-typing. |
| **TC-T3-12** | F7 + F10 | Realtime collaborator sees drag-and-drop changes made by Google-authenticated user | User A moves item from cart to Day 1; collaborator B receives update via Supabase Realtime / sync API. |
| **TC-T3-13** | F10 + F12 | Drag-and-drop event reordering persists after browser hard refresh | Move Day 1 10:00 event to 16:00; press Ctrl+F5; event remains at 16:00 from database record. |
| **TC-T3-14** | F1 + F6 + F11 | Android emulator low memory stress during Turnstile and OAuth transition | Memory pressure does not kill auth session token or cause white screen on resume. |
| **TC-T3-15** | F5 + F8 + F10 | Google-linked user logs in on mobile, opens existing trip, reorders itinerary items | Full cycle from mobile OAuth to itinerary modification and backend sync completes with zero errors. |

---

### 4.4 TIER 4: REAL-WORLD APPLICATION SCENARIOS
*(8 End-to-End Persona & Workload Journeys)*

#### RW-01: First-Time Android Mobile Traveler Journey
- **Persona**: Minh, a first-time mobile user downloading ViVu Planner on Android.
- **Workflow**:
  1. Launches app on Pixel_5 emulator.
  2. Navigates to `/dang-ky`.
  3. Turnstile CAPTCHA loads smoothly in Native WebView; Minh completes the verification.
  4. Fills registration form ("Minh ViVu", `minh.test@example.com`, password).
  5. Submits form; Supabase user and profile created with 3 free trip quota.
  6. Navigates to Trip Creation Wizard (`/chuyen-di/moi`).
  7. Selects Đà Nẵng, 3 days, 2 persons, budget 5,000,000 VNĐ.
  8. AI generates itinerary; displays 3 days of activities + Khay giỏ hàng with 5 standby recommendations.
  9. Minh drags "Cà phê Sơn Trà" from Standby Tray into Day 2 morning.
  10. Verifies trip is saved and visible in his trips dashboard.

#### RW-02: Fast Google OAuth Traveler on Android
- **Persona**: Lan, prefers frictionless Google login on her Android phone.
- **Workflow**:
  1. Opens ViVu Planner on Pixel_5.
  2. Taps "Đăng nhập bằng Google".
  3. Chrome Custom Tab opens with Google sign-in.
  4. Lan taps 'X' to cancel accidentally; app returns cleanly to login screen without error banner.
  5. Lan taps "Đăng nhập bằng Google" again; selects her Google account.
  6. Chrome Custom Tab completes OAuth; redirects via `vivuplanner://dang-nhap?code=...`.
  7. PKCE code exchanged once; Lan authenticated seamlessly and routed to `/chuyen-di`.

#### RW-03: Web Power-Planner Pro Workspace Session
- **Persona**: Hung, a travel organizer planning a complex 5-day group trip to Đà Nẵng on desktop Chrome.
- **Workflow**:
  1. Logs in via Web Chrome with credentials and Turnstile.
  2. Selects Pro Workspace Trip Creation.
  3. Enters custom preferences: "Ẩm thực địa phương, hải sản, chụp ảnh hoàng hôn".
  4. Enters Pro Workspace with full candidate places pool (30+ curated local spots).
  5. Drags 4 places into Day 1, 5 places into Day 2, 4 places into Day 3.
  6. Rearranges Day 2 dinner from 18:00 to 20:00.
  7. Returns 1 scheduled place back to Standby Cart Tray.
  8. Reloads page; all 5 days and standby cart reflect exact saved configuration.

#### RW-04: Network Degradation & Turnstile Recovery on Mobile
- **Persona**: Tuan, travelling in an area with spotty mobile connection.
- **Workflow**:
  1. Opens login screen on Android while network is temporarily dropped.
  2. Turnstile fails to reach Cloudflare; timeout watchdog fires after 10s.
  3. Clean error card displays with "Thử lại" button.
  4. Network recovers; Tuan taps "Thử lại".
  5. Widget reloads, acquires verification token.
  6. Tuan enters credentials and logs in successfully.

#### RW-05: Account Security & Google Identity Conflict Handling
- **Persona**: Mai, has an existing account `mai@company.com` and tries to link her personal Google `mai.personal@gmail.com`.
- **Workflow**:
  1. Logs in with `mai@company.com`.
  2. Opens Profile -> Account Security -> Taps "Liên kết tài khoản Google".
  3. Authenticates with `mai.personal@gmail.com`.
  4. Security guard detects mismatched primary email (`mai@company.com` !== `mai.personal@gmail.com`).
  5. Immediately unlinks the mismatched identity from Supabase server.
  6. Displays informative message: "Email tài khoản Google không trùng khớp với Email đăng ký của bạn".
  7. Primary account remains safe and intact.

#### RW-06: Collaborative Multi-Device Itinerary Sync
- **Persona**: Duong on Android and Linh on Web Desktop editing the same Đà Nẵng trip.
- **Workflow**:
  1. Duong on Android Pixel_5 adds "Bảo tàng Chăm" from Khay giỏ hàng into Day 1.
  2. API PUT `/api/trips/:id/sync-calendar` persists update to backend database.
  3. Linh on Web Desktop refreshes or receives realtime sync; "Bảo tàng Chăm" appears in Day 1 calendar.
  4. Linh reorders activities on Day 1; Duong's mobile app reflects the new sequence.

#### RW-07: Shorthand Budget & Boundary Values AI Generation
- **Persona**: Khoa, enters shorthand number "600" intending 600,000 VNĐ.
- **Workflow**:
  1. In Trip Wizard, Khoa types "600" in total budget.
  2. Auto-scale logic detects value < 1000 and scales to 600,000 VNĐ.
  3. AI trip generation respects budget constraint, selecting budget-friendly dining and free attractions.
  4. Created trip displays budget breakdown accurately.

#### RW-08: Full Regression & Session Resilience Cycle
- **Persona**: Automated regression monitor validating all critical paths.
- **Workflow**:
  1. Validates Web Email Login + Turnstile.
  2. Validates Web Logout.
  3. Validates Android Google OAuth Login + PKCE.
  4. Validates Android Navigation: Trips -> New Trip -> Wizard -> Workspace -> Profile.
  5. Validates Standby Cart and Calendar Drag-and-Drop persistence.
  6. Validates Admin role route protection.

---

## 5. Traceability Matrix

| Requirement (ORIGINAL_REQUEST.md) | Feature (PROJECT.md) | Test Cases (Tier 1, 2, 3, 4) |
|---|---|---|
| **R1: Fix Cloudflare Turnstile on Android** | F1: Turnstile WebView Rendering<br>F2: Error UI & Retry<br>F3: Timeout Watchdog<br>F4: Token Verification | TC-T1-F01-(01..05), TC-T1-F02-(01..05), TC-T1-F03-(01..05), TC-T1-F04-(01..05)<br>TC-T2-F01-(01..05), TC-T2-F02-(01..05), TC-T2-F03-(01..05), TC-T2-F04-(01..05)<br>TC-T3-01, TC-T3-02, TC-T3-11, TC-T3-14<br>RW-01, RW-04 |
| **R2: Fix Google Sign-In on Android** | F5: Dynamic Redirect URI<br>F6: Dismissal Resilience<br>F7: PKCE Protection<br>F8: Account Linking | TC-T1-F05-(01..05), TC-T1-F06-(01..05), TC-T1-F07-(01..05), TC-T1-F08-(01..05)<br>TC-T2-F05-(01..05), TC-T2-F06-(01..05), TC-T2-F07-(01..05), TC-T2-F08-(01..05)<br>TC-T3-03, TC-T3-04, TC-T3-05, TC-T3-06, TC-T3-09, TC-T3-15<br>RW-02, RW-05 |
| **R3: Verify Trip Creation & Drag-and-Drop** | F9: Trip Creation Flow<br>F10: Drag-and-Drop & Cart | TC-T1-F09-(01..05), TC-T1-F10-(01..05)<br>TC-T2-F09-(01..05), TC-T2-F10-(01..05)<br>TC-T3-07, TC-T3-08, TC-T3-10, TC-T3-12, TC-T3-13<br>RW-01, RW-03, RW-06, RW-07 |
| **R4: Non-Regression & Code Quality** | F11: Android Emulator Verification<br>F12: Non-Regression Protection | TC-T1-F11-(01..05), TC-T1-F12-(01..05)<br>TC-T2-F11-(01..05), TC-T2-F12-(01..05)<br>All Tier 3 combinations<br>RW-08 |

---

## 6. Test Runner Specifications & Execution Guide

### 6.1 Automated Contract & Logic Test Runner
Runs in Node.js test environment without external network dependencies:
```powershell
npm --prefix backend test
```

### 6.2 Playwright Web & Mobile E2E Runner (Phase 4: Vinh Runner)
Runs automated end-to-end browser flows and captures screenshot evidence into `test/`:
```powershell
# Reset test media folder
Remove-Item -Recurse -Force test\*.png, test\*.log -ErrorAction SilentlyContinue

# Execute E2E Playwright verification script
node scripts/run_e2e_tests.js
```

### 6.3 Android Emulator Verification (ADB Bridge)
Commands to inspect and verify running Android Pixel_5 emulator:
```powershell
# Check emulator connection
adb devices

# Capture visual proof to test/
adb exec-out screencap -p > test/emulator_screen.png

# Check app logcat for Turnstile and OAuth events
adb logcat -d -s "ReactNativeJS" "Turnstile" "Google Auth" > test/android_auth.log
```

### 6.4 Reviewer Pass/Fail Criteria (Phase 5: Vinh Reviewer)
1. **Turnstile**: Screenshot must visually show rendered Cloudflare Turnstile widget with checkmark "Đã xác minh ✓" or active checkbox, not a blank box or grey error.
2. **Google Sign-In**: Logs and screen must show successful transition from login screen to dashboard without redirect loop.
3. **Trip Creation & DnD**: Screenshot in `test/` must confirm newly created trip with calendar events and Khay giỏ hàng items present.
4. **Console Hygiene**: Zero fatal unhandled exceptions, zero CORS errors, zero network leak errors.
