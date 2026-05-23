'use client';

import { motion } from 'framer-motion';
import { Folder, Play, Clock, MapPin, Image, ArrowRight, MoreVertical, Trash2, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProjectConfig, StageId } from '@/lib/types';

// Stage names for display
const STAGE_NAMES: Record<StageId, string> = {
  diagnostic: 'Diagnostic',
  intake: 'GCP Intake',
  sfm: 'SfM',
  dense_cloud: 'Dense Cloud',
  dsm_dtm: 'DSM/DTM',
  segmentation: 'Segmentation',
  lod_modeling: 'LoD Modeling',
  validation: 'Validation',
  analytics: 'Analytics',
  export: 'Export',
};

interface ProjectCardProps {
  project: ProjectConfig;
  completedStages: number;
  onOpen: () => void;
  onResume: () => void;
  onDelete: () => void;
}

// Circular progress ring
function ProgressRing({
  progress,
  size = 48,
  strokeWidth = 4,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-secondary"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-primary transition-all duration-500"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            strokeLinecap: 'round',
          }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-medium">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

export function ProjectCard({
  project,
  completedStages,
  onOpen,
  onResume,
  onDelete,
}: ProjectCardProps) {
  const progress = (completedStages / 10) * 100;
  const lastModified = new Date(project.lastModified);
  const timeAgo = getTimeAgo(lastModified);

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 cursor-pointer group relative transition-colors hover:border-border hover:bg-card/80"
      onClick={onOpen}
    >
      {/* Actions menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="glass">
          <DropdownMenuItem className="gap-2">
            <Copy className="w-4 h-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex items-start gap-4">
        {/* Progress Ring */}
        <ProgressRing progress={progress} />

        {/* Project Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate pr-8">{project.name}</h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {project.crs}
            </span>
          </div>

          {/* Stage info */}
          <div className="mt-2">
            {project.lastCompletedPhase ? (
              <span className="text-xs text-chart-2">
                Last: {STAGE_NAMES[project.lastCompletedPhase]}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Not started</span>
            )}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/30">
        <div className="flex-1 text-xs text-muted-foreground">
          {project.imageCount ? (
            <span className="flex items-center gap-1">
              <Image className="w-3 h-3" />
              {project.imageCount} images
            </span>
          ) : (
            <span>No images yet</span>
          )}
        </div>

        {/* Resume button */}
        {project.lastCompletedPhase && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-primary hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onResume();
            }}
          >
            <Play className="w-3 h-3" />
            Resume
          </Button>
        )}
      </div>
    </motion.div>
  );
}

// New Project Card with pulsing gradient border
interface NewProjectCardProps {
  onClick: () => void;
}

export function NewProjectCard({ onClick }: NewProjectCardProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="rounded-xl border border-dashed border-border/50 bg-transparent p-6 h-full min-h-[140px] flex flex-col items-center justify-center gap-3 group transition-colors hover:border-cyan-500/50 hover:bg-cyan-500/5"
    >
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center group-hover:scale-105 transition-transform">
        <Folder className="w-5 h-5 text-white" />
      </div>
      <div className="text-center">
        <p className="font-medium">New Project</p>
        <p className="text-xs text-muted-foreground">Start a new pipeline</p>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
    </motion.button>
  );
}

// Helper function
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
