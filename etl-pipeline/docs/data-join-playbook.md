# FieldCommander Data Join Playbook

This document defines how to combine Open-Meteo, CAL FIRE incidents, NASA FIRMS, and USDA Cropland Data Layer (CDL) into a single farm-risk view.

## 1) Source Inputs

## Open-Meteo
- Type: gridded weather forecast and historical observations
- Core fields:
  - `time` (ISO timestamp)
  - `latitude`, `longitude` (grid cell location)
  - `wind_speed_10m`, `wind_direction_10m`
  - `temperature_2m`, `relative_humidity_2m`
  - optional smoke proxy fields (visibility, cloud cover)
- Grain: hourly timeseries at grid cells

## CAL FIRE incidents
- Type: incident metadata (active and historical)
- Useful query params:
  - `year=YYYY`
  - `inactive=true|false`
- Core fields:
  - incident id/name
  - status + timestamps
  - location + perimeter where available
  - acreage, containment
- Grain: per incident (event-level)

## NASA FIRMS
- Type: active fire/hotspot detections
- Core fields (typical):
  - `latitude`, `longitude`
  - `acq_date`, `acq_time`
  - `confidence`
  - `frp` (fire radiative power)
  - satellite/instrument source
- Grain: per satellite detection point

## USDA Cropland Data Layer (CDL)
- Type: raster land-cover/crop classification
- Notes:
  - 2024+ has 10m products (historical often 30m)
  - annual snapshots
- Core fields:
  - pixel geometry
  - crop class code
- Grain: pixel

## 2) Canonical Model

Use a farm-centered model. Every join should eventually resolve to `farm_id` and `event_hour_utc`.

Core entities:
- `farm_asset`
  - `farm_id`
  - boundary geometry
  - primary crop(s)
- `fire_detection`
  - normalized FIRMS rows
- `fire_incident`
  - normalized CAL FIRE rows
- `weather_hourly`
  - normalized Open-Meteo rows
- `farm_crop_cover`
  - CDL-derived crop mix by farm for a given year
- `farm_risk_hourly`
  - fused output features + risk scores

## 3) Non-Negotiable Join Decisions

1. Spatial reference decision:
- Store interchange geometry in WGS84 (`EPSG:4326`).
- Run distance/area math in a projected CRS appropriate for California (`EPSG:3310`).

2. Time decision:
- Normalize all source timestamps to UTC.
- Also store `local_time` in farm timezone for operational advice.

3. Grain decision:
- Risk table grain should be `farm_id x hour`.
- Keep raw detections/incidents at native grain and aggregate into farm-hour features.

4. Key decision:
- Never join by incident name.
- Use source IDs where available; otherwise generate stable hashes from source + timestamp + coordinates.

## 4) Join Logic by Source Pair

## FIRMS -> Farm
- Primary join: spatial nearest/intersection against farm boundary or farm buffer.
- Suggested default: 50 km search radius.
- Features to produce:
  - min distance to detection
  - weighted FRP sum
  - detection count by confidence band

## CAL FIRE -> Farm
- Primary join: farm intersects incident perimeter.
- Fallback join: distance from farm centroid to incident geometry/point.
- Suggested default fallback radius: 120 km.
- Features:
  - nearest active incident distance
  - containment-weighted threat indicator
  - days since incident start

## Open-Meteo -> Farm
- Join by nearest weather grid cell to farm centroid.
- Optionally area-weight average for large farms.
- Features:
  - wind direction/speed
  - heat stress proxies (temperature + humidity)
  - ventilation/smoke persistence proxies

## CDL -> Farm
- Spatial overlay of farm polygon against CDL raster.
- Produce yearly crop composition percentages by farm.
- Use this to route crop-specific risk models (grapes vs nut trees).

## 5) Risk Feature Layer (Farm-Hour)

Build these first; scoring can evolve later:
- `fire_proximity_score`: function of nearest detection distance + FRP + confidence
- `smoke_transport_score`: wind alignment from fire location toward farm
- `heat_stress_score`: temperature + humidity + recent persistence
- `crop_vulnerability_factor`: based on crop type and growth stage
- `combined_risk_score`: weighted blend of the above

## 6) Hackathon Defaults (Recommended)

- FIRMS freshness window: last 24h
- FIRMS distance cap: 50 km
- CAL FIRE distance cap (fallback): 120 km
- Risk recompute cadence: every 60 minutes
- Incident poll cadence: every 15 minutes
- Weather pull cadence: every 1-3 hours
- CDL refresh cadence: annual

## 7) Data Quality Rules

- Deduplicate FIRMS by `(source, acq_datetime_utc, lat, lon, satellite)`.
- Drop impossible coordinates and malformed timestamps.
- Mark all derived rows with:
  - source timestamp
  - ingestion timestamp
  - transform version
- Keep NRT-vs-final quality flag for FIRMS records.

## 8) Decisions You Should Lock Early

- What is the farm geometry source of truth?
- Which crop-level risk actions are in scope for MVP advice?
- What confidence threshold triggers proactive alerts?
- Do you optimize for low false negatives (safety) or low false positives (alert fatigue)?

## 9) Suggested Table Contracts

- `raw_firms_events`
- `raw_calfire_incidents`
- `raw_openmeteo_hourly`
- `raw_cdl_tiles`
- `curated_farm_weather_hourly`
- `curated_farm_fire_signals_hourly`
- `mart_farm_risk_hourly`

