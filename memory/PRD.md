# DakMock — Product Requirements Document

## Original Problem Statement
Production-ready India Post (Department of Posts) departmental competitive exam prep app "DakMock" supporting 3 exam tiers (GDS→MTS, Postman & Mail Guard, PA/SA), with student test-taking, subscriptions/payments (Razorpay), referral & token rewards, and a no-code in-app admin panel. Delivered as an Expo React Native app + FastAPI + MongoDB backend (adapted from the original Firebase/Next.js brief to this platform's native mobile stack).

## Architecture
- **Frontend:** Expo Router (React Native), @tanstack/react-query, @gorhom/bottom-sheet, phosphor-react-native icons, react-native-keyboard-controller. Theme tokens in `src/theme.ts` (India Post Red #C8102E, Postal Yellow #FFC72C, Deep Navy #002147).
- **Backend:** FastAPI + Motor (MongoDB). Session-token auth (email/password bcrypt + Emergent Google OAuth), unified `user_sessions` lookup.
- **Collections:** users, user_sessions, categories, test_series, tests (embedded questions), attempts, subscriptions, payment_orders, referrals, payout_requests, support_tickets, settings.

## User Personas
1. **Aspirant (student):** India Post employee preparing for promotion exams; takes mock tests, tracks rank.
2. **Referrer:** shares code to earn tokens redeemable as cash.
3. **Admin:** manages content (bulk .xlsx upload), pricing, gateway keys, payouts, tickets.

## Core Requirements (static)
- 3 exam tiers; bilingual (EN/HI) MCQs.
- Dual auth (email/password + Google).
- Subscriptions: ₹149 single-category / ₹249 combo, 1-year validity; Razorpay (mock mode until keys set).
- Live exam: timer, palette (Answered/Unanswered/Marked), mark-for-review, save & next, submit.
- Results: score, All-India rank, percentile, leaderboard, explanations.
- Referral: unique code, 1 token per referred first-purchase, 1 token = ₹10, payout at ≥10 tokens via UPI/Paytm/GPay.
- Admin: users, bulk .xlsx upload + template, dynamic pricing/Razorpay creds, support email config, payout approve/reject, tickets.

## Implemented (2026-06) — v1.1 Admin Management update
- ✅ Admin: full Test Series manager (create / edit / mark free-paid / soft-delete).
- ✅ Admin: in-app Test & Question editor (bilingual EN/HI, per-question correct answer, marks, duration, optional **Paper 1 / Paper 2** label) — create, edit, delete.
- ✅ Admin: Announcements manager → shows as a one-time popup on student Home (dismiss persists).
- ✅ Admin: Single-user management (grant/revoke subscription, adjust tokens, promote to admin).
- ✅ Admin: Referral settings (enable/disable system, tokens per referral, token value, payout threshold) — enforced in payment verification.
- ✅ Student real-time: react-query polling (~10s) so admin changes appear without app restart; series detail groups tests by Paper.
- ✅ Razorpay Standard Checkout wired (WebView, works in Expo Go + production) — activates when admin enables live keys; mock mode otherwise.
- ✅ Backend + frontend E2E tested (admin CRUD, RBAC 403s, announcements, referral reward) — all passed.

## Implemented (2026-06) — v1.0
- ✅ Full auth (email/password + Emergent Google), gate + session handling.
- ✅ Student dashboard, explore/tests with category filter chips, plan purchase modal (mock payment).
- ✅ Live bilingual exam interface with palette bottom sheet, timer auto-submit, haptics.
- ✅ Results: score ring, rank/percentile, leaderboard, per-question solutions.
- ✅ Wallet: token balance, referral code copy/share, referrals list, payout claim flow + history.
- ✅ Profile, Support ticket submission.
- ✅ Admin panel: stats, users, bulk .xlsx upload + downloadable template, pricing & Razorpay + support email config, payout approve/reject, tickets.
- ✅ Seed data: 3 categories, 6 series (free + paid), 15 tests, admin user.
- ✅ Backend + frontend E2E tested (17/17 backend, all frontend critical flows passed).

## Backlog (prioritized)
- **P1:** Wire real Razorpay native checkout on device build once keys are added; downloadable .xlsx template on native (currently web-only).
- **P1:** Practice mode with instant per-question feedback; test resume/save progress.
- **P2:** Streaks/daily goals; category-wise performance analytics over time.
- **P2:** Admin: edit/delete individual tests & questions in-app; soft-delete UI.
- **P2:** Hindi UI localization (currently content bilingual, chrome English).

## Test Credentials
See `/app/memory/test_credentials.md`. Admin: admin@dakmock.com / Admin@123.
