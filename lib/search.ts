// Building/lot text search shared by the server (findBuilding) and the map's search box.
// Dependency-free so the client can use it with the building list it fetches.
import type { Building, Lot } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "TIL-254", "ARC 103", "hll" → "TIL"/"ARC"/"HLL": a building code with an optional room number. */
export const codeOf = (raw: string) => /^([A-Za-z]{2,4})(?:[\s-]*[A-Za-z]?\d+[A-Za-z]?)?$/.exec(raw.trim())?.[1].toUpperCase();

/** Ranked building matches: code, exact name, alias, name prefix, word, substring, address. */
export function rankBuildings(buildings: Building[], query: string, limit = 8): Building[] {
  const raw = query.trim();
  const q = norm(raw);
  if (!q) return [];
  const code = codeOf(raw);
  const scored: { b: Building; score: number }[] = [];
  for (const b of buildings) {
    const name = norm(b.name);
    let score = 0;
    if (b.id === raw) score = 100;
    else if (code && b.code === code) score = 95;
    else if (name === q) score = 90;
    else if (b.aliases.some((a) => norm(a) === q)) score = 85;
    else if (name.startsWith(q)) score = 70;
    else if (q.length >= 4 && ` ${name} `.includes(` ${q} `)) score = 60;
    else if (q.length >= 4 && q.includes(name) && name.length >= 5) score = 55;
    else if (q.length >= 3 && name.includes(q)) score = 40;
    else if (q.length >= 4 && b.aliases.some((a) => norm(a).includes(q))) score = 35;
    else if (q.length >= 4 && b.address && norm(b.address).startsWith(q)) score = 30;
    if (score) scored.push({ b, score: score - name.length / 1000 });
  }
  return scored.sort((x, y) => y.score - x.score).slice(0, limit).map((s) => s.b);
}

/** Lots by number ("98a", "lot 915") or name ("yellow", "stadium west"). */
export function rankLots<T extends Pick<Lot, "id" | "name">>(lots: T[], query: string, limit = 5): T[] {
  const q = norm(query).replace(/^lot\s*/, "");
  if (!q) return [];
  const scored: { l: T; score: number }[] = [];
  for (const l of lots) {
    const name = norm(l.name);
    const num = norm(l.id.split("-").slice(1).join(" "));
    let score = 0;
    if (num === q) score = 90;
    else if (num.startsWith(q) && /^\d/.test(q)) score = 60;
    else if (q.length >= 3 && name.includes(q)) score = 50;
    if (score) scored.push({ l, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.l);
}
