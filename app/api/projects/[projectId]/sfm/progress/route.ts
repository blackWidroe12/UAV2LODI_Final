import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth-db";
import { getProjectById, getStageResult, getSfMProgress } from "@/lib/store";

export async function GET(
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

    let parsedError: any = null;
    if (result?.status === 'error' && result.error) {
      try {
        parsedError = JSON.parse(result.error);
      } catch {
        parsedError = {
          type: 'UNKNOWN',
          summary: result.error,
          causes: [],
          fixes: [],
        };
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        status: result?.status || 'pending',
        progress: getSfMProgress(projectId, 'sfm') || { percentage: 0, message: "Waiting..." },
        outputs: result?.outputs || null,
        error: parsedError,
        startedAt: result?.startedAt || null,
        completedAt: result?.completedAt || null
      } 
    });
  } catch (error) {
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
