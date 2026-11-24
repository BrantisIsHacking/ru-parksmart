import type { ManualCount, MetricEvent, Report, Trip, TripOutcome, TrustRecord } from "../types";
import type { BaselineCache, Store } from "./types";

/** Dev-only store. Data lives in the server process and is lost on restart. */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private reports: Report[] = [];
  private trust = new Map<string, TrustRecord>();
  private events: MetricEvent[] = [];
  private counts: ManualCount[] = [];
  private trips = new Map<string, Trip>();
  private outcomes: TripOutcome[] = [];
  private seq = 0;
  private baselineCache: BaselineCache | null = null;

  private id() {
    return `m${++this.seq}`;
  }

  async addReport(r: Report) {
    this.reports.push({ ...r, id: this.id() });
  }
  async reportsSince(sinceIso: string) {
    return this.reports.filter((r) => r.createdAt >= sinceIso);
  }
  async listReports() {
    return [...this.reports];
  }
  async lastReportAt(reporter: string, lotId: string) {
    const mine = this.reports.filter((r) => r.reporter === reporter && r.lotId === lotId);
    return mine.length ? mine[mine.length - 1].createdAt : null;
  }
  async getTrust(reporters: string[]) {
    const out = new Map<string, TrustRecord>();
    for (const r of reporters) {
      const rec = this.trust.get(r);
      if (rec) out.set(r, rec);
    }
    return out;
  }
  async putTrust(records: TrustRecord[]) {
    for (const r of records) this.trust.set(r.reporter, r);
  }
  async addEvent(e: MetricEvent) {
    this.events.push({ ...e, id: this.id() });
  }
  async listEvents() {
    return [...this.events];
  }
  async addCount(c: ManualCount) {
    this.counts.push({ ...c, id: this.id() });
  }
  async listCounts() {
    return [...this.counts];
  }
  async countsSince(sinceIso: string) {
    return this.counts.filter((c) => c.countedAt >= sinceIso);
  }
  async addTrip(t: Trip) {
    const id = this.id();
    this.trips.set(id, { ...t, id });
    return id;
  }
  async getTrip(id: string) {
    const t = this.trips.get(id);
    return t ? { ...t } : null;
  }
  async updateTrip(id: string, patch: Partial<Trip>) {
    const t = this.trips.get(id);
    if (t) this.trips.set(id, { ...t, ...patch, id });
  }
  async claimTrip(id: string) {
    const t = this.trips.get(id);
    if (!t || t.state !== "pending") return false;
    this.trips.set(id, { ...t, state: "notified" });
    return true;
  }
  async pendingTripsFor(reporter: string) {
    return [...this.trips.values()].filter((t) => t.reporter === reporter && t.state === "pending");
  }
  async releaseTrip(id: string) {
    const t = this.trips.get(id);
    if (!t || t.state !== "notified") return false;
    this.trips.set(id, { ...t, state: "pending" });
    return true;
  }
  async pendingTrips() {
    return [...this.trips.values()].filter((t) => t.state === "pending").map((t) => ({ ...t }));
  }
  async addOutcome(o: TripOutcome) {
    if (this.outcomes.some((x) => x.tripId === o.tripId)) return false;
    this.outcomes.push({ ...o, id: o.tripId });
    return true;
  }
  async outcomesSince(sinceIso: string) {
    return this.outcomes.filter((o) => o.createdAt >= sinceIso);
  }
  async listOutcomes() {
    return [...this.outcomes];
  }
  async getBaselineCache() {
    return this.baselineCache;
  }
  async putBaselineCache(c: BaselineCache) {
    this.baselineCache = c;
  }
}
