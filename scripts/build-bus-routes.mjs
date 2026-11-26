// Builds data/busRoutes.json from the weekday DOTS route PDFs (transcribed below)
// and stop coordinates in data/busStops.json (OpenStreetMap).
// Run after scripts/import-campus-map.mjs:  node scripts/build-bus-routes.mjs
//
// Only start-to-start offsets are published ("From BSC 7:23" vs "From CASC 7:00").
// Those are `anchors`; other stop offsets are estimated from straight-line distance
// and scaled so the anchors hold. headwayMin is the slowest daytime frequency, so
// plans err early. Routes running past midnight stop at 23:45 for the planner.
import { readFile, writeFile } from "node:fs/promises";

const SRC = "https://ipo.rutgers.edu/transportation/buses/nb";
const WEEKDAYS = [1, 2, 3, 4, 5];

/** stops: [catalog stop name, display name?]; anchors: { stopIndex: minutes }. */
const ROUTES = [
  {
    id: "A", name: "A (College Ave ↔ Busch)", days: WEEKDAYS, first: "07:00", last: "21:00", headway: 10,
    stops: ["College Avenue Student Center", "The Yard", "Student Activities Center", "Stadium West Lot", "Hill Center", "Science Buildings", "Busch Student Center", ["Weblin Recreation Center", "Werblin Recreation Center"]],
    anchors: { 0: 0, 6: 23 },
  },
  {
    id: "B", name: "B (Livingston ↔ Busch)", days: WEEKDAYS, first: "07:00", last: "22:21", headway: 7,
    stops: ["Livingston Student Center", "Quads", "Hill Center", "Science Buildings", "Busch Student Center", "Livingston Plaza"],
    anchors: { 0: 0, 4: 18 },
  },
  {
    id: "C", name: "C (Busch Commuter Shuttle)", days: [1, 2, 3, 4], first: "07:30", last: "21:54", headway: 12,
    stops: ["Stadium West Lot", "Hill Center", "Allison Road Classroom Building", "Hill Center"],
    anchors: { 0: 0, 2: 7 },
  },
  {
    id: "C-FRI", name: "C (Busch Commuter Shuttle, Friday)", days: [5], first: "07:30", last: "19:18", headway: 12,
    stops: ["Stadium West Lot", "Hill Center", "Allison Road Classroom Building", "Hill Center"],
    anchors: { 0: 0, 2: 7 },
  },
  {
    id: "EE", name: "EE (College Ave ↔ Cook/Douglass)", days: WEEKDAYS, first: "06:00", last: "23:45", headway: 7,
    stops: ["Red Oak Lane", "Lipman Hall", "Biel Road", "Henderson Apartments", "Gibbons", "College Hall", "SoCam Apartments", "Student Activities Center", "College Avenue Student Center", "The Yard"],
    anchors: { 0: 0 },
  },
  {
    id: "F", name: "F (College Ave ↔ Cook/Douglass)", days: WEEKDAYS, first: "07:00", last: "20:36", headway: 6,
    stops: ["Red Oak Lane", "Lipman Hall", "College Hall", "Student Activities Center", "The Yard"],
    anchors: { 0: 0, 3: 10 },
  },
  {
    id: "H", name: "H (College Ave ↔ Busch)", days: WEEKDAYS, first: "06:00", last: "23:45", headway: 8,
    stops: ["Busch Student Center", "Allison Road Classroom Building", "Hill Center", "Stadium West Lot", "College Avenue Student Center", "The Yard", "Student Activities Center", ["Weblin Recreation Center", "Werblin Recreation Center"]],
    anchors: { 0: 0, 4: 16 },
  },
  {
    id: "LX", name: "LX (College Ave ↔ Livingston)", days: WEEKDAYS, first: "06:00", last: "23:45", headway: 6,
    stops: ["Livingston Student Center", "Quads", "College Avenue Student Center", "The Yard", "Student Activities Center", "Livingston Plaza"],
    anchors: { 0: 0, 2: 13 },
  },
  {
    id: "REXB", name: "REXB (Cook/Douglass ↔ Busch)", days: WEEKDAYS, first: "07:00", last: "22:54", headway: 12,
    stops: ["Red Oak Lane", "Lipman Hall", "College Hall", "Hill Center", "Allison Road Classroom Building", "Hill Center"],
    anchors: { 0: 0, 4: 16 },
  },
  {
    id: "REXL", name: "REXL (Cook/Douglass ↔ Livingston)", days: WEEKDAYS, first: "07:00", last: "22:59", headway: 12,
    stops: ["Red Oak Lane", "Lipman Hall", "College Hall", "Livingston Plaza", "Livingston Student Center"],
    anchors: { 0: 0, 4: 16 },
  },
];

