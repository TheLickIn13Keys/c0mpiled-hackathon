from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class FarmAsset:
    farm_id: str
    farm_name: str
    latitude: float
    longitude: float
    crop_type: str


def build_plot_tables(
    farms_csv_path: str,
    firms_jsonl_path: str,
    open_meteo_jsonl_path: str,
    cdl_jsonl_path: str | None = None,
    fire_radius_km: float = 50.0,
    fire_window_hours: int = 24,
) -> dict[str, list[dict[str, Any]]]:
    now_utc = datetime.now(timezone.utc)
    farms = _load_farms(farms_csv_path)
    firms_rows = _load_jsonl(firms_jsonl_path)
    weather_rows = _load_jsonl(open_meteo_jsonl_path)
    cdl_rows = _load_jsonl(cdl_jsonl_path) if cdl_jsonl_path else []

    cdl_lookup = {row.get("point_id"): row for row in cdl_rows}
    weather_by_coord = _group_weather_by_coord(weather_rows)

    map_fire_points = _build_map_fire_points(firms_rows)
    chart_rows: list[dict[str, Any]] = []
    latest_by_farm: dict[str, dict[str, Any]] = {}
    latest_observed_by_farm: dict[str, dict[str, Any]] = {}

    for farm in farms:
        weather_series = _nearest_weather_series(farm, weather_by_coord)
        if not weather_series:
            continue
        crop_factor = _crop_factor(farm.crop_type)
        cdl_row = cdl_lookup.get(farm.farm_id)

        for weather in weather_series:
            event_hour = _to_dt(weather.get("event_hour_utc"))
            if event_hour is None:
                continue
            window_start = event_hour - timedelta(hours=fire_window_hours)
            matched_fires = _match_fires_for_window(
                firms_rows=firms_rows,
                farm=farm,
                window_start=window_start,
                window_end=event_hour,
                fire_radius_km=fire_radius_km,
            )

            feature_row = _compute_feature_row(
                farm=farm,
                weather=weather,
                event_hour=event_hour,
                matched_fires=matched_fires,
                crop_factor=crop_factor,
                cdl_row=cdl_row,
                fire_radius_km=fire_radius_km,
            )
            chart_rows.append(feature_row)
            latest = latest_by_farm.get(farm.farm_id)
            if latest is None or feature_row["hour_utc"] > latest["hour_utc"]:
                latest_by_farm[farm.farm_id] = feature_row
            if event_hour <= now_utc:
                latest_observed = latest_observed_by_farm.get(farm.farm_id)
                if latest_observed is None or feature_row["hour_utc"] > latest_observed["hour_utc"]:
                    latest_observed_by_farm[farm.farm_id] = feature_row

    status_source = latest_observed_by_farm if latest_observed_by_farm else latest_by_farm
    map_farm_status = [_to_farm_status(row) for row in status_source.values()]
    map_farm_status.sort(key=lambda row: row["risk_score"], reverse=True)
    chart_rows.sort(key=lambda row: (row["farm_id"], row["hour_utc"]))
    return {
        "map_fire_points": map_fire_points,
        "map_farm_status": map_farm_status,
        "chart_farm_timeseries": chart_rows,
    }


def _load_farms(path: str) -> list[FarmAsset]:
    farms: list[FarmAsset] = []
    with open(path, "r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            farms.append(
                FarmAsset(
                    farm_id=row["farm_id"],
                    farm_name=row["farm_name"],
                    latitude=float(row["latitude"]),
                    longitude=float(row["longitude"]),
                    crop_type=row.get("crop_type", "other"),
                )
            )
    return farms


def _load_jsonl(path: str | None) -> list[dict[str, Any]]:
    if not path:
        return []
    out: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                out.append(json.loads(line))
    return out


def _to_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _group_weather_by_coord(rows: list[dict[str, Any]]) -> dict[tuple[float, float], list[dict[str, Any]]]:
    grouped: dict[tuple[float, float], list[dict[str, Any]]] = {}
    for row in rows:
        lat = _to_float(row.get("latitude"))
        lon = _to_float(row.get("longitude"))
        if lat is None or lon is None:
            continue
        grouped.setdefault((lat, lon), []).append(row)
    for series in grouped.values():
        series.sort(key=lambda r: r.get("event_hour_utc", ""))
    return grouped


