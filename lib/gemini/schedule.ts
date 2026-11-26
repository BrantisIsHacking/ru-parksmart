import "server-only";
// Multimodal schedule import: a screenshot of the student's class schedule in,
// structured classes out. The image is processed in memory and never stored.
import { resolveClassBuilding, splitLocation } from "../classes";
import { BUILDINGS } from "../data";
import type { ClassEntry } from "../types";
import { gemini, GEMINI_MODEL } from "./client";

const SCHEMA = {
  type: "object",
  properties: {
    classes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          course: { type: "string", description: "Course title as shown, e.g. LINEAR OPTIMIZATION" },
          courseNumber: { type: "string", description: "Rutgers course number school:subject:course, e.g. 01:640:354" },
          section: { type: "string", description: "Section number, e.g. 01" },
          location: { type: "string", description: "Room exactly as written: building code + room, e.g. BE-AUD, TIL-254, ARC-103" },
          campus: {
            type: "string",
            enum: ["livingston", "busch", "college_ave", "cook_douglass", "unknown"],
            description: "Campus written on the schedule (Livingston, Busch, College Avenue, Cook/Douglass)",
          },
          days: {
            type: "array",
            items: { type: "integer", minimum: 0, maximum: 6 },
            description: "Meeting days, 0=Sunday ... 6=Saturday",
          },
          start: { type: "string", description: 'Start time, 24-hour "HH:MM"' },
          end: { type: "string", description: 'End time, 24-hour "HH:MM"' },
        },
        required: ["location", "campus", "days", "start"],
      },
    },
    unreadable: { type: "boolean", description: "True if the image is not a class schedule or cannot be read" },
  },
  required: ["classes", "unreadable"],
};

const PROMPT = `Extract every in-person class meeting from this Rutgers class schedule screenshot (WebReg / Course Schedule Planner).
- Each block shows a time range, the course title, the course number with section (e.g. 01:640:354:01 = course 01:640:354, section 01), a room (building code + room, e.g. BE-AUD or TIL-254) and the campus.
- One entry per distinct (course, location, start time); merge days that share them.
- Copy the room exactly as written; the app looks building codes up in the official Rutgers campus map.
- Skip online/asynchronous sections and anything without a time.
- Do NOT include instructor names, student names, RUIDs, index numbers, or grades.
If the image is not a class schedule, return unreadable=true and an empty list.`;

export async function extractSchedule(imageBase64: string, mimeType: string): Promise<{ classes: ClassEntry[]; unreadable: boolean }> {
  const res = await gemini().models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { data: imageBase64, mimeType } }, { text: PROMPT }],
      },
    ],
    config: { temperature: 0, responseMimeType: "application/json", responseJsonSchema: SCHEMA },
  });
  const parsed = JSON.parse(res.text ?? "{}") as {
    classes?: {
      course?: string;
      courseNumber?: string;
      section?: string;
      location?: string;
      campus?: string;
      days?: number[];
      start?: string;
      end?: string;
    }[];
    unreadable?: boolean;
  };
  const hhmm = (t?: string) => (t && /^d{1,2}:d{2}$/.test(t) ? t.padStart(5, "0") : null);
  const classes = (parsed.classes ?? [])
    .filter((c) => hhmm(c.start) && Array.isArray(c.days) && c.days.length && c.location)
    .map((c) => {
      const loc = splitLocation(c.location!);
      const entry: ClassEntry = {
        course: c.course?.trim() || undefined,
        courseNumber: c.courseNumber?.trim() || undefined,
        section: c.section?.trim() || undefined,
        building: c.location!.trim(),
        buildingCode: loc.code ?? null,
        room: loc.room ?? null,
        campus: c.campus && c.campus !== "unknown" ? (c.campus as ClassEntry["campus"]) : null,
        days: [...new Set(c.days!.filter((d) => d >= 0 && d <= 6))].sort(),
        start: hhmm(c.start)!,
        end: hhmm(c.end),
      };
      // "BE-AUD" + Livingston → Beck Hall (b4145). Unresolved entries keep the raw text for the student to fix.
      return resolveClassBuilding(entry, BUILDINGS);
    });
  return { classes, unreadable: !!parsed.unreadable };
}
