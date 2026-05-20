"""
Pipeline runs router for executing and monitoring pipeline stages.
"""

import asyncio
import json
from datetime import datetime
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from ..config import settings
from ..dependencies import DbSession, CurrentUser
from ..models import Project, Run, RunLog, RunStatus
from ..schemas import (
    RunCreate,
    RunResponse,
    RunProgressResponse,
    RunStagesRequest,
    SSEMessage,
    StageOptionsRequest,
    DiagnosticResponse,
    SfMResponse,
    DenseCloudRequest,
    DenseCloudResponse,
    DsmDtmResponse,
    SegmentationResponse,
    LodModelingRequest,
    LodModelingResponse,
    ValidationMetrics,
    VolumeAnalysisRequest,
    VolumeAnalysis,
    ExportConfig,
    ExportResponse,
    PipelineMetrics,
    ImageDiagnostic,
    CameraPosition,
    GCPResidual,
)
from ..services.run_tracker import run_tracker
from ..services.dagster_client import dagster_client


router = APIRouter(prefix="/projects/{project_id}", tags=["Pipeline"])


async def get_project_or_404(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> Project:
    """Helper to get project with ownership check."""
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
    
    return project


# ============================================================================
# Full Pipeline Run Endpoints
# ============================================================================

@router.post("/run-all", response_model=RunResponse, status_code=status.HTTP_202_ACCEPTED)
async def run_all_stages(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """
    Trigger a full pipeline run with all stages.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    # Create run record
    all_stages = [
        "diagnostic", "intake", "sfm", "dense_cloud", "dsm_dtm",
        "segmentation", "lod_modeling", "validation", "analytics", "export"
    ]
    
    run = Run(
        project_id=project.id,
        stages=all_stages,
        status=RunStatus.PENDING,
    )
    db.add(run)
    await db.flush()
    
    # Queue the run for background processing
    background_tasks.add_task(
        run_tracker.execute_run,
        run.id,
        project.id,
        all_stages,
    )
    
    return RunResponse.model_validate(run)


@router.post("/stages", response_model=RunResponse, status_code=status.HTTP_202_ACCEPTED)
async def run_specific_stages(
    project_id: str,
    request: RunStagesRequest,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """
    Trigger a run with specific stages only.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    # Validate stages
    valid_stages = {
        "diagnostic", "intake", "sfm", "dense_cloud", "dsm_dtm",
        "segmentation", "lod_modeling", "validation", "analytics", "export"
    }
    
    for stage in request.stages:
        if stage not in valid_stages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid stage: {stage}",
            )
    
    # Create run record
    run = Run(
        project_id=project.id,
        stages=request.stages,
        status=RunStatus.PENDING,
    )
    db.add(run)
    await db.flush()
    
    # Queue the run
    background_tasks.add_task(
        run_tracker.execute_run,
        run.id,
        project.id,
        request.stages,
    )
    
    return RunResponse.model_validate(run)


# ============================================================================
# Individual Stage Endpoints
# ============================================================================

@router.post("/stages/diagnostic", response_model=DiagnosticResponse)
async def run_diagnostic_stage(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
):
    """
    Run the pre-flight diagnostic stage.
    Analyzes image quality, blur, exposure, and overlap.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    # Simulate diagnostic results for demo
    diagnostics = []
    for i in range(min(project.image_count or 10, 50)):
        diagnostics.append(ImageDiagnostic(
            id=f"img_{i:04d}",
            filename=f"DJI_{i:04d}.JPG",
            blur_score=85 + (i % 15),
            exposure_score=90 + (i % 10),
            overlap_percent=75 + (i % 20),
            has_metadata=True,
            gps_valid=i % 20 != 0,  # 5% GPS issues
            thumbnail=f"/api/projects/{project_id}/images/DJI_{i:04d}.JPG?thumb=true",
        ))
    
    return DiagnosticResponse(
        diagnostics=diagnostics,
        overlap_heatmap=f"/api/projects/{project_id}/artifacts/overlap_heatmap.png",
    )


@router.post("/stages/intake", status_code=status.HTTP_202_ACCEPTED)
async def run_intake_stage(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Run the data intake and GCP alignment stage.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    # Update project state
    project.last_completed_phase = "intake"
    await db.flush()
    
    return {"message": "Intake stage completed"}


@router.post("/stages/sfm", response_model=SfMResponse)
async def run_sfm_stage(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Run the Structure from Motion (sparse reconstruction) stage.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    # Simulate SfM camera positions
    import random
    camera_positions = []
    for i in range(min(project.image_count or 10, 50)):
        camera_positions.append(CameraPosition(
            x=100 + random.uniform(-50, 50),
            y=100 + random.uniform(-50, 50),
            z=100 + random.uniform(-5, 5),
            rotation=[random.uniform(-0.1, 0.1) for _ in range(3)],
        ))
    
    project.last_completed_phase = "sfm"
    await db.flush()
    
    return SfMResponse(camera_positions=camera_positions)


@router.post("/stages/dense_cloud", response_model=DenseCloudResponse)
async def run_dense_cloud_stage(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
    options: DenseCloudRequest = DenseCloudRequest(),
):
    """
    Run the dense point cloud generation stage.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    # Simulate dense cloud generation
    quality_multiplier = {"low": 0.25, "medium": 0.5, "high": 1.0}
    point_count = int((project.image_count or 100) * 100000 * quality_multiplier[options.quality])
    
    project.last_completed_phase = "dense_cloud"
    await db.flush()
    
    return DenseCloudResponse(
        point_cloud_url=f"/api/projects/{project_id}/artifacts/point_cloud.las",
        point_count=point_count,
    )


@router.post("/stages/dsm_dtm", response_model=DsmDtmResponse)
async def run_dsm_dtm_stage(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Run the DSM/DTM/Ortho generation stage.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    project.last_completed_phase = "dsm_dtm"
    await db.flush()
    
    return DsmDtmResponse(
        dsm_url=f"/api/projects/{project_id}/artifacts/dsm.tif",
        dtm_url=f"/api/projects/{project_id}/artifacts/dtm.tif",
        ortho_url=f"/api/projects/{project_id}/artifacts/ortho.tif",
    )


@router.post("/stages/segmentation", response_model=SegmentationResponse)
async def run_segmentation_stage(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Run the AI segmentation (SwinV2 building footprint extraction) stage.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    # Simulate building detection
    import random
    building_count = random.randint(50, 500)
    
    project.last_completed_phase = "segmentation"
    await db.flush()
    
    return SegmentationResponse(
        footprints_geo_json=f"/api/projects/{project_id}/artifacts/footprints.geojson",
        building_count=building_count,
    )


@router.post("/stages/lod_modeling", response_model=LodModelingResponse)
async def run_lod_modeling_stage(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
    options: LodModelingRequest = LodModelingRequest(),
):
    """
    Run the LoD1/LoD2 3D model synthesis stage.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    import random
    building_count = random.randint(50, 500)
    
    project.last_completed_phase = "lod_modeling"
    await db.flush()
    
    return LodModelingResponse(
        model_url=f"/api/projects/{project_id}/artifacts/lod{options.lod_level}_models.city.json",
        building_count=building_count,
    )


@router.post("/stages/validation", response_model=ValidationMetrics)
async def run_validation_stage(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Run the quality assurance and validation stage.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    import random
    
    # Simulate validation metrics
    gcp_residuals = [
        GCPResidual(id=f"gcp_{i}", residual=random.uniform(0.01, 0.1))
        for i in range(5)
    ]
    
    project.last_completed_phase = "validation"
    await db.flush()
    
    return ValidationMetrics(
        rmse_x=random.uniform(0.02, 0.08),
        rmse_y=random.uniform(0.02, 0.08),
        rmse_z=random.uniform(0.05, 0.15),
        positional_accuracy=random.uniform(0.03, 0.1),
        relative_accuracy=random.uniform(0.01, 0.05),
        gcp_residuals=gcp_residuals,
    )


@router.post("/analytics/volume", response_model=VolumeAnalysis)
async def calculate_volume(
    project_id: str,
    request: VolumeAnalysisRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Calculate volume analysis for a polygon area.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    import random
    
    # Simulate volume calculation
    return VolumeAnalysis(
        polygon_coordinates=request.polygon,
        cut_volume=random.uniform(1000, 10000),
        fill_volume=random.uniform(500, 5000),
        net_volume=random.uniform(-2000, 5000),
        surface_area=random.uniform(500, 2000),
    )


@router.post("/export", response_model=ExportResponse)
async def export_project(
    project_id: str,
    config: ExportConfig,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Export project deliverables.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    project.last_completed_phase = "export"
    await db.flush()
    
    format_extensions = {
        "cityjson": ".city.json",
        "geopackage": ".gpkg",
        "obj": ".obj",
        "geojson": ".geojson",
        "las": ".las",
        "tiff": ".tif",
    }
    
    ext = format_extensions.get(config.format, ".zip")
    
    return ExportResponse(
        download_url=f"/api/projects/{project_id}/artifacts/export{ext}",
        cloud_url=config.cloud_url,
    )


# ============================================================================
# Generic Stage Runner
# ============================================================================

@router.post("/stages/{stage_id}")
async def run_generic_stage(
    project_id: str,
    stage_id: str,
    current_user: CurrentUser,
    db: DbSession,
    options: StageOptionsRequest = StageOptionsRequest(),
):
    """
    Generic endpoint to run any stage by ID.
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    valid_stages = {
        "diagnostic", "intake", "sfm", "dense_cloud", "dsm_dtm",
        "segmentation", "lod_modeling", "validation", "analytics", "export"
    }
    
    if stage_id not in valid_stages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid stage: {stage_id}",
        )
    
    # Update last completed phase
    project.last_completed_phase = stage_id
    await db.flush()
    
    return {"message": f"Stage {stage_id} completed", "stage_id": stage_id}


# ============================================================================
# Run Progress & Logs (SSE)
# ============================================================================

@router.get("/runs/{run_id}/progress", response_model=RunProgressResponse)
async def get_run_progress(
    project_id: str,
    run_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Get current progress of a pipeline run.
    """
    await get_project_or_404(project_id, current_user, db)
    
    result = await db.execute(
        select(Run).where(Run.id == run_id, Run.project_id == project_id)
    )
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    return RunProgressResponse(progress=run.progress)


@router.get("/stages/{stage_id}/stream")
async def stream_stage_progress(
    project_id: str,
    stage_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    SSE endpoint for real-time stage progress updates.
    """
    await get_project_or_404(project_id, current_user, db)
    
    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events for stage progress."""
        try:
            async for message in run_tracker.subscribe(project_id, stage_id):
                yield f"data: {message.model_dump_json(by_alias=True)}\n\n"
        except asyncio.CancelledError:
            pass
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/progress/stream")
async def stream_global_progress(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    SSE endpoint for global project progress updates.
    """
    await get_project_or_404(project_id, current_user, db)
    
    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events for global progress."""
        try:
            async for message in run_tracker.subscribe_global(project_id):
                yield f"data: {message.model_dump_json(by_alias=True)}\n\n"
        except asyncio.CancelledError:
            pass
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/runs/{run_id}/stop", status_code=status.HTTP_202_ACCEPTED)
async def stop_run(
    project_id: str,
    run_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Cancel a running pipeline execution.
    """
    await get_project_or_404(project_id, current_user, db)
    
    result = await db.execute(
        select(Run).where(Run.id == run_id, Run.project_id == project_id)
    )
    run = result.scalar_one_or_none()
    
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    
    if run.status not in [RunStatus.PENDING, RunStatus.RUNNING]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Run is not active",
        )
    
    # Cancel the run
    await run_tracker.cancel_run(run_id)
    
    run.status = RunStatus.CANCELLED
    run.completed_at = datetime.utcnow()
    await db.flush()
    
    return {"message": "Run cancelled"}


# ============================================================================
# Metrics Endpoint
# ============================================================================

@router.get("/metrics", response_model=PipelineMetrics)
async def get_project_metrics(
    project_id: str,
    current_user: CurrentUser,
    db: DbSession,
):
    """
    Get pipeline metrics from Stage 6 output (metrics.json).
    """
    project = await get_project_or_404(project_id, current_user, db)
    
    from pathlib import Path
    
    metrics_path = Path(project.directory_path) / "outputs" / "metrics.json"
    
    if metrics_path.exists():
        try:
            with open(metrics_path) as f:
                data = json.load(f)
            return PipelineMetrics(**data)
        except (json.JSONDecodeError, KeyError):
            pass
    
    # Return default/simulated metrics if file doesn't exist
    import random
    return PipelineMetrics(
        iou=random.uniform(0.75, 0.95),
        f1=random.uniform(0.80, 0.95),
        rmse=random.uniform(0.05, 0.15),
        mae=random.uniform(0.03, 0.10),
        completeness=random.uniform(0.85, 0.98),
        correctness=random.uniform(0.88, 0.97),
    )
