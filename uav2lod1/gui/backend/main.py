"""
UAV2LoD1-ZW Backend - Main FastAPI Application

This is the entry point for the FastAPI backend that serves the UAV2LoD1-ZW
photogrammetry pipeline GUI. It provides REST APIs for authentication,
project management, pipeline execution, and artifact serving.
"""

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import init_db, async_session_maker
from .routers import auth_router, projects_router, runs_router, artifacts_router
from .services.run_tracker import run_tracker
from .schemas import ApiResponse, ErrorDetail, HealthCheck


# ============================================================================
# Application Lifecycle
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Startup
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    
    # Initialize database
    await init_db()
    print("Database initialized")
    
    # Configure run tracker with database session factory
    run_tracker.set_db_session_factory(async_session_maker)
    print("Run tracker configured")
    
    # Ensure data directories exist
    settings.projects_path
    settings.uploads_path
    settings.avatars_path
    print(f"Data root: {settings.DATA_ROOT}")
    
    yield
    
    # Shutdown
    print("Shutting down...")


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Backend API for UAV2LoD1-ZW Photogrammetry Pipeline",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)


# ============================================================================
# CORS Configuration
# ============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Range", "Accept-Ranges"],
)


# ============================================================================
# Exception Handlers (JSON Envelope)
# ============================================================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """
    Handle HTTP exceptions with the standard API response envelope.
    """
    # Map HTTP status codes to error codes
    error_codes = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        422: "VALIDATION_ERROR",
        500: "INTERNAL_ERROR",
    }
    
    error_code = error_codes.get(exc.status_code, "ERROR")
    
    return JSONResponse(
        status_code=exc.status_code,
        content=ApiResponse(
            success=False,
            data=None,
            error=ErrorDetail(
                code=error_code,
                message=str(exc.detail),
            ),
        ).model_dump(),
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handle unexpected exceptions with the standard API response envelope.
    """
    # Log the error in debug mode
    if settings.DEBUG:
        import traceback
        traceback.print_exc()
    
    return JSONResponse(
        status_code=500,
        content=ApiResponse(
            success=False,
            data=None,
            error=ErrorDetail(
                code="INTERNAL_ERROR",
                message="An unexpected error occurred" if not settings.DEBUG else str(exc),
            ),
        ).model_dump(),
    )


# ============================================================================
# Response Wrapper Middleware
# ============================================================================

@app.middleware("http")
async def wrap_response_envelope(request: Request, call_next):
    """
    Middleware to wrap successful responses in the API envelope.
    
    Note: This is applied only to API routes, not static files or SSE streams.
    """
    response = await call_next(request)
    
    # Skip envelope wrapping for:
    # - Non-API routes
    # - SSE streams
    # - File downloads
    # - Already-wrapped responses (error handlers)
    if (
        not request.url.path.startswith(("/auth", "/projects", "/uploads", "/api"))
        or response.media_type == "text/event-stream"
        or response.media_type in ("application/octet-stream", "image/jpeg", "image/png")
        or "Content-Disposition" in response.headers
        or response.status_code >= 400
    ):
        return response
    
    return response


# ============================================================================
# Health Check Endpoint
# ============================================================================

@app.get("/api/health", response_model=HealthCheck, tags=["System"])
async def health_check():
    """
    Health check endpoint for monitoring and load balancers.
    """
    return HealthCheck(
        status="healthy",
        version=settings.APP_VERSION,
        database="connected",
    )


@app.get("/", tags=["System"])
async def root():
    """
    Root endpoint - API information.
    """
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs" if settings.DEBUG else None,
    }


# ============================================================================
# Register Routers
# ============================================================================

# Authentication routes
app.include_router(auth_router)

# Project management routes
app.include_router(projects_router)

# Pipeline execution routes (nested under projects)
app.include_router(runs_router)

# Artifact serving routes
app.include_router(artifacts_router)


# ============================================================================
# CLI Entry Point
# ============================================================================

def main():
    """CLI entry point for running the server."""
    import uvicorn
    
    uvicorn.run(
        "uav2lod1.gui.backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )


if __name__ == "__main__":
    main()
