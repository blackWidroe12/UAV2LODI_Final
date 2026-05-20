"""
SQLAlchemy models for UAV2LoD1-ZW Backend.
"""

import uuid
from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    String,
    Text,
    Float,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from .database import Base


def generate_uuid() -> str:
    """Generate a UUID string."""
    return str(uuid.uuid4())


class RunStatus(enum.Enum):
    """Pipeline run status enumeration."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StageStatus(enum.Enum):
    """Individual stage status enumeration."""
    LOCKED = "locked"
    READY = "ready"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"


class User(Base):
    """User model for authentication."""
    
    __tablename__ = "users"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(200), nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    # Relationships
    projects: Mapped[List["Project"]] = relationship(
        "Project", back_populates="owner", cascade="all, delete-orphan"
    )


class Project(Base):
    """Project model storing pipeline configuration and state."""
    
    __tablename__ = "projects"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    directory_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    crs: Mapped[str] = mapped_column(String(50), default="EPSG:32736")
    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    
    # Flight parameters (JSON for flexibility)
    flight_params: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "altitude": 100,
            "frontOverlap": 0.8,
            "sideOverlap": 0.8,
            "sensorWidth": 13.2,
        },
    )
    
    # Processing options (JSON for flexibility)
    processing_options: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "engine": "odm",
            "gsd": 0.05,
            "useGcp": False,
        },
    )
    
    # Project stats
    image_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    area_hectares: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    # Pipeline state
    last_completed_phase: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_modified: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="projects")
    runs: Mapped[List["Run"]] = relationship(
        "Run", back_populates="project", cascade="all, delete-orphan"
    )
    gcps: Mapped[List["GCP"]] = relationship(
        "GCP", back_populates="project", cascade="all, delete-orphan"
    )
    artifacts: Mapped[List["Artifact"]] = relationship(
        "Artifact", back_populates="project", cascade="all, delete-orphan"
    )


class Run(Base):
    """Pipeline run model tracking execution state."""
    
    __tablename__ = "runs"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=False
    )
    status: Mapped[RunStatus] = mapped_column(
        SAEnum(RunStatus), default=RunStatus.PENDING
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)  # 0-100
    
    # Stages to run (JSON array of stage IDs)
    stages: Mapped[list] = mapped_column(JSON, default=list)
    current_stage: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    # Error tracking
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Timestamps
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="runs")
    logs: Mapped[List["RunLog"]] = relationship(
        "RunLog", back_populates="run", cascade="all, delete-orphan"
    )


class RunLog(Base):
    """Log entries for pipeline runs."""
    
    __tablename__ = "run_logs"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("runs.id"), nullable=False
    )
    stage: Mapped[str] = mapped_column(String(50), nullable=False)
    level: Mapped[str] = mapped_column(String(20), default="info")  # info, warn, error, success, debug
    message: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    run: Mapped["Run"] = relationship("Run", back_populates="logs")


class GCP(Base):
    """Ground Control Point model."""
    
    __tablename__ = "gcps"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    elevation: Mapped[float] = mapped_column(Float, nullable=False)
    image_x: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    image_y: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    image_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="gcps")


class Artifact(Base):
    """Generated artifact model (GeoTIFFs, CityJSON, GeoPackages, etc.)."""
    
    __tablename__ = "artifacts"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=generate_uuid
    )
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    artifact_type: Mapped[str] = mapped_column(String(50), nullable=False)  # ortho, dsm, dtm, footprints, lod1, etc.
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # bytes
    mime_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    stage_id: Mapped[str] = mapped_column(String(50), nullable=False)  # which stage produced this
    metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # Additional artifact metadata
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="artifacts")
