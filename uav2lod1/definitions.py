"""
Dagster Definitions for UAV2LoD1 Pipeline

This module defines the complete Dagster repository with all assets,
resources, and jobs for the UAV2LoD1 pipeline.
"""

from dagster import (
    Definitions,
    AssetSelection,
    define_asset_job,
    ScheduleDefinition,
    load_assets_from_modules,
)

from uav2lod1 import assets


# Load all assets from the assets module
all_assets = load_assets_from_modules([assets])

# Define main processing job
full_pipeline_job = define_asset_job(
    name="uav2lod1_full_pipeline",
    selection=AssetSelection.all(),
    description="Run the complete UAV2LoD1 pipeline from configuration to final export",
)

# Define partial jobs for debugging/testing
sfm_only_job = define_asset_job(
    name="sfm_only",
    selection=AssetSelection.keys("project_config", "sfm_outputs"),
    description="Run only SfM processing stage",
)

segmentation_job = define_asset_job(
    name="segmentation_only",
    selection=AssetSelection.keys(
        "project_config",
        "sfm_outputs", 
        "coregistered",
        "building_footprints"
    ),
    description="Run through building footprint extraction",
)

export_job = define_asset_job(
    name="export_only",
    selection=AssetSelection.keys(
        "project_config",
        "sfm_outputs",
        "coregistered",
        "building_footprints",
        "attributed_footprints",
        "lod1_models",
    ),
    description="Run through LoD1 model export",
)


# Dagster definitions
defs = Definitions(
    assets=all_assets,
    jobs=[
        full_pipeline_job,
        sfm_only_job,
        segmentation_job,
        export_job,
    ],
)
