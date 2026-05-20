"""
Projects router for managing UAV photogrammetry projects.
"""

import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status, Query
from sqlalchemy import select, delete

from ..config import settings
from ..dependencies import DbSession, CurrentUser
from ..models import Project, GCP
from ..schemas import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    GCPCreate,
    GCPResponse,
    EstimateRequest,
    GhostRunEstimate,
    StageEstimate,
)


router = APIRouter(prefix="/projects", tags=["Projects"])


def sanitize_path(path_str: str) -> Path:
    """
    Sanitize a path to prevent directory traversal attacks.
    Returns absolute path if valid, raises exception otherwise.
    """
    path = Path(path_str).resolve()
    
    # Ensure path doesn't escape allowed directories
    allowed_roots = [settings.DATA_ROOT, Path("/data"), Path("/home")]
    
    is_allowed = any(
        str(path).startswith(str(root.resolve()))
        for root in allowed_roots
    )
    
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid directory path. Path must be within allowed directories.",
        )
    
    return path


@router.get("", response_model=list[ProjectResponse])
async def list_projects(current_user: CurrentUser, db: DbSession):
    """
    List all projects for the current user.
    """
    result = await db.execute(
        select(Project)
        .where(Project.owner_id == current_user.id)
        .order_by(Project.last_modified.desc())
    )
    projects = result.scalars().all()
    return [ProjectResponse.model_validate(p) for p in projects]


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Create a new photogrammetry project.
    """
    # Sanitize and validate directory path
    directory_path = sanitize_path(project_data.directory_path)
    
    # Create project directory structure if it doesn't exist
    try:
        directory_path.mkdir(parents=True, exist_ok=True)
        
        # Create standard subdirectories
        (directory_path / "images").mkdir(exist_ok=True)
        (directory_path / "outputs").mkdir(exist_ok=True)
        (directory_path / "temp").mkdir(exist_ok=True)
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Permission denied: cannot create project directory.",
        )
    except OSError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create project directory: {str(e)}",
        )
    
    # Count images if they exist
    image_count = None
    images_dir = directory_path / "images"
    if images_dir.exists():
        image_extensions = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".dng"}
        image_count = sum(
            1 for f in images_dir.iterdir()
            if f.suffix.lower() in image_extensions
        )
    
    # Create project in database
    project = Project(
        name=project_data.name,
        directory_path=str(directory_path),
        crs=project_data.crs,
        owner_id=current_user.id,
        image_count=image_count,
    )
    
    db.add(project)
    await db.flush()
    
    # Create default config.yaml
    config_data = {
        "project": {
            "id": project.id,
            "name": project.name,
            "crs": project.crs,
        },
        "flight_params": project.flight_params,
        "processing_options": project.processing_options,
    }
    
    config_path = directory_path / "config.yaml"
    try:
        import yaml
        with open(config_path, "w") as f:
            yaml.dump(config_data, f, default_flow_style=False)
    except ImportError:
        # Fallback to JSON if yaml not available
        with open(config_path.with_suffix(".json"), "w") as f:
            json.dump(config_data, f, indent=2)
    except Exception:
        pass  # Config file creation is optional
    
    return ProjectResponse.model_validate(project)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Get a specific project by ID.
    """
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id,
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    
    return ProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    updates: ProjectUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Update a project's configuration.
    """
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id,
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    
    # Apply updates
    if updates.name is not None:
        project.name = updates.name
    if updates.crs is not None:
        project.crs = updates.crs
    if updates.flight_params is not None:
        project.flight_params = updates.flight_params.model_dump(by_alias=True)
    if updates.processing_options is not None:
        project.processing_options = updates.processing_options.model_dump(by_alias=True)
    
    await db.flush()
    
    return ProjectResponse.model_validate(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Delete a project (database record only, not files).
    """
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id,
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    
    await db.delete(project)
    await db.flush()
    
    return None


# ============================================================================
# GCP (Ground Control Point) Endpoints
# ============================================================================

@router.get("/{project_id}/gcps", response_model=list[GCPResponse])
async def list_gcps(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    List all GCPs for a project.
    """
    # Verify project ownership
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    
    result = await db.execute(
        select(GCP).where(GCP.project_id == project_id)
    )
    gcps = result.scalars().all()
    
    return [GCPResponse.model_validate(g) for g in gcps]


@router.put("/{project_id}/gcps", response_model=list[GCPResponse])
async def save_gcps(
    project_id: str,
    gcps: list[GCPCreate],
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Replace all GCPs for a project.
    """
    # Verify project ownership
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Delete existing GCPs
    await db.execute(delete(GCP).where(GCP.project_id == project_id))
    
    # Create new GCPs
    new_gcps = []
    for gcp_data in gcps:
        gcp = GCP(
            project_id=project_id,
            name=gcp_data.name,
            longitude=gcp_data.longitude,
            latitude=gcp_data.latitude,
            elevation=gcp_data.elevation,
            image_x=gcp_data.image_x,
            image_y=gcp_data.image_y,
            image_id=gcp_data.image_id,
            is_verified=gcp_data.is_verified,
        )
        db.add(gcp)
        new_gcps.append(gcp)
    
    await db.flush()
    
    # Update project's use_gcp flag
    if new_gcps:
        processing_options = dict(project.processing_options)
        processing_options["useGcp"] = True
        project.processing_options = processing_options
        await db.flush()
    
    return [GCPResponse.model_validate(g) for g in new_gcps]


# ============================================================================
# Ghost Run Estimation
# ============================================================================

# Estimation factors based on image count (minutes per image)
STAGE_ESTIMATION_FACTORS = {
    "diagnostic": 0.02,
    "intake": 0.05,
    "sfm": 0.5,
    "dense_cloud": 1.0,
    "dsm_dtm": 0.4,
    "segmentation": 0.6,
    "lod_modeling": 0.3,
    "validation": 0.1,
    "analytics": 0.15,
    "export": 0.1,
}


@router.post("/{project_id}/estimate", response_model=GhostRunEstimate)
async def estimate_run_time(
    project_id: str,
    request: EstimateRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Estimate pipeline run time based on image count (ghost run).
    """
    # Verify project ownership
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.owner_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    
    estimates = []
    total_minutes = 0.0
    
    for stage_id, factor in STAGE_ESTIMATION_FACTORS.items():
        duration = factor * request.image_count
        estimates.append(StageEstimate(
            stage_id=stage_id,
            estimated_duration_minutes=round(duration, 2),
        ))
        total_minutes += duration
    
    return GhostRunEstimate(
        estimates=estimates,
        total_minutes=round(total_minutes, 2),
    )
