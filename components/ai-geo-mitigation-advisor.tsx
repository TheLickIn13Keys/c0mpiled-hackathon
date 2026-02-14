"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock3,
  Database,
  Droplets,
  Leaf,
  LocateFixed,
  MapPin,
  Shield,
  Sparkles,
  Thermometer,
  Wind
} from "lucide-react";

type CropType = "almond" | "walnut" | "grape" | "mixed";

type Tile = {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  whyNow: string;
  modalTitle: string;
  modalSummary: string;
  actions: string[];
  tags: string[];
};

type AdvisorResponse = {
  areaLabel: string;
  lastUpdated: string;
  riskSummary: string;
  telemetry: {
    temperatureC: number;
    humidityPct: number;
    windMph: number;
    pm25: number;
    usAqi: number;
  };
  tiles: Tile[];
  sourceNotes: string[];
};

const DEFAULT_LOCATION = { lat: 39.14, lon: -121.62 };

function toLocalTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function AiGeoMitigationAdvisor() {
  const [cropType, setCropType] = useState<CropType>("mixed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdvisorResponse | null>(null);
  const [activeTile, setActiveTile] = useState<Tile | null>(null);

  const hasData = Boolean(data);

  const telemetry = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      { key: "temp", label: `Temp ${data.telemetry.temperatureC}C`, Icon: Thermometer },
      { key: "humidity", label: `Humidity ${data.telemetry.humidityPct}%`, Icon: Droplets },
      { key: "wind", label: `Wind ${data.telemetry.windMph} mph`, Icon: Wind },
      { key: "pm25", label: `PM2.5 ${data.telemetry.pm25}`, Icon: Activity },
      { key: "aqi", label: `US AQI ${data.telemetry.usAqi}`, Icon: AlertTriangle }
    ];
  }, [data]);

  function iconForTile(title: string) {
    const normalized = title.toLowerCase();
    if (normalized.includes("rinse")) {
      return Droplets;
    }
    if (normalized.includes("patrol") || normalized.includes("crew")) {
      return Shield;
    }
    return Leaf;
  }

  function iconForSource(note: string) {
    if (note.toLowerCase().includes("openai")) {
      return Sparkles;
    }
    if (note.toLowerCase().includes("air")) {
      return Wind;
    }
    return Database;
  }

  async function generatePlan(coords = DEFAULT_LOCATION) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/geo-mitigation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...coords, cropType })
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const payload = (await res.json()) as AdvisorResponse;
      setData(payload);
    } catch {
      setError("Unable to fetch mitigation options right now.");
    } finally {
      setLoading(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void generatePlan({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      },
      () => {
        setError("Location access denied. Using default pilot location is still available.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <article className="fc-card ai-advisor-card">
      <div className="fc-card-head">
        <div>
          <p>AI Feature</p>
          <h2>Geo Mitigation Advisor</h2>
        </div>
      </div>

      <p>
        Generate location-specific prevention and crop-protection options as actionable
        tiles for field teams.
      </p>

      <div className="advisor-controls">
        <select
          value={cropType}
          onChange={(event) => setCropType(event.target.value as CropType)}
        >
          <option value="mixed">Mixed Farm</option>
          <option value="almond">Almond</option>
          <option value="walnut">Walnut</option>
          <option value="grape">Grapes</option>
        </select>

        <button type="button" onClick={useMyLocation} disabled={loading}>
          <LocateFixed size={14} aria-hidden="true" />
          Use My Location
        </button>

        <button
          type="button"
          className="primary"
          onClick={() => {
            void generatePlan();
          }}
          disabled={loading}
        >
          <Sparkles size={14} aria-hidden="true" />
          {loading ? "Generating..." : "Generate Tiles"}
        </button>
      </div>

      {error ? <p className="advisor-error">{error}</p> : null}

      {hasData ? (
        <div className="advisor-results">
          <div className="advisor-meta">
            <span>
              <MapPin size={13} aria-hidden="true" />
              {data.areaLabel}
            </span>
            <span>
              <Clock3 size={13} aria-hidden="true" />
              Updated {toLocalTime(data.lastUpdated)}
            </span>
          </div>

          <p className="advisor-summary">{data.riskSummary}</p>

          <div className="advisor-telemetry">
            {telemetry.map((item) => (
              <span key={item.key}>
                <item.Icon size={12} aria-hidden="true" />
                {item.label}
              </span>
            ))}
          </div>

          <div className="advisor-tile-grid">
            {data.tiles.map((tile) => (
              <button key={tile.id} type="button" className={`advisor-tile ${tile.priority}`} onClick={() => setActiveTile(tile)}>
                <div className="advisor-tile-main">
                  <i className="advisor-tile-icon" aria-hidden="true">
                    {(() => {
                      const Icon = iconForTile(tile.title);
                      return <Icon size={15} />;
                    })()}
                  </i>
                  <div>
                    <b>{tile.title}</b>
                    <small>{tile.whyNow}</small>
                  </div>
                </div>
                <span>
                  <AlertTriangle size={12} aria-hidden="true" />
                  {tile.priority}
                </span>
              </button>
            ))}
          </div>

          <div className="advisor-sources">
            <span>Sources:</span>
            {data.sourceNotes.map((note) => {
              const Icon = iconForSource(note);
              return (
                <b key={note} className="source-note">
                  <Icon size={12} aria-hidden="true" />
                  {note}
                </b>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeTile ? (
        <div className="advisor-modal-backdrop" role="dialog" aria-modal="true">
          <div className="advisor-modal">
            <div className="advisor-modal-head">
              <h3>{activeTile.modalTitle}</h3>
              <button type="button" onClick={() => setActiveTile(null)}>
                Close
              </button>
            </div>

            <p>{activeTile.modalSummary}</p>

            <ul>
              {activeTile.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>

            <div className="advisor-tags">
              {activeTile.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