const data = new URL("../data/", import.meta.url);
const { stops: STOPS } = JSON.parse(await readFile(new URL("busStops.json", data), "utf8"));

function meters(a, b) {
  const R = 6_371_000;
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Rough bus minutes between stops: road factor 1.4 at ~25 km/h, plus 1 min dwell. */
const legMin = (a, b) => (meters(a, b) * 1.4) / 7 / 60 + 1;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const out = [];
for (const r of ROUTES) {
  const stops = r.stops.map((s) => {
    const [osmName, display] = Array.isArray(s) ? s : [s, s];
    const pts = STOPS[osmName];
    if (!pts?.length) throw new Error(`Route ${r.id}: no coordinates for stop "${osmName}"`);
    return { id: slug(display), name: display, center: pts[0] };
  });
  // Raw cumulative estimate, then piecewise-linear rescale so published anchors hold.
  const raw = [0];
  for (let i = 1; i < stops.length; i++) raw.push(raw[i - 1] + legMin(stops[i - 1].center, stops[i].center));
  const anchors = Object.entries(r.anchors).map(([i, m]) => [Number(i), m]).sort((a, b) => a[0] - b[0]);
  const offsets = raw.map((t, i) => {
    let lo = anchors[0];
    let hi = null;
    for (const a of anchors) {
      if (a[0] <= i) lo = a;
      else if (!hi) hi = a;
    }
    if (lo[0] === i) return lo[1];
    if (!hi) return lo[1] + (t - raw[lo[0]]); // past the last anchor: raw estimate
    const span = raw[hi[0]] - raw[lo[0]];
    return lo[1] + ((t - raw[lo[0]]) / (span || 1)) * (hi[1] - lo[1]);
  });
  out.push({
    id: r.id,
    name: r.name,
    days: r.days,
    firstDeparture: r.first,
    lastDeparture: r.last,
    headwayMin: r.headway,
    // Minutes for one full loop back to the first stop (forward ride times wrap around it).
    loopMin: Math.round(offsets[offsets.length - 1] + legMin(stops[stops.length - 1].center, stops[0].center)),
    verified: false,
    stops: stops.map((s, i) => ({ ...s, offsetMin: Math.round(offsets[i]) })),
  });
}

const today = new Date().toISOString().slice(0, 10);
await writeFile(
  new URL("busRoutes.json", data),
  JSON.stringify(
    {
      _note: `SCHEDULED (not live) weekday service, generated ${today} by scripts/build-bus-routes.mjs from the DOTS route PDFs (${SRC}). First/last departures and headways are from the PDFs (headway = slowest daytime frequency). Only start-to-start offsets are published; other stop offsets are estimated. Stop coordinates are from OpenStreetMap. Thanksgiving week and weekends run different schedules. Live buses: TripShot (https://rutgers.tripshot.com/).`,
      routes: out,
    },
    null,
    1,
  ) + "\n",
);
for (const r of out) console.log(r.id.padEnd(6), r.stops.map((s) => `${s.name}@${s.offsetMin}`).join(" → "));
