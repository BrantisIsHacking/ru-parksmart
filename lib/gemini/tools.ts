import "server-only";
// Function declarations Gemini can call, and their server-side implementations.
// Every eligibility answer flows through lib/rules/engine.ts.
import type { FunctionDeclaration } from "@google/genai";
import { ACTIVE_RULES, LOTS, searchBuildings } from "../data";
import { groupByCampus } from "../campus";
import { checkPermit } from "../rules/engine";
import { describeCampusTime } from "../time";
import { estimatesFor, recommend, resolveTime } from "../server/services";
import { askMaps, type MapsPlace } from "./mapsGrounding";
import { MAPS_GROUNDING_ENABLED } from "./client";

const TIME_DESC =
  'Campus-local time as "HH:MM" (24-hour, today) or an ISO 8601 timestamp. Omit for now.';

export const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_lots",
    description:
      "List the parking lots (ids and names, grouped by campus) and permit types. Call this to map a lot the student mentions to an id. For buildings use find_building.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "find_building",
    description:
      "Find Rutgers New Brunswick buildings by name, code (TIL, ARC, HLL, SC) or address, from the official campus map. Returns the best matches with campus and code.",
    parametersJsonSchema: {
      type: "object",
      properties: { query: { type: "string", description: "What the student called the building, e.g. 'Hill Center' or 'TIL-254'" } },
      required: ["query"],
    },
  },
  {
    name: "check_permit",
    description:
      "Authoritative check of whether a permit type may park in a lot at a given time, using the verified Rutgers permit-rules engine. The only source of truth for eligibility.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        lot_id: { type: "string", description: "Lot id from list_lots, e.g. LIV-915" },
        permit_id: { type: "string", description: "Permit type id from list_lots, e.g. commuter-livingston" },
        time: { type: "string", description: TIME_DESC },
      },
      required: ["lot_id", "permit_id"],
    },
  },
  {
    name: "get_lot_status",
    description:
      "Estimated congestion (green likely open / yellow filling / red likely full / gray not enough data) for lots at an arrival time, with confidence and evidence sources. Never an exact space count.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        lot_ids: { type: "array", items: { type: "string" }, description: "Lot ids; omit for all pilot lots" },
        arrival_time: { type: "string", description: TIME_DESC },
      },
    },
  },
  {
    name: "plan_park_or_ride",
    description:
      "Plan where to park to reach a building (or a lat/lng point) by a time: checks permit eligibility for every lot, congestion, walking time, and the scheduled campus bus fallback. Returns the usual lot, the recommendation, alternatives, and a park-by time.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        permit_id: { type: "string", description: "Permit type id" },
        destination: { type: "string", description: "Building name or code, e.g. Tillett Hall or TIL" },
        lat: { type: "number", description: "Destination latitude, when the student gave a point instead of a building" },
        lng: { type: "number", description: "Destination longitude" },
        arrive_by: { type: "string", description: "When the student must be at the building. " + TIME_DESC },
      },
      required: ["permit_id", "arrive_by"],
    },
  },
];

if (MAPS_GROUNDING_ENABLED) {
  FUNCTION_DECLARATIONS.push({
    name: "ask_maps",
    description:
      "Answer a question about places near campus (building entrances, nearby places, how to get somewhere) using Grounding with Google Maps. Not for permit rules or lot congestion.",
    parametersJsonSchema: {
      type: "object",
      properties: { question: { type: "string" } },
      required: ["question"],
    },
  });
}

export interface ToolContext {
  now: Date;
  /** Collected for the UI: Maps places cited by grounded answers. */
  places: MapsPlace[];
  /** Set when a plan recommended park-and-ride (logged as a metric). */
  parkAndRideShown: boolean;
}

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export async function runTool(name: string, args: Args, ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case "list_lots":
      return {
        campuses: groupByCampus(LOTS).map((g) => ({ campus: g.label, lots: g.items.map((l) => ({ id: l.id, name: l.name })) })),
        permits: ACTIVE_RULES.permits,
        combinedPermits: "A student with a secondary permit has an id like 'commuter-livingston+secondary-busch'.",
        rulesVersion: ACTIVE_RULES.version,
      };
    case "find_building": {
      const query = str(args.query);
      if (!query) return { error: "query is required" };
      const matches = searchBuildings(query, 5).map((b) => ({ name: b.name, code: b.code ?? null, campus: b.campus, address: b.address ?? null }));
      return matches.length ? { matches } : { matches, note: "No building matched. Ask the student for the building code from their schedule." };
    }
    case "check_permit": {
      const lotId = str(args.lot_id);
      const permitId = str(args.permit_id);
      if (!lotId || !permitId) return { error: "lot_id and permit_id are required" };
      return checkPermit(ACTIVE_RULES, lotId, permitId, resolveTime(str(args.time), ctx.now));
    }
    case "get_lot_status": {
      const when = resolveTime(str(args.arrival_time), ctx.now);
      const all = await estimatesFor(when, ctx.now);
      const ids = Array.isArray(args.lot_ids) && args.lot_ids.length ? (args.lot_ids as string[]) : [...all.keys()];
      return {
        arrivalTime: describeCampusTime(when),
        lots: ids.map((id) => all.get(id) ?? { lotId: id, error: "Unknown lot id" }),
      };
    }
    case "plan_park_or_ride": {
      const permitId = str(args.permit_id);
      const destination = str(args.destination);
      const point = typeof args.lat === "number" && typeof args.lng === "number" ? { lat: args.lat, lng: args.lng } : null;
      if (!permitId || (!destination && !point)) return { error: "permit_id and a destination (building or lat/lng) are required" };
      const arriveBy = resolveTime(str(args.arrive_by), ctx.now);
      const { plan } = await recommend({ permitId, destination, destinationPoint: point, arriveBy, now: ctx.now });
      if (plan.parkAndRide) ctx.parkAndRideShown = true;
      return { ...plan, arriveByLocal: describeCampusTime(arriveBy) };
    }
    case "ask_maps": {
      if (!MAPS_GROUNDING_ENABLED) return { error: "Maps grounding is disabled" };
      const question = str(args.question);
      if (!question) return { error: "question is required" };
      const res = await askMaps(question);
      ctx.places.push(...res.places);
      return res;
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
