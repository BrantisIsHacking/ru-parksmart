# RU ParkSmart: pilot MVP

Permit-aware parking help for Rutgers–New Brunswick commuters, built for the Gemini Campus Club Case Study (Theme 3, due Dec 7). It tells a student where their permit lets them park, whether that lot is likely to be full when they arrive, and when to park elsewhere and take a campus bus.

**Design rule: Gemini explains; verified rules and data decide.** Gemini never decides eligibility. It calls a deterministic rules engine through function calling.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in keys: see "Getting every key" below
npm test                     # unit tests, including the permit-rules gate
npm run dev                  # http://localhost:3000
```

The app runs with no keys at all: storage is in memory, the map uses free OpenStreetMap tiles, and each phone gets a random local ID. Add keys as you need the features:

| Env var | What it turns on | Needed for the video demo? | Needed for the pilot? | Where to get it |
|---|---|---|---|---|
| `GEMINI_API_KEY` | Chat assistant and schedule-screenshot import | Yes | Yes | [Step 1](#1-gemini-api-key-google-ai-studio) |
| `GEMINI_MODEL` | Which Gemini model to call | Has a default | Has a default | [Step 1](#1-gemini-api-key-google-ai-studio) |
| `ENABLE_MAPS_GROUNDING` | Assistant answers place questions with Google Maps (paid) | No | No | [Step 2](#2-optional-grounding-with-google-maps-needs-billing) |
| `NEXT_PUBLIC_CARTO_KEY` | Cleaner CARTO map style (OpenStreetMap tiles without it) | Nice to have | Nice to have | [Step 3](#3-optional-carto-basemaps-key-nicer-map-tiles) |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Anonymous sign-in in the browser | No | **Yes** | [Step 4](#4-firebase-anonymous-sign-in--firestore-database) |
| `FIREBASE_SERVICE_ACCOUNT` | Saves reports, counts and trips in Firestore; verifies sign-ins on the server | No | **Yes** | [Step 4](#4-firebase-anonymous-sign-in--firestore-database) |
| `PILOT_ADMIN_TOKEN` | Passcode for the team-only `/pilot` dashboard | No | **Yes** | [Step 5](#5-passcode-salt-and-cron-secret-you-make-these-up) |
| `ID_HASH_SALT` | Secret used to hash anonymous IDs before storing them | No | **Yes** | [Step 5](#5-passcode-salt-and-cron-secret-you-make-these-up) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | "Did you find a spot?" push notifications | No | Yes, for check-ins | [Step 6](#6-web-push-keys-vapid-for-check-ins) |
| `CRON_SECRET` | Protects the once-a-minute check-in sender | No | Yes, for check-ins | [Step 5](#5-passcode-salt-and-cron-secret-you-make-these-up), [Step 7](#7-cron-job-sends-the-check-ins-every-minute) |

**Rules for `.env.local`:** one `NAME=value` per line, no spaces around `=`, no quotes except around the Firebase service account JSON (Step 4). `.env.local` is in `.gitignore`: never commit it, and never paste keys into chat, issues or screenshots. **Restart `npm run dev` after every change**: Next.js reads env files only at startup, and `NEXT_PUBLIC_*` values are baked into the browser bundle.

## Getting every key

Console menus move around from time to time. If a menu named here isn't where the steps say, use the console's search bar to find it by name.

### 1. Gemini API key (Google AI Studio)

Free tier, no credit card. Use a personal Google account: Rutgers (ScarletMail) accounts may have AI Studio turned off by the university.

1. Go to **https://aistudio.google.com** and sign in with your Google account. Accept the terms the first time.
2. Click **Get API key** in the left sidebar (or go straight to https://aistudio.google.com/apikey).
3. Click **Create API key**. When asked for a project, choose **Create API key in new project** (or pick an existing Google Cloud project).
4. Copy the key (it starts with `AIza…`) and put it in `.env.local`:
   ```
   GEMINI_API_KEY=AIza...your key...
   ```
5. **Model.** `GEMINI_MODEL` is optional. Leave the value from `.env.example`, or set any Flash model id. To see ids, open **Create prompt** in AI Studio, open the model dropdown on the right, and copy the id shown under the model name (for example `gemini-2.5-flash`). `gemini-flash-latest` always points at the newest Flash model. If the variable is empty, the app uses `gemini-flash-latest`.
6. **Check it works:** restart `npm run dev`, open **Ask**, and send "Where can I park for Tillett at 11?". A 400/403 error means the key is wrong or copied with a space; a 429 means you hit the free-tier rate limit, so wait a minute.

Optional hardening: in **Google Cloud Console → APIs & Services → Credentials** (https://console.cloud.google.com/apis/credentials), select the same project, click the key, and under **API restrictions** choose **Restrict key → Generative Language API**.

### 2. Optional: Grounding with Google Maps (needs billing)

Lets the assistant answer "where's the entrance to Hill Center?"-style questions with Google Maps. It is **paid**: the free tier answers 429. Skip it unless the team has a billing account.

1. Open https://aistudio.google.com/apikey, find the key from Step 1, and click **Set up billing** next to its project (or go to **Google Cloud Console → Billing**, https://console.cloud.google.com/billing, and link a billing account to that project).
2. Set `ENABLE_MAPS_GROUNDING=1` in `.env.local` and restart.
3. Set a budget alert first: **Google Cloud Console → Billing → Budgets & alerts → Create budget**.

### 3. Optional: CARTO Basemaps key (nicer map tiles)

Without it, the map uses standard OpenStreetMap tiles and works fine. With it, the map uses CARTO's lighter style with street names drawn above the lots.

1. Go to **https://carto.com/basemaps/apikey/** and click **Request a key**. No account is needed; the key arrives by email.
2. Fill in the form:
   - **About you:** your email; project name `RU ParkSmart`; commercial use: **No — personal, hobby, academic, or a non-profit** (free up to 5M requests a month).
   - **About this key:** name it `RU ParkSmart – web map`.
   - **Restrictions:** turn on **Restrict to specific websites (Referer)** and add `http://localhost:3000/*` and your deployed site, e.g. `https://ru-parksmart.vercel.app/*` (add `https://*.vercel.app/*` too if you demo from Vercel preview links). Leave **mobile apps** and **origin IPs** off.
   - Read and accept the **CARTO Basemaps Terms**. The map already shows the required "© OpenStreetMap contributors, © CARTO" credit.
