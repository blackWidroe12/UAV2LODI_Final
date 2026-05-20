'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { usePipelineStore, useProjectStore } from '@/lib/stores';
import type { StageId } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { StageLayout, StageSection } from './stage-layout';
import {
  CheckCircle,
  Layers,
  Mountain,
  Brain,
  Building2,
  BarChart3,
} from 'lucide-react';

const stageConfig: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
  sections?: { title: string; content: string }[];
}> = {
  dense_cloud: {
    icon: Layers,
    color: 'cyan',
    description: 'High-density 3D point generation with custom shaders',
    sections: [
      { title: 'Configuration', content: 'Point density settings, quality parameters' },
      { title: 'Output', content: 'Dense point cloud in LAS/LAZ format' },
    ],
  },
  dsm_dtm: {
    icon: Mountain,
    color: 'emerald',
    description: 'Digital Surface and Terrain model generation',
    sections: [
      { title: 'Configuration', content: 'Resolution, interpolation method' },
      { title: 'Output', content: 'DSM and DTM rasters in GeoTIFF format' },
    ],
  },
  segmentation: {
    icon: Brain,
    color: 'violet',
    description: 'SwinV2 AI building footprint extraction',
    sections: [
      { title: 'Configuration', content: 'Model selection, confidence threshold' },
      { title: 'Output', content: 'Building footprints as vector polygons' },
    ],
  },
  lod_modeling: {
    icon: Building2,
    color: 'cyan',
    description: '3D building model extrusion over OSM base',
    sections: [
      { title: 'Configuration', content: 'LoD level, height estimation method' },
      { title: 'Output', content: 'CityGML/CityJSON building models' },
    ],
  },
  analytics: {
    icon: BarChart3,
    color: 'emerald',
    description: 'Volume calculations and measurements',
    sections: [
      { title: 'Configuration', content: 'Measurement units, aggregation' },
      { title: 'Output', content: 'Statistical reports and charts' },
    ],
  },
};

interface GenericStageProps {
  stageId: StageId;
}

export function GenericStage({ stageId }: GenericStageProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const cancelledRef = useRef(false);
  
  const { stages, setStageStatus, setStageProgress, unlockNextStage, addLog, setViewportMode } = usePipelineStore();
  const stage = stages.find((s) => s.id === stageId);
  const config = stageConfig[stageId] || {
    icon: Layers,
    color: 'cyan',
    description: 'Processing stage',
    sections: [],
  };

  const Icon = config.icon;

  const runStage = async () => {
    
    setIsRunning(true);
    cancelledRef.current = false;
    setStageStatus(stageId, 'processing');
    addLog({ level: 'info', message: `Starting ${stage?.name}...`, source: stageId });

    // Enable 3D view for relevant stages
    if (['dense_cloud', 'lod_modeling', 'analytics'].includes(stageId)) {
      setViewportMode('split');
    }

    try {
      // Call real stage API endpoint
      const projectId = 'current-project'; // TODO: Get from route/context
      const response = await fetch(`/api/projects/${projectId}/stages/${stageId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `${stage?.name} failed`);
      }

      const data = await response.json();
      
      setStageStatus(stageId, 'completed');
      setStageProgress(stageId, 100);
      unlockNextStage(stageId);
      addLog({ level: 'success', message: `${stage?.name} completed successfully`, source: stageId });
    } catch (err) {
      if (!cancelledRef.current) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        addLog({
          level: 'error',
          message: `${stage?.name} failed: ${errorMsg}`,
          source: stageId,
        });
        setStageStatus(stageId, 'ready');
        setStageProgress(stageId, 0);
      }
    } finally {
      setIsRunning(false);
      setProgress(0);
    }
  };

  const handleCancel = () => {
    cancelledRef.current = true;
  };

  const handlePreviewResults = () => {
    if (['dense_cloud', 'lod_modeling'].includes(stageId)) {
      setViewportMode('3d-only');
    } else if (['dsm_dtm', 'segmentation'].includes(stageId)) {
      setViewportMode('2d-only');
    } else {
      setViewportMode('split');
    }
  };

  if (!stage) return null;

  return (
    <StageLayout
      stageId={stageId}
      icon={Icon}
      title={stage.name}
      description={config.description}
      onRun={runStage}
      onCancel={handleCancel}
      onPreviewResults={handlePreviewResults}
      isRunning={isRunning}
      hasResults={stage.status === 'completed'}
    >
      {/* Progress */}
      {isRunning && (
        <div className="mb-6 space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
            <span>Processing...</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}

      {/* Main content */}
      {stage.status === 'completed' ? (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="py-12"
        >
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-[#10B981]/10 flex items-center justify-center mx-auto">
              <CheckCircle className="h-10 w-10 text-[#10B981]" />
            </div>
            <div>
              <h3 className="text-[17px] font-medium">Stage Complete</h3>
              <p className="text-[13px] text-muted-foreground">
                {stage.name} has finished processing
              </p>
            </div>
          </div>
        </motion.div>
      ) : stage.status === 'locked' ? (
        <div className="py-12">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-[#21262D] flex items-center justify-center mx-auto">
              <Icon className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <div>
              <h3 className="text-[17px] font-medium text-muted-foreground">Stage Locked</h3>
              <p className="text-[13px] text-muted-foreground">
                Complete previous stages to unlock
              </p>
            </div>
          </div>
        </div>
      ) : isRunning ? (
        <div className="py-12">
          <div className="text-center space-y-4">
            <div className={cn('w-20 h-20 rounded-full flex items-center justify-center mx-auto bg-[#00D4FF]/10')}>
              <Icon className={cn('h-10 w-10 animate-pulse text-[#00D4FF]')} />
            </div>
            <div>
              <h3 className="text-[17px] font-medium">Processing</h3>
              <p className="text-[13px] text-muted-foreground">
                {stage.name} is running...
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Configuration sections */}
          {config.sections?.map((section, idx) => (
            <StageSection key={idx} title={section.title}>
              <div className="panel rounded-lg p-4">
                <p className="text-[13px] text-muted-foreground">{section.content}</p>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Configuration options will be available here.
                </p>
              </div>
            </StageSection>
          ))}

          {/* Empty state */}
          {(!config.sections || config.sections.length === 0) && (
            <div className="py-12">
              <div className="text-center space-y-4">
                <div className={cn('w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-[#00D4FF]/10')}>
                  <Icon className={cn('h-8 w-8 text-[#00D4FF]')} />
                </div>
                <div>
                  <h3 className="text-[15px] font-medium">Ready to Process</h3>
                  <p className="text-[13px] text-muted-foreground">
                    Click &quot;Run Stage&quot; to start {stage.name.toLowerCase()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </StageLayout>
  );
}
