"""
Pydantic schemas for API request/response validation.
Matches the frontend API contract exactly.
"""

from datetime import datetime
from typing import Optional, Any, Generic, TypeVar, Literal
from pydantic import BaseModel, Field, EmailStr, ConfigDict


T = TypeVar("T")


# ============================================================================
# Generic API Response Envelope
# ============================================================================

class ErrorDetail(BaseModel):
    """Error detail structure."""
    code: str
    message: str


class ApiResponse(BaseModel, Generic[T]):
    """
    Standard API response envelope.
    All responses follow this structure.
    """
    success: bool
    data: Optional[T] = None
    error: Optional[ErrorDetail] = None


# ============================================================================
# Authentication Schemas
# ============================================================================

class UserBase(BaseModel):
    """Base user schema."""
    email: EmailStr
    username: str = Field(min_length=2, max_length=100)
    first_name: str = Field(alias="firstName", min_length=1, max_length=100)
    last_name: str = Field(alias="lastName", min_length=1, max_length=100)
    department: str = Field(max_length=200)
    
    model_config = ConfigDict(populate_by_name=True)


class UserCreate(UserBase):
    """Schema for user registration."""
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """User response schema (without password)."""
    id: str
    username: str
    email: str
    first_name: str = Field(serialization_alias="firstName")
    last_name: str = Field(serialization_alias="lastName")
    department: str
    avatar_url: Optional[str] = Field(default=None, serialization_alias="avatarUrl")
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class AuthResponse(BaseModel):
    """Authentication response with user and token."""
    user: UserResponse
    token: str


class AvatarUploadResponse(BaseModel):
    """Avatar upload response."""
    avatar_url: str = Field(serialization_alias="avatarUrl")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Project Schemas
# ============================================================================

class FlightParams(BaseModel):
    """Flight parameters configuration."""
    altitude: float = Field(default=100, ge=20, le=400)
    front_overlap: float = Field(default=0.8, alias="frontOverlap", ge=0.5, le=0.95)
    side_overlap: float = Field(default=0.8, alias="sideOverlap", ge=0.5, le=0.95)
    sensor_width: float = Field(default=13.2, alias="sensorWidth", ge=1, le=50)
    
    model_config = ConfigDict(populate_by_name=True)


class ProcessingOptions(BaseModel):
    """Processing options configuration."""
    engine: Literal["odm", "pix4d"] = "odm"
    gsd: float = Field(default=0.05, ge=0.01, le=0.5)
    use_gcp: bool = Field(default=False, alias="useGcp")
    
    model_config = ConfigDict(populate_by_name=True)


class ProjectCreate(BaseModel):
    """Schema for creating a new project."""
    name: str = Field(min_length=1, max_length=255)
    directory_path: str = Field(alias="directoryPath", min_length=1)
    crs: str = Field(default="EPSG:32736")
    
    model_config = ConfigDict(populate_by_name=True)


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: Optional[str] = Field(default=None, max_length=255)
    crs: Optional[str] = None
    flight_params: Optional[FlightParams] = Field(default=None, alias="flightParams")
    processing_options: Optional[ProcessingOptions] = Field(default=None, alias="processingOptions")
    
    model_config = ConfigDict(populate_by_name=True)


class ProjectResponse(BaseModel):
    """Project response schema."""
    id: str
    name: str
    directory_path: str = Field(serialization_alias="directoryPath")
    crs: str
    created_at: datetime = Field(serialization_alias="createdAt")
    last_modified: datetime = Field(serialization_alias="lastModified")
    last_completed_phase: Optional[str] = Field(default=None, serialization_alias="lastCompletedPhase")
    flight_params: dict = Field(serialization_alias="flightParams")
    processing_options: dict = Field(serialization_alias="processingOptions")
    image_count: Optional[int] = Field(default=None, serialization_alias="imageCount")
    area_hectares: Optional[float] = Field(default=None, serialization_alias="areaHectares")
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ============================================================================
# GCP (Ground Control Point) Schemas
# ============================================================================

class GCPBase(BaseModel):
    """Base GCP schema."""
    name: str = Field(max_length=100)
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    elevation: float
    image_x: Optional[float] = Field(default=None, alias="imageX")
    image_y: Optional[float] = Field(default=None, alias="imageY")
    image_id: Optional[str] = Field(default=None, alias="imageId")
    is_verified: bool = Field(default=False, alias="isVerified")
    
    model_config = ConfigDict(populate_by_name=True)


class GCPCreate(GCPBase):
    """Schema for creating a GCP."""
    pass


class GCPResponse(GCPBase):
    """GCP response schema."""
    id: str
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ============================================================================
# Pipeline Stage Schemas
# ============================================================================

