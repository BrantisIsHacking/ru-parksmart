// Turn Gemini's schedule JSON into ClassEntry rows. Pure (no network), so it is unit tested
// with real model output in lib/scheduleParse.test.ts.
import { resolveClassBuilding, splitLocation } from "./classes";
import type { Building, ClassEntry, ClassReviewField } from "./types";

export interface RawScheduleClass {
  course?: string;
  courseNumber?: string;
  section?: string;
  location?: string;
  campus?: string;
  days?: number[];
  start?: string;
  end?: string;
  /** Fields the model couldn't read with confidence. */
  unsure?: string[];
}

/** Model field → the editor field the student should check. */
const REVIEW_FOR: Record<string, ClassReviewField[]> = {
  course: ["course"],
  location: ["building", "room"],
  days: ["days"],
  start: ["time"],
  end: ["time"],
};

const CAMPUSES = new Set(["livingston", "busch", "college_ave", "cook_douglass"]);

/** "8:30", "08:30", "8:30 AM", "2:00 PM" → "HH:MM" (24-hour), else null. */
export function toHHMM(t?: string | null): string | null {
  if (!t) return null;
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap])?\.?\s*m?\.?\s*$/i.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toLowerCase();
  if (ampm === "p" && h < 12) h += 12;
  if (ampm === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "01:198:210:03" → { number: "01:198:210", section: "03" }. */
function splitCourseNumber(raw?: string, section?: string): { number?: string; section?: string } {
  const parts = raw?.trim().split(":") ?? [];
  if (parts.length === 4) return { number: parts.slice(0, 3).join(":"), section: section?.trim() || parts[3] };
  return { number: raw?.trim() || undefined, section: section?.trim() || undefined };
}

/**
 * Validate, normalize and merge. Meetings of the same section in the same room at the
 * same time become one class with several days (models often list each day separately).
 */
export function parseScheduleClasses(raw: RawScheduleClass[] | undefined, buildings: Building[]): ClassEntry[] {
  const merged = new Map<string, ClassEntry>();
  for (const c of raw ?? []) {
    const start = toHHMM(c.start);
    const location = c.location?.trim();
    const days = [...new Set((c.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
    if (!start || !location || !days.length) continue;
    const { number, section } = splitCourseNumber(c.courseNumber, c.section);
    const end = toHHMM(c.end);
    const key = [c.course?.trim().toLowerCase(), number, section, location.toUpperCase(), start, end].join("|");
    const review = [...new Set((c.unsure ?? []).flatMap((f) => REVIEW_FOR[f] ?? []))];
    const existing = merged.get(key);
    if (existing) {
      existing.days = [...new Set([...existing.days, ...days])].sort();
      if (review.length) existing.needsReview = [...new Set([...(existing.needsReview ?? []), ...review])];
      continue;
    }
    const loc = splitLocation(location);
    merged.set(key, {
      course: c.course?.trim() || undefined,
      courseNumber: number,
      section,
      building: location,
      buildingCode: loc.code ?? null,
      room: loc.room ?? null,
      campus: c.campus && CAMPUSES.has(c.campus) ? (c.campus as ClassEntry["campus"]) : null,
      days: days.sort(),
      start,
      end,
      ...(review.length ? { needsReview: review } : {}),
    });
  }
  // "BE-252" + Livingston → Beck Hall. Unresolved rows keep the raw text for the student to fix.
  return [...merged.values()].map((c) => resolveClassBuilding(c, buildings)).sort((a, b) => a.start.localeCompare(b.start));
}
