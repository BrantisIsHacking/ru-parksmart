// Park-or-ride planner. Ranks every lot the permit allows by total door-to-class
// time plus a congestion penalty, and offers a scheduled campus bus when the
// lot is too far to walk. Bus times are SCHEDULED, not live.
import { ACTIVE_RULES, BUS_ROUTES, LOTS } from "../data";
import { distanceMeters, walkMinutes } from "../geo";
import { checkPermit } from "../rules/engine";
import { campusParts, campusTimeOnDay, parseHHMM } from "../time";
import type { BusRoute, BusStop, LatLng, Lot, LotEstimate, LotStatus, Place, RulesFile } from "../types";

export const MAX_WALK_MIN = 20;
/** Walks longer than this are compared against the bus; the faster one wins. */
export const BUS_CONSIDER_WALK_MIN = 12;
const MAX_STOP_DISTANCE_M = 600;
const BUFFER_MIN = 3;
const STATUS_PENALTY: Record<LotStatus, number> = { green: 0, yellow: 4, gray: 6, red: 30 };

export interface BusLeg {
  routeId: string;
  routeName: string;
  fromStop: string;
  toStop: string;
  fromStopCenter: LatLng;
  toStopCenter: LatLng;
  departAt: string;
  rideMin: number;
  walkToStopMin: number;
  walkFromStopMin: number;
  scheduled: true;
  verified: boolean;
}

export interface TripOption {
  lotId: string;
  lotName: string;
  status: LotStatus;
  fill: number | null;
  confidence: number;
  mode: "walk" | "bus";
  walkMin: number;
  bus: BusLeg | null;
  /** Be parked by this time (ISO) to make class. */
  parkBy: string;
  /** Minutes from parked to arriving at the building. */
  totalMin: number;
  score: number;
  permitVerified: boolean;
}

export interface TripPlan {
  destination: string;
  destinationCenter: LatLng;
  arriveBy: string;
  /** Closest eligible lot: what most students would try first. */
  usual: TripOption | null;
  recommended: TripOption | null;
  alternatives: TripOption[];
  /** True when the recommendation is a different lot than the usual one because of congestion. */
  parkAndRide: boolean;
  notes: string[];
}

