import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth-db";
import { 
  getProjectById, 
  getSfMConfig, 
  saveStageResult, 
  getGCPs 
} from "@/lib/store";
import { runODMJob, getDefaultSfMConfig } from "@/lib/odm-client";
import { registerJob } from '@/lib/job-registry';
import fs from 'fs';
import path from 'path';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return errorResponse(new APIError(ErrorCodes.UNAUTHORIZED, 401, "Not authenticated"));

    const { projectId } = await params;
    const project = await getProjectById(projectId);
    if (!project) return errorResponse(new APIError(ErrorCodes.PROJECT_NOT_FOUND, 404, "Project not found"));
    if (project.userId !== user.id) return errorResponse(new APIError(ErrorCodes.FORBIDDEN, 403, "Access denied"));

    // Validate the image directory from the project record
    if (!project.directoryPath || project.directoryPath.trim() === '') {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, 'This project has no image directory configured. Go to the Intake stage and select your image folder first.'));
    }

    if (!fs.existsSync(project.directoryPath)) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, `Image directory not found: "${project.directoryPath}". Ensure the folder exists on this machine and the path is correct.`));
    }

    const supportedExtensions = ['.jpg', '.jpeg', '.tif', '.tiff', '.png'];
    const imageCount = fs.readdirSync(project.directoryPath)
      .filter((f: string) => supportedExtensions.includes(path.extname(f).toLowerCase()))
      .length;

    if (imageCount < 3) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, `Not enough images in "${project.directoryPath}". Found ${imageCount}, minimum required is 3.`));
    }

    const config = await getSfMConfig(projectId) || getDefaultSfMConfig();
    const gcps = await getGCPs(projectId);

    // Update state to processing
    await saveStageResult(projectId, 'sfm', {
      stageId: 'sfm',
      status: 'processing',
      startedAt: Date.now(),
      completedAt: null,
      error: null,
      outputs: null
    });

    console.log('[sfm/run] Route hit — projectId:', projectId);
    console.log('[sfm/run] Image directory:', project.directoryPath);
    console.log('[sfm/run] Image count validated — submitting ODM job');

    const taskId = `task_${Date.now()}`;
    const job = runODMJob(projectId, project, config, gcps, taskId)
      .catch(async err => {
        console.error('[sfm/run] ODM job failed:', err.message);
        await saveStageResult(projectId, 'sfm', {
          stageId: 'sfm',
          status: 'error',
          startedAt: Date.now(),
          completedAt: Date.now(),
          error: err.message,
          outputs: null,
        });
      });

    registerJob(`sfm-${projectId}`, job);
    console.log('[sfm/run] Background job started — returning 200 immediately');

    return NextResponse.json({ 
      success: true, 
      data: { 
        status: 'processing', 
        message: 'SfM job submitted to ODM.' 
      } 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}
