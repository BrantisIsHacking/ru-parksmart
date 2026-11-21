# RU ParkSmart: pilot MVP

Permit-aware parking help for Rutgers–New Brunswick commuters, built for the Gemini Campus Club Case Study (Theme 3, due Dec 7). It tells a student where their permit lets them park, whether that lot is likely to be full when they arrive, and when to park elsewhere and take a campus bus.

**Design rule: Gemini explains; verified rules and data decide.** Gemini never decides eligibility. It calls a deterministic rules engine through function calling.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in keys (see below)
npm test                     # 49 unit tests, including the permit-rules gate
npm run dev                  # http://localhost:3000
```

The app runs without any keys: storage is in memory, the map falls back to a list, and the identity is a random local ID. Chat and schedule import need `GEMINI_API_KEY`.

| Env var | Needed for |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Assistant and schedule import (AI Studio key) |
| `ENABLE_MAPS_GROUNDING=1` | Assistant can answer place questions with Grounding with Google Maps |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAP_ID` | Congestion map |
| `NEXT_PUBLIC_FIREBASE_*` | Anonymous auth on the client |
| `FIREBASE_SERVICE_ACCOUNT` | Firestore persistence and token verification on the server (**required for the pilot**) |
| `PILOT_ADMIN_TOKEN` | Passcode for `/pilot` |
| `ID_HASH_SALT` | Salt for hashed anonymous IDs |

Firebase setup: enable **Anonymous** sign-in, create a Firestore database, deploy [firestore.rules](firestore.rules) (deny all client access), and paste the service-account JSON into `FIREBASE_SERVICE_ACCOUNT` on one line.

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
| Pilot metrics and CSV | [lib/metrics/analyze.ts](lib/metrics/analyze.ts), `/pilot` |

Screens: `/` (leave-by time and recommendation), `/chat`, `/report` (one-tap report), `/onboarding` (permit, commute, schedule), `/privacy`, and `/pilot` (team only).

## ⚠️ Before the pilot: replace the placeholder data

Everything in `data/` is a **placeholder** and is marked `verified: false`. The app shows a "pilot draft" warning until you replace it.

1. **[data/lots.json](data/lots.json)**: the real Livingston pilot lots (lot numbers, coordinates, capacity) and the buildings.
2. **[data/rules.v2026-fall.json](data/rules.v2026-fall.json)**: transcribe the rules from rudots.rutgers.edu for those lots, get them confirmed with Rutgers Transportation Services, then set `verified: true` and `verifiedOn`.
3. **[lib/rules/engine.test.ts](lib/rules/engine.test.ts)**: update the test table so it matches the official rules. The roadmap gate is that every row passes.
4. **[data/classTimes.json](data/classTimes.json)**: set per-block weights from Schedule of Classes enrollment for Livingston buildings.
5. **[data/busRoutes.json](data/busRoutes.json)**: copy the published B/LX schedules (stops, offsets, headways).
6. **[data/baseline.json](data/baseline.json)**: if RTS shares lot counts, enter them with `source: "rts"`. Otherwise, after the first pilot days, average your manual counts into it with `source: "manual"`.

## Pilot metrics (the 30% rubric pillar)

Collected automatically and shown on `/pilot`, with CSV export:

- **Decision time**: from opening the app to tapping "I'm going to Lot X". Compare it with a baseline survey in which students time their usual decision.
- **Prediction accuracy**: each manual count is replayed against what the app would have shown at that moment. The page shows a confusion matrix and the share of Gray answers.
- **Park-or-ride uptake**: how often a park-and-ride suggestion was shown, and how often students followed it.
- **Report agreement**: how often student reports matched team counts. The same comparison drives each reporter's reliability score.
- **Satisfaction**: a 1–5 rating after the third decision, plus chat and schedule-import usage.

Enter manual counts on `/pilot` at scheduled times (for example 9:50, 10:15, 12:00 and 13:50 at each pilot lot). They are the ground truth for every accuracy number.

## Privacy

There is no location tracking. Profile and schedule stay on the device, and screenshots are never stored. Stored rows hold only a salted hash of an anonymous ID; there are no names, emails or student IDs. The server accepts only allow-listed metric events, and all database access goes through the server. See `/privacy`.

## Deploy

Firebase App Hosting or Vercel. Set the env vars above, and restrict the browser Maps key by HTTP referrer.
