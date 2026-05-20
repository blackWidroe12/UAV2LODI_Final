import { NextResponse } from "next/server";
import { 
  findUserByEmail, 
  findUserByUsername, 
  createUser, 
  createToken, 
  sanitizeUser,
  createVerificationCode,
} from "@/lib/auth-db";
import { setAuthCookie } from "@/lib/auth-cookies";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { emailService } from "@/lib/email-service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, username, firstName, lastName, department } = body;

    // Validation
    if (!email || !password || !username || !firstName || !lastName) {
      throw new APIError(
        ErrorCodes.INVALID_INPUT,
        400,
        "All fields are required"
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new APIError(
        ErrorCodes.INVALID_INPUT,
        400,
        "Invalid email format"
      );
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      throw new APIError(
        ErrorCodes.INVALID_INPUT,
        400,
        "Username must be 3-20 characters, letters, numbers, and underscores only"
      );
    }

    if (password.length < 8) {
      throw new APIError(
        ErrorCodes.INVALID_INPUT,
        400,
        "Password must be at least 8 characters"
      );
    }

    // Check if email already exists
    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      throw new APIError(
        ErrorCodes.EMAIL_ALREADY_EXISTS,
        409,
        "Email already registered"
      );
    }

    // Check if username already exists
    const existingUsername = await findUserByUsername(username);
    if (existingUsername) {
      throw new APIError(
        ErrorCodes.USERNAME_ALREADY_EXISTS,
        409,
        "Username already taken"
      );
    }

    // Create user
    const user = await createUser({
      email,
      password,
      username,
      firstName,
      lastName,
      department: department || "General",
      avatarUrl: null,
    });

    // Create verification code for email
    const verification = createVerificationCode(email);

    // Send verification email
    const verificationResult = await emailService.sendVerificationCode(
      email,
      verification.code,
      firstName
    );

    if (!verificationResult.success) {
      console.error("[Register] Verification email failed:", verificationResult.error);
      // Continue with registration even if email fails - user can request resend
    }

    const isDev = process.env.NODE_ENV !== "production";

    // Create JWT token
    const token = createToken(user);

    // Set httpOnly cookie
    await setAuthCookie(token);

    return NextResponse.json(
      {
        success: true,
        data: {
          user: sanitizeUser(user),
          token,
          requiresVerification: true,
          // Include verification code in dev for testing
          ...(isDev && { verificationCode: verification.code }),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
