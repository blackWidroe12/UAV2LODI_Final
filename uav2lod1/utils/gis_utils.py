"""
GIS Utilities for UAV2LoD1 Pipeline

Common geospatial operations used across multiple stages.
"""

import logging
from pathlib import Path
from typing import Optional, Union

import numpy as np
import rasterio
from rasterio.windows import Window
from rasterio.transform import from_bounds
from rasterio.crs import CRS
from rasterio.warp import calculate_default_transform, reproject, Resampling
import geopandas as gpd
from shapely.geometry import box, Polygon, MultiPolygon
from shapely.ops import unary_union

logger = logging.getLogger(__name__)


def get_raster_info(raster_path: Path) -> dict:
    """
    Get metadata information from a raster file.
    
    Args:
        raster_path: Path to raster file
        
    Returns:
        Dictionary with raster metadata
    """
    with rasterio.open(raster_path) as src:
        return {
            "width": src.width,
            "height": src.height,
            "count": src.count,
            "dtype": str(src.dtypes[0]),
            "crs": str(src.crs),
            "bounds": src.bounds,
            "transform": src.transform,
            "nodata": src.nodata,
            "pixel_size_x": abs(src.transform.a),
            "pixel_size_y": abs(src.transform.e),
        }


def calculate_gsd(raster_path: Path) -> float:
    """
    Calculate Ground Sample Distance (GSD) in centimeters.
    
    Args:
        raster_path: Path to georeferenced raster
        
    Returns:
        GSD in centimeters
    """
    info = get_raster_info(raster_path)
    # Assuming CRS units are meters
    gsd_m = (info["pixel_size_x"] + info["pixel_size_y"]) / 2
    return gsd_m * 100  # Convert to cm


def reproject_raster(
    src_path: Path,
    dst_path: Path,
    dst_crs: Union[str, CRS],
    resampling: Resampling = Resampling.bilinear,
) -> Path:
    """
    Reproject a raster to a different CRS.
    
    Args:
        src_path: Source raster path
        dst_path: Destination raster path
        dst_crs: Target coordinate reference system
        resampling: Resampling method
        
    Returns:
        Path to reprojected raster
    """
    with rasterio.open(src_path) as src:
        transform, width, height = calculate_default_transform(
            src.crs, dst_crs, src.width, src.height, *src.bounds
        )
        
        profile = src.profile.copy()
        profile.update(
            crs=dst_crs,
            transform=transform,
            width=width,
            height=height,
        )
        
        with rasterio.open(dst_path, "w", **profile) as dst:
            for i in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=dst_crs,
                    resampling=resampling,
                )
    
    logger.info(f"Reprojected {src_path} to {dst_crs}")
    return dst_path


def clip_raster_to_bounds(
    raster_path: Path,
    output_path: Path,
    bounds: tuple[float, float, float, float],
) -> Path:
    """
    Clip a raster to specified bounds.
    
    Args:
        raster_path: Input raster path
        output_path: Output raster path
        bounds: (minx, miny, maxx, maxy) in raster CRS
        
    Returns:
        Path to clipped raster
    """
    with rasterio.open(raster_path) as src:
        # Calculate window from bounds
        minx, miny, maxx, maxy = bounds
        window = src.window(minx, miny, maxx, maxy)
        
        # Read windowed data
        data = src.read(window=window)
        
        # Update transform
        transform = src.window_transform(window)
        
        profile = src.profile.copy()
        profile.update(
            width=window.width,
            height=window.height,
            transform=transform,
        )
        
        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(data)
    
    logger.info(f"Clipped raster to bounds: {bounds}")
    return output_path


def read_raster_block(
    raster_path: Path,
    window: Window,
) -> tuple[np.ndarray, rasterio.Affine]:
    """
    Read a block/window from a raster.
    
    Args:
        raster_path: Path to raster
        window: rasterio Window object
        
    Returns:
        Tuple of (data array, transform for window)
    """
    with rasterio.open(raster_path) as src:
        data = src.read(window=window)
        transform = src.window_transform(window)
    return data, transform


def generate_block_windows(
    width: int,
    height: int,
    block_size: int = 1024,
    overlap: int = 0,
) -> list[Window]:
    """
    Generate block windows for processing large rasters.
    
    Args:
        width: Raster width
        height: Raster height
        block_size: Size of each block
        overlap: Overlap between blocks
        
    Returns:
        List of rasterio Window objects
    """
    windows = []
    stride = block_size - overlap
    
    for row in range(0, height, stride):
        for col in range(0, width, stride):
            w = Window(
                col_off=col,
                row_off=row,
                width=min(block_size, width - col),
                height=min(block_size, height - row),
            )
            windows.append(w)
    
    return windows


