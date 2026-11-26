// Turn a class's location ("BE-AUD", "TIL-254", "Hill Center") into a campus-map building.
// Dependency-free: the server passes BUILDINGS, the browser passes the list it fetched.
import { rankBuildings } from "./search";
import type { Building, ClassEntry } from "./types";

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
  const byId = c.buildingId ? buildings.find((b) => b.id === c.buildingId) : undefined;
  const loc = splitLocation(c.building);
  const query = c.buildingCode || loc.code || c.building;
  const matches = byId ? [byId] : query ? rankBuildings(buildings, query, 5) : [];
  const match = matches.find((b) => c.campus && b.campus === c.campus) ?? matches[0];
  if (!match) return { ...c, buildingId: null };
  return {
    ...c,
    building: match.name,
    buildingId: match.id,
    buildingCode: match.code ?? loc.code ?? c.buildingCode ?? null,
    room: c.room ?? loc.room ?? null,
    campus: match.campus,
  };
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
