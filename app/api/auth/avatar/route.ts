import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser, updateUser, sanitizeUser } from "@/lib/auth-db";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request);
    
    if (!user) {
      return errorResponse(new APIError(ErrorCodes.UNAUTHORIZED, 401, "Not authenticated"));
    }

    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;

    if (!file) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "No avatar file provided"));
    }

    // In a real app, you would upload to storage and get a URL
    // For demo, we'll create a data URL
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const mimeType = file.type || "image/png";
    const avatarUrl = `data:${mimeType};base64,${base64}`;

    const updatedUser = await updateUser(user.id, { avatarUrl });
    
    if (!updatedUser) {
      return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Failed to update avatar"));
    }

    return NextResponse.json({
      success: true,
      data: { avatarUrl },
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
