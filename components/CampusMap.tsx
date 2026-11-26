"use client";
// Client-only (Leaflet touches `window`): load through MapView, which uses next/dynamic with ssr: false.
// Full-screen campus map: lot outlines painted by status, building outlines, bus stops,
// and the planned route. Taps on a lot, a building or empty ground are reported up.
import "leaflet/dist/leaflet.css";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { STATUS_HEX } from "@/lib/client/format";
import type { LatLng, LotStatus } from "@/lib/types";
import type { ClassMark, MapLotRow, MapRoute, MapSelection, MapFocus } from "./mapTypes";

// With NEXT_PUBLIC_CARTO_KEY set, CARTO's light basemap (OpenStreetMap data, labels drawn
// above our shapes) keeps buildings and lots readable. Without a key, CARTO shows an
// "API key required" watermark, so fall back to the standard OpenStreetMap tiles.
// To change providers, edit these constants.
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_KEY;
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const RUTGERS = ' · Buildings &amp; lots: <a href="https://maps.rutgers.edu">Rutgers</a>';
const TILE_URL = CARTO_KEY
  ? `https://basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
  : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
/** Street labels on top of the lot and building shapes (CARTO only; OSM tiles include labels). */
const LABELS_URL = CARTO_KEY ? `https://basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}` : null;
const ATTRIBUTION = CARTO_KEY ? `${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>${RUTGERS}` : `${OSM}${RUTGERS}`;
/** OSM's public tiles stop at zoom 19. */
const MAX_TILE_ZOOM = CARTO_KEY ? 20 : 19;

const NB_CENTER: LatLng = { lat: 40.5005, lng: -74.4495 };
const SCARLET = "#cc0033";
/** "My classes" highlight: distinct from the lot status colors. */
const CLASS_PURPLE = "#6b3fb8";

interface LotProps {
  name: string;
  lotId: string | null;
}
interface BuildingProps {
  id: string;
  name: string;
}

export interface CampusMapProps {
  rows: MapLotRow[];
  lotShapes: FeatureCollection<Geometry, LotProps> | null;
  buildingShapes: FeatureCollection<Geometry, BuildingProps> | null;
  busStops: { name: string; center: LatLng }[];
  selection: MapSelection | null;
  route: MapRoute | null;
  focus: MapFocus | null;
  /** Buildings the student has class in (the "My classes" toggle); empty when off. */
  classMarks: ClassMark[];
  onSelectLot: (lotId: string) => void;
  onSelectBuilding: (buildingId: string) => void;
  onSelectPoint: (p: LatLng) => void;
}

function lotStyle(row: MapLotRow | undefined, selected: boolean): L.PathOptions {
  if (!row) {
    // A Rutgers lot outside the student permit data (faculty/staff, visitor, …).
    return { color: "#8a9199", weight: 1, fillColor: "#8a9199", fillOpacity: 0.12, dashArray: "3 3" };
  }
  const status: LotStatus = row.estimate?.status ?? "gray";
  const dim = row.allowed === false;
  return {
    color: selected ? "#111" : STATUS_HEX[status],
    weight: selected ? 3 : 1.5,
    fillColor: STATUS_HEX[status],
    fillOpacity: dim ? 0.18 : 0.55,
    dashArray: dim ? "4 4" : undefined,
  };
}

