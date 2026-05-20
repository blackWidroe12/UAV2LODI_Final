import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth-db";
import { buildODMNodeUrl } from "@/lib/odm-client";

export async function GET(
  request: Request
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return errorResponse(new APIError(ErrorCodes.UNAUTHORIZED, 401, "Not authenticated"));

    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url') || 'http://localhost';
    const port = searchParams.get('port') || '3005';

    const fullUrl = buildODMNodeUrl(url, parseInt(port, 10));

    try {
      const res = await fetch(`${fullUrl}/info`, {
        signal: (AbortSignal as any).timeout(5000)
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({ 
          success: true, 
          data: { 
            version: data.version || 'unknown',
            url: fullUrl 
          } 
        });
      } else {
        return NextResponse.json({ 
          success: false, 
          error: `ODM node returned status ${res.status}` 
        });
      }
    } catch (e: any) {
      return NextResponse.json({ 
        success: false, 
        error: `Could not connect to ODM node at ${fullUrl}: ${e.message}` 
      });
    }
  } catch (error) {
    return errorResponse(new APIError(ErrorCodes.INTERNAL_ERROR, 500, "Internal server error"));
  }
}
