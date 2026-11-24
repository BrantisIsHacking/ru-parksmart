# Trip check-ins ("Did you find a spot?") and learned fill curves

Builds on [team counts on the home screen](2026-11-23-team-counts-on-home-design.md), which ships first.

## Why
Student reports are the weakest data the app has: occasional, subjective, and voluntary. A check-in after a real trip ("did you find a spot?") is tied to an actual arrival, so it's more reliable. It also gives the app a steady stream of ground truth for learning each lot's typical fill curve, replacing the placeholder curves. Everything is due December 7, 2026.

## Goals
- After a student taps "I'm going to Lot X", ask once whether they found a spot.
- Ask with a phone notification shortly after their planned park time. If they don't open it, ask on their next app open instead.
- Use answers in two ways: as live evidence (when fresh), and to learn per-lot typical fill curves (always).
- Record whether the app's prediction for that trip was right.

## Non-goals
- A simulator or accuracy scoreboard (dropped by the user).
- New automated tests beyond keeping the existing suite passing (the user asked not to focus on testing).
- Photo counts, entrance counting (not chosen). Emailing Rutgers Transportation Services (the user is handling it).

## Anti-goals
- Nagging: at most one question per trip, never asked after 12 hours.
- Storing anything that identifies a student. The server keeps only hashed ids, as today.
- Anything that needs a paid plan (no Firebase scheduled functions, no Firebase App Hosting).

## Approaches
- **Notification plus next-open fallback (chosen).** Fresh answers from students who allow notifications; everyone else still gets asked.
- Next-open only: simpler, but answers arrive late and mostly can't affect the live status.
- Notification only: misses iPhone users who haven't installed the app, and anyone who declines.

For the timer that sends notifications:
- **A protected URL called once a minute by a free external service (cron-job.org) (chosen).** Free, and works on any host.
- Vercel cron: the free plan runs only once a day.
- Firebase scheduled functions: need the paid Blaze plan.
- An in-process timer: lost on restarts and doesn't run on serverless hosts.

Hosting: undecided. The plan assumes Vercel's free Hobby plan. Nothing in the design depends on Vercel.

## Student experience
1. The student taps "I'm going to Lot B" (`choose()` in `app/page.tsx`).
2. The first time only, a small card asks: "Want a quick check-in when you arrive? It helps everyone's predictions." with **Turn on** and **No thanks**. **Turn on** requests notification permission. The choice is remembered on the device.
3. The trip is created on the server, and also kept on the device as the pending check-in.
4. At park time + 5 minutes, if the student allowed notifications, they get: "Did you find a spot at Livingston Lot B?" Tapping it opens `/?checkin=<tripId>`.
5. Otherwise, the next time the app opens within 12 hours of park time, the same question card appears at the top of the home screen.
6. Three answers: **Found one easily**, **Had to circle**, **Lot was full**, plus a small "Didn't go" link that dismisses it without saving an answer.
7. Answering anywhere clears the pending check-in, so it's never asked twice. Choosing a new trip replaces the old pending one.

## Data (Firestore, written only by the server)
- **`trips`**: `{ reporter (hash), lotId, parkBy, notifyAt (parkBy + 5 min), predictedStatus, predictedFill, push (subscription or null), state: pending | notified | answered | expired, createdAt }`.
  - `predictedStatus` and `predictedFill` are computed by the server for that lot at `parkBy` when the trip is created.
- **`outcomes`**: `{ tripId, reporter, lotId, value: easy | circled | full, at (answer time), parkBy, predictedStatus, createdAt }`.
- After a notification is sent, or the trip is answered or expired, `push` is deleted. Notification addresses are never kept longer than needed.

## Server
- `POST /api/trips`: create a trip; replaces this reporter's earlier pending trip. Requires the usual anonymous identity.
- `POST /api/outcomes`: `{ tripId, value }`. Accepted only from the trip's own reporter, once, within 12 hours of `parkBy`. Logs a metric event `trip_outcome`.
- `GET /api/cron/checkins`: requires `Authorization: Bearer <CRON_SECRET>`. Sends notifications for due `pending` trips that have a subscription, marks trips older than 12 hours `expired`, and deletes push data. Expired or invalid subscriptions (HTTP 404/410) are dropped quietly.
- New env vars: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (the site URL), `CRON_SECRET`. The builder generates the VAPID pair and secret into `.env.local` and adds placeholders to `.env.example`.
- New dependency: `web-push`.

## Service worker
- Register it in development too (today it's production only), so check-ins can be tested locally.
- Add `push` (show the notification) and `notificationclick` (open or focus `/?checkin=<tripId>`) handlers. Bump the cache name.

## Algorithm
1. **Live evidence.** Outcomes answered within 60 minutes of `parkBy` become a new evidence kind, `trip_outcome`, labelled "Trip check-ins".
   - Fill values: easy = 0.55, circled = 0.85, full = 0.97.
   - Weight 1.0 each (a typical new-reporter report has 0.5), decaying with the same 20-minute half-life as reports.
2. **Learned fill curves.** For each lot and weekday hour, blend the placeholder curve with observations from that hour:
   - **Observations:** team counts (fill = occupied / capacity, weight 1) and trip outcomes (the fill values above, weight 0.5).
   - **Blend:** `(prior × 2 + Σ weight × fill) / (2 + Σ weight)`, so the placeholder counts as 2 observations and real data takes over quickly.
   - **Baseline weight in the estimator:** grows with data, from 0.3 with no observations toward 0.8: `0.3 + 0.5 × n / (n + 5)`, where n is the summed observation weight for that slot.
   - **Source label:** "Typical weekday fill (learned from N pilot observations)".
   - **Computing it:** built from the counts and outcomes in Firestore, cached in server memory for 10 minutes.
   - **Accuracy metric:** the replay keeps using the placeholder curves only, so the metric stays independent.
3. **Prediction checks.** `/pilot` gets a "Trip check-ins" stat: the number of answers and how often `predictedStatus` matched the answer. Easy matches green, circled matches yellow, full matches red, and Gray is excluded.

## Privacy
Update `/privacy`: if a student turns on check-ins, the server briefly stores a notification address with their trip's lot and time, and deletes it after sending. Answers are stored with the same hashed id as reports.

## Setup the user does
- Add the four env vars to the host.
- Create a free cron-job.org job that calls `https://<site>/api/cron/checkins` every minute with the `Authorization` header.
- On iPhone, notifications work only after "Add to Home Screen".

## Left to the builder
- Card wording and styling, matching existing panels.
- Notification icon (use `/icon.svg` or a PNG generated from it).
- Constant names and file layout.
- A dev-only way to trigger the cron route locally (for example, calling it with the secret via curl).
