"use client";
import { useEffect, useState } from "react";
import { Evidence } from "@/components/Evidence";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/client/identity";
import { useProfile } from "@/lib/client/profile";
import lotsData from "@/data/lots.json";
import type { LotEstimate, ReportValue } from "@/lib/types";

const short = (name: string) => name.replace(/\s*\(placeholder\)/, "");

export default function Report() {
  const [profile] = useProfile();
  const [lotId, setLotId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LotEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("lot");
    setLotId(fromUrl ?? profile?.lastLotId ?? lotsData.lots[0].id);
  }, [profile?.lastLotId]);

  const send = async (value: ReportValue) => {
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

  const lot = lotsData.lots.find((l) => l.id === lotId);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-[27px] font-extrabold leading-tight">How full is the lot?</h1>
        <p className="text-muted">One tap once you&apos;ve parked. Reports are anonymous and update the lot for the next driver.</p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-[15px] font-semibold">Lot</span>
        <select className="field" value={lotId} onChange={(e) => { setLotId(e.target.value); setResult(null); setError(null); }}>
          {lotsData.lots.map((l) => (
            <option key={l.id} value={l.id}>{short(l.name)}</option>
          ))}
        </select>
      </label>

      {!result && (
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
          <p className="text-[17px] font-bold">Reported. {short(lot.name)} now shows</p>
          <StatusBadge status={result.status} size="lg" />
          <Evidence estimate={result} />
          <a href="/" className="link inline-block pt-1 text-[15px]">Back to your plan</a>
        </section>
      )}
    </div>
  );
}
