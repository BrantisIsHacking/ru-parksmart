import type { Firestore } from "firebase-admin/firestore";
import type { ManualCount, MetricEvent, Report, Trip, TripOutcome, TrustRecord } from "../types";
import type { BaselineCache, Store } from "./types";

// Collections: reports, trust (doc id = hashed reporter), events, counts, trips, outcomes,
// meta (doc "baselines" caches the learned curves).
// All writes go through the server (Admin SDK); clients never write directly,
// so Firestore security rules can deny all client access.
export class FirestoreStore implements Store {
  readonly kind = "firestore" as const;
  constructor(private db: Firestore) {}

  private async all<T>(collection: string): Promise<T[]> {
    const snap = await this.db.collection(collection).orderBy("createdAt").get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
  }

  async addReport(r: Report) {
    await this.db.collection("reports").add(r);
  }
  async reportsSince(sinceIso: string) {
    const snap = await this.db.collection("reports").where("createdAt", ">=", sinceIso).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Report) }));
  }
  async listReports() {
    return this.all<Report>("reports");
  }
  async lastReportAt(reporter: string, lotId: string) {
    // Single-field filter avoids needing a composite index; per-reporter volume is tiny.
    const snap = await this.db.collection("reports").where("reporter", "==", reporter).get();
    const times = snap.docs
      .map((d) => d.data() as Report)
      .filter((r) => r.lotId === lotId)
      .map((r) => r.createdAt)
      .sort();
    return times.length ? times[times.length - 1] : null;
  }
  async getTrust(reporters: string[]) {
    const out = new Map<string, TrustRecord>();
    if (!reporters.length) return out;
    const refs = [...new Set(reporters)].map((r) => this.db.collection("trust").doc(r));
    const docs = await this.db.getAll(...refs);
    for (const d of docs) if (d.exists) out.set(d.id, d.data() as TrustRecord);
    return out;
  }
  async putTrust(records: TrustRecord[]) {
    const batch = this.db.batch();
    for (const r of records) batch.set(this.db.collection("trust").doc(r.reporter), r);
    await batch.commit();
  }
  async addEvent(e: MetricEvent) {
    await this.db.collection("events").add(e);
  }
  async listEvents() {
    return this.all<MetricEvent>("events");
  }
  async addCount(c: ManualCount) {
    await this.db.collection("counts").add({ ...c, createdAt: c.countedAt });
  }
  async listCounts() {
    return this.all<ManualCount>("counts");
  }
  async countsSince(sinceIso: string) {
    const snap = await this.db.collection("counts").where("createdAt", ">=", sinceIso).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ManualCount) }));
  }
  async addTrip(t: Trip) {
    const { id: _id, ...data } = t;
    const ref = await this.db.collection("trips").add(data);
    return ref.id;
  }
  async getTrip(id: string) {
    const d = await this.db.collection("trips").doc(id).get();
    return d.exists ? ({ ...(d.data() as Trip), id: d.id } as Trip) : null;
  }
  async updateTrip(id: string, patch: Partial<Trip>) {
    const { id: _id, ...data } = patch;
    await this.db.collection("trips").doc(id).update(data);
  }
  async claimTrip(id: string) {
    const ref = this.db.collection("trips").doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || (snap.data() as Trip).state !== "pending") return false;
      tx.update(ref, { state: "notified" });
      return true;
    });
  }
  async releaseTrip(id: string) {
    const ref = this.db.collection("trips").doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || (snap.data() as Trip).state !== "notified") return false;
      tx.update(ref, { state: "pending" });
      return true;
    });
  }
  async pendingTripsFor(reporter: string) {
    const snap = await this.db.collection("trips").where("reporter", "==", reporter).get();
    return snap.docs.map((d) => ({ ...(d.data() as Trip), id: d.id })).filter((t) => t.state === "pending");
  }
  async pendingTrips() {
    // One equality filter, times filtered by the caller: no composite index needed.
    const snap = await this.db.collection("trips").where("state", "==", "pending").get();
    return snap.docs.map((d) => ({ ...(d.data() as Trip), id: d.id }));
  }
  async addOutcome(o: TripOutcome) {
    const { id: _id, ...data } = o;
    // Doc id = trip id and create() fails if it exists, so a trip can only be answered once.
    try {
      await this.db.collection("outcomes").doc(o.tripId).create(data);
      return true;
    } catch (e) {
      if ((e as { code?: number }).code === 6) return false; // ALREADY_EXISTS
      throw e;
    }
  }
  async outcomesSince(sinceIso: string) {
    const snap = await this.db.collection("outcomes").where("createdAt", ">=", sinceIso).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TripOutcome) }));
  }
  async listOutcomes() {
    return this.all<TripOutcome>("outcomes");
  }
  async getBaselineCache() {
    const d = await this.db.collection("meta").doc("baselines").get();
    return d.exists ? (d.data() as BaselineCache) : null;
  }
  async putBaselineCache(c: BaselineCache) {
    await this.db.collection("meta").doc("baselines").set(c);
  }
}
