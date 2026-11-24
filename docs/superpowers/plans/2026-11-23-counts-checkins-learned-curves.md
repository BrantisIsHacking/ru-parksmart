# Team Counts, Trip Check-ins and Learned Curves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Team counts and post-trip check-ins drive the home screen, and both teach each lot's typical fill curve.

**Architecture:** `estimateLot` gains two optional evidence inputs (team counts, trip outcomes) and accepts per-lot baseline weights. A server module builds learned baselines from Firestore data, cached for 10 minutes. Trips and outcomes are new Firestore collections behind three new API routes. Web Push (VAPID) sends check-in notifications, triggered by an external once-a-minute cron.

**Tech Stack:** Next.js 16 (app router; read `node_modules/next/dist/docs/` before writing route or config code, per AGENTS.md), React 19, TypeScript, Firestore via firebase-admin, `web-push`, vitest.

**Specs:** [team counts](../specs/2026-11-23-team-counts-on-home-design.md), [trip check-ins and learned curves](../specs/2026-11-23-trip-checkins-design.md)

## Global Constraints
- The user commits all code. Never run `git commit`. End each task by listing its files as ready to commit.
- No new automated tests (the user's instruction). Every task must keep `npm run typecheck` clean and `npm test` at 49 passing.
- `evaluatePredictions` in `lib/metrics/analyze.ts` must keep calling `estimateLot` with reports only and the default placeholder baselines.
- Nothing that requires a paid plan.
- Server stores only hashed reporter ids (`reporterFrom`). Push subscriptions are deleted once used, answered or expired.
- Check-in window: notify at `parkBy + 5 min`, ask until `parkBy + 12 h`, one answer per trip.

## Review Focus
1. A student who chooses a trip, then chooses again: only the newest trip may be pending, on the server and on the device.
2. Notification permission denied or unsupported (iPhone not installed, desktop Firefox private window): the next-open card must still appear, with no errors.
3. The cron route called without the secret, or twice in the same minute: 401 without the secret, and no duplicate notifications (state moves to `notified` before or atomically with sending).
4. An outcome posted for someone else's trip, a second time, or after 12 hours: rejected with 403, 409 or 410, and not stored.
5. Firestore with no counts or outcomes yet: learned baselines equal the placeholder curves with weight 0.3, so the home screen looks the same as today.

---

### Task 1: Team counts drive the estimate

**Files:**
- Modify: `lib/types.ts` (EvidenceKind)
- Modify: `lib/congestion/estimator.ts`
- Modify: `lib/store/types.ts`, `lib/store/memory.ts`, `lib/store/firestore.ts`
- Modify: `lib/server/services.ts`, `app/api/reports/route.ts`
- Modify: `lib/client/format.ts` (SOURCE_LABEL), `components/Evidence.tsx`
- Modify: `app/pilot/page.tsx` (saved message)

**Interfaces:**
- Produces: `EvidenceKind` adds `"team_count"`. `EstimateInput.counts?: ManualCount[]`. `Store.countsSince(sinceIso: string): Promise<ManualCount[]>`. Constants `COUNT_WEIGHT = 3`, `COUNT_HALF_LIFE_MIN = 30`, `COUNT_MAX_AGE_MIN = 90` exported from estimator.ts.

- [ ] **Step 1:** In `estimateLot`, after the reports block, take the newest count for `lot.id` with `countedAt <= now` and age relative to `forTime` between -5 and `COUNT_MAX_AGE_MIN` minutes. Push `{ kind: "team_count", detail: \`Team count: ${occupied} of ${capacity} cars\`, weight: COUNT_WEIGHT * 0.5 ** (max(0, age) / COUNT_HALF_LIFE_MIN), value: occupied / max(1, capacity), asOf: countedAt }`.
- [ ] **Step 2:** Add `countsSince` to the Store interface. Memory: filter on `countedAt >= since`. Firestore: `where("createdAt", ">=", since)` on `counts`.
- [ ] **Step 3:** `estimatesFor` fetches `countsSince(min(forTime, now) - COUNT_MAX_AGE_MIN)` and passes `counts`. The reports route passes counts from the last 90 minutes the same way.
- [ ] **Step 4:** SOURCE_LABEL `team_count: "Team count"`. `describe()` case: `` `a team count${s.asOf ? ` ${ago(s.asOf)}` : ""}` ``.
- [ ] **Step 5:** Pilot saved message: `` `Saved. ${n} reporter reliability score(s) updated. The home screen now uses this count. Tap Refresh there.` ``
- [ ] **Step 6:** Run `npm run typecheck` (clean) and `npm test` (49 passed).
- [ ] **Step 7:** With the dev server running, POST a count of 390/400 for LIV-B to `/api/pilot/counts` (header `x-pilot-token`). Then GET `/api/status`: LIV-B must be `red`, with a `team_count` source and confidence ≥ 0.95. Delete the test count from Firestore afterwards.
- [ ] **Step 8:** Tell the user the files are ready to commit: "Team counts drive the home screen estimate".

### Task 2: Trips and outcomes (data, routes, live evidence)

**Files:**
- Modify: `lib/types.ts` (Trip, TripOutcome, OutcomeValue, MetricEvent type, EvidenceKind)
- Modify: `lib/store/types.ts`, `memory.ts`, `firestore.ts`
- Create: `app/api/trips/route.ts`, `app/api/outcomes/route.ts`
- Modify: `lib/congestion/estimator.ts`, `lib/client/format.ts`, `components/Evidence.tsx`, `lib/server/services.ts`

**Interfaces:**
- Produces:
  - `type OutcomeValue = "easy" | "circled" | "full"`
  - `interface Trip { id?; reporter; lotId; parkBy; notifyAt; predictedStatus: LotStatus; predictedFill: number | null; push: PushSubscriptionJSON | null; state: "pending" | "notified" | "answered" | "expired"; createdAt }`
  - `interface TripOutcome { id?; tripId; reporter; lotId; value: OutcomeValue; at; parkBy; predictedStatus: LotStatus; createdAt }`
  - Store methods: `addTrip(t): Promise<string>` (returns id), `getTrip(id)`, `updateTrip(id, patch)`, `pendingTripsFor(reporter)`, `dueTrips(nowIso)` (state pending, notifyAt ≤ now), `staleTrips(beforeIso)` (state pending or notified, parkBy < before), `addOutcome(o)`, `outcomesSince(sinceIso)`, `listOutcomes()`
  - `EvidenceKind` adds `"trip_outcome"`; `OUTCOME_FILL = { easy: 0.55, circled: 0.85, full: 0.97 }`, `OUTCOME_WEIGHT = 1`, `OUTCOME_MAX_AGE_MIN = 60` exported from estimator.ts
  - MetricEvent type adds `"trip_outcome"`
  - `POST /api/trips`: body `{ lotId, parkBy, push? }` (the server computes `predictedStatus`/`predictedFill` via `estimatesFor(parkBy)`), response `{ tripId }`
  - `POST /api/outcomes`: body `{ tripId, value }`, response `{ ok: true }`

- [ ] **Step 1:** Types and store methods. Firestore collections `trips` and `outcomes`. For `dueTrips` and `staleTrips`, query on `state` with one `where` and filter the times in memory, so no composite index is needed (volume is small).
- [ ] **Step 2:** `/api/trips`:
  - Validate the lot and `parkBy` (an ISO time within the next 24 hours, or up to 1 hour in the past). Compute `predictedStatus` and `predictedFill` from `estimatesFor(new Date(parkBy))` for that lot.
  - Mark this reporter's other pending trips `expired` with `push: null`.
  - Store the new trip with `notifyAt = parkBy + 5 min`. Rate limit `trips:${reporter}` to 10 per 10 minutes.
- [ ] **Step 3:** `/api/outcomes`:
  - The trip must exist (404) and belong to this reporter (403).
  - Its state must not be answered or expired (409).
  - Now must be at or before `parkBy + 12 h`. Otherwise mark it expired and return 410.
  - Store the outcome, set the trip to `answered` with `push: null`, and `logEvent("trip_outcome", reporter, { value, predictedStatus }, lotId)`.
- [ ] **Step 4:** Estimator: optional `outcomes?: TripOutcome[]`.
  - Use outcomes for this lot where `at <= now`, `at - parkBy <= 60 min`, and age relative to `forTime` is between -5 and `OUTCOME_MAX_AGE_MIN` minutes.
  - Weight: `OUTCOME_WEIGHT * 0.5 ** (age / REPORT_HALF_LIFE_MIN)`, value `OUTCOME_FILL[value]`, detail `` `${n} trip check-in${n===1?"":"s"}` ``.
  - `estimatesFor` and the reports route pass `outcomesSince(now - 60 min)`.
  -
- [ ] **Step 5:** SOURCE_LABEL `trip_outcome: "Trip check-ins"`. `describe()` case: `` `${s.detail}${s.asOf ? `, newest ${ago(s.asOf)}` : ""}` ``.
- [ ] **Step 6:** Typecheck clean, 49 tests pass. Use curl with a signed-in anonymous token to cover Review Focus 1 and 4: create two trips (the first becomes expired), answer the second (200), answer it again (409), and answer a trip as another user (403). Delete the test docs.
- [ ] **Step 7:** Ready to commit: "Add trips and check-in outcomes".

### Task 3: Learned fill curves

**Files:**
- Modify: `lib/data.ts` (LotBaseline, BaselineSource)
- Modify: `lib/congestion/estimator.ts` (baseline weight and label)
- Create: `lib/congestion/learnedBaseline.ts` (pure function)
- Create: `lib/server/baselines.ts` (cached loader)
- Modify: `lib/server/services.ts`, `app/api/reports/route.ts`

**Interfaces:**
- Consumes: `Store.countsSince` (Task 1). `Store.outcomesSince`, `TripOutcome`, `OUTCOME_FILL` (Task 2).
- Produces:
  - `BaselineSource` adds `"learned"`.
  - `LotBaseline` gains optional `weight?: number` and `observations?: number`.
  - `learnBaselines(placeholder: Record<string, LotBaseline>, counts: ManualCount[], outcomes: TripOutcome[]): Record<string, LotBaseline>` in learnedBaseline.ts.
  - `getBaselines(): Promise<Record<string, LotBaseline>>` in lib/server/baselines.ts.

- [ ] **Step 1:** `learnBaselines`. For each lot and each hour key in its placeholder `weekday` curve, gather observations whose campus-local time (via `campusParts`) is a weekday and falls in that hour:
  - Counts: fill = occupied / capacity, weight 1.
  - Outcomes: fill from `OUTCOME_FILL`, weight 0.5.

  Then compute `blended = (prior*2 + Σw*fill) / (2 + Σw)`. Lot weight = `0.3 + 0.5 * n/(n+5)`, where n = total observation weight across all hours of that lot. Mark `source: "learned"` and set `observations` to the observation count, only when n > 0. Otherwise return the placeholder unchanged.
- [ ] **Step 2:** The estimator uses `baseline.weight ?? BASELINE_WEIGHT[baseline.source]`. Label for learned: `` `Typical weekday fill (learned from ${observations} pilot observations)` ``.
- [ ] **Step 3:** `getBaselines` loads counts and outcomes from the last 120 days, calls `learnBaselines(BASELINES, …)`, and caches the result on `globalThis` for 10 minutes. On a store error it returns `BASELINES` and logs the error.
- [ ] **Step 4:** `estimatesFor` and the reports route pass `baselines: await getBaselines()`. `evaluatePredictions` is unchanged. Add a one-line comment there saying it intentionally uses placeholder baselines and no counts.
- [ ] **Step 5:** Typecheck clean, 49 tests pass. `/api/status` with an empty Firestore returns the same statuses as before (Review Focus 5).
- [ ] **Step 6:** Ready to commit: "Learn typical fill curves from counts and check-ins".

### Task 4: Push notifications and the cron route

**Files:**
- Modify: `package.json` (add `web-push` and `@types/web-push`)
- Create: `lib/server/push.ts`
- Create: `app/api/cron/checkins/route.ts`
- Modify: `public/sw.js`, `components/ServiceWorker.tsx`
- Modify: `.env.local` (generated values), `.env.example` (placeholders and comments)

**Interfaces:**
- Consumes: the Task 2 store methods.
- Produces:
  - `sendCheckin(sub: PushSubscriptionJSON, payload: { tripId: string; lotName: string }): Promise<"sent" | "gone" | "failed">` in push.ts. "gone" means HTTP 404/410.
  - `GET /api/cron/checkins` → `{ sent, gone, failed, expired }`.
  - Env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`.

- [ ] **Step 1:** `npm install web-push` and `npm install -D @types/web-push`. Generate the keys with `npx web-push generate-vapid-keys` and a 32-byte hex `CRON_SECRET`, and write all four into `.env.local` without printing them. `VAPID_SUBJECT=https://ru-parksmart.vercel.app` (a placeholder the user updates when deploying).
- [ ] **Step 2:** push.ts calls `webpush.setVapidDetails` lazily, sends a JSON payload `{ title: "Did you find a spot?", body: \`At ${lotName}. Tap to answer.\`, url: \`/?checkin=${tripId}\` }` with TTL 3600, and maps the status codes.
- [ ] **Step 3:** Cron route (`runtime = "nodejs"`, `dynamic = "force-dynamic"`):
  - Require `authorization === \`Bearer ${CRON_SECRET}\`` (401 otherwise; 503 if the secret is unset).
  - For each due trip, first `updateTrip(id, { state: "notified" })`, then send if `push` exists, then set `push: null`.
  - For stale trips (parkBy + 12 h < now), set `state: "expired", push: null`.
- [ ] **Step 4:** sw.js:
  - Change `CACHE` to `"rups-shell-v2"`.
  - `push` handler: `showNotification(title, { body, icon: "/icon.svg", data: { url } })`.
  - `notificationclick` handler: focus an open client and navigate it to `url`, or `openWindow(url)`.
  - ServiceWorker.tsx registers in all environments.
- [ ] **Step 5:** Typecheck clean, 49 tests pass.
  - Curl the cron route with no header → 401 (Review Focus 3).
  - With the header → a JSON summary. Run it twice → the second run sends 0.
- [ ] **Step 6:** Ready to commit: "Send check-in notifications via web push".

### Task 5: Check-in UI

**Files:**
- Create: `lib/client/checkin.ts` (pending trip on the device, push subscription)
- Create: `components/CheckinCard.tsx`, `components/CheckinOptIn.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `/api/trips`, `/api/outcomes` (Task 2), `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Task 4).
- Produces:
  - `getPending(): PendingTrip | null`, `setPending(t)`, `clearPending()`, where `PendingTrip = { tripId; lotId; lotName; parkBy }`, localStorage key `rups.pendingTrip`. `getPending` drops entries past `parkBy + 12 h`.
  - `optInState(): "unasked" | "on" | "off"` (key `rups.checkinOptIn`).
  - `subscribePush(): Promise<PushSubscriptionJSON | null>`, which returns null if unsupported or denied.

