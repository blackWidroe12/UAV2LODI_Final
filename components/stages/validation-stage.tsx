'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import { usePipelineStore } from '@/lib/stores';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Play,
  CheckCircle,
  AlertTriangle,
  Target,
  TrendingUp,
  Award,
} from 'lucide-react';

interface ValidationMetrics {
  rmseX: number;
  rmseY: number;
  rmseZ: number;
  positionalAccuracy: number;
  relativeAccuracy: number;
}

interface GCPResidual {
  id: string;
  name: string;
  residualX: number;
  residualY: number;
  residualZ: number;
  total: number;
}

function MetricCard({ label, value, unit, status, icon: Icon }: {
  label: string;
  value: number;
  unit: string;
  status: 'excellent' | 'good' | 'warning';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const statusConfig = {
    excellent: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    good: { color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
    warning: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  };

  const config = statusConfig[status];

  return (
    <div className={cn('glass-panel p-4 rounded-lg border', config.border)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={cn('p-1.5 rounded-md', config.bg)}>
          <Icon className={cn('h-4 w-4', config.color)} />
        </div>
      </div>
      <p className="text-2xl font-bold font-mono">
        {value.toFixed(3)}
        <span className="text-sm text-muted-foreground ml-1">{unit}</span>
      </p>
      <Badge
        variant="outline"
        className={cn('mt-2 text-[10px]', config.border, config.color)}
      >
        {status === 'excellent' ? 'Excellent' : status === 'good' ? 'Good' : 'Review'}
      </Badge>
    </div>
  );
}

export function ValidationStage() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [metrics, setMetrics] = useState<ValidationMetrics | null>(null);
  const [residuals, setResiduals] = useState<GCPResidual[]>([]);
  
  const { updateStage, updateStageProgress, unlockNextStage, addLog } = usePipelineStore();

  // Radar chart data
  const radarData = metrics
    ? [
        { metric: 'RMSE X', value: Math.max(0, 100 - metrics.rmseX * 1000), fullMark: 100 },
        { metric: 'RMSE Y', value: Math.max(0, 100 - metrics.rmseY * 1000), fullMark: 100 },
        { metric: 'RMSE Z', value: Math.max(0, 100 - metrics.rmseZ * 1000), fullMark: 100 },
        { metric: 'Position', value: Math.max(0, 100 - metrics.positionalAccuracy * 500), fullMark: 100 },
        { metric: 'Relative', value: Math.max(0, 100 - metrics.relativeAccuracy * 2000), fullMark: 100 },
      ]
    : [];

  const getResidualStatus = (value: number) => {
    if (value < 0.045) return 'excellent';
    if (value < 0.06) return 'good';
    return 'warning';
  };

  const runValidation = async () => {
    setIsRunning(true);
    updateStage('validation', { status: 'processing' });
    addLog({ level: 'info', message: 'Starting quality assurance validation...', source: 'validation' });

    try {
      // Call real validation API endpoint
      const projectId = 'current-project'; // TODO: Get from route/context
      const response = await fetch(`/api/projects/${projectId}/stages/validation/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Validation failed');
      }

      const data = await response.json();
      
      // Update with real results from backend
      if (data.metrics) {
        setMetrics(data.metrics);
      }
      if (data.residuals) {
        setResiduals(data.residuals);
      }
      
      updateStage('validation', { status: 'completed', progress: 100 });
      unlockNextStage('validation');
      addLog({
        level: 'success',
        message: `Validation complete. Positional accuracy: ${data.metrics?.positionalAccuracy?.toFixed(3) || 'N/A'}m`,
        source: 'validation',
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addLog({
        level: 'error',
        message: `Validation failed: ${errorMsg}`,
        source: 'validation',
      });
      updateStage('validation', { status: 'ready', progress: 0 });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold font-display">Quality Assurance & Validation</h2>
          <p className="text-sm text-muted-foreground">RMSE accuracy assessment and GCP residuals</p>
        </div>
        <Button
          onClick={runValidation}
          disabled={isRunning}
          className="bg-emerald-500 hover:bg-emerald-600 text-background"
        >
          {isRunning ? (
            <>Processing...</>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Run Validation
            </>
          )}
        </Button>
      </div>

      {/* Progress */}
      {isRunning && (
        <div className="space-y-2">
          <Progress value={progress} indicatorClassName="bg-emerald-500" />
          <p className="text-xs text-muted-foreground font-mono">
            Computing accuracy metrics... {progress}%
          </p>
        </div>
      )}

      {/* Results */}
      {metrics ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Metrics Cards */}
          <div className="space-y-4">
            <MetricCard
              label="RMSE X"
              value={metrics.rmseX}
              unit="m"
              status={metrics.rmseX < 0.025 ? 'excellent' : 'good'}
              icon={Target}
            />
            <MetricCard
              label="RMSE Y"
              value={metrics.rmseY}
              unit="m"
              status={metrics.rmseY < 0.02 ? 'excellent' : 'good'}
              icon={Target}
            />
            <MetricCard
              label="RMSE Z"
              value={metrics.rmseZ}
              unit="m"
              status={metrics.rmseZ < 0.05 ? 'excellent' : 'good'}
              icon={TrendingUp}
            />
            <MetricCard
              label="Positional"
              value={metrics.positionalAccuracy}
              unit="m"
              status={metrics.positionalAccuracy < 0.055 ? 'excellent' : 'good'}
              icon={Award}
            />
          </div>

          {/* Spider Chart */}
          <div className="glass-panel p-4 rounded-lg">
            <h4 className="text-sm font-medium mb-4">Accuracy Spider Chart</h4>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                />
                <Radar
                  name="Accuracy"
                  dataKey="value"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.3}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* GCP Residuals Table */}
          <div className="glass-panel rounded-lg">
            <div className="p-3 border-b border-border">
              <h4 className="text-sm font-medium">GCP Residuals</h4>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">GCP</TableHead>
                  <TableHead className="text-xs">X (m)</TableHead>
                  <TableHead className="text-xs">Y (m)</TableHead>
                  <TableHead className="text-xs">Z (m)</TableHead>
                  <TableHead className="text-xs">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {residuals.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.name}</TableCell>
                    <TableCell className="font-mono text-xs">{r.residualX.toFixed(3)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.residualY.toFixed(3)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.residualZ.toFixed(3)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-mono',
                          getResidualStatus(r.total) === 'excellent'
                            ? 'border-emerald-500/50 text-emerald-400'
                            : getResidualStatus(r.total) === 'good'
                            ? 'border-cyan-500/50 text-cyan-400'
                            : 'border-amber-500/50 text-amber-400'
                        )}
                      >
                        {r.total.toFixed(3)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <Award className="h-10 w-10 text-emerald-400/50" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Ready for Validation</h3>
              <p className="text-sm text-muted-foreground">
                Run validation to assess accuracy and generate QA report
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
