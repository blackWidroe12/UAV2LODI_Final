"""
Authentication router for user registration, login, and profile management.
"""

import uuid
import aiofiles
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException, status, UploadFile, File
from sqlalchemy import select

from ..config import settings
from ..dependencies import (
    DbSession,
    CurrentUser,
    hash_password,
    verify_password,
    create_access_token,
)
from ..models import User
from ..schemas import (
    UserCreate,
    UserLogin,
    UserResponse,
    AuthResponse,
    AvatarUploadResponse,
)


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: DbSession):
    """
    Register a new user account.
    """
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    # Check if username already exists
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken",
        )
    
    # Create new user
    user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hash_password(user_data.password),
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        department=user_data.department,
    )
    
    db.add(user)
    await db.flush()  # Ensure ID is generated
    
    # Generate access token
    access_token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    
    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=access_token,
    )


@router.post("/login", response_model=AuthResponse)
async def login(credentials: UserLogin, db: DbSession):
    """
    Authenticate user and return access token.
    """
    # Find user by email
    result = await db.execute(
        select(User).where(User.email == credentials.email, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Generate access token
    access_token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    
    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=access_token,
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: CurrentUser):
    """
    Get the current authenticated user's profile.
    """
    return UserResponse.model_validate(current_user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: CurrentUser):
    """
    Logout the current user.
    Note: Since we use stateless JWT, this is a no-op on the server side.
    The client should discard the token.
    """
    return None


@router.post("/avatar", response_model=AvatarUploadResponse)
async def upload_avatar(
    current_user: CurrentUser,
    db: DbSession,
    avatar: UploadFile = File(...),
):
    """
    Upload a new avatar image for the current user.
    """
    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    if avatar.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}",
        )
    
    # Validate file size (max 5MB)
    max_size = 5 * 1024 * 1024  # 5MB
    content = await avatar.read()
    if len(content) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 5MB.",
        )
    
    # Generate unique filename
    extension = Path(avatar.filename or "avatar.jpg").suffix or ".jpg"
    filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}{extension}"
    
    # Save file
    avatar_path = settings.avatars_path / filename
    async with aiofiles.open(avatar_path, "wb") as f:
        await f.write(content)
    
    # Update user's avatar URL
    avatar_url = f"/uploads/avatars/{filename}"
    current_user.avatar_url = avatar_url
    await db.flush()
    
    return AvatarUploadResponse(avatar_url=avatar_url)


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    current_user: CurrentUser,
    db: DbSession,
    first_name: str | None = None,
    last_name: str | None = None,
    department: str | None = None,
):
    """
    Update the current user's profile.
    """
    if first_name is not None:
        current_user.first_name = first_name
    if last_name is not None:
        current_user.last_name = last_name
    if department is not None:
        current_user.department = department
    
    await db.flush()
    
    return UserResponse.model_validate(current_user)
