import { useEffect, useMemo } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type LatLng = { lat: number; lng: number };

function pinIcon(label: string, color: string) {
  return L.divIcon({
    className: "pixel-pin",
    html: `<div style="background:${color};color:#fff;border-radius:999px;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font:700 11px Cairo,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -24],
  });
}

function Recenter({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom());
  }, [center.lat, center.lng, map]);
  return null;
}

function ClickCatch({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function OsmMap({
  center,
  zoom = 13,
  height = 420,
  onPick,
  shop,
  geofence = 100,
  markers = [],
  trails = [],
  self,
}: {
  center: LatLng;
  zoom?: number;
  height?: number;
  onPick?: (lat: number, lng: number) => void;
  shop?: LatLng | null;
  geofence?: number;
  markers?: { id: string | number; lat: number; lng: number; label: string; color?: string; popup?: string; stale?: boolean }[];
  trails?: { color?: string; points: LatLng[] }[];
  self?: LatLng | null;
}) {
  const c = useMemo(() => [center.lat, center.lng] as [number, number], [center.lat, center.lng]);
  return (
    <div className="osm-map overflow-hidden rounded-2xl border border-slate-200" style={{ height }}>
      <MapContainer center={c} zoom={zoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Recenter center={center} />
        {onPick ? <ClickCatch onPick={onPick} /> : null}
        {shop ? (
          <>
            <Circle center={[shop.lat, shop.lng]} radius={geofence} pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 0.12, weight: 1 }} />
            <CircleMarker center={[shop.lat, shop.lng]} radius={7} pathOptions={{ color: "#0f766e", fillColor: "#14b8a6", fillOpacity: 1 }}>
              <Popup>المتميز</Popup>
            </CircleMarker>
          </>
        ) : null}
        {trails.map((t, i) =>
          t.points.length > 1 ? (
            <Polyline key={i} positions={t.points.map((p) => [p.lat, p.lng])} pathOptions={{ color: t.color || "#0284c7", weight: 3, opacity: 0.75 }} />
          ) : null,
        )}
        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={pinIcon(m.label, m.stale ? "#94a3b8" : m.color || "#0a1628")}>
            <Popup>
              <div className="text-sm" dangerouslySetInnerHTML={{ __html: m.popup || m.label }} />
            </Popup>
          </Marker>
        ))}
        {self ? (
          <CircleMarker center={[self.lat, self.lng]} radius={8} pathOptions={{ color: "#0369a1", fillColor: "#38bdf8", fillOpacity: 1 }}>
            <Popup>GPS</Popup>
          </CircleMarker>
        ) : null}
      </MapContainer>
    </div>
  );
}
