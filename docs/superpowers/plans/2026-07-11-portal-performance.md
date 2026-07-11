# Portal Warm-Path Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the dashboard, students, calendar, and cohorts warm navigation paths below one second where the application controls the latency, without changing portal behavior or weakening Demo/Main isolation.

**Architecture:** Remove one unconditional server-rendering hotspot by building attendance rosters only for the attendance section and indexing roster inputs once. Then shorten the authentication critical path by running independent Supabase reads concurrently and reusing the assignment snapshot instead of reading it twice. Preserve the existing partition-scoped 120-second portal cache and mutation-driven `portal-live` invalidation.

**Tech Stack:** Next.js 16 App Router, React 19 server components, TypeScript, Supabase JS/PostgREST, Vitest, Playwright.

## Global Constraints

- Preserve every existing role permission and every Demo/Main partition boundary.
- Preserve the current visible behavior, cache tags, invalidation calls, and 120-second portal cache lifetime.
- Add no dependencies.
- Treat the user's under-one-second preference as a warm-route target; report cold starts and external network latency separately.
- Do not touch the unrelated QuickBooks expectation.
- Do not stage or rewrite unrelated dirty-worktree changes.

---

### Task 1: Linear, attendance-only roster construction

**Files:**
- Create: `src/lib/session-rosters.ts`
- Modify: `src/components/portal/portal-shell.tsx:199-289,461-477`
- Test: `src/test/session-rosters.test.ts`

**Interfaces:**
- Consumes: `UserRole`, `PortalContext`, `SessionRosterRow`, and `getPermissionProfile` from the existing portal/domain modules.
- Produces: `buildVisibleSessionRosterMaps(role: UserRole, context: PortalContext): Record<string, SessionRosterRow[]>`.

- [ ] **Step 1: Write exact roster-output regression tests**

Create fixtures with two sessions in one cohort, two active students, one inactive enrollment, two assessments, and out-of-order results. Assert that both sessions receive the same alphabetized active roster, practice tests are newest-first, and family/school fields still follow the role permission profile.

```ts
const maps = buildVisibleSessionRosterMaps("admin", context);

expect(Object.keys(maps)).toEqual(["session-1", "session-2"]);
expect(maps["session-1"].map((row) => row.studentName)).toEqual(["Ada One", "Grace Two"]);
expect(maps["session-1"][0]?.practiceTests.map((test) => test.date)).toEqual([
  "2026-07-10",
  "2026-07-03",
]);
expect(maps["session-1"]).toEqual(maps["session-2"]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test -- src/test/session-rosters.test.ts`

Expected: FAIL because `@/lib/session-rosters` does not exist.

- [ ] **Step 3: Implement one-pass indexes and cohort-level roster reuse**

Build maps for students, families, assessments, results by student, active enrollments by cohort, and sessions by cohort. Construct each cohort roster once, then assign it to every visible session in that cohort. Preserve the existing field redaction, score mapping, date sort, and student-name sort exactly.

```ts
export function buildVisibleSessionRosterMaps(
  role: UserRole,
  context: PortalContext,
): Record<string, SessionRosterRow[]> {
  const permissions = getPermissionProfile(role);
  const studentById = new Map(context.visibleStudents.map((student) => [student.id, student]));
  const familyById = new Map(context.visibleFamilies.map((family) => [family.id, family]));
  const assessmentById = new Map(context.visibleAssessments.map((assessment) => [assessment.id, assessment]));
  const assessmentIdsByCohort = groupValues(context.visibleAssessments, "cohortId", "id");
  const resultsByStudent = groupRows(context.visibleResults, (result) => result.studentId);
  const enrollmentsByCohort = groupRows(
    context.visibleEnrollments.filter((enrollment) => enrollment.status === "active"),
    (enrollment) => enrollment.cohortId,
  );
  const rosterByCohort = new Map<string, SessionRosterRow[]>();

  return Object.fromEntries(context.visibleSessions.map((session) => {
    const rows = rosterByCohort.get(session.cohortId) ?? buildCohortRoster(/* indexed inputs */);
    rosterByCohort.set(session.cohortId, rows);
    return [session.id, rows];
  }));
}
```

- [ ] **Step 4: Gate roster construction to attendance**

