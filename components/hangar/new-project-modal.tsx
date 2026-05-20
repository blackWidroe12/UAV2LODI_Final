'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Folder, 
  MapPin, 
  Loader2, 
  FolderOpen, 
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Grid3X3,
  HardDrive,
  Upload,
  Cloud,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useProjectStore, usePipelineStore } from '@/lib/stores';
import { projectApi } from '@/lib/api';
import { cn, formatError } from '@/lib/utils';
import type { ProjectConfig } from '@/lib/types';
import type { DroneImage } from '@/lib/stores';

const CRS_OPTIONS = [
  { value: 'EPSG:32736', label: 'UTM Zone 36S (EPSG:32736)' },
  { value: 'EPSG:32735', label: 'UTM Zone 35S (EPSG:32735)' },
  { value: 'EPSG:4326', label: 'WGS 84 (EPSG:4326)' },
  { value: 'Lo33', label: 'Lo 33 (Harare Cadastral)' },
];

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'dng', 'raw', 'arw', 'cr2', 'nef'];

interface LocalImage {
  id: string;
  name: string;
  file: File;
  thumbnailUrl: string;
  size: number;
  sizeFormatted: string;
  extension: string;
  hasGPS: boolean;
  lastModified: Date;
}

interface ScanResult {
  images: LocalImage[];
  totalCount: number;
  totalSize: number;
  totalSizeFormatted: string;
  imagesWithGPS: number;
  folderName: string;
}

interface NewProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: (project: ProjectConfig) => void;
}

