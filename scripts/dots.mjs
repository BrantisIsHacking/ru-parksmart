// Pure conversion from the DOTS permit catalog (https://wcip.ipo.rutgers.edu/data.json)
// into this app's lots + rules. No I/O here so it can be unit tested.
//
// Catalog shape: { [permitName]: { [campusName]: { [base64 lot-links HTML]: entry } } }
// entry.schedule is indexed Sunday..Saturday, each a list of { start, end }.

/** NB student permits we import, keyed by catalog name. */
export const PERMITS = {
  "College Avenue Commuter": { id: "commuter-college-ave", label: "College Ave commuter", kind: "primary" },
  "Busch Commuter": { id: "commuter-busch", label: "Busch commuter", kind: "primary" },
  "Livingston Commuter": { id: "commuter-livingston", label: "Livingston commuter", kind: "primary" },
  "Cook Commuter": { id: "commuter-cook", label: "Cook commuter", kind: "primary" },
  "Douglass Commuter": { id: "commuter-douglass", label: "Douglass commuter", kind: "primary" },
  // College Ave residents buy a Livingston or Busch option and get the same lots as those residents,
  // so each of these permits also covers a College Ave alias.
  "Livingston Resident /College Ave Resident": {
    id: "resident-livingston",
    label: "Livingston resident",
    kind: "primary",
    aliases: [{ id: "resident-college-ave-livingston", label: "College Ave resident (Livingston option)" }],
  },
  "Busch Resident/College Ave Resident": {
    id: "resident-busch",
    label: "Busch resident",
    kind: "primary",
    aliases: [{ id: "resident-college-ave-busch", label: "College Ave resident (Busch option)" }],
  },
  // Cook/Douglass resident permits are assigned by residence hall.
  "Cook - Helyar Resident": { id: "resident-cook-helyar", label: "Cook/Douglass resident: Helyar House", kind: "primary" },
  "Cook - Newell, Perry, Starkey, Voorhees Resident": { id: "resident-cook-newell", label: "Cook/Douglass resident: Newell, Perry, Starkey or Voorhees", kind: "primary" },
  "Douglass - Gibbons Resident": { id: "resident-douglass-gibbons", label: "Cook/Douglass resident: Gibbons", kind: "primary" },
  "Douglass - Henderson Resident": { id: "resident-douglass-henderson", label: "Cook/Douglass resident: Henderson", kind: "primary" },
  "Douglass - Jameson Resident": { id: "resident-douglass-jameson", label: "Cook/Douglass resident: Jameson", kind: "primary" },
  "Douglass - Kathleen W Ludwig Resident": { id: "resident-douglass-ludwig", label: "Cook/Douglass resident: Kathleen W. Ludwig", kind: "primary" },
  "Douglass - Katzenbach Resident": { id: "resident-douglass-katzenbach", label: "Cook/Douglass resident: Katzenbach", kind: "primary" },
  "Douglass - Lippincott Resident": { id: "resident-douglass-lippincott", label: "Cook/Douglass resident: Lippincott", kind: "primary" },
  "Douglass - Nicholas Resident": { id: "resident-douglass-nicholas", label: "Cook/Douglass resident: Nicholas", kind: "primary" },
  "Douglass - Willets Resident": { id: "resident-douglass-willets", label: "Cook/Douglass resident: Willets", kind: "primary" },
  "Douglass - Woodbury Resident": { id: "resident-douglass-woodbury", label: "Cook/Douglass resident: Woodbury", kind: "primary" },
};

/** Catalog campus name -> app campus, lot-id prefix and secondary permit (College Ave has none). */
export const CAMPUSES = {
  "College Ave": { campus: "college_ave", prefix: "CA", secondary: null },
  Busch: { campus: "busch", prefix: "BUS", secondary: { id: "secondary-busch", label: "Busch secondary" } },
  Livingston: { campus: "livingston", prefix: "LIV", secondary: { id: "secondary-livingston", label: "Livingston secondary" } },
  Cook: { campus: "cook_douglass", prefix: "COOK", secondary: { id: "secondary-cook", label: "Cook secondary" } },
  Douglass: { campus: "cook_douglass", prefix: "DOUG", secondary: { id: "secondary-douglass", label: "Douglass secondary" } },
};

const SECONDARY_RE = /secondary permit holders are allowed to park between the hours of 10\s*am\s*-\s*12\s*am,\s*mon\s*-\s*fri/i;

/** Decode one catalog key into [{ name, lat, lng, approx }]. */
export function decodeLots(key) {
  const html = Buffer.from(key, "base64").toString("utf8");
  const out = [];
  for (const m of html.matchAll(/lat=(-?[\d.]+)&(?:amp;)?lng=(-?[\d.]+)[^>]*>([^<]+)</g)) {
    const [lat, lng] = [m[1], m[2]];
    const decimals = Math.min((lat.split(".")[1] ?? "").length, (lng.split(".")[1] ?? "").length);
    out.push({ name: m[3].trim(), lat: Number(lat), lng: Number(lng), approx: decimals <= 2 });
  }
  return out;
}

