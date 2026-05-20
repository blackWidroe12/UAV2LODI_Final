import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser, sanitizeUser } from "@/lib/auth-db";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    
    if (!user) {
      return errorResponse(new APIError(ErrorCodes.UNAUTHORIZED, 401, "Not authenticated"));
    }

    return NextResponse.json({
      success: true,
      data: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Get current user error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
