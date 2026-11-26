"use client";
// Home: a full-screen campus map (modeled on maps.rutgers.edu) with the plan in a
// bottom sheet (a side panel on wide screens). Students can plan to their next
// class, any building (search or tap) or any spot (tap empty ground).
import type { FeatureCollection, Geometry } from "geojson";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckinCard } from "@/components/CheckinCard";
import { CheckinOptIn } from "@/components/CheckinOptIn";
import { Evidence } from "@/components/Evidence";
import { MapView } from "@/components/MapView";
import type { ClassMark, MapFocus, MapLotRow, MapRoute, MapSelection } from "@/components/mapTypes";
import { SatisfactionPrompt } from "@/components/SatisfactionPrompt";
import { StatusBadge } from "@/components/StatusBadge";
import { api, track } from "@/lib/client/identity";
import {
  clearPending,
  getPending,
  optInState,
  setOptInState,
  setPending,
  subscribePush,
  type PendingTrip,
} from "@/lib/client/checkin";
import { clock } from "@/lib/client/format";
import { useProfile } from "@/lib/client/profile";
import { useBuildings } from "@/lib/client/buildings";
import { classRoom, classWhen, resolveClassBuilding } from "@/lib/classes";
import { byLotName, CAMPUS_BOUNDS, CAMPUS_LABEL, CAMPUS_ORDER, groupByCampus } from "@/lib/campus";
import { rankBuildings, rankLots } from "@/lib/search";
import busData from "@/data/busRoutes.json";
import type { TripOption, TripPlan } from "@/lib/planner/parkOrRide";
import type { ClassEntry, LatLng } from "@/lib/types";

interface RecommendResponse {
  nextClass: (ClassEntry & { startsAt: string }) | null;
  plan: TripPlan | null;
  leaveBy: string | null;
}

interface TripRequest {
  destination?: string;
  destinationPoint?: LatLng & { label?: string };
  arriveBy: string;
}

interface LotShapeProps {
  name: string;
  lotId: string | null;
}

/** "Park by 10:53 AM, then a 4 minute walk." / bus version. */
function routeSentence(o: TripOption): string {
  if (o.mode === "walk") return `Park by ${clock(o.parkBy)}, then a ${o.walkMin} minute walk.`;
  const b = o.bus!;
  return `Park by ${clock(o.parkBy)}. Walk ${b.walkToStopMin} min to ${b.fromStop} and take the ${b.routeId} at ${clock(b.departAt)}, a ${b.rideMin} minute ride.`;
}

const FIVE_MIN = 5 * 60 * 1000;

