import { NextResponse } from "next/server";
import { getCurrentUser, createProject } from "@/lib/auth-db";
import { getProjectsByUserId } from "@/lib/store";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { validateProjectCreate } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      throw new APIError(
        ErrorCodes.UNAUTHORIZED,
        401,
        "Not authenticated"
      );
    }

    const projects = await getProjectsByUserId(user.id);

    // Remove userId from response
    const sanitizedProjects = projects.map(({ userId, ...rest }) => rest);

    return NextResponse.json({
      success: true,
      data: sanitizedProjects,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      throw new APIError(
        ErrorCodes.UNAUTHORIZED,
        401,
        "Not authenticated"
      );
    }

    const body = await request.json();
    const { valid, errors } = validateProjectCreate(body);

    if (!valid) {
      throw new APIError(
        ErrorCodes.INVALID_INPUT,
        400,
        "Invalid project data",
        { fields: errors }
      );
    }

    const { name, directoryPath, crs } = body;

    // createProject writes to both in-memory DB and store.json (via saveProject)
    const project = await createProject(user.id, { name, directoryPath, crs });

    // Remove userId from response
    const { userId, ...sanitizedProject } = project;

    return NextResponse.json(
      {
        success: true,
        data: sanitizedProject,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
