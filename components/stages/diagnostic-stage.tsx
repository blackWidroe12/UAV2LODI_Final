'use client';

import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { usePipelineStore, type DroneImage } from '@/lib/stores';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StageLayout, StageSection } from './stage-layout';
import {
  AlertTriangle,
  CheckCircle,
  Camera,
  Eye,
  Layers,
  Search,
  FolderOpen,
  Upload,
  RefreshCw,
  ImageIcon,
  HardDrive,
} from 'lucide-react';

// Image analysis utilities - runs entirely client-side
async function analyzeImage(file: File): Promise<{
  blurScore: number;
  exposureScore: number;
  contrast: number;
  brightness: number;
  isUsable: boolean;
}> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      // Create canvas for pixel analysis
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        resolve({ blurScore: 75, exposureScore: 75, contrast: 50, brightness: 50, isUsable: true });
        return;
      }
      
      // Scale down for faster processing
      const maxDim = 256;
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      
      // Calculate brightness and contrast
      let totalBrightness = 0;
      let minBrightness = 255;
      let maxBrightness = 0;
      const luminanceValues: number[] = [];
      
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        
        totalBrightness += luminance;
        luminanceValues.push(luminance);
        minBrightness = Math.min(minBrightness, luminance);
        maxBrightness = Math.max(maxBrightness, luminance);
      }
      
      const pixelCount = pixels.length / 4;
      const avgBrightness = totalBrightness / pixelCount;
      const contrast = maxBrightness - minBrightness;
      
      // Calculate variance for blur estimation (higher variance = sharper)
      let variance = 0;
      for (const lum of luminanceValues) {
        variance += Math.pow(lum - avgBrightness, 2);
      }
      variance /= luminanceValues.length;
      
      // Laplacian-based edge detection for blur score
      let edgeSum = 0;
      const width = canvas.width;
      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x);
          const laplacian = Math.abs(
            -luminanceValues[idx - width] - luminanceValues[idx - 1] +
            4 * luminanceValues[idx] - luminanceValues[idx + 1] - luminanceValues[idx + width]
          );
          edgeSum += laplacian;
        }
      }
      const avgEdge = edgeSum / ((canvas.width - 2) * (canvas.height - 2));
      
      // Normalize scores to 0-100 scale
      const blurScore = Math.min(100, Math.max(0, avgEdge * 2)); // Higher edge = sharper
      const exposureScore = 100 - Math.abs(avgBrightness - 127.5) / 1.275; // Best at 127.5
      const normalizedContrast = (contrast / 255) * 100;
      const normalizedBrightness = (avgBrightness / 255) * 100;
      
      // Determine if image is usable
      const isUsable = blurScore >= 50 && exposureScore >= 40 && normalizedContrast >= 20;
      
      resolve({
        blurScore: Math.round(blurScore),
        exposureScore: Math.round(exposureScore),
        contrast: Math.round(normalizedContrast),
        brightness: Math.round(normalizedBrightness),
        isUsable,
      });
      
      // Cleanup
      URL.revokeObjectURL(img.src);
    };
    
    img.onerror = () => {
      resolve({ blurScore: 0, exposureScore: 0, contrast: 0, brightness: 0, isUsable: false });
    };
    
    img.src = URL.createObjectURL(file);
  });
}

// Heatmap Cell Component
function HeatmapCell({ value, max }: { value: number; max: number }) {
  const intensity = value / max;
  const color = intensity > 0.7 
    ? `rgba(16, 185, 129, ${intensity})` // Green for good
    : intensity > 0.4 
    ? `rgba(245, 158, 11, ${intensity})` // Amber for warning
    : `rgba(239, 68, 68, ${intensity})`; // Red for poor
    
  return (
    <div
      className="w-3 h-3 rounded-sm transition-colors"
      style={{ backgroundColor: color }}
      title={`Score: ${Math.round(value)}%`}
    />
  );
}

