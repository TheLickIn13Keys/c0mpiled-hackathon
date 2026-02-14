from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st


APP_ROOT = Path(__file__).resolve().parent
FIRMS_DIR = APP_ROOT / "data" / "raw" / "firms"
OPEN_METEO_DIR = APP_ROOT / "data" / "raw" / "open_meteo"


def _read_jsonl(path: Path) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return pd.DataFrame(rows)


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _matching_metadata_path(data_path: Path) -> Path:
    return data_path.with_suffix(".metadata.json")


def _safe_number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _show_firms_tab() -> None:
    st.subheader("NASA FIRMS Snapshot")
    firms_files = sorted(path for path in FIRMS_DIR.glob("*.jsonl") if path.stat().st_size > 0)
    if not firms_files:
        st.info("No FIRMS snapshots found in data/raw/firms.")
        return

    file_options = {path.name: path for path in firms_files}
    selected_name = st.selectbox("Choose FIRMS file", list(file_options.keys()), index=0)
    selected_path = file_options[selected_name]

    metadata = _read_json(_matching_metadata_path(selected_path))
    if metadata:
        st.caption(f"Source: {metadata.get('source')} | Records: {metadata.get('record_count')}")
        st.json(metadata)

    frame = _read_jsonl(selected_path)
    if frame.empty:
        st.warning("Selected file has no rows.")
        return

    if "acquired_at_utc" in frame.columns:
        frame["acquired_at_utc"] = pd.to_datetime(frame["acquired_at_utc"], errors="coerce", utc=True)

    frame["frp"] = frame["frp"].apply(_safe_number)
    frame["confidence"] = frame["confidence"].apply(_safe_number)
    frame["latitude"] = frame["latitude"].apply(_safe_number)
    frame["longitude"] = frame["longitude"].apply(_safe_number)

    metric_col_1, metric_col_2, metric_col_3 = st.columns(3)
    metric_col_1.metric("Rows", f"{len(frame):,}")
    metric_col_2.metric("Avg FRP", f"{frame['frp'].mean():.2f}" if frame["frp"].notna().any() else "n/a")
    metric_col_3.metric(
        "Avg Confidence",
        f"{frame['confidence'].mean():.2f}" if frame["confidence"].notna().any() else "n/a",
    )

    mappable = frame.dropna(subset=["latitude", "longitude"])[["latitude", "longitude"]]
    if not mappable.empty:
        st.map(mappable, zoom=7)
    else:
        st.info("No valid lat/lon rows for map display.")

    st.dataframe(frame, use_container_width=True)


def _show_open_meteo_tab() -> None:
    st.subheader("Open-Meteo Snapshot")
    meteo_files = sorted(path for path in OPEN_METEO_DIR.glob("*.jsonl") if path.stat().st_size > 0)
    if not meteo_files:
        st.info("No Open-Meteo snapshots found in data/raw/open_meteo.")
        return

    file_options = {path.name: path for path in meteo_files}
    selected_name = st.selectbox("Choose Open-Meteo file", list(file_options.keys()), index=0)
    selected_path = file_options[selected_name]

    metadata = _read_json(_matching_metadata_path(selected_path))
    if metadata:
        st.caption(f"Source: {metadata.get('source')} | Records: {metadata.get('record_count')}")
        st.json(metadata)

    frame = _read_jsonl(selected_path)
    if frame.empty:
        st.warning("Selected file has no rows.")
        return

    if "event_hour_utc" in frame.columns:
        frame["event_hour_utc"] = pd.to_datetime(frame["event_hour_utc"], errors="coerce", utc=True)
        frame = frame.sort_values("event_hour_utc")

    st.metric("Rows", f"{len(frame):,}")

    candidate_series = [
        "temperature_2m",
        "relative_humidity_2m",
        "wind_speed_10m",
        "wind_direction_10m",
        "cloud_cover",
        "visibility",
    ]
    existing_series = [column for column in candidate_series if column in frame.columns]

    if "event_hour_utc" in frame.columns and existing_series:
        selected_series = st.multiselect(
            "Series to plot",
            existing_series,
            default=existing_series[: min(3, len(existing_series))],
        )
        if selected_series:
            line_frame = frame[["event_hour_utc", *selected_series]].set_index("event_hour_utc")
            st.line_chart(line_frame)

    st.dataframe(frame, use_container_width=True)


def main() -> None:
    st.set_page_config(page_title="FieldCommander Sanity Check", layout="wide")
    st.title("FieldCommander Data Sanity Check")
    st.caption("Quick inspection for one-time demo snapshots")

    with st.sidebar:
        st.markdown("### Data folders")
        st.code(str(FIRMS_DIR))
        st.code(str(OPEN_METEO_DIR))

    tab_firms, tab_meteo = st.tabs(["FIRMS", "Open-Meteo"])
    with tab_firms:
        _show_firms_tab()
    with tab_meteo:
        _show_open_meteo_tab()


if __name__ == "__main__":
    main()
