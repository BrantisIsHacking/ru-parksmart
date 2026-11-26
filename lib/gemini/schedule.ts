import "server-only";
// Multimodal schedule import: a screenshot of the student's class schedule in,
// structured classes out. The image is processed in memory and never stored.
import { SCHEDULE_CODES } from "../classes";
import { BUILDINGS } from "../data";
import { parseScheduleClasses, type RawScheduleClass } from "../scheduleParse";
import type { ClassEntry } from "../types";
import { gemini, GEMINI_MODEL } from "./client";

export const SCHEMA = {
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
          unsure: {
            type: "array",
            items: { type: "string", enum: ["course", "location", "days", "start", "end"] },
            description: "Fields you could not read with confidence (small, blurry, cut off or ambiguous text). Empty if all clear.",
          },
        },
        required: ["location", "campus", "days", "start"],
      },
    },
    unreadable: { type: "boolean", description: "True if the image is not a class schedule or cannot be read" },
  },
  required: ["classes", "unreadable"],
};

export const PROMPT = `Extract every in-person class meeting from this Rutgers class schedule screenshot (WebReg / Course Schedule Planner).
- Each block shows a time range, the course title, the course number with section (e.g. 01:640:354:01 = course 01:640:354, section 01), a room (building code + room, e.g. BE-AUD or TIL-254) and the campus.
- One entry per distinct (course, location, start time); merge days that share them.
- Copy the room exactly as written; the app looks building codes up in the official Rutgers campus map.
- Every New Brunswick class meets in one of these building codes: ${Object.keys(SCHEDULE_CODES).join(", ")}. If what you read isn't one of them, re-read it; if it still doesn't match, keep your reading and add "location" to "unsure".
- Screenshots are often small: if any character of a room, time or day is hard to read, give your best reading AND list that field in "unsure". The student will be asked to check it. Never silently guess.
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
  const parsed = JSON.parse(res.text ?? "{}") as { classes?: RawScheduleClass[]; unreadable?: boolean };
  const classes = parseScheduleClasses(parsed.classes, BUILDINGS);
  if (!classes.length && parsed.classes?.length) {
    // The model read classes but none survived validation: worth seeing in the server log.
    console.warn(`[schedule] model returned ${parsed.classes.length} classes, none valid. First: ${JSON.stringify(parsed.classes[0])}`);
  }
  return { classes, unreadable: !!parsed.unreadable && !classes.length };
}
