import { NextRequest } from 'next/server';
import prisma, { getProjectById, findSession, safeUser } from '@/lib/db';
import { getPipelineState, getAllStageProgresses, savePipelineState, saveStageProgress } from '@/lib/db-pipeline';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const session = await findSession(token);
  if (!session) {
    return Response.json({ success: false, error: 'Session expired' }, { status: 401 });
  }
  const user = safeUser(session.user);

  const project = await getProjectById(projectId);
  if (!project || project.userId !== user.id) {
    return Response.json({ success: false, error: 'Not authorized' }, { status: 403 });
  }

  const pipelineState = await getPipelineState(projectId);
  const stageProgresses = await getAllStageProgresses(projectId);

  return Response.json({
    success: true,
    data: {
      currentStageId: pipelineState?.currentStageId ?? 'diagnostic',
      overallProgress: pipelineState?.overallProgress ?? 0,
      isProcessing: pipelineState?.isProcessing ?? false,
      viewportMode: pipelineState?.viewportMode ?? 'split',
      activeViewportOpen: pipelineState?.activeViewportOpen ?? false,
      stageProgresses,
      lastActivityAt: pipelineState?.lastActivityAt?.getTime() ?? null,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const session = await findSession(token);
  if (!session) {
    return Response.json({ success: false, error: 'Session expired' }, { status: 401 });
  }
  const user = safeUser(session.user);

  const project = await getProjectById(projectId);
  if (!project || project.userId !== user.id) {
    return Response.json({ success: false, error: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'saveState') {
      const { data } = body;
      await savePipelineState(projectId, data);
      return Response.json({ success: true });
    }

    if (action === 'saveProgress') {
      const { stageData } = body;
      await saveStageProgress(projectId, stageData);
      return Response.json({ success: true });
    }

    if (action === 'saveStatus') {
      const { stageId, status } = body;
      await saveStageProgress(projectId, {
        stageId,
        status,
        progress: 0,
      });
      return Response.json({ success: true });
    }

    if (action === 'completeStage') {
      const { stageId, outputs } = body;
      const now = Date.now();
      
      // Try to find the progress to get startedAt
      const progress = await prisma.stageProgress.findUnique({
        where: { projectId_stageId: { projectId: projectId, stageId } }
      });
      const startedAt = progress?.startedAt?.getTime() ?? now;
      const processingTimeSeconds = Math.floor((now - startedAt) / 1000);

      await saveStageProgress(projectId, {
        stageId,
        status: 'completed',
        progress: 100,
        completedAt: now,
        processingTimeSeconds,
        outputs,
      });
      return Response.json({ success: true });
    }

    if (action === 'failStage') {
      const { stageId, errorMessage } = body;
      await saveStageProgress(projectId, {
        stageId,
        status: 'error',
        progress: 0,
        errorMessage,
        completedAt: Date.now(),
      });
      return Response.json({ success: true });
    }

    return Response.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[pipeline-api] POST error', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
