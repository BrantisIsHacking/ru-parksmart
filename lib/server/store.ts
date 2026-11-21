import "server-only";
import { FirestoreStore } from "../store/firestore";
import { MemoryStore } from "../store/memory";
import type { Store } from "../store/types";
import { adminDb } from "./firebaseAdmin";

// Survive Next.js dev hot reloads so the memory store keeps its data.
const g = globalThis as unknown as { __rupsStore?: Store };

export function getStore(): Store {
  if (!g.__rupsStore) {
    const db = adminDb();
    g.__rupsStore = db ? new FirestoreStore(db) : new MemoryStore();
    if (!db) console.warn("[ru-parksmart] FIREBASE_SERVICE_ACCOUNT not set: using in-memory store (dev only).");
  }
  return g.__rupsStore;
}
