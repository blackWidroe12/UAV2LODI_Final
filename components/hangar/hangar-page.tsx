'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Layers,
  Search,
  Grid3X3,
  List,
  Settings,
  Bell,
  User,
  ChevronDown,
  LogOut,
  HelpCircle,
  FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProjectCard, NewProjectCard } from './project-card';
import { NewProjectModal } from './new-project-modal';
import { useAuthStore, useProjectStore, usePipelineStore } from '@/lib/stores';
import { projectApi } from '@/lib/api';
import type { ProjectConfig, StageId } from '@/lib/types';

// Stats card component
function StatCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number; positive: boolean };
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 transition-colors hover:border-border">
      <div className="flex items-center justify-between">
        <Icon className="w-5 h-5 text-muted-foreground" />
        {trend && (
          <span
            className={cn(
              'text-xs font-medium',
              trend.positive ? 'text-emerald-500' : 'text-destructive'
            )}
          >
            {trend.positive ? '+' : ''}{trend.value}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

interface HangarPageProps {
  onOpenProject: (project: ProjectConfig) => void;
}

export function HangarPage({ onOpenProject }: HangarPageProps) {
  const { user, logout } = useAuthStore();
  const { recentProjects, loadProject, removeRecentProject } = useProjectStore();
  const { restoreFromPhase } = usePipelineStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Automatically fetch projects from the backend on app start / hangar load
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await projectApi.list();
        if (res.success && res.data) {
          useProjectStore.getState().setProjects(res.data);

          // If the current activeProject is not in the fetched projects array, clear it!
          const activeProj = useProjectStore.getState().activeProject;
          if (activeProj) {
            const projectStillExists = res.data.some((p) => p.id === activeProj.id);
            if (!projectStillExists) {
              useProjectStore.getState().resetProject();
              usePipelineStore.getState().resetPipeline();
            }
          }
        } else {
          setError(res.error || 'Failed to load projects');
        }
      } catch (err) {
        setError('Network error loading projects');
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const userInitials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()
    : 'U';

  // Filter projects based on search
  const filteredProjects = recentProjects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate stats
  const totalProjects = recentProjects.length;
  const completedProjects = recentProjects.filter(
    (p) => p.lastCompletedPhase === 'export'
  ).length;
  const inProgressProjects = recentProjects.filter(
    (p) => p.lastCompletedPhase && p.lastCompletedPhase !== 'export'
  ).length;

  const handleOpenProject = (project: ProjectConfig) => {
    usePipelineStore.getState().resetPipeline();
    loadProject(project);
    onOpenProject(project);
  };

  const handleResumeProject = (project: ProjectConfig) => {
    usePipelineStore.getState().resetPipeline();
    loadProject(project);
    if (project.lastCompletedPhase) {
      // Get next stage after the last completed one
      const stages: StageId[] = [
        'diagnostic',
        'intake',
        'sfm',
        'dense_cloud',
        'dsm_dtm',
        'segmentation',
        'lod_modeling',
        'validation',
        'analytics',
        'export',
      ];
      const currentIndex = stages.indexOf(project.lastCompletedPhase);
      const nextStage = stages[Math.min(currentIndex + 1, stages.length - 1)];
      restoreFromPhase(nextStage);
    }
    onOpenProject(project);
  };

  const handleProjectCreated = (project: ProjectConfig) => {
    usePipelineStore.getState().resetPipeline();
    onOpenProject(project);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 h-14 border-b border-border/50 bg-background/80 backdrop-blur-md flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm">UAV2LoD1-ZW</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <Bell className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Settings className="w-4 h-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 pl-2 h-9">
                <Avatar className="w-7 h-7">
                  <AvatarImage src={user?.avatarUrl || undefined} alt={user?.username} />
                  <AvatarFallback className="bg-secondary text-xs">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm hidden sm:inline">{user?.firstName}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="gap-2">
                <User className="w-4 h-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2">
                <HelpCircle className="w-4 h-4" />
                Help & Docs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 text-destructive" onClick={() => logout()}>
                <LogOut className="w-4 h-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
            Welcome back, {user?.firstName}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Continue your photogrammetry projects or start a new one
          </p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8"
        >
          <StatCard
            label="Total Projects"
            value={totalProjects}
            icon={FolderOpen}
          />
          <StatCard
            label="In Progress"
            value={inProgressProjects}
            icon={Layers}
            trend={{ value: 12, positive: true }}
          />
          <StatCard
            label="Completed"
            value={completedProjects}
            icon={Layers}
          />
        </motion.div>

        {/* Projects Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold">Your Projects</h2>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  className="pl-9 w-full sm:w-48 h-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* View Toggle */}
              <div className="flex items-center border border-border rounded-lg overflow-hidden shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'rounded-none h-9 w-9',
                    viewMode === 'grid' && 'bg-secondary'
                  )}
                  onClick={() => setViewMode('grid')}
                >
                  <Grid3X3 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'rounded-none h-9 w-9',
                    viewMode === 'list' && 'bg-secondary'
                  )}
                  onClick={() => setViewMode('list')}
                >
                  <List className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Projects Grid/List */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
              <p className="text-muted-foreground text-sm">Loading projects...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-destructive mb-4 text-sm">{error}</p>
              <Button onClick={() => window.location.reload()} size="sm">
                Retry
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4'
                  : 'flex flex-col gap-3'
              )}
            >
              {/* New Project Card */}
              <NewProjectCard onClick={() => setShowNewProjectModal(true)} />

              {/* Project Cards */}
              {filteredProjects.map((project, index) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                >
                  <ProjectCard
                    project={project}
                    completedStages={getCompletedStagesCount(project.lastCompletedPhase)}
                    onOpen={() => handleOpenProject(project)}
                    onResume={() => handleResumeProject(project)}
                    onDelete={() => removeRecentProject(project.id)}
                  />
                </motion.div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && filteredProjects.length === 0 && searchQuery && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">
                No projects found matching &quot;{searchQuery}&quot;
              </p>
            </div>
          )}
          {!isLoading && !error && filteredProjects.length === 0 && !searchQuery && (
            <div className="text-center py-16 rounded-xl border border-dashed border-border/50 mt-4">
              <FolderOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-base font-medium">No projects yet</p>
              <p className="text-muted-foreground mt-1 mb-4 text-sm">
                Create your first project to get started
              </p>
              <Button onClick={() => setShowNewProjectModal(true)} size="sm">
                Create New Project
              </Button>
            </div>
          )}
        </motion.div>
      </main>

      {/* New Project Modal */}
      <NewProjectModal
        open={showNewProjectModal}
        onOpenChange={setShowNewProjectModal}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  );
}

// Helper function to count completed stages
function getCompletedStagesCount(lastCompletedPhase: StageId | null): number {
  if (!lastCompletedPhase) return 0;

  const stages: StageId[] = [
    'diagnostic',
    'intake',
    'sfm',
    'dense_cloud',
    'dsm_dtm',
    'segmentation',
    'lod_modeling',
    'validation',
    'analytics',
    'export',
  ];

  return stages.indexOf(lastCompletedPhase) + 1;
}
