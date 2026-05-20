"""
Stage 2 - Radiometric & Geometric Co-registration
Dagster asset: coregistered

This asset performs radiometric balancing and geometric alignment between
the orthophoto and DSM using feature matching.
"""

import logging
import subprocess
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

import numpy as np
import cv2
import rasterio
from rasterio.warp import reproject, Resampling
from dagster import asset, AssetExecutionContext, AssetIn

logger = logging.getLogger(__name__)


@dataclass
class CoregistrationResult:
    """Container for coregistration results."""
    ortho_balanced_path: Path
    dsm_registered_path: Path
    hillshade_path: Path
    transform_matrix: np.ndarray
    shift_meters: tuple[float, float]
    num_inliers: int
    method_used: str


def apply_clahe_balance(ortho_path: Path, output_path: Path) -> Path:
    """
    Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to balance
    the orthophoto radiometrically.
    
    Args:
        ortho_path: Path to input orthophoto
        output_path: Path for balanced output
        
    Returns:
        Path to balanced orthophoto
    """
    logger.info(f"Applying CLAHE balancing to {ortho_path}")
    
    with rasterio.open(ortho_path) as src:
        profile = src.profile.copy()
        data = src.read()
        
        # Apply CLAHE to each channel
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        
        balanced = np.zeros_like(data)
        for i in range(min(3, data.shape[0])):  # Process RGB channels
            balanced[i] = clahe.apply(data[i])
        
        # Copy any additional channels (alpha, NIR, etc.)
        if data.shape[0] > 3:
            balanced[3:] = data[3:]
        
        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(balanced)
    
    logger.info(f"Balanced orthophoto saved to {output_path}")
    return output_path