def merge_footprints(gdf: gpd.GeoDataFrame, distance: float = 0.5) -> gpd.GeoDataFrame:
    """
    Merge adjacent building footprints that are within a specified distance.
    
    Args:
        gdf: GeoDataFrame with footprints
        distance: Buffer distance for merging in CRS units
        
    Returns:
        GeoDataFrame with merged footprints
    """
    if len(gdf) == 0:
        return gdf
    
    # Buffer, union, unbuffer
    buffered = gdf.geometry.buffer(distance)
    merged = unary_union(buffered)
    unbuffered = merged.buffer(-distance)
    
    # Convert back to GeoDataFrame
    if isinstance(unbuffered, (Polygon, MultiPolygon)):
        if isinstance(unbuffered, Polygon):
            geoms = [unbuffered]
        else:
            geoms = list(unbuffered.geoms)
    else:
        geoms = []
    
    result = gpd.GeoDataFrame(
        {"geometry": geoms},
        crs=gdf.crs,
    )
    
    logger.info(f"Merged {len(gdf)} footprints to {len(result)}")
    return result


def calculate_footprint_orientation(polygon: Polygon) -> float:
    """
    Calculate the principal orientation of a building footprint.
    
    Args:
        polygon: Building footprint polygon
        
    Returns:
        Orientation angle in degrees (0-180)
    """
    mrr = polygon.minimum_rotated_rectangle
    coords = list(mrr.exterior.coords)
    
    # Get the two edges
    edge1 = np.array(coords[1]) - np.array(coords[0])
    edge2 = np.array(coords[2]) - np.array(coords[1])
    
    # Get angle of longer edge
    if np.linalg.norm(edge1) > np.linalg.norm(edge2):
        angle = np.arctan2(edge1[1], edge1[0])
    else:
        angle = np.arctan2(edge2[1], edge2[0])
    
    # Convert to degrees and normalize to 0-180
    angle_deg = np.degrees(angle) % 180
    return angle_deg


def spatial_join_with_weights(
    gdf1: gpd.GeoDataFrame,
    gdf2: gpd.GeoDataFrame,
    value_column: str,
) -> gpd.GeoDataFrame:
    """
    Perform spatial join with area-weighted averaging of values.
    
    Args:
        gdf1: Base GeoDataFrame
        gdf2: GeoDataFrame with values to join
        value_column: Column name with values to average
        
    Returns:
        GeoDataFrame with weighted average values
    """
    results = []
    
    for idx, row in gdf1.iterrows():
        intersecting = gdf2[gdf2.intersects(row.geometry)]
        
        if len(intersecting) == 0:
            results.append(np.nan)
            continue
        
        # Calculate area-weighted average
        total_weight = 0
        weighted_sum = 0
        
        for _, int_row in intersecting.iterrows():
            intersection = row.geometry.intersection(int_row.geometry)
            weight = intersection.area
            total_weight += weight
            weighted_sum += weight * int_row[value_column]
        
        if total_weight > 0:
            results.append(weighted_sum / total_weight)
        else:
            results.append(np.nan)
    
    gdf1[f"weighted_{value_column}"] = results
    return gdf1


def estimate_utm_zone(lon: float, lat: float) -> str:
    """
    Estimate the UTM zone EPSG code for a given location.
    
    Args:
        lon: Longitude in degrees
        lat: Latitude in degrees
        
    Returns:
        EPSG code string (e.g., "EPSG:32736")
    """
    zone = int((lon + 180) / 6) + 1
    
    if lat >= 0:
        epsg = 32600 + zone  # Northern hemisphere
    else:
        epsg = 32700 + zone  # Southern hemisphere
    
    return f"EPSG:{epsg}"


def validate_crs(crs_string: str) -> bool:
    """
    Validate a CRS string.
    
    Args:
        crs_string: CRS string to validate
        
    Returns:
        True if valid, False otherwise
    """
    try:
        CRS.from_string(crs_string)
        return True
    except Exception:
        return False


def get_raster_extent_as_polygon(raster_path: Path) -> Polygon:
    """
    Get the extent of a raster as a Shapely polygon.
    
    Args:
        raster_path: Path to raster file
        
    Returns:
        Polygon representing raster extent
    """
    info = get_raster_info(raster_path)
    bounds = info["bounds"]
    return box(bounds.left, bounds.bottom, bounds.right, bounds.top)