- [ ] **Step 1:** `choose()` keeps its current behavior, then:
  - If `optInState()` is "unasked", show `CheckinOptIn`: "Want a quick check-in when you arrive? It helps everyone's predictions." with **Turn on** and **No thanks**.
  - Then (or right away if already answered) POST `/api/trips` with `opt.lotId`, `opt.parkBy` and `push` (from `subscribePush()` when opted in), and call `setPending` with the returned id.
  - Errors are swallowed. A failed trip never blocks the user.
- [ ] **Step 2:** On the home screen, show `CheckinCard` at the top when one of these holds:
  - `?checkin=<id>` is in the URL and matches the pending trip.
  - `getPending()` exists and now ≥ `parkBy + 5 min`.

  The card reads "Did you find a spot at {lotName} around {clock(parkBy)}?" with three buttons (**Found one easily**, **Had to circle**, **Lot was full**) and a "Didn't go" text link.
  - Buttons POST `/api/outcomes` and then call `clearPending()`. A 404, 409 or 410 response also clears it.
  - "Didn't go" only calls `clearPending()`.
  - After answering: "Thanks! That helps everyone's predictions."
- [ ] **Step 3:** Typecheck clean, 49 tests pass. Use the headless-Chrome CDP probe: seed a pending trip with a past `parkBy`, load `/`, confirm the card shows, click "Lot was full", confirm the card disappears and Firestore has the outcome. Delete the test docs. Notification permission is denied in headless Chrome, which exercises Review Focus 2.
- [ ] **Step 4:** Ready to commit: "Ask 'did you find a spot?' after trips".

