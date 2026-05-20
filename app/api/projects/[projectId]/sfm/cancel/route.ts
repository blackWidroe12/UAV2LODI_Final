import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth-db";
import { getProjectById, getStageResult, saveStageResult, getSfMConfig } from "@/lib/store";
import { getDefaultSfMConfig, buildODMNodeUrl } from "@/lib/odm-client";

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

    const result = await getStageResult(projectId, 'sfm');
    const taskUuid = result?.outputs?.taskId ?? null;

    if (!taskUuid) {
      if (result?.status === 'processing') {
        await saveStageResult(projectId, 'sfm', {
          stageId: 'sfm',
          status: 'error',
          startedAt: result?.startedAt || null,
          completedAt: Date.now(),
          error: 'Cancelled by user',
          outputs: null,
        });
        return NextResponse.json({ success: true, message: 'Local processing cancelled.' });
      }
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, 'No active task to cancel.'));
    }

    const config = await getSfMConfig(projectId) ?? getDefaultSfMConfig();
    const nodeUrl = buildODMNodeUrl(config.odmNodeUrl, config.odmNodePort);

    try {
      await fetch(`${nodeUrl}/task/${taskUuid}/cancel`, { method: 'POST' });
    } catch (err: any) {
      console.warn('[sfm/cancel] Could not reach ODM to cancel:', err.message);
    }

    await saveStageResult(projectId, 'sfm', {
      stageId: 'sfm',
      status: 'error',
      startedAt: result?.startedAt || null,
      completedAt: Date.now(),
      error: 'Cancelled by user',
      outputs: null,
    });

    return NextResponse.json({ success: true, message: 'Task cancellation requested.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}
