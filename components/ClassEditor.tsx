"use client";
// Class list editor for imported and hand-entered classes. The building box autocompletes
// from the Rutgers campus map so every class points at a real building (and campus).
import { useState } from "react";
import { resolveClassBuilding, splitLocation } from "@/lib/classes";
import { CAMPUS_LABEL } from "@/lib/campus";
import { rankBuildings } from "@/lib/search";
import type { Building, ClassEntry } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Mon–Sat: Rutgers has a few Saturday sections.
const WEEKDAYS = [1, 2, 3, 4, 5, 6];

export const EMPTY_CLASS: ClassEntry = { building: "", buildingId: null, days: [], start: "" };

export function ClassEditor({
  classes,
  onChange,
  buildings,
}: {
  classes: ClassEntry[];
  onChange: (next: ClassEntry[]) => void;
  buildings: Building[];
}) {
  const set = (i: number, patch: Partial<ClassEntry>) => onChange(classes.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(classes.filter((_, j) => j !== i));

  if (!classes.length) return null;
  return (
    <ul className="space-y-3">
      {classes.map((c, i) => (
        <li key={i} className="panel space-y-3 p-3">
          <div className="flex items-start gap-2">
            <label className="block flex-1 space-y-1">
              <span className="text-[13px] font-semibold text-muted">Course (optional)</span>
              <input
                className="field"
                placeholder="e.g. Linear Optimization"
                value={c.course ?? ""}
                onChange={(e) => set(i, { course: e.target.value })}
              />
            </label>
            <button type="button" className="mt-6 px-2 text-[13px] font-semibold text-muted underline" onClick={() => remove(i)} aria-label={`Remove class ${i + 1}`}>
              Remove
            </button>
          </div>

          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <BuildingPicker entry={c} buildings={buildings} onPick={(patch) => set(i, patch)} />
            <label className="block space-y-1">
              <span className="text-[13px] font-semibold text-muted">Room</span>
              <input className="field" placeholder="254" value={c.room ?? ""} onChange={(e) => set(i, { room: e.target.value.toUpperCase() || null })} />
            </label>
          </div>

          <div className="space-y-1">
            <span className="text-[13px] font-semibold text-muted">Days</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={c.days.includes(n)}
                  className={`min-h-10 min-w-12 rounded-[6px] px-2.5 text-[14px] font-bold ${c.days.includes(n) ? "bg-asphalt text-on-sign" : "border-[1.5px] border-line text-muted"}`}
                  onClick={() => set(i, { days: c.days.includes(n) ? c.days.filter((x) => x !== n) : [...c.days, n].sort() })}
                >
                  {DAYS[n]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[13px] font-semibold text-muted">Starts</span>
              <input className="field tabular-nums" type="time" value={c.start} onChange={(e) => set(i, { start: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-[13px] font-semibold text-muted">Ends (optional)</span>
              <input className="field tabular-nums" type="time" value={c.end ?? ""} onChange={(e) => set(i, { end: e.target.value || null })} />
            </label>
          </div>

          {(!c.start || !c.days.length) && (
            <p className="text-[13px] text-muted">Add the days and start time so the plan screen knows when you need to be there.</p>
          )}
        </li>
      ))}
    </ul>
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

  const pick = (b: Building) => {
    onPick({ building: b.name, buildingId: b.id, buildingCode: b.code ?? null, campus: b.campus });
    setOpen(false);
  };

  return (
    <div className="relative space-y-1">
      <label className="block space-y-1">
        <span className="text-[13px] font-semibold text-muted">Building</span>
        <input
          className="field"
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
        !open && <p className="text-[13px] font-semibold text-scarlet">Pick the building from the list so we can find parking near it.</p>
      )}
    </div>
  );
}
