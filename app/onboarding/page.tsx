"use client";
import { useEffect, useState } from "react";
import { ClassEditor, EMPTY_CLASS } from "@/components/ClassEditor";
import { useBuildings } from "@/lib/client/buildings";
import { resolveClassBuilding } from "@/lib/classes";
import { api } from "@/lib/client/identity";
import { clearProfile, useProfile } from "@/lib/client/profile";
import rules from "@/data/rules.v2026-fall.json";
import type { ClassEntry } from "@/lib/types";

type PermitRow = { id: string; label: string; kind?: string };
const PERMITS = rules.permits as PermitRow[];
/**
 * Residents whose assigned lot depends on a second choice: College Ave residents buy a
 * Livingston or Busch option; Cook/Douglass residents are assigned by residence hall.
 */
const RESIDENT_CHOICES = [
  {
    key: "choose:college-ave",
    label: "College Ave resident",
    question: "Which parking option did you buy?",
    items: [
      { id: "resident-college-ave-livingston", label: "Livingston option" },
      { id: "resident-college-ave-busch", label: "Busch option" },
    ],
  },
  {
    key: "choose:cook-douglass",
    label: "Cook/Douglass resident",
    question: "Which residence hall do you live in?",
    items: PERMITS.filter((p) => /^resident-(cook|douglass)-/.test(p.id)).map((p) => ({ id: p.id, label: p.label.split(": ")[1] ?? p.label })),
  },
];
const choiceFor = (permit: string) => RESIDENT_CHOICES.find((c) => c.items.some((i) => i.id === permit));
const PRIMARY_GROUPS = [
  { label: "Commuter", items: PERMITS.filter((p) => p.id.startsWith("commuter-")) },
  {
    label: "Resident",
    items: [
      ...PERMITS.filter((p) => p.id === "resident-livingston" || p.id === "resident-busch"),
      ...RESIDENT_CHOICES.map((c) => ({ id: c.key, label: c.label })),
    ],
  },
  { label: "Other", items: PERMITS.filter((p) => p.kind === "other") },
];
/** Drive-time planning and secondary permits apply to commuter permits. */
const drivesIn = (primary: string) => primary.startsWith("commuter-");
const SECONDARIES = PERMITS.filter((p) => p.kind === "secondary");
/** "commuter-busch" ↔ "secondary-busch": you can't add a secondary for your own campus. */
const campusOf = (id: string) => id.replace(/^(commuter|secondary|resident)-/, "");
/** Secondary permits go with a commuter primary (DOTS sells them as an add-on). */
const takesSecondary = (primary: string) => primary.startsWith("commuter-");