def _nearest_weather_series(
    farm: FarmAsset,
    weather_by_coord: dict[tuple[float, float], list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    best_distance = None
    best_series: list[dict[str, Any]] = []
    for (lat, lon), series in weather_by_coord.items():
        distance = _haversine_km(farm.latitude, farm.longitude, lat, lon)
        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_series = series
    return best_series


def _match_fires_for_window(
    firms_rows: list[dict[str, Any]],
    farm: FarmAsset,
    window_start: datetime,
    window_end: datetime,
    fire_radius_km: float,
) -> list[dict[str, Any]]:
    matched: list[dict[str, Any]] = []
    for row in firms_rows:
        acquired = _to_dt(row.get("acquired_at_utc"))
        if acquired is None or acquired < window_start or acquired > window_end:
            continue
        lat = _to_float(row.get("latitude"))
        lon = _to_float(row.get("longitude"))
        if lat is None or lon is None:
            continue
        distance = _haversine_km(farm.latitude, farm.longitude, lat, lon)
        if distance <= fire_radius_km:
            enriched = dict(row)
            enriched["distance_km"] = distance
            matched.append(enriched)
    return matched


def _compute_feature_row(
    farm: FarmAsset,
    weather: dict[str, Any],
    event_hour: datetime,
    matched_fires: list[dict[str, Any]],
    crop_factor: float,
    cdl_row: dict[str, Any] | None,
    fire_radius_km: float,
) -> dict[str, Any]:
    min_distance_km = min((row["distance_km"] for row in matched_fires), default=fire_radius_km)
    frp_sum_24h = sum(_to_float(row.get("frp")) or 0.0 for row in matched_fires)
    fire_count_24h = len(matched_fires)

    wind_speed = _to_float(weather.get("wind_speed_10m")) or 0.0
    temperature = _to_float(weather.get("temperature_2m")) or 0.0
    humidity = _to_float(weather.get("relative_humidity_2m")) or 100.0

    fire_proximity = _clip01(1.0 - (min_distance_km / fire_radius_km))
    fire_intensity = _clip01(frp_sum_24h / 200.0)
    smoke_transport = fire_proximity * _clip01(wind_speed / 12.0)
    heat_stress = _clip01((temperature - 30.0) / 12.0) * _clip01((60.0 - humidity) / 40.0)

    base_risk = 0.35 * fire_proximity + 0.25 * fire_intensity + 0.2 * smoke_transport + 0.2 * heat_stress
    risk_score = _clip01(base_risk * crop_factor)

    contributions = {
        "fire_proximity": 0.35 * fire_proximity,
        "fire_intensity": 0.25 * fire_intensity,
        "smoke_transport": 0.2 * smoke_transport,
        "heat_stress": 0.2 * heat_stress,
    }
    top_driver = max(contributions, key=contributions.get)

    return {
        "farm_id": farm.farm_id,
        "farm_name": farm.farm_name,
        "crop_type": farm.crop_type,
        "latitude": farm.latitude,
        "longitude": farm.longitude,
        "hour_utc": event_hour.isoformat(),
        "risk_score": round(risk_score, 4),
        "risk_level": _risk_level(risk_score),
        "top_driver": top_driver,
        "fire_proximity": round(fire_proximity, 4),
        "fire_intensity": round(fire_intensity, 4),
        "smoke_transport": round(smoke_transport, 4),
        "heat_stress": round(heat_stress, 4),
        "fire_count_24h": fire_count_24h,
        "frp_sum_24h": round(frp_sum_24h, 3),
        "firms_min_distance_km": round(min_distance_km, 3),
        "wind_speed_10m": wind_speed,
        "temperature_2m": temperature,
        "relative_humidity_2m": humidity,
        "cdl_class_code": cdl_row.get("cdl_class_code") if cdl_row else None,
    }


def _to_farm_status(feature_row: dict[str, Any]) -> dict[str, Any]:
    return {
        "farm_id": feature_row["farm_id"],
        "farm_name": feature_row["farm_name"],
        "crop_type": feature_row["crop_type"],
        "lat": feature_row["latitude"],
        "lon": feature_row["longitude"],
        "hour_utc": feature_row["hour_utc"],
        "risk_score": feature_row["risk_score"],
        "risk_level": feature_row["risk_level"],
        "top_driver": feature_row["top_driver"],
        "cdl_class_code": feature_row.get("cdl_class_code"),
    }


def _build_map_fire_points(firms_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for idx, row in enumerate(firms_rows, start=1):
        lat = _to_float(row.get("latitude"))
        lon = _to_float(row.get("longitude"))
        if lat is None or lon is None:
            continue
        confidence = _to_float(row.get("confidence")) or 0.0
        frp = _to_float(row.get("frp")) or 0.0
        risk_hint = _risk_hint(frp, confidence)
        out.append(
            {
                "id": f"fire_{idx}",
                "lat": lat,
                "lon": lon,
                "time_utc": row.get("acquired_at_utc"),
                "frp": frp,
                "confidence": confidence,
                "risk_hint": risk_hint,
            }
        )
    return out


def _risk_hint(frp: float, confidence: float) -> str:
    score = 0.6 * _clip01(frp / 20.0) + 0.4 * _clip01(confidence)
    if score >= 0.67:
        return "high"
    if score >= 0.34:
        return "medium"
    return "low"


def _risk_level(score: float) -> str:
    if score >= 0.67:
        return "high"
    if score >= 0.34:
        return "medium"
    return "low"


def _crop_factor(crop_type: str) -> float:
    crop = crop_type.strip().lower()
    if crop in {"grape", "grapes", "vineyard"}:
        return 1.15
    if crop in {"almond", "walnut", "nuts", "nut"}:
        return 1.05
    return 1.0


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _clip01(value: float) -> float:
    return max(0.0, min(value, 1.0))


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_km * c