Replace the unconditional `getVisibleSessionRosterMaps(role, context)` call with:

```ts
const contextRosterMaps =
  section === "attendance" ? buildVisibleSessionRosterMaps(role, context) : {};
```

Remove the old helper from `portal-shell.tsx` and import the new pure helper.

- [ ] **Step 5: Verify Task 1**

Run:

```bash
npm run test -- src/test/session-rosters.test.ts src/test/portal.test.ts
npx eslint src/lib/session-rosters.ts src/components/portal/portal-shell.tsx src/test/session-rosters.test.ts
npm run typecheck
```

Expected: roster and portal tests PASS; ESLint and TypeScript exit 0 except the already-known QuickBooks assertion if the full portal file is run without a focused selector.

- [ ] **Step 6: Commit Task 1 selectively**

Stage only `src/lib/session-rosters.ts`, `src/test/session-rosters.test.ts`, and the exact `portal-shell.tsx` hunk. Use a Lore-format commit with the measured CPU hotspot and verification trailers.

---

### Task 2: Cohort-specific data loading

**Files:**
- Modify: `src/lib/live-portal.ts:1505-1567`
- Modify: `src/components/portal/portal-shell.tsx:324-390`
- Test: `src/test/portal-load-plan.test.ts`

**Interfaces:**
- Consumes: the current `User`, `UserRole`, and `PortalSection` types.
- Produces: exported pure `getPortalLoadPlan(viewer: User, section?: PortalSection)` with unchanged behavior outside the narrowed cohort route.

- [ ] **Step 1: Lock the cohort query contract with a failing test**

Assert that an admin `/cohorts` plan loads sessions but not enrollments, students, assessments, academic notes, instructor follow-up flags, all profiles, admin tasks, saved views, archived cohorts, checklists, or attendance flags. Also retain representative `/dashboard`, `/students`, and `/attendance` assertions so the narrowing cannot leak to other sections.

```ts
const plan = getPortalLoadPlan(adminViewer, "cohorts");

expect(plan.sessions).toBe(true);
expect(plan).toMatchObject({
  enrollments: false,
  students: false,
  assessments: false,
  academicNotes: false,
  instructorFollowUpFlags: false,
  allProfiles: false,
  adminTasks: false,
  savedViews: false,
  archivedCohorts: false,
  sessionChecklists: false,
  attendanceExceptionFlags: false,
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test -- src/test/portal-load-plan.test.ts`

Expected: FAIL because the current cohort plan enables data that the rendered cohort section never consumes.

- [ ] **Step 3: Narrow only the cohort load plan**

Export `getPortalLoadPlan` and remove `"cohorts"` only from flags whose values are not consumed by the cohort rendering branch. Keep sessions enabled because the page displays class counts. Keep the existing Demo/Main application and cache-viewer identity unchanged.

- [ ] **Step 4: Remove unused cohort derivations**

Change shell derivation guards so cohort pages do not calculate trends or notes:

```ts
const needsTrendRows =
  section === "dashboard" || section === "attendance" || section === "academics";

const visibleNotes =
  section === "academics"
    ? livePortal?.visibleNotes ?? getVisibleNotes(role)
    : [];
```

Retain students behavior only if its rendered branch consumes notes; otherwise keep students out as confirmed by the existing switch branch.

- [ ] **Step 5: Verify Task 2**

Run:

```bash
npm run test -- src/test/portal-load-plan.test.ts src/test/portal.test.ts
npx eslint src/lib/live-portal.ts src/components/portal/portal-shell.tsx src/test/portal-load-plan.test.ts
npm run typecheck
```

Expected: focused tests PASS; ESLint and TypeScript exit 0 apart from the known QuickBooks full-portal assertion when applicable.

- [ ] **Step 6: Commit Task 2 selectively**

Stage only the load-plan test plus exact load-plan/shell derivation hunks. Use a Lore-format commit that names the removed cohort query classes and preserved session/class-count behavior.

---

### Task 3: Intent-driven navigation prefetch

**Files:**
- Create: `src/lib/portal-intent-prefetch.ts`
- Create: `src/components/portal/portal-nav-link.tsx`
- Modify: `src/components/portal/portal-shell.tsx:68,485-538`
- Delete: `src/components/portal/portal-prefetcher.tsx`
- Test: `src/test/portal-intent-prefetch.test.ts`

