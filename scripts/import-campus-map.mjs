// Imports New Brunswick buildings, lot outlines and bus stops.
//   Buildings + lot outlines: the Rutgers campus map feed behind maps.rutgers.edu.
//   Bus stops: OpenStreetMap (Overpass), since the campus map feed has none.
// Run after scripts/import-dots.mjs:  node scripts/import-campus-map.mjs
// Writes data/buildings.json, data/busStops.json, public/geo/buildings.geojson,
// public/geo/lots.geojson, and refines lot coordinates in data/lots.json.
import { mkdir, readFile, writeFile } from "node:fs/promises";

const UA = { "User-Agent": "ru-parksmart-import" };
const MAP = "https://maps.rutgers.edu";
const SYNC = "https://storage.googleapis.com/rutgers-campus-map-prod-public-sync";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
// New Brunswick / Piscataway campuses.
const BBOX = [40.465, -74.48, 40.535, -74.42];
/** A building farther than this from every pilot lot is off the NB campuses (extension sites, etc.). */
const MAX_FROM_LOT_M = 1200;
const MATCH_LOT_M = 900;

const data = new URL("../data/", import.meta.url);
const geoDir = new URL("../public/geo/", import.meta.url);

const getJson = async (url) => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
};

function meters(a, b) {
  const R = 6_371_000;
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const round = (n) => Math.round(n * 1e6) / 1e6;
const roundCoords = (c) => (typeof c[0] === "number" ? [round(c[0]), round(c[1])] : c.map(roundCoords));
const inBox = ({ lat, lng }) => lat >= BBOX[0] && lat <= BBOX[2] && lng >= BBOX[1] && lng <= BBOX[3];
const lotKey = (name) => /\bLot\s+(\d+[A-Za-z]?)\b/i.exec(name)?.[1].toUpperCase() ?? name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---- Rutgers campus map feed ----
const { syncId } = await getJson(`${MAP}/api/syncId`);
const base = `${SYNC}/${encodeURIComponent(syncId)}`;
const [search, layer] = await Promise.all([getJson(`${base}/search.json`), getJson(`${base}/buildings-parking-layer.json`)]);
const info = new Map(search.map((s) => [String(s.id), s]));

const lotsFile = JSON.parse(await readFile(new URL("lots.json", data), "utf8"));
const lots = lotsFile.lots;
const nearestLot = (p, pool = lots.filter((l) => !l.coordsApprox)) => {
  let best = null;
  for (const l of pool) {
    const d = meters(p, l.center);
    if (!best || d < best.d) best = { lot: l, d };
  }
  return best;
};

const buildings = [];
const buildingFeatures = [];
const lotFeatures = [];
const matched = new Set();

for (const f of layer.features) {
  const p = f.properties ?? {};
  const meta = info.get(String(p.id ?? f.id));
  const center = { lat: p.lat, lng: p.lng };
  if (!meta || meta.campus !== "NB" || !Number.isFinite(center.lat) || !inBox(center)) continue;
  const geometry = { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) };

  if (p.category === "parking") {
    // Match to a catalog lot by lot number, then distance (lot numbers repeat across campuses).
    const key = lotKey(p.name);
    const candidates = lots.filter((l) => l.id.split("-").slice(1).join("-") === key);
    const hit = candidates.map((l) => ({ l, d: meters(center, l.center) })).sort((a, b) => a.d - b.d)[0];
    const lot = hit && (hit.d <= MATCH_LOT_M || hit.l.coordsApprox) ? hit.l : null;
    if (lot && !matched.has(lot.id)) {
      matched.add(lot.id);
      if (lot.coordsApprox) {
        lot.center = { lat: round(center.lat), lng: round(center.lng) };
        delete lot.coordsApprox;
        lot.coordsRefined = true;
      }
    }
    lotFeatures.push({ type: "Feature", properties: { name: p.name, lotId: lot?.id ?? null }, geometry });
    continue;
  }

  const near = nearestLot(center);
  if (!near || near.d > MAX_FROM_LOT_M || /bus shelter/i.test(p.name)) continue;
  const code = (meta.abbr ?? "").trim().toUpperCase() || undefined;
  const aliases = [
    ...(meta.aliases ?? "").split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean),
    ...(code ? [code.toLowerCase()] : []),
  ];
  const b = { id: `b${p.id ?? f.id}`, name: p.name.trim(), ...(code ? { code } : {}), ...(meta.address ? { address: meta.address.trim() } : {}), campus: near.lot.campus, center: { lat: round(center.lat), lng: round(center.lng) }, aliases };
  buildings.push(b);
  buildingFeatures.push({ type: "Feature", properties: { id: b.id, name: b.name, code: code ?? null, campus: b.campus, address: b.address ?? null, aliases: b.aliases, lat: b.center.lat, lng: b.center.lng }, geometry });
}

// ---- OpenStreetMap bus stops ----
const q = `[out:json][timeout:60];(node["highway"="bus_stop"](${BBOX.join(",")});node["public_transport"="platform"](${BBOX.join(",")}););out body;`;
// Public Overpass servers time out under load: try each server twice, then keep the stops we already have.
async function overpass() {
  for (const server of OVERPASS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(server, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(q)}` });
        if (res.ok) return await res.json();
        console.warn(`${server}: HTTP ${res.status}`);
      } catch (e) {
        console.warn(`${server}: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return null;
}
const osm = await overpass();
let stops = {};
if (osm) {
  for (const e of osm.elements) {
    const name = e.tags?.name;
    if (!name) continue;
    (stops[name] ??= []).push({ lat: round(e.lat), lng: round(e.lon) });
  }
} else {
  console.warn("Overpass unavailable: keeping the existing data/busStops.json.");
  stops = JSON.parse(await readFile(new URL("busStops.json", data), "utf8")).stops;
}

// ---- write ----
const today = new Date().toISOString().slice(0, 10);
buildings.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(
  new URL("buildings.json", data),
  JSON.stringify({ _note: `Generated ${today} by scripts/import-campus-map.mjs from the Rutgers campus map (maps.rutgers.edu, sync ${syncId}). Campus = campus of the nearest pilot lot.`, buildings }, null, 1) + "\n",
);
await writeFile(
  new URL("busStops.json", data),
  JSON.stringify({ _note: `Generated ${today} from OpenStreetMap (© OpenStreetMap contributors, ODbL). A name can have several points (one per direction).`, stops }, null, 1) + "\n",
);
delete lotsFile.buildings;
await writeFile(new URL("lots.json", data), JSON.stringify(lotsFile, null, 2) + "\n");
await mkdir(geoDir, { recursive: true });
await writeFile(new URL("buildings.geojson", geoDir), JSON.stringify({ type: "FeatureCollection", features: buildingFeatures }));
await writeFile(new URL("lots.geojson", geoDir), JSON.stringify({ type: "FeatureCollection", features: lotFeatures }));

const byCampus = {};
for (const b of buildings) byCampus[b.campus] = (byCampus[b.campus] ?? 0) + 1;
console.log(`buildings: ${buildings.length}`, byCampus, `with codes: ${buildings.filter((b) => b.code).length}`);
console.log(`lot outlines: ${lotFeatures.length}, matched to pilot lots: ${matched.size}/${lots.length}`);
console.log("unmatched pilot lots:", lots.filter((l) => !matched.has(l.id)).map((l) => l.id).join(", ") || "none");
console.log("still approximate:", lots.filter((l) => l.coordsApprox).map((l) => l.id).join(", ") || "none");
console.log(`bus stop names: ${Object.keys(stops).length}`);
