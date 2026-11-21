// Campus-local (America/New_York) time helpers. Rules and class blocks are always
// evaluated in campus time, regardless of where the server runs.

export const CAMPUS_TZ = "America/New_York";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface CampusParts {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: number; // 0 = Sunday
  minutes: number; // minutes after local midnight
}

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function campusParts(date: Date): CampusParts {
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: DAY_NAMES.indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Bad time "${s}", expected HH:MM`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) throw new Error(`Bad time "${s}"`);
  return h * 60 + min;
}

export function formatMinutes(total: number): string {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60);
  const m = t % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function describeCampusTime(date: Date): string {
  const p = campusParts(date);
  return `${DAY_NAMES[p.weekday]} ${formatMinutes(p.minutes)}`;
}

/** UTC Date for a campus-local wall-clock time on the same campus day as `ref`. */
export function campusTimeOnDay(ref: Date, minutesAfterMidnight: number): Date {
  const p = campusParts(ref);
  const guess = Date.UTC(p.year, p.month - 1, p.day, 0, 0) + minutesAfterMidnight * 60_000;
  // Find the zone offset at the guess, then correct (handles DST).
  const local = campusParts(new Date(guess));
  const localAsUtc =
    Date.UTC(local.year, local.month - 1, local.day, 0, 0) + local.minutes * 60_000;
  const offset = localAsUtc - guess;
  return new Date(guess - offset);
}

export const dayName = (d: number) => DAY_NAMES[d];
