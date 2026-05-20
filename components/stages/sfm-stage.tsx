'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePipelineStore, useProjectStore, useAuthStore } from '@/lib/stores';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StageLayout, StageSection } from './stage-layout';
import { ResultsPreview } from './results-preview';
import AssetCard from '@/components/ui/AssetCard';
import {
  Box,
  Settings,
  Settings2,
  Zap,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  Play,
  Square,
  RefreshCw,
  RefreshCcw,
  ExternalLink,
  Cpu,
  HardDrive,
  Copy,
  Info,
  Clock,
  Check,
  FolderOpen,
  AlertTriangle,
  FileText,
  ChevronUp,
  ChevronDown,
  Eye,
  Map,
  Layers,
  File,
  Download,
} from 'lucide-react';
import type { SfMConfig, SfMOutputs } from '@/lib/types';

export function SfMStage() {
  const { 
    stages, 
    addConsoleLog,
    sfmOutputs,
    sfmConfig,
    sfmProgress,
    setSfMConfig,
    setSfMProgress,
    droneImages,
    gcps,
    setActiveViewportOpen,
    setActiveViewportMode,
    set2DLayer,
    set3DLayer,
    setStageStatus,
    updateStageProgress,
    unlockNextStage,
    setSfMOutputs,
    setStageProgress,
    completeStage,
    failStage,
  } = usePipelineStore();
  
  const { activeProject } = useProjectStore();
  const { token } = useAuthStore();
  
  const stage = stages.find(s => s.id === 'sfm');
  const isRunning = stage?.status === 'processing';
  
  const [showResults, setShowResults] = useState(false);
  const [showGCPPreview, setShowGCPPreview] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'untested' | 'connected' | 'failed'>('untested');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [odmVersion, setOdmVersion] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  
  const [isTestingSubmit, setIsTestingSubmit] = useState(false);
  const [submitTestResults, setSubmitTestResults] = useState<string[] | null>(null);
  const [submitTestError, setSubmitTestError] = useState<string | null>(null);


  const [gcpPreview, setGcpPreview] = useState<{
    gcpFileContent: string;
    totalLines: number;
    gcpCount: number;
    imageCount: number;
    crs: string;
    warnings: string[];
    errors: string[];
    preview: string[];
  } | null>(null);

  const [preflight, setPreflight] = useState<{
    canRun: boolean;
    imageCount: number;
    errors: string[];
    warnings: string[];
    info: string[];
    recommendations: string[];
  } | null>(null);

  const [error, setError] = useState<{
    type?: string;
    summary?: string;
    causes?: string[];
    fixes?: string[];
    rawError?: string;
  } | null>(null);

  const [completionView, setCompletionView] = useState(false);
  const [panelsCollapsed, setPanelsCollapsed] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const runPreflight = async () => {
    if (!activeProject?.id || !token) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/sfm/preflight`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setPreflight(data.data);
      }
    } catch (err) {
      console.error('Failed to run preflight check:', err);
    }
  };

  useEffect(() => {
    runPreflight();
  }, [activeProject?.id, token, droneImages.length, gcps.length]);

  // Load state on mount
  useEffect(() => {
    if (!activeProject?.id || !token) return;

    // Load config
    fetch(`/api/projects/${activeProject.id}/sfm/config`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(data => {
      if (data.success && data.data.config) {
        setSfMConfig(data.data.config);
      }
    });

    // Load current progress/results
    fetch(`/api/projects/${activeProject.id}/sfm/progress`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(data => {
      if (!data.success) return;
      
      if (data.data.status === 'completed') {
        setStageStatus('sfm', 'completed');
        updateStageProgress('sfm', 100);
        setCompletionView(true);
        setPanelsCollapsed(true);
        
        // Load asset metadata
        fetch(`/api/projects/${activeProject.id}/sfm/assets`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json()).then(assetsData => {
          if (assetsData.success) {
            setSfMOutputs({
              ...data.data.outputs,
              assets: assetsData.data.assets
            });
          } else {
            setSfMOutputs(data.data.outputs);
          }
        });
      } else if (data.data.status === 'processing') {
        setStageStatus('sfm', 'processing');
        setSfMProgress(data.data.progress);
        startPolling();
        
        // Resume timer
        const startedAt = data.data.startedAt;
        if (startedAt) {
          setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
          startTimer();
        }
      } else if (data.data.status === 'error') {
        setStageStatus('sfm', 'error');
        if (data.data.error) {
          setError(data.data.error);
        }
      }
    });

    return () => {
      stopPolling();
      stopTimer();
    };
  }, [activeProject?.id, token]);

  // Load GCP preview when project or GCPs change
  useEffect(() => {
    if (!activeProject?.id || gcps.length === 0 || !token) {
      setGcpPreview(null);
      return;
    }
    fetch(`/api/projects/${activeProject.id}/sfm/gcp-preview`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) setGcpPreview(data.data);
      })
      .catch(err => console.error('Failed to load GCP preview:', err));
  }, [activeProject?.id, gcps.length, token]);

  const startPolling = () => {
    if (pollingRef.current) return;
    
    pollingRef.current = setInterval(async () => {
      if (!activeProject?.id) return;
      
      try {
        const res = await fetch(`/api/projects/${activeProject.id}/sfm/progress`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();

        if (!data.success) return;

        setSfMProgress(data.data.progress);
        setStageProgress('sfm', data.data.progress.percentage, data.data.progress.message);
        
        if (data.data.progress.message) {
          addConsoleLog('info', 'sfm', `${data.data.progress.percentage}% — ${data.data.progress.message}`);
        }

        if (data.data.status === 'completed') {
          stopPolling();
          stopTimer();
          completeStage('sfm', data.data.outputs);
          unlockNextStage('sfm');
          setCompletionView(true);
          setPanelsCollapsed(true);
          addConsoleLog('success', 'sfm', 'SfM processing completed — downloading assets...');

          // Fetch asset metadata
          const assetsRes = await fetch(`/api/projects/${activeProject.id}/sfm/assets`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const assetsData = await assetsRes.json();

          if (assetsData.success) {
            setSfMOutputs({
              ...data.data.outputs,
              ...assetsData.data.metrics,
              assets: assetsData.data.assets,
            });
            addConsoleLog('success', 'sfm', `Assets ready — orthophoto: ${assetsData.data.assets.orthoPath?.sizeFormatted ?? 'N/A'}, DSM: ${assetsData.data.assets.dsmPath?.sizeFormatted ?? 'N/A'}`);
          } else {
            setSfMOutputs(data.data.outputs);
            addConsoleLog('success', 'sfm', 'SfM completed successfully.');
          }
        } else if (data.data.status === 'error') {
          stopPolling();
          stopTimer();
          setStageStatus('sfm', 'error');
          setError(data.data.error);
          addConsoleLog('error', 'sfm', `SfM failed: ${data.data.error?.summary || 'Unknown SfM engine error.'}`);
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 3000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleTestConnection = async () => {
    if (!sfmConfig || !activeProject?.id) return;
    
    setIsTestingConnection(true);
    setConnectionError(null);
    
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/sfm/test-connection?url=${encodeURIComponent(sfmConfig.odmNodeUrl)}&port=${sfmConfig.odmNodePort}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (data.success) {
        setConnectionStatus('connected');
        setOdmVersion(data.data.version);
        addConsoleLog('success', 'sfm', `Connected to ODM node at ${data.data.url} (v${data.data.version})`);
      } else {
        setConnectionStatus('failed');
        setConnectionError(data.error);
        addConsoleLog('error', 'sfm', `ODM connection failed: ${data.error}`);
      }
    } catch (e: any) {
      setConnectionStatus('failed');
      setConnectionError(e.message);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleTestSubmit = async () => {
    if (!activeProject?.id || !token) return;
    setIsTestingSubmit(true);
    setSubmitTestResults(null);
    setSubmitTestError(null);
    
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/sfm/test-submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSubmitTestResults(data.diagnostics || [data.message]);
        addConsoleLog('success', 'sfm', 'NodeODM test submission successful.');
      } else {
        setSubmitTestError(data.error);
        setSubmitTestResults(data.diagnostics || null);
        addConsoleLog('error', 'sfm', `NodeODM test submission failed: ${data.error}`);
      }
    } catch (e: any) {
      setSubmitTestError(e.message);
      addConsoleLog('error', 'sfm', `Failed to run submission test: ${e.message}`);
    } finally {
      setIsTestingSubmit(false);
    }
  };

  const handleRun = async () => {
    if (!activeProject?.id || !token) return;
    
    setStageStatus('sfm', 'processing'); // keep for compatibility

    setElapsedSeconds(0);
    setSfMOutputs(null);
    setLocalError(null);
    setSfMProgress({ percentage: 0, message: 'Submitting job...' });
    
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/sfm/run`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await res.json();
      if (data.success) {
        addConsoleLog('info', 'sfm', 'SfM job submitted to ODM node.');
        startPolling();
        startTimer();
      } else {
        setStageStatus('sfm', 'error');
        setLocalError(data.error ?? 'Failed to start SfM processing.');
        addConsoleLog('error', 'sfm', data.error ?? 'SfM start failed');
      }
    } catch (e: any) {
      setStageStatus('sfm', 'error');
      setLocalError(e.message);
      addConsoleLog('error', 'sfm', `Failed to start SfM: ${e.message}`);
    }
  };

  const handleCancel = async () => {
    if (!activeProject?.id || !token) return;
    
    try {
      await fetch(`/api/projects/${activeProject.id}/sfm/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      addConsoleLog('warn', 'sfm', 'SfM job cancellation requested.');
      stopPolling();
      stopTimer();
      setStageStatus('sfm', 'error');
    } catch (e) {
      console.error('Cancel error:', e);
    }
  };

  const handleRetryWithLowerSettings = async () => {
    if (!activeProject?.id || !token || !sfmConfig) return;
    
    // Apply conservative settings that avoid OpenMVS OOM
    const safeConfig: SfMConfig = {
      ...sfmConfig,
      featureQuality: 'draft',
      pointCloudQuality: 'draft',
      meshSize: 100000,
      minNumFeatures: 4000,
      pcFilteringDistance: 5.0,
    };

    try {
      // Save the new config
      await fetch(`/api/projects/${activeProject.id}/sfm/config`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(safeConfig),
      });

      setSfMConfig(safeConfig);
      setError(null);
      setLocalError(null);
      setStageStatus('sfm', 'ready');
      addConsoleLog('info', 'sfm', 'Configuration reduced to low quality settings. Click Run SfM Stage to retry.');
      // Re-run preflight
      await runPreflight();
    } catch (e) {
      console.error('Failed to retry with lower settings:', e);
    }
  };

  const handlePreviewResults = () => {
    if (!sfmOutputs?.assets) return;

    // Open the viewport
    setActiveViewportOpen(true);
    setActiveViewportMode('split');

    // Load orthophoto URL into the 2D map
    const orthoAsset = sfmOutputs.assets.orthoPath;
    if (orthoAsset?.available && orthoAsset.previewUrl) {
      set2DLayer({
        id: 'sfm-orthophoto',
        type: 'raster',
        url: orthoAsset.previewUrl,
        label: 'Orthophoto',
        visible: true,
        token: token ?? undefined, // pass auth token for the fetch
      });
      addConsoleLog('info', 'sfm', 'Orthophoto loaded in 2D viewport');
    }

    // Load point cloud URL into 3D viewport if available
    const pcAsset = sfmOutputs.assets.pointCloudPath;
    if (pcAsset?.available && pcAsset.previewUrl) {
      set3DLayer({
        id: 'sfm-pointcloud',
        type: 'pointcloud',
        url: pcAsset.previewUrl,
        label: 'SfM Point Cloud',
        visible: true,
        token: token ?? undefined,
      });
      addConsoleLog('info', 'sfm', 'Point cloud loaded in 3D viewport');
    }
  };

  const handlePreviewAsset = (key: string, asset: any) => {
    if (!asset.available) return;

    if (asset.type === 'geotiff') {
      setActiveViewportOpen(true);
      setActiveViewportMode('2d');
      set2DLayer({
        id: `sfm-${key}`,
        type: 'raster',
        url: asset.previewUrl,
        label: asset.label,
        visible: true,
        token: token ?? undefined,
      });
      addConsoleLog('info', 'sfm', `${asset.label} loaded in 2D viewport`);
    }

    if (asset.type === 'laz') {
      setActiveViewportOpen(true);
      setActiveViewportMode('3d');
      set3DLayer({
        id: `sfm-${key}`,
        type: 'pointcloud',
        url: asset.previewUrl,
        label: asset.label,
        visible: true,
        token: token ?? undefined,
      });
      addConsoleLog('info', 'sfm', `${asset.label} loaded in 3D viewport`);
    }

    if (asset.type === 'pdf') {
      window.open(asset.previewUrl, '_blank');
    }
  };

  const handleRunAgain = () => {
    setCompletionView(false);
    setPanelsCollapsed(false);
    setStageStatus('sfm', 'ready');
    setSfMOutputs(null);
    setSfMProgress(null);
    setError(null);

    if (activeProject?.id && token) {
      // Clear the previous stage result
      fetch(`/api/projects/${activeProject.id}/sfm/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  };

  const updateConfig = (updates: Partial<SfMConfig>) => {
    if (!sfmConfig || !activeProject?.id) return;
    
    const newConfig = { ...sfmConfig, ...updates };
    setSfMConfig(newConfig);
    
    // Auto-save with debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/projects/${activeProject.id}/sfm/config`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(newConfig)
        });
      } catch (e) {
        console.error('Config save error:', e);
      }
    }, 500);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(id);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Estimate calculation
  const getEstimate = () => {
    if (!droneImages.length || !sfmConfig) return 0;
    const count = droneImages.length;
    const quality = sfmConfig.featureQuality;
    let base = 10; // High
    if (quality === 'draft') base = 2;
    if (quality === 'medium') base = 5;
    if (quality === 'ultra') base = 20;
    
    return base * Math.ceil(count / 50);
  };

  if (!sfmConfig) {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-sm text-muted-foreground">Loading configuration...</p>
    </div>
  );
}

  const hasGCPErrors = sfmConfig?.useGCPs && gcpPreview?.errors && gcpPreview.errors.length > 0;

  return (
    <>
      <StageLayout
        stageId="sfm"
        icon={Box}
        title="Sparse Reconstruction (SfM)"
        description="Structure from Motion camera calibration and sparse point cloud generation"
        onRun={handleRun}
        onCancel={handleCancel}
        onPreviewResults={() => setShowResults(true)}
        isRunning={isRunning}
        hasResults={stage?.status === 'completed'}
        canRun={connectionStatus === 'connected' && !!activeProject?.directoryPath && !hasGCPErrors && preflight?.canRun !== false}
      >
        <div className="space-y-6">
          {/* Show/hide toggle — only visible when stage is completed */}
          {completionView && (
            <button
              onClick={() => setPanelsCollapsed(!panelsCollapsed)}
              className="flex items-center gap-2 text-xs text-[#6B7280] hover:text-[#9CA3AF] w-full justify-center py-2 border border-[rgba(255,255,255,0.06)] rounded transition-colors bg-[#0E1117] hover:bg-[#161B22]"
            >
              <Settings className="w-3 h-3" />
              {panelsCollapsed ? 'Show Configuration' : 'Hide Configuration'}
              {panelsCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            </button>
          )}

          {/* Collapsible wrapper for config panels */}
          <div className={cn(
            "transition-all duration-500 overflow-hidden space-y-6",
            panelsCollapsed ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-[5000px] opacity-100'
          )}>
          {/* Pre-flight Data Quality Checks */}
          {preflight && (
            <div className="space-y-1.5 p-3 rounded-md bg-[#0E1117] border border-[rgba(255,255,255,0.06)]">
              <p className="text-[11px] text-[#8B949E] uppercase tracking-wider font-semibold mb-2">Pre-flight Quality Checks</p>
              <div className="space-y-1">
                {preflight.errors.map((e: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-red-950/40 border border-red-800/50 rounded text-xs text-red-300">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-red-400" />
                    {e}
                  </div>
                ))}
                {preflight.warnings.map((w: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-amber-950/40 border border-amber-800/50 rounded text-xs text-amber-300">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-400" />
                    {w}
                  </div>
                ))}
                {preflight.info.map((msg: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-[#1C2128]/50 rounded text-xs text-[#9CA3AF]">
                    <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-400" />
                    {msg}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Directory Status Display */}
          {activeProject?.directoryPath ? (
            <div className="flex items-start gap-2 p-3 rounded-md bg-[#1C2128] border border-[rgba(255,255,255,0.06)]">
              <FolderOpen className="w-4 h-4 text-[#00D4FF] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[11px] text-[#8B949E] mb-0.5 uppercase tracking-wider font-semibold">Image Directory</p>
                <p className="text-[13px] text-white font-mono break-all">{activeProject.directoryPath}</p>
                <p className="text-[11px] text-[#6B7280] mt-1 italic">
                  Images will be read from this directory. To change it, update the project settings in the Intake stage.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-md bg-[#2D1B1B] border border-[#EF4444]/20">
              <AlertTriangle className="w-4 h-4 text-[#EF4444] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[13px] text-[#EF4444] font-medium">No image directory configured</p>
                <p className="text-[11px] text-[#8B949E] mt-1">
                  Go to the Intake stage and select your UAV image folder before running SfM.
                </p>
              </div>
            </div>
          )}

          {/* Local Error Display */}
          {localError && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-start gap-2 p-3 rounded-md bg-[#2D1B1B] border border-[#EF4444]/30"
            >
              <AlertTriangle className="w-4 h-4 text-[#EF4444] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[13px] text-[#EF4444] font-bold">SfM Validation Failed</p>
                <p className="text-[12px] text-[#8B949E] mt-1 leading-relaxed">{localError}</p>
              </div>
            </motion.div>
          )}

          {/* GCP Validation Errors Banner */}
          {hasGCPErrors && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-start gap-2 p-3 rounded-md bg-[#2D1B1B] border border-[#EF4444]/30"
            >
              <AlertTriangle className="w-4 h-4 text-[#EF4444] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[13px] text-[#EF4444] font-bold">GCP Validation Errors</p>
                <p className="text-[12px] text-[#8B949E] mt-1 leading-relaxed">
                  Please fix the Ground Control Point errors listed in the preview section below before starting the SfM Stage. You can also disable "Use GCPs for Georeferencing" in the options below to process using GPS data only.
                </p>
              </div>
            </motion.div>
          )}

          {/* ODM Connection Panel */}
          <StageSection title="ODM Node Connection">
            <div className="p-4 rounded-lg bg-[#0E1117] border border-[rgba(255,255,255,0.06)] space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label className="text-[11px] uppercase tracking-wider text-[#8B949E]">Node URL</Label>
                  <Input 
                    value={sfmConfig.odmNodeUrl}
                    onChange={(e) => updateConfig({ odmNodeUrl: e.target.value })}
                    placeholder="http://localhost"
                    className="h-9 bg-[#161B22] border-[rgba(255,255,255,0.06)]"
                    disabled={isRunning}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] uppercase tracking-wider text-[#8B949E]">Port</Label>
                  <Input 
                    type="number"
                    value={sfmConfig.odmNodePort}
                    onChange={(e) => updateConfig({ odmNodePort: parseInt(e.target.value) })}
                    placeholder="3005"
                    className="h-9 bg-[#161B22] border-[rgba(255,255,255,0.06)]"
                    disabled={isRunning}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection || isRunning}
                    className="h-8 gap-2 border-[rgba(255,255,255,0.06)] hover:bg-[#21262D]"
                  >
                    {isTestingConnection ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Test Connection
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestSubmit}
                    disabled={isTestingSubmit || isRunning || connectionStatus !== 'connected' || !activeProject?.directoryPath}
                    className="h-8 gap-2 border-[rgba(255,255,255,0.06)] hover:bg-[#21262D]"
                    title="Tests the full submission pipeline by uploading 3 images and immediately cancelling the task."
                  >
                    {isTestingSubmit ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
                    Test Submission
                  </Button>
                  
                  <AnimatePresence mode="wait">
                    {connectionStatus === 'connected' && (
                      <motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-1.5 text-[#10B981] text-[12px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Connected — ODM v{odmVersion}
                      </motion.div>
                    )}
                    {connectionStatus === 'failed' && (
                      <motion.div initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-1.5 text-[#EF4444] text-[12px]">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Connection Failed
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {connectionStatus === 'failed' && connectionError && (
                  <span className="text-[11px] text-[#EF4444] font-mono italic max-w-[200px] truncate" title={connectionError}>
                    {connectionError}
                  </span>
                )}
              </div>
              
              {connectionStatus !== 'connected' && !isRunning && (
                <div className="mt-4 p-4 rounded-md bg-[#21262D]/50 border border-dashed border-[rgba(255,255,255,0.1)]">
                  <div className="flex gap-3">
                    <Info className="w-4 h-4 text-[#00D4FF] shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <p className="text-[13px] text-[#E6EDF3] font-medium">ODM Node Required</p>
                      <p className="text-[12px] text-[#8B949E] leading-relaxed">
                        Structure from Motion requires a running NodeODM instance. 
                        Run this command in Docker:
                      </p>
                      <div className="p-2 rounded bg-black/40 font-mono text-[11px] text-[#C9D1D9]">
                        docker run -ti -p 3005:3000 opendronemap/nodeodm
                      </div>
                      <a 
                        href="https://github.com/OpenDroneMap/NodeODM" 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-[#00D4FF] hover:underline"
                      >
                        Installation Guide <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Test Submission Diagnostic Block */}
              {submitTestResults && (
                <div className="mt-4 p-4 rounded bg-[#161B22]/55 border border-[rgba(255,255,255,0.06)] space-y-2">
                  <h4 className="text-[12px] font-bold text-[#E6EDF3] flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-[#00D4FF]" />
                    Submission Diagnostics
                  </h4>
                  <ul className="space-y-1 font-mono text-[11px] list-none p-0 m-0">
                    {submitTestResults.map((line, idx) => (
                      <li key={idx} className={cn(
                        line.startsWith('✓') ? 'text-[#10B981]' : line.startsWith('⚠️') ? 'text-[#F59E0B]' : 'text-[#8B949E]'
                      )}>
                        {line}
                      </li>
                    ))}
                  </ul>
                  {submitTestError && (
                    <p className="text-[11px] text-[#EF4444] font-medium mt-2 bg-[#EF4444]/10 p-2 rounded border border-[#EF4444]/20">
                      Error: {submitTestError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </StageSection>

          {/* Configuration Form */}
          <StageSection title="Processing Configuration">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[13px]">Feature Quality</Label>
                  <Select 
                    value={sfmConfig.featureQuality} 
                    onValueChange={(v: any) => updateConfig({ featureQuality: v })}
                    disabled={isRunning}
                  >
                    <SelectTrigger className="h-9 bg-[#0E1117] border-[rgba(255,255,255,0.06)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1C2128] border-[rgba(255,255,255,0.06)]">
                      <SelectItem value="ultra">Ultra (Very Slow)</SelectItem>
                      <SelectItem value="high">High (Recommended)</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Draft (Fast)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-[#8B949E]">Higher quality improves accuracy but takes significantly longer.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px]">Point Cloud Quality</Label>
                  <Select 
                    value={sfmConfig.pointCloudQuality} 
                    onValueChange={(v: any) => updateConfig({ pointCloudQuality: v })}
                    disabled={isRunning}
                  >
                    <SelectTrigger className="h-9 bg-[#0E1117] border-[rgba(255,255,255,0.06)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1C2128] border-[rgba(255,255,255,0.06)]">
                      <SelectItem value="ultra">Ultra Density</SelectItem>
                      <SelectItem value="high">High Density</SelectItem>
                      <SelectItem value="medium">Standard</SelectItem>
                      <SelectItem value="low">Low (Fast)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px]">Desired GSD (cm/pixel)</Label>
                  <div className="flex items-center gap-3">
                    <Input 
                      type="number"
                      step="0.1"
                      value={sfmConfig.desiredGSD}
                      onChange={(e) => updateConfig({ desiredGSD: parseFloat(e.target.value) })}
                      className="h-9 bg-[#0E1117] border-[rgba(255,255,255,0.06)]"
                      disabled={isRunning}
                    />
                    <Badge variant="outline" className="h-6 border-[rgba(255,255,255,0.1)] text-[#8B949E]">cm</Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-[#0E1117] border border-[rgba(255,255,255,0.06)]">
                  <div className="space-y-0.5">
                    <Label className="text-[13px]">Use GCPs for Georeferencing</Label>
                    <p className="text-[11px] text-[#8B949E] mt-0.5 leading-relaxed">
                      {sfmConfig.useGCPs
                        ? 'GCPs will be submitted to ODM for georeferenced reconstruction'
                        : 'Processing will use image GPS tags only — less accurate but faster to set up'}
                    </p>
                  </div>
                  <Switch 
                    checked={sfmConfig.useGCPs && gcps.length > 0}
                    onCheckedChange={(v) => updateConfig({ useGCPs: v })}
                    disabled={isRunning || gcps.length === 0}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[13px]">Max Mesh Vertices</Label>
                  <Input 
                    type="number"
                    value={sfmConfig.meshSize}
                    onChange={(e) => updateConfig({ meshSize: parseInt(e.target.value) })}
                    className="h-9 bg-[#0E1117] border-[rgba(255,255,255,0.06)]"
                    disabled={isRunning}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px]">Min Features per Image</Label>
                  <Input 
                    type="number"
                    value={sfmConfig.minNumFeatures}
                    onChange={(e) => updateConfig({ minNumFeatures: parseInt(e.target.value) })}
                    className="h-9 bg-[#0E1117] border-[rgba(255,255,255,0.06)]"
                    disabled={isRunning}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px]">Outlier Filter Distance</Label>
                  <Input 
                    type="number"
                    step="0.1"
                    value={sfmConfig.pcFilteringDistance}
                    onChange={(e) => updateConfig({ pcFilteringDistance: parseFloat(e.target.value) })}
                    className="h-9 bg-[#0E1117] border-[rgba(255,255,255,0.06)]"
                    disabled={isRunning}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-[#0E1117] border border-[rgba(255,255,255,0.06)]">
                  <div className="space-y-0.5">
                    <Label className="text-[13px]">Fast Orthophoto Mode</Label>
                    <p className="text-[11px] text-[#8B949E] mt-0.5 leading-relaxed">
                      Skips dense 3D reconstruction and generates 2D orthophoto only
                    </p>
                  </div>
                  <Switch 
                    checked={!!sfmConfig.fastOrthophoto}
                    onCheckedChange={(v) => updateConfig({ fastOrthophoto: v })}
                    disabled={isRunning}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-[#0E1117] border border-[rgba(255,255,255,0.06)]">
                  <div className="space-y-0.5">
                    <Label className="text-[13px]">Use 2.5D Hybrid Mesh</Label>
                    <p className="text-[11px] text-[#8B949E] mt-0.5 leading-relaxed">
                      Uses 2.5D hybrid mesh simplification instead of full 3D mesh
                    </p>
                  </div>
                  <Switch 
                    checked={!!sfmConfig.useHybridMesh}
                    onCheckedChange={(v) => updateConfig({ useHybridMesh: v })}
                    disabled={isRunning}
                  />
                </div>

                {/* Estimate Banner */}
                <div className="p-4 rounded-lg bg-[#00D4FF]/5 border border-[#00D4FF]/20 space-y-2">
                  <div className="flex items-center gap-2 text-[13px] text-[#00D4FF] font-medium">
                    <Clock className="w-4 h-4" />
                    Estimation
                  </div>
                  <p className="text-[12px] text-[#8B949E] leading-relaxed">
                    Approx. <span className="text-[#E6EDF3] font-bold">{getEstimate()} minutes</span> for {droneImages.length} images at {sfmConfig.featureQuality} quality.
                  </p>
                </div>
              </div>
            </div>
          </StageSection>

          {/* GCP Status Banner */}
          <AnimatePresence>
            {gcps.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 rounded-lg bg-[#10B981]/10 border border-[#10B981]/20 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                <span className="text-[13px] text-[#10B981]">✓ {gcps.length} GCPs detected — GCP-assisted processing enabled</span>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center gap-3">
                <AlertCircle className="w-4 h-4 text-[#F59E0B]" />
                <span className="text-[13px] text-[#F59E0B]">⚠ No GCPs loaded — using image GPS only. Import GCPs in Intake for best accuracy.</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* GCP File Preview Collapsible Section */}
          {gcps.length > 0 && sfmConfig.useGCPs && (
            <div className="border border-[rgba(255,255,255,0.06)] rounded-md overflow-hidden bg-[#161B22]/40">
              <button
                type="button"
                onClick={() => setShowGCPPreview(!showGCPPreview)}
                className="w-full flex items-center justify-between p-3 text-sm text-[#9CA3AF] hover:bg-[#21262D]/40 transition-colors"
              >
                <span className="flex items-center gap-2 font-medium">
                  <FileText className="w-4 h-4 text-[#00D4FF]" />
                  GCP File Preview ({gcps.length} GCPs × {gcpPreview?.imageCount ?? 0} images = {gcps.length * (gcpPreview?.imageCount ?? 0)} entries)
                </span>
                {showGCPPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showGCPPreview && gcpPreview && (
                <div className="p-3 border-t border-[rgba(255,255,255,0.06)] space-y-3">
                  {/* Errors */}
                  {gcpPreview.errors.length > 0 && (
                    <div className="space-y-1.5">
                      {gcpPreview.errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded text-xs text-[#F87171]">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          {err}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Warnings */}
                  {gcpPreview.warnings.length > 0 && (
                    <div className="space-y-1.5">
                      {gcpPreview.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded text-xs text-[#FBBF24]">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          {w}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* File preview */}
                  <div className="bg-[#0E1117] rounded border border-[rgba(255,255,255,0.06)] p-3 font-mono text-xs text-[#8B949E] overflow-x-auto max-h-[220px] overflow-y-auto">
                    {gcpPreview.preview.map((line, i) => (
                      <div key={i} className={cn(i === 0 ? 'text-[#00D4FF] mb-1 font-bold' : '')}>
                        {line}
                      </div>
                    ))}
                    {gcpPreview.totalLines > 10 && (
                      <div className="text-[#6B7280] mt-1 italic">
                        ... and {gcpPreview.totalLines - 10} more lines
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-[#6B7280] leading-relaxed">
                    Coordinate Reference System: <span className="font-semibold text-[#C9D1D9]">{gcpPreview.crs}</span> · {gcpPreview.gcpCount} Ground Control Points · {gcpPreview.imageCount} images mapped
                  </p>
                </div>
              )}
            </div>
          )}

          </div>

          {/* Processing / Results Section */}
          {(isRunning || stage?.status === 'completed' || stage?.status === 'error') && (
            <div className="space-y-6">
              {/* Progress Bar */}
              {isRunning && (
                <div className="p-5 rounded-lg bg-[#161B22] border border-[rgba(255,255,255,0.06)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#00D4FF] animate-pulse" />
                      <span className="text-[14px] font-medium text-[#E6EDF3]">{sfmProgress?.message || 'Initializing...'}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[13px] font-mono text-[#8B949E]">{formatTime(elapsedSeconds)}</span>
                      <span className="text-[14px] font-mono font-bold text-[#00D4FF]">{sfmProgress?.percentage || 0}%</span>
                    </div>
                  </div>
                  <Progress value={sfmProgress?.percentage || 0} className="h-2 bg-[#0E1117] [&>div]:bg-[#00D4FF]" />
                </div>
              )}

              {/* Results Card */}
              {stage?.status === 'completed' && sfmOutputs && (
                <div className="flex flex-col gap-4 animate-fadeIn">
                  {/* Success header */}
                  <div className="flex items-center gap-3 p-4 bg-green-950/40 border border-green-800/50 rounded-md">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-300">SfM Processing Complete</p>
                      <p className="text-xs text-[#9CA3AF] mt-0.5">
                        Completed in {formatTime(sfmOutputs.processingTimeSeconds ?? 0)} ·
                        GSD: {sfmOutputs.gsdAchieved ? `${sfmOutputs.gsdAchieved.toFixed(2)} cm/px` : 'N/A'} ·
                        GCP RMS: {sfmOutputs.gcpRmsError ? `${(sfmOutputs.gcpRmsError).toFixed(3)} m` : 'GPS only'}
                      </p>
                    </div>
                    <button
                      onClick={handleRunAgain}
                      className="ml-auto flex items-center gap-1 px-3 py-1.5 text-xs text-[#9CA3AF] hover:text-white border border-[rgba(255,255,255,0.1)] rounded transition-colors bg-[#161B22] hover:bg-[#21262D]"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Run Again
                    </button>
                  </div>

                  {/* Asset cards grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(sfmOutputs.assets ?? {}).map(([key, asset]: [string, any]) => (
                      <AssetCard
                        key={key}
                        label={asset.label}
                        type={asset.type}
                        available={asset.available}
                        size={asset.sizeFormatted}
                        downloadUrl={asset.downloadUrl}
                        onPreview={() => handlePreviewAsset(key, asset)}
                        token={token}
                      />
                    ))}
                  </div>

                  {/* Preview Results button */}
                  <button
                    onClick={handlePreviewResults}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-md transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Preview Results in Viewport
                  </button>
                </div>
              )}

              {/* Error State */}
              {stage?.status === 'error' && (
                <div className="p-5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/20 space-y-4">
                  <div className="flex items-center gap-3">
                    <XCircle className="w-5 h-5 text-[#EF4444]" />
                    <div>
                      <h4 className="text-[14px] font-bold text-[#EF4444]">
                        Reconstruction Failure
                      </h4>
                      <p className="text-[12px] text-[#8B949E] mt-0.5">
                        ODM Engine reported a processing error.
                      </p>
                    </div>
                  </div>

                  {error ? (
                    <div className="space-y-4">
                      {/* Summary */}
                      <p className="text-[13px] text-[#E6EDF3] leading-relaxed font-semibold bg-[#201114] p-3 rounded border border-[#EF4444]/20">
                        {error.summary || 'An unknown processing error occurred.'}
                      </p>

                      {/* Causes */}
                      {error.causes && error.causes.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] uppercase tracking-wider text-[#8B949E] font-semibold">Potential Causes</p>
                          <ul className="list-disc pl-5 space-y-1 text-xs text-[#C9D1D9]">
                            {error.causes.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Fixes */}
                      {error.fixes && error.fixes.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] uppercase tracking-wider text-[#8B949E] font-semibold">Recommended Fixes</p>
                          <ul className="list-disc pl-5 space-y-1 text-xs text-[#C9D1D9]">
                            {error.fixes.map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Raw Error Details */}
                      {error.rawError && (
                        <div className="space-y-1.5 pt-2 border-t border-[rgba(255,255,255,0.06)]">
                          <p className="text-[11px] uppercase tracking-wider text-[#8B949E] font-semibold">Raw Engine Error</p>
                          <pre className="text-[11px] text-[#8B949E] font-mono p-2 bg-[#0E1117] rounded border border-[rgba(255,255,255,0.04)] max-h-[120px] overflow-auto whitespace-pre-wrap">
                            {error.rawError}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[13px] text-[#E6EDF3] font-mono bg-black/20 p-3 rounded border border-[rgba(255,255,255,0.05)] leading-relaxed break-all">
                      {stage.errorMessage || 'Unknown SfM engine error. Check ODM node logs.'}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3 pt-2 border-t border-[rgba(255,255,255,0.06)]">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleRetryWithLowerSettings}
                      className="h-8 gap-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 font-semibold"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                      Retry with Lower Quality
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setStageStatus('sfm', 'ready');
                        setError(null);
                        setLocalError(null);
                      }}
                      className="h-8 gap-2 border-[rgba(255,255,255,0.1)] text-[#E6EDF3] hover:bg-[#21262D]"
                    >
                      Reset & Reconfigure
                    </Button>
                    
                    <a
                      href="https://docs.opendronemap.org/flying/"
                      target="_blank"
                      rel="noreferrer"
                      className="h-8 inline-flex items-center gap-1.5 px-3 rounded text-[12px] border border-[rgba(255,255,255,0.06)] text-[#8B949E] hover:text-white hover:bg-[#21262D] transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Data Acquisition Guide
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </StageLayout>

      <ResultsPreview
        stageId="sfm"
        stageName="Sparse Reconstruction"
        isOpen={showResults}
        onClose={() => setShowResults(false)}
      />
    </>
  );
}

function XCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

