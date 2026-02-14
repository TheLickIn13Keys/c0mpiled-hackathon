"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import LoadingSurface from "@/components/loading-surface";
import AiGeoMitigationAdvisor from "@/components/ai-geo-mitigation-advisor";
import type { ReadyToPlotBundle } from "@/lib/ready-to-plot-types";

const OperationsMap = dynamic(() => import("@/components/operations-map"), {
  ssr: false,
  loading: () => <LoadingSurface label="Booting field map..." />
});

const CropResilienceScene = dynamic(
  () => import("@/components/crop-resilience-scene"),
  {
    ssr: false,
    loading: () => <LoadingSurface label="Rendering almond ignition model..." />
  }
);

type FieldCommanderDashboardProps = {
  data: ReadyToPlotBundle;
};

type MockFarmRecord = {
  acres: number;
  crop: string;
  farmName: string;
  irrigation: string;
  locationAliases: string[];
  locationLabel: string;
  primaryThreats: string[];
  recommendedActions: string[];
  riskExposure: number;
};

const MOCK_FARM_DATA: MockFarmRecord[] = [
  {
    farmName: "River Bend Almond Block",
    locationLabel: "Yuba County, CA 95991",
    locationAliases: ["yuba", "95991", "marysville", "yuba county"],
    crop: "Almond",
    acres: 420,
    irrigation: "Micro-sprinkler",
    riskExposure: 0.38,
    primaryThreats: ["PAR Blockage", "Heat Stress"],
    recommendedActions: ["Irrigation Buffer Window (160 min remaining)", "Rinse Cycle Optimization"]
  },
  {
    farmName: "Sutter South Vineyard",
    locationLabel: "Sutter County, CA 95982",
    locationAliases: ["sutter", "95982", "yuba city", "sutter county"],
    crop: "Grape",
    acres: 180,
    irrigation: "Drip",
    riskExposure: 0.3,
    primaryThreats: ["Smoke Taint Compounds", "Ember Exposure"],
    recommendedActions: ["Cumulative Dose Tracking", "Barrier Spray + Early Harvest Decision Gate"]
  },
  {
    farmName: "Feather Walnut Unit",
    locationLabel: "Butte County, CA 95965",
    locationAliases: ["butte", "95965", "oroville", "butte county"],
    crop: "Walnut",
    acres: 305,
    irrigation: "Flood + Drip Hybrid",
    riskExposure: 0.44,
    primaryThreats: ["Ash Deposition", "Canopy Heat Loading"],
    recommendedActions: ["Canopy Cooldown Cycle", "Perimeter Ember Patrol"]
  }
] as const;

function asLocalLabel(value: string | null) {
  if (!value) {
    return "Unknown";
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return value;
  }
  return dt.toLocaleString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZoneName: "short"
  });
}

