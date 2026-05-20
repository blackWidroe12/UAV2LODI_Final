"""
Stage 0 - Project Setup & Configuration
Dagster asset: project_config

This asset reads and validates the pipeline configuration, creates the project
directory structure, and returns the validated config object.
"""

import logging
from pathlib import Path
from typing import Optional, Literal
from enum import Enum

import yaml
from pydantic import BaseModel, Field, field_validator, model_validator
from dagster import asset, AssetExecutionContext, Config

logger = logging.getLogger(__name__)


class ProcessingEngine(str, Enum):
    """Supported photogrammetry processing engines."""
    ODM = "odm"
    PIX4D = "pix4d"


class CoregistrationMethod(str, Enum):
    """Supported coregistration methods."""
    LOFTR = "loftr"
    SIFT = "sift"
    ORB = "orb"


class SwinModelVariant(str, Enum):
    """Supported Swin Transformer model variants."""
    SWINV2_TINY = "swinv2_tiny_window8_256"
    SWINV2_SMALL = "swinv2_small_window8_256"
    SWINV2_BASE = "swinv2_base_window8_256"
    SWINV2_LARGE = "swinv2_large_window12_192"


class FlightParameters(BaseModel):
    """UAV flight parameters for photogrammetric processing."""
    altitude: float = Field(ge=10, le=500, description="Flight altitude in meters")
    front_overlap: float = Field(ge=50, le=95, alias="overlap", description="Front overlap percentage")
    side_overlap: float = Field(ge=50, le=95, default=70, description="Side overlap percentage")
    sensor_width: float = Field(gt=0, description="Camera sensor width in mm")
    focal_length: float = Field(gt=0, description="Camera focal length in mm")


class ProcessingOptions(BaseModel):
    """SfM processing options."""
    engine: ProcessingEngine = ProcessingEngine.ODM
    desired_gsd: float = Field(ge=0.5, le=20, description="Desired GSD in cm")
    rtk_mode: bool = Field(default=False, description="Whether RTK/PPK GNSS was used")
    feature_quality: Literal["ultra", "high", "medium", "low"] = "high"
    pc_quality: Literal["ultra", "high", "medium", "low"] = "high"


class SegmentationOptions(BaseModel):
    """Building segmentation options."""
    swin_model_variant: SwinModelVariant = SwinModelVariant.SWINV2_BASE
    finetune: bool = Field(default=False, description="Whether to fine-tune the model")
    tile_size: int = Field(default=512, ge=256, le=1024)
    tile_overlap: int = Field(default=64, ge=0, le=256)
    batch_size: int = Field(default=4, ge=1, le=32)


class HeightEstimationOptions(BaseModel):
    """Height estimation and vegetation filtering options."""
    ndvi_threshold: float = Field(default=0.2, ge=-1, le=1)
    bilateral_sigma_color: float = Field(default=0.1, ge=0)
    bilateral_sigma_spatial: float = Field(default=15, ge=0)
    min_building_height: float = Field(default=2.0, ge=0)
    max_building_height: float = Field(default=100.0, ge=0)


class ValidationOptions(BaseModel):
    """Accuracy assessment options."""
    truth_footprints_path: Optional[str] = None
    truth_heights_path: Optional[str] = None
    iou_threshold: float = Field(default=0.5, ge=0, le=1)


class PipelineConfig(BaseModel):
    """
    Complete pipeline configuration model.
    Validates all input parameters for the UAV2LoD1 processing pipeline.
    """
    # Project identification
    project_name: str = Field(min_length=1, max_length=100)
    project_dir: Path = Field(description="Base project directory")
    
    # Input data
    image_folder: Path = Field(description="Path to UAV images")
    gcp_file: Optional[Path] = Field(default=None, description="Path to GCP file")
    
    # Coordinate reference system
    output_crs: str = Field(default="EPSG:32736", description="Output CRS (EPSG code)")
    
    # Processing parameters
    flight_params: FlightParameters
    processing: ProcessingOptions = Field(default_factory=ProcessingOptions)
    coregistration_method: CoregistrationMethod = CoregistrationMethod.LOFTR
    segmentation: SegmentationOptions = Field(default_factory=SegmentationOptions)
    height_estimation: HeightEstimationOptions = Field(default_factory=HeightEstimationOptions)
    validation: ValidationOptions = Field(default_factory=ValidationOptions)

    @field_validator("image_folder", mode="before")
    @classmethod
    def validate_image_folder(cls, v: str | Path) -> Path:
        """Validate that image folder exists."""
        path = Path(v)
        if not path.exists():
            raise ValueError(f"Image folder does not exist: {path}")
        return path

    @field_validator("gcp_file", mode="before")
    @classmethod
    def validate_gcp_file(cls, v: str | Path | None) -> Path | None:
        """Validate GCP file if provided."""
        if v is None:
            return None
        path = Path(v)
        if not path.exists():
            raise ValueError(f"GCP file does not exist: {path}")
        return path

    @model_validator(mode="after")
    def validate_config(self) -> "PipelineConfig":
        """Cross-field validation."""
        # Validate GSD is achievable given flight parameters
        theoretical_gsd = (
            self.flight_params.altitude * self.flight_params.sensor_width
        ) / (self.flight_params.focal_length * 1000)  # Convert to cm
        
        if self.processing.desired_gsd < theoretical_gsd * 0.8:
            logger.warning(
                f"Desired GSD ({self.processing.desired_gsd}cm) may not be achievable "
                f"given flight altitude. Theoretical GSD: {theoretical_gsd:.2f}cm"
            )
        
        return self

    @property
    def inputs_dir(self) -> Path:
        """Get inputs directory path."""
        return self.project_dir / "inputs"

    @property
    def outputs_dir(self) -> Path:
        """Get outputs directory path."""
        return self.project_dir / "outputs"

    @property
    def models_dir(self) -> Path:
        """Get models directory path."""
        return self.project_dir / "models"


