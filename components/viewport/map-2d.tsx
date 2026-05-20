'use client';

import { useRef, useCallback, useState, useMemo } from 'react';
import { Map, NavigationControl, ScaleControl, Source, Layer, type MapRef, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { usePipelineStore } from '@/lib/stores';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MapPin, Layers, Crosshair, Download } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GCPMarker } from '@/lib/types';
import maplibregl from 'maplibre-gl';

interface Map2DProps {
  className?: string;
  gcps?: GCPMarker[];
  onViewStateChange?: (viewState: { longitude: number; latitude: number; zoom: number }) => void;
  onMarkerClick?: (markerId: string) => void;
}

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster' as const,
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const SATELLITE_STYLE = {
  version: 8 as const,
  sources: {
    esri: {
      type: 'raster' as const,
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '&copy; Esri',
    },
  },
  layers: [
    {
      id: 'esri-tiles',
      type: 'raster' as const,
      source: 'esri',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

type MapStyle = 'dark' | 'osm' | 'satellite';

function exportGCPsAsCSV(gcps: GCPMarker[]): void {
  const headers = ['name', 'longitude', 'latitude', 'elevation', 'accuracy_h', 'accuracy_v', 'description'];
  const rows = gcps.map(g => [
    g.name, g.longitude, g.latitude, g.elevation,
    g.accuracyH ?? '', g.accuracyV ?? '', g.description ?? ''
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gcps_export_project_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Map2D({ 
  className, 
  gcps = [], 
  onViewStateChange,
  onMarkerClick 
}: Map2DProps) {
  const mapRef = useRef<MapRef>(null);
  const { mapViewState, setMapViewState } = usePipelineStore();
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>('dark');
  const [showGCPs, setShowGCPs] = useState(true);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; feature: any } | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');

  const handleMove = useCallback(
    (evt: { viewState: { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number } }) => {
      const { longitude, latitude, zoom, pitch, bearing } = evt.viewState;
      setMapViewState({ longitude, latitude, zoom, pitch, bearing });
      onViewStateChange?.({ longitude, latitude, zoom });
    },
    [setMapViewState, onViewStateChange]
  );

  const fitToGCPs = useCallback(() => {
    if (gcps.length === 0 || !mapRef.current) return;
    const map = mapRef.current.getMap();
    const bounds = new maplibregl.LngLatBounds();
    gcps.forEach(gcp => bounds.extend([gcp.longitude, gcp.latitude]));
    map.fitBounds(bounds, { padding: 80, maxZoom: 18, duration: 800 });
  }, [gcps]);

  const getStyle = () => {
    switch (mapStyle) {
      case 'osm': return OSM_STYLE;
      case 'satellite': return SATELLITE_STYLE;
      default: return DARK_STYLE;
    }
  };

  const geojson = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: gcps.map(gcp => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [gcp.longitude, gcp.latitude],
        },
        properties: {
          id: gcp.id,
          name: gcp.name,
          longitude: gcp.longitude,
          latitude: gcp.latitude,
          elevation: gcp.elevation,
          accuracyH: gcp.accuracyH,
          accuracyV: gcp.accuracyV,
          isVerified: gcp.isVerified,
        },
      })),
    };
  }, [gcps]);

  const onMouseEnter = useCallback((e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = 'pointer';
  }, []);

  const onMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = '';
    setHoverInfo(null);
  }, []);

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      setHoverInfo({
        x: e.point.x,
        y: e.point.y,
        feature: feature.properties
      });
    }
  }, []);

  const onClick = useCallback((e: MapLayerMouseEvent) => {
    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      setSelectedId(feature.properties?.id);
      if (onMarkerClick) onMarkerClick(feature.properties?.id);
    } else {
      setSelectedId('');
    }
  }, [onMarkerClick]);

  return (
    <div className={cn('relative w-full h-full bg-[#0E1117]', className)}>
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0E1117]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#00D4FF] border-t-transparent rounded-full animate-spin" />
            <span className="text-[12px] text-[#8B949E] font-mono">Loading map tiles...</span>
          </div>
        </div>
      )}

      <Map
        ref={mapRef}
        {...mapViewState}
        onMove={handleMove}
        onLoad={() => setIsLoaded(true)}
        style={{ width: '100%', height: '100%' }}
        mapStyle={getStyle()}
        attributionControl={false}
        reuseMaps
        interactiveLayerIds={showGCPs ? ['gcp-points', 'gcp-labels'] : []}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onMouseMove={onMouseMove}
        onClick={onClick}
      >
        <NavigationControl position="top-right" showCompass showZoom visualizePitch />
        <ScaleControl position="bottom-left" maxWidth={100} unit="metric" />
        
        {showGCPs && (
          <Source id="gcps" type="geojson" data={geojson}>
            <Layer
              id="gcp-points"
              type="circle"
              paint={{
                'circle-radius': 7,
                'circle-color': '#0E1117',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#00D4FF',
                'circle-opacity': 0.9,
              }}
            />
            <Layer
              id="gcp-points-selected"
              type="circle"
              filter={['==', ['get', 'id'], selectedId]}
              paint={{
                'circle-radius': 10,
                'circle-color': '#00D4FF',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#FFFFFF',
              }}
            />
            <Layer
              id="gcp-labels"
              type="symbol"
              layout={{
                'text-field': ['get', 'name'],
                'text-size': 11,
                'text-offset': [0, 1.5],
                'text-anchor': 'top',
              }}
              paint={{
                'text-color': '#FFFFFF',
                'text-halo-color': '#0E1117',
                'text-halo-width': 2,
              }}
            />
          </Source>
        )}
      </Map>

      {hoverInfo && (
        <div 
          className="absolute z-20 pointer-events-none bg-[#161B22] border border-[rgba(255,255,255,0.1)] p-2 rounded shadow-xl text-[11px]"
          style={{ left: hoverInfo.x + 10, top: hoverInfo.y + 10 }}
        >
          <div className="font-medium text-[#E6EDF3] mb-1">{hoverInfo.feature.name}</div>
          <div className="text-[#8B949E]">
            Lon: {Number(hoverInfo.feature.longitude).toFixed(6)}<br/>
            Lat: {Number(hoverInfo.feature.latitude).toFixed(6)}<br/>
            Elev: {Number(hoverInfo.feature.elevation).toFixed(2)}m
            {hoverInfo.feature.accuracyH && <><br/>Acc (H): {hoverInfo.feature.accuracyH}m</>}
            {hoverInfo.feature.accuracyV && <><br/>Acc (V): {hoverInfo.feature.accuracyV}m</>}
          </div>
        </div>
      )}

      {/* Map controls */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-2">
        <TooltipProvider>
          {/* Layer toggle */}
          <div className="flex flex-col gap-1 p-1 rounded-lg bg-[#161B22]/90 backdrop-blur-sm border border-[rgba(255,255,255,0.06)]">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-8 w-8 p-0', mapStyle === 'dark' && 'bg-[#00D4FF]/20 text-[#00D4FF]')}
                  onClick={() => setMapStyle('dark')}
                >
                  <Layers className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Dark</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-8 w-8 p-0', mapStyle === 'osm' && 'bg-[#00D4FF]/20 text-[#00D4FF]')}
                  onClick={() => setMapStyle('osm')}
                >
                  <span className="text-[10px] font-bold">OSM</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">OpenStreetMap</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-8 w-8 p-0', mapStyle === 'satellite' && 'bg-[#00D4FF]/20 text-[#00D4FF]')}
                  onClick={() => setMapStyle('satellite')}
                >
                  <span className="text-[10px] font-bold">SAT</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Satellite</TooltipContent>
            </Tooltip>
          </div>

          {/* GCP controls */}
          {gcps.length > 0 && (
            <div className="flex flex-col gap-1 p-1 rounded-lg bg-[#161B22]/90 backdrop-blur-sm border border-[rgba(255,255,255,0.06)]">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-8 w-8 p-0', showGCPs && 'bg-[#10B981]/20 text-[#10B981]')}
                    onClick={() => setShowGCPs(!showGCPs)}
                  >
                    <MapPin className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">{showGCPs ? 'Hide' : 'Show'} GCPs</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={fitToGCPs}>
                    <Crosshair className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Fit to GCPs</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => exportGCPsAsCSV(gcps)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Export GCPs</TooltipContent>
              </Tooltip>
            </div>
          )}
        </TooltipProvider>
      </div>

      {gcps.length > 0 && showGCPs && (
        <div className="absolute top-3 right-14 z-10">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#161B22]/90 backdrop-blur-sm border border-[rgba(255,255,255,0.06)]">
            <MapPin className="w-3.5 h-3.5 text-[#10B981]" />
            <span className="text-[11px] font-medium text-[#E6EDF3]">
              {gcps.filter(m => m.isVerified).length}/{gcps.length} GCPs
            </span>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 left-3 z-10 ml-24">
        <div className="px-2 py-1 rounded bg-[#161B22]/90 backdrop-blur-sm border border-[rgba(255,255,255,0.06)]">
          <span className="text-[10px] font-mono text-[#8B949E]">
            {mapViewState.latitude.toFixed(6)}, {mapViewState.longitude.toFixed(6)} | Z{mapViewState.zoom.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}
