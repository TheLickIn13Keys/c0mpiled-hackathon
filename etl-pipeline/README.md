# FieldCommander (Working Name)

Data + decision support for farmers facing wildfire smoke and heat impacts.

## Executive Summary

FieldCommander is designed to help farmers reduce crop loss and improve field safety during wildfire events.  
Most existing fire tools prioritize evacuation and public safety zones. This product instead prioritizes **agricultural risk and yield protection**.

The platform aims to fuse:

- Satellite thermal detections (e.g., NASA FIRMS)
- Smoke and weather data (wind, temperature, humidity, etc.)
- Fire alerts/news context
- Agricultural research signals (including UC Davis-inspired risk logic)

Output: a farm-centered map plus actionable recommendations for mitigating smoke taint, heat stress, and ember risk.

## Problem Context

- Wildfire smoke and ash can create severe losses even far from active flame fronts.
- Key agriculture risks include smoke taint compounds, reduced photosynthesis from PAR blocking, and heat stress.
- Farmers often have mitigation options (sprinklers, biofilms/barrier sprays, early harvest), but lack timely, farm-specific risk modeling.
- Connectivity and awareness gaps in ag-pass regions can worsen outcomes.

## Target Users

1. Nut grower (almonds/walnuts):
- Concern: energy reserve depletion from smoke-reduced sunlight.
- Need: timing guidance for protective rinse/sprinkler windows.

2. Viticulturist (grapes):
- Concern: cumulative smoke taint exposure.
- Need: smoke-dose-informed harvest and treatment decisions.

## Product Direction (MVP)

1. Risk map for farms:
- Overlay farm boundaries and crop type.
- Show smoke plume direction/velocity and likely spread.
- Add projected risk polygons (fire/smoke path likelihood).

2. Asset and yield protection guidance:
- Translate environmental signals into crop-specific risk indicators.
- Recommend mitigation actions when thresholds are exceeded.

3. Field reporting:
- Let users drop reports for embers, spot fires, smoke smell, wind shear, etc.
- Store and surface reports as additional model signal/context.

## Data Sources

