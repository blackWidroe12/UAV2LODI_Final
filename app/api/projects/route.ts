import { NextResponse } from "next/server";
import { getCurrentUser, createProject } from "@/lib/auth-db";
import { getProjectsByUserId, getProjectById } from "@/lib/store";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { validateProjectCreate } from "@/lib/validation";
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

    // ===== HANDLE LIST IMAGES REQUEST =====
    if (body.action === "list-images" && body.projectId) {
      console.log("[projects-api] POST /projects - action: list-images");

      const project = await getProjectById(body.projectId);
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

      const directoryPath = project.directoryPath;

      if (!directoryPath) {
        throw new APIError(
          ErrorCodes.INVALID_INPUT,
          400,
          "Project directory path not set"
        );
      }

      console.log("[projects-api] Directory:", directoryPath);

      // Security check: Prevent path traversal
      const normalizedPath = path.normalize(directoryPath);
      if (normalizedPath.includes("..")) {
        throw new APIError(
          ErrorCodes.INVALID_INPUT,
          400,
          "Invalid directory path"
        );
      }

      // Verify directory exists
      if (!fs.existsSync(normalizedPath)) {
        throw new APIError(
          ErrorCodes.INVALID_INPUT,
          400,
          "Directory does not exist",
          { path: directoryPath }
        );
      }

      // Read directory
      const files = fs.readdirSync(normalizedPath);
      console.log("[projects-api] Files in directory:", files.length);

      // Filter images
      const images = files
        .filter((f) => {
          const ext = path.extname(f).toLowerCase();
          return ALLOWED_EXTENSIONS.includes(ext);
        })
        .sort();

      console.log("[projects-api] Images found:", images.length);

      return NextResponse.json({
        success: true,
        data: {
          images,
          count: images.length,
          directory: normalizedPath,
        },
      });
    }

    // ===== HANDLE CREATE PROJECT REQUEST =====
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