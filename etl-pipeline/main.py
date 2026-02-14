from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from etl_pipeline.extractors.cdl import GeoPoint, extract_cdl_for_points, load_points_csv
from etl_pipeline.extractors.firms import extract_firms_records
from etl_pipeline.extractors.open_meteo import DEFAULT_HOURLY_VARIABLES, extract_open_meteo_hourly
from etl_pipeline.io_helpers import write_json, write_jsonl
from etl_pipeline.transforms.plot_dataset import build_plot_tables


def _build_cli() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="One-time dataset extraction for FieldCommander demos.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    open_meteo_parser = subparsers.add_parser("extract-open-meteo", help="One-shot Open-Meteo extraction.")
    open_meteo_parser.add_argument("--lat", type=float, required=True, help="Latitude for weather extraction.")
    open_meteo_parser.add_argument("--lon", type=float, required=True, help="Longitude for weather extraction.")
    open_meteo_parser.add_argument(
        "--hourly",
        default=",".join(DEFAULT_HOURLY_VARIABLES),
        help="Comma-separated Open-Meteo hourly variables.",
    )
    open_meteo_parser.add_argument("--past-days", type=int, default=2, help="How many past days to include.")
    open_meteo_parser.add_argument("--forecast-days", type=int, default=2, help="How many forecast days to include.")
    open_meteo_parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/raw/open_meteo/open_meteo_snapshot.jsonl"),
        help="Output JSONL path.",
    )

    firms_parser = subparsers.add_parser("extract-firms", help="One-shot NASA FIRMS extraction.")
    firms_parser.add_argument("--input-csv", type=str, help="Path to a downloaded FIRMS CSV file.")
    firms_parser.add_argument("--url", type=str, help="Direct FIRMS CSV URL.")
    firms_parser.add_argument("--map-key", type=str, help="NASA FIRMS map key. Defaults to NASA_FIRMS_MAP_KEY env var.")
    firms_parser.add_argument("--source", type=str, default="VIIRS_SNPP_NRT", help="FIRMS source/sensor identifier.")
    firms_parser.add_argument("--bbox", type=str, help="West,South,East,North bbox string.")
    firms_parser.add_argument("--days", type=int, default=2, help="FIRMS lookback days when using map key mode.")
    firms_parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/raw/firms/firms_snapshot.jsonl"),
        help="Output JSONL path.",
    )

    bundle_parser = subparsers.add_parser(
        "build-demo-snapshot",
        help="Run one-shot extraction for both sources and write a manifest.",
    )
    bundle_parser.add_argument("--lat", type=float, required=True, help="Latitude for Open-Meteo.")
    bundle_parser.add_argument("--lon", type=float, required=True, help="Longitude for Open-Meteo.")
    bundle_parser.add_argument("--firms-input-csv", type=str, help="Local FIRMS CSV path.")
    bundle_parser.add_argument("--firms-url", type=str, help="FIRMS CSV URL.")
    bundle_parser.add_argument("--firms-map-key", type=str, help="NASA FIRMS map key.")
    bundle_parser.add_argument("--firms-source", type=str, default="VIIRS_SNPP_NRT", help="FIRMS source identifier.")
    bundle_parser.add_argument("--firms-bbox", type=str, help="West,South,East,North bbox string.")
    bundle_parser.add_argument("--firms-days", type=int, default=2, help="FIRMS lookback days.")
    bundle_parser.add_argument("--past-days", type=int, default=2, help="Open-Meteo past days.")
    bundle_parser.add_argument("--forecast-days", type=int, default=2, help="Open-Meteo forecast days.")
    bundle_parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/demo_snapshot"),
        help="Directory for snapshot outputs.",
    )

    cdl_parser = subparsers.add_parser("extract-cdl", help="One-shot USDA CDL extraction by point(s).")
    cdl_parser.add_argument(
        "--cdl-tif",
        type=str,
        default="crop_data/2024_30m_cdls/2024_30m_cdls.tif",
        help="Path to the CDL GeoTIFF.",
    )
    cdl_parser.add_argument("--input-csv", type=str, help="CSV path containing lat/lon columns.")
    cdl_parser.add_argument("--lat-col", type=str, default="latitude", help="Latitude column name for CSV mode.")
    cdl_parser.add_argument("--lon-col", type=str, default="longitude", help="Longitude column name for CSV mode.")
    cdl_parser.add_argument("--id-col", type=str, default="point_id", help="Point ID column name for CSV mode.")
    cdl_parser.add_argument("--lat", type=float, help="Latitude for single-point mode.")
    cdl_parser.add_argument("--lon", type=float, help="Longitude for single-point mode.")
    cdl_parser.add_argument("--point-id", type=str, default="point_1", help="Point ID for single-point mode.")
    cdl_parser.add_argument("--radius-m", type=int, default=300, help="Window radius in meters for class mix.")
    cdl_parser.add_argument("--top-k", type=int, default=5, help="Top class count to return in class mix.")
    cdl_parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/raw/cdl/cdl_point_extract.jsonl"),
        help="Output JSONL path.",
    )

    plot_parser = subparsers.add_parser(
        "build-plot-dataset",
        help="Combine sources into app-ready plotting tables.",
    )
    plot_parser.add_argument(
        "--farms-csv",
        type=str,
        default="samples/farms_sdf_area.csv",
        help="Farm assets CSV path.",
    )
    plot_parser.add_argument("--firms-jsonl", type=str, required=True, help="FIRMS JSONL path.")
    plot_parser.add_argument("--open-meteo-jsonl", type=str, required=True, help="Open-Meteo JSONL path.")
    plot_parser.add_argument("--cdl-jsonl", type=str, help="Optional CDL point extraction JSONL path.")
    plot_parser.add_argument("--fire-radius-km", type=float, default=50.0, help="FIRMS matching radius.")
    plot_parser.add_argument("--fire-window-hours", type=int, default=24, help="Lookback window per hour.")
    plot_parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/processed/plot/sdf_area"),
        help="Output directory for map/chart tables.",
    )

    return parser


