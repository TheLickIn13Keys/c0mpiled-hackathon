"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type {
  ReadyToPlotFarmStatus,
  ReadyToPlotFirePoint
} from "@/lib/ready-to-plot-types";

type ReportType = "embers" | "spot-fire" | "wind-shear" | "smoke-smell";

type FarmProps = {
  cdl_class_code: number | null;
  crop_type: string;
  farm_id: string;
  farm_name: string;
  hour_utc: string;
  risk_level: string;
  risk_score: number;
  top_driver: string;
};

type FireProps = {
  confidence: number;
  frp: number;
  id: string;
  risk_hint: string;
  time_utc: string;
};

type ReportProps = {
  id: string;
  note: string;
  severity: number;
  time: string;
  type: ReportType;
};

type LayerVisibility = {
  farms: boolean;
  fires: boolean;
  prediction: boolean;
  reports: boolean;
  vectors: boolean;
};

type OperationsMapProps = {
  farmStatus: ReadyToPlotFarmStatus[];
  firePoints: ReadyToPlotFirePoint[];
};

const REPORT_TYPES: Array<{
  label: string;
  note: string;
  severity: number;
  type: ReportType;
}> = [
  { type: "embers", label: "Embers", severity: 72, note: "Ember drift spotted near crop edge." },
  { type: "spot-fire", label: "Spot Fire", severity: 92, note: "Small active flame in field access lane." },
  { type: "wind-shear", label: "Wind Shear", severity: 66, note: "Abrupt wind shift pushing plume toward farm." },
  { type: "smoke-smell", label: "Smoke Smell", severity: 57, note: "Strong smoke odor in active orchard rows." }
];

const LAYER_IDS: Array<{ ids: string[]; key: keyof LayerVisibility }> = [
  { key: "farms", ids: ["farm-points"] },
  { key: "fires", ids: ["hotspot-points"] },
  { key: "prediction", ids: ["fire-path-fill", "fire-path-line"] },
  { key: "vectors", ids: ["smoke-vectors"] },
  { key: "reports", ids: ["report-points"] }
];

const EMPTY_REPORTS: FeatureCollection<Point, ReportProps> = {
  type: "FeatureCollection",
  features: []
};

function currentTimeLabel() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function asCoordinateArray(
  farmStatus: ReadyToPlotFarmStatus[],
  firePoints: ReadyToPlotFirePoint[]
): Array<[number, number]> {
  return [
    ...farmStatus.map((row) => [row.lon, row.lat] as [number, number]),
    ...firePoints.map((row) => [row.lon, row.lat] as [number, number])
  ];
}

function getMapView(
  farmStatus: ReadyToPlotFarmStatus[],
  firePoints: ReadyToPlotFirePoint[]
): { center: [number, number]; zoom: number } {
  const coordinates = asCoordinateArray(farmStatus, firePoints);
  if (coordinates.length === 0) {
    return { center: [-121.64, 39.105], zoom: 10.25 };
  }

  const lons = coordinates.map((coord) => coord[0]);
  const lats = coordinates.map((coord) => coord[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const span = Math.max(maxLon - minLon, maxLat - minLat);

  const center: [number, number] = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
  const zoom =
    span > 2.4 ? 6.2 : span > 1.4 ? 7.1 : span > 0.9 ? 8.1 : span > 0.45 ? 9 : 10.2;

  return { center, zoom };
}

function buildSmokeVectors(
  farmStatus: ReadyToPlotFarmStatus[],
  firePoints: ReadyToPlotFirePoint[]
): FeatureCollection<LineString, { id: string; speed: number }> {
  if (farmStatus.length === 0 || firePoints.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const topFarms = [...farmStatus]
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 12);

  const vectors: FeatureCollection<LineString, { id: string; speed: number }> = {
    type: "FeatureCollection",
    features: []
  };

  for (const farm of topFarms) {
    let nearest: ReadyToPlotFirePoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const fire of firePoints) {
      const dLon = farm.lon - fire.lon;
      const dLat = farm.lat - fire.lat;
      const distance = dLon * dLon + dLat * dLat;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = fire;
      }
    }

    if (!nearest) {
      continue;
    }

    const vectorId = `${nearest.id}-${farm.farm_id}`;
    vectors.features.push({
      type: "Feature",
      properties: {
        id: vectorId,
        speed: Math.max(6, Math.round(farm.risk_score * 24))
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [nearest.lon, nearest.lat],
          [farm.lon, farm.lat]
        ]
      }
    });
  }

  return vectors;
}

