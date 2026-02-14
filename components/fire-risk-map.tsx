"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { FeatureCollection, Point, Polygon } from "geojson";

type WildfireProps = {
  intensity: number;
  name: string;
  wind: number;
};

type ZoneProps = {
  zone: string;
};

const wildfireHotspots: FeatureCollection<Point, WildfireProps> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Sierra Ridge", intensity: 91, wind: 22 },
      geometry: { type: "Point", coordinates: [-121.28, 39.02] }
    },
    {
      type: "Feature",
      properties: { name: "Fresno Foothills", intensity: 76, wind: 18 },
      geometry: { type: "Point", coordinates: [-119.45, 36.86] }
    },
    {
      type: "Feature",
      properties: { name: "Paso Basin", intensity: 64, wind: 14 },
      geometry: { type: "Point", coordinates: [-120.72, 35.63] }
    },
    {
      type: "Feature",
      properties: { name: "North Valley Edge", intensity: 83, wind: 27 },
      geometry: { type: "Point", coordinates: [-122.05, 38.78] }
    }
  ]
};

const agriculturalZones: FeatureCollection<Polygon, ZoneProps> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { zone: "Central Orchard Belt" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-120.43, 38.03],
            [-118.96, 38.03],
            [-118.96, 36.76],
            [-120.43, 36.76],
            [-120.43, 38.03]
          ]
        ]
      }
    },
    {
      type: "Feature",
      properties: { zone: "Salinas Crop Corridor" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-122.18, 36.98],
            [-121.11, 36.98],
            [-121.11, 35.78],
            [-122.18, 35.78],
            [-122.18, 36.98]
          ]
        ]
      }
    }
  ]
};

export default function FireRiskMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const missingToken = !token;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    if (missingToken) {
      return;
    }

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [-120.2, 37.2],
      zoom: 5.7,
      pitch: 42,
      bearing: -16,
      antialias: true
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("agri-zones", {
        type: "geojson",
        data: agriculturalZones
      });

      map.addLayer({
        id: "agri-zones-fill",
        type: "fill",
        source: "agri-zones",
        paint: {
          "fill-color": "#8ed16f",
          "fill-opacity": 0.22
        }
      });

      map.addLayer({
        id: "agri-zones-line",
        type: "line",
        source: "agri-zones",
        paint: {
          "line-color": "#bdf985",
          "line-width": 1.6,
          "line-opacity": 0.75
        }
      });

      map.addSource("wildfires", {
        type: "geojson",
        data: wildfireHotspots
      });

      map.addLayer({
        id: "wildfire-points",
        type: "circle",
        source: "wildfires",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "intensity"],
            40,
            11,
            100,
            24
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "intensity"],
            40,
            "#ffd166",
            70,
            "#ff8c42",
            100,
            "#e63946"
          ],
          "circle-opacity": 0.82,
          "circle-stroke-color": "#fff5d4",
          "circle-stroke-width": 1.5
        }
      });

      map.on("mouseenter", "wildfire-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "wildfire-points", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "wildfire-points", (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") {
          return;
        }

        const coordinates = [...feature.geometry.coordinates] as [number, number];
        const name = String(feature.properties?.name ?? "Unknown fire");
        const intensity = String(feature.properties?.intensity ?? "N/A");
        const wind = String(feature.properties?.wind ?? "N/A");

        new mapboxgl.Popup({ offset: 14 })
          .setLngLat(coordinates)
          .setHTML(
            `<strong>${name}</strong><p>Heat index: ${intensity}/100<br/>Wind drift: ${wind} mph</p>`
          )
          .addTo(map);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [missingToken, token]);

  if (missingToken) {
    return (
      <div className="map-shell">
        <div className="map-empty">
          <p>Add a Mapbox token to enable the live map.</p>
          <code>NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here</code>
        </div>
      </div>
    );
  }

  return (
    <div className="map-shell">
      <div ref={mapContainerRef} className="map-container" />
      <div className="map-legend">
        <h4>Risk Legend</h4>
        <p>
          <span className="legend-dot low" />
          Moderate heat
        </p>
        <p>
          <span className="legend-dot high" />
          Extreme heat
        </p>
        <p>
          <span className="legend-zone" />
          Crop production zone
        </p>
      </div>
    </div>
  );
}
