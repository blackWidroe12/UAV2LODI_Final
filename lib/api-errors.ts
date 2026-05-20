import { NextResponse } from 'next/server';

export class APIError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export const ErrorCodes = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  USERNAME_ALREADY_EXISTS: 'USERNAME_ALREADY_EXISTS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',

  // Projects
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_DIRECTORY: 'INVALID_DIRECTORY',

  // Processing
  ODM_UNAVAILABLE: 'ODM_UNAVAILABLE',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

export function errorResponse(error: unknown, statusCode?: number) {
  if (error instanceof APIError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.statusCode }
    );
  }

  const message = error instanceof Error ? error.message : 'An unexpected error occurred';

  return NextResponse.json(
    {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message,
      },
    },
    { status: statusCode ?? 500 }
  );
}
