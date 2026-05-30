'use client';

import { useAuthStore, usePipelineStore, useProjectStore } from '@/lib/stores';
import { useCallback, useEffect, useRef } from 'react';

const AUTOSAVE_INTERVAL_MS = 30000;

export function useSessionSync() {
  const token = useAuthStore(state => state.token);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const activeProjectId = useProjectStore(state => state.activeProject?.id);
  const currentStageId = usePipelineStore(state => state.currentStageId);
  const activeViewportMode = usePipelineStore(state => state.activeViewportMode);
  const activeViewportOpen = usePipelineStore(state => state.activeViewportOpen);

  const isSyncingRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // ===== DEFINE ALL FUNCTIONS FIRST =====

  // 1. Define performServerSync FIRST
  const performServerSync = useCallback(async () => {
    if (!activeProjectId || !token) return;
    if (isSyncingRef.current) return;

    isSyncingRef.current = true;
    try {
      const response = await fetch(`/api/projects/${activeProjectId}/pipeline/state`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentStageId,
          viewportMode: activeViewportMode,
          activeViewportOpen,
        }),
        credentials: 'include',
      });

      if (response.status === 401) {
        await useAuthStore.getState().logout();
        return;
      }

      if (!response.ok) {
        const ct = response.headers.get('content-type');
        if (ct?.includes('text/html')) {
          console.error('[session-sync] Endpoint returned HTML — route missing');
          return;
        }
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Status ${response.status}`);
      }

      console.log('[session-sync] State synced successfully');
    } catch (err: any) {
      console.error('[session-sync] Sync failed:', err.message);
    } finally {
      isSyncingRef.current = false;
    }
  }, [token, activeProjectId, currentStageId, activeViewportMode, activeViewportOpen]);

  // 2. Define loadPipelineState SECOND
  const loadPipelineState = useCallback(async () => {
    if (!activeProjectId || !token) return;

    try {
      const response = await fetch(`/api/projects/${activeProjectId}/pipeline/state`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });

      if (!response.ok) return;

      const ct = response.headers.get('content-type');
      if (ct?.includes('text/html')) {
        console.error('[session-sync] Pipeline state endpoint returned HTML');
        return;
      }

      const result = await response.json();
      if (!result.success || !result.data) return;

      const { data } = result;
      const store = usePipelineStore.getState();

      if (data.currentStageId) store.setCurrentStageId(data.currentStageId);

      const stageResults: Record<string, any> = {};
      for (const sp of data.stageProgresses || []) {
        stageResults[sp.stageId] = {
          status: sp.status,
          progress: sp.progress,
          progressMessage: sp.progressMessage,
          startedAt: sp.startedAt,
          completedAt: sp.completedAt,
          errorMessage: sp.errorMessage,
          outputs: sp.outputs,
          metadata: sp.metadata,
        };
      }

      console.log('[session-sync] Pipeline state restored to stage:', data.currentStageId);
    } catch (err: any) {
      console.error('[session-sync] Load failed:', err.message);
    }
  }, [activeProjectId, token]);

  // ===== DEFINE ALL EFFECTS AFTER FUNCTIONS =====

  // 3. Auto-save effect — uses performServerSync (already defined above)
  useEffect(() => {
    if (!isAuthenticated || !activeProjectId) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      performServerSync();
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [isAuthenticated, activeProjectId, currentStageId, performServerSync]);

  // 4. Restore on project open — uses loadPipelineState (already defined above)
  useEffect(() => {
    if (!isAuthenticated || !activeProjectId) return;
    loadPipelineState();
  }, [isAuthenticated, activeProjectId, loadPipelineState]);

  // 5. Save on page unload — uses performServerSync (already defined above)
  useEffect(() => {
    window.addEventListener('beforeunload', performServerSync);
    return () => window.removeEventListener('beforeunload', performServerSync);
  }, [performServerSync]);

  return null;
}
