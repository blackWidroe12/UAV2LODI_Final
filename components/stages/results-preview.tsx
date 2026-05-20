'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Map, 
  Box, 
  SplitSquareVertical,
  Maximize2,
  Download,
  Share2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Eye,
  EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { StageId } from '@/lib/types';

interface ResultsPreviewProps {
  stageId: StageId;
  stageName: string;
  isOpen: boolean;
  onClose: () => void;
  results?: {
    orthophoto?: string;
    dsm?: string;
    dtm?: string;
    pointCloud?: string;
    buildings?: string;
  };
}

type ViewMode = '2d' | '3d' | 'split';

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
}

export function ResultsPreview({ 
  stageId, 
  stageName, 
  isOpen, 
  onClose,
  results 
}: ResultsPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [zoom, setZoom] = useState(100);
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'orthophoto', name: 'Orthophoto', visible: true, opacity: 100 },
    { id: 'dsm', name: 'DSM Elevation', visible: false, opacity: 80 },
    { id: 'dtm', name: 'DTM Terrain', visible: false, opacity: 80 },
    { id: 'buildings', name: 'Building Footprints', visible: true, opacity: 90 },
    { id: 'contours', name: 'Contour Lines', visible: false, opacity: 70 },
  ]);

  const toggleLayer = (id: string) => {
    setLayers(layers.map(l => 
      l.id === id ? { ...l, visible: !l.visible } : l
    ));
  };

  const updateLayerOpacity = (id: string, opacity: number) => {
    setLayers(layers.map(l => 
      l.id === id ? { ...l, opacity } : l
    ));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="absolute inset-4 bg-[#0E1117] rounded-xl border border-[rgba(255,255,255,0.06)] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="shrink-0 h-12 px-4 flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] bg-[#161B22]">
            <div className="flex items-center gap-3">
              <Eye className="w-4 h-4 text-[#00D4FF]" />
              <span className="text-[14px] font-medium text-[#E6EDF3]">
                Results Preview: {stageName}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#21262D]">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 w-7 p-0',
                    viewMode === '2d' && 'bg-[#00D4FF]/20 text-[#00D4FF]'
                  )}
                  onClick={() => setViewMode('2d')}
                >
                  <Map className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 w-7 p-0',
                    viewMode === 'split' && 'bg-[#8B5CF6]/20 text-[#8B5CF6]'
                  )}
                  onClick={() => setViewMode('split')}
                >
                  <SplitSquareVertical className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 w-7 p-0',
                    viewMode === '3d' && 'bg-[#10B981]/20 text-[#10B981]'
                  )}
                  onClick={() => setViewMode('3d')}
                >
                  <Box className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="w-px h-6 bg-[rgba(255,255,255,0.06)]" />

              {/* Zoom controls */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setZoom(Math.max(25, zoom - 25))}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[11px] text-[#8B949E] w-10 text-center tabular-nums">
                  {zoom}%
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setZoom(Math.min(400, zoom + 25))}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setZoom(100)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="w-px h-6 bg-[rgba(255,255,255,0.06)]" />

              {/* Actions */}
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-[12px]">
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-[12px]">
                <Share2 className="h-3.5 w-3.5" />
                Share
              </Button>

              <div className="w-px h-6 bg-[rgba(255,255,255,0.06)]" />

              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Viewport area */}
            <div className="flex-1 relative">
              {viewMode === 'split' ? (
                <div className="absolute inset-0 flex">
                  {/* 2D View */}
                  <div className="flex-1 relative bg-[#0a0f1a] border-r border-[rgba(255,255,255,0.06)]">
                    <div className="absolute top-3 left-3 px-2 py-1 rounded bg-[#21262D] text-[10px] font-medium text-[#8B949E] uppercase tracking-wider">
                      2D Orthophoto
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Map className="w-12 h-12 text-[#00D4FF]/30 mx-auto mb-2" />
                        <p className="text-[13px] text-[#8B949E]">2D Map View</p>
                        <p className="text-[11px] text-[#6B7280]">Orthophoto + Layers</p>
                      </div>
                    </div>
                  </div>
                  {/* 3D View */}
                  <div className="flex-1 relative bg-[#0a0f1a]">
                    <div className="absolute top-3 left-3 px-2 py-1 rounded bg-[#21262D] text-[10px] font-medium text-[#8B949E] uppercase tracking-wider">
                      3D Model
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Box className="w-12 h-12 text-[#10B981]/30 mx-auto mb-2" />
                        <p className="text-[13px] text-[#8B949E]">3D Scene View</p>
                        <p className="text-[11px] text-[#6B7280]">Point Cloud + Buildings</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : viewMode === '2d' ? (
                <div className="absolute inset-0 bg-[#0a0f1a] flex items-center justify-center">
                  <div className="text-center">
                    <Map className="w-16 h-16 text-[#00D4FF]/30 mx-auto mb-3" />
                    <p className="text-[14px] text-[#8B949E]">2D Map View</p>
                    <p className="text-[12px] text-[#6B7280]">Orthophoto with layer overlays</p>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 bg-[#0a0f1a] flex items-center justify-center">
                  <div className="text-center">
                    <Box className="w-16 h-16 text-[#10B981]/30 mx-auto mb-3" />
                    <p className="text-[14px] text-[#8B949E]">3D Scene View</p>
                    <p className="text-[12px] text-[#6B7280]">Interactive 3D model viewer</p>
                  </div>
                </div>
              )}
            </div>

            {/* Layer panel */}
            <div className="w-64 shrink-0 border-l border-[rgba(255,255,255,0.06)] bg-[#161B22] flex flex-col">
              <div className="p-3 border-b border-[rgba(255,255,255,0.06)]">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#00D4FF]" />
                  <span className="text-[13px] font-medium">Layers</span>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {layers.map((layer) => (
                  <div 
                    key={layer.id}
                    className={cn(
                      'p-3 rounded-lg transition-colors',
                      layer.visible ? 'bg-[#21262D]' : 'bg-transparent'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleLayer(layer.id)}
                          className="text-[#8B949E] hover:text-[#E6EDF3] transition-colors"
                        >
                          {layer.visible ? (
                            <Eye className="w-4 h-4" />
                          ) : (
                            <EyeOff className="w-4 h-4" />
                          )}
                        </button>
                        <span className={cn(
                          'text-[12px]',
                          layer.visible ? 'text-[#E6EDF3]' : 'text-[#6B7280]'
                        )}>
                          {layer.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#6B7280] tabular-nums">
                        {layer.opacity}%
                      </span>
                    </div>
                    {layer.visible && (
                      <Slider
                        value={[layer.opacity]}
                        onValueChange={([value]) => updateLayerOpacity(layer.id, value)}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Quick stats */}
              <div className="p-3 border-t border-[rgba(255,255,255,0.06)] space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#6B7280]">Coverage</span>
                  <span className="text-[#E6EDF3]">2.4 km²</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#6B7280]">GSD</span>
                  <span className="text-[#E6EDF3]">2.5 cm/px</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#6B7280]">Buildings</span>
                  <span className="text-[#E6EDF3]">847</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