class ProjectConfigResource(Config):
    """Dagster resource configuration for project config."""
    config_path: str = Field(description="Path to YAML configuration file")


def load_config_from_yaml(config_path: Path) -> PipelineConfig:
    """
    Load and validate pipeline configuration from a YAML file.
    
    Args:
        config_path: Path to the YAML configuration file
        
    Returns:
        Validated PipelineConfig object
        
    Raises:
        FileNotFoundError: If config file doesn't exist
        ValueError: If config validation fails
    """
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")
    
    logger.info(f"Loading configuration from: {config_path}")
    
    with open(config_path, "r") as f:
        raw_config = yaml.safe_load(f)
    
    # Parse and validate configuration
    config = PipelineConfig(**raw_config)
    
    logger.info(f"Configuration validated for project: {config.project_name}")
    return config


def create_directory_structure(config: PipelineConfig) -> dict[str, Path]:
    """
    Create the project directory structure if it doesn't exist.
    
    Args:
        config: Validated pipeline configuration
        
    Returns:
        Dictionary mapping directory names to their paths
    """
    directories = {
        "project": config.project_dir,
        "inputs": config.inputs_dir,
        "outputs": config.outputs_dir,
        "models": config.models_dir,
        "logs": config.project_dir / "logs",
        "temp": config.project_dir / "temp",
    }
    
    for name, path in directories.items():
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
            logger.info(f"Created directory: {name} -> {path}")
        else:
            logger.debug(f"Directory exists: {name} -> {path}")
    
    return directories


@asset(
    description="Load and validate pipeline configuration, create project directory structure",
    compute_kind="python",
    group_name="setup",
)
def project_config(context: AssetExecutionContext, config: ProjectConfigResource) -> dict:
    """
    Dagster asset that loads, validates, and prepares the pipeline configuration.
    
    This is the entry point for the pipeline - all other assets depend on this one.
    
    Args:
        context: Dagster execution context
        config: Resource configuration with path to YAML config file
        
    Returns:
        Dictionary containing:
        - config: Validated PipelineConfig as a dictionary
        - directories: Created directory paths
        - metadata: Additional configuration metadata
    """
    config_path = Path(config.config_path)
    
    try:
        # Load and validate configuration
        pipeline_config = load_config_from_yaml(config_path)
        context.log.info(f"Loaded configuration for project: {pipeline_config.project_name}")
        
        # Create directory structure
        directories = create_directory_structure(pipeline_config)
        context.log.info(f"Project directory structure created at: {pipeline_config.project_dir}")
        
        # Count input images
        image_extensions = {".jpg", ".jpeg", ".tif", ".tiff", ".png"}
        image_count = sum(
            1 for f in pipeline_config.image_folder.iterdir()
            if f.suffix.lower() in image_extensions
        )
        context.log.info(f"Found {image_count} images in input folder")
        
        # Prepare output dictionary
        result = {
            "config": pipeline_config.model_dump(mode="json"),
            "directories": {k: str(v) for k, v in directories.items()},
            "metadata": {
                "project_name": pipeline_config.project_name,
                "image_count": image_count,
                "output_crs": pipeline_config.output_crs,
                "processing_engine": pipeline_config.processing.engine.value,
                "has_gcp": pipeline_config.gcp_file is not None,
            },
        }
        
        # Log materialization metadata
        context.add_output_metadata({
            "project_name": pipeline_config.project_name,
            "image_count": image_count,
            "output_crs": pipeline_config.output_crs,
            "processing_engine": pipeline_config.processing.engine.value,
            "has_gcp": pipeline_config.gcp_file is not None,
            "config_path": str(config_path),
        })
        
        return result
        
    except Exception as e:
        context.log.error(f"Failed to load configuration: {e}")
        raise


# Example YAML configuration template
EXAMPLE_CONFIG_YAML = """
# UAV2LoD1 Pipeline Configuration
project_name: "harare_cbd_mapping"
project_dir: "/data/projects/harare_cbd"
image_folder: "/data/raw/harare_cbd_uav"
gcp_file: "/data/raw/harare_cbd_uav/gcps.txt"  # Optional
output_crs: "EPSG:32736"  # UTM Zone 36S for Zimbabwe

flight_params:
  altitude: 120  # meters AGL
  overlap: 80    # front overlap percentage
  side_overlap: 70
  sensor_width: 36  # mm (full-frame sensor)
  focal_length: 35  # mm

processing:
  engine: "odm"
  desired_gsd: 2.5  # cm
  rtk_mode: false
  feature_quality: "high"
  pc_quality: "high"

coregistration_method: "loftr"

segmentation:
  swin_model_variant: "swinv2_base_window8_256"
  finetune: false
  tile_size: 512
  tile_overlap: 64
  batch_size: 4

height_estimation:
  ndvi_threshold: 0.2
  bilateral_sigma_color: 0.1
  bilateral_sigma_spatial: 15
  min_building_height: 2.0
  max_building_height: 100.0

validation:
  truth_footprints_path: null  # Optional path to ground truth footprints
  truth_heights_path: null     # Optional path to ground truth heights CSV
  iou_threshold: 0.5
"""
