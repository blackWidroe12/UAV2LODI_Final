'use client';

import { motion } from 'framer-motion';
import {
  Search,
  MapPin,
  Box,
  Layers3,
  Mountain,
  Brain,
  Building2,
  CheckCircle2,
  BarChart3,
  Download,
  Lock,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePipelineStore, useUIStore } from '@/lib/stores';
import type { StageId, StageStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const STAGE_ICONS: Record<StageId, React.ComponentType<{ className?: string }>> = {
  diagnostic: Search,
  intake: MapPin,
  sfm: Box,
  dense_cloud: Layers3,
  dsm_dtm: Mountain,
  segmentation: Brain,
  lod_modeling: Building2,
  validation: CheckCircle2,
  analytics: BarChart3,
  export: Download,
};

const STATUS_COLORS: Record<StageStatus, string> = {
  locked: 'text-[#6B7280]',
  ready: 'text-[#00D4FF]',
  processing: 'text-[#F59E0B]',
  completed: 'text-[#10B981]',
  error: 'text-[#EF4444]',
};

const STATUS_DOT_COLORS: Record<StageStatus, string> = {
  locked: 'bg-[#6B7280]',
  ready: 'bg-[#00D4FF]',
  processing: 'bg-[#F59E0B]',
  completed: 'bg-[#10B981]',
  error: 'bg-[#EF4444]',
};

function StageStatusIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case 'locked':
      return <Lock className="w-3 h-3" />;
    case 'processing':
      return <Loader2 className="w-3 h-3 animate-spin" />;
    case 'completed':
      return <CheckCircle2 className="w-3 h-3" />;
    case 'error':
      return <AlertCircle className="w-3 h-3" />;
    default:
      return null;
  }
}

function StatusPill({ status }: { status: StageStatus }) {
  const labels: Record<StageStatus, string> = {
    locked: 'Locked',
    ready: 'Ready',
    processing: 'Running',
    completed: 'Done',
    error: 'Error',
  };

  return (
    <span
      className={cn(
        'text-[10px] font-medium px-1.5 py-0.5 rounded',
        status === 'locked' && 'bg-[#6B7280]/10 text-[#6B7280]',
        status === 'ready' && 'bg-[#00D4FF]/10 text-[#00D4FF]',
        status === 'processing' && 'bg-[#F59E0B]/10 text-[#F59E0B]',
        status === 'completed' && 'bg-[#10B981]/10 text-[#10B981]',
        status === 'error' && 'bg-[#EF4444]/10 text-[#EF4444]'
      )}
    >
      {labels[status]}
    </span>
  );
}

export function PipelineSidebar() {
  const { stages, activeStageId, setActiveStage } = usePipelineStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const completedCount = stages.filter((s) => s.status === 'completed').length;
  const progressPercent = (completedCount / stages.length) * 100;

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          'h-full border-r border-border bg-[#0E1117] flex flex-col transition-all duration-300 relative',
          sidebarCollapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        {/* Progress track on left edge */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#21262D]">
          <motion.div
            className="w-full bg-gradient-to-b from-[#00D4FF] to-[#10B981]"
            initial={{ height: 0 }}
            animate={{ height: `${progressPercent}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        {/* Header */}
        <div className="h-12 flex items-center justify-between px-3 border-b border-border ml-1">
          {!sidebarCollapsed && (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pipeline
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 ml-auto text-muted-foreground hover:text-foreground"
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Stage List */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 ml-1">
          <div className="space-y-0.5">
            {stages.map((stage, index) => {
              const Icon = STAGE_ICONS[stage.id];
              const isActive = stage.id === activeStageId;
              const isClickable = stage.status !== 'locked';

              return (
                <Tooltip key={stage.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => isClickable && setActiveStage(stage.id)}
                      disabled={!isClickable}
                      className={cn(
                        'w-full rounded-lg transition-all duration-200 group relative',
                        sidebarCollapsed ? 'p-2.5' : 'px-3 py-2.5',
                        isActive && 'bg-[#00D4FF]/5',
                        !isActive && isClickable && 'hover:bg-[#00D4FF]/5',
                        !isClickable && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {/* Active/Hover indicator */}
                      <div
                        className={cn(
                          'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-r transition-all',
                          isActive ? 'bg-[#00D4FF]' : 'bg-transparent group-hover:bg-[#00D4FF]/50'
                        )}
                      />

                      <div className="flex items-center gap-3">
                        {/* Icon with status dot */}
                        <div className="relative shrink-0">
                          <div
                            className={cn(
                              'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                              isActive ? 'bg-[#00D4FF]/10' : 'bg-[#21262D]'
                            )}
                          >
                            <Icon
                              className={cn(
                                'w-[18px] h-[18px]',
                                isActive ? 'text-[#00D4FF]' : STATUS_COLORS[stage.status]
                              )}
                            />
                          </div>
                          
                          {/* Status dot (visible in collapsed mode) */}
                          {sidebarCollapsed && stage.status !== 'ready' && (
                            <div
                              className={cn(
                                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0E1117]',
                                STATUS_DOT_COLORS[stage.status],
                                stage.status === 'processing' && 'animate-pulse'
                              )}
                            />
                          )}
                        </div>

                        {/* Text content (expanded mode) */}
                        {!sidebarCollapsed && (
                          <div className="flex-1 flex items-center justify-between min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <span
                                className={cn(
                                  'text-[13px] font-medium truncate',
                                  isActive ? 'text-foreground' : 'text-muted-foreground'
                                )}
                              >
                                {stage.shortName}
                              </span>
                            </div>
                            <StatusPill status={stage.status} />
                          </div>
                        )}
                      </div>

                      {/* Progress bar for processing/completed stages */}
                      {!sidebarCollapsed && stage.status === 'processing' && (
                        <div className="mt-2 ml-11">
                          <div className="h-1 bg-[#21262D] rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-[#F59E0B]"
                              initial={{ width: 0 }}
                              animate={{ width: `${stage.progress}%` }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  {sidebarCollapsed && (
                    <TooltipContent side="right" className="glass">
                      <div>
                        <p className="font-medium text-[13px]">{stage.name}</p>
                        <p className="text-[11px] text-muted-foreground capitalize">
                          {stage.status}
                          {stage.status === 'processing' && ` - ${stage.progress}%`}
                        </p>
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
        </nav>

        {/* Footer: Pipeline progress */}
        {!sidebarCollapsed && (
          <div className="p-3 border-t border-border ml-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
              <span>Progress</span>
              <span className="tabular-nums">
                {completedCount}/{stages.length}
              </span>
            </div>
            <div className="h-1.5 bg-[#21262D] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#00D4FF] to-[#10B981]"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}
