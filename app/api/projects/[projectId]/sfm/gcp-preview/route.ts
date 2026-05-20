import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth-db";
import { getProjectById, getGCPs, getGCPCrs } from '@/lib/store';
import { generateGCPFile } from '@/lib/odm-client';
import fs from 'fs';
import path from 'path';

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

    const gcps = await getGCPs(projectId);
    if (gcps.length === 0) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, 'No GCPs loaded for this project.'));
    }

    // Read actual image filenames from disk
    const supportedExts = ['.jpg', '.jpeg', '.tif', '.tiff', '.png'];
    let imageFiles: string[] = [];

    if (project.directoryPath && fs.existsSync(project.directoryPath)) {
      imageFiles = fs.readdirSync(project.directoryPath)
        .filter(f => supportedExts.includes(path.extname(f).toLowerCase()));
    }

    const gcpCrs = await getGCPCrs(projectId);
    const gcpFileContent = generateGCPFile(gcps, imageFiles, gcpCrs);
    const lines = gcpFileContent.split('\n');

    // Validation checks
    const warnings: string[] = [];
    const errors: string[] = [];

    if (imageFiles.length === 0) {
      errors.push(`Image directory "${project.directoryPath}" is empty or not found — cannot match GCPs to images`);
    }

    for (const gcp of gcps) {
      if (gcp.longitude < -180 || gcp.longitude > 180 || gcp.latitude < -90 || gcp.latitude > 90) {
        errors.push(`GCP "${gcp.name}" has out-of-range coordinates (lng: ${gcp.longitude}, lat: ${gcp.latitude}) — must be WGS84 decimal degrees`);
      }
    }

    if (gcpCrs !== 'EPSG:4326') {
      warnings.push(`GCPs were imported with CRS ${gcpCrs}. Verify coordinates are in decimal degrees before running SfM.`);
    }

    return NextResponse.json({
      success: true,
      data: {
        gcpFileContent,
        totalLines: lines.length,
        gcpCount: gcps.length,
        imageCount: imageFiles.length,
        crs: gcpCrs,
        warnings,
        errors,
        preview: lines.slice(0, 10), // first 10 lines for display
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}
