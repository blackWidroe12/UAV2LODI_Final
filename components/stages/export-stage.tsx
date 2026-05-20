'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePipelineStore } from '@/lib/stores';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Download,
  Cloud,
  FileJson,
  FileImage,
  Box,
  Database,
  Copy,
  Check,
  ExternalLink,
  Package,
} from 'lucide-react';

type ExportFormat = 'cityjson' | 'geopackage' | 'obj' | 'geojson' | 'las' | 'tiff';

interface ExportOption {
  id: ExportFormat;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  size: string;
  enabled: boolean;
}

const exportFormats: ExportOption[] = [
  {
    id: 'cityjson',
    name: 'CityJSON',
    description: 'LoD1 building models for 3D city integration',
    icon: Box,
    size: '12.4 MB',
    enabled: true,
  },
  {
    id: 'geopackage',
    name: 'GeoPackage',
    description: 'OGC-compliant spatial database',
    icon: Database,
    size: '45.2 MB',
    enabled: true,
  },
  {
    id: 'geojson',
    name: 'GeoJSON',
    description: 'Building footprints and vectors',
    icon: FileJson,
    size: '8.7 MB',
    enabled: true,
  },
  {
    id: 'obj',
    name: 'OBJ + MTL',
    description: '3D mesh with textures',
    icon: Package,
    size: '156.8 MB',
    enabled: false,
  },
  {
    id: 'las',
    name: 'LAS/LAZ',
    description: 'Classified point cloud',
    icon: Cloud,
    size: '234.5 MB',
    enabled: false,
  },
  {
    id: 'tiff',
    name: 'GeoTIFF',
    description: 'DSM/DTM raster exports',
    icon: FileImage,
    size: '89.3 MB',
    enabled: false,
  },
];

function ExportFormatCard({
  format,
  selected,
  onToggle,
}: {
  format: ExportOption;
  selected: boolean;
  onToggle: () => void;
}) {
  const Icon = format.icon;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'glass-panel p-4 rounded-lg cursor-pointer transition-all',
        selected
          ? 'ring-2 ring-cyan-500/50 bg-cyan-500/5'
          : 'hover:bg-muted/50'
      )}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'p-2 rounded-lg',
              selected ? 'bg-cyan-500/20 text-cyan-400' : 'bg-muted text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-sm">{format.name}</p>
            <p className="text-xs text-muted-foreground">{format.description}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className="text-[10px] font-mono">
            {format.size}
          </Badge>
          <div
            className={cn(
              'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors',
              selected
                ? 'border-cyan-500 bg-cyan-500'
                : 'border-muted-foreground'
            )}
          >
            {selected && <Check className="h-2.5 w-2.5 text-background" />}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function ExportStage() {
  const [selectedFormats, setSelectedFormats] = useState<ExportFormat[]>(['cityjson', 'geopackage', 'geojson']);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cloudUrl, setCloudUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [includeTextures, setIncludeTextures] = useState(true);
  const [generateCloudLink, setGenerateCloudLink] = useState(true);

  const { updateStage, updateStageProgress, addLog } = usePipelineStore();

  const toggleFormat = (format: ExportFormat) => {
    setSelectedFormats((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format]
    );
  };

  const totalSize = exportFormats
    .filter((f) => selectedFormats.includes(f.id))
    .reduce((sum, f) => sum + parseFloat(f.size), 0)
    .toFixed(1);

  const runExport = async () => {
    setIsExporting(true);
    setCloudUrl(null);
    updateStage('export', { status: 'processing' });
    addLog({
      level: 'info',
      message: `Starting export: ${selectedFormats.join(', ')}`,
      source: 'export',
    });

    try {
      // Call real export API endpoint
      const projectId = 'current-project'; // TODO: Get from route/context
      const response = await fetch(`/api/projects/${projectId}/stages/export/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formats: selectedFormats,
          generateCloudLink,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Export failed');
      }

      const data = await response.json();
      
      if (data.cloudUrl) {
        setCloudUrl(data.cloudUrl);
      }
      
      updateStage('export', { status: 'completed', progress: 100 });
      addLog({
        level: 'success',
        message: `Export complete. ${selectedFormats.length} formats generated (${totalSize} MB)`,
        source: 'export',
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addLog({
        level: 'error',
        message: `Export failed: ${errorMsg}`,
        source: 'export',
      });
      updateStage('export', { status: 'ready', progress: 0 });
    } finally {
      setIsExporting(false);
    }
  };

  const copyToClipboard = () => {
    if (cloudUrl) {
      navigator.clipboard.writeText(cloudUrl);
      setCopied(true);
      // Use a short timer for UI feedback only, not for simulation
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold font-display">Deployment & Export</h2>
          <p className="text-sm text-muted-foreground">
            Generate deliverables and shareable cloud links
          </p>
        </div>
        <Badge variant="outline" className="text-xs font-mono">
          {selectedFormats.length} formats / {totalSize} MB
        </Badge>
      </div>

      {/* Progress */}
      {isExporting && (
        <div className="space-y-2">
          <Progress value={progress} indicatorClassName="bg-cyan-500" />
          <p className="text-xs text-muted-foreground font-mono">
            Generating exports... {progress}%
          </p>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Format selection */}
        <div className="lg:col-span-2 space-y-3">
          <h4 className="text-sm font-medium">Select Export Formats</h4>
          <div className="grid grid-cols-2 gap-3">
            {exportFormats.map((format) => (
              <ExportFormatCard
                key={format.id}
                format={format}
                selected={selectedFormats.includes(format.id)}
                onToggle={() => toggleFormat(format.id)}
              />
            ))}
          </div>
        </div>

        {/* Options and actions */}
        <div className="space-y-4">
          {/* Options */}
          <div className="glass-panel p-4 rounded-lg space-y-4">
            <h4 className="text-sm font-medium">Export Options</h4>

            <div className="flex items-center justify-between">
              <Label htmlFor="textures" className="text-sm">
                Include Textures
              </Label>
              <Switch
                id="textures"
                checked={includeTextures}
                onCheckedChange={setIncludeTextures}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="cloud" className="text-sm">
                Generate Cloud Link
              </Label>
              <Switch
                id="cloud"
                checked={generateCloudLink}
                onCheckedChange={setGenerateCloudLink}
              />
            </div>
          </div>

          {/* Cloud link */}
          <AnimatePresence>
            {cloudUrl && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-panel p-4 rounded-lg border border-emerald-500/30"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Cloud className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-medium">Cloud Share Link</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={cloudUrl}
                    readOnly
                    className="font-mono text-xs h-8"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={copyToClipboard}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => window.open(cloudUrl, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action button */}
          <Button
            onClick={runExport}
            disabled={isExporting || selectedFormats.length === 0}
            className="w-full bg-cyan-500 hover:bg-cyan-600 text-background"
          >
            {isExporting ? (
              'Exporting...'
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export ({selectedFormats.length} formats)
              </>
            )}
          </Button>

          {/* Download buttons */}
          {cloudUrl && (
            <div className="space-y-2">
              {selectedFormats.map((formatId) => {
                const format = exportFormats.find((f) => f.id === formatId);
                if (!format) return null;
                const Icon = format.icon;
                return (
                  <Button
                    key={formatId}
                    variant="outline"
                    className="w-full justify-between"
                    size="sm"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {format.name}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {format.size}
                    </span>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
