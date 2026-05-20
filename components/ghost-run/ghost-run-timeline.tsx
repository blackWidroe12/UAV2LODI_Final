'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { usePipelineStore, useUIStore } from '@/lib/stores';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  X,
  Clock,
  Zap,
  AlertTriangle,
  Play,
  ChevronRight,
} from 'lucide-react';

interface GhostRunEstimate {
  stageId: string;
  stageName: string;
  estimatedStart: number; // minutes from start
  estimatedEnd: number;
  duration: number;
  cumulativeTime: number;
}

// Stage icons for reference
const stageShortNames: Record<string, string> = {
  diagnostic: 'DIAG',
  intake: 'GCP',
  sfm: 'SFM',
  dense_cloud: 'DENSE',
  dsm_dtm: 'DSM',
  segmentation: 'SEG',
  lod_modeling: 'LOD',
  validation: 'QA',
  analytics: 'ANLYS',
  export: 'EXP',
};

export function GhostRunTimeline() {
  const { stages, isGlobalRunning, setGlobalRunning } = usePipelineStore();
  const { showGhostRun, setShowGhostRun } = useUIStore();

  // Calculate estimates based on image count (mock: 50 images)
  const estimates: GhostRunEstimate[] = useMemo(() => {
    let cumulative = 0;
    return stages.map((stage) => {
      const duration = Math.ceil((stage.estimatedDuration || 120) / 60); // Convert to minutes
      const estimate: GhostRunEstimate = {
        stageId: stage.id,
        stageName: stage.shortName,
        estimatedStart: cumulative,
        estimatedEnd: cumulative + duration,
        duration,
        cumulativeTime: cumulative + duration,
      };
      cumulative += duration;
      return estimate;
    });
  }, [stages]);

  const totalDuration = estimates[estimates.length - 1]?.cumulativeTime || 0;
  const completedStages = stages.filter((s) => s.status === 'completed').length;
  const completedTime = estimates
    .filter((_, i) => stages[i].status === 'completed')
    .reduce((sum, e) => sum + e.duration, 0);

  // Chart data for area visualization
  const chartData = useMemo(() => {
    const data: { time: number; load: number; stage: string }[] = [];
    
    estimates.forEach((est, index) => {
      // Add entry at start of stage
      data.push({
        time: est.estimatedStart,
        load: (index + 1) * 10,
        stage: est.stageName,
      });
      // Add entry at end of stage
      data.push({
        time: est.estimatedEnd,
        load: (index + 1) * 10,
        stage: est.stageName,
      });
    });
    
    return data;
  }, [estimates]);

  const handleStartGlobalRun = () => {
    setGlobalRunning(true);
    setShowGhostRun(false);
  };

  if (!showGhostRun) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4"
      >
        <div className="max-w-6xl mx-auto glass-panel rounded-xl border border-border/50 shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10">
                <Zap className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <h3 className="font-semibold font-display">Ghost Run Timeline</h3>
                <p className="text-xs text-muted-foreground">
                  Predictive execution timeline based on 50 images
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="font-mono text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {totalDuration} min total
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowGhostRun(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Timeline visualization */}
            <div className="lg:col-span-3">
              {/* Gantt-style timeline */}
              <div className="space-y-2 mb-4">
                {estimates.map((est, index) => {
                  const stage = stages[index];
                  const widthPercent = (est.duration / totalDuration) * 100;
                  const leftPercent = (est.estimatedStart / totalDuration) * 100;
                  const isCompleted = stage.status === 'completed';
                  const isProcessing = stage.status === 'processing';
                  const isReady = stage.status === 'ready';

                  return (
                    <div key={est.stageId} className="flex items-center gap-2">
                      <span className="w-16 text-xs font-mono text-muted-foreground truncate">
                        {stageShortNames[est.stageId]}
                      </span>
                      <div className="flex-1 h-6 bg-muted/30 rounded relative">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${widthPercent}%` }}
                          transition={{ duration: 0.5, delay: index * 0.05 }}
                          className={cn(
                            'absolute h-full rounded flex items-center justify-end px-2',
                            isCompleted && 'bg-emerald-500/30 border border-emerald-500/50',
                            isProcessing && 'bg-cyan-500/30 border border-cyan-500/50 animate-pulse',
                            isReady && 'bg-cyan-500/20 border border-cyan-500/30',
                            !isCompleted && !isProcessing && !isReady && 'bg-muted/50 border border-border'
                          )}
                          style={{ left: `${leftPercent}%` }}
                        >
                          <span className="text-[10px] font-mono text-foreground/70">
                            {est.duration}m
                          </span>
                        </motion.div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Time axis */}
              <div className="flex justify-between text-[10px] font-mono text-muted-foreground px-20">
                <span>0m</span>
                <span>{Math.round(totalDuration * 0.25)}m</span>
                <span>{Math.round(totalDuration * 0.5)}m</span>
                <span>{Math.round(totalDuration * 0.75)}m</span>
                <span>{totalDuration}m</span>
              </div>

              {/* Area chart */}
              <div className="h-32 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="ghostGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8c52ff" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8c52ff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="time"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v) => `${v}m`}
                    />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(2, 6, 23, 0.9)',
                        border: '1px solid rgba(100, 116, 139, 0.3)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      labelFormatter={(v) => `Time: ${v}m`}
                    />
                    <Area
                      type="stepAfter"
                      dataKey="load"
                      stroke="#8c52ff"
                      fill="url(#ghostGradient)"
                      strokeWidth={2}
                    />
                    <ReferenceLine
                      x={completedTime}
                      stroke="#10b981"
                      strokeDasharray="3 3"
                      label={{
                        value: 'Current',
                        fontSize: 10,
                        fill: '#10b981',
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Summary panel */}
            <div className="space-y-4">
              {/* Stats */}
              <div className="glass-panel p-3 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Completed</span>
                  <span className="text-sm font-mono">
                    {completedStages}/{stages.length} stages
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Elapsed</span>
                  <span className="text-sm font-mono">{completedTime} min</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Remaining</span>
                  <span className="text-sm font-mono text-cyan-400">
                    {totalDuration - completedTime} min
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">ETA</span>
                  <span className="text-sm font-mono text-emerald-400">
                    {new Date(
                      Date.now() + (totalDuration - completedTime) * 60000
                    ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Warning */}
              {totalDuration > 60 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-400/80">
                    Long processing time. Consider using Draft quality for faster results.
                  </p>
                </div>
              )}

              {/* Actions */}
              <Button
                onClick={handleStartGlobalRun}
                disabled={isGlobalRunning}
                className="w-full bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-600 hover:to-violet-600"
              >
                <Play className="h-4 w-4 mr-2" />
                Start Full Pipeline
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
