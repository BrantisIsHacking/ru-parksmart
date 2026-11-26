// Turn a class's location ("BE-AUD", "TIL-254", "Hill Center") into a campus-map building.
// The server passes BUILDINGS, the browser passes the list it fetched. Building codes and
// rooms that classes actually meet in come from the Schedule of Classes (scripts/import-soc.mjs).
import codesJson from "../data/buildingCodes.json";
import { rankBuildings } from "./search";
import type { Building, Campus, ClassEntry } from "./types";

interface ScheduleCode {
  buildingId: string | null;
  name: string | null;
  campus: Campus;
  rooms: string[];
  meetings: number;
}
/** Every building code NB classes meet in → its campus-map building and real rooms. */
export const SCHEDULE_CODES = codesJson.codes as Record<string, ScheduleCode>;

/** "BE-AUD" → { code: "BE", room: "AUD" }; "TIL-254" / "ARC 103" / "HLL114" → code + room. */
export function splitLocation(raw: string): { code?: string; room?: string } {
  const s = raw.trim();
  // Numeric rooms in any case: "TIL-254", "arc 103", "HLL114".
  const numeric = /^([A-Za-z]{2,4})[\s-]*(\d+[A-Za-z]?)$/.exec(s);
  if (numeric) return { code: numeric[1].toUpperCase(), room: numeric[2].toUpperCase() };
  // Lettered rooms only in the schedule's uppercase CODE-ROOM form ("BE-AUD"), so "Hill Center" stays a name.
  const lettered = /^([A-Z]{2,4})-([A-Z0-9]{1,5})$/.exec(s);
  if (lettered) return { code: lettered[1], room: lettered[2] };
  return {};
}

/**
 * Fill buildingId, building name, code and campus. Prefers a match on the campus the
 * schedule names. Leaves buildingId null when nothing matches, so the UI can ask.
 */
export function resolveClassBuilding(c: ClassEntry, buildings: Building[]): ClassEntry {
  const loc = splitLocation(c.building);
  const code = (c.buildingCode || loc.code)?.toUpperCase();
  const room = c.room ?? loc.room ?? null;
  const review = new Set(c.needsReview ?? []);

  // 1. Already picked. 2. A schedule code we know ("ABW" → Academic Building). 3. Name/code search.
  const known = code ? SCHEDULE_CODES[code] : undefined;
  let match = c.buildingId ? buildings.find((b) => b.id === c.buildingId) : undefined;
  if (!match && known?.buildingId) match = buildings.find((b) => b.id === known.buildingId);
  if (!match) {
    const query = code || c.building;
    const matches = query ? rankBuildings(buildings, query, 5) : [];
    // A bare code must match exactly: "LWH" must not fuzzy-match some building with an L, W and H in its name.
    const usable = code ? matches.filter((b) => b.code === code) : matches;
    match = usable.find((b) => c.campus && b.campus === c.campus) ?? usable[0];
  }

  // Unmatched: keep the code and room that were read, and ask the student to check the building.
  if (!match) {
    review.add("building");
    // A misread code usually means the room was misread too ("LSH-B269" read as "LWH-B209").
    if (room) review.add("room");
    return { ...c, buildingId: null, buildingCode: code ?? null, room, needsReview: [...review] };
  }

  const resolved: ClassEntry = {
    ...c,
    building: match.name,
    buildingId: match.id,
    // Keep the schedule's code ("ABW") so rooms can be checked; fall back to the map's code.
    buildingCode: code ?? match.code ?? null,
    room,
    campus: match.campus,
  };
  // A room this building doesn't have, but one a character away exists: probably misread.
  if (suggestRooms(resolved).length) review.add("room");
  return review.size ? { ...resolved, needsReview: [...review] } : { ...resolved, needsReview: undefined };
}

/** Characters screenshots and OCR confuse; swapping one of these costs half an edit. */
const LOOKALIKE = ["S5", "O0", "OD", "OQ", "I1", "L1", "IL", "B8", "G6", "Z2", "WV", "MN", "UV", "EF", "CG", "CO", "RP", "T7", "A4"];
const lookalike = (a: string, b: string) => LOOKALIKE.some((p) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));

/** Edit distance where look-alike characters are cheaper to swap ("LWH" vs "LSH" = 1, "B8" vs "BB" = 0.5). */
export function misreadDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : lookalike(a[i - 1], b[j - 1]) ? 0.5 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + sub);
    }
  }
  return dp[a.length][b.length];
}

/**
 * "Did you mean…?" buildings for a class whose building didn't resolve: real codes about
 * one character away from what was read (same campus first, then look-alike swaps, then
 * busier buildings), e.g. "LWH" on Livingston → Lucy Stone Hall (LSH). Each result carries
 * the code it matched on, so picking it keeps the schedule's code.
 */
export function suggestBuildings(c: ClassEntry, buildings: Building[], limit = 3): Building[] {
  if (c.buildingId) return [];
  const read = (c.buildingCode || splitLocation(c.building).code)?.toUpperCase();
  if (!read) return [];
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const candidates = new Map<string, { b: Building; code: string; d: number; meetings: number }>();
  const consider = (code: string, b: Building | undefined, meetings: number) => {
    if (!b) return;
    const d = misreadDistance(read, code);
    if (d > 1) return;
    const prev = candidates.get(b.id);
    if (!prev || d < prev.d) candidates.set(b.id, { b, code, d, meetings });
  };
  // Codes classes really meet in, then any other coded building on the campus map.
  for (const [code, s] of Object.entries(SCHEDULE_CODES)) if (s.buildingId) consider(code, byId.get(s.buildingId), s.meetings);
  for (const b of buildings) if (b.code) consider(b.code, b, 0);
  return [...candidates.values()]
    .sort((x, y) => Number(y.b.campus === c.campus) - Number(x.b.campus === c.campus) || x.d - y.d || y.meetings - x.meetings)
    .slice(0, limit)
    .map((x) => ({ ...x.b, code: x.code }));
}

/**
 * Real rooms close to one that doesn't exist in this building ("B209" in LSH → "B269").
 * Empty when the room exists, the building's rooms aren't known, or nothing is close.
 */
export function suggestRooms(c: ClassEntry, limit = 3): string[] {
  const code = c.buildingCode?.toUpperCase();
  const room = c.room?.toUpperCase();
  const rooms = code ? SCHEDULE_CODES[code]?.rooms : undefined;
  if (!room || !rooms?.length || rooms.includes(room)) return [];
  return rooms
    .map((r) => ({ r, d: misreadDistance(room, r) }))
    .filter((x) => x.d <= 1)
    .sort((a, b) => a.d - b.d || a.r.localeCompare(b.r, undefined, { numeric: true }))
    .slice(0, limit)
    .map((x) => x.r);
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon/Wed 10:20 AM" for labels. */
export function classWhen(c: Pick<ClassEntry, "days" | "start">): string {
  const [h, m] = c.start.split(":").map(Number);
  const t = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return `${c.days.map((d) => DAY[d]).join("/")} ${t}`;
}

/** "BE-AUD" style room label, when known. */
export const classRoom = (c: Pick<ClassEntry, "buildingCode" | "room">) =>
  c.buildingCode && c.room ? `${c.buildingCode}-${c.room}` : c.buildingCode ?? null;
