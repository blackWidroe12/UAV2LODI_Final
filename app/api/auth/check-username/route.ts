import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { findUserByUsername } from "@/lib/auth-db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username } = body;

    if (!username) {
      return errorResponse(new APIError(ErrorCodes.INVALID_INPUT, 400, "Username is required"));
    }

    // Validate username format (alphanumeric, underscores, 3-20 chars)
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json({
        success: true,
        data: { 
          available: false, 
          reason: "Username must be 3-20 characters, letters, numbers, and underscores only" 
        },
      });
    }

    const existingUser = await findUserByUsername(username);
    
    return NextResponse.json({
      success: true,
      data: {
        available: !existingUser,
        reason: existingUser ? "Username already taken" : null,
      },
    });
  } catch (error) {
    console.error("Check username error:", error);
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
