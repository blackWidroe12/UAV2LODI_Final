import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { findUserByEmail, createPasswordResetToken } from "@/lib/auth-db";
import { emailService } from "@/lib/email-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Email is required"));
    }

    const user = await findUserByEmail(email);
    
    // Always return success to prevent email enumeration attacks
    if (!user) {
      return NextResponse.json({
        success: true,
        data: {
          message: "If an account exists with this email, you will receive a password reset link.",
        },
      });
    }

    // Check for existing unexpired token
    const resetToken = await createPasswordResetToken(user.id, email);
    
    if (!resetToken) {
      return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 429, "A password reset request is already pending. Please check your email or wait 1 hour before requesting again."));
    }

    // Build reset URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken.token}`;

    // Send reset email
    const result = await emailService.sendPasswordReset(
      email,
      resetUrl,
      user.firstName
    );

    if (!result.success) {
      console.error("[Forgot Password] Email failed:", result.error);
      return NextResponse.json(
        { success: false, error: result.error || "Failed to send password reset email" },
        { status: 500 }
      );
    }

    const isDev = process.env.NODE_ENV !== "production";

    return NextResponse.json({
      success: true,
      data: {
        message: "If an account exists with this email, you will receive a password reset link.",
        // Only include token in development for testing
        ...(isDev && { 
          token: resetToken.token,
          resetUrl,
        }),
      },
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
