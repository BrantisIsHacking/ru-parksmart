"use client";
// Tap-first lot picker for the report screen: the lots your permit allows right now,
// campus tabs with big lot-number tiles, and a search box for "98A" or "yellow".
import { useMemo, useState } from "react";
import { byLotName, CAMPUS_LABEL, CAMPUS_ORDER } from "@/lib/campus";
import { STATUS_LABEL } from "@/lib/client/format";
import { rankLots } from "@/lib/search";
import type { Campus, Lot, LotEstimate } from "@/lib/types";

export interface PickerRow {
  lot: Lot;
  estimate?: LotEstimate;
  /** Whether the student's permit allows the lot right now (absent when unknown). */
  allowed?: boolean;
}

/** "Lot 915 (Yellow Lot)" → { number: "915", detail: "Yellow Lot" }; "Douglas Deck" → { number: "Deck", detail: "Douglas Deck" }. */
export function lotParts(name: string): { number: string; detail: string | null } {
  const m = /\bLot\s+(\d+[A-Za-z]?)\b/i.exec(name);
  const paren = /\(([^)]+)\)/.exec(name)?.[1] ?? null;
  // "Gated Lot 16" → "Gated"; "Johnson Apartment Lot 603" → "Johnson Apartment".
  const prefix = name.slice(0, m?.index ?? 0).trim() || null;
  if (m) return { number: m[1].toUpperCase(), detail: paren ?? prefix };
  return { number: /deck/i.test(name) ? "Deck" : name.split(" ")[0], detail: name };
}

export function LotPicker({
  rows,
  selectedId,
  initialCampus,
  onPick,
}: {
  rows: PickerRow[];
  selectedId: string | null;
  initialCampus: Campus;
  onPick: (lotId: string) => void;
}) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  const [query, setQuery] = useState("");

  const mine = useMemo(() => rows.filter((r) => r.allowed).sort((a, b) => byLotName(a.lot, b.lot)), [rows]);
  const onCampus = useMemo(() => rows.filter((r) => r.lot.campus === campus).sort((a, b) => byLotName(a.lot, b.lot)), [rows, campus]);
  const searching = query.trim().length > 0;
  const found = useMemo(() => {
    if (!searching) return [];
    const ids = rankLots(
      rows.map((r) => r.lot),
      query,
      12,
    ).map((l) => l.id);
    return ids.map((id) => rows.find((r) => r.lot.id === id)!).filter(Boolean);
  }, [rows, query, searching]);

  return (
    <div className="space-y-4">
      <input
        className="field"
        placeholder="Search a lot number or name, e.g. 98A or Yellow"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search lots"
        inputMode="search"
      />

      {searching ? (
        <TileGrid rows={found} selectedId={selectedId} onPick={onPick} showCampus empty="No lot matches that. Try just the number, like 915." />
      ) : (
        <>
          {mine.length > 0 && mine.length <= 8 && (
            <section className="space-y-2">
              <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted">Your lots right now</h3>
              <TileGrid rows={mine} selectedId={selectedId} onPick={onPick} showCampus />
            </section>
          )}

          <section className="space-y-2">
            <div className="grid grid-cols-4 gap-1 rounded-[10px] bg-slab p-1 ring-1 ring-line" role="tablist" aria-label="Campus">
              {CAMPUS_ORDER.map((c) => (
                <button
                  key={c}
                  role="tab"
                  aria-selected={campus === c}
                  className={`min-h-10 rounded-[7px] px-1 text-[13px] font-bold leading-tight ${campus === c ? "bg-asphalt text-on-sign" : "text-muted"}`}
                  onClick={() => setCampus(c)}
                >
                  {CAMPUS_LABEL[c]}
                </button>
              ))}
            </div>
            <TileGrid rows={onCampus} selectedId={selectedId} onPick={onPick} />
          </section>
        </>
      )}
    </div>
  );
}

function TileGrid({
  rows,
  selectedId,
  onPick,
  showCampus = false,
  empty,
}: {
  rows: PickerRow[];
  selectedId: string | null;
  onPick: (lotId: string) => void;
  showCampus?: boolean;
  empty?: string;
}) {
  if (!rows.length) return empty ? <p className="text-[15px] text-muted">{empty}</p> : null;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {rows.map(({ lot, estimate, allowed }) => {
        const { number, detail } = lotParts(lot.name);
        const status = estimate?.status ?? "gray";
        const on = lot.id === selectedId;
        return (
          <li key={lot.id}>
            <button
              className={`flex h-full min-h-[84px] w-full flex-col items-start justify-between gap-1 rounded-[10px] border-[1.5px] p-2.5 text-left ${
                on ? "border-asphalt bg-asphalt text-on-sign" : "border-line bg-slab"
              } ${allowed === false && !on ? "opacity-70" : ""}`}
              aria-pressed={on}
              aria-label={`${lot.name}, ${CAMPUS_LABEL[lot.campus]}, ${STATUS_LABEL[status]}`}
              onClick={() => onPick(lot.id)}
            >
              <span className="flex w-full items-center justify-between gap-1">
                <span className="text-[22px] font-black leading-none tracking-tight">{number}</span>
                <span className={`swatch swatch-${status}`} aria-hidden />
              </span>
              <span className={`line-clamp-2 text-[12px] font-semibold leading-tight ${on ? "text-on-sign-muted" : "text-muted"}`}>
                {[detail, showCampus ? CAMPUS_LABEL[lot.campus] : null].filter(Boolean).join(" · ") || " "}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
