"use client";

import dynamic from "next/dynamic";
import LoadingSurface from "@/components/loading-surface";
import AiGeoMitigationAdvisor from "@/components/ai-geo-mitigation-advisor";

const OperationsMap = dynamic(() => import("@/components/operations-map"), {
  ssr: false,
  loading: () => <LoadingSurface label="Booting field map..." />
});

const CropResilienceScene = dynamic(
  () => import("@/components/crop-resilience-scene"),
  {
    ssr: false,
    loading: () => <LoadingSurface label="Rendering atmospheric model..." />
  }
);

const RISK_SIGNALS = [
  {
    label: "Smoke Taint Index",
    value: "68 / 100",
    trend: "+9 in last 6h",
    tone: "alert"
  },
  {
    label: "PAR Blockage",
    value: "31%",
    trend: "Critical for nut crops",
    tone: "warn"
  },
  {
    label: "Ember Exposure",
    value: "17 events",
    trend: "Southwest edge",
    tone: "alert"
  },
  {
    label: "Mitigation Window",
    value: "03h 20m",
    trend: "Before plume intensifies",
    tone: "good"
  }
] as const;

const ASSET_ROWS = [
  { id: "TR-422", asset: "Drone Recon", status: "READY" },
  { id: "IRR-17", asset: "Sprinkler Zone 17", status: "ACTIVE" },
  { id: "BIO-03", asset: "Barrier Spray Team", status: "STAGED" },
  { id: "LOG-11", asset: "Harvest Crew Alpha", status: "PENDING" }
] as const;

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

const PLAYBOOK = [
  "Run sprinklers at 05:30-06:10 to clear residue before heat peak.",
  "Deploy barrier spray where smoke dose > 55 for two consecutive hours.",
  "Reallocate crews to blocks 4B and 7A for spot-fire patrol.",
  "Escalate to early harvest if grape smoke dose exceeds 72."
] as const;

const DATA_FUSION = [
  { name: "Open-Meteo", purpose: "Wind, humidity, smoke transport context" },
  { name: "NASA FIRMS", purpose: "Thermal anomalies and active fire points" },
  { name: "CAL FIRE Hub", purpose: "Incidents, perimeter updates, advisories" }
] as const;

export default function FieldCommanderDashboard() {
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

      <section className="fc-grid">
        <aside className="fc-side fc-left">
          <article className="fc-card">
            <h2>Request Asset</h2>
            <p>Route mitigation assets before smoke and embers hit orchard zones.</p>
            <div className="asset-table">
              {ASSET_ROWS.map((row) => (
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
              <li>05:12 - Asset request approved for sprinkler grid 17.</li>
              <li>05:28 - FIRMS hotspot intensity crossed threshold 80.</li>
              <li>05:41 - Wind shifted SW to NE, plume now targeting Yuba blocks.</li>
              <li>05:46 - Rinse window alert issued to nut growers.</li>
            </ol>
          </article>
        </aside>

        <section className="fc-main">
          <div className="risk-grid">
            {RISK_SIGNALS.map((signal) => (
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
            <OperationsMap />
          </article>

          <div className="fc-main-bottom">
            <article className="fc-card">
              <div className="fc-card-head">
                <div>
                  <p>Three.js Model</p>
                  <h2>Atmospheric Drift Simulation</h2>
                </div>
              </div>
              <CropResilienceScene />
            </article>

            <article className="fc-card">
              <div className="fc-card-head">
                <div>
                  <p>Action Queue</p>
                  <h2>Mitigation Playbook</h2>
                </div>
              </div>
              <ul className="playbook-list">
                {PLAYBOOK.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <aside className="fc-side fc-right">
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
              {DATA_FUSION.map((source) => (
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
        </aside>
      </section>
    </main>
  );
}
