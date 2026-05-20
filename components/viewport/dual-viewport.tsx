'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map2D } from './map-2d';
import { Viewport3D } from './viewport-3d';
import { usePipelineStore } from '@/lib/stores';
import { ViewportModeType } from '@/lib/viewport-config';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';
import type { StageId } from '@/lib/types';

interface DualViewportProps {
  className?: string;
  stageId?: StageId;
  mode?: ViewportModeType;
  permittedModes?: ViewportModeType[];
}

export function DualViewport({ 
  className, 
  stageId,
  mode = 'split',
  permittedModes = ['2d', '3d', 'split'],
}: DualViewportProps) {
  const { gcps } = usePipelineStore();
  const [splitPosition, setSplitPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      
      const container = e.currentTarget;
      const rect = container.getBoundingClientRect();
      const newPosition = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPosition(Math.max(20, Math.min(80, newPosition)));
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Determine what to show based on mode
  const show2D = mode === '2d' || mode === 'split';
  const show3D = mode === '3d' || mode === 'split';

  return (
    <div
      className={cn(
        'relative w-full h-full flex bg-[#0E1117]',
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <AnimatePresence mode="sync">
        {/* 2D Map */}
        {show2D && (
          <motion.div
            key="map-2d"
            initial={{ opacity: 0, width: 0 }}
            animate={{ 
              opacity: 1, 
              width: mode === 'split' ? `${splitPosition}%` : '100%' 
            }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative h-full overflow-hidden"
          >
            <Map2D gcps={gcps} />
            
            {/* 2D Label */}
            <div className="absolute top-3 left-3 px-2 py-1 rounded bg-[#161B22]/90 backdrop-blur-sm border border-[rgba(255,255,255,0.06)]">
              <span className="text-[10px] font-medium text-[#00D4FF] uppercase tracking-wider">
                2D Map
              </span>
            </div>
          </motion.div>
        )}

        {/* Split handle */}
        {mode === 'split' && (
          <div
            className={cn(
              'absolute top-0 bottom-0 w-3 z-30 cursor-col-resize flex items-center justify-center group',
              'hover:bg-[#00D4FF]/5 transition-colors',
              isDragging && 'bg-[#00D4FF]/10'
            )}
            style={{ left: `calc(${splitPosition}% - 6px)` }}
            onMouseDown={handleMouseDown}
          >
            <div className={cn(
              'w-1 h-12 rounded-full transition-all',
              isDragging 
                ? 'bg-[#00D4FF] shadow-[0_0_8px_rgba(0,212,255,0.5)]' 
                : 'bg-[#6B7280] group-hover:bg-[#8B949E]'
            )} />
          </div>
        )}

        {/* 3D Viewport */}
        {show3D && (
          <motion.div
            key="viewport-3d"
            initial={{ opacity: 0, width: 0 }}
            animate={{ 
              opacity: 1, 
              width: mode === 'split' ? `${100 - splitPosition}%` : '100%' 
            }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative h-full overflow-hidden"
          >
            <Viewport3D />
            
            {/* 3D Label */}
            <div className="absolute top-3 left-3 px-2 py-1 rounded bg-[#161B22]/90 backdrop-blur-sm border border-[rgba(255,255,255,0.06)]">
              <span className="text-[10px] font-medium text-[#10B981] uppercase tracking-wider">
                3D Scene
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sync indicator for split mode */}
      {mode === 'split' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
          <div className="px-3 py-1.5 rounded-full bg-[#161B22]/90 backdrop-blur-sm border border-[rgba(255,255,255,0.06)] flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span className="text-[10px] font-mono text-[#8B949E] uppercase tracking-wider">
              Viewports Synced
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
