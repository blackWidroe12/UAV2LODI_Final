import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { findUserByEmail, createVerificationCode } from "@/lib/auth-db";
import { emailService } from "@/lib/email-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Email is required"));
    }

    const user = await findUserByEmail(email);
    if (!user) {
      // Don't reveal if email exists - security best practice
      return NextResponse.json({
        success: true,
        data: {
          message: "Verification code sent to your email",
          expiresIn: 10, // minutes
        },
      });
    }

    // Create verification code
    const verification = createVerificationCode(email);

    // Send email
    const result = await emailService.sendVerificationCode(
      email,
      verification.code,
      user.firstName
    );

    if (!result.success) {
      console.error("[Send Verification] Email failed:", result.error);
      return NextResponse.json(
        { success: false, error: result.error || "Failed to send verification email" },
        { status: 500 }
      );
    }

    const isDev = process.env.NODE_ENV !== "production";
    
    return NextResponse.json({
      success: true,
      data: {
        message: "Verification code sent to your email",
        expiresIn: 10, // minutes
        // Only include code in development for testing
        ...(isDev && { code: verification.code }),
      },
    });
  } catch (error) {
    console.error("Send verification error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