### Task 6: Pilot stat, privacy, docs

**Files:**
- Modify: `lib/metrics/analyze.ts` (summary field), `app/api/pilot/summary/route.ts`, `app/pilot/page.tsx`
- Modify: `app/api/pilot/export/route.ts` (add `kind=outcomes`)
- Modify: `app/privacy/page.tsx`, `README.md`, `.env.example`

**Interfaces:**
- Consumes: `Store.listOutcomes()` (Task 2).
- Produces: `PilotSummary.checkins: { count: number; accuracy: number | null }`.

- [ ] **Step 1:** `summarizePilot(events, reports, counts, outcomes = [])` computes `checkins`. A trip's prediction matches when easy pairs with green, circled with yellow, or full with red. Exclude gray predictions from the accuracy denominator.
- [ ] **Step 2:** Add a pilot Stat "Trip check-ins", with value `pct(accuracy)` and sub `` `${count} answers, prediction matched` ``. Add an export button `outcomes.csv`.
- [ ] **Step 3:** Privacy page paragraph: "If you turn on check-ins, the server briefly stores a notification address with your trip's lot and time, and deletes it once the check-in is sent. Your answer is stored with the same anonymous ID as reports."
- [ ] **Step 4:** README:
  - Add the four new env vars to the table.
  - Add a "Check-ins" section covering the cron-job.org setup (every minute, `GET https://<site>/api/cron/checkins`, header `Authorization: Bearer <CRON_SECRET>`) and the iPhone home-screen note.
  - Add rows to "How it works" for the team counts, check-ins and learned curves.
  - `.env.example` gets the four vars with comments.
- [ ] **Step 5:** Typecheck clean, 49 tests pass, `npm run build` succeeds.
- [ ] **Step 6:** Ready to commit: "Pilot check-in stats, privacy and docs".
