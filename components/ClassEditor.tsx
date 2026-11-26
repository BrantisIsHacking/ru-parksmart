"use client";
// Class list editor for imported and hand-entered classes. The building box autocompletes
// from the Rutgers campus map so every class points at a real building (and campus).
// Anything the schedule reader wasn't sure about is outlined and the student is asked to check it.
import { useState } from "react";
import { resolveClassBuilding, splitLocation, suggestBuildings, suggestRooms } from "@/lib/classes";
import { CAMPUS_LABEL } from "@/lib/campus";
import { rankBuildings } from "@/lib/search";
import type { Building, ClassEntry, ClassReviewField } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Mon–Sat: Rutgers has a few Saturday sections.
const WEEKDAYS = [1, 2, 3, 4, 5, 6];

export const EMPTY_CLASS: ClassEntry = { building: "", buildingId: null, days: [], start: "" };

const FIELD_LABEL: Record<ClassReviewField, string> = {
  course: "course name",
  building: "building",
  room: "room",
  days: "days",
  time: "time",
};

/** Classes the student still needs to check: flagged by the reader, or a building that didn't match. */
export const needsCheck = (c: ClassEntry) => !!c.needsReview?.length || (!!c.building.trim() && !c.buildingId);

function joinAnd(parts: string[]) {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Amber outline on a field the student should check. */
const flagged = (c: ClassEntry, f: ClassReviewField) => (c.needsReview?.includes(f) ? "ring-2 ring-curb ring-offset-1" : "");

export function ClassEditor({
  classes,
  onChange,
  buildings,
}: {
  classes: ClassEntry[];
  onChange: (next: ClassEntry[]) => void;
  buildings: Building[];
}) {
  /** Apply an edit; editing a flagged field counts as checking it. */
  const set = (i: number, patch: Partial<ClassEntry>, checked: ClassReviewField[] = []) =>
    onChange(
      classes.map((c, j) => {
        if (j !== i) return c;
        const review = (c.needsReview ?? []).filter((f) => !checked.includes(f));
        return { ...c, ...patch, needsReview: review.length ? review : undefined };
      }),
    );
  const remove = (i: number) => onChange(classes.filter((_, j) => j !== i));

  if (!classes.length) return null;
  return (
    <ul className="space-y-3">
      {classes.map((c, i) => {
        const review = c.needsReview ?? [];
        const check = needsCheck(c);
        return (
          <li key={i} className={`panel space-y-3 p-3 ${check ? "border-2 border-curb" : ""}`}>
            {check && (
              <div className="curb-note space-y-2 text-[14px]">
                <p>
                  <span className="font-extrabold">Check this class.</span>{" "}
                  {review.length
                    ? `We couldn't read the ${joinAnd(review.map((f) => FIELD_LABEL[f]))} clearly. Fix anything that's wrong.`
                    : "We couldn't find that building. Pick it below."}
                </p>
                {review.length > 0 && c.buildingId && (
                  <button type="button" className="rounded-[6px] bg-asphalt px-3 py-1.5 text-[14px] font-bold text-white" onClick={() => set(i, {}, review)}>
                    Looks right
                  </button>
                )}
              </div>
            )}

            <div className="flex items-start gap-2">
              <label className="block flex-1 space-y-1">
                <span className="text-[13px] font-semibold text-muted">Course (optional)</span>
                <input
                  className={`field ${flagged(c, "course")}`}
                  placeholder="e.g. Linear Optimization"
                  value={c.course ?? ""}
                  onChange={(e) => set(i, { course: e.target.value }, ["course"])}
                />
              </label>
              <button type="button" className="mt-6 px-2 text-[13px] font-semibold text-muted underline" onClick={() => remove(i)} aria-label={`Remove class ${i + 1}`}>
                Remove
              </button>
            </div>

            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <BuildingPicker entry={c} buildings={buildings} onPick={(patch) => set(i, patch, patch.buildingId ? ["building"] : [])} />
              <label className="block space-y-1">
                <span className="text-[13px] font-semibold text-muted">Room</span>
                <input
                  className={`field ${flagged(c, "room")}`}
                  placeholder="254"
                  value={c.room ?? ""}
                  onChange={(e) => set(i, { room: e.target.value.toUpperCase() || null }, ["room"])}
                />
              </label>
            </div>
            <RoomSuggestions entry={c} onPick={(room) => set(i, { room }, ["room"])} />

            <div className="space-y-1">
              <span className="text-[13px] font-semibold text-muted">Days</span>
              <div className={`flex flex-wrap gap-1.5 rounded-[8px] ${flagged(c, "days")}`}>
                {WEEKDAYS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={c.days.includes(n)}
                    className={`min-h-10 min-w-12 rounded-[6px] px-2.5 text-[14px] font-bold ${c.days.includes(n) ? "bg-asphalt text-on-sign" : "border-[1.5px] border-line text-muted"}`}
                    onClick={() => set(i, { days: c.days.includes(n) ? c.days.filter((x) => x !== n) : [...c.days, n].sort() }, ["days"])}
                  >
                    {DAYS[n]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[13px] font-semibold text-muted">Starts</span>
                <input className={`field tabular-nums ${flagged(c, "time")}`} type="time" value={c.start} onChange={(e) => set(i, { start: e.target.value }, ["time"])} />
              </label>
              <label className="block space-y-1">
                <span className="text-[13px] font-semibold text-muted">Ends (optional)</span>
                <input className={`field tabular-nums ${flagged(c, "time")}`} type="time" value={c.end ?? ""} onChange={(e) => set(i, { end: e.target.value || null }, ["time"])} />
              </label>
            </div>

            {(!c.start || !c.days.length) && (
              <p className="text-[13px] text-muted">Add the days and start time so the plan screen knows when you need to be there.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "Room B209 isn't a class room in LSH. Did you mean B269?", from the Schedule of Classes room list. */
function RoomSuggestions({ entry, onPick }: { entry: ClassEntry; onPick: (room: string) => void }) {
  // Only while the room is still flagged: once the student confirms or retypes it, trust them.
  const rooms = entry.needsReview?.includes("room") ? suggestRooms(entry) : [];
  if (!rooms.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-semibold text-scarlet">
        No classes meet in room {entry.room} of {entry.buildingCode}.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-semibold">Did you mean room</span>
        {rooms.map((r) => (
          <button key={r} type="button" className="rounded-full border-[1.5px] border-asphalt px-2.5 py-1 text-[13px] font-bold" onClick={() => onPick(r)}>
            {r}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-muted">If your room really is {entry.room}, keep it: some labs and offices aren&apos;t in the course listings.</p>
    </div>
  );
}

function BuildingPicker({
  entry,
  buildings,
  onPick,
}: {
  entry: ClassEntry;
  buildings: Building[];
  onPick: (patch: Partial<ClassEntry>) => void;
}) {
  const [open, setOpen] = useState(false);
  const text = entry.building;
  const resolved = entry.buildingId ? buildings.find((b) => b.id === entry.buildingId) : undefined;
  const query = splitLocation(text).code ?? text;
  const matches = open && text.trim().length >= 2 && !resolved ? rankBuildings(buildings, query, 6) : [];
  // One-letter misreads ("LWH" for "LSH") on the same campus.
  const suggestions = !resolved && !open ? suggestBuildings(entry, buildings) : [];
  const readCode = entry.buildingCode || splitLocation(text).code;

  const pick = (b: Building) => {
    onPick({ building: b.name, buildingId: b.id, buildingCode: b.code ?? null, campus: b.campus });
    setOpen(false);
  };

  return (
    <div className="relative space-y-1">
      <label className="block space-y-1">
        <span className="text-[13px] font-semibold text-muted">Building</span>
        <input
          className={`field ${entry.needsReview?.includes("building") || (!resolved && text.trim()) ? "ring-2 ring-curb ring-offset-1" : ""}`}
          placeholder="Name or code, e.g. Tillett or TIL"
          value={text}
          onChange={(e) => {
            // Typing un-picks the building until a match is chosen.
            onPick({ building: e.target.value, buildingId: null, buildingCode: null });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Give a tap on a suggestion time to land, then auto-resolve exact codes like "TIL-254".
            window.setTimeout(() => setOpen(false), 150);
            if (!entry.buildingId && splitLocation(text).code && buildings.length) {
              const r = resolveClassBuilding(entry, buildings);
              if (r.buildingId && r.buildingCode === splitLocation(text).code) onPick(r);
            }
          }}
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-autocomplete="list"
        />
      </label>
      {matches.length > 0 && (
        <ul className="panel absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto shadow-lg" role="listbox">
          {matches.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="w-full px-3 py-2 text-left hover:bg-concrete"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(b)}
              >
                <span className="font-semibold">{b.name}</span>
                <span className="block text-[13px] text-muted">{[b.code, CAMPUS_LABEL[b.campus]].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {resolved ? (
        <p className="text-[13px] font-semibold text-go">
          ✓ {[resolved.code, CAMPUS_LABEL[resolved.campus]].filter(Boolean).join(" · ")}
        </p>
      ) : (
        text.trim() &&
        !open && (
          <div className="space-y-1.5">
            <p className="text-[13px] font-semibold text-scarlet">
              {readCode ? `No Rutgers building has the code “${readCode}”.` : "Pick the building from the list so we can find parking near it."}
            </p>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-semibold">Did you mean</span>
                {suggestions.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="rounded-full border-[1.5px] border-asphalt px-2.5 py-1 text-[13px] font-bold"
                    onClick={() => pick(b)}
                  >
                    {b.name} ({b.code})
                  </button>
                ))}
              </div>
            )}
            {!suggestions.length && readCode && <p className="text-[13px] text-muted">Type the building&apos;s name above and pick it from the list.</p>}
          </div>
        )
      )}
    </div>
  );
}
