"use client";
// The student's profile lives only on their device (localStorage).
// The server sees the permit type and class times per request, never stores them.
import { useEffect, useState } from "react";
import type { ClassEntry } from "../types";

export interface Profile {
  permitId: string | null;
  commuteMin: number | null;
  classes: ClassEntry[];
  /** Last lot the student chose, to prefill the report screen. */
  lastLotId: string | null;
  decisions: number;
  ratedSatisfaction: boolean;
}

const KEY = "rups.profile.v1";
export const EMPTY_PROFILE: Profile = {
  permitId: null,
  commuteMin: null,
  classes: [],
  lastLotId: null,
  decisions: 0,
  ratedSatisfaction: false,
};

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY_PROFILE, ...JSON.parse(raw) } : EMPTY_PROFILE;
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: profile lasts for this session only */
  }
}

export function clearProfile() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem("rups.anonId");
  } catch {}
}

/** [profile | null while loading, update] */
export function useProfile(): [Profile | null, (patch: Partial<Profile>) => void] {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => setProfile(loadProfile()), []);
  const update = (patch: Partial<Profile>) => {
    setProfile((prev) => {
      const next = { ...(prev ?? loadProfile()), ...patch };
      saveProfile(next);
      return next;
    });
  };
  return [profile, update];
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function describeClasses(classes: ClassEntry[]): string {
  return classes
    .map((c) => `${c.course ? c.course + " " : ""}${c.building} ${c.days.map((d) => DAY[d]).join("/")} ${c.start}`)
    .join("; ");
}
