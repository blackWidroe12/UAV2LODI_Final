import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { deleteSession } from "@/lib/auth-db";
import { clearAuthCookie, getAuthCookie } from "@/lib/auth-cookies";

export async function POST() {
  try {
    const token = await getAuthCookie();

    if (token) {
      await deleteSession(token);
    }

    await clearAuthCookie();

    return NextResponse.json({
      success: true,
      data: null,
    });
  } catch (error) {
    console.error("Logout error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
