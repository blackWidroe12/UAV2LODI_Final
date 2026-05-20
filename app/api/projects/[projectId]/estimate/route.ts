import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser, getProjectById } from "@/lib/auth-db";

const STAGE_IDS = [
  "diagnostic",
  "intake",
  "sfm",
  "dense_cloud",
  "dsm_dtm",
  "segmentation",
  "lod_modeling",
  "validation",
  "analytics",
  "export",
] as const;

// Base processing times in minutes per 100 images
const BASE_TIMES: Record<string, number> = {
  diagnostic: 2,
  intake: 1,
  sfm: 15,
  dense_cloud: 30,
  dsm_dtm: 10,
  segmentation: 8,
  lod_modeling: 12,
  validation: 3,
  analytics: 2,
  export: 5,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    
    if (!user) {
      return errorResponse(new APIError(ErrorCodes.UNAUTHORIZED, 401, "Not authenticated"));
    }

    const { projectId } = await params;
    const project = await getProjectById(projectId);
    
    if (!project) {
      return errorResponse(new APIError(ErrorCodes.PROJECT_NOT_FOUND, 404, "Project not found"));
    }

    if (project.userId !== user.id) {
      return errorResponse(new APIError(ErrorCodes.FORBIDDEN, 403, "Access denied"));
    }

    const body = await request.json();
    const { imageCount = 100 } = body;
    const scaleFactor = imageCount / 100;

    const estimates = STAGE_IDS.map((stageId) => ({
      stageId,
      estimatedDurationMinutes: Math.ceil(BASE_TIMES[stageId] * scaleFactor),
    }));

    const totalMinutes = estimates.reduce(
      (sum, e) => sum + e.estimatedDurationMinutes,
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        estimates,
        totalMinutes,
      },
    });
  } catch (error) {
    console.error("Estimate error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