StageId = Literal[
    "diagnostic",
    "intake",
    "sfm",
    "dense_cloud",
    "dsm_dtm",
    "segmentation",
    "lod_modeling",
    "validation",
    "analytics",
    "export",
]

StageStatus = Literal["locked", "ready", "processing", "completed", "error"]
LogLevel = Literal["info", "warn", "error", "success", "debug"]


class StageResponse(BaseModel):
    """Stage status response."""
    id: StageId
    name: str
    short_name: str = Field(serialization_alias="shortName")
    description: str
    status: StageStatus
    progress: int = Field(ge=0, le=100)
    error_message: Optional[str] = Field(default=None, serialization_alias="errorMessage")
    estimated_duration: Optional[int] = Field(default=None, serialization_alias="estimatedDuration")
    actual_duration: Optional[int] = Field(default=None, serialization_alias="actualDuration")
    
    model_config = ConfigDict(populate_by_name=True)


class RunStagesRequest(BaseModel):
    """Request to run specific stages."""
    stages: list[StageId]


class StageOptionsRequest(BaseModel):
    """Generic stage options request."""
    quality: Optional[Literal["low", "medium", "high"]] = None
    lod_level: Optional[Literal[1, 2]] = Field(default=None, alias="lodLevel")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Run & Logs Schemas
# ============================================================================

class RunCreate(BaseModel):
    """Schema for creating a pipeline run."""
    stages: list[StageId] = Field(default_factory=lambda: [
        "diagnostic", "intake", "sfm", "dense_cloud", "dsm_dtm",
        "segmentation", "lod_modeling", "validation", "analytics", "export"
    ])


class RunResponse(BaseModel):
    """Run response schema."""
    id: str
    project_id: str = Field(serialization_alias="projectId")
    status: str
    progress: int
    stages: list[str]
    current_stage: Optional[str] = Field(default=None, serialization_alias="currentStage")
    error_message: Optional[str] = Field(default=None, serialization_alias="errorMessage")
    started_at: Optional[datetime] = Field(default=None, serialization_alias="startedAt")
    completed_at: Optional[datetime] = Field(default=None, serialization_alias="completedAt")
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class RunProgressResponse(BaseModel):
    """Run progress response."""
    progress: int = Field(ge=0, le=100)


class LogEntryResponse(BaseModel):
    """Log entry response."""
    id: str
    timestamp: datetime
    level: LogLevel
    message: str
    source: str


# ============================================================================
# SSE Message Schemas
# ============================================================================

class SSEMessage(BaseModel):
    """Server-Sent Event message schema."""
    type: Literal["progress", "log", "complete", "error"]
    stage_id: Optional[StageId] = Field(default=None, serialization_alias="stageId")
    progress: Optional[int] = None
    message: Optional[str] = None
    level: Optional[LogLevel] = None
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Diagnostic & Intake Schemas
# ============================================================================

class ImageDiagnostic(BaseModel):
    """Image diagnostic result."""
    id: str
    filename: str
    blur_score: float = Field(serialization_alias="blurScore")
    exposure_score: float = Field(serialization_alias="exposureScore")
    overlap_percent: float = Field(serialization_alias="overlapPercent")
    has_metadata: bool = Field(serialization_alias="hasMetadata")
    gps_valid: bool = Field(serialization_alias="gpsValid")
    thumbnail: Optional[str] = None
    
    model_config = ConfigDict(populate_by_name=True)


class DiagnosticResponse(BaseModel):
    """Diagnostic stage response."""
    diagnostics: list[ImageDiagnostic]
    overlap_heatmap: str = Field(serialization_alias="overlapHeatmap")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# SfM Stage Schemas
# ============================================================================

class CameraPosition(BaseModel):
    """Camera position from SfM."""
    x: float
    y: float
    z: float
    rotation: list[float]


class SfMResponse(BaseModel):
    """SfM stage response."""
    camera_positions: list[CameraPosition] = Field(serialization_alias="cameraPositions")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Dense Cloud Stage Schemas
# ============================================================================

class DenseCloudRequest(BaseModel):
    """Dense cloud request options."""
    quality: Literal["low", "medium", "high"] = "medium"


class DenseCloudResponse(BaseModel):
    """Dense cloud stage response."""
    point_cloud_url: str = Field(serialization_alias="pointCloudUrl")
    point_count: int = Field(serialization_alias="pointCount")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# DSM/DTM Stage Schemas
# ============================================================================

class DsmDtmResponse(BaseModel):
    """DSM/DTM stage response."""
    dsm_url: str = Field(serialization_alias="dsmUrl")
    dtm_url: str = Field(serialization_alias="dtmUrl")
    ortho_url: str = Field(serialization_alias="orthoUrl")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Segmentation Stage Schemas
