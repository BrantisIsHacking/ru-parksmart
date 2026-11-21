"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Evidence } from "@/components/Evidence";
import { LotMap, type LotRow } from "@/components/LotMap";
import { SatisfactionPrompt } from "@/components/SatisfactionPrompt";
import { StatusBadge } from "@/components/StatusBadge";
import { api, track } from "@/lib/client/identity";
import { clock } from "@/lib/client/format";
import { useProfile } from "@/lib/client/profile";
import buildingsData from "@/data/lots.json";
import type { TripOption, TripPlan } from "@/lib/planner/parkOrRide";
import type { ClassEntry } from "@/lib/types";

interface RecommendResponse {
  nextClass: (ClassEntry & { startsAt: string }) | null;
  plan: TripPlan | null;
  leaveBy: string | null;
}

/** "Park by 10:53 AM, then a 4 minute walk." / bus version. */
function routeSentence(o: TripOption): string {
  if (o.mode === "walk") return `Park by ${clock(o.parkBy)}, then a ${o.walkMin} minute walk.`;
  const b = o.bus!;
  return `Park by ${clock(o.parkBy)}. Walk ${b.walkToStopMin} min to ${b.fromStop} and take the ${b.routeId} at ${clock(b.departAt)}, a ${b.rideMin} minute ride.`;
}

const shortName = (o: TripOption) => o.lotName.replace(/\s*\(placeholder\)/, "");

