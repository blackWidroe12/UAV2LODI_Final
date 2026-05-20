"""
Stage 4 - Height Estimation & Vegetation Filtering
Dagster asset: attributed_footprints

This asset computes normalized DSM, filters vegetation, and attributes
building footprints with height statistics.
"""

import logging
from pathlib import Path
from typing import Optional

import numpy as np
import cv2
import rasterio
from rasterio.mask import mask as rasterio_mask
import geopandas as gpd
from shapely.geometry import mapping
from dagster import asset, AssetExecutionContext, AssetIn

logger = logging.getLogger(__name__)


def compute_ndsm(dsm_path: Path, dtm_path: Path, output_path: Path) -> Path:
    """
    Compute normalized DSM (nDSM = DSM - DTM).
    
    Args:
        dsm_path: Path to DSM
        dtm_path: Path to DTM
        output_path: Path for nDSM output
        
    Returns:
        Path to nDSM
    """
    logger.info("Computing nDSM")
    
    with rasterio.open(dsm_path) as dsm_src, rasterio.open(dtm_path) as dtm_src:
        dsm = dsm_src.read(1)
        dtm = dtm_src.read(1)
        profile = dsm_src.profile.copy()
        
        # Compute nDSM and clamp negatives to 0
        ndsm = dsm - dtm
        ndsm = np.maximum(ndsm, 0)
        
        # Handle nodata
        nodata_mask = (dsm == dsm_src.nodata) | (dtm == dtm_src.nodata) if dsm_src.nodata else np.zeros_like(dsm, dtype=bool)
        ndsm[nodata_mask] = 0
        
        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(ndsm, 1)
    
    logger.info(f"nDSM saved to {output_path}")
    return output_path


def compute_vegetation_mask(
    ortho_path: Path,
    output_path: Path,
    threshold: float = 0.2,
    has_nir: bool = False,
) -> tuple[Path, float]:
    """
    Compute vegetation mask using RGB-based vegetation index or NDVI.
    
    For RGB: Uses (R - G) / (R + G) which gives negative values for vegetation
    For NIR: Uses NDVI = (NIR - R) / (NIR + R)
    
    Args:
        ortho_path: Path to orthophoto
        output_path: Path for vegetation mask output
        threshold: Vegetation index threshold
        has_nir: Whether NIR band is available
        
    Returns:
        Tuple of (mask_path, vegetation_area_ratio)
    """
    logger.info("Computing vegetation mask")
    
    with rasterio.open(ortho_path) as src:
        profile = src.profile.copy()
        bands = src.count
        
        if has_nir and bands >= 4:
            # Use NDVI
            red = src.read(1).astype(np.float32)
            nir = src.read(4).astype(np.float32)
            
            # Avoid division by zero
            denominator = nir + red
            denominator[denominator == 0] = 1
            
            ndvi = (nir - red) / denominator
            veg_mask = ndvi > threshold
            
        else:
            # Use RGB-based index: (G - R) / (G + R)
            # Green vegetation appears more green than red
            red = src.read(1).astype(np.float32)
            green = src.read(2).astype(np.float32)
            
            # Avoid division by zero
            denominator = green + red
            denominator[denominator == 0] = 1
            
            veg_index = (green - red) / denominator
            veg_mask = veg_index > threshold
        
        # Calculate vegetation area ratio
        veg_area_ratio = np.sum(veg_mask) / veg_mask.size
        
        # Save mask
        profile.update(count=1, dtype=np.uint8)
        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(veg_mask.astype(np.uint8), 1)
    
    logger.info(f"Vegetation mask saved. Coverage: {veg_area_ratio:.2%}")
    return output_path, veg_area_ratio


def apply_bilateral_filter(
    ndsm_path: Path,
    output_path: Path,
    sigma_color: float = 0.1,
    sigma_spatial: float = 15,
) -> Path:
    """
    Apply bilateral filter to nDSM to smooth while preserving edges.
    
    Args:
        ndsm_path: Path to nDSM
        output_path: Path for filtered output
        sigma_color: Color/intensity sigma
        sigma_spatial: Spatial sigma
        
    Returns:
        Path to filtered nDSM
    """
    logger.info("Applying bilateral filter to nDSM")
    
    with rasterio.open(ndsm_path) as src:
        ndsm = src.read(1)
        profile = src.profile.copy()
        
        # Normalize for filtering
        ndsm_min, ndsm_max = ndsm.min(), ndsm.max()
        ndsm_range = ndsm_max - ndsm_min if ndsm_max > ndsm_min else 1
        ndsm_norm = ((ndsm - ndsm_min) / ndsm_range * 255).astype(np.uint8)
        
        # Apply bilateral filter
        filtered_norm = cv2.bilateralFilter(
            ndsm_norm,
            d=-1,  # Auto-compute from sigma_spatial
            sigmaColor=sigma_color * 255,
            sigmaSpace=sigma_spatial,
        )
        
        # Denormalize
        filtered = (filtered_norm.astype(np.float32) / 255) * ndsm_range + ndsm_min
        
        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(filtered, 1)
    
    logger.info(f"Filtered nDSM saved to {output_path}")
    return output_path


