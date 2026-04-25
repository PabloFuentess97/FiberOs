"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { Map as MLMap, MapGeoJSONFeature } from "maplibre-gl";
import { MapPin, X } from "lucide-react";
import { BOX_TYPE_META, CABLE_WIDTH } from "@/lib/geo/markers";
import { Button } from "@/components/ui/button";

interface Props {
  styleUrl: string;
  center: [number, number];
  zoom: number;
  boxFeatures: Feature<Point, Record<string, unknown>>[];
  cableFeatures: Feature<LineString, Record<string, unknown>>[];
  hasMapTilerKey: boolean;
}

export function MapClient({
  styleUrl,
  center,
  zoom,
  boxFeatures,
  cableFeatures,
  hasMapTilerKey,
}: Props) {
  const router = useRouter();
  const mapRef = useRef<MLMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pinMode, setPinMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) return;

    (async () => {
      const { Map, NavigationControl } = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (cancelled || !containerRef.current) return;

      const map = new Map({
        container: containerRef.current,
        style: styleUrl,
        center,
        zoom,
        attributionControl: { compact: true },
      });
      map.addControl(new NavigationControl({}), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        // Cables
        map.addSource("cables", {
          type: "geojson",
          data: { type: "FeatureCollection", features: cableFeatures } satisfies FeatureCollection,
        });
        map.addLayer({
          id: "cables-line",
          type: "line",
          source: "cables",
          paint: {
            "line-color": [
              "match",
              ["get", "cableType"],
              "main_trunk",
              "#7C3AED",
              "trunk",
              "#1E5FFF",
              "subtrunk",
              "#0EA5E9",
              "drop",
              "#16A34A",
              "#64748B",
            ],
            "line-width": [
              "match",
              ["get", "cableType"],
              "main_trunk",
              CABLE_WIDTH.main_trunk,
              "trunk",
              CABLE_WIDTH.trunk,
              "subtrunk",
              CABLE_WIDTH.subtrunk,
              "drop",
              CABLE_WIDTH.drop,
              1,
            ],
            "line-opacity": 0.85,
          },
        });

        // Boxes (clusterizados)
        map.addSource("boxes", {
          type: "geojson",
          data: { type: "FeatureCollection", features: boxFeatures } satisfies FeatureCollection,
          cluster: true,
          clusterRadius: 40,
          clusterMaxZoom: 12,
        });
        map.addLayer({
          id: "box-clusters",
          type: "circle",
          source: "boxes",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#1E5FFF",
            "circle-opacity": 0.8,
            "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 28],
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 2,
          },
        });
        map.addLayer({
          id: "box-cluster-count",
          type: "symbol",
          source: "boxes",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
          },
          paint: { "text-color": "#fff" },
        });
        map.addLayer({
          id: "box-points",
          type: "circle",
          source: "boxes",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 7,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 2,
            "circle-color": [
              "match",
              ["get", "boxType"],
              ...Object.entries(BOX_TYPE_META).flatMap(([k, v]) => [k, v.color]),
              "#64748B",
            ],
          },
        });

        map.on("click", "box-clusters", (e) => {
          const feat = e.features?.[0] as MapGeoJSONFeature | undefined;
          if (!feat) return;
          const clusterId = feat.properties?.cluster_id;
          const src = map.getSource("boxes") as { getClusterExpansionZoom?: (id: number, cb: (err: unknown, zoom: number) => void) => void };
          src.getClusterExpansionZoom?.(clusterId as number, (err, newZoom) => {
            if (err) return;
            const coords = (feat.geometry as Point).coordinates as [number, number];
            map.easeTo({ center: coords, zoom: newZoom });
          });
        });

        map.on("click", "box-points", (e) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const id = feat.id as string | undefined;
          if (id) router.push(`/boxes/${id}`);
        });

        map.on("mouseenter", "box-points", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "box-points", () => {
          map.getCanvas().style.cursor = "";
        });
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [styleUrl, center, zoom, boxFeatures, cableFeatures, router]);

  // Pin-mode: próximo click deposita un pin y navega a /boxes/new?lat=...&lng=...
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!pinMode) {
      map.getCanvas().style.cursor = "";
      return;
    }
    map.getCanvas().style.cursor = "crosshair";
    const handler = (e: { lngLat: { lng: number; lat: number } }) => {
      const { lng, lat } = e.lngLat;
      router.push(`/boxes/new?lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}`);
    };
    map.once("click", handler);
    return () => {
      map.off("click", handler);
      map.getCanvas().style.cursor = "";
    };
  }, [pinMode, router]);

  return (
    <div className="relative flex-1">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
        <Button
          variant={pinMode ? "destructive" : "primary"}
          onClick={() => setPinMode((v) => !v)}
          className="shadow-md"
        >
          {pinMode ? (
            <>
              <X size={16} /> Cancelar pin
            </>
          ) : (
            <>
              <MapPin size={16} /> Añadir caja
            </>
          )}
        </Button>
        {!hasMapTilerKey ? (
          <div className="max-w-xs rounded-md bg-amber-100 p-2 text-xs text-amber-900 shadow">
            Sin <code>MAPTILER_API_KEY</code>: usando tiles demo con marca de agua. Añade la key en{" "}
            <code>.env.local</code>.
          </div>
        ) : null}
      </div>
      {pinMode ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-md bg-white px-3 py-1.5 text-sm shadow-md">
          Pulsa en el mapa para colocar la caja
        </div>
      ) : null}
    </div>
  );
}
