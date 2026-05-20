"""
Stage 7 - Workflow Packaging & Documentation
Dagster asset: pipeline_summary

This asset generates a final summary of the pipeline run, verifies all outputs,
and creates documentation.
"""

import logging
import time
from pathlib import Path
from datetime import datetime
from typing import Any

from dagster import asset, AssetExecutionContext, AssetIn

logger = logging.getLogger(__name__)


def verify_output_files(output_dir: Path) -> dict[str, bool]:
    """
    Verify that all expected output files exist.
    
    Args:
        output_dir: Output directory to check
        
    Returns:
        Dictionary mapping filename to existence status
    """
    expected_files = [
        "ortho_balanced.tif",
        "dsm_registered.tif",
        "hillshade.tif",
        "building_mask.tif",
        "footprints_raw.gpkg",
        "ndsm.tif",
        "ndsm_filtered.tif",
        "vegetation_mask.tif",
        "footprints_attributed.gpkg",
        "lod1_models.city.json",
        "lod1_models.gpkg",
        "lod1_models.obj",
        "accuracy_report.pdf",
        "accuracy_metrics.json",
    ]
    
    results = {}
    for filename in expected_files:
        file_path = output_dir / filename
        results[filename] = file_path.exists()
        
        # Also check for markdown fallback
        if not results[filename] and filename.endswith('.pdf'):
            md_path = file_path.with_suffix('.md')
            if md_path.exists():
                results[filename] = True
    
    return results


def calculate_file_sizes(output_dir: Path) -> dict[str, float]:
    """
    Calculate sizes of output files in MB.
    
    Args:
        output_dir: Output directory
        
    Returns:
        Dictionary mapping filename to size in MB
    """
    sizes = {}
    
    for file_path in output_dir.glob("*"):
        if file_path.is_file():
            sizes[file_path.name] = file_path.stat().st_size / (1024 * 1024)
    
    return sizes


def generate_readme(
    output_dir: Path,
    project_name: str,
    config: dict,
    metrics: dict,
    file_status: dict[str, bool],
) -> Path:
    """
    Generate README documentation for the output directory.
    
    Args:
        output_dir: Output directory
        project_name: Project name
        config: Pipeline configuration
        metrics: Pipeline metrics
        file_status: File verification results
        
    Returns:
        Path to README file
    """
    readme_path = output_dir / "README.txt"
    
    content = f"""
================================================================================
UAV2LoD1 Pipeline Output Documentation
================================================================================

Project: {project_name}
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Pipeline Version: 1.0.0

================================================================================
OVERVIEW
================================================================================

This directory contains the outputs of the UAV2LoD1 photogrammetry pipeline,
which converts UAV imagery into LoD1 (Level of Detail 1) 3D building models.

The pipeline follows these stages:
  0. Project Configuration
  1. SfM Processing (Orthophoto, DSM, DTM generation)
  2. Co-registration (Radiometric balancing, geometric alignment)
  3. Building Segmentation (Swin Transformer-based footprint extraction)
  4. Height Estimation (nDSM computation, vegetation filtering)
  5. LoD1 Export (CityJSON, GeoPackage, OBJ)
  6. Accuracy Assessment (if ground truth provided)
  7. Documentation (this file)

================================================================================
OUTPUT FILES
================================================================================

Intermediate Products:
----------------------
- ortho_balanced.tif     : Radiometrically balanced orthophoto
- dsm_registered.tif     : Geometrically aligned Digital Surface Model
- hillshade.tif          : Hillshade visualization of DSM
- ndsm.tif               : Normalized DSM (DSM - DTM)
- ndsm_filtered.tif      : Vegetation-filtered nDSM
- vegetation_mask.tif    : Binary vegetation mask
- building_mask.tif      : Binary building segmentation mask
- footprints_raw.gpkg    : Vectorized building footprints (pre-attribution)
- footprints_attributed.gpkg : Footprints with height attributes

Final Products:
---------------
- lod1_models.city.json  : CityJSON LoD1 building models
- lod1_models.gpkg       : GeoPackage with 3D-ready footprints
- lod1_models.obj        : OBJ mesh for 3D visualization
- {project_name}.qgs     : QGIS project file

Quality Reports:
----------------
- accuracy_report.pdf    : Accuracy assessment report (if GT available)
- accuracy_metrics.json  : Machine-readable metrics

================================================================================
FILE VERIFICATION
================================================================================

"""
    
    for filename, exists in file_status.items():
        status = "[OK]" if exists else "[MISSING]"
        content += f"  {status} {filename}\n"
    
    content += f"""
================================================================================
PIPELINE METRICS
================================================================================

Processing Summary:
"""
    
    for key, value in metrics.items():
        if isinstance(value, float):
            content += f"  - {key}: {value:.3f}\n"
        else:
            content += f"  - {key}: {value}\n"
    
    content += f"""
================================================================================
CONFIGURATION
================================================================================

Project Directory: {config.get('project_dir', 'N/A')}
Output CRS: {config.get('output_crs', 'N/A')}
Processing Engine: {config.get('processing', {}).get('engine', 'N/A')}
Desired GSD: {config.get('processing', {}).get('desired_gsd', 'N/A')} cm

Flight Parameters:
  - Altitude: {config.get('flight_params', {}).get('altitude', 'N/A')} m
  - Front Overlap: {config.get('flight_params', {}).get('front_overlap', 'N/A')}%
  - Side Overlap: {config.get('flight_params', {}).get('side_overlap', 'N/A')}%

Segmentation:
  - Model: {config.get('segmentation', {}).get('swin_model_variant', 'N/A')}
  - Fine-tuned: {config.get('segmentation', {}).get('finetune', False)}

================================================================================
USAGE INSTRUCTIONS
================================================================================

1. CityJSON Visualization:
   - Use ninja (https://ninja.cityjson.org/) for web viewing
   - Use QGIS with CityJSON plugin
   - Use cjio command-line tools

2. GeoPackage:
   - Open in QGIS, ArcGIS, or any GIS software
   - Enable 3D visualization with height extrusion

3. OBJ Mesh:
   - Open in Blender, MeshLab, or any 3D software
   - Import with Y-up coordinate system

4. QGIS Project:
   - Open the .qgs file directly in QGIS 3.x
   - 3D view available via View > New 3D Map View

================================================================================
CITATION
================================================================================

If you use this data in your research, please cite:

UAV2LoD1: Automated UAV-to-LoD1 3D Building Model Generation Pipeline
Version 1.0.0

================================================================================
CONTACT
================================================================================

For questions or issues, please contact the project maintainers.

================================================================================
"""
    
    with open(readme_path, 'w') as f:
        f.write(content)
    
    logger.info(f"README saved to {readme_path}")
    return readme_path


