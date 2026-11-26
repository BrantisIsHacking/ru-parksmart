# RU ParkSmart: pilot MVP

Permit-aware parking help for Rutgers–New Brunswick commuters, built for the Gemini Campus Club Case Study (Theme 3, due Dec 7). It tells a student where their permit lets them park, whether that lot is likely to be full when they arrive, and when to park elsewhere and take a campus bus.

**Design rule: Gemini explains; verified rules and data decide.** Gemini never decides eligibility. It calls a deterministic rules engine through function calling.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in keys (see below)
npm test                     # 60 unit tests, including the permit-rules gate
npm run dev                  # http://localhost:3000
```

The app runs without any keys: storage is in memory, the map uses free OpenStreetMap tiles, and the identity is a random local ID. Chat and schedule import need `GEMINI_API_KEY`.

| Env var | Needed for |
|---|---|
| `GEMINI_API_KEY` | Assistant and schedule import (AI Studio key) |
| `GEMINI_MODEL` | Flash model id, such as `gemini-2.5-flash`. The client uses the `v1beta` API ([lib/gemini/client.ts](lib/gemini/client.ts)) because the SDK's default `v1` rejects function calling and JSON mode. |
| `ENABLE_MAPS_GROUNDING` | `1` lets the assistant answer place questions with Grounding with Google Maps. Needs billing on the Gemini key's project (the free tier returns 429), so it defaults to `0`. |
| `NEXT_PUBLIC_FIREBASE_*` | Anonymous auth on the client |
| `FIREBASE_SERVICE_ACCOUNT` | Firestore persistence and token verification on the server (**required for the pilot**) |
| `PILOT_ADMIN_TOKEN` | Passcode for `/pilot` |
| `ID_HASH_SALT` | Salt for hashed anonymous IDs |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web push for check-ins. Generate the pair with `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | Your site URL or a `mailto:`, so push services can contact you |
| `CRON_SECRET` | Shared secret for `/api/cron/checkins` |

The map needs no key: it's Leaflet with OpenStreetMap tiles.

**Set the Firebase client vars and `FIREBASE_SERVICE_ACCOUNT` together, or leave all of them empty.** With only the client vars set, the browser sends Firebase tokens that the dev-mode server rejects. With only the service account set, the server requires tokens the browser can't send. Either way, every request fails with a 401 and no lots load.

Firebase setup:
1. Enable **Authentication → Sign-in method → Anonymous**.
2. Create a Firestore database (production mode) and deploy [firestore.rules](firestore.rules), which denies all client access.
3. Copy the web app config (Project settings → Your apps) into the `NEXT_PUBLIC_FIREBASE_*` vars.
4. Generate a service-account key (Project settings → Service accounts → Generate new private key) and paste its JSON into `FIREBASE_SERVICE_ACCOUNT` on one line, wrapped in single quotes. Keep the key file out of the repo: `.gitignore` covers `*-firebase-adminsdk-*.json`.

## How it works

| Piece | File |
|---|---|
| Permit rules engine (sole source of eligibility) | [lib/rules/engine.ts](lib/rules/engine.ts) and the versioned [data/rules.v2026-fall.json](data/rules.v2026-fall.json) |
| Congestion estimator: baseline + class-wave prior + trust-weighted reports → Green/Yellow/Red/Gray with sources and confidence | [lib/congestion/](lib/congestion/) |
| Reporter reliability (Kpark-style) | [lib/reports/trust.ts](lib/reports/trust.ts) |
| Park-or-ride planner (scheduled buses) | [lib/planner/parkOrRide.ts](lib/planner/parkOrRide.ts) |
| Gemini system instruction (show this in the deck) | [lib/gemini/systemPrompt.ts](lib/gemini/systemPrompt.ts) |
| Function declarations and the tool loop | [lib/gemini/tools.ts](lib/gemini/tools.ts), [lib/gemini/chat.ts](lib/gemini/chat.ts) |
| Grounding with Google Maps (`ask_maps` tool) | [lib/gemini/mapsGrounding.ts](lib/gemini/mapsGrounding.ts) |
| Schedule screenshot → structured JSON (multimodal) | [lib/gemini/schedule.ts](lib/gemini/schedule.ts) |
| Team counts as live evidence (fade over ~90 minutes) | [lib/congestion/estimator.ts](lib/congestion/estimator.ts), `/pilot` |
| Trip check-ins ("Did you find a spot?"): trips, outcomes, push, cron | [app/api/trips/](app/api/trips/), [app/api/outcomes/](app/api/outcomes/), [app/api/cron/checkins/](app/api/cron/checkins/), [lib/server/push.ts](lib/server/push.ts) |
| Learned typical-fill curves from counts + check-ins | [lib/congestion/learnedBaseline.ts](lib/congestion/learnedBaseline.ts), [lib/server/baselines.ts](lib/server/baselines.ts) |
| Pilot metrics and CSV | [lib/metrics/analyze.ts](lib/metrics/analyze.ts), `/pilot` |
| Congestion map (Leaflet + OpenStreetMap, loaded in the browser only) | [components/LotMap.tsx](components/LotMap.tsx), [components/LeafletMap.tsx](components/LeafletMap.tsx) |

Screens: `/` (leave-by time and recommendation), `/chat`, `/report` (one-tap report), `/onboarding` (permit, commute, schedule), `/privacy`, and `/pilot` (team only).

## Pilot data: what's real and what's left

The lots, permit rules and bus schedules come from Rutgers DOTS and were transcribed on 2026-11-25. Rules stay `verified: false` until Rutgers Transportation Services confirms them, so the app keeps showing its "pilot draft" warning.

**Real now**

