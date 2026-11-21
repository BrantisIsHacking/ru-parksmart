import "server-only";
// Multimodal schedule import: a screenshot of the student's class schedule in,
// structured classes out. The image is processed in memory and never stored.
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
          course: { type: "string", description: "Course code or short title, e.g. 01:198:111" },
          building: { type: "string", description: "Building name as written, expanded if abbreviated" },
          campus: {
            type: "string",
            enum: ["livingston", "busch", "college_ave", "cook_douglass", "unknown"],
          },
          days: {
            type: "array",
            items: { type: "integer", minimum: 0, maximum: 6 },
            description: "Meeting days, 0=Sunday ... 6=Saturday",
          },
          start: { type: "string", description: 'Start time, 24-hour "HH:MM"' },
        },
        required: ["building", "campus", "days", "start"],
      },
    },
    unreadable: { type: "boolean", description: "True if the image is not a class schedule or cannot be read" },
  },
  required: ["classes", "unreadable"],
};

const PROMPT = `Extract every in-person class meeting from this Rutgers class schedule screenshot.
- One entry per distinct (building, start time) pair; merge days that share them.
- Rutgers building abbreviations: TIL = Tillett Hall, LSH = Lucy Stone Hall, BE/BECK = Beck Hall, LSC = Livingston Student Center, ${BUILDINGS.map((b) => b.name).join(", ")} are on Livingston.
- Skip online/asynchronous sections and anything without a time.
- Do NOT include instructor names, student names, ID numbers, or grades.
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
    classes?: (Omit<ClassEntry, "campus"> & { campus: string })[];
    unreadable?: boolean;
  };
  const classes = (parsed.classes ?? [])
    .filter((c) => /^\d{1,2}:\d{2}$/.test(c.start) && Array.isArray(c.days) && c.days.length)
    .map((c) => ({
      course: c.course,
      building: c.building,
      campus: c.campus === "unknown" ? null : (c.campus as ClassEntry["campus"]),
      days: [...new Set(c.days.filter((d) => d >= 0 && d <= 6))].sort(),
      start: c.start.padStart(5, "0"),
    }));
  return { classes, unreadable: !!parsed.unreadable };
}
