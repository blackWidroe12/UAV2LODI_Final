"""
UAV2LoD1-ZW Backend Package

This package provides the FastAPI backend for the UAV2LoD1-ZW
photogrammetry pipeline GUI. It handles authentication, project
management, pipeline execution, and artifact serving.

Usage:
    uvicorn uav2lod1.gui.backend.main:app --reload

Or using the CLI:
    python -m uav2lod1.gui.backend.main
"""

from .main import app

__version__ = "1.0.0"
__all__ = ["app"]
