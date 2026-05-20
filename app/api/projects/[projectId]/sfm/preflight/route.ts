import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from '@/lib/auth-db';
import { getProjectById, getGCPs } from '@/lib/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return errorResponse(new APIError(ErrorCodes.UNAUTHORIZED, 401, 'Not authenticated.'));
    }

    const { projectId } = await params;
    const project = await getProjectById(projectId);
    if (!project) {
      return errorResponse(new APIError(ErrorCodes.PROJECT_NOT_FOUND, 404, 'Project not found.'));
    }
    if (project.userId !== user.id) {
      return errorResponse(new APIError(ErrorCodes.FORBIDDEN, 403, 'Forbidden.'));
    }

    const warnings: string[] = [];
    const errors: string[] = [];
    const info: string[] = [];

    const supportedExts = ['.jpg', '.jpeg', '.tif', '.tiff', '.png'];
    const imageDir = project.directoryPath;

    if (!imageDir || !fs.existsSync(imageDir)) {
      errors.push('Image directory not found or not set');
      return NextResponse.json({
        success: true,
        data: { errors, warnings, info, canRun: false, recommendations: [] }
      });
    }

    const allFiles = fs.readdirSync(imageDir);
    const imageFiles = allFiles.filter(f => supportedExts.includes(path.extname(f).toLowerCase()));

    info.push(`${imageFiles.length} image files found in directory`);

    if (imageFiles.length < 3) {
      errors.push(`Minimum 3 images required — found ${imageFiles.length}`);
    } else if (imageFiles.length < 15) {
      warnings.push(`Only ${imageFiles.length} images found — 15 or more recommended for stable reconstruction`);
    } else if (imageFiles.length > 500) {
      warnings.push(`Large dataset (${imageFiles.length} images) — processing will take a long time. Consider splitting into smaller areas.`);
    } else {
      info.push(`Image count is good (${imageFiles.length} images)`);
    }

    // Check for mixed extensions (potential case issues)
    const extensions = [...new Set(imageFiles.map(f => path.extname(f)))];
    if (extensions.length > 1) {
      warnings.push(`Mixed file extensions found: ${extensions.join(', ')} — ensure all images are the same format`);
    }

    // Check for uppercase extensions (common cause of ODM errors on Linux)
    const upperCaseFiles = imageFiles.filter(f => {
      const ext = path.extname(f);
      return ext !== ext.toLowerCase();
    });
    if (upperCaseFiles.length > 0) {
      warnings.push(
        `${upperCaseFiles.length} images have uppercase extensions (e.g. .JPG instead of .jpg). ` +
        `This can cause GCP matching failures on Linux-based ODM. ` +
        `Examples: ${upperCaseFiles.slice(0, 3).join(', ')}`
      );
    }

    // Check for very small files (likely corrupted or empty)
    const smallFiles = imageFiles.filter(f => {
      const stat = fs.statSync(path.join(imageDir, f));
      return stat.size < 50000; // less than 50KB is suspicious for a drone image
    });
    if (smallFiles.length > 0) {
      warnings.push(`${smallFiles.length} images are smaller than 50KB and may be corrupted: ${smallFiles.slice(0, 3).join(', ')}`);
    }

    // Check file sizes for consistency (very mixed sizes suggest different resolutions)
    if (imageFiles.length > 0) {
      const sizes = imageFiles.map(f => fs.statSync(path.join(imageDir, f)).size);
      const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
      const maxSize = Math.max(...sizes);
      if (maxSize > avgSize * 3) {
        warnings.push('Image file sizes vary significantly — dataset may contain mixed resolutions which can cause reconstruction issues');
      }
    }

    // GCP checks
    const gcps = await getGCPs(projectId);
    if (gcps && gcps.length > 0) {
      info.push(`${gcps.length} GCPs loaded`);
      if (gcps.length < 3) {
        errors.push('Minimum 3 GCPs required for georeferenced processing — disable GCPs or add more');
      }
      const invalidGCPs = gcps.filter(g => g.longitude < -180 || g.longitude > 180 || g.latitude < -90 || g.latitude > 90);
      if (invalidGCPs.length > 0) {
        errors.push(`${invalidGCPs.length} GCPs have coordinates outside WGS84 range — they may be in projected coordinates`);
      }
    } else {
      warnings.push('No GCPs loaded — reconstruction will use image GPS tags only');
    }

    const canRun = errors.length === 0;

    return NextResponse.json({
      success: true,
      data: {
        canRun,
        imageCount: imageFiles.length,
        errors,
        warnings,
        info,
        recommendations: canRun && warnings.length > 0
          ? ['Review warnings before running — they may indicate potential failures']
          : [],
      }
    });
  } catch (error) {
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, 'Internal server error'));
  }
}
