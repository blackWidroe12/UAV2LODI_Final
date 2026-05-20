import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth-db";
import { getProjectById, getStageResult, getAllStageResults } from "@/lib/store";

/**
 * POST /api/projects/:id/stages/:stageId
 *
 * Triggers execution of a pipeline stage.
 * Currently returns simulated results for intake; other stages return 501.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; stageId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return errorResponse(new APIError(ErrorCodes.UNAUTHORIZED, 401, "Not authenticated"));
    }

    const { projectId, stageId } = await params;
    const project = await getProjectById(projectId);

    if (!project) {
      return errorResponse(new APIError(ErrorCodes.PROJECT_NOT_FOUND, 404, "Project not found"));
    }

    if (project.userId !== user.id) {
      return errorResponse(new APIError(ErrorCodes.FORBIDDEN, 403, "Access denied"));
    }

    const sfmResult = await getStageResult(projectId, 'sfm');
    const sfmOutputs = sfmResult?.outputs ?? null;

    // Pass to stage handler
    const stageContext = {
      projectId,
      project,
      sfmOutputs,
      previousStageResults: await getAllStageResults(projectId),
    };

    // Stage-specific handlers
    const stageHandlers: Record<string, (context: typeof stageContext) => object> = {
      diagnostic: () => ({
        status: "completed",
        results: {
          systemChecks: { cpu: "ok", ram: "ok", disk: "ok", gpu: "ok" },
          odmConnectivity: "ok",
          crsValidation: "ok",
        },
      }),
      intake: () => ({
        status: "completed",
        results: {
          imagesValidated: true,
          gcpsLoaded: true,
        },
      }),
      dense_cloud: () => ({ status: "processing", message: "Dense cloud job submitted." }),
      dsm_dtm: () => ({ status: "processing", message: "DSM/DTM job submitted." }),
      segmentation: () => ({ status: "processing", message: "Segmentation job submitted." }),
      lod_modeling: () => ({ status: "processing", message: "LoD modeling job submitted." }),
      validation: () => ({ status: "processing", message: "Validation job submitted." }),
      analytics: () => ({ status: "completed", results: {} }),
      export: () => ({ status: "processing", message: "Export job submitted." }),
    };

    const handler = stageHandlers[stageId];
    if (!handler) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, `Unknown stage: ${stageId}`));
    }

    return NextResponse.json({ success: true, data: handler(stageContext) });
  } catch (error) {
    console.error("Stage execution error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
