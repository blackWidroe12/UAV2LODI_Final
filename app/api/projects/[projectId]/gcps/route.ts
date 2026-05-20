import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth-db";
import { getProjectById, getGCPs, getGCPMeta, saveGCPs } from "@/lib/store";

export async function GET(
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

    const gcps = await getGCPs(projectId);
    const meta = await getGCPMeta(projectId);

    return NextResponse.json({
      success: true,
      data: { gcps, meta },
    });
  } catch (error) {
    console.error("Get GCPs error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}

export async function PUT(
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

    const gcps = await request.json();
    await saveGCPs(projectId, gcps);

    return NextResponse.json({
      success: true,
      data: null,
    });
  } catch (error) {
    console.error("Save GCPs error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
