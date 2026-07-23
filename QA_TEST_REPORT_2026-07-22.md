# QA Test Report — 两委会评审投票

Date: 2026-07-22  
Environment: `http://10.1.130.9:3011`  
Browser: Google Chrome  
Viewports: `1440×900`, `390×844`, `320×568`  
Test run ID: `QA-E2E-20260722-CX7K4M`

## Executive summary

The core authenticated workflow works end to end: an administrator can create a committee, launch a poll, a committee member can submit and revise a vote, results update correctly, the administrator can close the poll, and the closed poll becomes read-only.

Release should be held for the three high-severity issues below:

1. A missing poll ID produces a raw server-side application error instead of a safe not-found page.
2. Committee-management actions are hidden behind a hover-only layer on mobile; tapping the card can unexpectedly open the rename action.
3. Launching a poll immediately sends DingTalk messages without disclosing that side effect in the confirmation UI.

Other notable issues are a non-functional date range filter, raw internal audit data shown to users, mobile obstruction from the comment widget, and incomplete localization/accessibility in validation and error states.

## Scope limitation

The assigned workspace is empty and is not a Git repository. It contains no source files, package manifest, test configuration, documentation, or build commands. Therefore this report covers live functional, responsive, error-state, and accessibility-oriented testing only.

The following could not be performed:

- static source review with file and line references;
- dependency, security, and secret scanning;
- unit, integration, lint, type-check, build, or coverage runs;
- API contract and database-level verification;
- non-admin authorization checks with separate user accounts;
- network throttling, offline recovery, attachment limits, and delivery verification.

## Test data cleanup manifest

| Type | Name / ID | State | Cleanup note |
|---|---|---|---|
| Committee | `QA-E2E-20260722-CX7K4M 小组` | Active, 1 member | Delete after dependent poll data is removed or archived. |
| Poll | `QA-E2E-20260722-CX7K4M 投票（测试数据，可删除）` | Closed | Poll ID: `37fecddd-c80e-48cc-b71f-e07e5b92f588`. |
| Candidate | `QA候选人-CX7K4M` | Attached to test poll | Removed with the test poll. |
| Vote | Final choice `弃权`, empty comment | Closed/read-only | Revision history contains initial `通过`, then `弃权`, then comment removal. |
| Notification | Launch notification | 1 sent | Poll creation automatically sent one DingTalk launch notification to the sole reviewer. |

No delete action for polls was visible in the tested UI. Cleanup may require a backend/admin maintenance path. Search for `QA-E2E-20260722-CX7K4M` after cleanup and confirm zero remaining records.

## Prioritized findings

### QA-001 — High: Missing poll IDs crash with a server-side exception

Route: `/admin/polls/00000000-0000-4000-8000-000000000000`

Steps:

1. Sign in as an administrator.
2. Open the route above.

Actual:

- The page displays `Application error: a server-side exception has occurred...` and digest `1354503809`.
- The browser console records a Server Components render error.
- The document title becomes the raw URL.

Expected:

- A localized 404/not-found state with navigation back to poll management.
- No uncaught server-render exception in the browser.

Recommendation: treat missing/invalid IDs as a normal domain outcome, return a typed 404, and render a localized recovery page. Add route tests for malformed, unknown, deleted, and unauthorized IDs.

### QA-002 — High: Committee actions are hover-only and unreliable on mobile

Route: `/admin/committees`

Evidence at `390×844`:

- The action container for `增删查成员`, `重命名`, and `删除小组` computed to `opacity: 0` and `pointer-events: none` when idle.
- The actions were absent from the screenshot.
- Clicking/tapping the center of the test committee card unexpectedly opened `重命名小组`.

Expected:

- Touch users should see explicit, stable actions or a clearly labeled overflow menu.
- Tapping the card should have one predictable result.

Recommendation: use persistent buttons or a visible `更多操作` menu below the mobile breakpoint. Do not depend on `:hover`; ensure each action has a minimum 44×44 px target.

### QA-009 — High: Launch notification is not disclosed at confirmation time

Creating the poll automatically sent one DingTalk launch notification, confirmed by the audit trail. The creation form did not clearly state that submitting the form would immediately message reviewers.

Recommendation: change the final action copy to something like `发起并通知 1 人`, show recipient count, and allow a test/draft mode that creates the poll without sending messages.

### QA-003 — Medium: Date range fields do not filter poll records

Route: `/admin`

Steps:

1. Set start and end to `2026-07-23`.
2. Blur the field and wait for the same settling period used by search.
3. Repeat with the invalid range `2026-07-23` to `2026-07-22`.

Actual:

- All four records remain, including records with `07-22` deadlines.
- The inverted range is accepted silently and also leaves all records visible.

Expected:

- A valid date range filters the records.
- An inverted range shows a localized inline error and does not silently ignore the filter.

Recommendation: bind both fields to the query state, define whether they filter creation time or deadline, validate `start <= end`, expose an active-filter count, and add boundary/timezone tests.

### QA-004 — Medium: Audit trail exposes implementation details

Route: `/admin/polls/37fecddd-c80e-48cc-b71f-e07e5b92f588`, tab `操作记录`

Actual examples include:

- `POLL LAUNCH NOTIFICATIONS SENT`;
- `APPROVE`, `ABSTAIN`, and `MANUAL`;
- raw `pollVoterId` and `committeeId` UUIDs;
- raw ISO UTC timestamps and object-like payloads.

