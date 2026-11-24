"use client";
// The student's pending trip check-in and notification choice live on their device only.

export interface PendingTrip {
  tripId: string;
  lotId: string;
  lotName: string;
  parkBy: string;
}

const PENDING_KEY = "rups.pendingTrip";
const OPT_KEY = "rups.checkinOptIn";
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

export function getPending(): PendingTrip | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as PendingTrip;
    const parkBy = Date.parse(t.parkBy);
    if (!t.tripId || Number.isNaN(parkBy) || Date.now() > parkBy + TWELVE_HOURS) {
      clearPending();
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

export function setPending(t: PendingTrip) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(t));
  } catch {
    /* private mode: no check-in on the next open */
  }
}

/** With a tripId, clears only if that trip is still the stored one. */
export function clearPending(tripId?: string) {
  try {
    if (tripId) {
      const raw = localStorage.getItem(PENDING_KEY);
      if (raw && (JSON.parse(raw) as PendingTrip).tripId !== tripId) return;
    }
    localStorage.removeItem(PENDING_KEY);
  } catch {}
}

/** "Erase my data": forget the pending check-in and the notification choice. */
export function clearCheckinData() {
  try {
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem(OPT_KEY);
  } catch {}
}

export type OptInState = "unasked" | "on" | "off";

export function optInState(): OptInState {
  try {
    const v = localStorage.getItem(OPT_KEY);
    return v === "on" || v === "off" ? v : "unasked";
  } catch {
    return "unasked";
  }
}

export function setOptInState(v: "on" | "off") {
  try {
    localStorage.setItem(OPT_KEY, v);
  } catch {}
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Subscribes to push. Null when unsupported, denied or on any error.
 * Only the opt-in "Turn on" tap passes askPermission; later calls never prompt.
 */
export async function subscribePush(askPermission = false): Promise<PushSubscriptionJSON | null> {
  try {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    if (askPermission && Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") return null;
    // ready never settles if the service worker failed to register: give up after 5 s.
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    if (!reg) return null;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    return sub.toJSON();
  } catch {
    return null;
  }
}
