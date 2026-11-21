"use client";
// Anonymous identity. With Firebase configured: anonymous auth, ID token sent as
// a Bearer token. Without it (dev): a random id kept in localStorage.
// No names, emails or student IDs are ever collected.
import { getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const firebaseEnabled = !!firebaseConfig.apiKey;

let authPromise: Promise<Auth> | null = null;

function firebaseAuth(): Promise<Auth> {
  authPromise ??= (async () => {
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    await auth.authStateReady();
    if (!auth.currentUser) await signInAnonymously(auth);
    return auth;
  })();
  return authPromise;
}

function localAnonId(): string {
  const KEY = "rups.anonId";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "ephemeral-" + Math.random().toString(36).slice(2, 12);
  }
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (firebaseEnabled) {
    const auth = await firebaseAuth();
    const token = await auth.currentUser!.getIdToken();
    return { authorization: `Bearer ${token}` };
  }
  return { "x-anon-id": localAnonId() };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeaders()), ...extraHeaders };
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Metrics never block or break the UI. */
export function track(type: string, props?: Record<string, unknown>, lotId?: string | null) {
  api("/api/events", { type, props, lotId }).catch(() => {});
}