3. Put the emailed key in `.env.local` and restart:
   ```
   NEXT_PUBLIC_CARTO_KEY=your-carto-key
   ```
4. **Check it works:** the map should have a light style and no "API key required" watermark. If tiles are blank, the referer restriction doesn't include the address in your browser bar.

### 4. Firebase (anonymous sign-in + Firestore database)

Free Spark plan is enough. This step gives you **five** values: the four `NEXT_PUBLIC_FIREBASE_*` vars and `FIREBASE_SERVICE_ACCOUNT`.

**Set the four client vars and `FIREBASE_SERVICE_ACCOUNT` together, or leave all five empty.** With only the client vars, the browser sends tokens the server can't verify; with only the service account, the server demands tokens the browser can't send. Either way every request fails with 401 and no lots load.

**4a. Create the project**
1. Go to **https://console.firebase.google.com** and sign in.
2. Click **Create a project** (or **Add project**), name it `ru-parksmart`, and continue. Google Analytics is not needed: switch it off. Click **Create project**.

**4b. Turn on anonymous sign-in**
1. In the left sidebar open **Build → Authentication** and click **Get started**.
2. Open the **Sign-in method** tab, click **Anonymous**, switch **Enable** on, and click **Save**.
3. Open the **Settings** tab → **Authorized domains**. `localhost` is there already. After you deploy, click **Add domain** and add your site's domain (e.g. `ru-parksmart.vercel.app`, no `https://`).

