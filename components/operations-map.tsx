"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";

type CropType = "almond" | "walnut" | "grape";
type ReportType = "embers" | "spot-fire" | "wind-shear" | "smoke-smell";

type FarmProps = {
  acres: number;
  crop: CropType;
  name: string;
  risk: number;
};

type HotspotProps = {
  heat: number;
  name: string;
  wind: number;
};

type ReportProps = {
  id: string;
  note: string;
  severity: number;
  time: string;
  type: ReportType;
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

const FARM_BOUNDARIES: FeatureCollection<Polygon, FarmProps> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Orchard Block 7A", crop: "almond", acres: 420, risk: 78 },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-121.6704, 39.157],
            [-121.5958, 39.157],
            [-121.5958, 39.1116],
            [-121.6704, 39.1116],
            [-121.6704, 39.157]
          ]
        ]
      }
    },
    {
      type: "Feature",
      properties: { name: "Walnut Block 4B", crop: "walnut", acres: 305, risk: 64 },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-121.748, 39.122],
            [-121.6715, 39.122],
            [-121.6715, 39.0758],
            [-121.748, 39.0758],
            [-121.748, 39.122]
          ]
        ]
      }
    },
    {
      type: "Feature",
      properties: { name: "Vineyard South Lot", crop: "grape", acres: 180, risk: 71 },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-121.6132, 39.0845],
            [-121.5452, 39.0845],
            [-121.5452, 39.0385],
            [-121.6132, 39.0385],
            [-121.6132, 39.0845]
          ]
        ]
      }
    }
  ]
};

const HOTSPOTS: FeatureCollection<Point, HotspotProps> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Feather South Rim", heat: 89, wind: 22 },
      geometry: { type: "Point", coordinates: [-121.6755, 39.0252] }
    },
    {
      type: "Feature",
      properties: { name: "West Levee Edge", heat: 74, wind: 18 },
      geometry: { type: "Point", coordinates: [-121.786, 39.082] }
    },
    {
      type: "Feature",
      properties: { name: "Bogue Front", heat: 82, wind: 25 },
      geometry: { type: "Point", coordinates: [-121.587, 39.0412] }
    }
  ]
};

const SMOKE_VECTORS: FeatureCollection<LineString, { id: string; speed: number }> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: "v1", speed: 14 },
      geometry: {
        type: "LineString",
        coordinates: [
          [-121.781, 39.03],
          [-121.705, 39.084],
          [-121.62, 39.11],
          [-121.565, 39.127]
        ]
      }
    },
    {
      type: "Feature",
      properties: { id: "v2", speed: 19 },
      geometry: {
        type: "LineString",
        coordinates: [
          [-121.704, 39.022],
          [-121.654, 39.067],
          [-121.585, 39.084],
          [-121.53, 39.104]
        ]
      }
    }
  ]
};

const FIRE_PATH_PREDICTION: FeatureCollection<Polygon, { eta: string; name: string }> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Predicted Spread Cone", eta: "6h" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-121.741, 39.009],
            [-121.756, 39.071],
            [-121.731, 39.132],
            [-121.682, 39.178],
            [-121.598, 39.184],
            [-121.54, 39.147],
            [-121.501, 39.097],
            [-121.504, 39.049],
            [-121.559, 39.011],
            [-121.651, 38.995],
            [-121.741, 39.009]
          ]
        ]
      }
    }
  ]
};

const INITIAL_REPORTS: FeatureCollection<Point, ReportProps> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        id: "r1",
        type: "smoke-smell",
        severity: 55,
        note: "Strong smoke odor near Orchard Block 7A.",
        time: "05:34"
      },
      geometry: { type: "Point", coordinates: [-121.625, 39.131] }
    },
    {
      type: "Feature",
      properties: {
        id: "r2",
        type: "embers",
        severity: 76,
        note: "Embers seen in irrigation trench line.",
        time: "05:39"
      },
      geometry: { type: "Point", coordinates: [-121.701, 39.095] }
    }
  ]
};

type LayerVisibility = {
  farms: boolean;
  prediction: boolean;
  reports: boolean;
  vectors: boolean;
};

const LAYER_IDS: Array<{ ids: string[]; key: keyof LayerVisibility }> = [
  { key: "farms", ids: ["farm-fill", "farm-line"] },
  { key: "prediction", ids: ["fire-path-fill", "fire-path-line"] },
  { key: "vectors", ids: ["smoke-vectors"] },
  { key: "reports", ids: ["report-points"] }
];

