"""
Dagster client service for interfacing with the pipeline orchestration.

This is a stub implementation that simulates Dagster calls.
In production, this would communicate with a real Dagster instance.
"""

import asyncio
from dataclasses import dataclass
from typing import Callable, Awaitable, Optional
from enum import Enum


class StageStatus(Enum):
    """Status of a pipeline stage."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class StageResult:
    """Result of a stage execution."""
    stage_id: str
    status: StageStatus
    progress: int  # 0-100
    message: str
    artifacts: list[str] = None
    
    def __post_init__(self):
        if self.artifacts is None:
            self.artifacts = []


class DagsterClient:
    """
    Client for interfacing with Dagster pipeline orchestration.
    
    Currently implements a simulation mode for development.
    In production, this would connect to a Dagster GraphQL API.
    """
    
    def __init__(self, graphql_url: Optional[str] = None):
        """
        Initialize the Dagster client.
        
        Args:
            graphql_url: URL of Dagster GraphQL API (None for simulation mode)
        """
        self.graphql_url = graphql_url
        self.simulation_mode = graphql_url is None
        
        # Stage execution times (simulated, in seconds)
        self.stage_durations = {
            "diagnostic": 5,
            "intake": 8,
            "sfm": 15,
            "dense_cloud": 30,
            "dsm_dtm": 12,
            "segmentation": 20,
            "lod_modeling": 10,
            "validation": 5,
            "analytics": 8,
            "export": 5,
        }
        
        # Expected artifacts per stage
        self.stage_artifacts = {
            "diagnostic": ["overlap_heatmap.png", "diagnostics.json"],
            "intake": ["gcps.csv", "image_metadata.json"],
            "sfm": ["cameras.json", "sparse_cloud.ply"],
            "dense_cloud": ["point_cloud.las"],
            "dsm_dtm": ["dsm.tif", "dtm.tif", "ortho.tif"],
            "segmentation": ["building_mask.tif", "footprints.gpkg", "footprints.geojson"],
            "lod_modeling": ["lod1_models.city.json", "lod1_models.gpkg"],
            "validation": ["metrics.json", "validation_report.pdf"],
            "analytics": ["analytics.json"],
            "export": ["export.zip"],
        }
    
    async def execute_stage(
        self,
        stage_id: str,
        project_id: str,
        project_dir: str,
        on_progress: Optional[Callable[[int, str], Awaitable[None]]] = None,
    ) -> StageResult:
        """
        Execute a single pipeline stage.
        
        Args:
            stage_id: ID of the stage to execute
            project_id: ID of the project
            project_dir: Path to the project directory
            on_progress: Optional async callback for progress updates
        
        Returns:
            StageResult with execution outcome
        """
        if self.simulation_mode:
            return await self._simulate_stage(stage_id, project_id, on_progress)
        else:
            return await self._execute_dagster_stage(
                stage_id, project_id, project_dir, on_progress
            )
    
    async def _simulate_stage(
        self,
        stage_id: str,
        project_id: str,
        on_progress: Optional[Callable[[int, str], Awaitable[None]]] = None,
    ) -> StageResult:
        """Simulate stage execution for development."""
        duration = self.stage_durations.get(stage_id, 10)
        steps = 20  # Number of progress updates
        
        for i in range(steps + 1):
            progress = int((i / steps) * 100)
            message = self._get_progress_message(stage_id, progress)
            
            if on_progress:
                await on_progress(progress, message)
            
            if i < steps:
                await asyncio.sleep(duration / steps)
        
        return StageResult(
            stage_id=stage_id,
            status=StageStatus.COMPLETED,
            progress=100,
            message=f"Stage {stage_id} completed successfully",
            artifacts=self.stage_artifacts.get(stage_id, []),
        )
    
    async def _execute_dagster_stage(
        self,
        stage_id: str,
        project_id: str,
        project_dir: str,
        on_progress: Optional[Callable[[int, str], Awaitable[None]]] = None,
    ) -> StageResult:
        """
        Execute stage via Dagster GraphQL API.
        
        This is a placeholder for real Dagster integration.
        """
        # TODO: Implement real Dagster GraphQL integration
        # This would involve:
        # 1. Launching a Dagster job via GraphQL mutation
        # 2. Polling for job status via GraphQL queries
        # 3. Extracting artifacts from job outputs
        
        # For now, fall back to simulation
        return await self._simulate_stage(stage_id, project_id, on_progress)
    
    def _get_progress_message(self, stage_id: str, progress: int) -> str:
        """Generate a progress message based on stage and progress."""
        messages = {
            "diagnostic": [
                "Analyzing image quality...",
                "Checking GPS metadata...",
                "Computing overlap heatmap...",
                "Generating diagnostics report...",
            ],
            "intake": [
                "Loading images...",
                "Processing GCP markers...",
                "Validating coordinates...",
                "Preparing intake data...",
            ],
            "sfm": [
                "Detecting features...",
                "Matching features...",
                "Triangulating points...",
                "Optimizing camera positions...",
            ],
            "dense_cloud": [
                "Initializing dense matching...",
                "Computing depth maps...",
                "Filtering outliers...",
                "Building dense point cloud...",
            ],
            "dsm_dtm": [
                "Generating DSM...",
                "Filtering ground points...",
                "Creating DTM...",
                "Generating orthomosaic...",
            ],
            "segmentation": [
                "Loading SwinV2 model...",
                "Processing tiles...",
                "Running inference...",
                "Vectorizing footprints...",
            ],
            "lod_modeling": [
                "Extracting building heights...",
                "Filtering vegetation...",
                "Extruding 3D models...",
                "Generating CityJSON...",
            ],
            "validation": [
                "Loading ground truth...",
                "Computing IoU metrics...",
                "Calculating height RMSE...",
                "Generating report...",
            ],
            "analytics": [
                "Processing analytics...",
                "Computing statistics...",
                "Generating visualizations...",
            ],
            "export": [
                "Preparing exports...",
                "Packaging deliverables...",
                "Creating archive...",
            ],
        }
        
        stage_messages = messages.get(stage_id, ["Processing..."])
        message_index = min(
            int(progress / 100 * len(stage_messages)),
            len(stage_messages) - 1
        )
        return stage_messages[message_index]
    
    async def cancel_job(self, run_id: str) -> bool:
        """
        Cancel a running Dagster job.
        
        Args:
            run_id: ID of the run to cancel
        
        Returns:
            True if cancellation was successful
        """
        if self.simulation_mode:
            # In simulation mode, cancellation is handled by run_tracker
            return True
        
        # TODO: Implement Dagster job cancellation via GraphQL
        return True
    
    async def get_job_status(self, run_id: str) -> Optional[dict]:
        """
        Get the status of a Dagster job.
        
        Args:
            run_id: ID of the run to check
        
        Returns:
            Job status dictionary or None if not found
        """
        if self.simulation_mode:
            return None
        
        # TODO: Implement Dagster job status query via GraphQL
        return None


# Singleton instance
dagster_client = DagsterClient()
