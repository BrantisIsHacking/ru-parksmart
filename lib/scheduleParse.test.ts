// Regression test with real Gemini output for a WebReg weekly schedule screenshot.
// (A bad regex once rejected every class here, so imports always said "not a schedule".)
import { describe, expect, it } from "vitest";
import { BUILDINGS } from "./data";
import { parseScheduleClasses, toHHMM, type RawScheduleClass } from "./scheduleParse";

const MODEL_OUTPUT: RawScheduleClass[] = [
  { course: "DATA MGMT FOR DATASC", courseNumber: "01:198:210:03", section: "03", location: "SEC-118", campus: "busch", days: [2], start: "08:30", end: "09:50" },
  { course: "DATA MGMT FOR DATASC", courseNumber: "01:198:210:03", section: "03", location: "SEC-118", campus: "busch", days: [5], start: "08:30", end: "09:50" },
  { course: "INTRO COMP STAT", courseNumber: "01:960:380", section: "M1", location: "LWH-B209", campus: "livingston", days: [3], start: "08:30", end: "11:30" },
  { course: "LINEAR OPTIMIZATION", courseNumber: "01:640:354", section: "01", location: "BE-252", campus: "livingston", days: [2], start: "10:20", end: "11:40" },
  { course: "LINEAR OPTIMIZATION", courseNumber: "01:640:354", section: "01", location: "BE-252", campus: "livingston", days: [5], start: "10:20", end: "11:40" },
  { course: "MATH THEORY PROB", courseNumber: "01:640:477", section: "05", location: "TIL-254", campus: "livingston", days: [2], start: "12:10", end: "13:30" },
  { course: "MATH THEORY PROB", courseNumber: "01:640:477", section: "05", location: "TIL-254", campus: "livingston", days: [5], start: "12:10", end: "13:30" },
  { course: "GENERAL PHYSICS LAB", courseNumber: "01:750:205", section: "08", location: "SERC-213", campus: "busch", days: [3], start: "12:10", end: "15:10" },
  { course: "GENERAL PHYSICS", courseNumber: "01:750:203", section: "26", location: "SEC-218", campus: "busch", days: [2], start: "14:00", end: "15:20" },
  { course: "DATA MGMT FOR DATASC", courseNumber: "01:198:210:03", section: "03", location: "SEC-118", campus: "busch", days: [4], start: "14:15", end: "15:10" },
];

describe("parseScheduleClasses", () => {
  const classes = parseScheduleClasses(MODEL_OUTPUT, BUILDINGS);

  it("keeps every class and merges days of the same meeting", () => {
    expect(classes).toHaveLength(7);
    const linear = classes.find((c) => c.course === "LINEAR OPTIMIZATION")!;
    expect(linear).toMatchObject({ days: [2, 5], start: "10:20", end: "11:40", courseNumber: "01:640:354", section: "01" });
  });

  it("splits the section out of a 4-part course number", () => {
    expect(classes.find((c) => c.course === "DATA MGMT FOR DATASC")).toMatchObject({ courseNumber: "01:198:210", section: "03" });
  });

  it("resolves rooms to campus-map buildings on the right campus", () => {
    const byCourse = (name: string) => classes.find((c) => c.course === name)!;
    expect(byCourse("MATH THEORY PROB")).toMatchObject({ building: "Tillett Hall", campus: "livingston", room: "254" });
    expect(byCourse("LINEAR OPTIMIZATION")).toMatchObject({ building: "Beck Hall", campus: "livingston", room: "252" });
    expect(byCourse("GENERAL PHYSICS")).toMatchObject({ buildingCode: "SEC", campus: "busch" });
    expect(byCourse("GENERAL PHYSICS").buildingId).toBeTruthy();
  });

  it("flags what the model wasn't sure about, and unmatched rooms", () => {
    const [c] = parseScheduleClasses(
      [{ course: "INTRO COMP STAT", location: "TIL-254", campus: "livingston", days: [3], start: "08:30", unsure: ["start", "days"] }],
      BUILDINGS,
    );
    expect(c.needsReview?.sort()).toEqual(["days", "time"]);
    const stat = classes.find((x) => x.course === "INTRO COMP STAT")!; // "LWH-B209" doesn't exist
    expect(stat.needsReview).toEqual(expect.arrayContaining(["building", "room"]));
    expect(classes.find((x) => x.course === "LINEAR OPTIMIZATION")!.needsReview).toBeUndefined();
  });

  it("drops rows without a usable time, room or day", () => {
    const bad: RawScheduleClass[] = [
      { location: "TIL-254", days: [1], start: "soon" },
      { start: "10:00", days: [1] },
      { location: "TIL-254", start: "10:00", days: [] },
    ];
    expect(parseScheduleClasses(bad, BUILDINGS)).toEqual([]);
  });
});

describe("toHHMM", () => {
  it.each([
    ["8:30", "08:30"],
    ["08:30", "08:30"],
    ["2:00 PM", "14:00"],
    ["12:10 pm", "12:10"],
    ["12:05 AM", "00:05"],
    ["noon", null],
  ])("%s → %s", (input, out) => {
    expect(toHHMM(input)).toBe(out);
  });
});
