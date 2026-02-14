"use client";

import dynamic from "next/dynamic";
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

const PERSONAS = [
  {
    name: "Nut Grower (Almonds / Walnuts)",
    concern: "Energy reserve depletion from PAR blockage",
    guidance: "Prioritize rinse windows and irrigation buffering before noon."
  },
  {
    name: "Viticulturist (Grapes)",
    concern: "Smoke taint compounds in fruit skin",
    guidance: "Track cumulative dose and prep early harvest + barrier spray."
  }
] as const;

type FieldCommanderDashboardProps = {
  data: ReadyToPlotBundle;
};

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
  const assetRows = [
    {
      id: "FIRMS",
      asset: "Thermal Detections",
      status: `${data.summary.activeFireClusters} LOADED`
    },
    {
      id: "RISK",
      asset: "Farm Status Points",
      status: `${data.farmStatus.length} ACTIVE`
    },
    {
      id: "TS",
      asset: "Hourly Feature Rows",
      status: `${data.chartRowCount} READY`
    },
    {
      id: "ETA",
      asset: "Snapshot Built",
      status: asLocalLabel(data.summary.builtAtUtc)
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

  return (
    <main className="fc-shell">
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
              <h2>Request Asset</h2>
              <p>Route mitigation assets before smoke and embers hit orchard zones.</p>
              <div className="asset-table">
                {assetRows.map((row) => (
                  <div key={row.id} className="asset-row">
                    <div>
                      <strong>{row.id}</strong>
                      <span>{row.asset}</span>
                    </div>
                    <b>{row.status}</b>
                  </div>
                ))}
              </div>
            </article>

            <article className="fc-card">
              <h2>Field Reporting</h2>
              <p>Drop pins for embers, spot fires, wind shear, and smoke smell directly on the map.</p>
              <ul className="chip-list">
                <li>Embers</li>
                <li>Spot Fire</li>
                <li>Wind Shear</li>
                <li>Smoke Smell</li>
              </ul>
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
            <OperationsMap firePoints={data.firePoints} farmStatus={data.farmStatus} />
          </article>

          <div className="fc-main-bottom">
            <article className="fc-card">
              <div className="fc-card-head">
                <div>
                  <p>Three.js Model</p>
                  <h2>Almond Ember Ignition Simulation</h2>
                </div>
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
              <h2>Persona Intelligence</h2>
              <div className="persona-list">
                {PERSONAS.map((persona) => (
                  <section key={persona.name} className="persona-card">
                    <h3>{persona.name}</h3>
                    <p>
                      <strong>Concern:</strong> {persona.concern}
                    </p>
                    <p>
                      <strong>Guidance:</strong> {persona.guidance}
                    </p>
                  </section>
                ))}
              </div>
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