/** Fly to the requested place whenever `focus.key` changes. */
function FocusController({ focus }: { focus: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    if (focus.bounds) {
      map.flyToBounds(L.latLngBounds(focus.bounds.map((p) => [p.lat, p.lng] as [number, number])), { padding: [32, 32], duration: 0.6, maxZoom: 18 });
    } else if (focus.center) {
      map.flyTo([focus.center.lat, focus.center.lng], focus.zoom ?? Math.max(map.getZoom(), 17), { duration: 0.6 });
    }
    // Only react to a new focus request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);
  return null;
}

/** Leaflet keeps the old size when the panel layout changes; tell it to re-measure. */
function SizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function ClickAndZoom({ onPoint, onZoom }: { onPoint: (p: LatLng) => void; onZoom: (z: number) => void }) {
  const map = useMapEvents({
    click: (e) => onPoint({ lat: e.latlng.lat, lng: e.latlng.lng }),
    zoomend: () => onZoom(map.getZoom()),
  });
  return null;
}

export default function CampusMap(props: CampusMapProps) {
  const { rows, lotShapes, buildingShapes, busStops, selection, route, focus, classMarks } = props;
  const [zoom, setZoom] = useState(15);
  const byId = useMemo(() => new Map(rows.map((r) => [r.lot.id, r])), [rows]);
  const lotLayer = useRef<L.GeoJSON | null>(null);
  const buildingLayer = useRef<L.GeoJSON | null>(null);
  // Leaflet handlers are bound once; read the latest callbacks through a ref.
  const cb = useRef(props);
  cb.current = props;

  const selectedLot = selection?.kind === "lot" ? selection.lotId : null;
  const selectedBuilding = selection?.kind === "building" ? selection.buildingId : null;
  const outlined = useMemo(
    () => new Set((lotShapes?.features ?? []).map((f) => f.properties.lotId).filter(Boolean) as string[]),
    [lotShapes],
  );

  // Repaint lot outlines when statuses, permissions or the selection change.
  useEffect(() => {
    lotLayer.current?.eachLayer((layer) => {
      const f = (layer as L.Path & { feature?: Feature<Geometry, LotProps> }).feature;
      const id = f?.properties.lotId ?? null;
      (layer as L.Path).setStyle(lotStyle(id ? byId.get(id) : undefined, !!id && id === selectedLot));
    });
  }, [byId, selectedLot, lotShapes]);

  const classIds = useMemo(() => new Set(classMarks.map((m) => m.buildingId).filter(Boolean) as string[]), [classMarks]);
  useEffect(() => {
    buildingLayer.current?.eachLayer((layer) => {
      const f = (layer as L.Path & { feature?: Feature<Geometry, BuildingProps> }).feature;
      const id = f?.properties.id;
      const style =
        id === selectedBuilding
          ? { color: SCARLET, weight: 2.5, fillColor: SCARLET, fillOpacity: 0.35 }
          : id && classIds.has(id)
            ? { color: CLASS_PURPLE, weight: 2.5, fillColor: CLASS_PURPLE, fillOpacity: 0.45 }
            : buildingBase;
      (layer as L.Path).setStyle(style);
    });
  }, [selectedBuilding, buildingShapes, classIds]);

  return (
    <MapContainer
      center={NB_CENTER}
      zoom={14}
      minZoom={13}
      maxZoom={19}
      zoomControl={false}
      scrollWheelZoom
      attributionControl
      className="h-full w-full"
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={MAX_TILE_ZOOM} />
      <FocusController focus={focus} />
      <SizeWatcher />
      <ClickAndZoom onPoint={(p) => cb.current.onSelectPoint(p)} onZoom={setZoom} />

      {buildingShapes && (
        <GeoJSON
          key="buildings"
          data={buildingShapes}
          ref={buildingLayer}
          style={() => buildingBase}
          // Clicks on a building must not also count as a click on empty ground.
          {...({ bubblingMouseEvents: false } as object)}
          onEachFeature={(f: Feature<Geometry, BuildingProps>, layer) => {
            layer.on("click", () => cb.current.onSelectBuilding(f.properties.id));
            layer.bindTooltip(f.properties.name, { sticky: true, direction: "top", className: "map-tip" });
          }}
        />
      )}

      {lotShapes && (
        <GeoJSON
          key="lots"
          data={lotShapes}
          ref={lotLayer}
          style={(f) => {
            const id = (f as Feature<Geometry, LotProps> | undefined)?.properties.lotId;
            return lotStyle(id ? byId.get(id) : undefined, false);
          }}
          {...({ bubblingMouseEvents: false } as object)}
          onEachFeature={(f: Feature<Geometry, LotProps>, layer) => {
            const id = f.properties.lotId;
            if (id) layer.on("click", () => cb.current.onSelectLot(id));
            layer.bindTooltip(f.properties.name, { sticky: true, direction: "top", className: "map-tip" });
          }}
        />
      )}

      {/* Lots without a Rutgers outline (parking decks) are drawn as markers. */}
      {rows
        .filter((r) => !outlined.has(r.lot.id))
        .map((r) => {
          const style = lotStyle(r, r.lot.id === selectedLot);
          return (
            <CircleMarker
              key={r.lot.id}
              center={r.lot.center}
              radius={r.lot.id === selectedLot ? 12 : 9}
              pathOptions={{ ...style, fillOpacity: Math.max(0.5, style.fillOpacity ?? 0.5), weight: 2 }}
              bubblingMouseEvents={false}
              eventHandlers={{ click: () => cb.current.onSelectLot(r.lot.id) }}
            >
              <Tooltip direction="top" className="map-tip">{r.lot.name}</Tooltip>
            </CircleMarker>
          );
        })}

      {/* Lot numbers once zoomed in, like the Rutgers campus map. */}
      {zoom >= 16 &&
        rows.map((r) => (
          <CircleMarker key={`label-${r.lot.id}`} center={r.lot.center} radius={0} pathOptions={{ opacity: 0, fillOpacity: 0 }} interactive={false}>
            <Tooltip permanent direction="center" className="lot-label">
              {r.lot.id.split("-").slice(1).join(" ").replace(/^(DOUGLAS DECK|PUBLIC SAFETY BUILDING DECK)$/, "Deck")}
            </Tooltip>
          </CircleMarker>
        ))}

      {zoom >= 15 &&
        busStops.map((s) => (
          <CircleMarker
            key={`stop-${s.name}`}
            center={s.center}
            radius={4.5}
            pathOptions={{ color: "#fff", weight: 1.5, fillColor: "#1d4f91", fillOpacity: 1 }}
            bubblingMouseEvents={false}
          >
            <Tooltip direction="top" className="map-tip">{`Bus stop: ${s.name}`}</Tooltip>
          </CircleMarker>
        ))}

      {/* My classes: a labeled pin on each class building (the outline is tinted above). */}
      {classMarks.map((m) => (
        <CircleMarker
          key={`class-${m.buildingId ?? `${m.center.lat},${m.center.lng}`}`}
          center={m.center}
          radius={7}
          pathOptions={{ color: "#fff", weight: 2.5, fillColor: CLASS_PURPLE, fillOpacity: 1 }}
          bubblingMouseEvents={false}
          eventHandlers={{ click: () => m.buildingId && cb.current.onSelectBuilding(m.buildingId) }}
        >
          <Tooltip permanent direction="right" offset={[8, 0]} className="class-label">
            {m.label}
          </Tooltip>
        </CircleMarker>
      ))}

      {route && <RouteLayer route={route} />}

      {selection?.kind === "point" && (
        <CircleMarker center={selection.point} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: SCARLET, fillOpacity: 1 }} interactive={false} />
      )}

      {/* Labels above the shapes so street names stay readable. */}
      {LABELS_URL && <TileLayer url={LABELS_URL} maxZoom={MAX_TILE_ZOOM} pane="markerPane" />}
    </MapContainer>
  );
}

