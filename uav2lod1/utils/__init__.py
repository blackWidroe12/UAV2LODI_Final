"""
UAV2LoD1 Pipeline Utilities

Common utilities for GIS operations and metrics.
"""

from uav2lod1.utils.gis_utils import (
    get_raster_info,
    calculate_gsd,
    reproject_raster,
    clip_raster_to_bounds,
    read_raster_block,
    generate_block_windows,
    merge_footprints,
    calculate_footprint_orientation,
    estimate_utm_zone,
    validate_crs,
    get_raster_extent_as_polygon,
)

from uav2lod1.utils.metrics import (
    intersection_over_union,
    precision,
    recall,
    f1_score,
    rmse,
    mae,
    mean_bias,
    correlation_coefficient,
    r_squared,
    dice_coefficient,
    ConfusionMatrix,
    HeightMetrics,
    compute_segmentation_metrics,
)

__all__ = [
    # GIS utils
    "get_raster_info",
    "calculate_gsd",
    "reproject_raster",
    "clip_raster_to_bounds",
    "read_raster_block",
    "generate_block_windows",
    "merge_footprints",
    "calculate_footprint_orientation",
    "estimate_utm_zone",
    "validate_crs",
    "get_raster_extent_as_polygon",
    # Metrics
    "intersection_over_union",
    "precision",
    "recall",
    "f1_score",
    "rmse",
    "mae",
    "mean_bias",
    "correlation_coefficient",
    "r_squared",
    "dice_coefficient",
    "ConfusionMatrix",
    "HeightMetrics",
    "compute_segmentation_metrics",
]