- **[data/lots.json](data/lots.json)**: Livingston lots 915 (Yellow), 916 (Green), 107, 108, 111, 103 and 105, plus Busch lots 613 (Stadium West), 48, 50, 51B, 53A, 54, 60A, 60B, 63B and 64. Names and coordinates come from the DOTS permit catalog ([wcip.ipo.rutgers.edu](https://wcip.ipo.rutgers.edu/?catalog_filter=student)). The catalog loads its data from `data.json`; each permit's lots are base64-encoded HTML links that carry the coordinates. Lots the catalog only places to two decimals (Busch 51, 55, 58, 58A, 59, 63, 66B, 67, 602) are left out for now.
- **[data/rules.v2026-fall.json](data/rules.v2026-fall.json)**: primary permits (6 AM–12 AM every day in the campus's commuter lot), secondary permits (10 AM–12 AM weekdays), flex time (any NB student permit in the Livingston and Busch student lots, 5 PM–12 AM weekdays and 6 AM–12 AM weekends), Livingston resident lots, and the Yellow Lot daily permit. A permit id joined with `+` (for example `commuter-livingston+secondary-busch`) is allowed wherever either part is.
- **[lib/rules/engine.test.ts](lib/rules/engine.test.ts)**: the test table follows those rules.
- **[data/busRoutes.json](data/busRoutes.json)**: weekday B, C and LX from the DOTS route PDFs, with first and last departures and the slowest daytime headway.

**Still estimated**

1. Lot **capacities**. Rutgers doesn't publish them. They only turn team counts into a fill fraction, and the counter can override them on `/pilot`.
2. **Bus stop offsets** other than the published start-to-start times, and the **stop and building coordinates** (Stadium West uses the Lot 613 point).
3. **[data/classTimes.json](data/classTimes.json)** block weights. The start times are the standard NB periods; the weights should come from Schedule of Classes enrollment.
4. **[data/baseline.json](data/baseline.json)** curves for 915, 916 and 613. Replace them with RTS counts (`source: "rts"`) or averaged pilot counts (`source: "manual"`).

What the real rules mean for the app: on a weekday before 5 PM, a Livingston commuter can park only in the Yellow Lot. A Busch secondary adds Stadium West from 10 AM, but no single bus links it to Livingston. Park-and-ride (a Busch flex lot plus the B bus) becomes possible after 5 PM.

## Check-ins

Students can opt in to a push notification after a trip asking "Did you find a spot?". Their answer counts as live evidence for that lot and feeds the learned fill curves. Sending is driven by an external cron, since the app has no scheduler of its own. Set up a job at [cron-job.org](https://cron-job.org):

- Schedule: every minute.
- Request: `GET https://<site>/api/cron/checkins`
- Header: `Authorization: Bearer <CRON_SECRET>`

The response reports `{ sent, gone, failed, retrying, expired }`. A send that fails with 429, a 5xx or a network error is retried each minute for up to an hour; any other failure is final. Each run costs about one small Firestore query (the pending trips), well within the free tier. The learned fill curves are cached in the Firestore doc `meta/baselines` and recomputed at most every 2 hours; deleting that doc forces a recompute.

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is inlined into the client bundle at build time, so changing the key pair requires a redeploy (and existing subscriptions stop working). On iPhone, push works only after the student uses **Share → Add to Home Screen** and opens the app from there.

## Pilot metrics (the 30% rubric pillar)

Collected automatically and shown on `/pilot`, with CSV export:

- **Decision time**: from opening the app to tapping "I'm going to Lot X". Compare it with a baseline survey in which students time their usual decision.
- **Prediction accuracy**: each manual count is replayed against what the app would have shown at that moment. The page shows a confusion matrix and the share of Gray answers.
- **Park-or-ride uptake**: how often a park-and-ride suggestion was shown, and how often students followed it.
- **Report agreement**: how often student reports matched team counts. The same comparison drives each reporter's reliability score.
- **Satisfaction**: a 1–5 rating after the third decision, plus chat and schedule-import usage.

- **Trip check-ins**: how often the answer (easy, circled, full) matched the prediction shown (green, yellow, red). Gray predictions are excluded.

Manual counts entered on `/pilot` also update the home screen right away, then fade over about 90 minutes.

Enter manual counts on `/pilot` at scheduled times (for example 9:50, 10:15, 12:00 and 13:50 at each pilot lot). They are the ground truth for every accuracy number.

## Privacy

There is no location tracking. Profile and schedule stay on the device, and screenshots are never stored. Stored rows are tied to a salted hash of an anonymous ID; there are no names, emails or student IDs. Every "I'm going to Lot X" tap stores a trip (lot, planned park time, predicted status, hashed ID) until the pilot data is deleted, even if the student declines check-ins. If check-ins are on, the trip also holds a push notification address, deleted once the question is sent or the trip ends (within 12 hours; a retried send keeps it for up to an hour). The server accepts only allow-listed metric events, and all database access goes through the server. See `/privacy`.

## Deploy

Vercel's free Hobby plan (Firebase App Hosting needs the paid Blaze plan).

1. Set every env var above in the host, with `VAPID_SUBJECT` set to the deployed URL.
2. Add the deployed domain under Firebase **Authentication → Settings → Authorized domains**.
3. Create the once-a-minute cron job described in [Check-ins](#check-ins). Without it, check-in notifications are never sent (students are still asked when they next open the app).

OpenStreetMap's public tile server is fine for a campus pilot but isn't meant for heavy traffic. To scale up, switch to a tile provider with a free tier (such as MapTiler or Stadia) by changing `TILE_URL` and `ATTRIBUTION` in [components/LeafletMap.tsx](components/LeafletMap.tsx).