def filter_ndsm_vegetation(
    ndsm_path: Path,
    veg_mask_path: Path,
    output_path: Path,
) -> Path:
    """
    Suppress vegetation in nDSM by multiplying with (1 - vegetation_mask).
    
    Args:
        ndsm_path: Path to nDSM
        veg_mask_path: Path to vegetation mask
        output_path: Path for filtered output
        
    Returns:
        Path to vegetation-filtered nDSM
    """
    logger.info("Filtering vegetation from nDSM")
    
    with rasterio.open(ndsm_path) as ndsm_src, rasterio.open(veg_mask_path) as veg_src:
        ndsm = ndsm_src.read(1)
        veg_mask = veg_src.read(1)
        profile = ndsm_src.profile.copy()
        
        # Apply vegetation mask (suppress vegetation areas)
        filtered = ndsm * (1 - veg_mask)
        
        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(filtered, 1)
    
    logger.info(f"Vegetation-filtered nDSM saved to {output_path}")
    return output_path


def extract_height_statistics(
    footprints_path: Path,
    ndsm_path: Path,
    min_height: float = 2.0,
    max_height: float = 100.0,
) -> gpd.GeoDataFrame:
    """
    Extract height statistics for each building footprint.
    
    Args:
        footprints_path: Path to footprints GeoPackage
        ndsm_path: Path to filtered nDSM
        min_height: Minimum valid building height
        max_height: Maximum valid building height
        
    Returns:
        GeoDataFrame with height attributes
    """
    logger.info("Extracting height statistics for footprints")
    
    gdf = gpd.read_file(footprints_path)
    
    if len(gdf) == 0:
        logger.warning("No footprints to process")
        return gdf
    
    with rasterio.open(ndsm_path) as src:
        # Extract statistics for each footprint
        mean_heights = []
        max_heights = []
        min_heights = []
        height_stds = []
        
        for idx, row in gdf.iterrows():
            try:
                # Mask nDSM with footprint
                masked, _ = rasterio_mask(
                    src,
                    [mapping(row.geometry)],
                    crop=True,
                    all_touched=True,
                )
                
                # Get valid height values (exclude zeros and nodata)
                values = masked[0]
                valid_mask = (values > 0) & (values < max_height)
                valid_values = values[valid_mask]
                
                if len(valid_values) > 0:
                    mean_h = np.mean(valid_values)
                    max_h = np.max(valid_values)
                    min_h = np.min(valid_values)
                    std_h = np.std(valid_values)
                else:
                    mean_h = max_h = min_h = std_h = 0
                
                mean_heights.append(mean_h)
                max_heights.append(max_h)
                min_heights.append(min_h)
                height_stds.append(std_h)
                
            except Exception as e:
                logger.warning(f"Failed to extract height for footprint {idx}: {e}")
                mean_heights.append(0)
                max_heights.append(0)
                min_heights.append(0)
                height_stds.append(0)
    
    # Add columns
    gdf["mean_height"] = mean_heights
    gdf["max_height"] = max_heights
    gdf["min_height"] = min_heights
    gdf["height_std"] = height_stds
    
    # Filter out invalid heights
    valid_mask = (gdf["mean_height"] >= min_height) & (gdf["mean_height"] <= max_height)
    invalid_count = (~valid_mask).sum()
    
    if invalid_count > 0:
        logger.info(f"Filtering {invalid_count} buildings with invalid heights")
        gdf = gdf[valid_mask].copy()
    
    logger.info(f"Height statistics extracted for {len(gdf)} buildings")
    return gdf


def apply_height_correction(
    gdf: gpd.GeoDataFrame,
    truth_heights_path: Optional[Path] = None,
) -> gpd.GeoDataFrame:
    """
    Apply linear correction to heights if ground truth is available.
    
    Args:
        gdf: GeoDataFrame with height attributes
        truth_heights_path: Path to CSV with ground truth heights
        
    Returns:
        GeoDataFrame with corrected heights
    """
    if truth_heights_path is None or not truth_heights_path.exists():
        logger.info("No ground truth heights available, skipping correction")
        return gdf
    
    import pandas as pd
    from scipy import stats
    
    logger.info("Applying height correction from ground truth")
    
    # Load truth data (expects columns: building_id, true_height)
    truth_df = pd.read_csv(truth_heights_path)
    
    if "building_id" not in truth_df.columns or "true_height" not in truth_df.columns:
        logger.warning("Invalid truth file format, skipping correction")
        return gdf
    
    # Merge with predictions
    merged = gdf.merge(truth_df, on="building_id", how="inner")
    
    if len(merged) < 5:
        logger.warning("Insufficient ground truth samples for correction")
        return gdf
    
    # Linear regression
    slope, intercept, r_value, p_value, std_err = stats.linregress(
        merged["mean_height"], merged["true_height"]
    )
    
    logger.info(f"Height correction: y = {slope:.3f}x + {intercept:.3f}, R² = {r_value**2:.3f}")
    
    # Apply correction
    gdf["mean_height_uncorrected"] = gdf["mean_height"]
    gdf["mean_height"] = gdf["mean_height"] * slope + intercept
    gdf["max_height"] = gdf["max_height"] * slope + intercept
    gdf["min_height"] = gdf["min_height"] * slope + intercept
    
    return gdf