function nearestStop(route: BusRoute, at: { lat: number; lng: number }): BusStop | null {
  let best: BusStop | null = null;
  let bestD = Infinity;
  for (const s of route.stops) {
    const d = distanceMeters(s.center, at);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return bestD <= MAX_STOP_DISTANCE_M ? best : null;
}

/** Latest scheduled departure from `stop` at or before `latest`, or null. */
export function latestDeparture(route: BusRoute, stop: BusStop, latest: Date): Date | null {
  const { weekday, minutes } = campusParts(latest);
  if (!route.days.includes(weekday)) return null;
  const first = parseHHMM(route.firstDeparture) + stop.offsetMin;
  const last = parseHHMM(route.lastDeparture) + stop.offsetMin;
  if (minutes < first) return null;
  const capped = Math.min(minutes, last);
  const k = Math.floor((capped - first) / route.headwayMin);
  return campusTimeOnDay(latest, first + k * route.headwayMin);
}

function busLeg(lot: Lot, dest: Place, arriveBy: Date, routes: BusRoute[]): { leg: BusLeg; parkBy: Date } | null {
  let best: { leg: BusLeg; parkBy: Date } | null = null;
  for (const route of routes) {
    const from = nearestStop(route, lot.center);
    const to = nearestStop(route, dest.center);
    if (!from || !to || from.id === to.id) continue;
    // Buses run one way around a loop: riding to an earlier stop goes the long way round.
    const forward = to.offsetMin - from.offsetMin;
    const rideMin = Math.max(2, forward > 0 ? forward : route.loopMin ? route.loopMin + forward : Math.abs(forward));
    const walkFrom = walkMinutes(to.center, dest.center);
    const walkTo = walkMinutes(lot.center, from.center);
    const depart = latestDeparture(route, from, new Date(arriveBy.getTime() - (rideMin + walkFrom) * 60_000));
    if (!depart) continue;
    const parkBy = new Date(depart.getTime() - (walkTo + BUFFER_MIN) * 60_000);
    if (!best || parkBy > best.parkBy) {
      best = {
        parkBy,
        leg: {
          routeId: route.id,
          routeName: route.name,
          fromStop: from.name,
          toStop: to.name,
          fromStopCenter: from.center,
          toStopCenter: to.center,
          departAt: depart.toISOString(),
          rideMin,
          walkToStopMin: walkTo,
          walkFromStopMin: walkFrom,
          scheduled: true,
          verified: route.verified,
        },
      };
    }
  }
  return best;
}

export interface PlanInput {
  permitId: string;
  destination: Place;
  arriveBy: Date;
  estimates: Map<string, LotEstimate>;
  lots?: Lot[];
  routes?: BusRoute[];
  rules?: RulesFile;
}

export function planTrip({
  permitId,
  destination,
  arriveBy,
  estimates,
  lots = LOTS,
  routes = BUS_ROUTES,
  rules = ACTIVE_RULES,
}: PlanInput): TripPlan {
  const notes: string[] = [];
  const options: TripOption[] = [];
  // Eligibility is checked for roughly when the student will be parking.
  const parkingTime = new Date(arriveBy.getTime() - 15 * 60_000);

  for (const lot of lots) {
    // Lots the source only places to ~1 km can't give honest walk times.
    if (lot.coordsApprox) continue;
    const permit = checkPermit(rules, lot.id, permitId, parkingTime);
    if (!permit.allowed) continue;
    const est = estimates.get(lot.id);
    const status = est?.status ?? "gray";
    const walk = walkMinutes(lot.center, destination.center);
    const base = {
      lotId: lot.id,
      lotName: lot.name,
      status,
      fill: est?.fill ?? null,
      confidence: est?.confidence ?? 0,
      walkMin: walk,
      permitVerified: permit.verified,
    };
    const walkOption: Omit<TripOption, "score"> | null =
      walk <= MAX_WALK_MIN
        ? {
            ...base,
            mode: "walk",
            bus: null,
            parkBy: new Date(arriveBy.getTime() - (walk + BUFFER_MIN) * 60_000).toISOString(),
            totalMin: walk + BUFFER_MIN,
          }
        : null;
    const ride = walk > BUS_CONSIDER_WALK_MIN ? busLeg(lot, destination, arriveBy, routes) : null;
    const busOption: Omit<TripOption, "score"> | null = ride
      ? {
          ...base,
          mode: "bus",
          bus: ride.leg,
          parkBy: ride.parkBy.toISOString(),
          totalMin: Math.round((arriveBy.getTime() - ride.parkBy.getTime()) / 60_000),
        }
      : null;
    // Prefer the bus only when it lets the student park later than walking would.
    const option = busOption && (!walkOption || busOption.totalMin < walkOption.totalMin) ? busOption : walkOption;
    // Lots too far to walk with no fitting bus are left out silently: in the evening
    // flex hours that is most of the other campuses.
    if (option) options.push({ ...option, score: option.totalMin + STATUS_PENALTY[status] });
  }

  if (!options.length) {
    notes.push("No lot your permit allows can get you there on time. Check rudots.rutgers.edu or ask about visitor parking.");
  }
  const usual = [...options].sort((a, b) => a.walkMin - b.walkMin)[0] ?? null;
  const ranked = [...options].sort((a, b) => a.score - b.score);
  const recommended = ranked[0] ?? null;
  const parkAndRide =
    !!usual && !!recommended && recommended.lotId !== usual.lotId && (usual.status === "red" || usual.status === "yellow");

  return {
    destination: destination.name,
    destinationCenter: destination.center,
    arriveBy: arriveBy.toISOString(),
    usual,
    recommended,
    alternatives: ranked.slice(1),
    parkAndRide,
    notes,
  };
}
