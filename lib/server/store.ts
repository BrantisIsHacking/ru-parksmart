import "server-only";
import { FirestoreStore } from "../store/firestore";
import { MemoryStore } from "../store/memory";
import type { Store } from "../store/types";
import { adminDb } from "./firebaseAdmin";

// Survive Next.js dev hot reloads so the memory store keeps its data.
// Bump STORE_VERSION whenever the Store interface changes: a running dev server
// then replaces its cached store (which would lack the new methods) on the next reload.
const STORE_VERSION = 2;
const g = globalThis as unknown as { __rupsStore?: { version: number; store: Store } };

export function getStore(): Store {
  if (g.__rupsStore?.version !== STORE_VERSION) {
    const db = adminDb();
    g.__rupsStore = { version: STORE_VERSION, store: db ? new FirestoreStore(db) : new MemoryStore() };
    if (!db) console.warn("[ru-parksmart] FIREBASE_SERVICE_ACCOUNT not set: using in-memory store (dev only).");
  }
  return g.__rupsStore.store;
}
