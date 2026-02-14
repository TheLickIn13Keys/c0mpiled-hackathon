import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  DashboardRiskSignal,
  DashboardSummary,
  ReadyToPlotBundle,
  ReadyToPlotChartRow,
  ReadyToPlotFarmStatus,
  ReadyToPlotFirePoint,
  RiskLevel
} from "@/lib/ready-to-plot-types";

type Manifest = {
  built_at_utc?: string;
};

const READY_TO_PLOT_DIR = path.join(process.cwd(), "etl-pipeline", "ready_to_plot");

const DEFAULT_SIGNALS: DashboardRiskSignal[] = [
  { label: "Smoke Taint Index", value: "0 / 100", trend: "No chart data loaded", tone: "warn" },
  { label: "PAR Blockage", value: "0%", trend: "No chart data loaded", tone: "warn" },
  { label: "Ember Exposure", value: "0 events", trend: "No FIRMS points loaded", tone: "warn" },
  { label: "Mitigation Window", value: "--", trend: "No recommendation available", tone: "warn" }
];

async function readJson(pathname: string): Promise<unknown> {
  try {
    const file = await readFile(pathname, "utf8");
    return JSON.parse(file) as unknown;
  } catch {
    return null;
  }
}

async function readJsonl<T>(pathname: string): Promise<T[]> {
  try {
    const file = await readFile(pathname, "utf8");
    return file
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function riskTone(level: RiskLevel): DashboardRiskSignal["tone"] {
  if (level === "high") {
    return "alert";
  }
  if (level === "medium") {
    return "warn";
  }
  return "good";
}

function computeSummary(
  firePoints: ReadyToPlotFirePoint[],
  farmStatus: ReadyToPlotFarmStatus[],
  chartRows: ReadyToPlotChartRow[],
  builtAtUtc: string | null
): DashboardSummary {
  const highRiskFarms = farmStatus.filter((row) => row.risk_level === "high").length;
  const mediumRiskFarms = farmStatus.filter((row) => row.risk_level === "medium").length;
  const topFarm =
    farmStatus.length > 0
      ? [...farmStatus].sort((a, b) => b.risk_score - a.risk_score)[0]
      : null;

  const driverCounts = farmStatus.reduce<Record<string, number>>((acc, row) => {
    acc[row.top_driver] = (acc[row.top_driver] ?? 0) + 1;
    return acc;
  }, {});
  const dominantDriver =
    Object.entries(driverCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  const chartByHour = chartRows.reduce<Record<string, ReadyToPlotChartRow[]>>((acc, row) => {
    (acc[row.hour_utc] ??= []).push(row);
    return acc;
  }, {});
  const sortedHours = Object.keys(chartByHour).sort((a, b) => a.localeCompare(b));
  const latestHour = sortedHours.at(-1) ?? null;
  const previousHour = sortedHours.at(-2) ?? null;

  const latestRows = latestHour ? chartByHour[latestHour] ?? [] : [];
  const previousRows = previousHour ? chartByHour[previousHour] ?? [] : [];

  const avgRisk = (rows: ReadyToPlotChartRow[]) =>
    rows.length > 0 ? rows.reduce((sum, row) => sum + row.risk_score, 0) / rows.length : 0;

  const latestAvgRisk = avgRisk(latestRows);
  const previousAvgRisk = avgRisk(previousRows);

  const latestAvgHeatStress =
    latestRows.length > 0
      ? latestRows.reduce((sum, row) => sum + row.heat_stress, 0) / latestRows.length
      : 0;

  const smokeTaintIndex = Math.round(latestAvgRisk * 100);
  const parBlockagePercent = Math.round((0.55 * latestAvgRisk + 0.45 * latestAvgHeatStress) * 100);
  const riskDeltaPoints = Math.round((latestAvgRisk - previousAvgRisk) * 100);

  const emberExposureEvents = firePoints.filter((point) => point.risk_hint !== "low").length;
  const mitigationWindowMinutes =
    topFarm?.risk_level === "high" ? 75 : topFarm?.risk_level === "medium" ? 160 : 300;

  return {
    activeFireClusters: firePoints.length,
    builtAtUtc,
    dominantDriver,
    emberExposureEvents,
    highRiskFarms,
    latestFarmHourUtc: farmStatus[0]?.hour_utc ?? latestHour,
    mediumRiskFarms,
    mitigationWindowMinutes,
    parBlockagePercent: Math.max(0, Math.min(100, parBlockagePercent)),
    riskDeltaPoints,
    smokeTaintIndex: Math.max(0, Math.min(100, smokeTaintIndex)),
    topFarm
  };
}

function buildRiskSignals(summary: DashboardSummary): DashboardRiskSignal[] {
  const riskTrend =
    summary.riskDeltaPoints > 0
      ? `+${summary.riskDeltaPoints} in last hour`
      : summary.riskDeltaPoints < 0
        ? `${summary.riskDeltaPoints} in last hour`
        : "No delta in last hour";

  const emberTrend = `${summary.activeFireClusters} clusters in current extract`;
  const etaHours = Math.floor(summary.mitigationWindowMinutes / 60)
    .toString()
    .padStart(2, "0");
  const etaMinutes = Math.floor(summary.mitigationWindowMinutes % 60)
    .toString()
    .padStart(2, "0");

  return [
    {
      label: "Smoke Taint Index",
      value: `${summary.smokeTaintIndex} / 100`,
      trend: riskTrend,
      tone: summary.smokeTaintIndex >= 70 ? "alert" : summary.smokeTaintIndex >= 40 ? "warn" : "good"
    },
    {
      label: "PAR Blockage",
      value: `${summary.parBlockagePercent}%`,
      trend: `${summary.highRiskFarms} farms in high-risk band`,
      tone: summary.parBlockagePercent >= 65 ? "alert" : summary.parBlockagePercent >= 35 ? "warn" : "good"
    },
    {
      label: "Ember Exposure",
      value: `${summary.emberExposureEvents} events`,
      trend: emberTrend,
      tone: summary.emberExposureEvents >= 5 ? "alert" : summary.emberExposureEvents > 0 ? "warn" : "good"
    },
    {
      label: "Mitigation Window",
      value: `${etaHours}h ${etaMinutes}m`,
      trend: `Primary driver: ${summary.dominantDriver.replace("_", " ")}`,
      tone: summary.topFarm ? riskTone(summary.topFarm.risk_level) : "warn"
    }
  ];
}

export async function loadReadyToPlotBundle(): Promise<ReadyToPlotBundle> {
  const firePoints = await readJsonl<ReadyToPlotFirePoint>(
    path.join(READY_TO_PLOT_DIR, "map_fire_points.jsonl")
  );
  const farmStatus = await readJsonl<ReadyToPlotFarmStatus>(
    path.join(READY_TO_PLOT_DIR, "map_farm_status.jsonl")
  );
  const chartRows = await readJsonl<ReadyToPlotChartRow>(
    path.join(READY_TO_PLOT_DIR, "chart_farm_timeseries.jsonl")
  );
  const manifestRaw = await readJson(path.join(READY_TO_PLOT_DIR, "manifest.json"));
  const manifest = (manifestRaw as Manifest | null) ?? null;
  const builtAtUtc = manifest?.built_at_utc ?? null;

  if (firePoints.length === 0 && farmStatus.length === 0 && chartRows.length === 0) {
    const emptySummary: DashboardSummary = {
      activeFireClusters: 0,
      builtAtUtc,
      dominantDriver: "unknown",
      emberExposureEvents: 0,
      highRiskFarms: 0,
      latestFarmHourUtc: null,
      mediumRiskFarms: 0,
      mitigationWindowMinutes: 0,
      parBlockagePercent: 0,
      riskDeltaPoints: 0,
      smokeTaintIndex: 0,
      topFarm: null
    };

    return {
      chartRowCount: 0,
      farmStatus,
      firePoints,
      riskSignals: DEFAULT_SIGNALS,
      summary: emptySummary
    };
  }

  const summary = computeSummary(firePoints, farmStatus, chartRows, builtAtUtc);
  const riskSignals = buildRiskSignals(summary);

  return {
    chartRowCount: chartRows.length,
    farmStatus,
    firePoints,
    riskSignals,
    summary
  };
}