// Quality Heatmap Grid - shows actual image quality distribution
function QualityHeatmap({ images }: { images: DroneImage[] }) {
  const gridSize = Math.min(10, Math.ceil(Math.sqrt(images.length)));
  const analyzed = images.filter(img => img.diagnostics);
  
  // Create grid data from actual diagnostic scores
  const heatmapData = analyzed.slice(0, gridSize * gridSize).map(img => 
    img.diagnostics?.blurScore || 0
  );
  
  // Pad to fill grid
  while (heatmapData.length < gridSize * gridSize) {
    heatmapData.push(0);
  }

  return (
    <div className="panel rounded-lg p-4">
      <h4 className="text-[13px] font-medium text-foreground mb-3 flex items-center gap-2">
        <Layers className="h-4 w-4 text-[#00D4FF]" />
        Image Quality Distribution
      </h4>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
      >
        {heatmapData.map((value, i) => (
          <HeatmapCell key={i} value={value} max={100} />
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
        <span>Poor Quality</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-2 rounded-sm bg-[#EF4444]/60" />
          <div className="w-4 h-2 rounded-sm bg-[#F59E0B]/60" />
          <div className="w-4 h-2 rounded-sm bg-[#10B981]/60" />
        </div>
        <span>High Quality</span>
      </div>
    </div>
  );
}

// Quality Metrics Cards
function QualityMetric({
  label,
  value,
  status,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  status: 'good' | 'warning' | 'error';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const statusColors = {
    good: 'text-[#10B981] bg-[#10B981]/10',
    warning: 'text-[#F59E0B] bg-[#F59E0B]/10',
    error: 'text-[#EF4444] bg-[#EF4444]/10',
  };

  return (
    <div className="panel rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold font-mono mt-1">{value}</p>
        </div>
        <div className={cn('p-2 rounded-lg', statusColors[status])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export function DiagnosticStage() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentImage, setCurrentImage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    droneImages, 
    folderName,
    setDroneImages,
    updateDroneImageDiagnostics,
    updateStage, 
    updateStageProgress, 
    unlockNextStage, 
    addLog, 
    setViewportMode, 
    stages 
  } = usePipelineStore();
  
  const stage = stages.find((s) => s.id === 'diagnostic');
  const analyzedImages = droneImages.filter(img => img.diagnostics);
  const hasImages = droneImages.length > 0;
  const hasResults = analyzedImages.length > 0;

  // Calculate statistics from real analysis results
  const stats = {
    totalImages: droneImages.length,
    analyzedImages: analyzedImages.length,
    blurryImages: analyzedImages.filter((d) => (d.diagnostics?.blurScore || 0) < 60).length,
    poorExposure: analyzedImages.filter((d) => (d.diagnostics?.exposureScore || 0) < 50).length,
    avgQuality: analyzedImages.length
      ? Math.round(analyzedImages.reduce((sum, d) => sum + (d.diagnostics?.blurScore || 0), 0) / analyzedImages.length)
      : 0,
    gpsIssues: droneImages.filter((d) => !d.hasGPS).length,
    usableImages: analyzedImages.filter((d) => d.diagnostics?.isUsable).length,
  };

  // Handle folder selection for loading images
  const handleBrowseFolder = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dirHandle = await (window as any).showDirectoryPicker({
          mode: 'read',
          startIn: 'pictures',
        });

        const files: File[] = [];
        const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'dng', 'raw'];
        
        for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            if (IMAGE_EXTENSIONS.includes(ext)) {
              files.push(file);
            }
          }
        }

        if (files.length > 0) {
          await loadImagesFromFiles(files, dirHandle.name);
        } else {
          addLog({ level: 'warn', message: 'No image files found in selected folder', source: 'diagnostic' });
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          fileInputRef.current?.click();
        }
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'dng', 'raw'];
    const imageFiles = Array.from(files).filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return IMAGE_EXTENSIONS.includes(ext);
    });

    const firstPath = files[0].webkitRelativePath;
    const folderName = firstPath.split('/')[0] || 'Selected Folder';

    await loadImagesFromFiles(imageFiles, folderName);
    e.target.value = '';
  };

  const loadImagesFromFiles = async (files: File[], folder: string) => {
    addLog({ level: 'info', message: `Loading ${files.length} images from ${folder}...`, source: 'diagnostic' });
    
    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    };

    const images: DroneImage[] = files.map((file, idx) => ({
      id: `img-${idx}-${Date.now()}`,
      name: file.name,
      file,
      thumbnailUrl: URL.createObjectURL(file),
      size: file.size,
      sizeFormatted: formatFileSize(file.size),
      extension: file.name.split('.').pop()?.toUpperCase() || '',
      // Detect GPS based on known drone manufacturer filename patterns
      hasGPS: /^(dji|phantom|mavic|inspire|p4|fc|zenmuse|auterion|freefly|aeryon|sensfly|trimble)/i.test(file.name),
      lastModified: new Date(file.lastModified),
    }));

    setDroneImages(images, folder);
    addLog({ level: 'success', message: `Loaded ${images.length} images from "${folder}"`, source: 'diagnostic' });
  };

  const runDiagnostic = useCallback(async () => {
    if (droneImages.length === 0) {
      addLog({ level: 'error', message: 'No images loaded. Please select a folder first.', source: 'diagnostic' });
      return;
    }

    setIsRunning(true);
    setProgress(0);
    updateStage('diagnostic', { status: 'processing' });
    addLog({ level: 'info', message: `Starting real-time diagnostic analysis of ${droneImages.length} images...`, source: 'diagnostic' });

    const total = droneImages.length;
    let processed = 0;

    for (const image of droneImages) {
      setCurrentImage(image.name);
      
      try {
        const diagnostics = await analyzeImage(image.file);
        updateDroneImageDiagnostics(image.id, diagnostics);
      } catch (err) {
        addLog({ level: 'warn', message: `Failed to analyze ${image.name}`, source: 'diagnostic' });
      }
      
      processed++;
      const progressPercent = Math.round((processed / total) * 100);
      setProgress(progressPercent);
      updateStageProgress('diagnostic', progressPercent);
      
      if (processed % 10 === 0 || processed === total) {
        addLog({
          level: 'info',
          message: `Analyzed ${processed}/${total} images (${progressPercent}%)`,
          source: 'diagnostic',
        });
      }
    }

    setIsRunning(false);
    setCurrentImage('');
    updateStage('diagnostic', { status: 'completed', progress: 100 });
    unlockNextStage('diagnostic');
    
    const usable = droneImages.filter(img => img.diagnostics?.isUsable).length;
    addLog({ 
      level: 'success', 
      message: `Diagnostic complete. ${usable}/${total} images are usable for processing.`, 
      source: 'diagnostic' 
    });
  }, [droneImages, addLog, updateStage, updateStageProgress, unlockNextStage, updateDroneImageDiagnostics]);

  const handleCancel = () => {
    setIsRunning(false);
    setProgress(0);
    setCurrentImage('');
  };

  const handlePreviewResults = () => {
    setViewportMode('2d-only');
  };

  return (
    <StageLayout
      stageId="diagnostic"
      icon={Search}
      title="Pre-Flight Diagnostic"
      description="Client-side blur detection and image quality analysis"
      onRun={runDiagnostic}
      onCancel={handleCancel}
      onPreviewResults={handlePreviewResults}
      isRunning={isRunning}
      hasResults={hasResults}
    >
      {/* Hidden file input for fallback */}
      <input
        ref={fileInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is a valid attribute
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* No images loaded state */}
      {!hasImages && !isRunning && (
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="text-center space-y-6 max-w-md">
            <div className="w-20 h-20 rounded-full bg-[#00D4FF]/10 flex items-center justify-center mx-auto">
              <FolderOpen className="h-10 w-10 text-[#00D4FF]" />
            </div>
            <div>
              <h3 className="text-[17px] font-medium">Load Drone Images</h3>
              <p className="text-[13px] text-muted-foreground mt-2">
                Select a folder containing your drone images to begin quality analysis.
                All processing happens locally in your browser.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                onClick={handleBrowseFolder}
                className="bg-gradient-to-r from-[#00D4FF] to-[#00A8CC] text-[#0E1117] font-medium"
              >
                <HardDrive className="h-4 w-4 mr-2" />
                Browse Local Folder
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Supports JPG, PNG, TIFF, DNG, RAW formats
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Images loaded, ready for analysis */}
      {hasImages && !hasResults && !isRunning && (
        <div className="space-y-6">
          <div className="panel rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#00D4FF]/10 flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-[#00D4FF]" />
                </div>
                <div>
                  <p className="text-[14px] font-medium">{folderName}</p>
                  <p className="text-[12px] text-muted-foreground">{droneImages.length} images loaded</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBrowseFolder}
                className="border-[rgba(255,255,255,0.06)]"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Change Folder
              </Button>
            </div>
            
            {/* Image preview strip */}
            <ScrollArea className="h-24">
              <div className="flex gap-2">
                {droneImages.slice(0, 20).map((img) => (
                  <div
                    key={img.id}
                    className="w-20 h-20 rounded-md overflow-hidden flex-shrink-0 bg-[#21262D]"
                  >
                    <img
                      src={img.thumbnailUrl}
                      alt={img.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
                {droneImages.length > 20 && (
                  <div className="w-20 h-20 rounded-md bg-[#21262D] flex items-center justify-center flex-shrink-0">
                    <span className="text-[12px] text-muted-foreground">+{droneImages.length - 20}</span>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          
          <div className="text-center py-4">
            <p className="text-[13px] text-muted-foreground">
              Click &quot;Run Stage&quot; to analyze image quality, blur, and exposure
            </p>
          </div>
        </div>
      )}

      {/* Progress */}
      {isRunning && (
        <div className="space-y-4">
          <div className="panel rounded-lg p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
                <Search className="h-5 w-5 text-[#F59E0B] animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-medium">Analyzing Images</p>
                <p className="text-[12px] text-muted-foreground font-mono truncate max-w-[300px]">
                  {currentImage || 'Initializing...'}
                </p>
              </div>
              <span className="text-[20px] font-bold font-mono text-[#00D4FF]">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>
      )}

      {/* Results */}
      {hasResults && !isRunning && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <StageSection title="Quality Metrics">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <QualityMetric
                label="Total Images"
                value={stats.totalImages}
                status="good"
                icon={Camera}
              />
              <QualityMetric
                label="Usable Images"
                value={`${stats.usableImages}/${stats.totalImages}`}
                status={stats.usableImages >= stats.totalImages * 0.8 ? 'good' : 'warning'}
                icon={CheckCircle}
              />
              <QualityMetric
                label="Avg Quality"
                value={`${stats.avgQuality}%`}
                status={stats.avgQuality >= 70 ? 'good' : stats.avgQuality >= 50 ? 'warning' : 'error'}
                icon={Eye}
              />
              <QualityMetric
                label="GPS Issues"
                value={stats.gpsIssues}
                status={stats.gpsIssues === 0 ? 'good' : stats.gpsIssues < 5 ? 'warning' : 'error'}
                icon={AlertTriangle}
              />
            </div>
          </StageSection>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Quality Heatmap */}
            <StageSection title="Quality Distribution">
              <QualityHeatmap images={droneImages} />
            </StageSection>

            {/* Image List */}
            <StageSection title="Image Quality Report">
              <div className="panel rounded-lg overflow-hidden">
                <ScrollArea className="h-[280px]">
                  <div className="p-2 space-y-1">
                    {analyzedImages.slice(0, 30).map((img) => (
                      <div
                        key={img.id}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-[#21262D] transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded overflow-hidden bg-[#21262D]">
                            <img
                              src={img.thumbnailUrl}
                              alt={img.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="text-[12px] font-mono truncate max-w-[120px] text-muted-foreground">
                            {img.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] border',
                              (img.diagnostics?.blurScore || 0) >= 70
                                ? 'border-[#10B981]/50 text-[#10B981]'
                                : (img.diagnostics?.blurScore || 0) >= 50
                                ? 'border-[#F59E0B]/50 text-[#F59E0B]'
                                : 'border-[#EF4444]/50 text-[#EF4444]'
                            )}
                          >
                            {img.diagnostics?.blurScore || 0}%
                          </Badge>
                          {img.diagnostics?.isUsable ? (
                            <CheckCircle className="h-3.5 w-3.5 text-[#10B981]" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-[#F59E0B]" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </StageSection>
          </div>
        </motion.div>
      )}
    </StageLayout>
  );
}
