import { NextResponse } from "next/server";
import { findUserByEmail, verifyPassword, createToken, sanitizeUser } from "@/lib/auth-db";
import { setAuthCookie } from "@/lib/auth-cookies";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      throw new APIError(
        ErrorCodes.INVALID_INPUT,
        400,
        "Email and password are required"
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      throw new APIError(
        ErrorCodes.INVALID_CREDENTIALS,
        401,
        "Invalid email or password"
      );
    }

    const passwordValid = await verifyPassword(password, user.passwordHash || "");
    if (!passwordValid) {
      throw new APIError(
        ErrorCodes.INVALID_CREDENTIALS,
        401,
        "Invalid email or password"
      );
    }

    const token = createToken(user);

    // Set httpOnly cookie (browser will send automatically)
    await setAuthCookie(token);

    return NextResponse.json(
      {
        success: true,
        data: {
          user: sanitizeUser(user),
          token,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
