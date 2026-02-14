export type RiskLevel = "low" | "medium" | "high";

export type ReadyToPlotFirePoint = {
  confidence: number;
  frp: number;
  id: string;
  lat: number;
  lon: number;
  risk_hint: RiskLevel | string;
  time_utc: string;
};

export type ReadyToPlotFarmStatus = {
  cdl_class_code: number | null;
  crop_type: string;
  farm_id: string;
  farm_name: string;
  hour_utc: string;
  lat: number;
  lon: number;
  risk_level: RiskLevel;
  risk_score: number;
  top_driver: string;
};

export type ReadyToPlotChartRow = {
  crop_type: string;
  farm_id: string;
  farm_name: string;
  fire_count_24h: number;
  fire_intensity: number;
  fire_proximity: number;
  firms_min_distance_km: number;
  frp_sum_24h: number;
  heat_stress: number;
  hour_utc: string;
  latitude: number;
  longitude: number;
  relative_humidity_2m: number;
  risk_level: RiskLevel;
  risk_score: number;
  smoke_transport: number;
  temperature_2m: number;
  top_driver: string;
  wind_speed_10m: number;
};

export type RiskSignalTone = "alert" | "good" | "warn";

export type DashboardRiskSignal = {
  label: string;
  tone: RiskSignalTone;
  trend: string;
  value: string;
};

export type DashboardSummary = {
  activeFireClusters: number;
  builtAtUtc: string | null;
  dominantDriver: string;
  emberExposureEvents: number;
  highRiskFarms: number;
  latestFarmHourUtc: string | null;
  mediumRiskFarms: number;
  mitigationWindowMinutes: number;
  parBlockagePercent: number;
  riskDeltaPoints: number;
  smokeTaintIndex: number;
  topFarm: ReadyToPlotFarmStatus | null;
};

export type ReadyToPlotBundle = {
  chartRowCount: number;
  farmStatus: ReadyToPlotFarmStatus[];
  firePoints: ReadyToPlotFirePoint[];
  riskSignals: DashboardRiskSignal[];
  summary: DashboardSummary;
};