const slug = (s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "Lot 915/ Yellow Lot" -> { key: "915", name: "Lot 915 (Yellow Lot)" }; "Douglas Deck" -> { key: "DOUGLAS-DECK" }. */
export function parseLotName(raw) {
  const clean = raw.replace(/\s+/g, " ").trim();
  const num = /\bLot\s+(\d+[A-Za-z]?)\b/i.exec(clean);
  const [head, ...rest] = clean.split("/").map((s) => s.trim());
  const name = rest.length ? `${head} (${rest.join(" / ")})` : head;
  return { key: num ? num[1].toUpperCase() : slug(clean), name: name.replace(/\s+NB$/, "") };
}

/** Group days that share identical windows: [{ days, start, end }]. */
export function windowsFromSchedule(schedule) {
  const byWindow = new Map();
  (schedule ?? []).forEach((day, weekday) => {
    for (const w of day ?? []) {
      const k = `${w.start}-${w.end}`;
      if (!byWindow.has(k)) byWindow.set(k, { days: [], start: w.start, end: w.end });
      byWindow.get(k).days.push(weekday);
    }
  });
  return [...byWindow.values()];
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function describeDays(days) {
  const s = days.join(",");
  if (s === "0,1,2,3,4,5,6") return "every day";
  if (s === "1,2,3,4,5") return "Mon–Fri";
  if (s === "0,6") return "Sat–Sun";
  return days.map((d) => DAY[d]).join(", ");
}
const clock = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === 24 || h === 0) return "12 AM";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * Build lots + rules from the catalog.
 * @param catalog parsed data.json
 * @param previousLots existing lots (capacity is kept when the id matches)
 */
export function buildFromCatalog(catalog, previousLots = []) {
  const prevCap = new Map(previousLots.map((l) => [l.id, l.capacity]));
  const lots = new Map();
  const rules = [];
  const secondaries = new Map();

  for (const [catalogName, permit] of Object.entries(PERMITS)) {
    const campuses = catalog[catalogName];
    if (!campuses) throw new Error(`Catalog is missing permit "${catalogName}"`);
    for (const [campusName, entries] of Object.entries(campuses)) {
      const campus = CAMPUSES[campusName];
      if (!campus) continue; // Newark, Camden, …
      let n = 0;
      for (const [key, entry] of Object.entries(entries)) {
        const ids = [];
        for (const raw of decodeLots(key)) {
          const { key: lotKey, name } = parseLotName(raw.name);
          const id = `${campus.prefix}-${lotKey}`;
          if (!lots.has(id)) {
            const deck = /deck/i.test(name);
            lots.set(id, {
              id,
              name,
              campus: campus.campus,
              center: { lat: raw.lat, lng: raw.lng },
              capacity: prevCap.get(id) ?? (deck ? 800 : 200),
              verified: true,
              ...(raw.approx ? { coordsApprox: true } : {}),
            });
          }
          ids.push(id);
        }
        if (!ids.length) continue;
        const times = [entry.time_text_1, entry.time_text_2].filter(Boolean).join("; ");
        for (const w of windowsFromSchedule(entry.schedule)) {
          rules.push({
            id: `${permit.id}-${campus.prefix.toLowerCase()}-${++n}`,
            lots: ids,
            permits: [permit.id, ...(permit.aliases ?? []).map((a) => a.id)],
            days: w.days,
            start: w.start,
            end: w.end,
            note: `${permit.label} permit, ${campusName} lots: ${times || `${describeDays(w.days)} ${clock(w.start)} – ${clock(w.end)}`}.`,
            verified: false,
          });
        }
        if (campus.secondary && SECONDARY_RE.test(entry.lot_comments ?? "")) {
          const sec = campus.secondary;
          secondaries.set(sec.id, sec);
          if (!rules.some((r) => r.permits[0] === sec.id)) {
            rules.push({
              id: `${sec.id}-1`,
              lots: ids,
              permits: [sec.id],
              days: [1, 2, 3, 4, 5],
              start: "10:00",
              end: "24:00",
              note: `${sec.label} permit, ${campusName} lots: Mon–Fri 10 AM – 12 AM.`,
              verified: false,
            });
          }
        }
      }
    }
  }

  const permits = [
    ...Object.values(PERMITS).flatMap(({ id, label, kind, aliases = [] }) => [{ id, label, kind }, ...aliases.map((a) => ({ id: a.id, label: a.label, kind }))]),
    ...[...secondaries.values()].map(({ id, label }) => ({ id, label, kind: "secondary" })),
  ];
  return { lots: [...lots.values()], rules, permits };
}
