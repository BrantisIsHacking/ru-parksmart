import type { ManualCount, MetricEvent, Report, TrustRecord } from "../types";

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
}
