// Builds data/buildingCodes.json: every building code and room that New Brunswick classes
// meet in, from the public Rutgers Schedule of Classes, linked to campus-map buildings.
// The schedule importer uses it to resolve codes, catch misread codes and misread rooms.
//
// Run after scripts/import-campus-map.mjs:
//   node scripts/import-soc.mjs                 # Fall 2026 + Spring 2027
//   node scripts/import-soc.mjs 2027:1 2027:9   # any year:term list (term 1=Spring, 7=Summer, 9=Fall, 0=Winter)
import { readFile, writeFile } from "node:fs/promises";

const API = "https://classes.rutgers.edu/soc/api/courses.json";
const TERMS = (process.argv.slice(2).length ? process.argv.slice(2) : ["2026:9", "2027:1"]).map((t) => t.split(":").map(Number));
const TERM_NAME = { 0: "Winter", 1: "Spring", 7: "Summer", 9: "Fall" };
/** SOC campus names → app campus (downtown classes are nearest the College Ave lots). */
const CAMPUS = { "COLLEGE AVENUE": "college_ave", BUSCH: "busch", LIVINGSTON: "livingston", "DOUGLAS/COOK": "cook_douglass", "DOWNTOWN NB": "college_ave" };

const data = new URL("../data/", import.meta.url);
const buildings = JSON.parse(await readFile(new URL("buildings.json", data), "utf8")).buildings;
const manual = JSON.parse(await readFile(new URL("buildingCodes.manual.json", data), "utf8")).aliases;
const byId = new Map(buildings.map((b) => [b.id, b]));

// ---- fetch (Node's fetch; Windows curl can fail Rutgers' certificate revocation check) ----
const codes = new Map();
const loaded = [];
for (const [year, term] of TERMS) {
  const res = await fetch(`${API}?year=${year}&term=${term}&campus=NB`, { headers: { "User-Agent": "ru-parksmart-import" } });
  if (!res.ok) {
    console.warn(`${TERM_NAME[term]} ${year}: HTTP ${res.status}, skipped`);
    continue;
  }
  const courses = await res.json();
  if (!Array.isArray(courses) || !courses.length) {
    console.warn(`${TERM_NAME[term]} ${year}: not published yet, skipped`);
    continue;
  }
  loaded.push(`${TERM_NAME[term]} ${year}`);
  for (const c of courses)
    for (const s of c.sections ?? [])
      for (const m of s.meetingTimes ?? []) {
        const code = m.buildingCode?.trim().toUpperCase();
        if (!code || !CAMPUS[m.campusName]) continue; // online, off campus
        const e = codes.get(code) ?? { campuses: new Map(), rooms: new Set(), meetings: 0 };
        e.meetings++;
        e.campuses.set(CAMPUS[m.campusName], (e.campuses.get(CAMPUS[m.campusName]) ?? 0) + 1);
        if (m.roomNumber?.trim()) e.rooms.add(m.roomNumber.trim().toUpperCase());
        codes.set(code, e);
      }
}
if (!loaded.length) throw new Error("No Schedule of Classes term could be loaded");

// ---- link each code to a campus-map building ----
const out = {};
const unmatched = [];
for (const [code, e] of [...codes].sort((a, b) => a[0].localeCompare(b[0]))) {
  const campus = [...e.campuses].sort((a, b) => b[1] - a[1])[0][0];
  const sameCode = buildings.filter((b) => b.code === code);
  const building = manual[code] ? byId.get(manual[code].buildingId) : (sameCode.find((b) => b.campus === campus) ?? sameCode[0]);
  if (manual[code] && !building) throw new Error(`buildingCodes.manual.json: ${code} → unknown building id ${manual[code].buildingId}`);
  out[code] = {
    buildingId: building?.id ?? null,
    name: building?.name ?? null,
    campus: building?.campus ?? campus,
    rooms: [...e.rooms].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    meetings: e.meetings,
  };
  if (!building) unmatched.push(`${code} (${campus}, ${e.meetings} meetings; rooms ${[...e.rooms].slice(0, 5).join(" ")})`);
}

const today = new Date().toISOString().slice(0, 10);
await writeFile(
  new URL("buildingCodes.json", data),
  JSON.stringify(
    {
      _note: `Generated ${today} by scripts/import-soc.mjs from the Rutgers Schedule of Classes (${loaded.join(", ")}). Every building code New Brunswick classes meet in, its rooms, and the campus-map building it links to (null = not linked yet; add it to buildingCodes.manual.json).`,
      codes: out,
    },
    null,
    1,
  ) + "\n",
);
const linked = Object.values(out).filter((c) => c.buildingId).length;
console.log(`terms: ${loaded.join(", ")}`);
console.log(`codes: ${Object.keys(out).length}, linked to a building: ${linked}, rooms: ${Object.values(out).reduce((n, c) => n + c.rooms.length, 0)}`);
console.log(`unlinked (${unmatched.length}), by meetings:`);
for (const u of unmatched.sort((a, b) => Number(/(\d+) meetings/.exec(b)[1]) - Number(/(\d+) meetings/.exec(a)[1]))) console.log("  " + u);