function currentTimeLabel() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export default function OperationsMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const missingToken = !token;

  const [reportType, setReportType] = useState<ReportType>("smoke-smell");
  const [reportData, setReportData] =
    useState<FeatureCollection<Point, ReportProps>>(INITIAL_REPORTS);
  const [visibility, setVisibility] = useState<LayerVisibility>({
    farms: true,
    prediction: true,
    vectors: true,
    reports: true
  });

  const reportTypeRef = useRef<ReportType>(reportType);

  useEffect(() => {
    reportTypeRef.current = reportType;
  }, [reportType]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || missingToken) {
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-121.64, 39.105],
      zoom: 10.25,
      pitch: 48,
      bearing: -14,
      antialias: true
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

    map.on("load", () => {
      map.addSource("farms", { type: "geojson", data: FARM_BOUNDARIES });
      map.addSource("hotspots", { type: "geojson", data: HOTSPOTS });
      map.addSource("smoke-vectors-source", { type: "geojson", data: SMOKE_VECTORS });
      map.addSource("fire-path", { type: "geojson", data: FIRE_PATH_PREDICTION });
      map.addSource("reports", { type: "geojson", data: INITIAL_REPORTS });

      map.addLayer({
        id: "farm-fill",
        type: "fill",
        source: "farms",
        paint: {
          "fill-color": [
            "match",
            ["get", "crop"],
            "almond",
            "#1cf089",
            "walnut",
            "#42c8ff",
            "grape",
            "#efd768",
            "#9ec2a8"
          ],
          "fill-opacity": 0.23
        }
      });

      map.addLayer({
        id: "farm-line",
        type: "line",
        source: "farms",
        paint: {
          "line-color": "#d4ffd3",
          "line-width": 1.4,
          "line-opacity": 0.9
        }
      });

      map.addLayer({
        id: "fire-path-fill",
        type: "fill",
        source: "fire-path",
        paint: {
          "fill-color": "#ff6a4c",
          "fill-opacity": 0.2
        }
      });

      map.addLayer({
        id: "fire-path-line",
        type: "line",
        source: "fire-path",
        paint: {
          "line-color": "#ffb37f",
          "line-width": 1.6,
          "line-dasharray": [2.2, 1.4]
        }
      });

      map.addLayer({
        id: "smoke-vectors",
        type: "line",
        source: "smoke-vectors-source",
        paint: {
          "line-color": "#49b8ff",
          "line-width": 2.8,
          "line-opacity": 0.75,
          "line-dasharray": [1.1, 1.8]
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
            ["get", "heat"],
            40,
            9,
            100,
            18
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "heat"],
            40,
            "#ffe866",
            75,
            "#ff9830",
            100,
            "#ff3a3a"
          ],
          "circle-opacity": 0.9,
          "circle-stroke-width": 1.4,
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

      map.on("click", "farm-fill", (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Polygon") {
          return;
        }

        const center = feature.geometry.coordinates[0][0] as [number, number];
        const name = String(feature.properties?.name ?? "Farm block");
        const crop = String(feature.properties?.crop ?? "Unknown");
        const acres = String(feature.properties?.acres ?? "N/A");
        const risk = String(feature.properties?.risk ?? "N/A");

        new mapboxgl.Popup({ offset: 14 })
          .setLngLat(center)
          .setHTML(
            `<strong>${name}</strong><p>Crop: ${crop}<br/>Acres: ${acres}<br/>Risk score: ${risk}</p>`
          )
          .addTo(map);
      });

      map.on("click", "hotspot-points", (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") {
          return;
        }

        const coordinates = [...feature.geometry.coordinates] as [number, number];
        const name = String(feature.properties?.name ?? "Hotspot");
        const heat = String(feature.properties?.heat ?? "N/A");
        const wind = String(feature.properties?.wind ?? "N/A");

        new mapboxgl.Popup({ offset: 14 })
          .setLngLat(coordinates)
          .setHTML(
            `<strong>${name}</strong><p>Thermal index: ${heat}/100<br/>Wind drift: ${wind} mph</p>`
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
          layers: ["hotspot-points", "report-points", "farm-fill"]
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
      map.remove();
      mapRef.current = null;
    };
  }, [missingToken, token]);

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
    if (!map || !map.isStyleLoaded()) {
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
              Farm Boundaries
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
          Crop boundary by crop type
        </p>
        <p>
          <span className="legend-swatch fire" />
          Thermal hotspot (NASA-style intensity)
        </p>
        <p>
          <span className="legend-swatch vector" />
          Predicted smoke drift vectors
        </p>
        <p>
          <span className="legend-swatch path" />
          Fire path prediction cone
        </p>
      </div>
    </div>
  );
}
