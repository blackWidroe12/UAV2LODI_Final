'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePipelineStore, useProjectStore, useAuthStore } from '@/lib/stores';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StageLayout, StageSection } from './stage-layout';
import { ResultsPreview } from './results-preview';
import { GCPImportWizard } from './gcp-import-wizard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  MapPin,
  Plus,
  Trash2,
  CheckCircle,
  Image as ImageIcon,
  Target,
  Upload,
  Download,
  Save,
  Grid3X3,
  List,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  ZoomIn,
  FolderOpen,
} from 'lucide-react';

interface GCPMarker {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  elevation: number;
  imageId?: string;
  isVerified: boolean;
}

interface ImageFile {
  id: string;
  name: string;
  thumbnail: string;
  hasGPS: boolean;
  isSelected: boolean;
}

function GCPCard({ gcp, onVerify, onDelete }: {
  gcp: GCPMarker;
  onVerify: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        'p-3 rounded-lg bg-[#21262D] transition-all',
        gcp.isVerified
          ? 'border-l-2 border-l-[#10B981]'
          : 'border-l-2 border-l-[#F59E0B]'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'p-1.5 rounded-md',
              gcp.isVerified ? 'bg-[#10B981]/10' : 'bg-[#F59E0B]/10'
            )}
          >
            <MapPin
              className={cn(
                'h-4 w-4',
                gcp.isVerified ? 'text-[#10B981]' : 'text-[#F59E0B]'
              )}
            />
          </div>
          <div>
            <p className="font-mono font-medium text-[13px] text-[#E6EDF3]">{gcp.name}</p>
            <p className="text-[11px] text-[#8B949E]">
              {gcp.longitude.toFixed(6)}, {gcp.latitude.toFixed(6)}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] border',
            gcp.isVerified
              ? 'border-[#10B981]/50 text-[#10B981] bg-[#10B981]/5'
              : 'border-[#F59E0B]/50 text-[#F59E0B] bg-[#F59E0B]/5'
          )}
        >
          {gcp.isVerified ? 'Verified' : 'Pending'}
        </Badge>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <span className="text-[#6B7280]">Lon</span>
          <p className="font-mono text-[#C9D1D9]">{gcp.longitude.toFixed(4)}</p>
        </div>
        <div>
          <span className="text-[#6B7280]">Lat</span>
          <p className="font-mono text-[#C9D1D9]">{gcp.latitude.toFixed(4)}</p>
        </div>
        <div>
          <span className="text-[#6B7280]">Elev</span>
          <p className="font-mono text-[#C9D1D9]">{gcp.elevation.toFixed(1)}m</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {!gcp.isVerified && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-[11px] border-[rgba(255,255,255,0.06)] hover:bg-[#00D4FF]/10 hover:text-[#00D4FF] hover:border-[#00D4FF]/50"
            onClick={() => onVerify(gcp.id)}
          >
            <Target className="h-3 w-3 mr-1" />
            Mark in Image
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
          onClick={() => onDelete(gcp.id)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </motion.div>
  );
}

function AddGCPDialog({ onAdd }: { onAdd: (gcp: Omit<GCPMarker, 'id' | 'isVerified'>) => void }) {
  const [name, setName] = useState('');
  const [longitude, setLongitude] = useState('');
  const [latitude, setLatitude] = useState('');
  const [elevation, setElevation] = useState('');
  const [open, setOpen] = useState(false);

  const handleSubmit = () => {
    if (name && longitude && latitude && elevation) {
      onAdd({
        name,
        longitude: parseFloat(longitude),
        latitude: parseFloat(latitude),
        elevation: parseFloat(elevation),
      });
      setName('');
      setLongitude('');
      setLatitude('');
      setElevation('');
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className="w-full border-dashed border-[rgba(255,255,255,0.1)] hover:border-[#00D4FF]/50 hover:bg-[#00D4FF]/5"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Ground Control Point
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#161B22] border-[rgba(255,255,255,0.06)]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Add Ground Control Point</DialogTitle>
          <DialogDescription className="text-[13px] text-[#8B949E]">
            Enter the surveyed coordinates for this GCP marker
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label className="text-[12px]">GCP Name</Label>
            <Input
              placeholder="GCP_004"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="font-mono h-9 bg-[#0E1117] border-[rgba(255,255,255,0.06)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[12px]">Longitude</Label>
              <Input
                type="number"
                step="0.000001"
                placeholder="29.8587"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="font-mono h-9 bg-[#0E1117] border-[rgba(255,255,255,0.06)]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[12px]">Latitude</Label>
              <Input
                type="number"
                step="0.000001"
                placeholder="-17.8292"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="font-mono h-9 bg-[#0E1117] border-[rgba(255,255,255,0.06)]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[12px]">Elevation (m)</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="1234.5"
              value={elevation}
              onChange={(e) => setElevation(e.target.value)}
              className="font-mono h-9 bg-[#0E1117] border-[rgba(255,255,255,0.06)]"
            />
          </div>
          <Button 
            onClick={handleSubmit} 
            className="w-full h-9 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-[#0E1117] text-[13px]"
          >
            <Save className="h-4 w-4 mr-2" />
            Save GCP
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImageGrid({ 
  images, 
  selectedImage, 
  onSelectImage 
}: { 
  images: ImageFile[]; 
  selectedImage: string | null;
  onSelectImage: (id: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredImages = images.filter(img => 
    img.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="shrink-0 p-3 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <Input
            placeholder="Search images..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 text-[12px] bg-[#0E1117] border-[rgba(255,255,255,0.06)]"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#6B7280]">
            {filteredImages.length} images
          </span>
          <div className="flex items-center gap-1 p-0.5 rounded bg-[#21262D]">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 w-6 p-0',
                viewMode === 'grid' && 'bg-[#00D4FF]/20 text-[#00D4FF]'
              )}
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 w-6 p-0',
                viewMode === 'list' && 'bg-[#00D4FF]/20 text-[#00D4FF]'
              )}
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Image Grid - 8 columns for professional grid layout */}
      <ScrollArea className="flex-1">
        <div className={cn(
          'p-3',
          viewMode === 'grid' 
            ? 'grid grid-cols-8 gap-1.5' 
            : 'space-y-1'
        )}>
          {filteredImages.map((image, index) => (
            <motion.button
              key={image.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.01 }}
              onClick={() => onSelectImage(image.id)}
              className={cn(
                'group relative rounded-md overflow-hidden transition-all',
                viewMode === 'grid' 
                  ? 'aspect-[4/3]' 
                  : 'w-full h-12 flex items-center gap-3 px-3 rounded-md hover:bg-[#21262D]',
                selectedImage === image.id 
                  ? 'ring-2 ring-[#00D4FF] ring-offset-1 ring-offset-[#0E1117]'
                  : 'hover:ring-1 hover:ring-[rgba(255,255,255,0.1)]'
              )}
            >
              {viewMode === 'grid' ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.thumbnail}
                    alt={image.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  
                  {/* GPS indicator */}
                  <div className={cn(
                    'absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center',
                    image.hasGPS ? 'bg-[#10B981]' : 'bg-[#EF4444]'
                  )}>
                    <MapPin className="w-2.5 h-2.5 text-white" />
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    <ZoomIn className="w-5 h-5 text-white" />
                    <span className="text-[9px] text-white font-mono truncate px-2 max-w-full">
                      {image.name}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.thumbnail}
                      alt={image.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <span className="flex-1 text-left text-[12px] font-mono text-[#C9D1D9] truncate">
                    {image.name}
                  </span>
                  {image.hasGPS ? (
                    <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0" />
                  )}
                </>
              )}
            </motion.button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export function IntakeStage() {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const { 
    stages, 
    updateStage, 
    unlockNextStage, 
    addLog,
    gcps,
    setGcps,
    addGCP,
    updateGCP,
    removeGCP,
    droneImages,
    setDroneImages,
  } = usePipelineStore();
  const { activeProject } = useProjectStore();
  const { token } = useAuthStore();
  const [stageError, setStageError] = useState<string | null>(null);

  // Automatically load images from project directory when component mounts or project changes
  useEffect(() => {
    const loadImagesFromProjectDirectory = async () => {
      if (!activeProject?.id) {
        console.log('[intake] No active project');
        return;
      }

      if (!activeProject?.directoryPath) {
        const msg = 'Project directory not configured. Please create a new project with an image directory.';
        addLog({
          level: 'error',
          message: msg,
          source: 'intake',
        });
        setStageError(msg);
        return;
      }

      setIsLoadingImages(true);
      setStageError(null);

      try {
        console.log('[intake] Loading images from project directory:', activeProject.directoryPath);

        // Call API to list images from the project's stored directory
        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'list-images',
            projectId: activeProject.id,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to load images: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error?.message || 'Failed to load images');
        }

        const images = result.data.images || [];
        console.log('[intake] Loaded images:', images.length);

        // Convert file names to DroneImage objects for pipeline store
        const droneImageObjects = images.map((fileName: string, idx: number) => ({
          id: `img-${idx}`,
          name: fileName,
          file: undefined,
          thumbnailUrl: '',
          size: 0,
          sizeFormatted: '',
          extension: fileName.split('.').pop()?.toUpperCase() || '',
          hasGPS: true, // Assume drone images have GPS
          lastModified: new Date(),
        }));

        // Update pipeline store with images and folder name
        setDroneImages(droneImageObjects, activeProject.directoryPath);

        addLog({
          level: 'success',
          message: `Loaded ${images.length} images from project directory`,
          source: 'intake',
        });
      } catch (err: any) {
        console.error('[intake] Error loading images:', err);
        const errorMsg = err.message || 'Failed to load images';
        setStageError(errorMsg);
        addLog({
          level: 'error',
          message: `Failed to load images: ${errorMsg}`,
          source: 'intake',
        });
      } finally {
        setIsLoadingImages(false);
      }
    };

    loadImagesFromProjectDirectory();
  }, [activeProject?.id, activeProject?.directoryPath, token, addLog, setDroneImages]);

  const stage = stages.find(s => s.id === 'intake');
  const verifiedCount = gcps.filter((g) => g.isVerified).length;
  const progress = Math.round((verifiedCount / Math.max(gcps.length, 1)) * 100);

  // Convert droneImages to ImageFile format for grid display
  const displayImages: ImageFile[] = droneImages.map(img => ({
    id: img.id,
    name: img.name,
    thumbnail: img.thumbnailUrl,
    hasGPS: img.hasGPS,
    isSelected: selectedImageId === img.id,
  }));

  const handleAddGCP = (newGcp: Omit<GCPMarker, 'id' | 'isVerified'>) => {
    const gcp: GCPMarker = {
      ...newGcp,
      id: `gcp-${Date.now()}`,
      isVerified: false,
    };
    addGCP(gcp);
    addLog({
      level: 'info',
      message: `Added GCP: ${gcp.name} at (${gcp.longitude.toFixed(4)}, ${gcp.latitude.toFixed(4)})`,
      source: 'intake',
    });
  };

  const handleVerify = (id: string) => {
    const gcp = gcps.find((g) => g.id === id);
    updateGCP(id, { isVerified: true });
    addLog({
      level: 'success',
      message: `GCP ${gcp?.name} verified in imagery`,
      source: 'intake',
    });
  };

  const handleDelete = (id: string) => {
    const gcp = gcps.find((g) => g.id === id);
    removeGCP(id);
    addLog({
      level: 'warn',
      message: `Removed GCP: ${gcp?.name}`,
      source: 'intake',
    });
  };



  // CSV Export handler
  const handleExportCSV = () => {
    const header = 'name,longitude,latitude,elevation,verified\n';
    const rows = gcps.map(g => 
      `${g.name},${g.longitude},${g.latitude},${g.elevation},${g.isVerified}`
    ).join('\n');
    
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gcp_export.csv';
    a.click();
    URL.revokeObjectURL(url);
    
    addLog({
      level: 'info',
      message: `Exported ${gcps.length} GCPs to CSV`,
      source: 'intake',
    });
  };

  const handleRun = async () => {
    setStageError(null);

    if (!activeProject?.id) {
      const msg = 'No active project found. Please open a project first.';
      addLog({ level: 'error', message: msg, source: 'intake' });
      setStageError(msg);
      return;
    }

    if (gcps.length === 0) {
      addLog({
        level: 'error',
        message: 'No GCP files loaded. Import or add ground control points before proceeding.',
        source: 'intake',
      });
      return;
    }

    if (verifiedCount < 3) {
      addLog({
        level: 'warn',
        message: `Only ${verifiedCount} GCPs verified. At least 3 recommended for accurate processing.`,
        source: 'intake',
      });
    }

    setIsRunning(true);
    updateStage('intake', { status: 'processing', progress: 0 });
    
    try {
      const response = await fetch(`/api/projects/${activeProject.id}/stages/intake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          gcpPoints: gcps,
          imageCount: droneImages.length,
          verifiedGcpCount: verifiedCount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Stage failed with status ${response.status}`);
      }

      updateStage('intake', { status: 'completed', progress: 100 });
      unlockNextStage('intake');
      addLog({
        level: 'success',
        message: `Intake complete. ${verifiedCount} GCPs verified, ${droneImages.length} images validated.`,
        source: 'intake',
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      addLog({
        level: 'error',
        message: `Intake failed: ${errorMsg}`,
        source: 'intake',
      });
      setStageError(`Stage failed: ${errorMsg}. Check the console for details.`);
      updateStage('intake', { status: 'ready', progress: 0 });
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = () => {
    setIsRunning(false);
    updateStage('intake', { status: 'ready', progress: 0 });
  };

  return (
    <>
      <StageLayout
        stageId="intake"
        icon={MapPin}
        title="Data Intake & GCP Alignment"
        description="Import imagery and align ground control points"
        onRun={handleRun}
        onCancel={handleCancel}
        onPreviewResults={() => setShowResults(true)}
        isRunning={isRunning}
        hasResults={stage?.status === 'completed'}
      >
        <div className="grid grid-cols-2 gap-4 h-[calc(100vh-280px)] min-h-[400px]">
          {/* Stage Error Banner */}
          {stageError && (
            <div className="col-span-2 p-3 rounded border-l-2 border-l-[#EF4444] bg-[#EF4444]/10 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-[12px] text-[#EF4444]">{stageError}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-[#EF4444] hover:text-white" onClick={() => setStageError(null)}>
                <span className="text-xs">×</span>
              </Button>
            </div>
          )}

          {/* Image Directory (set once at project creation, read-only here) */}
          <div className="col-span-2 p-4 rounded-lg bg-[#161B22] border border-[rgba(255,255,255,0.06)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-[#00D4FF]" />
                <h3 className="text-[13px] font-medium text-[#E6EDF3]">UAV Image Directory</h3>
              </div>
              <Badge variant="outline" className={cn(
                'text-[10px]',
                activeProject?.directoryPath
                  ? 'border-[#10B981]/50 text-[#10B981] bg-[#10B981]/5'
                  : 'border-[#EF4444]/50 text-[#EF4444] bg-[#EF4444]/5'
              )}>
                {activeProject?.directoryPath ? 'Configured' : 'Missing'}
              </Badge>
            </div>

            {activeProject?.directoryPath ? (
              <div className="flex items-center gap-2 h-10 px-3 rounded-md bg-[#0E1117] border border-[rgba(255,255,255,0.06)]">
                <FolderOpen className="h-4 w-4 text-[#6B7280] shrink-0" />
                <span className="flex-1 font-mono text-xs text-[#C9D1D9] truncate" title={activeProject.directoryPath}>
                  {activeProject.directoryPath}
                </span>
                <span className="text-[10px] text-[#6B7280] font-mono shrink-0">
                  {droneImages.length} images
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 h-10 px-3 rounded-md bg-[#0E1117] border border-[rgba(255,255,255,0.06)]">
                <AlertCircle className="h-4 w-4 text-[#EF4444] shrink-0" />
                <span className="text-xs text-[#8B949E]">
                  No directory configured. Create a new project and select an image folder to begin.
                </span>
              </div>
            )}

            <p className="text-[11px] text-[#8B949E] leading-relaxed">
              The image directory is selected once when the project is created and reused across all pipeline stages. To use a different folder, create a new project.
            </p>
          </div>
          {/* Left: GCP Management */}
          <div className="flex flex-col gap-4">
            {/* Stats */}
            <div className="p-4 rounded-lg bg-[#161B22] border border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-medium text-[#E6EDF3]">GCP Progress</h3>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    verifiedCount === gcps.length
                      ? 'border-[#10B981]/50 text-[#10B981] bg-[#10B981]/5'
                      : 'border-[#00D4FF]/50 text-[#00D4FF] bg-[#00D4FF]/5'
                  )}
                >
                  {verifiedCount}/{gcps.length} Verified
                </Badge>
              </div>
              <div className="h-1.5 bg-[#21262D] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#00D4FF] to-[#10B981]"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              {verifiedCount < 3 && (
                <p className="mt-2 text-[11px] text-[#F59E0B]">
                  Minimum 3 verified GCPs required
                </p>
              )}
            </div>

            {/* GCP List */}
            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-2">
                <AnimatePresence mode="popLayout">
                  {gcps.map((gcp) => (
                    <GCPCard
                      key={gcp.id}
                      gcp={gcp}
                      onVerify={handleVerify}
                      onDelete={handleDelete}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>

            {/* Actions */}
            <div className="space-y-2">
              <AddGCPDialog onAdd={handleAddGCP} />
              
              {/* GCP Import Wizard */}
              <GCPImportWizard />
              
              {/* Export CSV */}
              {gcps.length > 0 && (
                <Button
                  variant="ghost"
                  className="w-full h-8 text-[12px] text-[#8B949E] hover:text-[#E6EDF3]"
                  onClick={handleExportCSV}
                >
                  <Download className="h-3.5 w-3.5 mr-2" />
                  Export GCPs to CSV
                </Button>
              )}
            </div>
          </div>

          {/* Right: Image Grid */}
          <div className="rounded-lg bg-[#161B22] border border-[rgba(255,255,255,0.06)] overflow-hidden">
            {displayImages.length > 0 ? (
              <ImageGrid 
                images={displayImages}
                selectedImage={selectedImageId}
                onSelectImage={setSelectedImageId}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-center p-8">
                <div className="space-y-3">
                  <ImageIcon className="h-12 w-12 text-[#6B7280] mx-auto opacity-50" />
                  <p className="text-[13px] text-[#8B949E]">
                    No images loaded. Create a project and select an image folder to begin.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </StageLayout>

      <ResultsPreview
        stageId="intake"
        stageName="GCP Alignment"
        isOpen={showResults}
        onClose={() => setShowResults(false)}
      />
    </>
  );
}