**4c. Create the Firestore database**
1. Left sidebar: **Build → Firestore Database** → **Create database**.
2. Location: pick a US region close to New Jersey, such as `us-east1` (or the `nam5` multi-region). The location can't be changed later.
3. Choose **Start in production mode** and click **Create**.
4. Open the **Rules** tab, replace everything with the contents of [firestore.rules](firestore.rules) (it blocks all direct browser access; the server uses the Admin SDK, which isn't affected), and click **Publish**.
5. No indexes are needed: every query filters on a single field, which Firestore indexes automatically.

**4d. Register the web app (the four `NEXT_PUBLIC_FIREBASE_*` values)**
1. Click the **gear icon** next to **Project Overview** (top left) → **Project settings** → **General** tab.
2. Scroll to **Your apps** and click the **Web** icon (`</>`). Nickname: `ru-parksmart-web`. Leave **Firebase Hosting** unchecked. Click **Register app**.
3. Firebase shows a `firebaseConfig` block. Copy four of its values (you can see it again later under **Project settings → General → Your apps → SDK setup and configuration → Config**):
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=        ← apiKey
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=    ← authDomain   (looks like ru-parksmart.firebaseapp.com)
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=     ← projectId
   NEXT_PUBLIC_FIREBASE_APP_ID=         ← appId        (looks like 1:1234567890:web:abc123…)
   ```
   This web `apiKey` is meant to be public; it only identifies the project. The service account below is the secret part.

**4e. Service account (`FIREBASE_SERVICE_ACCOUNT`)**
1. **Project settings** → **Service accounts** tab → **Firebase Admin SDK** → **Generate new private key** → **Generate key**. A `.json` file downloads.
2. Treat this file like a password. Keep it outside the project folder, or at least keep its default name: `.gitignore` covers `*-firebase-adminsdk-*.json`.
3. The app needs the JSON **on one line**. From the folder where the file is, run:
   ```bash
   node -e "console.log(JSON.stringify(require('./ru-parksmart-firebase-adminsdk-xxxxx.json')))"
   ```
   (use your file's real name), and copy the single line it prints.
4. In `.env.local`, wrap that line in **single quotes**:
   ```
   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"ru-parksmart",...}'
   ```
   On Vercel, paste the same line **without** the quotes.
5. **Check it works:** restart `npm run dev`. The terminal should no longer print `FIREBASE_SERVICE_ACCOUNT not set: using in-memory store`. Submit a report on `/report`, then open **Firestore Database → Data** in the console: a `reports` collection should appear.

### 5. Passcode, salt and cron secret (you make these up)

`PILOT_ADMIN_TOKEN`, `ID_HASH_SALT` and `CRON_SECRET` aren't from any website: they're random secrets you generate. This command works on Windows, Mac and Linux:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it three times and paste one result into each:

```
PILOT_ADMIN_TOKEN=...   # the team types this on /pilot, so share it privately with the team
ID_HASH_SALT=...        # set once and never change it: changing it splits every student's history in two
CRON_SECRET=...         # cron-job.org sends this (Step 7)
```

`PILOT_ADMIN_TOKEN` can be a shorter passphrase if the team will type it on phones, as long as it isn't guessable.

### 6. Web push keys (VAPID, for check-ins)

These let the app send the "Did you find a spot?" notification. They come from a command, not a website.

1. In the project folder run:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. It prints a **Public Key** and a **Private Key**. Copy them:
   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=   ← Public Key
   VAPID_PRIVATE_KEY=              ← Private Key (secret)
   VAPID_SUBJECT=https://ru-parksmart.vercel.app   ← your site URL, or mailto:your-team-email
   ```
3. Generate them **once** and keep them. A new pair breaks every student's existing notification subscription, and the public key is baked in at build time, so changing it needs a redeploy.
4. On iPhone, push only works after the student uses **Share → Add to Home Screen** and opens the app from the home-screen icon.

### 7. Cron job (sends the check-ins every minute)

The app has no scheduler of its own, so a free external cron service calls it. Do this after deploying (Step 8), because it needs your public URL.

1. Go to **https://cron-job.org**, click **Sign up**, and confirm your email.
2. In the dashboard open **Cronjobs** → **Create cronjob**.
3. **Common** tab:
   - **Title:** `RU ParkSmart check-ins`
   - **URL:** `https://<your-site>/api/cron/checkins` (e.g. `https://ru-parksmart.vercel.app/api/cron/checkins`)
   - **Execution schedule:** **Every minute**.
4. **Advanced** tab → **Headers** → **Add**:
   - Key: `Authorization`
   - Value: `Bearer <your CRON_SECRET>` (the word `Bearer`, one space, then the secret from Step 5)
   - **Request method:** `GET`.