function buildPredictionArea(
  farmStatus: ReadyToPlotFarmStatus[],
  firePoints: ReadyToPlotFirePoint[]
): FeatureCollection<Polygon, { eta: string; name: string }> {
  const coordinates = asCoordinateArray(
    [...farmStatus].sort((a, b) => b.risk_score - a.risk_score).slice(0, 24),
    firePoints
  );
  if (coordinates.length < 3) {
    return { type: "FeatureCollection", features: [] };
  }

  const lons = coordinates.map((coord) => coord[0]);
  const lats = coordinates.map((coord) => coord[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const pad = Math.max((maxLon - minLon) * 0.12, (maxLat - minLat) * 0.12, 0.06);

  const polygon: FeatureCollection<Polygon, { eta: string; name: string }> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Predicted spread envelope",
          eta: "6h"
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [minLon - pad, minLat - pad],
              [maxLon + pad, minLat - pad],
              [maxLon + pad, maxLat + pad],
              [minLon - pad, maxLat + pad],
              [minLon - pad, minLat - pad]
            ]
          ]
        }
      }
    ]
  };

  return polygon;
}

function buildFarmPoints(
  farmStatus: ReadyToPlotFarmStatus[]
): FeatureCollection<Point, FarmProps> {
  return {
    type: "FeatureCollection",
    features: farmStatus.map((farm) => ({
      type: "Feature",
      properties: {
        cdl_class_code: farm.cdl_class_code,
        crop_type: farm.crop_type,
        farm_id: farm.farm_id,
        farm_name: farm.farm_name,
        hour_utc: farm.hour_utc,
        risk_level: farm.risk_level,
        risk_score: farm.risk_score,
        top_driver: farm.top_driver
      },
      geometry: {
        type: "Point",
        coordinates: [farm.lon, farm.lat]
      }
    }))
  };
}

function buildFirePoints(
  firePoints: ReadyToPlotFirePoint[]
): FeatureCollection<Point, FireProps> {
  return {
    type: "FeatureCollection",
    features: firePoints.map((fire) => ({
      type: "Feature",
      properties: {
        confidence: fire.confidence,
        frp: fire.frp,
        id: fire.id,
        risk_hint: fire.risk_hint,
        time_utc: fire.time_utc
      },
      geometry: {
        type: "Point",
        coordinates: [fire.lon, fire.lat]
      }
    }))
  };
}

