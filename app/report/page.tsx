"use client";
import { useEffect, useState } from "react";
import { Evidence } from "@/components/Evidence";
import { LotMapPicker } from "@/components/LotMapPicker";
import { LotPicker, lotParts, type PickerRow } from "@/components/LotPicker";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/client/identity";
import { getPending } from "@/lib/client/checkin";
import { useProfile } from "@/lib/client/profile";
import lotsData from "@/data/lots.json";
import { CAMPUS_LABEL } from "@/lib/campus";
import type { Campus, Lot, LotEstimate, ReportValue } from "@/lib/types";

const LOTS = lotsData.lots as Lot[];

export default function Report() {
  const [profile] = useProfile();
  const [lotId, setLotId] = useState<string | null>(null);
  /** Show the picker instead of the chosen-lot card. */
  const [picking, setPicking] = useState(false);
  const [rows, setRows] = useState<PickerRow[]>(() => LOTS.map((lot) => ({ lot })));
  /** List of tiles or the campus map; remembered on this phone. */
  const [pickMode, setPickMode] = useState<"list" | "map">("list");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LotEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start from the lot the student just chose (link from the plan, or their current trip), else their last lot.
  useEffect(() => {
    if (!profile) return;
    const fromUrl = new URLSearchParams(window.location.search).get("lot");
    const start = [fromUrl, getPending()?.lotId, profile.lastLotId].find((id) => id && LOTS.some((l) => l.id === id)) ?? null;
    setLotId(start);
    setPicking(!start);
  }, [profile]);

  // Current status for every lot, and which ones the student's permit allows now.
  useEffect(() => {
    if (!profile) return;
    const q = profile.permitId ? `?permit=${encodeURIComponent(profile.permitId)}` : "";
    fetch(`/api/status${q}`)
      .then((r) => r.json() as Promise<{ lots: PickerRow[] }>)
      .then((d) => d.lots?.length && setRows(d.lots))
      .catch(() => {
        /* tiles still work without status */
      });
  }, [profile]);

  useEffect(() => {
    try {
      if (localStorage.getItem("rups.reportPicker") === "map") setPickMode("map");
    } catch {
      /* default: list */
    }
  }, []);
  const choosePickMode = (m: "list" | "map") => {
    setPickMode(m);
    try {
      localStorage.setItem("rups.reportPicker", m);
    } catch {
      /* ignore */
    }
  };

  const send = async (value: ReportValue) => {
    if (!lotId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ estimate: LotEstimate }>("/api/reports", { lotId, value });
      setResult(res.estimate);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = (id: string) => {
    setLotId(id);
    setPicking(false);
    setResult(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const row = rows.find((r) => r.lot.id === lotId);
  const lot = row?.lot;
  // Open the campus tab of the current lot, or of the first lot the permit allows.
  const initialCampus: Campus = lot?.campus ?? rows.find((r) => r.allowed)?.lot.campus ?? "college_ave";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[27px] font-extrabold leading-tight">How full is the lot?</h1>
        <p className="text-muted">One tap once you&apos;ve parked. Reports are anonymous and update the lot for the next driver.</p>
      </div>

      {lot && !picking ? (
        <section className="sign">
          <div className="sign-face flex items-center gap-4">
            <span className="grid h-16 min-w-16 place-items-center rounded-[10px] border-2 border-on-sign px-2 text-[26px] font-black leading-none">
              {lotParts(lot.name).number}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-on-sign-muted">Reporting for</span>
              <span className="block text-[19px] font-extrabold leading-tight">{lot.name}</span>
              <span className="block text-[13px] text-on-sign-muted">{CAMPUS_LABEL[lot.campus]}</span>
            </span>
            {!result && (
              <button className="btn btn-on-sign min-h-10 px-3 text-[15px]" onClick={() => setPicking(true)}>
                Change
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold">Which lot did you park in?</h2>
            {lot && (
              <button className="link text-[15px]" onClick={() => setPicking(false)}>
                Cancel
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-[10px] bg-slab p-1 ring-1 ring-line" role="tablist" aria-label="Choose lot from">
            {(["list", "map"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={pickMode === m}
                className={`min-h-10 rounded-[7px] text-[15px] font-bold ${pickMode === m ? "bg-asphalt text-on-sign" : "text-muted"}`}
                onClick={() => choosePickMode(m)}
              >
                {m === "list" ? "List" : "Map"}
              </button>
            ))}
          </div>
          {pickMode === "list" ? (
            <LotPicker rows={rows} selectedId={lotId} initialCampus={initialCampus} onPick={pick} />
          ) : (
            <LotMapPicker rows={rows} selectedId={lotId} initialCampus={initialCampus} onPick={pick} />
          )}
        </section>
      )}

      {lot && !picking && !result && (
        <div className="grid grid-cols-2 gap-3">
          {/* The buttons use the same stall paint as the status swatches. */}
          <button
            className="flex h-36 flex-col items-start justify-end gap-1 rounded-[10px] border-[3px] border-scarlet p-4 text-left disabled:opacity-55"
            style={{ background: "repeating-linear-gradient(135deg, rgb(204 0 51 / 0.14) 0 10px, transparent 10px 20px)" }}
            disabled={busy}
            onClick={() => send("crowded")}
          >
            <span className="text-[21px] font-extrabold">Crowded</span>
            <span className="text-[13px] text-muted">Hard to find a space</span>
          </button>
          <button
            className="flex h-36 flex-col items-start justify-end gap-1 rounded-[10px] bg-go p-4 text-left text-white disabled:opacity-55"
            disabled={busy}
            onClick={() => send("spaces_open")}
          >
            <span className="text-[21px] font-extrabold">Spaces open</span>
            <span className="text-[13px] text-white/85">Easy to find one</span>
          </button>
        </div>
      )}

      {error && <p className="panel panel-pad border-scarlet text-[15px]">{error}</p>}

      {result && lot && (
        <section className="settle panel panel-pad space-y-2">
          <p className="text-[17px] font-bold">Reported. {lot.name} now shows</p>
          <StatusBadge status={result.status} size="lg" />
          <Evidence estimate={result} />
          <div className="flex gap-4 pt-1">
            <a href="/" className="link text-[15px]">Back to your plan</a>
            <button
              className="link text-[15px]"
              onClick={() => {
                setResult(null);
                setPicking(true);
              }}
            >
              Report another lot
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
