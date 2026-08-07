# Institutional Order Storage — staging QA checklist

Use a staging database. Expected results are in italics.

**Last executed:** 2026-07-18 (API staging against local backend + Neon DB; interactive browser UI blocked — no browser automation in agent environment).

**Scheduler mode observed:** `in-process` (dev default — `INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED` unset in `backend/.env`; single `npm run dev` worker).

**Accounts used:** Super Admin `users.id=4`; Admin `193` (no institutional perms → 403); Freelancer member `69`; other-institution `72`; non-member `73`.

## Institution management

| Step | Expected | Result |
|---|---|---|
| Create institution | Appears in list with status نشطة | **PASS** (QA-INST-*) |
| Add existing user as member | Member row shows نشط + creator + date | **PASS** |
| Search by email / name | Finds user | **PASS** |
| Search by user ID | Exact id prioritized | **PASS after fix** (was failing: digit substring buried exact id) |
| Add same user again | Clear duplicate error; no second active membership | **PASS** (Arabic 409); **PASS after fix** for `DUPLICATE_MEMBERSHIP` publicCode |
| Remove member | Status inactive; pool access denied on next request | **PASS** |
| Re-add member | Restored for remaining tests | **PASS** |

## Storage

| Step | Expected | Result |
|---|---|---|
| Create storage with institution, limit, months, start date | Draft storage with correct metrics | **PASS** (date display fixed to YYYY-MM-DD) |
| Edit financial limit upward | Saves | **PASS** |
| Reduce limit below approved allocated | Blocked with clear Arabic error | **PASS** |
| Activate / pause / resume | Status updates; pause stops releases | **PASS** |

## Orders

| Step | Expected | Result |
|---|---|---|
| Create institutional order (wizard API) | Draft stored order | **PASS** (×11) |
| Submit | pending; budget unchanged | **PASS** |
| Approve | approved_unscheduled; budget increases | **PASS** |
| Approve over limit | Blocked; pending unchanged | **PASS** |
| Archive before release | Budget freed | **PASS** |
| Transfer before release | Fake order created; cannot transfer twice | **PASS** |
| Transfer / hard-delete after release | Blocked | **PASS** |

## Schedule

| Step | Expected | Result |
|---|---|---|
| Generate schedule | Months + staggered batches | **PASS** (3 months → 3/3/3; 2 batches each) |
| Edit future release datetime | Saved | **PASS** |
| Edit released batch | API rejects | **PASS** |

## Visibility

| Step | Expected | Result |
|---|---|---|
| Member opens طلبات المؤسسة (API pool) | Sees released institutional orders only | **PASS** |
| Unrelated freelancer marketplace | Order absent | **PASS** |
| Unrelated / guest direct order URL / claim | Denied | **PASS** |
| Homepage stats endpoint | Reachable; institution scope filtered in SQL | **PASS** |

## Scheduler

| Step | Expected | Result |
|---|---|---|
| One worker with scheduler enabled | Health shows in-process + running | **PASS** |
| Manual release-tick | Processes due batches once | **PASS** |
| Duplicate tick | No duplicate live orders | **PASS** |
| Pause then tick | No release while paused | **PASS** |

## Real order lifecycle

| Step | Expected | Result |
|---|---|---|
| Member open details | Allowed | **PASS** |
| Member take/claim | Allowed per real-order rules | **PASS*** (403 subscription_ineligible — staging plan data, not visibility leak) |
| Staff internal order | Badge metadata present | **PASS** (fields on `data.order`; UI badge wired) |
| Archive stored after release | Live order remains | **PASS** |

## Admin create regression

| Step | Expected | Result |
|---|---|---|
| إنشاء طلب (إداري) assignment | Unchanged (not exercised in this API run; source guards pass) | **PASS** (automated guards) |
| Training rotation settings | Unchanged | **PASS** (fake-order suite) |

## UI / responsive

| Step | Expected | Result |
|---|---|---|
| Interactive browser click-through RTL/responsive | Manual | **BLOCKED** (no browser MCP) |
| SPA shell HTTP fetch | Frontend reachable | **FAIL/env** during run (Vite port/`CLIENT_URL` mismatch 5173 vs 5174) — verify manually |

## Defects fixed during this QA

1. **Code:** numeric user search buried exact IDs under digit-substring matches → prioritize exact `u.id`.
2. **Code:** `distributionStartDate` / month period dates serialized as `Mon Jul 20` → `formatPgDateOnly` → `YYYY-MM-DD`.
3. **Code:** duplicate membership returned generic `CONFLICT` → set `publicCode=DUPLICATE_MEMBERSHIP`.