5. Click **Create** (or **Save**), then use **Test run**. A working job returns HTTP 200 with JSON like `{"sent":0,"gone":0,"failed":0,"retrying":0,"expired":0}`. A 401 means the header or secret doesn't match.

### 8. Put the same keys on Vercel (deployed site)

`.env.local` only affects your computer. The deployed site needs its own copy.

1. Go to **https://vercel.com**, sign in with GitHub, click **Add New… → Project**, and **Import** the repository. Framework preset: **Next.js** (detected automatically).
2. Before the first deploy (or later in **Project → Settings → Environment Variables**), add every variable from your `.env.local` one by one: **Key**, **Value**, environments **Production** and **Preview**. Paste `FIREBASE_SERVICE_ACCOUNT` without the surrounding single quotes.
3. Set `VAPID_SUBJECT` to the real deployed URL.
4. After adding or changing any variable, redeploy: **Deployments** tab → **⋯** on the latest deployment → **Redeploy**. `NEXT_PUBLIC_*` values only take effect after a rebuild.
5. Add the deployed domain to **Firebase → Authentication → Settings → Authorized domains** (Step 4b) and to the CARTO key's referer list (Step 3), then set up the cron job (Step 7).

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| Every request fails with 401 / "Sign-in required"; no lots load | Firebase client vars and `FIREBASE_SERVICE_ACCOUNT` aren't set together (Step 4), or the domain isn't in **Authorized domains** |
| Map shows an "API key required" watermark | `NEXT_PUBLIC_CARTO_KEY` missing or not applied: restart `npm run dev` / redeploy |
| Map tiles are blank with a CARTO key | The CARTO key's referer list doesn't include this address (Step 3) |
| Chat says "The assistant isn't configured yet", or a 403 | `GEMINI_API_KEY` missing, mistyped, or from a Workspace account with AI Studio disabled |
| Chat answers 429 | Free-tier rate limit; wait a minute. With `ENABLE_MAPS_GROUNDING=1` and no billing, set it back to `0` |
| `/pilot` says "Wrong pilot passcode" or 503 | `PILOT_ADMIN_TOKEN` doesn't match, or isn't set on that environment |
| Terminal: `JSON.parse` error at startup | `FIREBASE_SERVICE_ACCOUNT` isn't on one line or lost its single quotes in `.env.local` |
| Check-in notifications never arrive | Cron job missing or returning 401 (Step 7), VAPID keys missing, or on iPhone the app wasn't added to the home screen |

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
| Campus map home screen (Leaflet; lot and building outlines from the Rutgers campus map) | [app/page.tsx](app/page.tsx), [components/CampusMap.tsx](components/CampusMap.tsx) |
| Building and lot search (codes like TIL-254, names, addresses) | [lib/search.ts](lib/search.ts), [lib/places.ts](lib/places.ts) |

Screens: `/` (full-screen campus map with the plan in a bottom sheet; search or tap any building or spot to plan a trip), `/chat`, `/report` (one-tap report), `/onboarding` (permit, commute, schedule), `/privacy`, and `/pilot` (team only).

## Pilot data: what's real and what's left

All four New Brunswick campuses are covered. The data comes from Rutgers and OpenStreetMap through scripts that write committed JSON, so it can be refreshed each semester. Rules stay `verified: false` until Rutgers Transportation Services confirms them, so the app keeps showing its "pilot draft" warning.

```bash
node scripts/import-dots.mjs         # lots + permit rules from the DOTS permit catalog
node scripts/import-campus-map.mjs   # buildings, lot/building outlines, bus stops
node scripts/build-bus-routes.mjs    # weekday bus routes (edit the table in this script)
node scripts/import-soc.mjs          # building codes + rooms classes meet in (run each semester)
```

