import type { Firestore } from "firebase-admin/firestore";
import type { ManualCount, MetricEvent, Report, TrustRecord } from "../types";
import type { Store } from "./types";

// Collections: reports, trust (doc id = hashed reporter), events, counts.
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
}
