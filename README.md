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

The app runs without any keys: storage is in memory, the map uses free OpenStreetMap tiles, and the identity is a random local ID. Chat and schedule import need `GEMINI_API_KEY`.

| Env var | Needed for |
|---|---|
| `GEMINI_API_KEY` | Assistant and schedule import (AI Studio key) |
| `GEMINI_MODEL` | Pinned model id, such as `gemini-2.5-flash`. Avoid the `gemini-flash-latest` alias: the current `@google/genai` SDK calls the v1 API, where that alias doesn't exist. |
| `ENABLE_MAPS_GROUNDING` | `1` lets the assistant answer place questions with Grounding with Google Maps. Needs billing on the Gemini key's project (the free tier returns 429), so it defaults to `0`. |
| `NEXT_PUBLIC_FIREBASE_*` | Anonymous auth on the client |
| `FIREBASE_SERVICE_ACCOUNT` | Firestore persistence and token verification on the server (**required for the pilot**) |
| `PILOT_ADMIN_TOKEN` | Passcode for `/pilot` |
| `ID_HASH_SALT` | Salt for hashed anonymous IDs |

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
| Pilot metrics and CSV | [lib/metrics/analyze.ts](lib/metrics/analyze.ts), `/pilot` |
| Congestion map (Leaflet + OpenStreetMap, loaded in the browser only) | [components/LotMap.tsx](components/LotMap.tsx), [components/LeafletMap.tsx](components/LeafletMap.tsx) |

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

Firebase App Hosting or Vercel. Set the env vars above, and add the deployed domain under Firebase **Authentication → Settings → Authorized domains**.

OpenStreetMap's public tile server is fine for a campus pilot but isn't meant for heavy traffic. To scale up, switch to a tile provider with a free tier (such as MapTiler or Stadia) by changing `TILE_URL` and `ATTRIBUTION` in [components/LeafletMap.tsx](components/LeafletMap.tsx).