# ============================================================================

class SegmentationResponse(BaseModel):
    """Segmentation stage response."""
    footprints_geo_json: str = Field(serialization_alias="footprintsGeoJson")
    building_count: int = Field(serialization_alias="buildingCount")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# LoD Modeling Stage Schemas
# ============================================================================

class LodModelingRequest(BaseModel):
    """LoD modeling request options."""
    lod_level: Literal[1, 2] = Field(default=1, alias="lodLevel")
    
    model_config = ConfigDict(populate_by_name=True)


class LodModelingResponse(BaseModel):
    """LoD modeling stage response."""
    model_url: str = Field(serialization_alias="modelUrl")
    building_count: int = Field(serialization_alias="buildingCount")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Validation Stage Schemas
# ============================================================================

class GCPResidual(BaseModel):
    """GCP residual for validation."""
    id: str
    residual: float


class ValidationMetrics(BaseModel):
    """Validation metrics response."""
    rmse_x: float = Field(serialization_alias="rmseX")
    rmse_y: float = Field(serialization_alias="rmseY")
    rmse_z: float = Field(serialization_alias="rmseZ")
    positional_accuracy: float = Field(serialization_alias="positionalAccuracy")
    relative_accuracy: float = Field(serialization_alias="relativeAccuracy")
    gcp_residuals: list[GCPResidual] = Field(serialization_alias="gcpResiduals")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Analytics Stage Schemas
# ============================================================================

class VolumeAnalysisRequest(BaseModel):
    """Volume analysis request."""
    polygon: list[tuple[float, float]]


class VolumeAnalysis(BaseModel):
    """Volume analysis response."""
    polygon_coordinates: list[tuple[float, float]] = Field(serialization_alias="polygonCoordinates")
    cut_volume: float = Field(serialization_alias="cutVolume")
    fill_volume: float = Field(serialization_alias="fillVolume")
    net_volume: float = Field(serialization_alias="netVolume")
    surface_area: float = Field(serialization_alias="surfaceArea")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Export Stage Schemas
# ============================================================================

ExportFormat = Literal["cityjson", "geopackage", "obj", "geojson", "las", "tiff"]


class ExportConfig(BaseModel):
    """Export configuration."""
    format: ExportFormat
    include_textures: bool = Field(default=True, alias="includeTextures")
    lod_level: Literal[1, 2] = Field(default=1, alias="lodLevel")
    cloud_url: Optional[str] = Field(default=None, alias="cloudUrl")
    
    model_config = ConfigDict(populate_by_name=True)


class ExportResponse(BaseModel):
    """Export stage response."""
    download_url: str = Field(serialization_alias="downloadUrl")
    cloud_url: Optional[str] = Field(default=None, serialization_alias="cloudUrl")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Ghost Run / Estimation Schemas
# ============================================================================

class EstimateRequest(BaseModel):
    """Ghost run estimate request."""
    image_count: int = Field(alias="imageCount", ge=1)
    
    model_config = ConfigDict(populate_by_name=True)


class StageEstimate(BaseModel):
    """Individual stage estimate."""
    stage_id: StageId = Field(serialization_alias="stageId")
    estimated_duration_minutes: float = Field(serialization_alias="estimatedDurationMinutes")
    
    model_config = ConfigDict(populate_by_name=True)


class GhostRunEstimate(BaseModel):
    """Ghost run estimate response."""
    estimates: list[StageEstimate]
    total_minutes: float = Field(serialization_alias="totalMinutes")
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Artifact Schemas
# ============================================================================

class ArtifactResponse(BaseModel):
    """Artifact response schema."""
    id: str
    name: str
    artifact_type: str = Field(serialization_alias="artifactType")
    file_path: str = Field(serialization_alias="filePath")
    file_size: Optional[int] = Field(default=None, serialization_alias="fileSize")
    mime_type: Optional[str] = Field(default=None, serialization_alias="mimeType")
    stage_id: str = Field(serialization_alias="stageId")
    metadata: Optional[dict] = None
    created_at: datetime = Field(serialization_alias="createdAt")
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ============================================================================
# Metrics Schemas (Stage 6 Output)
# ============================================================================

class PipelineMetrics(BaseModel):
    """Complete pipeline metrics from Stage 6."""
    iou: float
    f1: float
    rmse: float
    mae: float
    completeness: float
    correctness: float
    
    model_config = ConfigDict(populate_by_name=True)


# ============================================================================
# Health Check Schema
# ============================================================================

class HealthCheck(BaseModel):
    """Health check response."""
    status: str = "healthy"
    version: str
    database: str = "connected"