/** "HH:MM" in New Brunswick time, `addMin` from now, rounded up to 5 minutes. */
function campusClockIn(addMin: number): string {
  const d = new Date(Date.now() + addMin * 60_000);
  const [h, m] = d
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" })
    .split(":")
    .map(Number);
  const total = Math.ceil((h * 60 + m) / 5) * 5;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const BUS_STOPS = (() => {
  const seen = new Map<string, { name: string; center: LatLng }>();
  for (const r of busData.routes) for (const s of r.stops) if (!seen.has(s.name)) seen.set(s.name, { name: s.name, center: s.center });
  return [...seen.values()];
})();

type Sheet = "peek" | "full";
type View = "plan" | "lot" | "place";

export default function Home() {
  const [profile, updateProfile] = useProfile();
  const openedAt = useRef<number>(Date.now());
  const [rec, setRec] = useState<RecommendResponse | null>(null);
  const [rows, setRows] = useState<MapLotRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<TripOption | null>(null);
  const tripCall = useRef(0);
  const [askOptIn, setAskOptIn] = useState<TripOption | null>(null);
  const [checkin, setCheckin] = useState<PendingTrip | null>(null);
  /** The trip id this page stored as pending, so the check-in timer follows trip changes. */
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Map state.
  const [lotShapes, setLotShapes] = useState<FeatureCollection<Geometry, LotShapeProps> | null>(null);
  const { shapes: buildingShapes, buildings } = useBuildings();
  const [showClasses, setShowClasses] = useState(true);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const focusKey = useRef(0);
  const [view, setView] = useState<View>("plan");
  const [sheet, setSheet] = useState<Sheet>("peek");
  const [placeTime, setPlaceTime] = useState(() => campusClockIn(30));
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // The "My classes" toggle is a per-phone preference.
  useEffect(() => {
    try {
      if (localStorage.getItem("rups.showClasses") === "0") setShowClasses(false);
    } catch {
      /* private mode: default on */
    }
  }, []);

  const flyTo = useCallback((f: Omit<MapFocus, "key">) => setFocus({ ...f, key: ++focusKey.current }), []);

  // Lot outlines are a static file; load them once. (Buildings come from useBuildings.)
  useEffect(() => {
    let live = true;
    fetch("/geo/lots.geojson")
      .then((r) => r.json())
      .then((lots) => {
        if (live) setLotShapes(lots);
      })
      .catch(() => {
        /* the map still works with lot markers only */
      });
    return () => {
      live = false;
    };
  }, []);

  const load = useCallback(
    async (override?: TripRequest) => {
      if (!profile?.permitId) return;
      setLoading(true);
      setError(null);
      try {
        const [r, status] = await Promise.all([
          api<RecommendResponse>("/api/recommend", {
            permitId: profile.permitId,
            classes: profile.classes,
            // Residents already live on campus: no "leave home by" time.
            commuteMin: profile.permitId.startsWith("resident-") ? null : profile.commuteMin,
            ...(override ?? {}),
          }),
          fetch(`/api/status?permit=${encodeURIComponent(profile.permitId)}`).then((res) => res.json() as Promise<{ lots: MapLotRow[] }>),
        ]);
        setRec(r);
        setRows(status.lots);
        setChosen(null);
        // Show the whole trip: the recommended lot and the destination.
        const best = r.plan?.recommended;
        const lot = best && status.lots.find((row) => row.lot.id === best.lotId)?.lot;
        if (r.plan && lot) flyTo({ bounds: [lot.center, r.plan.destinationCenter, ...(best?.bus ? [best.bus.fromStopCenter, best.bus.toStopCenter] : [])] });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [profile?.permitId, profile?.classes, profile?.commuteMin, flyTo],
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

  // Show the check-in card when the student opened the notification, or when park time + 5 min has passed.
  // Re-checked when the app comes back to the foreground, and by a timer while the page stays open.
  useEffect(() => {
    if (!profile?.permitId) return;
    const check = () => {
      const pending = getPending();
      const url = new URL(window.location.href);
      const fromLink = url.searchParams.get("checkin");
      if (fromLink !== null) {
        url.searchParams.delete("checkin");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
      if (pending && ((fromLink !== null && fromLink === pending.tripId) || Date.now() >= Date.parse(pending.parkBy) + FIVE_MIN)) {
        setCheckin((cur) => (cur?.tripId === pending.tripId ? cur : pending));
      }
    };
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", check);
    const pending = getPending();
    const wait = pending ? Date.parse(pending.parkBy) + FIVE_MIN - Date.now() : -1;
    // setTimeout overflows past ~24.8 days; trips are at most 24 h ahead.
    const timer = wait > 0 && wait < 2 ** 31 - 1 ? window.setTimeout(check, wait + 1000) : undefined;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", check);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [profile?.permitId, pendingId]);

  // A failed trip never blocks the student.
  const startTrip = async (opt: TripOption, wantPush: boolean, askPermission = false) => {
    const mine = ++tripCall.current;
    clearPending(); // the old trip is replaced even if this one fails
    setCheckin(null);
    try {
      const push = wantPush ? await subscribePush(askPermission) : null;
      if (askPermission && !push) setOptInState("off");
      const { tripId } = await api<{ tripId: string }>("/api/trips", {
        lotId: opt.lotId,
        parkBy: opt.parkBy,
        ...(push ? { push } : {}),
      });
      if (mine === tripCall.current) {
        setPending({ tripId, lotId: opt.lotId, lotName: opt.lotName, parkBy: opt.parkBy });
        setPendingId(tripId);
      }
    } catch {
      /* swallowed */
    }
  };

  const answerOptIn = (on: boolean) => {
    const opt = askOptIn;
    setOptInState(on ? "on" : "off");
    setAskOptIn(null);
    if (opt) void startTrip(opt, on, on);
  };

  const choose = (opt: TripOption) => {
    const plan = rec?.plan;
    const followed = opt.lotId === plan?.recommended?.lotId;
    track("decision", { decisionMs: Date.now() - openedAt.current, followedRecommendation: followed, mode: opt.mode }, opt.lotId);
    if (plan?.parkAndRide && followed) track("parkorride_followed", { mode: opt.mode }, opt.lotId);
    updateProfile({ lastLotId: opt.lotId, decisions: (profile?.decisions ?? 0) + 1 });
    setChosen(opt);
    setView("plan");
    clearPending(); // a new choice replaces the old pending trip, even while the opt-in card is open
    setCheckin(null);
    if (optInState() === "unasked") setAskOptIn(opt);
    else void startTrip(opt, optInState() === "on");
  };

  // ---- map interactions ----
  const selectLot = (lotId: string, fly = false) => {
    setSelection({ kind: "lot", lotId });
    setView("lot");
    setSearchOpen(false);
    const lot = rows.find((r) => r.lot.id === lotId)?.lot;
    if (fly && lot) flyTo({ center: lot.center, zoom: 17 });
  };
  const selectBuilding = (buildingId: string, fly = false) => {
    setSelection({ kind: "building", buildingId });
    setView("place");
    setSearchOpen(false);
    const b = buildings.find((x) => x.id === buildingId);
    if (fly && b) flyTo({ center: b.center, zoom: 18 });
  };
  const selectPoint = (point: LatLng) => {
    setSelection({ kind: "point", point });
    setView("place");
    setSearchOpen(false);
  };
  const backToPlan = () => {
    setView("plan");
    setSelection(null);
  };

  const planTo = (req: Omit<TripRequest, "arriveBy">, arriveBy = placeTime) => {
    setView("plan");
    setSheet("peek");
    void load({ ...req, arriveBy });
  };

  if (!profile?.permitId) return <p className="pt-10 text-muted">Loading your plan…</p>;

  const plan = rec?.plan;
  const best = plan?.recommended ?? null;
  const showing = chosen ?? best;
  const rowFor = (id: string) => rows.find((r) => r.lot.id === id);
  const estimateFor = (id: string) => rowFor(id)?.estimate;
  const optionFor = (id: string) => (plan ? [plan.recommended, ...plan.alternatives].find((o) => o?.lotId === id) ?? null : null);

  // Classes on the map: resolve each class to a building (older entries may only have a name).
  const myClasses = (profile.classes ?? []).map((c) => (c.buildingId || !buildings.length ? c : resolveClassBuilding(c, buildings)));
  const classMarks: ClassMark[] = (() => {
    if (!showClasses) return [];
    const byBuilding = new Map<string, ClassMark>();
    for (const c of myClasses) {
      const b = c.buildingId ? buildings.find((x) => x.id === c.buildingId) : undefined;
      if (!b) continue;
      const line = `${c.course || classRoom(c) || "Class"} · ${classWhen(c)}`;
      const mark = byBuilding.get(b.id);
      if (mark) mark.detail.push(line);
      else byBuilding.set(b.id, { buildingId: b.id, center: b.center, label: "", detail: [line] });
    }
    for (const m of byBuilding.values()) {
      const first = m.detail[0].split(" · ")[0];
      m.label = m.detail.length > 1 ? `${first} +${m.detail.length - 1}` : first;
    }
    return [...byBuilding.values()];
  })();
  const toggleClasses = () => {
    const next = !showClasses;
    setShowClasses(next);
    try {
      localStorage.setItem("rups.showClasses", next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next) {
      const pts = myClasses.map((c) => buildings.find((b) => b.id === c.buildingId)?.center).filter(Boolean) as LatLng[];
      if (pts.length) flyTo(pts.length === 1 ? { center: pts[0], zoom: 17 } : { bounds: pts });
    }
  };
  const classesIn = (buildingId: string) => myClasses.filter((c) => c.buildingId === buildingId);

  const route: MapRoute | null = (() => {
    if (!plan || !showing || view !== "plan") return null;
    const lot = rowFor(showing.lotId)?.lot;
    if (!lot) return null;
    return {
      from: lot.center,
      to: plan.destinationCenter,
      bus: showing.bus ? { from: showing.bus.fromStopCenter, to: showing.bus.toStopCenter } : null,
    };
  })();
  const mapSelection: MapSelection | null = selection ?? (showing && view === "plan" ? { kind: "lot", lotId: showing.lotId } : null);

  const results =
    query.trim().length >= 2
      ? {
          buildings: rankBuildings(buildings, query, 6),
          lots: rankLots(
            rows.map((r) => r.lot),
            query,
            4,
          ),
        }
      : null;

  const selectedBuilding = selection?.kind === "building" ? buildings.find((b) => b.id === selection.buildingId) : null;
  const selectedLotRow = selection?.kind === "lot" ? rowFor(selection.lotId) : null;

  return (
    <div className="fixed inset-x-0 top-0 z-10 bottom-[var(--nav-h)] bg-concrete">
      {/* Map: full screen on phones, right of the panel on wide screens. */}
      <div className="absolute inset-0 md:left-[400px]">
        <MapView
          rows={rows}
          lotShapes={lotShapes}
          buildingShapes={buildingShapes}
          busStops={BUS_STOPS}
          selection={mapSelection}
          route={route}
          focus={focus}
          classMarks={classMarks}
          onSelectLot={(id) => selectLot(id)}
          onSelectBuilding={(id) => selectBuilding(id)}
          onSelectPoint={selectPoint}
        />
      </div>

      {/* Search and campus chips float over the map. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] px-3 pt-[max(12px,env(safe-area-inset-top))] md:left-[400px]">
        <div className="pointer-events-auto relative max-w-md">
          <div className="flex items-center gap-2 rounded-[10px] border border-line bg-slab pl-2 shadow-md">
            <a href="/" aria-label="RU ParkSmart" className="grid h-8 w-8 flex-none place-items-center rounded-[7px] bg-scarlet p-[2px]">
              <span className="grid h-full w-full place-items-center rounded-[5px] border-[1.5px] border-white text-[15px] font-black text-white">P</span>
            </a>
            <input
              className="min-h-[46px] w-full bg-transparent pr-3 text-[16px] outline-none placeholder:text-muted"
              placeholder="Search buildings, codes or lots"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              aria-label="Search buildings, building codes or lots"
            />
            {query && (
              <button className="px-3 text-[20px] text-muted" aria-label="Clear search" onClick={() => setQuery("")}>
                ×
              </button>
            )}
          </div>
          {searchOpen && results && (
            <ul className="panel mt-1.5 max-h-[50dvh] overflow-y-auto shadow-lg">
              {results.buildings.map((b) => (
                <li key={b.id}>
                  <button className="w-full px-4 py-2.5 text-left hover:bg-concrete" onClick={() => { selectBuilding(b.id, true); setQuery(b.name); }}>
                    <span className="font-semibold">{b.name}</span>
                    <span className="block text-[13px] text-muted">
                      {[b.code, CAMPUS_LABEL[b.campus], b.address].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
              {results.lots.map((l) => (
                <li key={l.id}>
                  <button className="w-full px-4 py-2.5 text-left hover:bg-concrete" onClick={() => { selectLot(l.id, true); setQuery(l.name); }}>
                    <span className="font-semibold">{l.name}</span>
                    <span className="block text-[13px] text-muted">Parking · {CAMPUS_LABEL[l.campus]}</span>
                  </button>
                </li>
              ))}
              {!results.buildings.length && !results.lots.length && <li className="px-4 py-3 text-[15px] text-muted">No matches. Try the code from your schedule, like TIL or ARC.</li>}
            </ul>
          )}
          {!(searchOpen && results) && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {myClasses.length > 0 && (
                <button
                  className={`flex-none rounded-full border px-3 py-1.5 text-[14px] font-bold shadow-sm ${showClasses ? "border-[#6b3fb8] bg-[#6b3fb8] text-white" : "border-line bg-slab"}`}
                  aria-pressed={showClasses}
                  onClick={toggleClasses}
                >
                  My classes
                </button>
              )}
              {CAMPUS_ORDER.map((c) => (
                <button
                  key={c}
                  className="flex-none rounded-full border border-line bg-slab px-3 py-1.5 text-[14px] font-bold shadow-sm"
                  onClick={() => flyTo({ bounds: CAMPUS_BOUNDS[c] })}
                >
                  {CAMPUS_LABEL[c]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom sheet on phones, side panel on wide screens. */}
      <section
        className={`absolute inset-x-0 bottom-0 z-[1001] flex flex-col rounded-t-[16px] border-t border-line bg-concrete shadow-[0_-4px_16px_rgb(0_0_0/0.15)] transition-[height] duration-200 md:inset-y-0 md:left-0 md:right-auto md:h-auto! md:w-[400px] md:rounded-none md:border-t-0 md:border-r md:shadow-none ${
          sheet === "full" ? "h-[88%]" : "h-[44%]"
        }`}
        aria-label="Trip plan"
      >
        <button
          className="flex-none py-2 md:hidden"
          onClick={() => setSheet((s) => (s === "full" ? "peek" : "full"))}
          aria-label={sheet === "full" ? "Shrink panel" : "Expand panel"}
        >
          <span className="mx-auto block h-1.5 w-10 rounded-full bg-line" />
        </button>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 md:pt-[max(16px,env(safe-area-inset-top))]">
          {checkin && <CheckinCard trip={checkin} onDone={() => setCheckin(null)} />}
          {askOptIn && <CheckinOptIn onChoose={answerOptIn} />}
          {chosen && profile.decisions >= 3 && !profile.ratedSatisfaction && (
            <SatisfactionPrompt onDone={() => updateProfile({ ratedSatisfaction: true })} />
          )}
          {error && (
            <p className="panel panel-pad border-scarlet text-[15px]">
              {error}{" "}
              <button className="link" onClick={() => load()}>
                Try again
              </button>
            </p>
          )}

          {view === "lot" && selectedLotRow && (
            <LotDetail
              row={selectedLotRow}
              option={optionFor(selectedLotRow.lot.id)}
              onBack={backToPlan}
              onChoose={choose}
            />
          )}

          {view === "place" && (selectedBuilding || selection?.kind === "point") && (
            <PlaceDetail
              title={selectedBuilding?.name ?? "Dropped pin"}
              subtitle={
                selectedBuilding
                  ? [selectedBuilding.code, CAMPUS_LABEL[selectedBuilding.campus], selectedBuilding.address].filter(Boolean).join(" · ")
                  : "Plan a trip to this spot"
              }
              time={placeTime}
              onTime={setPlaceTime}
              classes={selectedBuilding ? classesIn(selectedBuilding.id) : []}
              onPlanClass={(c) => {
                if (!selectedBuilding) return;
                // Be at the building 2 minutes before class, like the next-class plan.
                const [h, m] = c.start.split(":").map(Number);
                const t = h * 60 + m - 2;
                const at = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
                setPlaceTime(at);
                planTo({ destinationPoint: { ...selectedBuilding.center, label: selectedBuilding.name } }, at);
              }}
              loading={loading}
              onBack={backToPlan}
              onPlan={() =>
                selectedBuilding
                  ? planTo({ destinationPoint: { ...selectedBuilding.center, label: selectedBuilding.name } })
                  : selection?.kind === "point" && planTo({ destinationPoint: selection.point })
              }
            />
          )}

          {view === "plan" && (
            <>
              {!rec && !error && <SignSkeleton />}

              {rec && !plan && (
                <section className="sign">
                  <div className="sign-face space-y-2">
                    <h1 className="text-[24px] font-extrabold leading-tight">No more classes today</h1>
                    <p className="text-on-sign-muted">Heading to campus anyway? Search for a building, or tap it on the map.</p>
                  </div>
                </section>
              )}

              {plan && (
                <section className="sign" aria-live="polite">
                  <div className="sign-face">
                    <p className="text-[15px] font-semibold text-on-sign-muted">
                      {rec?.nextClass
                        ? `${rec.nextClass.course ? `${rec.nextClass.course} in ` : ""}${rec.nextClass.building}${classRoom(rec.nextClass) ? ` (${classRoom(rec.nextClass)})` : ""} at ${clock(rec.nextClass.startsAt)}`
                        : `${plan.destination} by ${clock(plan.arriveBy)}`}
                    </p>

                    {showing && (
                      <div className="mt-1.5">
                        <p className="text-[15px] font-semibold">{rec?.leaveBy && !chosen ? "Leave by" : "Park by"}</p>
                        <p className="text-[44px] font-black leading-[0.95] tracking-tight tabular-nums">
                          {clock(rec?.leaveBy && !chosen ? rec.leaveBy : showing.parkBy)}
                        </p>
                      </div>
                    )}

                    <div className="stall-line my-4" aria-hidden />

                    {plan.parkAndRide && plan.usual && !chosen && (
                      <p className="curb-note mb-3 text-[15px]">
                        {plan.usual.lotName} is {plan.usual.status === "red" ? "likely full" : "filling up"}. Parking here and taking the bus is faster today.
                      </p>
                    )}

                    {showing ? (
                      <>
                        <h1 className="text-[24px] font-extrabold leading-tight">{showing.lotName}</h1>
                        <p className="mt-1.5 flex items-center gap-2">
                          <StatusBadge status={showing.status} />
                          <span className="text-[15px] text-on-sign-muted">when you arrive</span>
                        </p>
                        <p className="mt-3 text-[16px] leading-snug">{routeSentence(showing)}</p>
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
                          <div key={chosen.lotId} className="settle mt-4 space-y-3">
                            <p className="text-[17px] font-bold">You&apos;re parking at {chosen.lotName}.</p>
                            <a href={`/report?lot=${chosen.lotId}`} className="btn btn-on-sign w-full">
                              Report how full it is
                            </a>
                          </div>
                        ) : (
                          <button className="btn btn-on-sign mt-4 w-full" onClick={() => choose(showing)}>
                            I&apos;m parking at {showing.lotName}
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

              {plan && plan.alternatives.length > 0 && !chosen && (
                <section className="space-y-2">
                  <div>
                    <h2 className="text-[17px] font-bold">Other lots your permit allows</h2>
                    <p className="text-[13px] text-muted">How full each lot is likely to be when you&apos;d arrive.</p>
                  </div>
                  {groupByCampus(
                    plan.alternatives.map((o) => ({ ...o, campus: rowFor(o.lotId)?.lot.campus ?? "college_ave" })),
                  ).map((g) => (
                    <div key={g.campus} className="space-y-1">
                      <h3 className="text-[13px] font-bold uppercase tracking-wide text-muted">{g.label}</h3>
                      <ul className="panel">
                        {g.items.map((o) => (
                          <li key={o.lotId} className="space-y-1 border-t border-line px-4 py-3 first:border-t-0">
                            <div className="flex items-baseline justify-between gap-3">
                              <button className="text-left font-bold" onClick={() => selectLot(o.lotId, true)}>{o.lotName}</button>
                              <StatusBadge status={o.status} />
                            </div>
                            <p className="text-[14px] text-muted">{routeSentence(o)}</p>
                            <button className="link text-[15px]" onClick={() => choose(o)}>
                              Park here instead
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              )}

              <AllLots rows={rows} onSelect={(id) => selectLot(id, true)} loading={loading} onRefresh={() => load()} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function LotDetail({
  row,
  option,
  onBack,
  onChoose,
}: {
  row: MapLotRow;
  option: TripOption | null;
  onBack: () => void;
  onChoose: (o: TripOption) => void;
}) {
  const status = row.estimate?.status ?? "gray";
  return (
    <section className="space-y-3">
      <button className="link text-[15px]" onClick={onBack}>
        ← Back to your plan
      </button>
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wide text-muted">{CAMPUS_LABEL[row.lot.campus]} · Parking</p>
        <h1 className="text-[24px] font-extrabold leading-tight">{row.lot.name}</h1>
      </div>
      <StatusBadge status={status} size="lg" />
      {row.estimate && <Evidence estimate={row.estimate} />}
      {row.allowed === true && <p className="text-[15px]">Your permit allows this lot right now.</p>}
      {row.allowed === false && (
        <p className="curb-note text-[15px]">Your permit doesn&apos;t allow this lot right now. Many student lots open to every permit after 5 PM on weekdays and all weekend.</p>
      )}
      {option ? (
        <div className="panel panel-pad space-y-3">
          <p className="text-[15px]">{routeSentence(option)}</p>
          <button className="btn btn-primary w-full" onClick={() => onChoose(option)}>
            I&apos;m parking here
          </button>
        </div>
      ) : (
        row.allowed !== false && <p className="text-[14px] text-muted">Not part of your current trip plan. Tap a building to plan a trip.</p>
      )}
      <a href={`/report?lot=${row.lot.id}`} className="btn btn-quiet w-full">
        Report how full it is
      </a>
    </section>
  );
}

function PlaceDetail({
  title,
  subtitle,
  time,
  onTime,
  loading,
  onBack,
  onPlan,
  classes,
  onPlanClass,
}: {
  title: string;
  subtitle: string;
  time: string;
  onTime: (t: string) => void;
  loading: boolean;
  onBack: () => void;
  onPlan: () => void;
  classes: ClassEntry[];
  onPlanClass: (c: ClassEntry) => void;
}) {
  return (
    <section className="space-y-3">
      <button className="link text-[15px]" onClick={onBack}>
        ← Back to your plan
      </button>
      <div>
        <h1 className="text-[24px] font-extrabold leading-tight">{title}</h1>
        <p className="text-[14px] text-muted">{subtitle}</p>
      </div>
      {classes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[13px] font-bold uppercase tracking-wide text-[#6b3fb8]">Your classes here</p>
          <ul className="panel">
            {classes.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5 first:border-t-0">
                <span>
                  <span className="block font-semibold">{c.course || "Class"}</span>
                  <span className="block text-[13px] text-muted">{[classRoom(c), classWhen(c)].filter(Boolean).join(" · ")}</span>
                </span>
                <button className="link flex-none text-[15px]" disabled={loading} onClick={() => onPlanClass(c)}>
                  Plan
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form
        className="grid grid-cols-[1fr_auto] items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (time) onPlan();
        }}
      >
        <label className="space-y-1">
          <span className="text-[14px] font-semibold">Be there by</span>
          <input type="time" className="field" required value={time} onChange={(e) => onTime(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Planning…" : "Plan trip"}
        </button>
      </form>
      <p className="text-[13px] text-muted">We check every lot your permit allows, how full each is likely to be, the walk, and the campus buses.</p>
    </section>
  );
}

/** Every lot, grouped by campus; tapping one shows it on the map. */
function AllLots({ rows, onSelect, loading, onRefresh }: { rows: MapLotRow[]; onSelect: (id: string) => void; loading: boolean; onRefresh: () => void }) {
  const groups = groupByCampus(
    rows.map((r) => ({ ...r, campus: r.lot.campus, name: r.lot.name })),
    byLotName,
  );
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[17px] font-bold">Lots by campus</h2>
        <button className="link text-[15px]" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {!rows.length && <p className="text-[15px] text-muted">Loading lots…</p>}
      {groups.map((g) => {
        const allowed = g.items.filter((r) => r.allowed);
        return (
          <details key={g.campus} className="panel group" open={allowed.length > 0 && allowed.length <= 6}>
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-bold">
              {g.label}
              <span className="text-[13px] font-semibold text-muted">
                {allowed.length ? `${allowed.length} allowed now` : `${g.items.length} lots`}
              </span>
            </summary>
            <ul>
              {g.items.map((r) => (
                <li key={r.lot.id} className="border-t border-line">
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left" onClick={() => onSelect(r.lot.id)}>
                    <span className={r.allowed === false ? "text-muted" : "font-semibold"}>{r.lot.name}</span>
                    <StatusBadge status={r.estimate?.status ?? "gray"} />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </section>
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
