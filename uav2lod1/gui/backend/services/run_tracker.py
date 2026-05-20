"""
Run tracker service for managing pipeline execution and SSE broadcasting.

Handles the background execution of pipeline stages and broadcasts
real-time progress updates via Server-Sent Events.
"""

import asyncio
from collections import defaultdict
from datetime import datetime
from typing import AsyncGenerator, Optional, Set
from dataclasses import dataclass, field

from ..schemas import SSEMessage
from .dagster_client import dagster_client, StageStatus


@dataclass
class BroadcastChannel:
    """A channel for broadcasting SSE messages to multiple subscribers."""
    subscribers: Set[asyncio.Queue] = field(default_factory=set)
    
    async def broadcast(self, message: SSEMessage) -> None:
        """Send a message to all subscribers."""
        dead_queues = set()
        
        for queue in self.subscribers:
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                dead_queues.add(queue)
        
        # Remove dead subscribers
        self.subscribers -= dead_queues
    
    async def subscribe(self) -> asyncio.Queue:
        """Subscribe to this channel."""
        queue: asyncio.Queue[SSEMessage] = asyncio.Queue(maxsize=100)
        self.subscribers.add(queue)
        return queue
    
    def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Unsubscribe from this channel."""
        self.subscribers.discard(queue)


class RunTracker:
    """
    Service for tracking pipeline runs and broadcasting progress updates.
    
    Manages a queue of pending runs and executes them using the Dagster client.
    Provides SSE subscription endpoints for real-time progress monitoring.
    """
    
    def __init__(self):
        # Channels for SSE broadcasting
        # Key: (project_id, stage_id) for stage-specific, project_id for global
        self._stage_channels: dict[tuple[str, str], BroadcastChannel] = defaultdict(BroadcastChannel)
        self._global_channels: dict[str, BroadcastChannel] = defaultdict(BroadcastChannel)
        
        # Active runs tracking
        self._active_runs: dict[str, asyncio.Task] = {}
        self._cancelled_runs: set[str] = set()
        
        # Database session factory (will be set by main app)
        self._db_session_factory = None
    
    def set_db_session_factory(self, factory):
        """Set the database session factory for background tasks."""
        self._db_session_factory = factory
    
    async def execute_run(
        self,
        run_id: str,
        project_id: str,
        stages: list[str],
    ) -> None:
        """
        Execute a pipeline run in the background.
        
        Args:
            run_id: ID of the run record
            project_id: ID of the project
            stages: List of stage IDs to execute
        """
        if self._db_session_factory is None:
            raise RuntimeError("Database session factory not configured")
        
        # Create and track the task
        task = asyncio.create_task(
            self._run_pipeline(run_id, project_id, stages)
        )
        self._active_runs[run_id] = task
        
        try:
            await task
        except asyncio.CancelledError:
            pass
        finally:
            self._active_runs.pop(run_id, None)
            self._cancelled_runs.discard(run_id)
    
    async def _run_pipeline(
        self,
        run_id: str,
        project_id: str,
        stages: list[str],
    ) -> None:
        """Execute the pipeline stages sequentially."""
        from ..models import Run, Project, Artifact, RunStatus as DBRunStatus
        from sqlalchemy import select
        
        total_stages = len(stages)
        completed_stages = 0
        
        async with self._db_session_factory() as db:
            # Update run status to RUNNING
            result = await db.execute(select(Run).where(Run.id == run_id))
            run = result.scalar_one_or_none()
            if not run:
                return
            
            run.status = DBRunStatus.RUNNING
            run.started_at = datetime.utcnow()
            await db.commit()
            
            # Get project directory
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()
            if not project:
                return
            
            project_dir = project.directory_path
        
        try:
            for stage_id in stages:
                # Check for cancellation
                if run_id in self._cancelled_runs:
                    break
                
                # Update current stage
                async with self._db_session_factory() as db:
                    result = await db.execute(select(Run).where(Run.id == run_id))
                    run = result.scalar_one_or_none()
                    if run:
                        run.current_stage = stage_id
                        await db.commit()
                
                # Broadcast stage start
                await self._broadcast_progress(
                    project_id,
                    stage_id,
                    SSEMessage(
                        type="progress",
                        stage_id=stage_id,
                        progress=0,
                        message=f"Starting {stage_id}...",
                        level="info",
                    ),
                )
                
                # Execute stage via Dagster client
                async def progress_callback(progress: int, message: str):
                    # Update database
                    async with self._db_session_factory() as db:
                        result = await db.execute(select(Run).where(Run.id == run_id))
                        run = result.scalar_one_or_none()
                        if run:
                            # Calculate overall progress
                            stage_contribution = progress / total_stages
                            overall_progress = int(
                                (completed_stages / total_stages * 100) + stage_contribution
                            )
                            run.progress = min(overall_progress, 99)
                            await db.commit()
                    
                    # Broadcast stage progress
                    await self._broadcast_progress(
                        project_id,
                        stage_id,
                        SSEMessage(
                            type="progress" if progress < 100 else "complete",
                            stage_id=stage_id,
                            progress=progress,
                            message=message,
                            level="info",
                        ),
                    )
                    
                    # Broadcast log entry
                    await self._broadcast_log(
                        project_id,
                        stage_id,
                        SSEMessage(
                            type="log",
                            stage_id=stage_id,
                            message=message,
                            level="info",
                        ),
                    )
                
                result = await dagster_client.execute_stage(
                    stage_id=stage_id,
                    project_id=project_id,
                    project_dir=project_dir,
                    on_progress=progress_callback,
                )
                
                if result.status == StageStatus.FAILED:
                    raise Exception(f"Stage {stage_id} failed: {result.message}")
                
                # Record artifacts
                async with self._db_session_factory() as db:
                    result_db = await db.execute(select(Project).where(Project.id == project_id))
                    project = result_db.scalar_one_or_none()
                    
                    if project and result.artifacts:
                        from pathlib import Path
                        for artifact_name in result.artifacts:
                            artifact = Artifact(
                                project_id=project_id,
                                name=artifact_name,
                                artifact_type=artifact_name.split(".")[-1],
                                file_path=str(Path(project.directory_path) / "outputs" / artifact_name),
                                stage_id=stage_id,
                            )
                            db.add(artifact)
                        await db.commit()
                    
                    # Update project's last completed phase
                    if project:
                        project.last_completed_phase = stage_id
                        await db.commit()
                
                completed_stages += 1
            
            # Run completed successfully
            async with self._db_session_factory() as db:
                result = await db.execute(select(Run).where(Run.id == run_id))
                run = result.scalar_one_or_none()
                if run:
                    run.status = DBRunStatus.COMPLETED
                    run.progress = 100
                    run.completed_at = datetime.utcnow()
                    await db.commit()
            
            # Broadcast completion
            await self._broadcast_global(
                project_id,
                SSEMessage(
                    type="complete",
                    progress=100,
                    message="Pipeline completed successfully",
                    level="success",
                ),
            )
        
        except asyncio.CancelledError:
            # Run was cancelled
            async with self._db_session_factory() as db:
                result = await db.execute(select(Run).where(Run.id == run_id))
                run = result.scalar_one_or_none()
                if run:
                    run.status = DBRunStatus.CANCELLED
                    run.completed_at = datetime.utcnow()
                    await db.commit()
            
            await self._broadcast_global(
                project_id,
                SSEMessage(
                    type="error",
                    message="Pipeline cancelled",
                    level="warn",
                ),
            )
            raise
        
        except Exception as e:
            # Run failed
            async with self._db_session_factory() as db:
                result = await db.execute(select(Run).where(Run.id == run_id))
                run = result.scalar_one_or_none()
                if run:
                    run.status = DBRunStatus.FAILED
                    run.error_message = str(e)
                    run.completed_at = datetime.utcnow()
                    await db.commit()
            
            await self._broadcast_global(
                project_id,
                SSEMessage(
                    type="error",
                    message=str(e),
                    level="error",
                ),
            )
    
    async def cancel_run(self, run_id: str) -> bool:
        """
        Cancel an active run.
        
        Args:
            run_id: ID of the run to cancel
        
        Returns:
            True if run was cancelled, False if not found
        """
        self._cancelled_runs.add(run_id)
        
        task = self._active_runs.get(run_id)
        if task:
            task.cancel()
            return True
        return False
    
    async def _broadcast_progress(
        self,
        project_id: str,
        stage_id: str,
        message: SSEMessage,
    ) -> None:
        """Broadcast a progress update to stage subscribers."""
        channel = self._stage_channels[(project_id, stage_id)]
        await channel.broadcast(message)
        
        # Also broadcast to global channel
        await self._broadcast_global(project_id, message)
    
    async def _broadcast_log(
        self,
        project_id: str,
        stage_id: str,
        message: SSEMessage,
    ) -> None:
        """Broadcast a log entry."""
        channel = self._stage_channels[(project_id, stage_id)]
        await channel.broadcast(message)
    
    async def _broadcast_global(
        self,
        project_id: str,
        message: SSEMessage,
    ) -> None:
        """Broadcast a message to global project subscribers."""
        channel = self._global_channels[project_id]
        await channel.broadcast(message)
    
    async def subscribe(
        self,
        project_id: str,
        stage_id: str,
    ) -> AsyncGenerator[SSEMessage, None]:
        """
        Subscribe to stage-specific progress updates.
        
        Args:
            project_id: Project ID
            stage_id: Stage ID
        
        Yields:
            SSEMessage objects as they arrive
        """
        channel = self._stage_channels[(project_id, stage_id)]
        queue = await channel.subscribe()
        
        try:
            while True:
                message = await queue.get()
                yield message
                
                # Stop if complete or error
                if message.type in ("complete", "error"):
                    break
        finally:
            channel.unsubscribe(queue)
    
    async def subscribe_global(
        self,
        project_id: str,
    ) -> AsyncGenerator[SSEMessage, None]:
        """
        Subscribe to global project progress updates.
        
        Args:
            project_id: Project ID
        
        Yields:
            SSEMessage objects as they arrive
        """
        channel = self._global_channels[project_id]
        queue = await channel.subscribe()
        
        try:
            while True:
                message = await queue.get()
                yield message
                
                # Stop if complete or error on full pipeline
                if message.type in ("complete", "error") and message.stage_id is None:
                    break
        finally:
            channel.unsubscribe(queue)


# Singleton instance
run_tracker = RunTracker()
