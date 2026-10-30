# Project: ViVu Planner Android Turnstile, 24h Timeline, Mobile Touch Interactions & Responsive UI

## Architecture
- **Frontend**: Expo SDK 56, React 19, React Native 0.85, NativeWind, Expo Router. Cross-platform support for Web and Android (`com.vivuplanner.app`, scheme `vivuplanner`).
- **Backend**: Node.js Express 4.19 TypeScript server on port 4000. Supabase PostgreSQL, GoTrue Auth, Realtime, Gemini AI API.
- **Authentication**: Supabase GoTrue with Cloudflare Turnstile CAPTCHA (Fail-Closed) on Web and Android WebView.
- **Planner & Workspace**: Google Calendar Workspace with 24h scheduling (06:00 - 23:00), Mobile Touch Interactions (tap-to-pick slot, standby cart quick-assign, up/down shift buttons), Desktop Pointer Drag-and-Drop coexistence, and responsive layout for mobile (Pixel_5) and desktop web.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Turnstile Native Clipping Fix | Remove `overflow: 'hidden'` from native wrapper to prevent blank screen / surface failure on Android | M1 | Survey Explorer 1 |
| 2 | Turnstile Error Handler & Watchdog | Remove `window.onerror` false-abort, extend watchdog to 20s, add `appearance: 'always'`, clean remount retry | M1 | Survey Explorer 1 |
| 3 | Turnstile Native Token Verification | Complete Turnstile verification and return valid verification token on Android emulator | M1 | Survey Explorer 1 |
| 4 | Extended Timeline Hours Array | Expand `HOURS` array from 07..21 to 06:00..23:00 (`Array.from({ length: 18 }, (_, i) => i + 6)`) | M2 | Survey Explorer 2 |
| 5 | Timeline Android Nested Scroll | Add `nestedScrollEnabled={true}` to `calendar-time-grid` and parent `ScrollView`s in `chuyen-di/[id].tsx` and `moi.tsx` | M2 | Survey Explorer 2 |
| 6 | Timeline Clamping & Persistence | Update upper clamp limit from 21 to 23 in `moveEventHour` and `chuyen-di/[id].tsx` | M2 | Survey Explorer 2 |
| 7 | Mobile Slot Tap Interaction | Tap empty/existing slot to select target hour (`selectedTargetHour`) and assign selected cart item | M3 | Survey Explorer 3 |
| 8 | Mobile Quick-Assign Cart Button | Add `btn-quick-add-${item.id}` on cart chips for 1-tap assignment to active day or selected target hour | M3 | Survey Explorer 3 |
| 9 | Mobile Touch-Optimized Up/Down Buttons | Enlarge shift up/down buttons (`btn-shift-up`, `btn-shift-down`) to >=36x36px touch targets, shifting up to 23:00 | M3 | Survey Explorer 3 |
| 10 | Desktop Web DnD Coexistence | Maintain 100% functional pointer drag-and-drop on desktop web (`isDesktop === true`) | M3 | Survey Explorer 3 |
| 11 | Responsive Budget Table | Wrap budget reconciliation table in horizontal ScrollView (`minWidth: 540` on mobile) to eliminate column crushing | M3 | Survey Explorer 3 |
| 12 | Responsive Schedule & Standby Cart | Prevent layout overflow or overlapping on mobile (Pixel_5 393-412px width) while preserving desktop layout | M3 | Survey Explorer 3 |
| 13 | E2E Android & Web Verification | Verify all R1-R4 acceptance criteria on Android Pixel_5 emulator and Web, capturing screenshots in `test/` | M4 | Survey Explorers 1-3 |
| 14 | Local Git Commit & Cleanliness | Consolidate all changes into 1 single local git commit with Vietnamese commit message, NO git push | M4 | ORIGINAL_REQUEST § R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Fix Cloudflare Turnstile on Android | `frontend/components/Turnstile.tsx`, `frontend/components/AuthScreen.tsx` | none | DONE |
| M2 | Extended 24h Schedule Timeline & Scroll | `frontend/components/workspace/GoogleCalendarWorkspace.tsx`, `frontend/app/(app)/chuyen-di/[id].tsx`, `frontend/app/(app)/chuyen-di/moi.tsx` | none | DONE |
| M3 | Mobile Touch Interactions & Responsive UI/UX | `frontend/components/workspace/GoogleCalendarWorkspace.tsx` | M2 | DONE |
| M4 | Full System Verification & Local Git Commit | Android Pixel_5 & Web E2E verification, screenshots in `test/`, single local git commit | M1, M2, M3 | DONE |

## Interface Contracts
### Turnstile Native Component ↔ AuthScreen
- `TurnstileRef`: `{ reset: () => void, execute?: () => void }`
- Props: `siteKey: string`, `action: 'login' | 'signup'`, `onSuccess: (token: string) => void`, `onError?: (err: string) => void`, `onExpire?: () => void`
- Sizing & Styling: `minHeight: 75`, container `borderRadius: 14`, NO `overflow: 'hidden'` on native container.
- BaseURL: `'https://vivuai.vercel.app'`.
- Token message: `{ type: 'success', token: string }`.

### Calendar Timeline & Event Intervals
- Time slot range: `06:00` to `23:00` (18 slots total).
- Event `startHour`: clamped to `[6, 23]`.
- End time: `startHour + durationHours`, max `24:00` (or `23:59:59`).
- Sync payload: `PUT /api/trips/:id/sync-calendar` with `start_time: 'HH:mm:00'`.

### Mobile Touch & Standby Cart
- Target slot selection: `selectedTargetHour: number | null`.
- Cart quick-add: `testID="btn-quick-add-${item.id}"` assigns item to `selectedTargetHour` (or first available slot if null) on `activeDay`.
- Shift buttons: `testID="btn-shift-up"` and `testID="btn-shift-down"` with min size 36x36px.
- Responsive budget table: horizontal scroll with `minWidth: 540px` when `!isDesktop`.

## Code Layout
- `frontend/components/Turnstile.tsx`: Turnstile CAPTCHA cross-platform component (Web DOM + Native WebView).
- `frontend/components/AuthScreen.tsx`: Unified authentication form.
- `frontend/components/workspace/GoogleCalendarWorkspace.tsx`: Calendar itinerary planner, standby cart tray, budget table, timeline slots, and touch handlers.
- `frontend/app/(app)/chuyen-di/[id].tsx`: Trip detail view and parent workspace container.
- `frontend/app/(app)/chuyen-di/moi.tsx`: Trip creation view and parent workspace container.
- `test/`: Verification media artifacts (screenshots, logs).
