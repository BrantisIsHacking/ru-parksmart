import type { ManualCount, MetricEvent, Report, TrustRecord } from "../types";
import type { Store } from "./types";

/** Dev-only store. Data lives in the server process and is lost on restart. */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private reports: Report[] = [];
  private trust = new Map<string, TrustRecord>();
  private events: MetricEvent[] = [];
  private counts: ManualCount[] = [];
  private seq = 0;

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
}