Expected:

- Localized, human-readable audit summaries with only information needed for review.
- Internal identifiers available only in a diagnostic/admin detail surface if required.

Recommendation: map event codes and enums to localized labels, format time in the configured timezone, and render structured field changes instead of raw payload strings.

### QA-005 — Medium: Comment widget obscures mobile content and controls

Routes affected: `/admin`, poll detail, committee management, and system management.

Actual:

- At `390×844`, the floating widget overlaps cards and chart values.
- At `320×568`, it sits over the poll search field and bottom navigation.

Expected:

- Support UI must not obscure app controls or information.

Recommendation: collapse the widget by default below the mobile breakpoint, position it above the bottom navigation, and reserve layout space or use safe-area-aware offsets.

### QA-006 — Medium: Unknown routes use an English framework 404 with no recovery

Route: `/qa-e2e-unknown-route-cx7k4m`

Actual: `404 — This page could not be found.` with no application header, navigation, or recovery link.

Expected: a Chinese, branded not-found page with actions such as `返回首页`, `投票管理`, or `我的投票` based on role.

### QA-007 — Low: Required-field validation is not localized or fully exposed to assistive technology

Route: `/admin`, dialog `发起人选评审投票`

Actual:

- Empty required fields use the browser-native English message `Please fill out this field.` in an otherwise Chinese interface.
- Tested fields had `aria-invalid: null` after failed submission.

Expected:

- Chinese inline messages associated with the affected fields.
- `aria-invalid` and `aria-describedby` updated when validation fails.

### QA-008 — Low: Closed-flow feedback contains an unnamed button

After manually closing the test poll, the `操作已完成` feedback region exposed a button with no accessible name in the DOM snapshot.

Recommendation: give dismiss/close controls an explicit accessible name and verify every icon-only control with automated accessibility checks.

## Verified functional results

| Area | Result | Evidence |
|---|---|---|
| DingTalk authentication | Pass | Browser login and organization selection returned to `/admin`. |
| Demo route | Pass as configured | `/demo` clearly states demo login is disabled. |
| Admin navigation | Pass | Poll, committee, system, and reviewer routes loaded. |
| Committee creation | Pass | Labeled group created with one directory-selected member. |
| Poll creation | Pass | Labeled poll created and opened at its detail route. |
| Required poll fields | Partial | Submission was blocked, but messages are native English and not fully ARIA-exposed. |
| Poll list search | Pass | Exact marker reduced results to one after debounce; no-result and clear states worked. |
| Poll date filters | Fail | Values changed but records were not filtered. |
| Reviewer required selection | Pass | Submitting without a choice showed `请选择投票意见`. |
| Conditional review comment | Pass | `通过` made the comment required; `弃权` made it optional. |
| Initial vote submission | Pass | Pending count changed from 1 to 0 and the vote persisted. |
| Vote modification | Pass | Choice changed from `通过` to `弃权`; comment was cleared and persisted. |
| Aggregate statistics | Pass | Detail updated from 0% to 100%, showing 1 abstention. |
| Named detail | Pass | Final reviewer, department, choice, comment state, and timestamp displayed. |
| Audit versioning | Pass with UX issue | Initial submission and subsequent versions were retained. |
| Manual close | Pass | Irreversible confirmation displayed; status became `已关闭`. |
| Closed reviewer access | Pass | Closed poll became read-only and showed the final vote record. |
| Public introduction | Pass | Sections, anchors, role explanation, FAQ, and CTA rendered. |
| Unknown generic route | Fail UX | Framework-default English 404 with no recovery. |
| Unknown poll record | Fail high | Server-side exception and console error. |
| Happy-path console state | Pass | No console errors observed during the normal lifecycle. |

## Responsive results

No horizontal document overflow was detected at `390×844` or `320×568` on the tested core pages.

Positive results:

- Desktop tables transform into mobile cards.
- The bottom navigation exposes all four primary destinations.
- The mobile poll-creation dialog fits the viewport with reachable actions.
- The narrow group-creation dialog keeps cancel/create actions visible while the directory list scrolls.
- Titles wrap without increasing document width.

Issues:

- Committee actions depend on hover and are not reliably discoverable on touch.
- The comment widget obscures important content and controls.
- Long poll titles are aggressively truncated in list cards; the status badge can wrap into a very narrow column.

## Optimization recommendations

1. Add a global error boundary and typed `notFound`/authorization outcomes before release.
2. Replace hover-only mobile actions with persistent touch controls.
3. Fix and test date filtering at the API/query-state boundary, including timezone semantics.
4. Add Playwright E2E coverage for the exact lifecycle exercised here, using a unique run ID and automated cleanup.
5. Add accessibility automation (for example, axe) plus keyboard and 200% zoom checks.
6. Introduce first-class test metadata such as `isTestData`, `testRunId`, and an admin bulk-cleanup action.
7. Add a draft or `do not notify` launch mode and display notification recipients before confirmation.
8. Convert raw audit payloads into localized field-level changes; retain raw diagnostic data only behind an explicit technical view.
9. Add responsive visual regression checks at 1440, 390, and 320 px, including the comment widget and bottom navigation.
10. Restore the actual source repository to this workspace so build, dependency, security, and code-level review can be completed.
