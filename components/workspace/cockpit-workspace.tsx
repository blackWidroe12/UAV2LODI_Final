'use client';

import { useMemo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePipelineStore, useUIStore, useProjectStore, useAuthStore } from '@/lib/stores';
import { STAGE_VIEWPORT_CONFIG } from '@/lib/viewport-config';
import { cn } from '@/lib/utils';
import { Topbar } from '@/components/layout/topbar';
import { PipelineSidebar } from '@/components/layout/pipeline-sidebar';
import { CommandConsole } from '@/components/layout/command-console';
import { CoordinateBar } from '@/components/layout/coordinate-bar';
import { DualViewport } from '@/components/viewport';
import { StageRouter } from '@/components/stages';
import { GhostRunTimeline } from '@/components/ghost-run';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';

export function StageSaveIndicator() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let lastStageId = usePipelineStore.getState().currentStageId;
    let lastResults = usePipelineStore.getState().stageResults;
    let timeoutId: NodeJS.Timeout;

    const unsub = usePipelineStore.subscribe(
      (state) => {
        if (state.currentStageId !== lastStageId || state.stageResults !== lastResults) {
          lastStageId = state.currentStageId;
          lastResults = state.stageResults;
          
          setVisible(true);
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = setTimeout(() => setVisible(false), 1500);
        }
      }
    );
    return () => {
      unsub();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className={`fixed bottom-4 right-4 flex items-center gap-2 px-3 py-2 rounded bg-gray-800 text-xs transition-opacity duration-300 z-50 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
      <span className="text-gray-300">Saving...</span>
    </div>
  );
}

export function CockpitWorkspace() {
  const { 
    activeStageId,
    activeViewportOpen, 
    activeViewportMode,
    isConsoleOpen,
    closeViewport,
    setGCPs,
    loadPipelineState,
    setCurrentStageId,
  } = usePipelineStore();
  const { sidebarCollapsed } = useUIStore();
  const { activeProject } = useProjectStore();
  const { token } = useAuthStore();

  useEffect(() => {
  // Initialize authentication and load necessary data
  const init = async () => {
    // Verify session (updates auth store)
    const sessionOk = await useAuthStore.getState().checkSession();
    console.log('[cockpit] Session valid:', sessionOk);
    const token = useAuthStore.getState().token;
    console.log('[cockpit] Token used for API calls:', token ? `${token.slice(0, 20)}...` : 'none');

    if (!activeProject?.id) {
      console.warn('[cockpit] No active project, aborting data fetch');
      return;
    }

    // Load GCPs
    try {
      const gcpRes = await fetch(`/api/projects/${activeProject.id}/gcps`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      const gcpData = await gcpRes.json();
      if (gcpData.success) {
        setGCPs(gcpData.data.gcps, gcpData.data.meta);
      }
    } catch (e) {
      console.error('Failed to load GCPs:', e);
    }

    // Restore pipeline state (single fetch via the store action)
    try {
      await loadPipelineState(activeProject.id);
      // loadPipelineState populates currentStageId in the store; mirror it into
      // activeStageId so the UI navigates back to the saved stage.
      const restoredStage = usePipelineStore.getState().currentStageId;
      if (restoredStage) {
        setCurrentStageId(restoredStage);
        console.log('[cockpit] Pipeline state restored, stage:', restoredStage);
      }
    } catch (e) {
      console.error('[cockpit] Error restoring pipeline state:', e);
    }
  };
  init();
}, [activeProject?.id, setGCPs, loadPipelineState, setCurrentStageId]);

  // Get viewport config for the active stage
  const viewportConfig = useMemo(() => {
    return STAGE_VIEWPORT_CONFIG[activeStageId];
  }, [activeStageId]);

  // Determine if viewport should be shown
  const showViewport = viewportConfig.available && activeViewportOpen;

  // Get split sizes based on stage config
  const [stagePanelSize, viewportPanelSize] = viewportConfig.defaultSplitSizes;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Topbar */}
      <Topbar />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Pipeline sidebar */}
        <PipelineSidebar />

        {/* Main workspace */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ResizablePanelGroup direction="vertical" className="flex-1">
            {/* Top: Stage content + Viewport */}
            <ResizablePanel defaultSize={75} minSize={50}>
              {showViewport ? (
                /* Split layout when viewport is open */
                <ResizablePanelGroup direction="horizontal" className="h-full">
                  {/* Stage content panel */}
                  <ResizablePanel
                    defaultSize={stagePanelSize}
                    minSize={25}
                    maxSize={60}
                  >
                    <div className="h-full overflow-auto bg-background/50">
                      <StageRouter />
                    </div>
                  </ResizablePanel>

                  <ResizableHandle withHandle />

                  {/* Viewport panel */}
                  <ResizablePanel defaultSize={viewportPanelSize} minSize={30}>
                    <motion.div 
                      className="h-full flex flex-col"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                      {/* Viewport Content */}
                      <div className="flex-1 overflow-hidden">
                        <DualViewport 
                          stageId={activeStageId}
                          mode={activeViewportMode}
                          permittedModes={viewportConfig.modes}
                        />
                      </div>
                    </motion.div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                /* Full-width stage panel when viewport is closed or not available */
                <div className="h-full overflow-auto bg-background/50">
                  <StageRouter />
                </div>
              )}
            </ResizablePanel>

            {/* Bottom: Console (when open) */}
            <AnimatePresence>
              {isConsoleOpen && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="h-full"
                    >
                      <CommandConsole />
                    </motion.div>
                  </ResizablePanel>
                </>
              )}
            </AnimatePresence>
          </ResizablePanelGroup>

          {/* Coordinate bar */}
          <CoordinateBar />
        </div>
      </div>

      {/* Ghost Run Timeline overlay */}
      <GhostRunTimeline />
      <StageSaveIndicator />
    </div>
  );
}