def _run_open_meteo(args: argparse.Namespace) -> dict[str, Any]:
    hourly_variables = [item.strip() for item in args.hourly.split(",") if item.strip()]
    payload = extract_open_meteo_hourly(
        latitude=args.lat,
        longitude=args.lon,
        hourly_variables=hourly_variables,
        past_days=args.past_days,
        forecast_days=args.forecast_days,
    )
    write_jsonl(payload["records"], args.output)
    write_json(payload["metadata"], args.output.with_suffix(".metadata.json"))
    return payload


def _run_firms(args: argparse.Namespace) -> dict[str, Any]:
    map_key = args.map_key or os.getenv("NASA_FIRMS_MAP_KEY")
    payload = extract_firms_records(
        csv_path=args.input_csv,
        url=args.url,
        map_key=map_key,
        source=args.source,
        bbox=args.bbox,
        days=args.days,
    )
    write_jsonl(payload["records"], args.output)
    write_json(payload["metadata"], args.output.with_suffix(".metadata.json"))
    return payload


def _run_bundle(args: argparse.Namespace) -> dict[str, Any]:
    output_dir: Path = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    open_meteo_payload = extract_open_meteo_hourly(
        latitude=args.lat,
        longitude=args.lon,
        past_days=args.past_days,
        forecast_days=args.forecast_days,
    )
    open_meteo_output = output_dir / "open_meteo_snapshot.jsonl"
    write_jsonl(open_meteo_payload["records"], open_meteo_output)
    write_json(open_meteo_payload["metadata"], output_dir / "open_meteo_snapshot.metadata.json")

    firms_map_key = args.firms_map_key or os.getenv("NASA_FIRMS_MAP_KEY")
    firms_payload = extract_firms_records(
        csv_path=args.firms_input_csv,
        url=args.firms_url,
        map_key=firms_map_key,
        source=args.firms_source,
        bbox=args.firms_bbox,
        days=args.firms_days,
    )
    firms_output = output_dir / "firms_snapshot.jsonl"
    write_jsonl(firms_payload["records"], firms_output)
    write_json(firms_payload["metadata"], output_dir / "firms_snapshot.metadata.json")

    manifest = {
        "built_at_utc": datetime.now(timezone.utc).isoformat(),
        "open_meteo_records": open_meteo_payload["metadata"]["record_count"],
        "firms_records": firms_payload["metadata"]["record_count"],
        "files": {
            "open_meteo_data": str(open_meteo_output),
            "open_meteo_metadata": str(output_dir / "open_meteo_snapshot.metadata.json"),
            "firms_data": str(firms_output),
            "firms_metadata": str(output_dir / "firms_snapshot.metadata.json"),
        },
    }
    write_json(manifest, output_dir / "manifest.json")
    return manifest