**Interfaces:**
- Consumes: `href`, `className`, and `children` from each sidebar navigation item.
- Produces: `claimIntentPrefetch(seen: Set<string>, href: string): boolean` and `PortalNavLink`, which prefetches one route on pointer intent or keyboard focus and renders a `Link` with automatic viewport prefetch disabled.

- [ ] **Step 1: Write prefetch claim behavior tests**

Test the real pure claim helper without adding a DOM-test dependency. Assert it claims a new href once, rejects repeated claims for that href, and independently claims a different href.

```ts
const seen = new Set<string>();
expect(claimIntentPrefetch(seen, "/students")).toBe(true);
expect(claimIntentPrefetch(seen, "/students")).toBe(false);
expect(claimIntentPrefetch(seen, "/calendar")).toBe(true);
```

- [ ] **Step 2: Run the navigation test and verify RED**

Run: `npm run test -- src/test/portal-intent-prefetch.test.ts`

Expected: FAIL because `claimIntentPrefetch` does not exist and the current idle prefetcher warms every visible section.

- [ ] **Step 3: Implement one-route intent prefetch**

Create the pure claim helper, then a client component using `Link`, `useRouter`, and a ref-backed `Set`. Call `router.prefetch(href)` only when `claimIntentPrefetch` returns true from `onPointerEnter` or `onFocus`; pass `prefetch={false}` to `Link`.

- [ ] **Step 4: Remove all-route idle prefetch**

Delete the `PortalPrefetcher` import, `sectionPrefetchHrefs`, and mounted component. Replace sidebar `Link` with `PortalNavLink`. This preserves client navigation while preventing one page visit from initiating every sibling route's RSC/Supabase load.

- [ ] **Step 5: Verify no automatic sibling requests**

In a production build, load `/students`, wait two seconds without hovering, and inspect browser network entries. Expect zero `?_rsc=` requests for other portal sections. Hover `/calendar`; expect at most one calendar RSC prefetch.

- [ ] **Step 6: Verify and commit Task 3**

Run:

```bash
npm run test -- src/test/portal-intent-prefetch.test.ts
npx eslint src/lib/portal-intent-prefetch.ts src/components/portal/portal-nav-link.tsx src/components/portal/portal-shell.tsx src/test/portal-intent-prefetch.test.ts
npm run typecheck
```

Stage only the navigation helper/component/test, the exact shell hunks, and deletion of the idle prefetcher. Use a Lore-format commit recording the removed sibling-render amplification.

---

### Task 4: Shorter authentication network critical path

**Files:**
- Modify: `src/lib/auth.ts:64-242,365-489`
- Create: `src/test/auth-performance.test.ts`

**Interfaces:**
- Consumes: existing `createSupabaseServerClient`, `createSupabaseServiceClient`, and cached profile hydration behavior.
- Produces: unchanged public functions `resolvePortalViewer(...)` and `getAuthenticatedViewerForRequest(...)` with fewer sequential waits.

- [ ] **Step 1: Write deferred-promise auth tests**

Mock the server and service clients. Hold the profile and template reads on separate deferred promises and assert both queries start before either resolves. For a template-backed user, assert the assignment list is fetched once, assignment upserts/deletes retain the existing result, and the returned `assignedCohortIds` equal the desired template IDs.

```ts
const pending = createDeferredProfileReads();
const resultPromise = resolvePortalViewer({ path: "/students" });

expect(pending.started).toEqual(["profiles", "user_templates"]);
pending.resolveAll();
await expect(resultPromise).resolves.toMatchObject({
  user: { assignedCohortIds: ["cohort-a", "cohort-b"] },
});
expect(mocks.assignmentSelects).toBe(1);
```

Also assert `getUser()` and `getSession()` have both started before either promise resolves for both page and API authentication entrypoints.

- [ ] **Step 2: Run the auth test and verify RED**

Run: `npm run test -- src/test/auth-performance.test.ts`

Expected: FAIL because the current profile/template and user/session requests start serially, and template-backed hydration selects assignments twice.

- [ ] **Step 3: Parallelize independent authentication reads**

Change both authentication entrypoints to:

