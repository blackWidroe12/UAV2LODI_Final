import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-db";
import { getProjectById, saveProject, deleteProject } from "@/lib/store";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { validateProjectUpdate } from "@/lib/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      throw new APIError(
        ErrorCodes.UNAUTHORIZED,
        401,
        "Not authenticated"
      );
    }

    const { projectId } = await params;
    const project = await getProjectById(projectId);

    if (!project) {
      throw new APIError(
        ErrorCodes.PROJECT_NOT_FOUND,
        404,
        "Project not found"
      );
    }

    if (project.userId !== user.id) {
      throw new APIError(
        ErrorCodes.FORBIDDEN,
        403,
        "Access denied"
      );
    }

    const { userId, ...sanitizedProject } = project;
    return NextResponse.json({
      success: true,
      data: sanitizedProject,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      throw new APIError(
        ErrorCodes.UNAUTHORIZED,
        401,
        "Not authenticated"
      );
    }

    const { projectId } = await params;
    const project = await getProjectById(projectId);

    if (!project) {
      throw new APIError(
        ErrorCodes.PROJECT_NOT_FOUND,
        404,
        "Project not found"
      );
    }

    if (project.userId !== user.id) {
      throw new APIError(
        ErrorCodes.FORBIDDEN,
        403,
        "Access denied"
      );
    }

    const body = await request.json();
    const { valid, errors } = validateProjectUpdate(body);

    if (!valid) {
      throw new APIError(
        ErrorCodes.INVALID_INPUT,
        400,
        "Invalid project data",
        { fields: errors }
      );
    }

    const updated = {
      ...project,
      ...body,
      id: project.id, // never overwrite id
      userId: project.userId, // never overwrite userId
      lastModified: new Date().toISOString(),
    };

    await saveProject(updated);

    const { userId, ...sanitizedProject } = updated;
    return NextResponse.json({
      success: true,
      data: sanitizedProject,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      throw new APIError(
        ErrorCodes.UNAUTHORIZED,
        401,
        "Not authenticated"
      );
    }

    const { projectId } = await params;
    const project = await getProjectById(projectId);

    if (!project) {
      throw new APIError(
        ErrorCodes.PROJECT_NOT_FOUND,
        404,
        "Project not found"
      );
    }

    if (project.userId !== user.id) {
      throw new APIError(
        ErrorCodes.FORBIDDEN,
        403,
        "Access denied"
      );
    }

    await deleteProject(projectId);

    return NextResponse.json({
      success: true,
      data: null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