export default function Home() {
  const [profile, updateProfile] = useProfile();
  const openedAt = useRef<number>(Date.now());
  const [rec, setRec] = useState<RecommendResponse | null>(null);
  const [rows, setRows] = useState<LotRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<TripOption | null>(null);
  const [manual, setManual] = useState({ destination: buildingsData.buildings[0].name, arriveBy: "" });

  const load = useCallback(
    async (override?: { destination: string; arriveBy: string }) => {
      if (!profile?.permitId) return;
      setLoading(true);
      setError(null);
      try {
        const [r, status] = await Promise.all([
          api<RecommendResponse>("/api/recommend", {
            permitId: profile.permitId,
            classes: profile.classes,
            commuteMin: profile.commuteMin,
            ...(override ?? {}),
          }),
          fetch("/api/status").then((res) => res.json() as Promise<{ lots: LotRow[] }>),
        ]);
        setRec(r);
        setRows(status.lots);
        setChosen(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [profile?.permitId, profile?.classes, profile?.commuteMin],
  );

  useEffect(() => {
    if (!profile) return;
    if (!profile.permitId) {
      window.location.replace("/onboarding");
      return;
    }
    track("app_open");
    openedAt.current = Date.now();
    load();
    // Run once per profile load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.permitId]);

  const choose = (opt: TripOption) => {
    const plan = rec?.plan;
    const followed = opt.lotId === plan?.recommended?.lotId;
    track("decision", { decisionMs: Date.now() - openedAt.current, followedRecommendation: followed, mode: opt.mode }, opt.lotId);
    if (plan?.parkAndRide && followed) track("parkorride_followed", { mode: opt.mode }, opt.lotId);
    updateProfile({ lastLotId: opt.lotId, decisions: (profile?.decisions ?? 0) + 1 });
    setChosen(opt);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!profile?.permitId) return <p className="pt-10 text-muted">Loading your plan…</p>;
  const plan = rec?.plan;
  const best = plan?.recommended ?? null;
  const showing = chosen ?? best;
  const estimateFor = (id: string) => rows.find((r) => r.lot.id === id)?.estimate;

  return (
    <div className="space-y-6">
      {error && (
        <p className="panel panel-pad border-scarlet text-[15px]">
          {error} Tap Refresh below to try again.
        </p>
      )}

      {!rec && !error && <SignSkeleton />}

      {rec && !plan && (
        <section className="sign">
          <div className="sign-face space-y-4">
            <h1 className="text-[27px] font-extrabold leading-tight">No more classes today</h1>
            <p className="text-on-sign-muted">Heading to campus anyway? Choose a building and when you need to be there.</p>
            <ManualTrip value={manual} onChange={setManual} onSubmit={() => load(manual)} onSign />
          </div>
        </section>
      )}

      {plan && (
        <section className="sign" aria-live="polite">
          <div className="sign-face">
            <p className="text-[15px] font-semibold text-on-sign-muted">
              {rec?.nextClass
                ? `${rec.nextClass.course ? `${rec.nextClass.course} in ` : ""}${rec.nextClass.building} at ${clock(rec.nextClass.startsAt)}`
                : `${plan.destination} by ${clock(plan.arriveBy)}`}
            </p>

            {showing && (
              <div className="mt-2">
                <p className="text-[17px] font-semibold">{rec?.leaveBy && !chosen ? "Leave by" : "Park by"}</p>
                <p className="text-[52px] font-black leading-[0.95] tracking-tight tabular-nums">
                  {clock(rec?.leaveBy && !chosen ? rec.leaveBy : showing.parkBy)}
                </p>
              </div>
            )}

            <div className="stall-line my-5" aria-hidden />

            {plan.parkAndRide && plan.usual && !chosen && (
              <p className="curb-note mb-4 text-[15px]">
                {shortName(plan.usual)} is {plan.usual.status === "red" ? "likely full" : "filling up"}. Parking here and taking the bus is faster today.
              </p>
            )}

            {showing ? (
              <>
                <h1 className="text-[27px] font-extrabold leading-tight">{shortName(showing)}</h1>
                <p className="mt-1.5 flex items-center gap-2">
                  <StatusBadge status={showing.status} />
                  <span className="text-[15px] text-on-sign-muted">when you arrive</span>
                </p>
                <p className="mt-3 text-[17px] leading-snug">{routeSentence(showing)}</p>
                {showing.mode === "bus" && (
                  <p className="mt-1 text-[13px] text-on-sign-muted">Bus time comes from the published schedule, not live tracking.</p>
                )}
                <div className="mt-3 space-y-1">
                  {estimateFor(showing.lotId) && <Evidence estimate={estimateFor(showing.lotId)!} onSign />}
                  {!showing.permitVerified && (
                    <p className="text-[13px] text-curb">Permit rules are a pilot draft. Confirm on rudots.rutgers.edu.</p>
                  )}
                </div>

                {chosen ? (
                  <div key={chosen.lotId} className="settle mt-5 space-y-3">
                    <p className="text-[17px] font-bold">You&apos;re parking at {shortName(chosen)}.</p>
                    <a href={`/report?lot=${chosen.lotId}`} className="btn btn-on-sign w-full">
                      Report how full it is
                    </a>
                  </div>
                ) : (
                  <button className="btn btn-on-sign mt-5 w-full" onClick={() => choose(showing)}>
                    I&apos;m parking at {shortName(showing)}
                  </button>
                )}
              </>
            ) : (
              <p className="text-[17px]">None of the lots your permit allows gets you there on time.</p>
            )}
            {plan.notes.map((n) => (
              <p key={n} className="mt-3 text-[13px] text-on-sign-muted">{n}</p>
            ))}
          </div>
        </section>
      )}

      {chosen && profile.decisions >= 3 && !profile.ratedSatisfaction && (
        <SatisfactionPrompt onDone={() => updateProfile({ ratedSatisfaction: true })} />
      )}

      {plan && plan.alternatives.length > 0 && !chosen && (
        <section className="space-y-2">
          <div>
            <h2 className="text-[17px] font-bold">Other lots your permit allows</h2>
            <p className="text-[13px] text-muted">How full each lot is likely to be when you&apos;d arrive.</p>
          </div>
          <ul className="panel">
            {plan.alternatives.map((o) => {
              const est = estimateFor(o.lotId);
              return (
                <li key={o.lotId} className="space-y-1.5 border-t border-line px-4 py-3.5 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-bold">{shortName(o)}</p>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-[15px] text-muted">{routeSentence(o)}</p>
                  {est && <Evidence estimate={est} />}
                  <button className="link text-[15px]" onClick={() => choose(o)}>
                    Park here instead
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold">All pilot lots right now</h2>
          <button className="link text-[15px]" onClick={() => load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div className="panel overflow-hidden">
          <LotMap rows={rows} highlight={showing?.lotId} />
        </div>
      </section>

      {plan && (
        <details className="group">
          <summary className="link cursor-pointer text-[15px]">Plan a different trip</summary>
          <div className="mt-3">
            <ManualTrip value={manual} onChange={setManual} onSubmit={() => load(manual)} />
          </div>
        </details>
      )}
    </div>
  );
}

function SignSkeleton() {
  return (
    <section className="sign" aria-busy="true">
      <div className="sign-face">
        <p className="text-[15px] font-semibold text-on-sign-muted">Checking your permit, lots and buses…</p>
        <div className="mt-3 h-12 w-48 rounded bg-white/10" />
        <div className="stall-line my-5" aria-hidden />
        <div className="h-7 w-40 rounded bg-white/10" />
      </div>
    </section>
  );
}

function ManualTrip({
  value,
  onChange,
  onSubmit,
  onSign = false,
}: {
  value: { destination: string; arriveBy: string };
  onChange: (v: { destination: string; arriveBy: string }) => void;
  onSubmit: () => void;
  onSign?: boolean;
}) {
  return (
    <form
      className="grid grid-cols-[1fr_auto] gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.arriveBy) onSubmit();
      }}
    >
      <select className="field col-span-2" value={value.destination} onChange={(e) => onChange({ ...value, destination: e.target.value })} aria-label="Building">
        {buildingsData.buildings.map((b) => (
          <option key={b.id}>{b.name}</option>
        ))}
      </select>
      <input type="time" className="field" required value={value.arriveBy} onChange={(e) => onChange({ ...value, arriveBy: e.target.value })} aria-label="Be there by" />
      <button className={`btn ${onSign ? "btn-on-sign" : "btn-primary"}`}>Plan trip</button>
    </form>
  );
}
