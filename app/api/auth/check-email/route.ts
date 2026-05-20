import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { findUserByEmail } from "@/lib/auth-db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Email is required"));
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({
        success: true,
        data: { available: false, reason: "Invalid email format" },
      });
    }

    const existingUser = await findUserByEmail(email);
    
    return NextResponse.json({
      success: true,
      data: {
        available: !existingUser,
        reason: existingUser ? "Email already registered" : null,
      },
    });
  } catch (error) {
    console.error("Check email error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
