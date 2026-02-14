from __future__ import annotations

import csv
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.windows import Window
from rasterio.warp import transform


@dataclass(frozen=True)
class GeoPoint:
    point_id: str
    latitude: float
    longitude: float


def load_points_csv(csv_path: str, lat_col: str, lon_col: str, id_col: str | None = None) -> list[GeoPoint]:
    points: list[GeoPoint] = []
    with open(csv_path, "r", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for idx, row in enumerate(reader):
            lat_raw = row.get(lat_col)
            lon_raw = row.get(lon_col)
            if lat_raw is None or lon_raw is None:
                continue
            try:
                latitude = float(lat_raw)
                longitude = float(lon_raw)
            except ValueError:
                continue
            point_id = row.get(id_col) if id_col else None
            if point_id is None or point_id.strip() == "":
                point_id = f"row_{idx + 1}"
            points.append(GeoPoint(point_id=point_id, latitude=latitude, longitude=longitude))
    return points


def extract_cdl_for_points(
    cdl_tif_path: str,
    points: list[GeoPoint],
    radius_meters: int = 0,
    top_k: int = 5,
) -> dict[str, Any]:
    ingested_at = datetime.now(timezone.utc).isoformat()
    records: list[dict[str, Any]] = []

    with rasterio.open(cdl_tif_path) as dataset:
        band = dataset.read(1, masked=True)
        crs = dataset.crs
        if crs is None:
            raise ValueError("CDL raster has no CRS; cannot transform coordinates.")

        pixel_size_x = abs(dataset.transform.a)
        pixel_size_y = abs(dataset.transform.e)

        for point in points:
            x_arr, y_arr = transform("EPSG:4326", crs, [point.longitude], [point.latitude])
            x, y = x_arr[0], y_arr[0]
            row, col = dataset.index(x, y)

            if row < 0 or col < 0 or row >= dataset.height or col >= dataset.width:
                records.append(
                    {
                        "point_id": point.point_id,
                        "latitude": point.latitude,
                        "longitude": point.longitude,
                        "cdl_class_code": None,
                        "in_bounds": False,
                        "radius_meters": radius_meters,
                        "top_class_mix": [],
                        "ingested_at_utc": ingested_at,
                    }
                )
                continue

            cell = band[row, col]
            point_value = None if np.ma.is_masked(cell) else int(cell)
            class_mix = _extract_class_mix(
                dataset=dataset,
                center_row=row,
                center_col=col,
                radius_meters=radius_meters,
                pixel_size_x=pixel_size_x,
                pixel_size_y=pixel_size_y,
                top_k=top_k,
            )

            records.append(
                {
                    "point_id": point.point_id,
                    "latitude": point.latitude,
                    "longitude": point.longitude,
                    "cdl_class_code": point_value,
                    "in_bounds": True,
                    "radius_meters": radius_meters,
                    "top_class_mix": class_mix,
                    "ingested_at_utc": ingested_at,
                }
            )

    return {
        "metadata": {
            "source": "usda-cdl",
            "cdl_tif_path": cdl_tif_path,
            "record_count": len(records),
            "radius_meters": radius_meters,
            "top_k": top_k,
            "ingested_at_utc": ingested_at,
        },
        "records": records,
    }


def _extract_class_mix(
    dataset: rasterio.io.DatasetReader,
    center_row: int,
    center_col: int,
    radius_meters: int,
    pixel_size_x: float,
    pixel_size_y: float,
    top_k: int,
) -> list[dict[str, Any]]:
    if radius_meters <= 0:
        data = dataset.read(1, window=Window(center_col, center_row, 1, 1), masked=True)
    else:
        col_radius = max(int(radius_meters / pixel_size_x), 1)
        row_radius = max(int(radius_meters / pixel_size_y), 1)
        col_start = max(center_col - col_radius, 0)
        row_start = max(center_row - row_radius, 0)
        col_end = min(center_col + col_radius + 1, dataset.width)
        row_end = min(center_row + row_radius + 1, dataset.height)
        data = dataset.read(
            1,
            window=Window(
                col_start,
                row_start,
                col_end - col_start,
                row_end - row_start,
            ),
            masked=True,
        )

    valid_values = [int(value) for value in data.compressed().tolist()]
    if not valid_values:
        return []

    counts = Counter(valid_values)
    total = sum(counts.values())
    top_items = counts.most_common(top_k)
    return [
        {
            "cdl_class_code": code,
            "pixel_count": count,
            "fraction": round(count / total, 4),
        }
        for code, count in top_items
    ]