@asset(
    description="Generate final pipeline summary, verify outputs, and create documentation",
    ins={
        "project_config": AssetIn(),
        "sfm_outputs": AssetIn(),
        "coregistered": AssetIn(),
        "building_footprints": AssetIn(),
        "attributed_footprints": AssetIn(),
        "lod1_models": AssetIn(),
        "accuracy_report": AssetIn(),
    },
    compute_kind="documentation",
    group_name="packaging",
)
def pipeline_summary(
    context: AssetExecutionContext,
    project_config: dict,
    sfm_outputs: dict,
    coregistered: dict,
    building_footprints: dict,
    attributed_footprints: dict,
    lod1_models: dict,
    accuracy_report: dict,
) -> dict:
    """
    Dagster asset that generates a final pipeline summary.
    
    This is the final asset in the pipeline that:
    - Verifies all output files exist
    - Calculates file sizes
    - Aggregates metrics from all stages
    - Generates README documentation
    
    Args:
        context: Dagster execution context
        project_config: Configuration from project_config asset
        sfm_outputs: Outputs from sfm_outputs asset
        coregistered: Outputs from coregistered asset
        building_footprints: Outputs from building_footprints asset
        attributed_footprints: Outputs from attributed_footprints asset
        lod1_models: Outputs from lod1_models asset
        accuracy_report: Outputs from accuracy_report asset
        
    Returns:
        Dictionary containing summary information
    """
    config = project_config["config"]
    output_dir = Path(project_config["directories"]["outputs"])
    project_name = config["project_name"]
    
    context.log.info("Generating pipeline summary")
    
    # Verify output files
    file_status = verify_output_files(output_dir)
    verified_count = sum(1 for v in file_status.values() if v)
    total_count = len(file_status)
    
    context.log.info(f"File verification: {verified_count}/{total_count} files present")
    
    # Calculate file sizes
    file_sizes = calculate_file_sizes(output_dir)
    total_size_mb = sum(file_sizes.values())
    
    context.log.info(f"Total output size: {total_size_mb:.2f} MB")
    
    # Aggregate metrics
    aggregated_metrics = {
        "gsd_achieved_cm": sfm_outputs.get("metrics", {}).get("gsd_achieved_cm"),
        "processing_time_sfm_s": sfm_outputs.get("metrics", {}).get("processing_time_seconds"),
        "num_buildings": attributed_footprints.get("metrics", {}).get("num_buildings"),
        "median_height_m": attributed_footprints.get("metrics", {}).get("median_height_m"),
        "total_building_volume_m3": lod1_models.get("metrics", {}).get("total_volume_m3"),
        "f1_score": accuracy_report.get("footprint_metrics", {}).get("f1_score"),
        "height_rmse_m": accuracy_report.get("height_metrics", {}).get("rmse_m"),
    }
    
    # Generate README
    readme_path = generate_readme(
        output_dir,
        project_name,
        config,
        aggregated_metrics,
        file_status,
    )
    
    # Calculate completion status
    all_files_present = all(file_status.values())
    
    result = {
        "status": "SUCCESS" if all_files_present else "PARTIAL",
        "readme_path": str(readme_path),
        "file_verification": file_status,
        "file_sizes_mb": file_sizes,
        "total_size_mb": total_size_mb,
        "metrics": aggregated_metrics,
        "output_directory": str(output_dir),
        "completion_timestamp": datetime.now().isoformat(),
    }
    
    context.add_output_metadata({
        "status": result["status"],
        "files_verified": f"{verified_count}/{total_count}",
        "total_size_mb": round(total_size_mb, 2),
        "num_buildings": aggregated_metrics.get("num_buildings", 0),
        "f1_score": round(aggregated_metrics.get("f1_score", 0) or 0, 3),
        "output_directory": str(output_dir),
    })
    
    context.log.info(f"Pipeline summary complete. Status: {result['status']}")
    
    return result
