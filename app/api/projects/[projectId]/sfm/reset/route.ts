import { NextResponse } from 'next/server';
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from '@/lib/auth-db';
import { getProjectById, saveStageResult, saveStageProgress } from '@/lib/store';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return errorResponse(new APIError(ErrorCodes.UNAUTHORIZED, 401, 'Not authenticated.'));

    const { projectId } = await params;
    const project = await getProjectById(projectId);
    if (!project || project.userId !== user.id) {
      return errorResponse(new APIError(ErrorCodes.PROJECT_NOT_FOUND, 404, 'Not found.'));
    }

    // Clear stage result and progress
    await saveStageResult(projectId, 'sfm', {
      stageId: 'sfm',
      status: 'pending',
      startedAt: null,
      completedAt: null,
      error: null,
      outputs: null,
    });

    saveStageProgress(projectId, 'sfm', { percentage: 0, message: '' });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
