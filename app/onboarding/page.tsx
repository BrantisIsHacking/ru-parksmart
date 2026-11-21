"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/identity";
import { clearProfile, useProfile } from "@/lib/client/profile";
import rules from "@/data/rules.v2026-fall.json";
import type { ClassEntry } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMPTY_CLASS: ClassEntry = { building: "", days: [], start: "" };

/** Downscale to keep uploads small; output JPEG base64 without the data: prefix. */
async function toJpegBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

export default function Onboarding() {
  const [profile, update] = useProfile();
  const [permitId, setPermitId] = useState("");
  const [commute, setCommute] = useState("");
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setPermitId(profile.permitId ?? "");
    setCommute(profile.commuteMin ? String(profile.commuteMin) : "");
    setClasses(profile.classes);
  }, [profile]);

  const importSchedule = async (file: File) => {
    setImporting(true);
    setMsg(null);
    try {
      const imageBase64 = await toJpegBase64(file);
      const res = await api<{ classes: ClassEntry[]; unreadable: boolean }>("/api/schedule", { imageBase64, mimeType: "image/jpeg" });
      if (res.unreadable || !res.classes.length) {
        setMsg("That image doesn't look like a class schedule. Try a clearer screenshot, or add classes by hand below.");
      } else {
        setClasses(res.classes);
        setMsg(`Found ${res.classes.length} class meeting${res.classes.length === 1 ? "" : "s"}. Check the buildings and times below.`);
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const setClass = (i: number, patch: Partial<ClassEntry>) =>
    setClasses((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const save = () => {
    const valid = classes.filter((c) => c.building.trim() && c.days.length && /^\d{2}:\d{2}$/.test(c.start));
    update({ permitId, commuteMin: Number(commute) || null, classes: valid });
    window.location.href = "/";
  };

  const permitLabel = rules.permits.find((p) => p.id === permitId)?.label;

  return (
    <div className="space-y-7">
      <div className="space-y-1">
        <h1 className="text-[27px] font-extrabold leading-tight">Your commute</h1>
        <p className="text-muted">Three things, and the plan screen does the rest.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-[21px] font-bold">Permit</h2>
        <div className="flex items-center gap-4">
          {/* A hang tag showing the chosen permit. */}
          <div className="relative grid h-24 w-16 flex-none place-items-end rounded-[8px] bg-scarlet px-1.5 pb-2 text-center text-[11px] font-bold leading-tight text-white" aria-hidden>
            <span className="absolute top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-concrete" />
            {permitLabel ?? "No permit set"}
          </div>
          <label className="block flex-1 space-y-1.5">
            <span className="text-[15px] font-semibold">Which permit do you have?</span>
            <select className="field" value={permitId} onChange={(e) => setPermitId(e.target.value)}>
              <option value="" disabled>Choose your permit</option>
              {rules.permits.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-[21px] font-bold">Drive time</h2>
        <label className="block space-y-1.5">
          <span className="text-[15px] font-semibold">How many minutes is your usual drive to campus?</span>
          <input className="field max-w-40 tabular-nums" inputMode="numeric" value={commute} onChange={(e) => setCommute(e.target.value.replace(/\D/g, ""))} placeholder="25" />
        </label>
        <p className="text-[13px] text-muted">Optional. With it, the plan screen tells you when to leave home.</p>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-[21px] font-bold">Classes</h2>
          <p className="text-[15px] text-muted">
            Upload a screenshot of your schedule and Gemini reads the buildings and start times. The image isn&apos;t saved, and your classes stay on this phone.
          </p>
        </div>
        <label className={`btn btn-primary w-full cursor-pointer ${importing ? "opacity-60" : ""}`}>
          {importing ? "Reading your schedule…" : "Upload a schedule screenshot"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={importing}
            onChange={(e) => e.target.files?.[0] && importSchedule(e.target.files[0])}
          />
        </label>
        {msg && <p className="text-[15px]">{msg}</p>}

        {classes.length > 0 && (
          <ul className="panel">
            {classes.map((c, i) => (
              <li key={i} className="space-y-2.5 border-t border-line p-3 first:border-t-0">
                <div className="grid grid-cols-[1fr_9rem] gap-2">
                  <input className="field" placeholder="Building" value={c.building} onChange={(e) => setClass(i, { building: e.target.value })} aria-label="Building" />
                  <input className="field tabular-nums" type="time" value={c.start} onChange={(e) => setClass(i, { start: e.target.value })} aria-label="Start time" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {DAYS.map((d, n) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={c.days.includes(n)}
                      className={`min-h-9 rounded-[6px] px-2.5 text-[13px] font-bold ${c.days.includes(n) ? "bg-asphalt text-on-sign" : "border-[1.5px] border-line text-muted"}`}
                      onClick={() => setClass(i, { days: c.days.includes(n) ? c.days.filter((x) => x !== n) : [...c.days, n].sort() })}
                    >
                      {d}
                    </button>
                  ))}
                  <button type="button" className="ml-auto text-[13px] font-semibold text-muted underline" onClick={() => setClasses((cs) => cs.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="link text-[15px]" onClick={() => setClasses((cs) => [...cs, { ...EMPTY_CLASS }])}>
          Add a class by hand
        </button>
      </section>

      <div className="space-y-3 border-t border-line pt-5">
        <button className="btn btn-primary w-full" disabled={!permitId} onClick={save}>
          Save and see my plan
        </button>
        {!permitId && <p className="text-[13px] text-muted">Choose a permit to continue.</p>}
        <p className="text-[13px] text-muted">
          ParkSmart doesn&apos;t track your location or ask for your name or student ID.{" "}
          <a href="/privacy" className="link">How your data is handled</a>
        </p>
        <button
          className="text-[13px] font-semibold text-muted underline"
          onClick={() => {
            clearProfile();
            window.location.reload();
          }}
        >
          Erase my data on this phone
        </button>
      </div>
    </div>
  );
}
