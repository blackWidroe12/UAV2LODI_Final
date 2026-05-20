import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { verifyCode } from "@/lib/auth-db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, code } = body;

    if (!email || !code) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Email and verification code are required"));
    }

    // Validate code format (7 digits)
    if (!/^\d{7}$/.test(code)) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Invalid verification code format"));
    }

    const result = await verifyCode(email, code);
    
    if (!result.valid) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        verified: true,
        message: "Email verified successfully",
      },
    });
  } catch (error) {
    console.error("Verify email error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
