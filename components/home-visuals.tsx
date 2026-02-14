"use client";

import dynamic from "next/dynamic";
import LoadingSurface from "@/components/loading-surface";

const FireRiskMap = dynamic(() => import("@/components/fire-risk-map"), {
  ssr: false,
  loading: () => <LoadingSurface label="Loading wildfire map..." />
});

const CropResilienceScene = dynamic(
  () => import("@/components/crop-resilience-scene"),
  {
    ssr: false,
    loading: () => <LoadingSurface label="Loading 3D resilience model..." />
  }
);

export default function HomeVisuals() {
  return (
    <section className="visual-grid">
      <article className="panel">
        <header className="panel-head">
          <p>Mapbox Intelligence Layer</p>
          <h3>Wildfire + Agriculture Risk Map</h3>
        </header>
        <FireRiskMap />
      </article>

      <article className="panel">
        <header className="panel-head">
          <p>Three.js Simulation Layer</p>
          <h3>Crop Resilience Model</h3>
        </header>
        <CropResilienceScene />
      </article>
    </section>
  );
}
