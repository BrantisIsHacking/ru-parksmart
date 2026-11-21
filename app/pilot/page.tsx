"use client";
import { useCallback, useEffect, useState } from "react";
import lotsData from "@/data/lots.json";
import { clock } from "@/lib/client/format";
import type { PilotSummary } from "@/lib/metrics/analyze";
import type { ManualCount } from "@/lib/types";

interface SummaryResponse {
  storage: "firestore" | "memory";
  summary: PilotSummary;
  recentCounts: ManualCount[];
}

const TOKEN_KEY = "rups.pilotToken";
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
const num = (x: number | null, unit = "") => (x === null ? "—" : `${x}${unit}`);

export default function Pilot() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState({ lotId: lotsData.lots[0].id, occupied: "", capacity: String(lotsData.lots[0].capacity), counter: "" });
  const [saved, setSaved] = useState<string | null>(null);

  const call = useCallback(
    async (path: string, body?: unknown) => {
      const res = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: { "x-pilot-token": token, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      return res;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setData((await (await call("/api/pilot/summary")).json()) as SummaryResponse);
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch {}
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    }
  }, [call, token]);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(TOKEN_KEY);
      if (t) setToken(t);
    } catch {}
  }, []);

  const submitCount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(null);
    try {
      const res = (await (await call("/api/pilot/counts", {
        lotId: count.lotId,
        occupied: Number(count.occupied),
        capacity: Number(count.capacity),
        counter: count.counter || "team",
      })).json()) as { reportersScored: number };
      setSaved(`Saved. ${res.reportersScored} reporter reliability score(s) updated.`);
      setCount((c) => ({ ...c, occupied: "" }));
      refresh();
    } catch (err) {
      setSaved((err as Error).message);
    }
  };

  const download = async (kind: string) => {
    const blob = await (await call(`/api/pilot/export?kind=${kind}`)).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ru-parksmart-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const s = data?.summary;
  return (
    <div className="space-y-4">
      <h1 className="text-[27px] font-extrabold leading-tight">Pilot dashboard</h1>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); refresh(); }}>
        <input className="field" type="password" placeholder="Pilot passcode" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Pilot passcode" />
        <button className="btn btn-primary">Open</button>
      </form>
      {error && <p className="panel panel-pad border-scarlet text-[15px]">{error}</p>}

      {s && data && (
        <>
          {data.storage === "memory" && (
            <p className="curb-note text-[15px]">In-memory storage: data is lost when the server restarts. Configure FIREBASE_SERVICE_ACCOUNT before the pilot.</p>
          )}

          <section className="panel panel-pad space-y-3">
            <h2 className="text-[17px] font-bold">Manual lot count (ground truth)</h2>
            <form className="grid grid-cols-2 gap-2" onSubmit={submitCount}>
              <select
                className="field col-span-2"
                value={count.lotId}
                onChange={(e) => {
                  const lot = lotsData.lots.find((l) => l.id === e.target.value)!;
                  setCount((c) => ({ ...c, lotId: lot.id, capacity: String(lot.capacity) }));
                }}
                aria-label="Lot"
              >
                {lotsData.lots.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <input className="field" inputMode="numeric" required placeholder="Cars counted" value={count.occupied} onChange={(e) => setCount({ ...count, occupied: e.target.value.replace(/\D/g, "") })} aria-label="Occupied spaces" />
              <input className="field" inputMode="numeric" required placeholder="Capacity" value={count.capacity} onChange={(e) => setCount({ ...count, capacity: e.target.value.replace(/\D/g, "") })} aria-label="Capacity" />
              <input className="field" placeholder="Counter initials" value={count.counter} onChange={(e) => setCount({ ...count, counter: e.target.value })} aria-label="Counter" />
              <button className="btn btn-primary">Save count</button>
            </form>
            {saved && <p className="text-sm">{saved}</p>}
          </section>

          <section className="grid grid-cols-2 gap-3">
            <Stat label="Participants" value={String(s.participants)} />
            <Stat label="App opens" value={String(s.appOpens)} />
            <Stat label="Median decision time" value={num(s.decisions.medianSeconds, " s")} sub={`${s.decisions.count} decisions, slowest quarter above ${num(s.decisions.p75Seconds, " s")}`} />
            <Stat label="Park-or-ride uptake" value={pct(s.parkOrRide.uptake)} sub={`${s.parkOrRide.followed} of ${s.parkOrRide.shown} suggestions`} />
            <Stat label="Prediction accuracy" value={pct(s.prediction.accuracy)} sub={`${s.prediction.evaluated} counts, ${pct(s.prediction.grayShare)} with not enough data`} />
            <Stat label="Report agreement" value={pct(s.reportReliability.agreementRate)} sub={`${s.reportReliability.matched} reports matched to counts`} />
            <Stat label="Satisfaction" value={num(s.satisfaction.average, " / 5")} sub={`${s.satisfaction.responses} ratings`} />
            <Stat label="Reports" value={String(s.reports.count)} sub={`${s.reports.reporters} reporters`} />
            <Stat label="Chat messages" value={String(s.chatMessages)} />
            <Stat label="Schedule imports" value={String(s.scheduleImports)} />
          </section>

          <section className="panel panel-pad space-y-2">
            <h2 className="text-[17px] font-bold">Predicted vs. observed</h2>
            <table className="w-full text-center text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="text-left font-medium">Observed ↓ / Predicted →</th>
                  <th>Green</th><th>Yellow</th><th>Red</th><th>Gray</th>
                </tr>
              </thead>
              <tbody>
                {(["green", "yellow", "red"] as const).map((obs) => (
                  <tr key={obs} className="border-t border-line">
                    <td className="py-1 text-left capitalize">{obs}</td>
                    {(["green", "yellow", "red", "gray"] as const).map((p) => (
                      <td key={p} className={obs === p ? "font-bold" : ""}>{s.prediction.confusion[obs][p]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel panel-pad space-y-2">
            <h2 className="text-[17px] font-bold">Recent counts</h2>
            <ul className="text-sm">
              {data.recentCounts.map((c, i) => (
                <li key={c.id ?? i} className="flex justify-between border-t border-line py-1 first:border-0">
                  <span>{c.lotId} at {clock(c.countedAt)}</span>
                  <span>{c.occupied}/{c.capacity} ({Math.round((c.occupied / c.capacity) * 100)}%)</span>
                </li>
              ))}
              {!data.recentCounts.length && <li className="text-muted">No counts yet.</li>}
            </ul>
          </section>

          <section className="panel panel-pad space-y-2">
            <h2 className="text-[17px] font-bold">Export for the case study</h2>
            <div className="grid grid-cols-3 gap-2">
              {["events", "reports", "counts"].map((k) => (
                <button key={k} className="btn btn-quiet" onClick={() => download(k)}>{k}.csv</button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel panel-pad">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="text-[27px] font-extrabold tabular-nums">{value}</p>
      {sub && <p className="text-[13px] text-muted">{sub}</p>}
    </div>
  );
}
