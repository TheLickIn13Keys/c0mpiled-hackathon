from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from etl_pipeline.extractors.firms import extract_firms_records
from etl_pipeline.extractors.open_meteo import DEFAULT_HOURLY_VARIABLES, extract_open_meteo_hourly
from etl_pipeline.io_helpers import write_json, write_jsonl


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

        parser.error(f"Unknown command: {args.command}")
    except Exception as exc:
        print(f"Extraction failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
