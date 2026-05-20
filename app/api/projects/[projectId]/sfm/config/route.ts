import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth-db";
import { getProjectById, getSfMConfig, saveSfMConfig } from "@/lib/store";
import { getDefaultSfMConfig } from "@/lib/odm-client";

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

    const config = await getSfMConfig(projectId) || getDefaultSfMConfig();

    return NextResponse.json({ success: true, data: { config } });
  } catch (error) {
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}

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

    const config = await request.json();
    await saveSfMConfig(projectId, config);

    return NextResponse.json({ success: true, data: { config } });
  } catch (error) {
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
