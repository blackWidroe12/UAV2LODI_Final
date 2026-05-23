'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthPage } from './auth';
import { HangarPage } from './hangar';
import { CockpitWorkspace } from './workspace';
import { useAuthStore, useProjectStore, usePipelineStore, useUIStore } from '@/lib/stores';
import { toast } from '@/components/ui/use-toast';
import type { ProjectConfig } from '@/lib/types';

export function AppShell() {
  const { isAuthenticated, checkSession, sessionChecked } = useAuthStore();
  const { isProjectLoaded, loadProject, closeProject } = useProjectStore();
  const { currentView, setCurrentView } = useUIStore();

  // Check for saved session and project on app mount
  useEffect(() => {
    checkSession();
    useProjectStore.getState().initialize();
  }, [checkSession]);

  // Handle global Project Not Found interceptor
  useEffect(() => {
    const handleProjectNotFound = () => {
      useProjectStore.getState().resetProject();
      usePipelineStore.getState().resetPipeline();
      toast({
        variant: 'destructive',
        title: 'Project Not Found',
        description: 'The current project no longer exists. You have been redirected to the Dashboard.',
      });
      setCurrentView('hangar');
    };

    window.addEventListener('project-not-found', handleProjectNotFound);
    return () => window.removeEventListener('project-not-found', handleProjectNotFound);
  }, [setCurrentView]);

  // Sync view state with auth/project state
  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentView('auth');
    } else if (isProjectLoaded) {
      setCurrentView('cockpit');
    } else {
      setCurrentView('hangar');
    }
  }, [isAuthenticated, isProjectLoaded, setCurrentView]);

  // Show loading indicator while checking session
  if (!sessionChecked) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Verifying session...</p>
        </div>
      </div>
    );
  }

  const handleOpenProject = (project: ProjectConfig) => {
    usePipelineStore.getState().resetPipeline();
    loadProject(project);
    setCurrentView('cockpit');
  };

  return (
    <AnimatePresence mode="wait">
      {currentView === 'auth' && (
        <motion.div
          key="auth"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.3 }}
        >
          <AuthPage />
        </motion.div>
      )}

      {currentView === 'hangar' && (
        <motion.div
          key="hangar"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
        >
          <HangarPage onOpenProject={handleOpenProject} />
        </motion.div>
      )}

      {currentView === 'cockpit' && (
        <motion.div
          key="cockpit"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="h-screen"
        >
          <CockpitWorkspace />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
