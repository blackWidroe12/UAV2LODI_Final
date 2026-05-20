'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Play, Square, Loader2, Eye, Layout, PanelRightClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePipelineStore } from '@/lib/stores';
import { STAGE_VIEWPORT_CONFIG } from '@/lib/viewport-config';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { StageId, StageStatus } from '@/lib/types';

interface StageLayoutProps {
  stageId: StageId;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: ReactNode;
  onRun?: () => void;
  onCancel?: () => void;
  onPreviewResults?: () => void;
  isRunning?: boolean;
  hasResults?: boolean;
  canRun?: boolean;
}

export function StageLayout({
  stageId,
  icon: Icon,
  title,
  description,
  children,
  onRun,
  onCancel,
  onPreviewResults,
  isRunning = false,
  hasResults = false,
  canRun: externalCanRun = true,
}: StageLayoutProps) {
  const { 
    stages, 
    cancelStage, 
    activeViewportOpen, 
    openViewport, 
    closeViewport 
  } = usePipelineStore();
  const stage = stages.find((s) => s.id === stageId);
  const stageIndex = stages.findIndex((s) => s.id === stageId);
  
  // Get viewport config for this stage
  const viewportConfig = STAGE_VIEWPORT_CONFIG[stageId];
  const hasViewport = viewportConfig.available;
  
  if (!stage) {
  return (
    <div className="p-4 text-sm text-muted-foreground">
      Loading stage information...
    </div>
  );
}

  const status = stage.status;
  const isProcessing = status === 'processing' || isRunning;
  const isCompleted = status === 'completed';
  const isLocked = status === 'locked';
  const canRun = status === 'ready' && !isProcessing && externalCanRun;

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    cancelStage(stageId);
  };

  const handleToggleViewport = () => {
    if (activeViewportOpen) {
      closeViewport();
    } else {
      openViewport(viewportConfig.defaultMode || undefined);
    }
  };

  // Handle Preview Results - also opens viewport
  const handlePreviewResults = () => {
    if (hasViewport && !activeViewportOpen) {
      openViewport(viewportConfig.defaultMode || undefined);
    }
    if (onPreviewResults) {
      onPreviewResults();
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0E1117]">
      {/* Stage Header */}
      <div className="shrink-0 px-4 py-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#00D4FF]/10">
              <Icon className="w-5 h-5 text-[#00D4FF]" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-foreground leading-tight">
                {title}
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {description}
              </p>
            </div>
          </div>
          
          {/* Stage number badge & status */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {String(stageIndex + 1).padStart(2, '0')} / {stages.length}
            </span>
            <StatusPill status={status} />
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <ScrollArea className="flex-1">
        <div className="p-4 max-w-[640px] mx-auto">
          {children}
        </div>
      </ScrollArea>

      {/* Fixed Action Bar */}
      <div className="shrink-0 px-4 py-3 border-t border-border bg-[#161B22] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Open/Close Viewport button (only for stages with viewport) */}
          {hasViewport && (
            <Button
              variant="outline"
              onClick={handleToggleViewport}
              className={cn(
                'h-9 gap-2 text-[13px] border-[rgba(255,255,255,0.1)]',
                activeViewportOpen 
                  ? 'bg-[#21262D] text-[#E6EDF3]' 
                  : 'hover:bg-[#21262D]'
              )}
            >
              {activeViewportOpen ? (
                <>
                  <PanelRightClose className="w-4 h-4" />
                  Close Viewport
                </>
              ) : (
                <>
                  <Layout className="w-4 h-4" />
                  {viewportConfig.openButtonLabel}
                </>
              )}
            </Button>
          )}

          {/* Run Stage button */}
          <Button
            onClick={onRun}
            disabled={!canRun || isProcessing || isLocked}
            className={cn(
              'h-9 gap-2 text-[13px] font-medium',
              canRun
                ? 'bg-gradient-to-r from-[#00D4FF] to-[#00B4D8] hover:from-[#00D4FF]/90 hover:to-[#00B4D8]/90 text-[#0E1117] glow-cyan'
                : 'bg-[#21262D] text-muted-foreground cursor-not-allowed'
            )}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Stage
              </>
            )}
          </Button>

          {/* Preview Results button (visible when completed) */}
          {(isCompleted || hasResults) && onPreviewResults && (
            <Button
              variant="outline"
              onClick={handlePreviewResults}
              className="h-9 gap-2 text-[13px] border-[#00D4FF]/50 text-[#00D4FF] hover:bg-[#00D4FF]/5 hover:border-[#00D4FF]"
            >
              <Eye className="w-4 h-4" />
              Preview Results
            </Button>
          )}
        </div>

        {/* Cancel button (visible only when processing) */}
        {isProcessing && (
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="h-9 gap-2 text-[13px] text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
          >
            <Square className="w-4 h-4" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: StageStatus }) {
  const config: Record<StageStatus, { label: string; className: string }> = {
    locked: { label: 'Locked', className: 'bg-[#6B7280]/10 text-[#6B7280]' },
    ready: { label: 'Ready', className: 'bg-[#00D4FF]/10 text-[#00D4FF]' },
    processing: { label: 'Processing', className: 'bg-[#F59E0B]/10 text-[#F59E0B]' },
    completed: { label: 'Completed', className: 'bg-[#10B981]/10 text-[#10B981]' },
    error: { label: 'Error', className: 'bg-[#EF4444]/10 text-[#EF4444]' },
  };

  const { label, className } = config[status];

  return (
    <span className={cn('text-[11px] font-medium px-2 py-1 rounded', className)}>
      {label}
    </span>
  );
}

// Section component for organizing stage content
interface StageSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export function StageSection({ title, children, className }: StageSectionProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div>{children}</div>
    </div>
  );
}