const buildingBase: L.PathOptions = { color: "#9aa3ad", weight: 0.8, fillColor: "#c4cad1", fillOpacity: 0.55 };

/** Straight-line sketch of the trip: walk (dashed) and bus (solid). Not turn-by-turn directions. */
function RouteLayer({ route }: { route: MapRoute }) {
  const pts = (a: LatLng, b: LatLng) => [
    [a.lat, a.lng],
    [b.lat, b.lng],
  ] as [number, number][];
  const walk = { color: "#2a2e33", weight: 3, dashArray: "2 7", lineCap: "round" as const };
  return (
    <>
      {route.bus ? (
        <>
          <Polyline positions={pts(route.from, route.bus.from)} pathOptions={walk} interactive={false} />
          <Polyline positions={pts(route.bus.from, route.bus.to)} pathOptions={{ color: "#1d4f91", weight: 5, opacity: 0.9 }} interactive={false} />
          <Polyline positions={pts(route.bus.to, route.to)} pathOptions={walk} interactive={false} />
          <CircleMarker center={route.bus.from} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#1d4f91", fillOpacity: 1 }} interactive={false} />
          <CircleMarker center={route.bus.to} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#1d4f91", fillOpacity: 1 }} interactive={false} />
        </>
      ) : (
        <Polyline positions={pts(route.from, route.to)} pathOptions={walk} interactive={false} />
      )}
      <CircleMarker center={route.to} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: SCARLET, fillOpacity: 1 }} interactive={false} />
    </>
  );
}