@asset(
    description="Compute nDSM, filter vegetation, and attribute footprints with heights",
    ins={
        "project_config": AssetIn(),
        "coregistered": AssetIn(),
        "sfm_outputs": AssetIn(),
        "building_footprints": AssetIn(),
    },
    compute_kind="gis_analysis",
    group_name="height_estimation",
)
def attributed_footprints(
    context: AssetExecutionContext,
    project_config: dict,
    coregistered: dict,
    sfm_outputs: dict,
    building_footprints: dict,
) -> dict:
    """
    Dagster asset that computes building heights and attributes footprints.
    
    Steps:
    1. Compute nDSM (DSM - DTM)
    2. Create vegetation mask
    3. Apply bilateral filter to nDSM
    4. Filter vegetation from nDSM
    5. Extract height statistics for each footprint
    6. Optionally apply ground truth correction
    
    Args:
        context: Dagster execution context
        project_config: Configuration from project_config asset
        coregistered: Outputs from coregistered asset
        sfm_outputs: Outputs from sfm_outputs asset
        building_footprints: Outputs from building_footprints asset
        
    Returns:
        Dictionary containing paths and metrics
    """
    config = project_config["config"]
    output_dir = Path(project_config["directories"]["outputs"])
    
    dsm_path = Path(coregistered["dsm_registered_path"])
    dtm_path = Path(sfm_outputs["dtm_path"])
    ortho_path = Path(coregistered["ortho_balanced_path"])
    footprints_path = Path(building_footprints["footprints_path"])
    
    height_config = config.get("height_estimation", {})
    ndvi_threshold = height_config.get("ndvi_threshold", 0.2)
    sigma_color = height_config.get("bilateral_sigma_color", 0.1)
    sigma_spatial = height_config.get("bilateral_sigma_spatial", 15)
    min_height = height_config.get("min_building_height", 2.0)
    max_height = height_config.get("max_building_height", 100.0)
    
    context.log.info("Starting height estimation pipeline")
    
    # Step 1: Compute nDSM
    ndsm_path = output_dir / "ndsm.tif"
    compute_ndsm(dsm_path, dtm_path, ndsm_path)
    context.log.info("nDSM computed")
    
    # Step 2: Vegetation mask
    veg_mask_path = output_dir / "vegetation_mask.tif"
    _, veg_area_ratio = compute_vegetation_mask(
        ortho_path, veg_mask_path,
        threshold=ndvi_threshold,
        has_nir=False,  # Assume RGB only
    )
    context.log.info(f"Vegetation mask created. Coverage: {veg_area_ratio:.2%}")
    
    # Step 3: Bilateral filter
    ndsm_filtered_path = output_dir / "ndsm_bilateral.tif"
    apply_bilateral_filter(
        ndsm_path, ndsm_filtered_path,
        sigma_color=sigma_color,
        sigma_spatial=sigma_spatial,
    )
    context.log.info("Bilateral filter applied")
    
    # Step 4: Filter vegetation
    ndsm_final_path = output_dir / "ndsm_filtered.tif"
    filter_ndsm_vegetation(ndsm_filtered_path, veg_mask_path, ndsm_final_path)
    context.log.info("Vegetation filtered from nDSM")
    
    # Step 5: Extract heights
    gdf = extract_height_statistics(
        footprints_path, ndsm_final_path,
        min_height=min_height,
        max_height=max_height,
    )
    
    # Step 6: Apply correction if truth available
    truth_path = config.get("validation", {}).get("truth_heights_path")
    if truth_path:
        gdf = apply_height_correction(gdf, Path(truth_path))
    
    # Save attributed footprints
    attributed_path = output_dir / "footprints_attributed.gpkg"
    gdf.to_file(attributed_path, driver="GPKG")
    context.log.info(f"Saved attributed footprints to {attributed_path}")
    
    # Calculate statistics
    num_buildings = len(gdf)
    if num_buildings > 0:
        median_height = gdf["mean_height"].median()
        mean_height = gdf["mean_height"].mean()
        max_height_val = gdf["mean_height"].max()
    else:
        median_height = mean_height = max_height_val = 0
    
    result = {
        "ndsm_path": str(ndsm_path),
        "ndsm_filtered_path": str(ndsm_final_path),
        "vegetation_mask_path": str(veg_mask_path),
        "footprints_path": str(attributed_path),
        "metrics": {
            "num_buildings": num_buildings,
            "median_height_m": float(median_height),
            "mean_height_m": float(mean_height),
            "max_height_m": float(max_height_val),
            "vegetation_coverage": float(veg_area_ratio),
        },
    }
    
    context.add_output_metadata({
        "num_buildings": num_buildings,
        "median_height_m": round(median_height, 2),
        "mean_height_m": round(mean_height, 2),
        "max_height_m": round(max_height_val, 2),
        "vegetation_coverage_percent": round(veg_area_ratio * 100, 1),
        "footprints_path": str(attributed_path),
    })
    
    return result