export default function FieldCommanderDashboard({ data }: FieldCommanderDashboardProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const osintFeed = [
    {
      user: "CAL FIRE AEU",
      handle: "@CALFIRE_AEU",
      initials: "CF",
      tone: "cyan",
      time: "05:12",
      confidence: "0.86",
      post: "Sprinkler Grid 17 activation confirmed by field relay. Asset request marked approved.",
      tags: ["sprinklers", "field-ops"]
    },
    {
      user: "CAL FIRE Intel",
      handle: "@CALFIRE_Intel",
      initials: "CF",
      tone: "amber",
      time: "05:28",
      confidence: "0.92",
      post: "NASA FIRMS thermal signal crossed intensity threshold 80 near southwest perimeter.",
      tags: ["firms", "hotspot"]
    },
    {
      user: "CAL FIRE Ops",
      handle: "@CALFIRE_Ops",
      initials: "CF",
      tone: "violet",
      time: "05:41",
      confidence: "0.89",
      post: "Wind corridor rotated SW->NE. Current plume path intersects Yuba operational blocks.",
      tags: ["wind-shift", "plume"]
    },
    {
      user: "CAL FIRE Region North",
      handle: "@CALFIRE_North",
      initials: "CF",
      tone: "green",
      time: "05:46",
      confidence: "0.84",
      post: "Rinse-window alert dispatched to almond and walnut operators ahead of heat peak.",
      tags: ["alert", "nut-growers"]
    }
  ] as const;

  const timeline = [
    `Snapshot refreshed ${asLocalLabel(data.summary.builtAtUtc)}.`,
    data.summary.topFarm
      ? `${data.summary.topFarm.farm_name} flagged ${data.summary.topFarm.risk_level.toUpperCase()} at score ${Math.round(data.summary.topFarm.risk_score * 100)}.`
      : "No top-risk farm identified from current extract.",
    `Dominant driver across farms: ${data.summary.dominantDriver.replace("_", " ")}.`,
    `Latest farm status hour: ${asLocalLabel(data.summary.latestFarmHourUtc)}.`
  ] as const;

  const playbook = [
    `Stage sprinkler rinse before ${Math.max(15, data.summary.mitigationWindowMinutes)} minutes to reduce particulate adhesion.`,
    `Focus patrols on ${data.summary.highRiskFarms} high-risk farms and ${data.summary.mediumRiskFarms} medium-risk farms.`,
    `Prioritize sites where top driver is ${data.summary.dominantDriver.replace("_", " ")}.`,
    "Continue collecting ember and smoke smell reports to tighten local confidence."
  ] as const;

  const dataFusion = [
    { name: "Open-Meteo", purpose: `${data.chartRowCount} hourly weather-feature rows in chart dataset` },
    { name: "NASA FIRMS", purpose: `${data.firePoints.length} thermal points loaded for map rendering` },
    { name: "CDL + Farm Grid", purpose: `${data.farmStatus.length} farm statuses with crop type and risk level` }
  ] as const;

  const emberRatePerMinute = Math.max(
    40,
    Math.round(data.summary.activeFireClusters * 22 + data.summary.emberExposureEvents * 8)
  );
  const ignitionNodes = Math.min(6, Math.max(1, Math.ceil(data.summary.highRiskFarms / 30)));
  const gridClassName = `fc-grid${leftCollapsed ? " left-collapsed" : ""}${rightCollapsed ? " right-collapsed" : ""}`;
  const [locationQuery, setLocationQuery] = useState("Yuba County");
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [farmDraft, setFarmDraft] = useState<{
    acres: string;
    crop: string;
    farmName: string;
    irrigation: string;
    locationLabel: string;
    primaryThreats: string;
    recommendedActions: string;
    riskExposure: string;
  } | null>(null);

  function parseLocationToMockFarm() {
    const normalized = locationQuery.trim().toLowerCase();
    if (!normalized) {
      setProfileStatus("Enter a location or ZIP to parse farm data.");
      return;
    }

    const record =
      MOCK_FARM_DATA.find((farm) =>
        farm.locationAliases.some((alias) => normalized.includes(alias))
      ) ?? MOCK_FARM_DATA[0];

    setFarmDraft({
      farmName: record.farmName,
      locationLabel: record.locationLabel,
      crop: record.crop,
      acres: String(record.acres),
      irrigation: record.irrigation,
      riskExposure: record.riskExposure.toFixed(2),
      primaryThreats: record.primaryThreats.join("\n"),
      recommendedActions: record.recommendedActions.join("\n")
    });
    setProfileStatus(`Parsed mock farm profile for ${record.locationLabel}.`);
    setLastUpdatedAt(null);
  }

  function updateDraftField(
    field:
      | "acres"
      | "crop"
      | "farmName"
      | "irrigation"
      | "locationLabel"
      | "primaryThreats"
      | "recommendedActions"
      | "riskExposure",
    value: string
  ) {
    setFarmDraft((previous) => (previous ? { ...previous, [field]: value } : previous));
  }

  function saveFarmProfile() {
    if (!farmDraft) {
      return;
    }
    setLastUpdatedAt(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
    setProfileStatus("Farm profile updated and ready for downstream recommendations.");
  }

  return (
    <main className={`fc-shell ${theme === "dark" ? "theme-dark" : "theme-light"}`}>
      <header className="fc-topbar">
        <div className="fc-brand">
          <p className="fc-version">FieldCommander v1</p>
          <h1>Operation Orchard Shield</h1>
        </div>
        <div className="fc-tabs">
          <button type="button" className="active">
            Global Overview
          </button>
          <button type="button">Crop Risk Grid</button>
          <button type="button">Mitigation Planner</button>
        </div>
        <div className="fc-status">
          <span>California / Yuba-Sutter Pilot</span>
          <span className="live-dot">LIVE</span>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </header>

      <section className={gridClassName}>
        <aside className={`fc-side fc-left${leftCollapsed ? " is-collapsed" : ""}`}>
          <button
            type="button"
            className="side-toggle"
            aria-expanded={!leftCollapsed}
            aria-controls="left-sidebar-content"
            onClick={() => setLeftCollapsed((prev) => !prev)}
          >
            {leftCollapsed ? "Expand Left Panel" : "Collapse Left Panel"}
          </button>
          <p className="side-collapsed-label">Operations</p>
          <div id="left-sidebar-content" className="side-content">
            <article className="fc-card">
              <h2>Firewatch OSINT Feed</h2>
              <p>Mock Twitter intelligence stream for rapid incident context.</p>
              <div className="osint-feed">
                {osintFeed.map((item) => (
                  <article key={`${item.handle}-${item.time}`} className={`osint-post ${item.tone}`}>
                    <div className="osint-head">
                      <div className="osint-identity">
                        <i className={`osint-avatar ${item.tone}`} aria-hidden="true">
                          <Image
                            src="/calfire-logo.png"
                            alt="CAL FIRE logo"
                            width={20}
                            height={20}
                          />
                        </i>
                        <div>
                          <strong>{item.user}</strong>
                          <span>{item.handle}</span>
                        </div>
                      </div>
                      <b>{item.time}</b>
                    </div>
                    <p className="osint-post-body">{item.post}</p>
                    <div className="osint-meta">
                      <span className="osint-confidence">Confidence {item.confidence}</span>
                    </div>
                    <div className="osint-tags">
                      {item.tags.map((tag) => (
                        <i key={`${item.handle}-${tag}`}>#{tag}</i>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="fc-card">
              <h2>Response Timeline</h2>
              <ol className="timeline">
                {timeline.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ol>
            </article>
          </div>
        </aside>

        <section className="fc-main">
          <div className="risk-grid">
            {data.riskSignals.map((signal) => (
              <article key={signal.label} className={`risk-card ${signal.tone}`}>
                <p>{signal.label}</p>
                <h3>{signal.value}</h3>
                <span>{signal.trend}</span>
                <div className="metric-provenance">
                  <small>Derived: FIRMS + Open-Meteo + Field Reports</small>
                  <small>Confidence: {signal.tone === "alert" ? "0.86" : signal.tone === "warn" ? "0.79" : "0.74"}</small>
                </div>
              </article>
            ))}
          </div>

          <article className="fc-card fc-map-card">
            <div className="fc-card-head">
              <div>
                <p>Thermal + Weather + Farmer Reports</p>
                <h2>Agricultural Fire Command Map</h2>
              </div>
              <span className="ghost-tag">Click map to add field report pins</span>
            </div>
            <OperationsMap
              firePoints={data.firePoints}
              farmBoundaries={data.farmBoundaries}
              farmStatus={data.farmStatus}
            />
          </article>

          <div className="fc-main-bottom">
            <article className="fc-card">
              <div className="fc-card-head">
                <div>
                  <p>Three.js Model</p>
                  <h2>Almond Ember Ignition Simulation</h2>
                </div>
              </div>
              <div className="sim-control-grid">
                <label>
                  Ember rate / min
                  <input type="range" min="20" max="220" value={emberRatePerMinute} readOnly />
                  <span>{emberRatePerMinute}</span>
                </label>
                <label>
                  Ignition nodes
                  <input type="range" min="1" max="8" value={ignitionNodes} readOnly />
                  <span>{ignitionNodes}</span>
                </label>
                <label>
                  Rinse window (min)
                  <input
                    type="range"
                    min="10"
                    max="240"
                    value={Math.max(15, data.summary.mitigationWindowMinutes)}
                    readOnly
                  />
                  <span>{Math.max(15, data.summary.mitigationWindowMinutes)}</span>
                </label>
              </div>
              <CropResilienceScene
                emberRatePerMinute={emberRatePerMinute}
                ignitionNodes={ignitionNodes}
                rinseWindowMinutes={Math.max(15, data.summary.mitigationWindowMinutes)}
              />
            </article>

            <article className="fc-card">
              <div className="fc-card-head">
                <div>
                  <p>Action Queue</p>
                  <h2>Mitigation Playbook</h2>
                </div>
              </div>
              <ul className="playbook-list">
                {playbook.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <aside className={`fc-side fc-right${rightCollapsed ? " is-collapsed" : ""}`}>
          <button
            type="button"
            className="side-toggle"
            aria-expanded={!rightCollapsed}
            aria-controls="right-sidebar-content"
            onClick={() => setRightCollapsed((prev) => !prev)}
          >
            {rightCollapsed ? "Expand Right Panel" : "Collapse Right Panel"}
          </button>
          <p className="side-collapsed-label">Intel</p>
          <div id="right-sidebar-content" className="side-content">
            <article className="fc-card">
              <h2>Farm Profile Resolver</h2>
              <p>Input your location to parse a mock farm profile, then update fields before planning actions.</p>
              <div className="farm-resolver-input">
                <input
                  type="text"
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.target.value)}
                  placeholder="Enter county, city, or ZIP"
                />
                <button type="button" onClick={parseLocationToMockFarm}>
                  Parse Farm Data
                </button>
              </div>
              {profileStatus ? <p className="farm-resolver-status">{profileStatus}</p> : null}
              {farmDraft ? (
                <div className="farm-profile-form">
                  <label>
                    Farm Name
                    <input value={farmDraft.farmName} onChange={(event) => updateDraftField("farmName", event.target.value)} />
                  </label>
                  <label>
                    Location
                    <input value={farmDraft.locationLabel} onChange={(event) => updateDraftField("locationLabel", event.target.value)} />
                  </label>
                  <div className="farm-profile-grid">
                    <label>
                      Crop
                      <input value={farmDraft.crop} onChange={(event) => updateDraftField("crop", event.target.value)} />
                    </label>
                    <label>
                      Acres
                      <input value={farmDraft.acres} onChange={(event) => updateDraftField("acres", event.target.value)} />
                    </label>
                    <label>
                      Risk Exposure
                      <input value={farmDraft.riskExposure} onChange={(event) => updateDraftField("riskExposure", event.target.value)} />
                    </label>
                  </div>
                  <label>
                    Irrigation System
                    <input value={farmDraft.irrigation} onChange={(event) => updateDraftField("irrigation", event.target.value)} />
                  </label>
                  <label>
                    Primary Threat Vector (1 per line)
                    <textarea value={farmDraft.primaryThreats} onChange={(event) => updateDraftField("primaryThreats", event.target.value)} />
                  </label>
                  <label>
                    Recommended Action (1 per line)
                    <textarea value={farmDraft.recommendedActions} onChange={(event) => updateDraftField("recommendedActions", event.target.value)} />
                  </label>
                  <div className="farm-profile-actions">
                    <button type="button" onClick={saveFarmProfile}>
                      Save Updates
                    </button>
                    {lastUpdatedAt ? <span>Updated {lastUpdatedAt}</span> : null}
                  </div>
                </div>
              ) : null}
            </article>

            <AiGeoMitigationAdvisor />

            <article className="fc-card">
              <h2>Data Fusion Stack</h2>
              <ul className="source-list">
                {dataFusion.map((source) => (
                  <li key={source.name}>
                    <strong>{source.name}</strong>
                    <span>{source.purpose}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="fc-card">
              <h2>Why This Matters</h2>
              <p>
                Existing wildfire tools optimize evacuation zones. FieldCommander
                is optimized for crop survival: smoke taint, PAR loss, heat stress,
                and ember exposure before yield is lost.
              </p>
            </article>
          </div>
        </aside>
      </section>
    </main>
  );
}