def generate_hillshade(dsm_path: Path, output_path: Path, azimuth: float = 315, altitude: float = 45) -> Path:
    """
    Generate hillshade from DSM using GDAL.
    
    Args:
        dsm_path: Path to DSM GeoTIFF
        output_path: Path for hillshade output
        azimuth: Sun azimuth angle in degrees
        altitude: Sun altitude angle in degrees
        
    Returns:
        Path to hillshade
    """
    logger.info(f"Generating hillshade from {dsm_path}")
    
    try:
        # Try using gdaldem
        cmd = [
            "gdaldem", "hillshade",
            str(dsm_path), str(output_path),
            "-az", str(azimuth),
            "-alt", str(altitude),
            "-compute_edges",
            "-of", "GTiff",
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        logger.info(f"Hillshade generated with GDAL: {output_path}")
        
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Fallback to pure Python implementation
        logger.warning("GDAL not available, using Python hillshade implementation")
        _python_hillshade(dsm_path, output_path, azimuth, altitude)
    
    return output_path


def _python_hillshade(dsm_path: Path, output_path: Path, azimuth: float, altitude: float) -> None:
    """Pure Python hillshade implementation."""
    with rasterio.open(dsm_path) as src:
        dem = src.read(1)
        profile = src.profile.copy()
        transform = src.transform
        
        # Calculate cell size
        cell_size = abs(transform.a)
        
        # Convert angles to radians
        azimuth_rad = np.radians(360 - azimuth + 90)
        altitude_rad = np.radians(altitude)
        
        # Calculate gradients
        dy, dx = np.gradient(dem, cell_size)
        
        # Calculate slope and aspect
        slope = np.arctan(np.sqrt(dx**2 + dy**2))
        aspect = np.arctan2(-dy, dx)
        
        # Calculate hillshade
        hillshade = (
            np.sin(altitude_rad) * np.cos(slope) +
            np.cos(altitude_rad) * np.sin(slope) * np.cos(azimuth_rad - aspect)
        )
        
        # Scale to 0-255
        hillshade = ((hillshade + 1) * 127.5).astype(np.uint8)
        
        # Update profile
        profile.update(dtype=np.uint8, count=1)
        
        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(hillshade, 1)


def match_features_loftr(ortho_gray: np.ndarray, hillshade: np.ndarray) -> tuple[np.ndarray, np.ndarray, int]:
    """
    Match features between ortho and hillshade using LoFTR.
    
    Args:
        ortho_gray: Grayscale orthophoto
        hillshade: Hillshade image
        
    Returns:
        Tuple of (keypoints_ortho, keypoints_hillshade, num_matches)
    """
    try:
        import torch
        from kornia.feature import LoFTR
        
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using LoFTR on device: {device}")
        
        # Initialize LoFTR
        matcher = LoFTR(pretrained="outdoor").to(device)
        matcher.eval()
        
        # Prepare images
        img0 = torch.from_numpy(ortho_gray).float()[None, None] / 255.0
        img1 = torch.from_numpy(hillshade).float()[None, None] / 255.0
        
        img0 = img0.to(device)
        img1 = img1.to(device)
        
        # Match
        with torch.no_grad():
            input_dict = {"image0": img0, "image1": img1}
            correspondences = matcher(input_dict)
        
        mkpts0 = correspondences["keypoints0"].cpu().numpy()
        mkpts1 = correspondences["keypoints1"].cpu().numpy()
        
        logger.info(f"LoFTR found {len(mkpts0)} matches")
        return mkpts0, mkpts1, len(mkpts0)
        
    except ImportError:
        logger.warning("Kornia not available, falling back to SIFT")
        return None, None, 0
    except Exception as e:
        logger.warning(f"LoFTR failed: {e}, falling back to SIFT")
        return None, None, 0


def match_features_sift(ortho_gray: np.ndarray, hillshade: np.ndarray) -> tuple[np.ndarray, np.ndarray, int]:
    """
    Match features using SIFT + FLANN.
    
    Args:
        ortho_gray: Grayscale orthophoto
        hillshade: Hillshade image
        
    Returns:
        Tuple of (keypoints_ortho, keypoints_hillshade, num_matches)
    """
    logger.info("Using SIFT + FLANN for feature matching")
    
    # Initialize SIFT
    sift = cv2.SIFT_create(nfeatures=10000)
    
    # Detect and compute keypoints
    kp1, des1 = sift.detectAndCompute(ortho_gray, None)
    kp2, des2 = sift.detectAndCompute(hillshade, None)
    
    if des1 is None or des2 is None or len(des1) < 2 or len(des2) < 2:
        logger.warning("Insufficient keypoints detected")
        return np.array([]), np.array([]), 0
    
    # FLANN matcher
    FLANN_INDEX_KDTREE = 1
    index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
    search_params = dict(checks=50)
    flann = cv2.FlannBasedMatcher(index_params, search_params)
    
    matches = flann.knnMatch(des1, des2, k=2)
    
    # Apply ratio test
    good_matches = []
    for m, n in matches:
        if m.distance < 0.7 * n.distance:
            good_matches.append(m)
    
    if len(good_matches) < 4:
        logger.warning(f"Only {len(good_matches)} good matches found")
        return np.array([]), np.array([]), 0
    
    # Extract matched keypoint coordinates
    pts1 = np.float32([kp1[m.queryIdx].pt for m in good_matches])
    pts2 = np.float32([kp2[m.trainIdx].pt for m in good_matches])
    
    logger.info(f"SIFT found {len(good_matches)} good matches")
    return pts1, pts2, len(good_matches)


def estimate_transform(pts_src: np.ndarray, pts_dst: np.ndarray, method: str = "homography") -> tuple[np.ndarray, int]:
    """
    Estimate transformation matrix using RANSAC.
    
    Args:
        pts_src: Source points
        pts_dst: Destination points
        method: 'homography' or 'translation'
        
    Returns:
        Tuple of (transform_matrix, num_inliers)
    """
    if len(pts_src) < 4:
        logger.warning("Insufficient points for transformation estimation")
        return np.eye(3), 0
    
    if method == "homography":
        M, mask = cv2.findHomography(pts_src, pts_dst, cv2.RANSAC, 5.0)
        if M is None:
            return np.eye(3), 0
        num_inliers = np.sum(mask) if mask is not None else 0
        
    else:  # translation only
        # Compute median translation
        translations = pts_dst - pts_src
        tx = np.median(translations[:, 0])
        ty = np.median(translations[:, 1])
        
        M = np.array([
            [1, 0, tx],
            [0, 1, ty],
            [0, 0, 1]
        ], dtype=np.float64)
        
        # Count inliers (within 5 pixel threshold)
        errors = np.sqrt(np.sum((pts_src + [tx, ty] - pts_dst)**2, axis=1))
        num_inliers = np.sum(errors < 5)
    
    return M, num_inliers


def apply_transform_to_raster(
    src_path: Path,
    ref_path: Path,
    output_path: Path,
    transform_matrix: np.ndarray,
) -> Path:
    """
    Apply transformation to DSM to align with orthophoto.
    
    Args:
        src_path: Path to source DSM
        ref_path: Path to reference orthophoto
        output_path: Path for aligned output
        transform_matrix: 3x3 transformation matrix
        
    Returns:
        Path to aligned DSM
    """
    logger.info(f"Applying transformation to {src_path}")
    
    with rasterio.open(ref_path) as ref:
        ref_transform = ref.transform
        ref_crs = ref.crs
        ref_shape = (ref.height, ref.width)
    
    with rasterio.open(src_path) as src:
        src_data = src.read(1)
        src_transform = src.transform
        src_crs = src.crs
        profile = src.profile.copy()
        
        # Convert pixel-space transform to world coordinates
        # For simplicity, we'll use reproject with the same CRS
        # but adjusted transform based on the shift
        
        # Extract translation from transform matrix (in pixels)
        tx_pixels = transform_matrix[0, 2]
        ty_pixels = transform_matrix[1, 2]
        
        # Convert to world coordinates
        pixel_size_x = abs(src_transform.a)
        pixel_size_y = abs(src_transform.e)
        tx_world = tx_pixels * pixel_size_x
        ty_world = -ty_pixels * pixel_size_y  # Y is inverted
        
        # Create adjusted transform
        adjusted_transform = rasterio.Affine(
            src_transform.a,
            src_transform.b,
            src_transform.c + tx_world,
            src_transform.d,
            src_transform.e,
            src_transform.f + ty_world,
        )
        
        # Reproject to reference grid
        dst_data = np.zeros(ref_shape, dtype=src_data.dtype)
        
        reproject(
            source=src_data,
            destination=dst_data,
            src_transform=adjusted_transform,
            src_crs=src_crs,
            dst_transform=ref_transform,
            dst_crs=ref_crs,
            resampling=Resampling.bilinear,
        )
        
        # Update profile
        profile.update(
            transform=ref_transform,
            width=ref_shape[1],
            height=ref_shape[0],
            crs=ref_crs,
        )
        
        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(dst_data, 1)
    
    logger.info(f"Aligned DSM saved to {output_path}")
    return output_path


@asset(
    description="Perform radiometric balancing and geometric co-registration of ortho and DSM",
    ins={
        "project_config": AssetIn(),
        "sfm_outputs": AssetIn(),
    },
    compute_kind="image_processing",
    group_name="preprocessing",
)
def coregistered(
    context: AssetExecutionContext,
    project_config: dict,
    sfm_outputs: dict,
) -> dict:
    """
    Dagster asset that performs co-registration between orthophoto and DSM.
    
    Steps:
    1. Apply CLAHE radiometric balancing to orthophoto
    2. Generate hillshade from DSM
    3. Match features using LoFTR (fallback to SIFT)
    4. Estimate transformation with RANSAC
    5. Apply transformation to align DSM with orthophoto
    
    Args:
        context: Dagster execution context
        project_config: Configuration from project_config asset
        sfm_outputs: Outputs from sfm_outputs asset
        
    Returns:
        Dictionary containing paths to aligned products and alignment metrics
    """
    config = project_config["config"]
    output_dir = Path(project_config["directories"]["outputs"])
    
    ortho_path = Path(sfm_outputs["ortho_path"])
    dsm_path = Path(sfm_outputs["dsm_path"])
    
    context.log.info("Starting co-registration process")
    
    # Step 1: Radiometric balancing
    ortho_balanced_path = output_dir / "ortho_balanced.tif"
    apply_clahe_balance(ortho_path, ortho_balanced_path)
    context.log.info("Radiometric balancing complete")
    
    # Step 2: Generate hillshade
    hillshade_path = output_dir / "hillshade.tif"
    generate_hillshade(dsm_path, hillshade_path)
    context.log.info("Hillshade generation complete")
    
    # Step 3: Load images for matching
    with rasterio.open(ortho_balanced_path) as src:
        ortho_data = src.read()
        # Convert to grayscale
        if ortho_data.shape[0] >= 3:
            ortho_gray = cv2.cvtColor(
                np.moveaxis(ortho_data[:3], 0, -1),
                cv2.COLOR_RGB2GRAY
            )
        else:
            ortho_gray = ortho_data[0]
    
    with rasterio.open(hillshade_path) as src:
        hillshade = src.read(1)
    
    # Step 4: Feature matching
    coregistration_method = config.get("coregistration_method", "loftr")
    
    if coregistration_method == "loftr":
        pts_ortho, pts_hillshade, num_matches = match_features_loftr(ortho_gray, hillshade)
        method_used = "loftr"
        
        # Fallback to SIFT if LoFTR fails or has too few matches
        if num_matches < 10:
            context.log.warning(f"LoFTR found only {num_matches} matches, falling back to SIFT")
            pts_ortho, pts_hillshade, num_matches = match_features_sift(ortho_gray, hillshade)
            method_used = "sift_fallback"
    else:
        pts_ortho, pts_hillshade, num_matches = match_features_sift(ortho_gray, hillshade)
        method_used = "sift"
    
    context.log.info(f"Feature matching complete: {num_matches} matches using {method_used}")
    
    # Step 5: Estimate transformation
    if num_matches < 10:
        context.log.warning("Insufficient matches, using translation-only model")
        transform_matrix, num_inliers = estimate_transform(
            pts_ortho, pts_hillshade, method="translation"
        )
    else:
        transform_matrix, num_inliers = estimate_transform(
            pts_ortho, pts_hillshade, method="homography"
        )
    
    context.log.info(f"Transform estimated with {num_inliers} inliers")
    
    # Calculate shift in meters
    with rasterio.open(dsm_path) as src:
        pixel_size = abs(src.transform.a)
    
    tx_meters = transform_matrix[0, 2] * pixel_size
    ty_meters = transform_matrix[1, 2] * pixel_size
    
    context.log.info(f"Estimated shift: X={tx_meters:.3f}m, Y={ty_meters:.3f}m")
    
    # Step 6: Apply transformation
    dsm_registered_path = output_dir / "dsm_registered.tif"
    apply_transform_to_raster(
        dsm_path, ortho_balanced_path, dsm_registered_path, transform_matrix
    )
    context.log.info("DSM alignment complete")
    
    # Build result
    result = {
        "ortho_balanced_path": str(ortho_balanced_path),
        "dsm_registered_path": str(dsm_registered_path),
        "hillshade_path": str(hillshade_path),
        "alignment_report": {
            "method_used": method_used,
            "num_matches": num_matches,
            "num_inliers": num_inliers,
            "shift_x_meters": float(tx_meters),
            "shift_y_meters": float(ty_meters),
            "transform_matrix": transform_matrix.tolist(),
        },
    }
    
    # Add metadata
    context.add_output_metadata({
        "method_used": method_used,
        "num_matches": num_matches,
        "num_inliers": num_inliers,
        "shift_x_meters": round(tx_meters, 3),
        "shift_y_meters": round(ty_meters, 3),
        "ortho_balanced_path": str(ortho_balanced_path),
        "dsm_registered_path": str(dsm_registered_path),
    })
    
    return result
