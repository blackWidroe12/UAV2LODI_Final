"""
Artifacts router for serving generated files and images.
"""

import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, status, Query, Response
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select

from ..config import settings
from ..dependencies import DbSession, CurrentUser
from ..models import Project, Artifact
from ..schemas import ArtifactResponse
from ..services.file_service import file_service


router = APIRouter(tags=["Artifacts"])


# ============================================================================
# Project Artifacts
# ============================================================================

@router.get("/projects/{project_id}/artifacts", response_model=list[ArtifactResponse])
async def list_artifacts(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    List all artifacts for a project.
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
        select(Artifact)
        .where(Artifact.project_id == project_id)
        .order_by(Artifact.created_at.desc())
    )
    artifacts = result.scalars().all()
    
    return [ArtifactResponse.model_validate(a) for a in artifacts]


@router.get("/projects/{project_id}/artifacts/{artifact_name:path}")
async def serve_artifact(
    project_id: str,
    artifact_name: str,
    current_user: CurrentUser,
    db: DbSession,
    thumb: bool = Query(False, description="Return thumbnail version"),
    download: bool = Query(False, description="Force download"),
):
    """
    Serve an artifact file with support for thumbnails and range requests.
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
    
    # Build file path (sanitize to prevent directory traversal)
    project_dir = Path(project.directory_path)
    file_path = (project_dir / "outputs" / artifact_name).resolve()
    
    # Security check: ensure file is within project directory
    try:
        file_path.relative_to(project_dir.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: path traversal detected",
        )
    
    if not file_path.exists():
        # Try alternate locations
        alt_paths = [
            project_dir / artifact_name,
            project_dir / "images" / artifact_name,
            project_dir / "temp" / artifact_name,
        ]
        for alt_path in alt_paths:
            if alt_path.exists():
                file_path = alt_path.resolve()
                break
        else:
            raise HTTPException(status_code=404, detail="Artifact not found")
    
    # Handle thumbnail request
    if thumb:
        thumbnail_path = await file_service.get_or_create_thumbnail(file_path)
        if thumbnail_path and thumbnail_path.exists():
            file_path = thumbnail_path
    
    # Determine MIME type
    mime_type = file_service.get_mime_type(file_path)
    
    # Handle download
    if download:
        return FileResponse(
            path=file_path,
            filename=file_path.name,
            media_type=mime_type,
        )
    
    # For large files (GeoTIFF), support range requests
    file_size = file_path.stat().st_size
    
    if file_size > 10 * 1024 * 1024:  # > 10MB
        return FileResponse(
            path=file_path,
            media_type=mime_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
            },
        )
    
    return FileResponse(path=file_path, media_type=mime_type)


# ============================================================================
# Project Images
# ============================================================================

@router.get("/projects/{project_id}/images")
async def list_images(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    List raw UAV images for a project.
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
    
    images_dir = Path(project.directory_path) / "images"
    
    if not images_dir.exists():
        return {"images": [], "count": 0}
    
    image_extensions = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".dng"}
    images = []
    
    for f in sorted(images_dir.iterdir()):
        if f.suffix.lower() in image_extensions:
            stat = f.stat()
            images.append({
                "filename": f.name,
                "path": f"/api/projects/{project_id}/images/{f.name}",
                "thumbnail": f"/api/projects/{project_id}/images/{f.name}?thumb=true",
                "size": stat.st_size,
                "modified": stat.st_mtime,
            })
    
    return {"images": images, "count": len(images)}


@router.get("/projects/{project_id}/images/{image_name}")
async def serve_image(
    project_id: str,
    image_name: str,
    current_user: CurrentUser,
    db: DbSession,
    thumb: bool = Query(False, description="Return thumbnail version"),
):
    """
    Serve a raw UAV image with optional thumbnail.
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
    
    # Sanitize filename
    safe_name = Path(image_name).name
    images_dir = Path(project.directory_path) / "images"
    file_path = images_dir / safe_name
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Security check
    try:
        file_path.resolve().relative_to(images_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Handle thumbnail
    if thumb:
        thumbnail_path = await file_service.get_or_create_thumbnail(file_path)
        if thumbnail_path and thumbnail_path.exists():
            return FileResponse(
                path=thumbnail_path,
                media_type="image/jpeg",
            )
    
    mime_type = file_service.get_mime_type(file_path)
    return FileResponse(path=file_path, media_type=mime_type)


# ============================================================================
# Static File Serving (Avatars)
# ============================================================================

@router.get("/uploads/avatars/{filename}")
async def serve_avatar(filename: str):
    """
    Serve uploaded avatar images.
    """
    # Sanitize filename
    safe_name = Path(filename).name
    file_path = settings.avatars_path / safe_name
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Avatar not found")
    
    # Security check
    try:
        file_path.resolve().relative_to(settings.avatars_path.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    mime_type = file_service.get_mime_type(file_path)
    return FileResponse(path=file_path, media_type=mime_type)
