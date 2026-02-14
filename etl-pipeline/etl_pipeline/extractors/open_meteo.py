from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from etl_pipeline.io_helpers import fetch_json


DEFAULT_HOURLY_VARIABLES = [
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "cloud_cover",
    "visibility",
]


def extract_open_meteo_hourly(
    latitude: float,
    longitude: float,
    hourly_variables: list[str] | None = None,
    past_days: int = 2,
    forecast_days: int = 2,
    endpoint: str = "https://api.open-meteo.com/v1/forecast",
) -> dict[str, Any]:
    variables = hourly_variables or DEFAULT_HOURLY_VARIABLES
    response = fetch_json(
        endpoint,
        params={
            "latitude": latitude,
            "longitude": longitude,
            "hourly": ",".join(variables),
            "past_days": past_days,
            "forecast_days": forecast_days,
            "timezone": "UTC",
        },
    )

    hourly = response.get("hourly", {})
    times = hourly.get("time", [])
    records: list[dict[str, Any]] = []
    ingested_at = datetime.now(timezone.utc).isoformat()

    for idx, event_time in enumerate(times):
        record: dict[str, Any] = {
            "source": "open-meteo",
            "latitude": response.get("latitude", latitude),
            "longitude": response.get("longitude", longitude),
            "event_hour_utc": _as_utc_iso(event_time),
            "ingested_at_utc": ingested_at,
        }
        for variable in variables:
            values = hourly.get(variable, [])
            record[variable] = values[idx] if idx < len(values) else None
        records.append(record)

    return {
        "metadata": {
            "source": "open-meteo",
            "latitude": latitude,
            "longitude": longitude,
            "requested_hourly_variables": variables,
            "past_days": past_days,
            "forecast_days": forecast_days,
            "endpoint": endpoint,
            "ingested_at_utc": ingested_at,
            "record_count": len(records),
        },
        "records": records,
    }


def _as_utc_iso(timestamp_value: str) -> str:
    parsed = datetime.fromisoformat(timestamp_value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()
