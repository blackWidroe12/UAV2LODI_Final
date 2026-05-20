import { NextResponse } from 'next/server';
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from '@/lib/auth-db';
import { getProjectById, getStageResult } from '@/lib/store';
import fs from 'fs';
import path from 'path';

// GET /api/projects/:projectId/sfm/assets
// Returns metadata and URLs for all downloaded SfM outputs
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return errorResponse(new APIError(ErrorCodes.UNAUTHORIZED, 401, 'Not authenticated.'));

    const { projectId } = await params;
    const project = await getProjectById(projectId);
    if (!project) return errorResponse(new APIError(ErrorCodes.PROJECT_NOT_FOUND, 404, 'Project not found.'));
    if (project.userId !== user.id) return errorResponse(new APIError(ErrorCodes.FORBIDDEN, 403, 'Forbidden.'));

    const result = await getStageResult(projectId, 'sfm');
    if (!result?.outputs) {
      return errorResponse(new APIError(ErrorCodes.PROJECT_NOT_FOUND, 404, 'No SfM outputs available.'));
    }

    const outputDir = path.join(process.cwd(), 'data', 'outputs', projectId, 'sfm');

    const assetMap: Record<string, any> = {};
    const assetFiles = [
      { key: 'orthoPath',      filename: 'orthophoto.tif',  label: 'Orthophoto',   type: 'geotiff' },
      { key: 'dsmPath',        filename: 'dsm.tif',         label: 'DSM',          type: 'geotiff' },
      { key: 'dtmPath',        filename: 'dtm.tif',         label: 'DTM',          type: 'geotiff' },
      { key: 'pointCloudPath', filename: 'point_cloud.laz', label: 'Point Cloud',  type: 'laz' },
      { key: 'gcpReportPath',  filename: 'report.pdf',      label: 'GCP Report',   type: 'pdf' },
    ];

    for (const asset of assetFiles) {
      const filePath = path.join(outputDir, asset.filename);
      const exists = fs.existsSync(filePath);

      assetMap[asset.key] = {
        label: asset.label,
        type: asset.type,
        available: exists,
        localPath: exists ? filePath : null,
        downloadUrl: exists
          ? `/api/projects/${projectId}/sfm/assets/${asset.filename}`
          : null,
        previewUrl: exists
          ? `/api/projects/${projectId}/sfm/assets/${asset.filename}`
          : null,
        sizeBytes: exists ? fs.statSync(filePath).size : null,
        sizeFormatted: exists
          ? formatBytes(fs.statSync(filePath).size)
          : null,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        assets: assetMap,
        outputDir,
        completedAt: result.completedAt,
        metrics: {
          gsdAchieved: result.outputs.gsdAchieved,
          gcpRmsError: result.outputs.gcpRmsError,
          processingTimeSeconds: result.outputs.processingTimeSeconds,
        }
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
