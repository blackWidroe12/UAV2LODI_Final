"""
Routers package for UAV2LoD1-ZW Backend.
"""

from .auth import router as auth_router
from .projects import router as projects_router
from .runs import router as runs_router
from .artifacts import router as artifacts_router

__all__ = [
    "auth_router",
    "projects_router",
    "runs_router",
    "artifacts_router",
]
