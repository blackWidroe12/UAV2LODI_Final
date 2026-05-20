'use client';

import { useState, useEffect } from 'react';
import { Globe, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePipelineStore } from '@/lib/stores';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CoordinateSystem } from '@/lib/types';

const COORDINATE_SYSTEMS: { id: CoordinateSystem; label: string; epsg: string }[] = [
  { id: 'wgs84', label: 'WGS 84', epsg: 'EPSG:4326' },
  { id: 'utm36s', label: 'UTM 36S', epsg: 'EPSG:32736' },
  { id: 'lo33', label: 'Lo 33', epsg: 'Harare' },
];

// Simple coordinate transformation (for display purposes)
function transformCoordinates(
  lat: number,
  lng: number,
  to: CoordinateSystem
): string {
  if (to === 'wgs84') {
    return `${lat.toFixed(6)}°, ${lng.toFixed(6)}°`;
  }
  
  if (to === 'utm36s') {
    const x = (lng - 33) * 111320 * Math.cos((lat * Math.PI) / 180) + 500000;
    const y = lat * 110540 + 10000000;
    return `${x.toFixed(1)} E, ${y.toFixed(1)} N`;
  }
  
  if (to === 'lo33') {
    const x = (lng - 33) * 111320 * Math.cos((lat * Math.PI) / 180);
    const y = lat * 110540;
    return `Y: ${y.toFixed(1)}, X: ${x.toFixed(1)}`;
  }
  
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function CoordinateBar() {
  const { coordinateSystem, setCoordinateSystem, mapViewState } = usePipelineStore();
  const [cursorPosition, setCursorPosition] = useState<{ lat: number; lng: number } | null>(null);
  
  useEffect(() => {
    const handleCursorMove = (event: CustomEvent<{ lat: number; lng: number }>) => {
      setCursorPosition(event.detail);
    };
    
    window.addEventListener('map-cursor-move' as any, handleCursorMove);
    return () => window.removeEventListener('map-cursor-move' as any, handleCursorMove);
  }, []);

  const currentSystem = COORDINATE_SYSTEMS.find((s) => s.id === coordinateSystem);
  const displayCoords = cursorPosition
    ? transformCoordinates(cursorPosition.lat, cursorPosition.lng, coordinateSystem)
    : transformCoordinates(mapViewState.latitude, mapViewState.longitude, coordinateSystem);

  return (
    <div className="h-7 border-t border-border bg-[#0E1117] flex items-center justify-between px-3 text-[11px] overflow-hidden">
      {/* Left: Cursor coordinates */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-mono text-muted-foreground truncate">
          {displayCoords}
        </span>
        
        {/* Coordinate System Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#21262D] transition-colors text-muted-foreground hover:text-foreground shrink-0">
              <Globe className="w-3 h-3" />
              <span>{currentSystem?.label}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="glass min-w-[140px]">
            {COORDINATE_SYSTEMS.map((system) => (
              <DropdownMenuItem
                key={system.id}
                onClick={() => setCoordinateSystem(system.id)}
                className={cn(
                  'gap-2 text-[11px]',
                  system.id === coordinateSystem && 'text-[#00D4FF]'
                )}
              >
                <span className="font-medium">{system.label}</span>
                <span className="text-muted-foreground text-[10px]">({system.epsg})</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Right: Zoom level */}
      <div className="flex items-center gap-3 text-muted-foreground shrink-0">
        <div className="flex items-center gap-1">
          <Navigation className="w-3 h-3" />
          <span className="font-mono">Z{mapViewState.zoom.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
