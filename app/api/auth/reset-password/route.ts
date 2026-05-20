import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { validateResetToken, useResetToken, getPasswordResetToken, findUserById } from "@/lib/auth-db";
import { emailService } from "@/lib/email-service";

// GET: Validate reset token
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Reset token is required"));
    }

    const validation = validateResetToken(token);
    
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Get email to show to user
    const resetToken = getPasswordResetToken(token);

    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        email: resetToken?.email,
      },
    });
  } catch (error) {
    console.error("Validate reset token error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}

// POST: Reset password with token
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, password, confirmPassword } = body;

    if (!token || !password || !confirmPassword) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Token, password, and confirmation are required"));
    }

    if (password !== confirmPassword) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Passwords do not match"));
    }

    if (password.length < 8) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Password must be at least 8 characters"));
    }

    // Validate token first
    const validation = validateResetToken(token);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Reset the password
    const result = await useResetToken(token, password);
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Get the user to send confirmation email
    const resetToken = getPasswordResetToken(token);
    if (resetToken) {
      const user = await findUserById(resetToken.userId);
      if (user) {
        // Send confirmation email
        await emailService.sendVerificationCode(
          user.email,
          'Confirmation', // This will show as a generic confirmation but we're reusing the structure
          user.firstName
        ).catch((err) => {
          console.error("[Reset Password] Failed to send confirmation:", err);
          // Don't fail the request if email fails
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        message: "Password reset successfully. You can now log in with your new password.",
      },
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
