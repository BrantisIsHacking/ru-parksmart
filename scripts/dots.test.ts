// The DOTS catalog decoder, on a tiny hand-built fixture shaped like data.json.
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { buildFromCatalog, decodeLots, parseLotName, PERMITS, windowsFromSchedule } from "./dots.mjs";

const b64 = (html: string) => Buffer.from(html).toString("base64");
const link = (name: string, lat: string, lng: string) => `<a href="https://maps.rutgers.edu/#/?lat=${lat}&lng=${lng}&sidebar=true">${name}</a>`;
const DAY = [{ start: "06:00", end: "24:00" }];
const FLEX = [{ start: "17:00", end: "24:00" }];

const entry = (schedule: { start: string; end: string }[][], comment = "") => ({
  schedule,
  lot_comments: comment,
  time_text_1: "",
  time_text_2: "",
});

function catalog() {
  const permits: Record<string, unknown> = {};
  for (const name of Object.keys(PERMITS)) {
    permits[name] = {};
  }
  permits["Livingston Commuter"] = {
    Livingston: {
      [b64(link("Lot 915/ Yellow Lot", "40.52778317", "-74.43817055"))]: entry(
        [DAY, DAY, DAY, DAY, DAY, DAY, DAY],
        "Secondary permit holders are allowed to park between the hours of 10am - 12am, Mon - Fri",
      ),
      [b64(link("Lot 107", "40.52399817", "-74.43129209") + ", " + link("Lot 916/Green Lot", "40.52623822", "-74.44019474"))]: entry([DAY, FLEX, FLEX, FLEX, FLEX, FLEX, DAY]),
    },
    Camden: { [b64(link("Lot C1", "39.949", "-75.12"))]: entry([[], [], [], [], [], [], []]) },
    Busch: { [b64(link("Lot 602", "40.53", "-74.46"))]: entry([DAY, FLEX, FLEX, FLEX, FLEX, FLEX, DAY]) },
  };
  return permits;
}

describe("DOTS catalog decoding", () => {
  it("decodes lot links and flags 2-decimal coordinates", () => {
    const [a, b] = decodeLots(b64(link("Lot 107", "40.52399817", "-74.43129209") + link("Lot 602", "40.53", "-74.46")));
    expect(a).toEqual({ name: "Lot 107", lat: 40.52399817, lng: -74.43129209, approx: false });
    expect(b.approx).toBe(true);
  });

  it("names lots", () => {
    expect(parseLotName("Lot 915/ Yellow Lot")).toEqual({ key: "915", name: "Lot 915 (Yellow Lot)" });
    expect(parseLotName("Gated Lot 16")).toEqual({ key: "16", name: "Gated Lot 16" });
    expect(parseLotName("Douglas Deck").key).toBe("DOUGLAS-DECK");
    expect(parseLotName("Lot 11 NB").name).toBe("Lot 11");
  });

  it("groups days that share a window", () => {
    expect(windowsFromSchedule([DAY, FLEX, FLEX, FLEX, FLEX, FLEX, DAY])).toEqual([
      { days: [0, 6], start: "06:00", end: "24:00" },
      { days: [1, 2, 3, 4, 5], start: "17:00", end: "24:00" },
    ]);
  });

  it("builds lots, primary, flex and secondary rules, and skips other cities", () => {
    const { lots, rules, permits } = buildFromCatalog(catalog());
    expect(lots.map((l: { id: string }) => l.id).sort()).toEqual(["BUS-602", "LIV-107", "LIV-915", "LIV-916"]);
    expect(lots.find((l: { id: string }) => l.id === "BUS-602").coordsApprox).toBe(true);
    const primary = rules.find((r: { lots: string[]; days: number[] }) => r.lots.includes("LIV-915") && r.days.length === 7);
    expect(primary).toMatchObject({ permits: ["commuter-livingston"], start: "06:00", end: "24:00" });
    const secondary = rules.find((r: { permits: string[] }) => r.permits[0] === "secondary-livingston");
    expect(secondary).toMatchObject({ lots: ["LIV-915"], days: [1, 2, 3, 4, 5], start: "10:00" });
    expect(permits.some((p: { id: string; kind: string }) => p.id === "secondary-livingston" && p.kind === "secondary")).toBe(true);
  });

  it("fails loudly when a permit disappears from the catalog", () => {
    const c = catalog();
    delete c["Busch Commuter"];
    expect(() => buildFromCatalog(c)).toThrow(/Busch Commuter/);
  });
});
