'use client';

import { usePipelineStore } from '@/lib/stores';
import { STAGE_VIEWPORT_CONFIG, ViewportModeType } from '@/lib/viewport-config';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Map, Box, SplitSquareVertical, ChevronRight } from 'lucide-react';
import type { StageId } from '@/lib/types';

interface ViewportHeaderProps {
  stageId: StageId;
  currentMode: ViewportModeType;
  onClose: () => void;
}

export function ViewportHeader({ stageId, currentMode, onClose }: ViewportHeaderProps) {
  const { setActiveViewportMode } = usePipelineStore();
  const config = STAGE_VIEWPORT_CONFIG[stageId];
  
  // Determine the title based on current mode
  const getTitle = () => {
    switch (currentMode) {
      case '2d':
        return '2D Map';
      case '3d':
        return '3D View';
      case 'split':
        return '2D / 3D Split';
      default:
        return 'Viewport';
    }
  };

  // Check if mode toggle should be shown (only for stages with multiple modes)
  const showModeToggle = config.modes.length > 1;

  return (
    <div className="h-8 px-3 flex items-center justify-between bg-[#161B22] border-b border-[rgba(255,255,255,0.06)] shrink-0">
      {/* Left: Title */}
      <div className="flex items-center gap-2">
        {currentMode === '2d' && <Map className="w-3.5 h-3.5 text-[#00D4FF]" />}
        {currentMode === '3d' && <Box className="w-3.5 h-3.5 text-[#10B981]" />}
        {currentMode === 'split' && <SplitSquareVertical className="w-3.5 h-3.5 text-[#8B5CF6]" />}
        <span className="text-[12px] font-medium text-[#E6EDF3]">
          {getTitle()}
        </span>
      </div>

      {/* Center: Mode toggle (only for DSM/DTM stage) */}
      {showModeToggle && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 p-0.5 rounded-md bg-[#21262D]">
          <TooltipProvider>
            {config.modes.includes('2d') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-6 px-2 text-[11px]',
                      currentMode === '2d' 
                        ? 'bg-[#00D4FF]/20 text-[#00D4FF]' 
                        : 'text-[#8B949E] hover:text-[#E6EDF3]'
                    )}
                    onClick={() => setActiveViewportMode('2d')}
                  >
                    2D
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>2D Map Only</p>
                </TooltipContent>
              </Tooltip>
            )}

            {config.modes.includes('split') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-6 px-2 text-[11px]',
                      currentMode === 'split' 
                        ? 'bg-[#8B5CF6]/20 text-[#8B5CF6]' 
                        : 'text-[#8B949E] hover:text-[#E6EDF3]'
                    )}
                    onClick={() => setActiveViewportMode('split')}
                  >
                    Split
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Split 2D / 3D View</p>
                </TooltipContent>
              </Tooltip>
            )}

            {config.modes.includes('3d') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-6 px-2 text-[11px]',
                      currentMode === '3d' 
                        ? 'bg-[#10B981]/20 text-[#10B981]' 
                        : 'text-[#8B949E] hover:text-[#E6EDF3]'
                    )}
                    onClick={() => setActiveViewportMode('3d')}
                  >
                    3D
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>3D View Only</p>
                </TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      )}

      {/* Right: Close button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#21262D]"
              onClick={onClose}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Close Viewport</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
