"""
File service for handling thumbnails, path validation, and file operations.
"""

import hashlib
import mimetypes
from pathlib import Path
from typing import Optional

import aiofiles

from ..config import settings


class FileService:
    """Service for file operations, thumbnails, and path validation."""
    
    def __init__(self):
        self.thumbnail_cache_dir = settings.DATA_ROOT / ".thumbnails"
        self.thumbnail_cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize mimetypes
        mimetypes.init()
        
        # Add custom MIME types for GIS files
        mimetypes.add_type("application/geo+json", ".geojson")
        mimetypes.add_type("application/geopackage+sqlite3", ".gpkg")
        mimetypes.add_type("application/vnd.cityjson", ".city.json")
        mimetypes.add_type("application/vnd.cityjson", ".cityjson")
        mimetypes.add_type("application/vnd.las", ".las")
        mimetypes.add_type("application/vnd.laz", ".laz")
        mimetypes.add_type("image/tiff", ".tif")
        mimetypes.add_type("image/tiff", ".tiff")
    
    def get_mime_type(self, file_path: Path) -> str:
        """Get MIME type for a file."""
        mime_type, _ = mimetypes.guess_type(str(file_path))
        return mime_type or "application/octet-stream"
    
    def _get_thumbnail_path(self, original_path: Path) -> Path:
        """Generate thumbnail cache path based on file hash."""
        # Create hash of file path and modification time
        stat = original_path.stat()
        cache_key = f"{original_path}:{stat.st_mtime}:{stat.st_size}"
        hash_name = hashlib.md5(cache_key.encode()).hexdigest()
        return self.thumbnail_cache_dir / f"{hash_name}.jpg"
    
    async def get_or_create_thumbnail(
        self,
        original_path: Path,
        size: tuple[int, int] | None = None,
    ) -> Optional[Path]:
        """
        Get or create a thumbnail for an image file.
        Returns the thumbnail path or None if generation fails.
        """
        if size is None:
            size = settings.THUMBNAIL_SIZE
        
        thumbnail_path = self._get_thumbnail_path(original_path)
        
        # Return cached thumbnail if exists
        if thumbnail_path.exists():
            return thumbnail_path
        
        # Check if source is an image
        mime_type = self.get_mime_type(original_path)
        if not mime_type.startswith("image/"):
            return None
        
        try:
            from PIL import Image
            
            # Open and create thumbnail
            with Image.open(original_path) as img:
                # Convert to RGB if necessary (handles RGBA, etc.)
                if img.mode in ("RGBA", "P", "LA"):
                    # Create white background
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode == "P":
                        img = img.convert("RGBA")
                    background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                    img = background
                elif img.mode != "RGB":
                    img = img.convert("RGB")
                
                # Create thumbnail maintaining aspect ratio
                img.thumbnail(size, Image.Resampling.LANCZOS)
                
                # Save thumbnail
                img.save(
                    thumbnail_path,
                    "JPEG",
                    quality=settings.THUMBNAIL_QUALITY,
                    optimize=True,
                )
            
            return thumbnail_path
            
        except ImportError:
            # Pillow not installed
            return None
        except Exception as e:
            # Log error but don't crash
            print(f"Thumbnail generation failed for {original_path}: {e}")
            return None
    
    def validate_path(self, path_str: str, allowed_roots: list[Path] | None = None) -> Path:
        """
        Validate and sanitize a path to prevent directory traversal.
        
        Args:
            path_str: The path string to validate
            allowed_roots: List of allowed root directories
        
        Returns:
            Resolved absolute path
        
        Raises:
            ValueError: If path is invalid or outside allowed roots
        """
        if allowed_roots is None:
            allowed_roots = [settings.DATA_ROOT, Path("/data"), Path("/home")]
        
        path = Path(path_str).resolve()
        
        # Check if path is within allowed roots
        for root in allowed_roots:
            try:
                path.relative_to(root.resolve())
                return path
            except ValueError:
                continue
        
        raise ValueError(f"Path {path} is not within allowed directories")
    
    async def read_file_async(self, file_path: Path) -> bytes:
        """Read file contents asynchronously."""
        async with aiofiles.open(file_path, "rb") as f:
            return await f.read()
    
    async def write_file_async(self, file_path: Path, content: bytes) -> None:
        """Write file contents asynchronously."""
        file_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)
    
    async def delete_file_async(self, file_path: Path) -> bool:
        """Delete a file asynchronously."""
        try:
            if file_path.exists():
                file_path.unlink()
                return True
            return False
        except OSError:
            return False
    
    def get_file_size(self, file_path: Path) -> int:
        """Get file size in bytes."""
        try:
            return file_path.stat().st_size
        except OSError:
            return 0
    
    def list_directory(
        self,
        directory: Path,
        extensions: set[str] | None = None,
    ) -> list[dict]:
        """
        List files in a directory with optional extension filtering.
        
        Returns:
            List of file info dictionaries
        """
        if not directory.exists():
            return []
        
        files = []
        for f in sorted(directory.iterdir()):
            if f.is_file():
                if extensions and f.suffix.lower() not in extensions:
                    continue
                
                stat = f.stat()
                files.append({
                    "name": f.name,
                    "path": str(f),
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                    "mime_type": self.get_mime_type(f),
                })
        
        return files
    
    def clean_thumbnails(self, max_age_days: int = 7) -> int:
        """
        Clean old thumbnails from cache.
        
        Args:
            max_age_days: Maximum age in days for thumbnails
        
        Returns:
            Number of thumbnails deleted
        """
        import time
        
        deleted = 0
        max_age_seconds = max_age_days * 24 * 60 * 60
        current_time = time.time()
        
        for thumbnail in self.thumbnail_cache_dir.glob("*.jpg"):
            try:
                age = current_time - thumbnail.stat().st_mtime
                if age > max_age_seconds:
                    thumbnail.unlink()
                    deleted += 1
            except OSError:
                continue
        
        return deleted


# Singleton instance
file_service = FileService()
