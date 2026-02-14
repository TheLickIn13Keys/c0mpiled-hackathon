from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Any

from etl_pipeline.io_helpers import fetch_text


def extract_firms_records(
    csv_path: str | None = None,
    url: str | None = None,
    map_key: str | None = None,
    source: str | None = None,
    bbox: str | None = None,
    days: int = 1,
) -> dict[str, Any]:
    raw_csv: str
    request_descriptor: str

    if csv_path:
        with open(csv_path, "r", encoding="utf-8") as handle:
            raw_csv = handle.read()
        request_descriptor = f"local_csv:{csv_path}"
    elif url:
        raw_csv = fetch_text(url)
        request_descriptor = f"url:{url}"
    else:
        if not map_key or not source or not bbox:
            raise ValueError("FIRMS extraction requires one of: csv_path, url, or map_key+source+bbox")
        api_url = _build_firms_area_csv_url(
            map_key=map_key,
            source=source,
            bbox=bbox,
            days=days,
        )
        raw_csv = fetch_text(api_url)
        safe_api_url = _build_firms_area_csv_url(
            map_key="***REDACTED***",
            source=source,
            bbox=bbox,
            days=days,
        )
        request_descriptor = f"api:{safe_api_url}"

    records = _parse_and_normalize_firms_csv(raw_csv)
    ingested_at = datetime.now(timezone.utc).isoformat()
    for record in records:
        record["ingested_at_utc"] = ingested_at

    return {
        "metadata": {
            "source": "nasa-firms",
            "request_descriptor": request_descriptor,
            "record_count": len(records),
            "ingested_at_utc": ingested_at,
        },
        "records": records,
    }


def _build_firms_area_csv_url(map_key: str, source: str, bbox: str, days: int) -> str:
    # NASA FIRMS area API format:
    # /api/area/csv/{MAP_KEY}/{SOURCE}/{WEST,SOUTH,EAST,NORTH}/{DAYS}
    return f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/{source}/{bbox}/{days}"


def _parse_and_normalize_firms_csv(raw_csv: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(raw_csv))
    normalized: list[dict[str, Any]] = []
    for row in reader:
        lat = _to_float(row.get("latitude"))
        lon = _to_float(row.get("longitude"))
        if lat is None or lon is None:
            continue

        normalized.append(
            {
                "source": "nasa-firms",
                "latitude": lat,
                "longitude": lon,
                "acquired_at_utc": _parse_acquired_at_utc(row),
                "frp": _to_float(row.get("frp")),
                "confidence": _parse_confidence(row.get("confidence")),
                "satellite": _clean(row.get("satellite")),
                "instrument": _clean(row.get("instrument")),
                "daynight": _clean(row.get("daynight")),
            }
        )
    return normalized


def _parse_acquired_at_utc(row: dict[str, Any]) -> str | None:
    acq_date = _clean(row.get("acq_date"))
    if not acq_date:
        return None

    acq_time_raw = _clean(row.get("acq_time")) or "0000"
    acq_time_digits = "".join(character for character in acq_time_raw if character.isdigit()).zfill(4)
    hh = int(acq_time_digits[:2])
    mm = int(acq_time_digits[2:])
    if hh > 23 or mm > 59:
        hh, mm = 0, 0

    parsed = datetime.fromisoformat(acq_date).replace(hour=hh, minute=mm, second=0, microsecond=0, tzinfo=timezone.utc)
    return parsed.isoformat()


def _parse_confidence(raw_value: Any) -> float | None:
    if raw_value is None:
        return None
    value = str(raw_value).strip().lower()
    if value == "":
        return None
    if value in {"low", "l"}:
        return 0.33
    if value in {"nominal", "n", "medium"}:
        return 0.66
    if value in {"high", "h"}:
        return 1.0
    numeric = _to_float(value)
    if numeric is None:
        return None
    if numeric > 1:
        return max(0.0, min(numeric / 100.0, 1.0))
    return max(0.0, min(numeric, 1.0))


def _to_float(raw_value: Any) -> float | None:
    if raw_value is None:
        return None
    text = str(raw_value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _clean(raw_value: Any) -> str | None:
    if raw_value is None:
        return None
    text = str(raw_value).strip()
    return text if text else None