export default function OperationsMap({ firePoints, farmStatus }: OperationsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const reportTypeRef = useRef<ReportType>("smoke-smell");
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const missingToken = !token;

  const [mapError, setMapError] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>("smoke-smell");
  const [reportData, setReportData] =
    useState<FeatureCollection<Point, ReportProps>>(EMPTY_REPORTS);
  const [visibility, setVisibility] = useState<LayerVisibility>({
    farms: true,
    fires: true,
    prediction: true,
    vectors: true,
    reports: true
  });

  const view = useMemo(() => getMapView(farmStatus, firePoints), [farmStatus, firePoints]);
  const farmPointsGeo = useMemo(() => buildFarmPoints(farmStatus), [farmStatus]);
  const firePointsGeo = useMemo(() => buildFirePoints(firePoints), [firePoints]);
  const smokeVectorsGeo = useMemo(
    () => buildSmokeVectors(farmStatus, firePoints),
    [farmStatus, firePoints]
  );
  const predictionGeo = useMemo(
    () => buildPredictionArea(farmStatus, firePoints),
    [farmStatus, firePoints]
  );

  useEffect(() => {
    reportTypeRef.current = reportType;
  }, [reportType]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || missingToken || !token) {
      return;
    }

    if (!mapboxgl.supported()) {
      queueMicrotask(() =>
        setMapError("WebGL is unavailable in this browser, so Mapbox cannot render.")
      );
      return;
    }

    mapboxgl.accessToken = token;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: view.center,
        zoom: view.zoom,
        pitch: 48,
        bearing: -14,
        antialias: true
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Map failed to initialize.";
      queueMicrotask(() => setMapError(message));
      return;
    }

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

    const resizeMap = () => {
      map.resize();
      map.triggerRepaint();
    };
    const timeoutId = window.setTimeout(resizeMap, 0);
    window.addEventListener("resize", resizeMap);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        resizeMap();
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    const stalledLoadId = window.setTimeout(() => {
      if (!mapLoadedRef.current) {
        setMapError(
          "Map style did not finish loading. Check token URL restrictions and browser WebGL."
        );
      }
    }, 8000);

    map.on("error", (event) => {
      const maybeError = (event as { error?: unknown }).error;
      const raw =
        maybeError instanceof Error
          ? maybeError.message
          : typeof maybeError === "string"
            ? maybeError
            : "";
      if (!raw) {
        return;
      }

      const normalized = raw.toLowerCase();
      const friendly =
        normalized.includes("access token") ||
        normalized.includes("unauthorized") ||
        normalized.includes("forbidden")
          ? "Mapbox rejected the token or token URL restrictions are blocking localhost."
          : normalized.includes("webgl")
            ? "WebGL is unavailable in this browser, so Mapbox cannot render."
            : `Mapbox runtime error: ${raw}`;

      setMapError((previous) => previous ?? friendly);
    });

    map.on("load", () => {
      mapLoadedRef.current = true;
      window.clearTimeout(stalledLoadId);
      setMapError(null);
      resizeMap();

      map.addSource("farms", { type: "geojson", data: farmPointsGeo });
      map.addSource("hotspots", { type: "geojson", data: firePointsGeo });
      map.addSource("smoke-vectors-source", { type: "geojson", data: smokeVectorsGeo });
      map.addSource("fire-path", { type: "geojson", data: predictionGeo });
      map.addSource("reports", { type: "geojson", data: EMPTY_REPORTS });

      map.addLayer({
        id: "fire-path-fill",
        type: "fill",
        source: "fire-path",
        paint: {
          "fill-color": "#ff6a4c",
          "fill-opacity": 0.16
        }
      });

      map.addLayer({
        id: "fire-path-line",
        type: "line",
        source: "fire-path",
        paint: {
          "line-color": "#ffb37f",
          "line-width": 1.4,
          "line-dasharray": [2.2, 1.4]
        }
      });

      map.addLayer({
        id: "smoke-vectors",
        type: "line",
        source: "smoke-vectors-source",
        paint: {
          "line-color": "#49b8ff",
          "line-width": 2.4,
          "line-opacity": 0.72,
          "line-dasharray": [1.1, 1.8]
        }
      });

      map.addLayer({
        id: "farm-points",
        type: "circle",
        source: "farms",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "risk_score"],
            0,
            5,
            1,
            10
          ],
          "circle-color": [
            "match",
            ["get", "crop_type"],
            "almond",
            "#1cf089",
            "walnut",
            "#42c8ff",
            "grape",
            "#efd768",
            "grapes",
            "#efd768",
            "mixed_ag",
            "#8fd4a6",
            "#97c4aa"
          ],
          "circle-opacity": 0.88,
          "circle-stroke-color": [
            "match",
            ["get", "risk_level"],
            "high",
            "#ff555f",
            "medium",
            "#ffc46b",
            "#c6ffd8"
          ],
          "circle-stroke-width": 1.4
        }
      });

      map.addLayer({
        id: "hotspot-points",
        type: "circle",
        source: "hotspots",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "frp"],
            0,
            7,
            30,
            18
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "frp"],
            0,
            "#ffd96a",
            10,
            "#ff9830",
            30,
            "#ff3a3a"
          ],
          "circle-opacity": 0.9,
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "#fff3cf"
        }
      });

      map.addLayer({
        id: "report-points",
        type: "circle",
        source: "reports",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "severity"],
            30,
            4,
            100,
            10
          ],
          "circle-color": [
            "match",
            ["get", "type"],
            "embers",
            "#ff9c38",
            "spot-fire",
            "#ff4f58",
            "wind-shear",
            "#6fb7ff",
            "smoke-smell",
            "#e3e067",
            "#92ffa7"
          ],
          "circle-opacity": 0.95,
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "#111722"
        }
      });

      map.on("mouseenter", "hotspot-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "hotspot-points", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "report-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "report-points", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "farm-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "farm-points", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "farm-points", (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") {
          return;
        }

        const coordinates = [...feature.geometry.coordinates] as [number, number];
        const farmName = String(feature.properties?.farm_name ?? "Farm");
        const crop = String(feature.properties?.crop_type ?? "Unknown");
        const riskScore = Number(feature.properties?.risk_score ?? 0);
        const riskLevel = String(feature.properties?.risk_level ?? "unknown");
        const driver = String(feature.properties?.top_driver ?? "unknown");

        new mapboxgl.Popup({ offset: 14 })
          .setLngLat(coordinates)
          .setHTML(
            `<strong>${farmName}</strong><p>Crop: ${crop}<br/>Risk: ${Math.round(
              riskScore * 100
            )}/100 (${riskLevel})<br/>Driver: ${driver.replace("_", " ")}</p>`
          )
          .addTo(map);
      });

      map.on("click", "hotspot-points", (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") {
          return;
        }

        const coordinates = [...feature.geometry.coordinates] as [number, number];
        const pointId = String(feature.properties?.id ?? "fire");
        const frp = Number(feature.properties?.frp ?? 0);
        const confidence = Number(feature.properties?.confidence ?? 0);
        const timeUtc = String(feature.properties?.time_utc ?? "unknown");

        new mapboxgl.Popup({ offset: 14 })
          .setLngLat(coordinates)
          .setHTML(
            `<strong>${pointId}</strong><p>FRP: ${frp.toFixed(
              2
            )}<br/>Confidence: ${(confidence * 100).toFixed(0)}%<br/>UTC: ${timeUtc}</p>`
          )
          .addTo(map);
      });

      map.on("click", "report-points", (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") {
          return;
        }

        const coordinates = [...feature.geometry.coordinates] as [number, number];
        const type = String(feature.properties?.type ?? "report");
        const note = String(feature.properties?.note ?? "Field update");
        const time = String(feature.properties?.time ?? "--:--");

        new mapboxgl.Popup({ offset: 14 })
          .setLngLat(coordinates)
          .setHTML(`<strong>${type}</strong><p>${note}<br/>Reported: ${time}</p>`)
          .addTo(map);
      });

      map.on("click", (event) => {
        const hit = map.queryRenderedFeatures(event.point, {
          layers: ["farm-points", "hotspot-points", "report-points"]
        });
        if (hit.length > 0) {
          return;
        }

        const selected = REPORT_TYPES.find((item) => item.type === reportTypeRef.current);
        if (!selected) {
          return;
        }

        const next: Feature<Point, ReportProps> = {
          type: "Feature",
          properties: {
            id: `${reportTypeRef.current}-${Date.now()}`,
            type: selected.type,
            note: selected.note,
            severity: selected.severity,
            time: currentTimeLabel()
          },
          geometry: {
            type: "Point",
            coordinates: [event.lngLat.lng, event.lngLat.lat]
          }
        };

        setReportData((previous) => ({
          ...previous,
          features: [...previous.features, next]
        }));
      });
    });

    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(stalledLoadId);
      window.removeEventListener("resize", resizeMap);
      resizeObserver?.disconnect();
      mapLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [firePointsGeo, farmPointsGeo, missingToken, predictionGeo, smokeVectorsGeo, token, view]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const farmsSource = map.getSource("farms");
    if (farmsSource) {
      (farmsSource as mapboxgl.GeoJSONSource).setData(farmPointsGeo);
    }

    const firesSource = map.getSource("hotspots");
    if (firesSource) {
      (firesSource as mapboxgl.GeoJSONSource).setData(firePointsGeo);
    }

    const vectorsSource = map.getSource("smoke-vectors-source");
    if (vectorsSource) {
      (vectorsSource as mapboxgl.GeoJSONSource).setData(smokeVectorsGeo);
    }

    const predictionSource = map.getSource("fire-path");
    if (predictionSource) {
      (predictionSource as mapboxgl.GeoJSONSource).setData(predictionGeo);
    }
  }, [farmPointsGeo, firePointsGeo, predictionGeo, smokeVectorsGeo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const source = map.getSource("reports");
    if (!source) {
      return;
    }

    (source as mapboxgl.GeoJSONSource).setData(reportData);
  }, [reportData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    for (const layer of LAYER_IDS) {
      const visibilityValue = visibility[layer.key] ? "visible" : "none";
      for (const id of layer.ids) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visibilityValue);
        }
      }
    }
  }, [visibility]);

  if (missingToken) {
    return (
      <div className="map-shell">
        <div className="map-empty">
          <p>Add a Mapbox token to enable the command map.</p>
          <code>NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here</code>
        </div>
      </div>
    );
  }

  return (
    <div className="map-shell">
      <div ref={mapContainerRef} className="map-container" />
      {mapError ? (
        <div className="map-runtime-error" role="alert">
          <h5>Map Load Error</h5>
          <p>{mapError}</p>
          <p>
            Verify token scopes (`styles:read`, `fonts:read`) and URL restrictions
            for `http://localhost:3000`.
          </p>
        </div>
      ) : null}

      <div className="map-ui">
        <section className="map-control">
          <h4>Drop Field Report</h4>
          <div className="map-chip-group">
            {REPORT_TYPES.map((option) => (
              <button
                key={option.type}
                type="button"
                className={reportType === option.type ? "active" : ""}
                onClick={() => setReportType(option.type)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p>Click anywhere on map to save a report pin.</p>
        </section>

        <section className="map-control">
          <h4>Layer Visibility</h4>
          <div className="toggle-group">
            <label>
              <input
                type="checkbox"
                checked={visibility.farms}
                onChange={() =>
                  setVisibility((prev) => ({ ...prev, farms: !prev.farms }))
                }
              />
              Farm Risk Points
            </label>
            <label>
              <input
                type="checkbox"
                checked={visibility.fires}
                onChange={() =>
                  setVisibility((prev) => ({ ...prev, fires: !prev.fires }))
                }
              />
              Active Fire Points
            </label>
            <label>
              <input
                type="checkbox"
                checked={visibility.prediction}
                onChange={() =>
                  setVisibility((prev) => ({
                    ...prev,
                    prediction: !prev.prediction
                  }))
                }
              />
              Fire Path Prediction
            </label>
            <label>
              <input
                type="checkbox"
                checked={visibility.vectors}
                onChange={() =>
                  setVisibility((prev) => ({ ...prev, vectors: !prev.vectors }))
                }
              />
              Smoke Vectors
            </label>
            <label>
              <input
                type="checkbox"
                checked={visibility.reports}
                onChange={() =>
                  setVisibility((prev) => ({ ...prev, reports: !prev.reports }))
                }
              />
              Farmer Reports
            </label>
          </div>
        </section>
      </div>

      <div className="map-legend">
        <h4>Legend</h4>
        <p>
          <span className="legend-swatch crop" />
          Farm risk marker by crop type
        </p>
        <p>
          <span className="legend-swatch fire" />
          FIRMS hotspot (FRP-based size)
        </p>
        <p>
          <span className="legend-swatch vector" />
          Fire-to-farm smoke vectors
        </p>
        <p>
          <span className="legend-swatch path" />
          Predicted spread envelope
        </p>
      </div>
    </div>
  );
}
