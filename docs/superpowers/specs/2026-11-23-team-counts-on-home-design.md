# Team counts drive the home screen

## Why
A manual count saved on `/pilot` should change the lot status students see on the home screen. It's the most accurate information the app has, and it lets the team demo the link between `/pilot` and the home screen.

## Goals
- A fresh count becomes the strongest evidence for that lot's status and confidence.
- The lot's "where this comes from" list shows "Team count, N min ago".
- Its influence fades over time, like reports.
- The home screen, the Ask assistant and the report confirmation all show the same estimate.

## Non-goals
- Live auto-refresh of the home screen (students tap Refresh as today).
- Showing a count of open spaces (the app still shows only a status).

## Anti-goals
- The prediction-accuracy metric must not use counts. It must stay a fair test of the model.

## Approaches
- **A. Always on (chosen):** counts are a fourth evidence layer for every user.
- B. Demo-only switch: rejected because it adds code used only for demos and withholds the best data from students.

## Design
- `estimateLot` takes an optional `counts: ManualCount[]`. For each lot it uses only the **newest** count at or before `now`, counted at most 90 minutes before the arrival time being estimated.
  - Value: `occupied / capacity`.
  - Weight: `3 × 0.5^(age / 30 min)`. A fresh count outweighs the placeholder baseline (0.3) and about six new-reporter reports (0.5 each), and gives confidence above 0.95.
  - Evidence kind `team_count`, labelled "Team count", detail "Team count: 380 of 400 cars".
- `Store` gets `countsSince(sinceIso)` for Firestore and memory. Firestore uses the existing `createdAt` field, which equals `countedAt`.
- `estimatesFor` (home screen, Ask assistant) and the report route pass recent counts to `estimateLot`.
- `evaluatePredictions` keeps calling `estimateLot` **without** counts, with a comment saying why, and a test.
- After saving a count, the `/pilot` confirmation adds: "The home screen now uses this count. Tap Refresh there."
- README: the "How it works" section mentions team counts.

## Left to the builder
- Exact wording and styling of the new evidence label.
- Constant names.