| Output | Source |
|---|---|
| [data/lots.json](data/lots.json) lots, [data/rules.v2026-fall.json](data/rules.v2026-fall.json) | DOTS permit catalog `https://wcip.ipo.rutgers.edu/data.json`. Each permit's lots are base64-encoded HTML links with coordinates; the hours come from its schedule. Hand-written extras (the Yellow Lot daily permit) live in [data/rules.manual.json](data/rules.manual.json). |
| [data/buildings.json](data/buildings.json), [public/geo/](public/geo/) outlines, refined lot coordinates | The Rutgers campus map feed behind [maps.rutgers.edu](https://maps.rutgers.edu): about 700 NB buildings with official codes (TIL, ARC, HLL…) and addresses, plus lot outlines. Lots the catalog places only roughly get their coordinates from the matching outline. |
| [data/busStops.json](data/busStops.json) | OpenStreetMap through Overpass (© OpenStreetMap contributors, ODbL). |
| [data/busRoutes.json](data/busRoutes.json) | Weekday A, B, C, EE, F, H, LX, REXB and REXL from the DOTS route PDFs, transcribed into [scripts/build-bus-routes.mjs](scripts/build-bus-routes.mjs). |
| [data/buildingCodes.json](data/buildingCodes.json) | The public Rutgers Schedule of Classes API (`https://classes.rutgers.edu/soc/api/courses.json?year=2026&term=9&campus=NB`, no key): every building code and room NB classes meet in, linked to campus-map buildings. Codes the map labels differently (ABW/ABE → Academic Building, PAB, RWH…) are linked in [data/buildingCodes.manual.json](data/buildingCodes.manual.json); the script lists any code still unlinked. Schedule import uses it to resolve codes, suggest the right building for a misread code ("LWH" → Lucy Stone Hall, LSH) and the right room for a misread room ("B209" → B269), and Gemini gets the code list as a reading aid. Defaults to Fall 2026 + Spring 2027; pass `year:term` pairs to change (term 1 = Spring, 9 = Fall). On Windows, use Node to fetch it: `curl` can fail Rutgers' certificate revocation check. |

Permits work the way DOTS sells them: a primary (6 AM–12 AM every day in that campus's commuter lots), an optional secondary for another campus (10 AM–12 AM weekdays; College Ave has none), and flex time (other student lots 5 PM–12 AM weekdays and 6 AM–12 AM weekends). A combined permit id such as `commuter-livingston+secondary-busch` is allowed wherever either part is.

**Still estimated**

1. Lot **capacities**. Rutgers doesn't publish them. They only turn team counts into a fill fraction, and the counter can override them on `/pilot`.
2. **Bus stop offsets** other than the published start-to-start times (estimated from distance), and each route's loop time.
3. **[data/classTimes.json](data/classTimes.json)** block weights. The start times are the standard NB periods; the weights should come from Schedule of Classes enrollment.
4. **[data/baseline.json](data/baseline.json)** curves for 915, 916 and 613. Replace them with RTS counts (`source: "rts"`) or averaged pilot counts (`source: "manual"`).

What the real rules mean: on a weekday before 5 PM, a Livingston commuter can park only in the Yellow Lot, while Busch commuters at Stadium West often do better on the A, C or H bus than walking. After 5 PM, flex time opens other campuses' lots, so park-and-ride becomes common.

## Check-ins

Students can opt in to a push notification after a trip asking "Did you find a spot?". Their answer counts as live evidence for that lot and feeds the learned fill curves. Sending is driven by an external cron, since the app has no scheduler of its own. Set up a job at [cron-job.org](https://cron-job.org) (step-by-step: [Step 7](#7-cron-job-sends-the-check-ins-every-minute)):

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

1. Set every env var in the host, with `VAPID_SUBJECT` set to the deployed URL ([Step 8](#8-put-the-same-keys-on-vercel-deployed-site)).
2. Add the deployed domain under Firebase **Authentication → Settings → Authorized domains**.
3. Create the once-a-minute cron job described in [Check-ins](#check-ins). Without it, check-in notifications are never sent (students are still asked when they next open the app).

The map uses CARTO's basemap tiles (OpenStreetMap data) when `NEXT_PUBLIC_CARTO_KEY` is set. The key is free for non-commercial use up to 5M requests a month: request one at [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey/). Without a key it falls back to the standard OpenStreetMap tiles. To change providers (for example Google Maps, if that gets funded), edit `TILE_URL`, `LABELS_URL` and `ATTRIBUTION` in [components/CampusMap.tsx](components/CampusMap.tsx); the lot and building layers don't depend on the tile provider.