def _run_cdl(args: argparse.Namespace) -> dict[str, Any]:
    if args.input_csv:
        points = load_points_csv(
            csv_path=args.input_csv,
            lat_col=args.lat_col,
            lon_col=args.lon_col,
            id_col=args.id_col,
        )
    else:
        if args.lat is None or args.lon is None:
            raise ValueError("CDL extraction requires either --input-csv or both --lat and --lon.")
        points = [GeoPoint(point_id=args.point_id, latitude=args.lat, longitude=args.lon)]

    payload = extract_cdl_for_points(
        cdl_tif_path=args.cdl_tif,
        points=points,
        radius_meters=args.radius_m,
        top_k=args.top_k,
    )
    write_jsonl(payload["records"], args.output)
    write_json(payload["metadata"], args.output.with_suffix(".metadata.json"))
    return payload


def _run_plot_dataset(args: argparse.Namespace) -> dict[str, Any]:
    output_dir: Path = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    tables = build_plot_tables(
        farms_csv_path=args.farms_csv,
        firms_jsonl_path=args.firms_jsonl,
        open_meteo_jsonl_path=args.open_meteo_jsonl,
        cdl_jsonl_path=args.cdl_jsonl,
        fire_radius_km=args.fire_radius_km,
        fire_window_hours=args.fire_window_hours,
    )

    summary: dict[str, Any] = {"tables": {}, "built_at_utc": datetime.now(timezone.utc).isoformat()}
    for table_name, records in tables.items():
        output_path = output_dir / f"{table_name}.jsonl"
        write_jsonl(records, output_path)
        summary["tables"][table_name] = {
            "path": str(output_path),
            "record_count": len(records),
        }

    write_json(summary, output_dir / "manifest.json")
    return summary


def main() -> None:
    parser = _build_cli()
    args = parser.parse_args()
    try:
        if args.command == "extract-open-meteo":
            payload = _run_open_meteo(args)
            print(f"Open-Meteo extraction complete: {payload['metadata']['record_count']} records")
            return

        if args.command == "extract-firms":
            payload = _run_firms(args)
            print(f"FIRMS extraction complete: {payload['metadata']['record_count']} records")
            return

        if args.command == "build-demo-snapshot":
            manifest = _run_bundle(args)
            print(f"Demo snapshot complete: {manifest['open_meteo_records']} weather rows, {manifest['firms_records']} fire rows")
            print(f"Manifest: {args.output_dir / 'manifest.json'}")
            return

        if args.command == "extract-cdl":
            payload = _run_cdl(args)
            print(f"CDL extraction complete: {payload['metadata']['record_count']} records")
            return

        if args.command == "build-plot-dataset":
            summary = _run_plot_dataset(args)
            counts = ", ".join(
                f"{name}={meta['record_count']}" for name, meta in summary["tables"].items()
            )
            print(f"Plot dataset complete: {counts}")
            print(f"Manifest: {args.output_dir / 'manifest.json'}")
            return

        parser.error(f"Unknown command: {args.command}")
    except Exception as exc:
        print(f"Extraction failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