- Open-Meteo (weather): [https://open-meteo.com/](https://open-meteo.com/)
- NASA FIRMS fire data: [https://firms.modaps.eosdis.nasa.gov/download/](https://firms.modaps.eosdis.nasa.gov/download/)
- CAL FIRE ArcGIS search API: [https://hub-calfire-forestry.hub.arcgis.com/api/search/definition/](https://hub-calfire-forestry.hub.arcgis.com/api/search/definition/)

## This Repo (etl-pipeline) Purpose

This repository should own ingestion + standardization of wildfire, smoke, and weather signals into a unified data model that downstream services can use for:

- Crop-risk scoring
- Map overlays
- Alert/advice generation

## Suggested Initial ETL Scope

1. Ingest:
- FIRMS detections
- Open-Meteo forecast/history for farm coordinates
- CAL FIRE active incident metadata

2. Transform:
- Normalize timestamps and geospatial fields
- Map detections/incidents to farm regions (distance/intersection logic)
- Build rolling exposure features (smoke/heat/fire proximity)

3. Load:
- Persist cleaned tables for incidents, weather, detections, and derived risk features

## Open Decisions

- Confirm product name (`FieldCommander` vs alternatives)
- Finalize crop-specific risk formulas and threshold logic
- Define update frequency (e.g., every 15-60 minutes during active events)
- Choose storage target for serving layer (Postgres/PostGIS, warehouse, or both)

## Decision Artifacts In This Repo

- Data integration playbook: `docs/data-join-playbook.md`
- Join/scoring defaults: `config/join_defaults.json`
- One-time extraction CLI: `main.py`

## One-Time Demo Extraction

For hackathon demos, this repo now supports one-shot pulls (no recurring updates).

1. Open-Meteo one-time extract:

```bash
uv run main.py extract-open-meteo \
  --lat 38.30 \
  --lon -122.30 \
  --past-days 3 \
  --forecast-days 2 \
  --output data/raw/open_meteo/open_meteo_snapshot.jsonl
```

2. FIRMS one-time extract from local CSV (fastest way to demo):

```bash
uv run main.py extract-firms \
  --input-csv samples/firms_sample.csv \
  --output data/raw/firms/firms_snapshot.jsonl
```

3. FIRMS one-time extract via API:

```bash
export NASA_FIRMS_MAP_KEY="your_key_here"
uv run main.py extract-firms \
  --source VIIRS_SNPP_NRT \
  --bbox "-125,32,-114,42" \
  --days 2 \
  --output data/raw/firms/firms_snapshot.jsonl
```

4. Build a single demo snapshot bundle:

```bash
uv run main.py build-demo-snapshot \
  --lat 38.30 \
  --lon -122.30 \
  --firms-input-csv samples/firms_sample.csv \
  --output-dir data/demo_snapshot
```

## Sanity-Check Dashboard

Launch a lightweight Streamlit dashboard to inspect extracted snapshots:

```bash
uv run streamlit run streamlit_app.py
```

What it shows:
- FIRMS tab: metadata, row count, avg FRP/confidence, map, raw table
- Open-Meteo tab: metadata, row count, time-series chart, raw table

## Crop Data (CDL) Extraction

Use the local USDA CDL GeoTIFF at `crop_data/2024_30m_cdls/2024_30m_cdls.tif`.

Extract crop class around sample farm points:

```bash
uv run main.py extract-cdl \
  --input-csv samples/farm_points.csv \
  --lat-col latitude \
  --lon-col longitude \
  --id-col point_id \
  --radius-m 300 \
  --top-k 5 \
  --output data/raw/cdl/cdl_farm_points_2024.jsonl
```

Extract for one point only:

```bash
uv run main.py extract-cdl \
  --lat 38.302 \
  --lon -122.286 \
  --point-id napa_vineyard_demo \
  --radius-m 300 \
  --output data/raw/cdl/cdl_single_point.jsonl
```

## Sacramento-Davis-Fairfield Refetch + Combine

1. Refetch FIRMS for the area (`days` must be 1-5):

```bash
uv run main.py extract-firms \
  --map-key "$NASA_FIRMS_MAP_KEY" \
  --source VIIRS_SNPP_NRT \
  --bbox=-122.8,38.0,-121.2,38.9 \
  --days 5 \
  --output data/raw/firms/firms_sdf_5d.jsonl
```

2. Refetch Open-Meteo for Sacramento and Fairfield, then combine:

```bash
uv run main.py extract-open-meteo --lat 38.5816 --lon -121.4944 --past-days 7 --forecast-days 2 --output data/raw/open_meteo/open_meteo_sacramento_9d.jsonl
uv run main.py extract-open-meteo --lat 38.2494 --lon -122.0400 --past-days 7 --forecast-days 2 --output data/raw/open_meteo/open_meteo_fairfield_9d.jsonl
cat data/raw/open_meteo/open_meteo_sacramento_9d.jsonl data/raw/open_meteo/open_meteo_fairfield_9d.jsonl > data/raw/open_meteo/open_meteo_sdf_9d.jsonl
```

3. Extract CDL around farm points:

```bash
uv run main.py extract-cdl \
  --input-csv samples/farms_sdf_area.csv \
  --lat-col latitude \
  --lon-col longitude \
  --id-col farm_id \
  --radius-m 300 \
  --output data/raw/cdl/cdl_sdf_points_2024.jsonl
```

4. Build app-ready plotting tables:

```bash
uv run main.py build-plot-dataset \
  --farms-csv samples/farms_sdf_area.csv \
  --firms-jsonl data/raw/firms/firms_sdf_5d.jsonl \
  --open-meteo-jsonl data/raw/open_meteo/open_meteo_sdf_9d.jsonl \
  --cdl-jsonl data/raw/cdl/cdl_sdf_points_2024.jsonl \
  --output-dir data/processed/plot/sdf_area
```
