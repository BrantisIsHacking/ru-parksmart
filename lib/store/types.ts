import type { LotBaseline } from "../data";
import type { ManualCount, MetricEvent, Report, Trip, TripOutcome, TrustRecord } from "../types";

/** Persistence used by the API routes. Firestore in production, memory in dev. */
export interface Store {
  readonly kind: "firestore" | "memory";
  addReport(r: Report): Promise<void>;
  reportsSince(sinceIso: string): Promise<Report[]>;
  listReports(): Promise<Report[]>;
  lastReportAt(reporter: string, lotId: string): Promise<string | null>;
  getTrust(reporters: string[]): Promise<Map<string, TrustRecord>>;
  putTrust(records: TrustRecord[]): Promise<void>;
  addEvent(e: MetricEvent): Promise<void>;
  listEvents(): Promise<MetricEvent[]>;
  addCount(c: ManualCount): Promise<void>;
  listCounts(): Promise<ManualCount[]>;
  countsSince(sinceIso: string): Promise<ManualCount[]>;
  addTrip(t: Trip): Promise<string>;
  getTrip(id: string): Promise<Trip | null>;
  updateTrip(id: string, patch: Partial<Trip>): Promise<void>;
  /** Atomically move a trip from pending to notified. False if it was not pending (already claimed). */
  claimTrip(id: string): Promise<boolean>;
  pendingTripsFor(reporter: string): Promise<Trip[]>;
  /** Atomically move a trip from notified back to pending. False if it was no longer notified. */
  releaseTrip(id: string): Promise<boolean>;
  /** Every trip in state pending (one single-field query; callers filter due/stale in memory). */
  pendingTrips(): Promise<Trip[]>;
  /** One outcome per trip: returns false (and stores nothing) if the trip already has one. */
  addOutcome(o: TripOutcome): Promise<boolean>;
  outcomesSince(sinceIso: string): Promise<TripOutcome[]>;
  listOutcomes(): Promise<TripOutcome[]>;
  /** Learned baselines cached across instances (Firestore doc meta/baselines). */
  getBaselineCache(): Promise<BaselineCache | null>;
  putBaselineCache(c: BaselineCache): Promise<void>;
}

export interface BaselineCache {
  /** ISO time the curves were computed. */
  computedAt: string;
  lots: Record<string, LotBaseline>;
}