function AnimatedPresence({ show, children }: { show: boolean; children: React.ReactNode }) {
  const [rendered, setRendered] = useState(show);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (show) {
      setRendered(true);
      setLeaving(false);
    } else if (rendered) {
      setLeaving(true);
    }
  }, [show, rendered]);

  if (!rendered) return null;

  return (
    <div
      className={`form-presence${leaving ? " is-leaving" : ""}`}
      onAnimationEnd={(event) => {
        if (!show && event.target === event.currentTarget) setRendered(false);
      }}
    >
      <div>{children}</div>
    </div>
  );
}

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
  /** What the permit menu shows: a permit id, or a RESIDENT_CHOICES key that needs a second pick. */
  const [choice, setChoice] = useState("");
  const [resident, setResident] = useState("");
  const pending = RESIDENT_CHOICES.find((c) => c.key === choice);
  const primary = pending ? resident : choice;
  const [secondary, setSecondary] = useState("");
  const permitId = primary && secondary && takesSecondary(primary) ? `${primary}+${secondary}` : primary;
  const [commute, setCommute] = useState("");
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { buildings } = useBuildings();

  // Classes saved before buildings were resolved (or typed as a name) get matched once the list loads.
  useEffect(() => {
    if (!buildings.length) return;
    setClasses((cs) => (cs.some((c) => !c.buildingId && c.building.trim()) ? cs.map((c) => (c.buildingId || !c.building.trim() ? c : resolveClassBuilding(c, buildings))) : cs));
  }, [buildings]);

  useEffect(() => {
    if (!profile) return;
    const [p = "", sec = ""] = (profile.permitId ?? "").split("+");
    const group = choiceFor(p);
    setChoice(group ? group.key : p);
    setResident(group ? p : "");
    setSecondary(sec);
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
        const unresolved = res.classes.filter((c) => !c.buildingId).length;
        setMsg(
          `Found ${res.classes.length} class meeting${res.classes.length === 1 ? "" : "s"}. ` +
            (unresolved ? `Pick the building for the ${unresolved} marked in red, then check the times.` : "Check the buildings and times below."),
        );
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const save = () => {
    const valid = classes.filter((c) => c.building.trim() && c.days.length && /^\d{2}:\d{2}$/.test(c.start));
    // A resident's leftover drive time would otherwise show a "Leave by" time they don't need.
    update({ permitId, commuteMin: drivesIn(primary) ? Number(commute) || null : null, classes: valid });
    window.location.href = "/";
  };

  // The hang tag is small: show "Cook/Douglass resident", not the residence hall.
  const permitLabel = pending
    ? pending.label
    : [primary, takesSecondary(primary) ? secondary : ""]
        .filter(Boolean)
        .map((id) => PERMITS.find((p) => p.id === id)?.label)
        .filter(Boolean)
        .join(" + ");

  return (
    <div className="onboarding space-y-7">
      <div className="onboarding-step space-y-1" style={{ animationDelay: "0ms" }}>
        <h1 className="text-[27px] font-extrabold leading-tight">Your commute</h1>
        <p className="text-muted">Three things, and the plan screen does the rest.</p>
      </div>

      <section className="onboarding-step space-y-4" style={{ animationDelay: "70ms" }}>
        <h2 className="text-[21px] font-bold">Permit</h2>
        <div className="flex items-center gap-4">
          {/* A hang tag showing the chosen permit. */}
          <div className="permit-tag relative flex h-32 w-20 flex-none flex-col items-center justify-end overflow-hidden rounded-[8px] bg-scarlet px-2 pb-3 pt-8 text-center text-[11px] font-bold leading-tight text-white" aria-hidden>
            <span className="absolute top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-concrete" />
            <span className="w-full break-words">{permitLabel || "No permit set"}</span>
          </div>
          <div className="flex-1 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-[15px] font-semibold">Which permit do you have?</span>
              <select
                className="field"
                value={choice}
                onChange={(e) => {
                  setChoice(e.target.value);
                  setResident("");
                  if (campusOf(e.target.value) === campusOf(secondary)) setSecondary("");
                }}
              >
                <option value="" disabled>Choose your permit</option>
                {PRIMARY_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.items.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {permitLabel && <p className="permit-summary text-[13px] font-semibold text-muted">Selected: {permitLabel}</p>}
            {pending && (
              <label className="block space-y-1.5">
                <span className="text-[15px] font-semibold">{pending.question}</span>
                <select className="field" value={resident} onChange={(e) => setResident(e.target.value)}>
                  <option value="" disabled>Choose one</option>
                  {pending.items.map((i) => (
                    <option key={i.id} value={i.id}>{i.label}</option>
                  ))}
                </select>
                <span className="block text-[13px] text-muted">
                  Your assigned lot is yours any time. From 5 PM to 12 AM on weekdays (and 6 AM to 12 AM on weekends) you can also use any student commuter lot.
                </span>
              </label>
            )}
            <AnimatedPresence show={takesSecondary(primary)}>
              <label className="block space-y-1.5">
                <span className="text-[15px] font-semibold">Secondary permit (optional)</span>
                <select className="field" value={secondary} onChange={(e) => setSecondary(e.target.value)}>
                  <option value="">None</option>
                  {SECONDARIES.filter((p) => campusOf(p.id) !== campusOf(primary)).map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <span className="block text-[13px] text-muted">A secondary lets you park on another campus 10 AM – 12 AM on weekdays. College Ave has no secondary.</span>
              </label>
            </AnimatedPresence>
          </div>
        </div>
      </section>

      <AnimatedPresence show={drivesIn(primary)}>
        <section className="onboarding-step space-y-4" style={{ animationDelay: "140ms" }}>
          <h2 className="text-[21px] font-bold">Drive time</h2>
          <label className="block">
            <span className="block text-[15px] font-semibold">How many minutes is your usual drive to campus?</span>
            <input className="field mt-3 max-w-40 tabular-nums" inputMode="numeric" value={commute} onChange={(e) => setCommute(e.target.value.replace(/\D/g, ""))} placeholder="25" />
          </label>
          <p className="text-[13px] text-muted">Optional. With it, the plan screen tells you when to leave home.</p>
        </section>
      </AnimatedPresence>

      <section className="onboarding-step space-y-3" style={{ animationDelay: "210ms" }}>
        <div className="space-y-1">
          <h2 className="text-[21px] font-bold">Classes</h2>
          <p className="text-[15px] text-muted">
            Upload a screenshot of your schedule and Gemini reads each class&apos;s room, campus and times, so the plan screen can find parking near the right building. Or add classes by hand. The image isn&apos;t saved, and your classes stay on this phone.
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

        <ClassEditor classes={classes} onChange={setClasses} buildings={buildings} />
        <button type="button" className="btn btn-quiet w-full" onClick={() => setClasses((cs) => [...cs, { ...EMPTY_CLASS }])}>
          + Add a class by hand
        </button>
      </section>

      <div className="onboarding-step space-y-3 border-t border-line pt-5" style={{ animationDelay: "280ms" }}>
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
