import prisma from '@/lib/db';
import { StageProgress, Prisma } from '@prisma/client';

export interface StageProgressData {
  stageId: string;
  status: 'pending' | 'ready' | 'processing' | 'completed' | 'error' | 'locked';
  progress: number;
  progressMessage?: string;
  startedAt?: number;
  completedAt?: number;
  processingTimeSeconds?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
  outputs?: Record<string, any>;
}

// ===== PIPELINE STATE =====

export async function getPipelineState(projectId: string) {
  return prisma.pipelineState.findUnique({
    where: { projectId },
    include: { stageProgresses: true },
  });
}

export async function savePipelineState(
  projectId: string,
  data: {
    currentStageId?: string;
    overallProgress?: number;
    isProcessing?: boolean;
    viewportMode?: string;
    activeViewportOpen?: boolean;
  }
) {
  return prisma.pipelineState.upsert({
    where: { projectId },
    update: {
      ...data,
      lastActivityAt: new Date(),
    },
    create: {
      projectId,
      currentStageId: data.currentStageId || 'diagnostic',
      overallProgress: data.overallProgress || 0,
      isProcessing: data.isProcessing || false,
      viewportMode: data.viewportMode || 'split',
      activeViewportOpen: data.activeViewportOpen || false,
    },
  });
}

// ===== STAGE PROGRESS =====

export async function getStageProgress(
  projectId: string,
  stageId: string
): Promise<StageProgressData | null> {
  const progress = await prisma.stageProgress.findUnique({
    where: { projectId_stageId: { projectId, stageId } },
  });

  if (!progress) return null;

  return {
    stageId: progress.stageId,
    status: progress.status as any,
    progress: progress.progress,
    progressMessage: progress.progressMessage || undefined,
    startedAt: progress.startedAt?.getTime(),
    completedAt: progress.completedAt?.getTime(),
    processingTimeSeconds: progress.processingTimeSeconds || undefined,
    errorMessage: progress.errorMessage || undefined,
    metadata: progress.metadata as Record<string, any> || undefined,
    outputs: progress.outputs as Record<string, any> || undefined,
  };
}

export async function getAllStageProgresses(projectId: string) {
  const progresses = await prisma.stageProgress.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  });

  return progresses.map(p => ({
    stageId: p.stageId,
    status: p.status,
    progress: p.progress,
    progressMessage: p.progressMessage || undefined,
    startedAt: p.startedAt?.getTime(),
    completedAt: p.completedAt?.getTime(),
    processingTimeSeconds: p.processingTimeSeconds || undefined,
    errorMessage: p.errorMessage || undefined,
    metadata: p.metadata as Record<string, any> || undefined,
    outputs: p.outputs as Record<string, any> || undefined,
  }));
}

export async function saveStageProgress(
  projectId: string,
  stageData: StageProgressData
) {
  return prisma.stageProgress.upsert({
    where: {
      projectId_stageId: {
        projectId,
        stageId: stageData.stageId,
      },
    },
    update: {
      status: stageData.status,
      progress: stageData.progress,
      progressMessage: stageData.progressMessage || null,
      startedAt: stageData.startedAt ? new Date(stageData.startedAt) : null,
      completedAt: stageData.completedAt ? new Date(stageData.completedAt) : null,
      processingTimeSeconds: stageData.processingTimeSeconds || null,
      errorMessage: stageData.errorMessage || null,
      metadata: stageData.metadata ?? undefined,
      outputs: stageData.outputs ?? undefined,
      updatedAt: new Date(),
    },
    create: {
      projectId,
      stageId: stageData.stageId,
      status: stageData.status,
      progress: stageData.progress,
      progressMessage: stageData.progressMessage || null,
      startedAt: stageData.startedAt ? new Date(stageData.startedAt) : null,
      completedAt: stageData.completedAt ? new Date(stageData.completedAt) : null,
      processingTimeSeconds: stageData.processingTimeSeconds || null,
      errorMessage: stageData.errorMessage || null,
      metadata: stageData.metadata ?? undefined,
      outputs: stageData.outputs ?? undefined,
    },
  });
}

export async function resetStageProgress(projectId: string, stageId: string) {
  return prisma.stageProgress.update({
    where: { projectId_stageId: { projectId, stageId } },
    data: {
      status: 'pending',
      progress: 0,
      progressMessage: null,
      startedAt: null,
      completedAt: null,
      processingTimeSeconds: null,
      errorMessage: null,
      outputs: Prisma.DbNull,
    },
  });
}

export async function deleteAllStageProgress(projectId: string) {
  return prisma.stageProgress.deleteMany({
    where: { projectId },
  });
}

export async function markStageCompleted(projectId: string, stageId: string, outputs?: Record<string, any>) {
  const now = Date.now();
  const existing = await prisma.stageProgress.findUnique({
    where: { projectId_stageId: { projectId, stageId } },
  });
  const startTime = existing?.startedAt?.getTime() ?? now;
  return saveStageProgress(projectId, {
    stageId,
    status: 'completed',
    progress: 100,
    completedAt: now,
    processingTimeSeconds: Math.floor((now - startTime) / 1000),
    outputs,
  });
}

export async function markStageFailed(projectId: string, stageId: string, errorMessage: string) {
  return saveStageProgress(projectId, {
    stageId,
    status: 'error',
    progress: 0,
    errorMessage,
    completedAt: Date.now(),
  });
}