```ts
const [userResult, sessionResult] = await Promise.all([
  supabase.auth.getUser(),
  supabase.auth.getSession(),
]);
const authUser = userResult.data.user;
const session = sessionResult.data.session;
```

Change initial profile hydration to fetch profile and email template concurrently:

```ts
const [existingProfileResult, templateResult] = await Promise.all([
  serviceClient.from("profiles").select("*").eq("id", authUser.id).maybeSingle(),
  normalizedEmail
    ? serviceClient.from("user_templates").select("*").eq("email", normalizedEmail).maybeSingle()
    : Promise.resolve({ data: null }),
]);
```

- [ ] **Step 4: Reuse the assignment snapshot**

Fetch current assignments once after the profile/template reads. Run the required profile write and assignment snapshot read concurrently. If a template exists, compute upserts/deletes from that snapshot, execute nonempty mutations concurrently, and return the template's desired assignment IDs after successful calls. If no template exists, return the one fetched snapshot. Preserve current profile values, suspension/revocation behavior, and cache keys.

- [ ] **Step 5: Verify Task 2**

Run:

```bash
npm run test -- src/test/auth-performance.test.ts src/test/students-route.test.ts src/test/student-import-routes.test.ts
npx eslint src/lib/auth.ts src/test/auth-performance.test.ts
npm run typecheck
```

Expected: all focused tests PASS; ESLint and TypeScript exit 0.

- [ ] **Step 6: Commit Task 2 selectively**

Stage only `src/lib/auth.ts` and `src/test/auth-performance.test.ts`. Use a Lore-format commit that records removed network stages, preserved auth guards, and focused verification.

---

### Task 5: Production-style benchmark and final regression gate

**Files:**
- Create: `.superpowers/sdd/portal-performance-report.md`
- Modify: `docs/HANDOFF.md`

**Interfaces:**
- Consumes: the optimized application and the existing Demo-only local QA login.
- Produces: reproducible before/after warm-route timing evidence and operational guidance.

- [ ] **Step 1: Build and run production mode locally**

Stop the development server, then run:

```bash
npm run build
INTO_PREP_LOCAL_QA=1 npm run start -- --port 3002
```

Expected: production server becomes ready on `http://localhost:3002`.

- [ ] **Step 2: Measure four warm routes with an actual browser**

For `/dashboard`, `/students`, `/calendar`, and `/cohorts`, collect at least five hard-navigation samples after one warm-up. Record TTFB, DOMContentLoaded, load, and FCP from the Navigation/Paint Performance APIs. Require median warm FCP and load below 1,000 ms for every route; retain each raw sample in the report.

- [ ] **Step 3: Verify portal functionality and partition behavior**

Use the Demo QA Admin to navigate all four routes and open the student import panel without committing data. Confirm the page identifies Demo data only, the three export actions remain present, and no console errors occur. Do not create Main data.

- [ ] **Step 4: Run the final quality gate**

Run sequentially:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: lint, typecheck, and build exit 0; all relevant tests pass. If the untouched QuickBooks expectation remains the sole full-suite failure, record it exactly and do not alter it.

- [ ] **Step 5: Document performance boundaries**

Record local production before/after medians, the live Postgres evidence that portal SELECT queries themselves average roughly 1-15 ms, and that unauthenticated production cannot prove signed-in live-route latency. State that Vercel cold starts, user-to-region latency, and first uncached Supabase fetches are external variables and must not be represented as guaranteed sub-second behavior.

- [ ] **Step 6: Commit verification artifacts selectively**

Stage only `.superpowers/sdd/portal-performance-report.md` and the performance paragraph added to `docs/HANDOFF.md`. Use a Lore-format commit with exact tested/not-tested trailers.

## Self-Review

- Spec coverage: the plan covers warm page render CPU, authentication network stages, Demo/Main safety, four requested high-use routes, production-style browser timings, and full verification.
- Placeholder scan: no `TBD`, `TODO`, or unspecified error-handling steps remain.
- Type consistency: `buildVisibleSessionRosterMaps` is defined once and consumed only by `PortalShell`; public auth interfaces remain unchanged.
- Scope control: no schema migration or cache-policy change is planned because current live query execution is already fast and the evidence points to application waterfalls/CPU rather than missing indexes.
