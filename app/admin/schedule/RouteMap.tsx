"use client";

import { useEffect, useMemo } from "react";
import {
  AdvancedMarker, APILoadingStatus, APIProvider, Map as GoogleMap, Pin, Polyline, useApiLoadingStatus, useMap,
} from "@vis.gl/react-google-maps";
import { routeColor, UNKNOWN_ROUTE_COLOR } from "@/lib/routes/colors";
import type { DayStop, Installer, PlanRoute, RoutePlan } from "@/lib/routes/types";

const GREY = "#9ca3af";
const LAS_VEGAS = { lat: 36.1147, lng: -115.1728 };

type Located = DayStop & { lat: number; lng: number };
type Point = { lat: number; lng: number };

export type RouteMapProps = {
  stops: DayStop[]; plan: RoutePlan | null; installers: Installer[]; apiKey: string | null; mapId: string | null;
};

/** The day's map. Without a key or map id it renders nothing, so the lists stand alone. */
export function RouteMap(props: RouteMapProps) {
  if (!props.apiKey || !props.mapId) return null;
  return (
    <APIProvider apiKey={props.apiKey} libraries={["marker"]}>
      <LoadedMap {...props} mapId={props.mapId} />
    </APIProvider>
  );
}

function LoadedMap({ stops, plan, installers, mapId }: RouteMapProps & { mapId: string }) {
  const status = useApiLoadingStatus();
  const located = useMemo(() => stops.filter((s): s is Located => s.lat !== null && s.lng !== null), [stops]);
  const byId = useMemo(() => new Map(located.map((s) => [s.appointmentId, s])), [located]);
  // Keyed on ids and coords, so a refresh with the same stops keeps the owner's pan and zoom.
  const fitKey = located.map((s) => `${s.appointmentId}:${s.lat}:${s.lng}`).join("|");
  // A map-script failure shows the lists without the map.
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) return null;
  const routed = new Set(plan?.routes.flatMap((r) => r.stops.map((s) => s.appointmentId)) ?? []);

  return (
    <div className="h-80 border border-rule md:h-[36rem]">
      <GoogleMap mapId={mapId} defaultCenter={LAS_VEGAS} defaultZoom={10} gestureHandling="greedy">
        {located.filter((s) => !routed.has(s.appointmentId)).map((s) => (
          <AdvancedMarker key={s.appointmentId} position={{ lat: s.lat, lng: s.lng }} title={s.name}>
            <Pin background={GREY} borderColor={GREY} glyphColor="#ffffff" />
          </AdvancedMarker>
        ))}
        {plan?.routes.map((route) => (
          <RouteLayer key={route.teamMemberId} route={route} byId={byId}
            color={colorFor(installers, route.teamMemberId)} />
        ))}
        <FitBounds fitKey={fitKey} />
      </GoogleMap>
    </div>
  );
}

/** One installer's numbered pins and line: Google's road path when we have it, else straight segments. */
function RouteLayer({ route, byId, color }: { route: PlanRoute; byId: Map<string, Located>; color: string }) {
  const stops = useMemo(
    () => route.stops.map((s) => byId.get(s.appointmentId)).filter((s): s is Located => Boolean(s)),
    [route.stops, byId],
  );
  const path = useMemo(() => stops.map(({ lat, lng }) => ({ lat, lng })), [stops]);
  const line = { strokeColor: color, strokeOpacity: 0.85, strokeWeight: 4 };
  return (
    <>
      {stops.map((s, i) => (
        <AdvancedMarker key={s.appointmentId} position={{ lat: s.lat, lng: s.lng }} title={s.name}>
          <Pin background={color} borderColor={color} glyphColor="#ffffff" glyphText={String(i + 1)} />
        </AdvancedMarker>
      ))}
      {route.polyline ? <Polyline {...line} encodedPath={route.polyline} />
        : path.length > 1 ? <Polyline {...line} path={path} /> : null}
    </>
  );
}

function colorFor(installers: Installer[], id: string) {
  const index = installers.findIndex((i) => i.id === id);
  return index < 0 ? UNKNOWN_ROUTE_COLOR : routeColor(index);
}

/** Frames the stops once per distinct set; a single spot (or all stops at one spot) centres at street zoom. */
function FitBounds({ fitKey }: { fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !fitKey) return;
    const points: Point[] = fitKey.split("|").map((entry) => {
      const [, lat, lng] = entry.split(":");
      return { lat: Number(lat), lng: Number(lng) };
    });
    if (points.every((p) => p.lat === points[0].lat && p.lng === points[0].lng)) {
      map.setCenter(points[0]);
      map.setZoom(13);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  }, [map, fitKey]);
  return null;
}