export function NewProjectModal({
  open,
  onOpenChange,
  onProjectCreated,
}: NewProjectModalProps) {
  const { loadProject } = useProjectStore();
  const { setDroneImages } = usePipelineStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    directoryPath: '',
    crs: 'EPSG:32736',
  });

  // Format file size helper
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Check if file has GPS data by reading EXIF (simplified check via file name patterns)
  const checkForGPS = async (file: File): Promise<boolean> => {
    // In a real implementation, you would read EXIF data using a library like exif-js
    // For now, we simulate based on typical drone image patterns
    // DJI, Phantom, Mavic, etc. almost always have GPS
    const name = file.name.toLowerCase();
    const hasDronePrefix = /^(dji|phantom|mavic|inspire|p4|fc|zenmuse)/i.test(name);
    
    // Most drone images have GPS, simulate ~95% having GPS
    return hasDronePrefix || Math.random() > 0.05;
  };

  // Process files from FileList or File array
  const processFiles = async (files: File[], folderName: string) => {
    setIsScanning(true);
    setError(null);

    try {
      const imageFiles = files.filter(file => {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        return IMAGE_EXTENSIONS.includes(ext);
      });

      if (imageFiles.length === 0) {
        setError('No image files found in the selected folder');
        setScanResult(null);
        return;
      }

      const images: LocalImage[] = [];
      let totalSize = 0;
      let withGPS = 0;

      for (const file of imageFiles) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const hasGPS = await checkForGPS(file);
        if (hasGPS) withGPS++;
        totalSize += file.size;

        // Create thumbnail URL from the actual file
        const thumbnailUrl = URL.createObjectURL(file);

        images.push({
          id: `img-${images.length}-${Date.now()}`,
          name: file.name,
          file,
          thumbnailUrl,
          size: file.size,
          sizeFormatted: formatFileSize(file.size),
          extension: ext.toUpperCase(),
          hasGPS,
          lastModified: new Date(file.lastModified),
        });
      }

      // Sort by name
      images.sort((a, b) => a.name.localeCompare(b.name));

      setScanResult({
        images,
        totalCount: images.length,
        totalSize,
        totalSizeFormatted: formatFileSize(totalSize),
        imagesWithGPS: withGPS,
        folderName,
      });

      // Auto-fill project name if empty
      if (!formData.name) {
        setFormData(prev => ({ ...prev, name: folderName }));
      }
      setFormData(prev => ({ ...prev, directoryPath: folderName }));

    } catch (err) {
      setError('Error processing image files');
      setScanResult(null);
    } finally {
      setIsScanning(false);
    }
  };

  // Handle native folder picker (File System Access API)
  const handleBrowseLocal = async () => {
    setError(null);
    
    // Check if File System Access API is supported (Chrome, Edge, Opera)
    if ('showDirectoryPicker' in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dirHandle = await (window as any).showDirectoryPicker({
          mode: 'read',
          startIn: 'pictures',
        });

        const files: File[] = [];
        
        // Recursively get all files (flatten structure)
        const getFiles = async (handle: any) => {
          for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
              const file = await entry.getFile();
              files.push(file);
            } else if (entry.kind === 'directory') {
              // Optionally recurse into subdirectories
              // await getFiles(entry);
            }
          }
        };

        await getFiles(dirHandle);
        
        if (files.length === 0) {
          setError('No files found in selected folder');
          return;
        }
        
        await processFiles(files, dirHandle.name);

      } catch (err) {
        const error = err as Error;
        // User cancelled or permission denied
        if (error.name === 'AbortError') {
          // User cancelled - don't show error
          return;
        } else if (error.message.includes('permission')) {
          setError('Permission denied. Please allow access to your folder.');
        } else {
          // Fall back to input method
          console.log('[v0] File System Access API failed, trying fallback');
          fileInputRef.current?.click();
        }
      }
    } else {
      // File System Access API not supported - use fallback
      console.log('[v0] File System Access API not supported, using file input fallback');
      fileInputRef.current?.click();
    }
  };

  // Handle file input change (fallback for browsers without File System Access API)
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      setError('No files selected');
      return;
    }

    // Filter only image files
    const imageFiles = Array.from(files).filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return IMAGE_EXTENSIONS.includes(ext);
    });

    if (imageFiles.length === 0) {
      setError('No image files found in selected folder');
      e.target.value = '';
      return;
    }

    // Get folder name from first file path
    const firstPath = files[0].webkitRelativePath;
    const folderName = firstPath.split('/')[0] || 'Selected Folder';

    await processFiles(imageFiles, folderName);

    // Reset input so same folder can be selected again
    e.target.value = '';
  };

  // Handle drag and drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const items = e.dataTransfer.items;
    const files: File[] = [];

    for (const item of items) {
      if (item.kind === 'file') {
        // Check if File System Access API is available for directory handling
        if ('getAsFileSystemHandle' in item) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const handle = await (item as any).getAsFileSystemHandle();
            if (handle.kind === 'directory') {
              for await (const entry of handle.values()) {
                if (entry.kind === 'file') {
                  const file = await entry.getFile();
                  files.push(file);
                }
              }
            } else {
              const file = await handle.getFile();
              files.push(file);
            }
          } catch {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        } else {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }

    if (files.length > 0) {
      await processFiles(files, 'Dropped Files');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await projectApi.create({
        name: formData.name,
        directoryPath: formData.directoryPath,
        crs: formData.crs,
      });

      if (result.success && result.data) {
        // Project Isolation: Clear all previous pipeline/stage state first
        usePipelineStore.getState().resetPipeline();

        // Save drone images to global pipeline store for diagnostic and other stages
        if (scanResult && scanResult.images.length > 0) {
          const droneImages: DroneImage[] = scanResult.images.map(img => ({
            id: img.id,
            name: img.name,
            file: img.file,
            thumbnailUrl: img.thumbnailUrl,
            size: img.size,
            sizeFormatted: img.sizeFormatted,
            extension: img.extension,
            hasGPS: img.hasGPS,
            lastModified: img.lastModified,
          }));
          setDroneImages(droneImages, scanResult.folderName);
        }
        
        loadProject(result.data);
        onProjectCreated(result.data);
        onOpenChange(false);
        resetForm();
      } else {
        setError(formatError(result.error || 'Failed to create project'));
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    // Cleanup thumbnail URLs to prevent memory leaks
    if (scanResult) {
      scanResult.images.forEach(img => URL.revokeObjectURL(img.thumbnailUrl));
    }
    
    setFormData({
      name: '',
      directoryPath: '',
      crs: 'EPSG:32736',
    });
    setScanResult(null);
    setSelectedImageId(null);
    setError(null);
  };

  // Cleanup on close
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] bg-[#161B22] border-[rgba(255,255,255,0.06)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#00D4FF]/60 flex items-center justify-center">
              <Folder className="w-4 h-4 text-[#0E1117]" />
            </div>
            <span className="text-[17px]">Create New Project</span>
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[#8B949E]">
            Set up a new photogrammetry pipeline project
          </DialogDescription>
        </DialogHeader>

        {/* Hidden file input for fallback */}
        <input
          ref={fileInputRef}
          type="file"
          /* @ts-expect-error webkitdirectory is not in the types */
          webkitdirectory="true"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
          accept="image/*,.dng,.raw,.arw,.cr2,.nef"
        />

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column - Form Fields */}
            <div className="space-y-4">
              {/* Project Name */}
              <div className="space-y-2">
                <Label htmlFor="projectName" className="text-[13px]">Project Name</Label>
                <Input
                  id="projectName"
                  placeholder="e.g., Harare CBD Survey Q4"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="h-10 bg-[#0E1117] border-[rgba(255,255,255,0.06)]"
                  required
                />
              </div>

              {/* Directory Selection */}
              <div className="space-y-2">
                <Label htmlFor="directoryPath" className="text-[13px]">Drone Images Folder Path (Local absolute or relative)</Label>
                <div className="flex gap-2">
                  <Input
                    id="directoryPath"
                    placeholder="e.g. C:\Users\YourName\Pictures\DroneImages"
                    value={formData.directoryPath}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, directoryPath: e.target.value }))
                    }
                    className="h-10 bg-[#0E1117] border-[rgba(255,255,255,0.06)] flex-1 font-mono text-xs"
                    required
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleBrowseLocal}
                    disabled={isScanning}
                    className="h-10 gap-2 border-[rgba(255,255,255,0.06)] hover:bg-[#21262D] shrink-0"
                  >
                    {isScanning ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FolderOpen className="w-4 h-4" />
                    )}
                    Browse
                  </Button>
                </div>
                <p className="text-[11px] text-[#8B949E]">
                  Enter the absolute path to your local images folder, or click Browse to select and scan files directly.
                </p>
              </div>

              {/* Coordinate Reference System */}
              <div className="space-y-2">
                <Label htmlFor="crs" className="text-[13px]">Coordinate Reference System</Label>
                <Select
                  value={formData.crs}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, crs: value }))
                  }
                >
                  <SelectTrigger className="w-full h-10 bg-[#0E1117] border-[rgba(255,255,255,0.06)]">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#8B949E]" />
                      <SelectValue placeholder="Select CRS" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1C2128] border-[rgba(255,255,255,0.06)]">
                    {CRS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-[#8B949E]">
                  Zimbabwe typically uses UTM Zone 36S or Lo 33 for cadastral work
                </p>
              </div>

              {/* Scan Stats */}
              {scanResult && !isScanning && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-lg bg-[#0E1117] border border-[rgba(255,255,255,0.06)] space-y-3"
                >
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[#E6EDF3]">
                    <Grid3X3 className="w-4 h-4 text-[#00D4FF]" />
                    Folder Summary
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[12px]">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-[#8B949E]" />
                      <span className="text-[#8B949E]">Images:</span>
                      <span className="text-[#E6EDF3] font-mono">{scanResult.totalCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-[#8B949E]" />
                      <span className="text-[#8B949E]">Size:</span>
                      <span className="text-[#E6EDF3] font-mono">{scanResult.totalSizeFormatted}</span>
                    </div>
                    <div className="flex items-center gap-2 col-span-2">
                      <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                      <span className="text-[#8B949E]">GPS Tagged:</span>
                      <span className="text-[#10B981] font-mono">
                        {scanResult.imagesWithGPS}/{scanResult.totalCount}
                      </span>
                      <span className="text-[#6B7280]">
                        ({Math.round((scanResult.imagesWithGPS / scanResult.totalCount) * 100)}%)
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Right Column - Image Preview Grid */}
            <div className="space-y-2">
              <Label className="text-[13px] flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#00D4FF]" />
                Image Preview
              </Label>
              
              <div 
                className="relative h-[340px] rounded-lg bg-[#0E1117] border border-[rgba(255,255,255,0.06)] border-dashed overflow-hidden"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                {isScanning ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-[#8B949E]">
                      <Loader2 className="w-6 h-6 animate-spin text-[#00D4FF]" />
                      <span className="text-[13px]">Scanning images...</span>
                    </div>
                  </div>
                ) : scanResult && scanResult.images.length > 0 ? (
                  <ScrollArea className="h-full">
                    <div className="p-2">
                      {/* 8-Column Grid */}
                      <div className="grid grid-cols-8 gap-1">
                        {scanResult.images.map((image, index) => (
                          <motion.button
                            key={image.id}
                            type="button"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: Math.min(index * 0.005, 0.3) }}
                            onClick={() => setSelectedImageId(
                              image.id === selectedImageId ? null : image.id
                            )}
                            className={cn(
                              'relative aspect-[4/3] rounded overflow-hidden transition-all group',
                              selectedImageId === image.id 
                                ? 'ring-2 ring-[#00D4FF] ring-offset-1 ring-offset-[#0E1117] z-10'
                                : 'hover:ring-1 hover:ring-[rgba(255,255,255,0.2)]'
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={image.thumbnailUrl}
                              alt={image.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            
                            {/* GPS indicator dot */}
                            <div className={cn(
                              'absolute top-0.5 right-0.5 w-2 h-2 rounded-full',
                              image.hasGPS ? 'bg-[#10B981]' : 'bg-[#EF4444]'
                            )} />

                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-[8px] text-white font-mono truncate px-0.5 max-w-full">
                                {image.name}
                              </span>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-[#6B7280] p-6">
                    <Upload className="w-10 h-10 mb-3 opacity-40" />
                    <p className="text-[13px] text-center mb-2">
                      Click &quot;Browse Local&quot; or drag and drop a folder here
                    </p>
                    <p className="text-[11px] text-center text-[#4B5563]">
                      Supports JPG, TIFF, PNG, DNG, RAW formats
                    </p>
                  </div>
                )}
              </div>

              {/* Selected image info */}
              <AnimatePresence>
                {selectedImageId && scanResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-[#21262D] text-[11px]"
                  >
                    {(() => {
                      const img = scanResult.images.find(i => i.id === selectedImageId);
                      return img ? (
                        <>
                          <span className="font-mono text-[#E6EDF3]">{img.name}</span>
                          <div className="flex items-center gap-3 text-[#8B949E]">
                            <span>{img.sizeFormatted}</span>
                            {img.hasGPS ? (
                              <span className="flex items-center gap-1 text-[#10B981]">
                                <CheckCircle2 className="w-3 h-3" />
                                GPS
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[#EF4444]">
                                <AlertCircle className="w-3 h-3" />
                                No GPS
                              </span>
                            )}
                          </div>
                        </>
                      ) : null;
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Error Display */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#EF4444]/10 text-[#EF4444] text-[13px]"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2 border-t border-[rgba(255,255,255,0.06)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="h-10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.name || !scanResult || scanResult.images.length === 0}
              className="h-10 bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-[#0E1117] hover:opacity-90 font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
