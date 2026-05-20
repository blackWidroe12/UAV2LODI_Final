import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth-db";
import { getProjectById, saveGCPs, GCPImportMeta } from "@/lib/store";
import { GCPMarker } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    console.log('[gcps/import/route.ts] POST request hit');
    // Step 1 — Auth
    const user = await getCurrentUser(request);
    console.log('[gcps/import/route.ts] Authenticated user:', user ? { id: user.id, email: user.email } : 'null');
    if (!user) {
      return errorResponse(new APIError(ErrorCodes.UNAUTHORIZED, 401, "Not authenticated"));
    }

    // Step 2 — Project ownership (reads from disk via store.json)
    const { projectId } = await params;
    console.log('[gcps/import/route.ts] Resolved projectId from params:', projectId);
    if (!projectId) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Project ID is required"));
    }

    const project = await getProjectById(projectId);
    console.log('[gcps/import/route.ts] getProjectById returned:', project ? { id: project.id, userId: project.userId, name: project.name } : 'null');
    if (!project) {
      return errorResponse(new APIError(ErrorCodes.PROJECT_NOT_FOUND, 404, "Project not found"));
    }

    console.log('[gcps/import/route.ts] Comparing project.userId vs user.id:', project.userId, 'vs', user.id);
    if (project.userId !== user.id) {
      return errorResponse(new APIError(ErrorCodes.FORBIDDEN, 403, "Access denied"));
    }

    // Step 3 — Parse body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Invalid request body"));
    }

    const { gcps, crs, sourceFile, importedAt, totalRows, skippedRows } = body;

    if (!Array.isArray(gcps) || gcps.length === 0) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "No GCPs provided"));
    }

    // Step 4 — Save
    const meta: GCPImportMeta = {
      sourceFile: sourceFile ?? "unknown.csv",
      crs: crs ?? "EPSG:4326",
      importedAt: importedAt ?? Date.now(),
      totalImported: gcps.length,
      totalRows: totalRows ?? gcps.length,
      skippedRows: skippedRows ?? 0,
    };

    await saveGCPs(projectId, gcps, meta);

    return NextResponse.json({
      success: true,
      data: { imported: gcps.length, gcps, meta },
    });
  } catch (error) {
    console.error("Import GCPs error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
