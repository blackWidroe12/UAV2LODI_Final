import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth-db";
import { getProjectById } from "@/lib/store";
import fs from "fs";
import path from "path";

const ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
  ".tif",
  ".dng",
  ".raw",
  ".arw",
  ".cr2",
  ".nef",
];

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

    const directoryPath = project.directoryPath;

    if (!directoryPath) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Project directory path not set"));
    }

    // Security check: Prevent path traversal
    const normalizedPath = path.normalize(directoryPath);
    if (normalizedPath.includes("..")) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Invalid directory path"));
    }

    // Verify directory exists
    if (!fs.existsSync(normalizedPath)) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Directory does not exist", { path: directoryPath }));
    }

    // Read directory
    const files = fs.readdirSync(normalizedPath);

    // Filter images
    const images = files
      .filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return ALLOWED_EXTENSIONS.includes(ext);
      })
      .sort();

    return NextResponse.json({
      success: true,
      data: {
        images,
        count: images.length,
        directory: normalizedPath,
      },
    });
  } catch (error) {
    console.error("List images error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
