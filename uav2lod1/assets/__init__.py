"""
UAV2LoD1 Pipeline Assets

Dagster assets for the UAV-to-LoD1 3D building model generation pipeline.
"""

from uav2lod1.assets.config import project_config
from uav2lod1.assets.odm import sfm_outputs
from uav2lod1.assets.coregistration import coregistered
from uav2lod1.assets.segmentation import building_footprints
from uav2lod1.assets.height import attributed_footprints
from uav2lod1.assets.export import lod1_models
from uav2lod1.assets.evaluation import accuracy_report
from uav2lod1.assets.packaging import pipeline_summary

__all__ = [
    "project_config",
    "sfm_outputs",
    "coregistered",
    "building_footprints",
    "attributed_footprints",
    "lod1_models",
    "accuracy_report",
    "pipeline_summary",
]
