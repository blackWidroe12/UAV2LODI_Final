import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { setCachedToken, pipelineApi } from './api';
import { formatError } from './utils';
import type {
  User,
  ProjectConfig,
  Stage,
  StageId,
  StageStatus,
  LogEntry,
  LogLevel,
  ViewportMode,
  CoordinateSystem,
  MapViewState,
  GCPMarker,
  SfMOutputs,
  SfMConfig,
  ViewportLayer2D,
  ViewportLayer3D,
} from './types';

// ============================================================================
// INITIAL STATE DATA
// ============================================================================

const INITIAL_STAGES: Stage[] = [
  {
    id: 'diagnostic',
    name: 'Pre-Flight Diagnostic',
    shortName: 'Diagnostic',
    description: 'AI blur detection and overlap heatmap analysis',
    status: 'ready',
    progress: 0,
    estimatedDuration: 120,
  },
  {
    id: 'intake',
    name: 'Data Intake & GCP Alignment',
    shortName: 'GCP Intake',
    description: 'Interactive ground control point marking',
    status: 'locked',
    progress: 0,
    estimatedDuration: 300,
  },
  {
    id: 'sfm',
    name: 'Sparse Reconstruction',
    shortName: 'SfM',
    description: 'Structure from Motion camera calibration',
    status: 'locked',
    progress: 0,
    estimatedDuration: 600,
  },
  {
    id: 'dense_cloud',
    name: 'Dense Point Cloud',
    shortName: 'Dense Cloud',
    description: 'High-density 3D point generation',
    status: 'locked',
    progress: 0,
    estimatedDuration: 1200,
  },
  {
    id: 'dsm_dtm',
    name: 'Surface Model Generation',
    shortName: 'DSM/DTM',
    description: 'Digital Surface and Terrain models',
    status: 'locked',
    progress: 0,
    estimatedDuration: 480,
  },
  {
    id: 'segmentation',
    name: 'AI Segmentation',
    shortName: 'Segmentation',
    description: 'SwinV2 building footprint extraction',
    status: 'locked',
    progress: 0,
    estimatedDuration: 900,
  },
  {
    id: 'lod_modeling',
    name: 'LoD1/LoD2 Synthesis',
    shortName: 'LoD Modeling',
    description: '3D building model extrusion',
    status: 'locked',
    progress: 0,
    estimatedDuration: 600,
  },
  {
    id: 'validation',
    name: 'Quality Assurance',
    shortName: 'Validation',
    description: 'RMSE accuracy assessment',
    status: 'locked',
    progress: 0,
    estimatedDuration: 180,
  },
  {
    id: 'analytics',
    name: 'Analytics & Volumetrics',
    shortName: 'Analytics',
    description: 'Volume calculations and measurements',
    status: 'locked',
    progress: 0,
    estimatedDuration: 240,
  },
  {
    id: 'export',
    name: 'Deployment & Export',
    shortName: 'Export',
    description: 'Generate deliverables and cloud links',
    status: 'locked',
    progress: 0,
    estimatedDuration: 120,
  },
];

// ============================================================================
// AUTHENTICATION STORE
// ============================================================================

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  rememberMe: boolean;
  sessionChecked: boolean; // Track if we've checked for auto-login

  // Actions
  login: (user: User, token?: string | null) => void;
  logout: () => void;
  updateAvatar: (url: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  setRememberMe: (rememberMe: boolean) => void;
  checkSession: () => Promise<void>; // Auto-login from saved session
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      token: null,
      isLoading: false,
      error: null,
      rememberMe: false,
      sessionChecked: false,

      login: (user, token) => {
        // Cache immediately so the very next fetchApi call has the token
        // before Zustand has flushed the persisted state to localStorage.
        setCachedToken(token ?? null);
        set({ isAuthenticated: true, user, token: token ?? null, error: null });
      },

      logout: () => {
        // Token is in httpOnly cookie — cleared automatically
        setCachedToken(null);
        set({
          isAuthenticated: false,
          user: null,
          token: null,
          error: null,
        });
      },

      updateAvatar: (url) =>
        set((state) => ({
          user: state.user ? { ...state.user, avatarUrl: url } : null,
        })),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error: error ? formatError(error) : null }),

      clearError: () => set({ error: null }),

      setRememberMe: (rememberMe) => set({ rememberMe }),

      checkSession: async () => {
        try {
          // Call /api/auth/me to check session from httpOnly cookie
          const response = await fetch('/api/auth/me', {
            method: 'GET',
            credentials: 'include', // Send cookies
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data) {
              set({
                user: data.data,
                isAuthenticated: true,
                sessionChecked: true,
              });
              return;
            }
          }
        } catch (err) {
          console.error('[auth] Session check failed:', err);
        }

        useAuthStore.getState().logout();
        set({ sessionChecked: true });
      },
    }),
    {
      name: 'uav2lod1-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        rememberMe: state.rememberMe,
        sessionChecked: state.sessionChecked,
      }),
      onRehydrateStorage: () => (_state) => {
        // We rely on httpOnly cookie sessions for auth persistence.
        // No token should be restored from localStorage after refresh.
      },
    }
  )
);

// ============================================================================
// PROJECT STORE
// ============================================================================

interface ProjectState {
  activeProject: ProjectConfig | null;
  recentProjects: ProjectConfig[];
  isProjectLoaded: boolean;
  isLoading: boolean;

  // Actions
  initialize: () => void;
  loadProject: (config: ProjectConfig) => void;
  updateProject: (updates: Partial<ProjectConfig>) => void;
  closeProject: () => void;
  resetProject: () => void;
  setProjects: (projects: ProjectConfig[]) => void;
  addRecentProject: (project: ProjectConfig) => void;
  removeRecentProject: (projectId: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      activeProject: null,
      recentProjects: [],
      isProjectLoaded: false,
      isLoading: false,

      loadProject: (config) => {
        // Reset pipeline state to prevent cross-contamination
        usePipelineStore.getState().resetPipeline();

        set((state) => {
          // Add to recent projects if not already there
          const exists = state.recentProjects.some((p) => p.id === config.id);
          const recentProjects = exists
            ? state.recentProjects.map((p) => (p.id === config.id ? config : p))
            : [config, ...state.recentProjects].slice(0, 10);

          // Persist to sessionStorage (cleared on tab close)
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('activeProject', JSON.stringify({
              id: config.id,
              name: config.name,
            }));
          }

          return {
            activeProject: config,
            isProjectLoaded: true,
            recentProjects,
          };
        });
      },

      initialize: async () => {
        if (typeof window === 'undefined') return;
        
        try {
          const saved = sessionStorage.getItem('activeProject');
          if (saved) {
            const data = JSON.parse(saved);
            if (data.id) {
              set({ isLoading: true });
              
              const res = await fetch(`/api/projects/${data.id}`, { credentials: 'include' });
              if (res.ok) {
                const result = await res.json();
                if (result.success && result.data) {
                  useProjectStore.getState().loadProject(result.data);
                } else {
                  sessionStorage.removeItem('activeProject');
                }
              } else {
                sessionStorage.removeItem('activeProject');
              }
            }
          }
        } catch {
          sessionStorage.removeItem('activeProject');
        } finally {
          set({ isLoading: false });
        }
      },

      updateProject: (updates) =>
        set((state) => ({
          activeProject: state.activeProject
            ? { ...state.activeProject, ...updates, lastModified: new Date().toISOString() }
            : null,
        })),

      closeProject: () => {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('activeProject');
        }
        set({
          activeProject: null,
          isProjectLoaded: false,
        });
      },

      resetProject: () =>
        set({
          activeProject: null,
          isProjectLoaded: false,
        }),

      setProjects: (projects) =>
        set({
          recentProjects: projects.slice(0, 10),
        }),

      addRecentProject: (project) =>
        set((state) => ({
          recentProjects: [
            project,
            ...state.recentProjects.filter((p) => p.id !== project.id),
          ].slice(0, 10),
        })),

      removeRecentProject: (projectId) =>
        set((state) => ({
          recentProjects: state.recentProjects.filter((p) => p.id !== projectId),
        })),

      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'uav2lod1-projects',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        recentProjects: state.recentProjects,
      }),
    }
  )
);

// ============================================================================
// PIPELINE STORE
// ============================================================================

// Drone image type for pipeline processing
export interface DroneImage {
  id: string;
  name: string;
  file: File;
  thumbnailUrl: string;
  size: number;
  sizeFormatted: string;
  extension: string;
  hasGPS: boolean;
  lastModified: Date;
  // Diagnostic results (populated after analysis)
  diagnostics?: {
    blurScore: number;
    exposureScore: number;
    contrast: number;
    brightness: number;
    isUsable: boolean;
  };
}

interface PipelineState {
  // Stage Management
  stages: Stage[];
  activeStageId: StageId;
  isGlobalRunning: boolean;
  runMode: 'sequential' | 'stage-by-stage';

  // Drone Images (loaded from user's local folder)
  droneImages: DroneImage[];
  folderName: string;

  // GCP Data (shared between intake stage and map view)
  gcps: GCPMarker[];
  gcpImportMeta: {
    sourceFile: string;
    crs: string;
    importedAt: number;
    totalImported: number;
    totalRows?: number;
    skippedRows?: number;
  } | null;
  
  // SfM Stage Data
  sfmOutputs: SfMOutputs | null;
  sfmConfig: SfMConfig | null;
  sfmProgress: { percentage: number; message: string } | null;

  // Telemetry & Logs
  logs: LogEntry[];

  // Viewport State
  viewportMode: ViewportMode;
  activeViewportOpen: boolean; // Whether viewport panel is open on current stage
  activeViewportMode: '2d' | '3d' | 'split'; // Current viewport mode
  coordinateSystem: CoordinateSystem;
  mapViewState: MapViewState;
  is3DViewActive: boolean;
  layers2D: ViewportLayer2D[];
  layers3D: ViewportLayer3D[];

  // Console
  isConsoleOpen: boolean;
  consoleHeight: number;

  // Actions
  setActiveStage: (id: StageId) => void;
  updateStage: (id: StageId, updates: Partial<Stage>) => void;
  updateStageStatus: (id: StageId, status: StageStatus) => void;
  updateStageProgress: (id: StageId, progress: number) => void;
  unlockNextStage: (currentStageId: StageId) => void;
  cancelStage: (id: StageId) => void;
  setGlobalRunning: (isRunning: boolean) => void;
  setRunMode: (mode: 'sequential' | 'stage-by-stage') => void;
  addLog: (log: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
  setViewportMode: (mode: ViewportMode) => void;
  setActiveViewportOpen: (open: boolean) => void;
  setActiveViewportMode: (mode: '2d' | '3d' | 'split') => void;
  set2DLayer: (layer: ViewportLayer2D) => void;
  set3DLayer: (layer: ViewportLayer3D) => void;
  openViewport: (mode?: '2d' | '3d' | 'split') => void;
  closeViewport: () => void;
  setCoordinateSystem: (system: CoordinateSystem) => void;
  setMapViewState: (viewState: Partial<MapViewState>) => void;
  set3DViewActive: (active: boolean) => void;
  setConsoleOpen: (open: boolean) => void;
  setConsoleHeight: (height: number) => void;
  resetPipeline: () => void;
  restoreFromPhase: (phaseId: StageId) => void;
  
  // SfM Actions
  setSfMOutputs: (outputs: SfMOutputs | null) => void;
  setSfMConfig: (config: SfMConfig) => void;
  setSfMProgress: (progress: { percentage: number; message: string } | null) => void;
  setStageStatus: (id: StageId, status: StageStatus) => void;
  addConsoleLog: (level: LogLevel, source: string, message: string) => void;
  
  // GCP Actions
  setGcps: (markers: GCPMarker[]) => void;
  setGCPs: (gcps: GCPMarker[], meta: PipelineState['gcpImportMeta']) => void;
  clearGCPs: () => void;
  addGCP: (marker: GCPMarker) => void;
  updateGCP: (id: string, updates: Partial<GCPMarker>) => void;
  removeGCP: (id: string) => void;
  
  // Drone Images Actions
  setDroneImages: (images: DroneImage[], folderName: string) => void;
  updateDroneImageDiagnostics: (id: string, diagnostics: DroneImage['diagnostics']) => void;
  clearDroneImages: () => void;

  // ===== DATABASE SYNC =====
  loadPipelineState: (projectId: string) => Promise<void>;
  setCurrentStageId: (stageId: string) => void;
  setStageProgress: (stageId: string, progress: number, message?: string) => void;
  completeStage: (stageId: string, outputs?: Record<string, any>) => void;
  failStage: (stageId: string, errorMessage: string) => void;
  stageResults?: Record<string, any>;
  currentStageId?: string;
}

const STAGE_ORDER: StageId[] = [
  'diagnostic',
  'intake',
  'sfm',
  'dense_cloud',
  'dsm_dtm',
  'segmentation',
  'lod_modeling',
  'validation',
  'analytics',
  'export',
];

export const usePipelineStore = create<PipelineState>()((set, get) => ({
  stages: INITIAL_STAGES,
  activeStageId: 'diagnostic',
  isGlobalRunning: false,
  runMode: 'stage-by-stage',
  droneImages: [],
  folderName: '',
  gcps: [],
  gcpImportMeta: null,
  logs: [],
  viewportMode: 'split',
  activeViewportOpen: false, // Viewport hidden by default
  activeViewportMode: 'split',
  coordinateSystem: 'wgs84',
  mapViewState: {
    longitude: 29.8587,
    latitude: -17.8292,
    zoom: 12,
    pitch: 0,
    bearing: 0,
  },
  is3DViewActive: false,
  layers2D: [],
  layers3D: [],
  isConsoleOpen: false,
  consoleHeight: 200,
  sfmOutputs: null,
  sfmConfig: null,
  sfmProgress: null,

  setActiveStage: (id) => set({ 
    activeStageId: id, 
    activeViewportOpen: false, // Close viewport when changing stages
    activeViewportMode: 'split', // Reset to default
  }),

  updateStage: (id, updates) =>
    set((state) => ({
      stages: state.stages.map((stage) =>
        stage.id === id ? { ...stage, ...updates } : stage
      ),
    })),

  updateStageStatus: (id, status) =>
    set((state) => ({
      stages: state.stages.map((stage) =>
        stage.id === id ? { ...stage, status } : stage
      ),
    })),

  updateStageProgress: (id, progress) =>
    set((state) => ({
      stages: state.stages.map((stage) =>
        stage.id === id ? { ...stage, progress: Math.min(100, Math.max(0, progress)) } : stage
      ),
    })),
  // Unlock the next stage and navigate to it
  unlockNextStage: (currentStageId) => {
    const currentIndex = STAGE_ORDER.indexOf(currentStageId);
    if (currentIndex < STAGE_ORDER.length - 1) {
      const nextStageId = STAGE_ORDER[currentIndex + 1];
      set((state) => ({
        stages: state.stages.map((stage) =>
          stage.id === nextStageId && stage.status === 'locked'
            ? { ...stage, status: 'ready' }
            : stage
        ),
      }));
      // Move to the next stage
      get().setStageStatus(nextStageId, 'ready');
      get().setCurrentStageId(nextStageId);
      console.log('[pipeline] Unlocked and moved to stage:', nextStageId);
    }
  },


  cancelStage: (id) => {
    const state = get();
    const stage = state.stages.find((s) => s.id === id);
    if (stage && stage.status === 'processing') {
      set((state) => ({
        stages: state.stages.map((s) =>
          s.id === id ? { ...s, status: 'ready', progress: 0 } : s
        ),
      }));
      state.addLog({
        level: 'warn',
        message: `Cancelled by user`,
        source: id,
      });
    }
  },

  setGlobalRunning: (isRunning) => set({ isGlobalRunning: isRunning }),

  setRunMode: (mode) => set({ runMode: mode }),

  addLog: (log) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          ...log,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      ].slice(-500),
    })),

  clearLogs: () => set({ logs: [] }),

  setViewportMode: (mode) => set({ viewportMode: mode }),

  setActiveViewportOpen: (open) => set({ activeViewportOpen: open }),
  
  setActiveViewportMode: (mode) => set({ activeViewportMode: mode }),
  
  set2DLayer: (layer) => set((state) => {
    const existing = state.layers2D.findIndex(l => l.id === layer.id);
    if (existing >= 0) {
      const newLayers = [...state.layers2D];
      newLayers[existing] = layer;
      return { layers2D: newLayers };
    }
    return { layers2D: [...state.layers2D, layer] };
  }),

  set3DLayer: (layer) => set((state) => {
    const existing = state.layers3D.findIndex(l => l.id === layer.id);
    if (existing >= 0) {
      const newLayers = [...state.layers3D];
      newLayers[existing] = layer;
      return { layers3D: newLayers };
    }
    return { layers3D: [...state.layers3D, layer] };
  }),

  openViewport: (mode) => set((state) => ({ 
    activeViewportOpen: true,
    activeViewportMode: mode || state.activeViewportMode,
  })),
  
  closeViewport: () => set({ activeViewportOpen: false }),

  setCoordinateSystem: (system) => set({ coordinateSystem: system }),

  setMapViewState: (viewState) =>
    set((state) => ({
      mapViewState: { ...state.mapViewState, ...viewState },
    })),

  set3DViewActive: (active) => set({ is3DViewActive: active }),

  setConsoleOpen: (open) => set({ isConsoleOpen: open }),

  setConsoleHeight: (height) => set({ consoleHeight: Math.max(100, Math.min(500, height)) }),

  resetPipeline: () =>
    set({
      // Stages
      stages: INITIAL_STAGES,
      activeStageId: 'diagnostic',
      isGlobalRunning: false,
      runMode: 'stage-by-stage',

      // Drone images and GCP data
      droneImages: [],
      folderName: '',
      gcps: [],
      gcpImportMeta: null,

      // SfM data
      sfmOutputs: null,
      sfmConfig: null,
      sfmProgress: null,
      stageResults: {},

      // Viewport and layers
      activeViewportOpen: false,
      activeViewportMode: 'split',
      layers2D: [],
      layers3D: [],
      is3DViewActive: false,

      // Console and logs


      logs: [],

      // Coordinates
      coordinateSystem: 'wgs84',
      mapViewState: {
        longitude: 29.8587,
        latitude: -17.8292,
        zoom: 12,
        pitch: 0,
        bearing: 0,
      },
    }),

  restoreFromPhase: (phaseId) => {
    const phaseIndex = STAGE_ORDER.indexOf(phaseId);
    set((state) => ({
      stages: state.stages.map((stage, index) => {
        const stageIndex = STAGE_ORDER.indexOf(stage.id);
        if (stageIndex < phaseIndex) {
          return { ...stage, status: 'completed', progress: 100 };
        } else if (stageIndex === phaseIndex) {
          return { ...stage, status: 'ready', progress: 0 };
        } else {
          return { ...stage, status: 'locked', progress: 0 };
        }
      }),
      activeStageId: phaseId,
    }));
  },

  // GCP Actions
  setGcps: (markers) => set({ gcps: markers }),
  
  setGCPs: (gcps, meta) => set({ gcps, gcpImportMeta: meta }),
  
  clearGCPs: () => set({ gcps: [], gcpImportMeta: null }),
  
  addGCP: (marker) =>
    set((state) => ({
      gcps: [...state.gcps, marker],
    })),
  
  updateGCP: (id, updates) =>
    set((state) => ({
      gcps: state.gcps.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),
  
  removeGCP: (id) =>
    set((state) => ({
      gcps: state.gcps.filter((m) => m.id !== id),
    })),

  // Drone Images Actions
  setDroneImages: (images, folderName) => set({ droneImages: images, folderName }),
  
  updateDroneImageDiagnostics: (id, diagnostics) =>
    set((state) => ({
      droneImages: state.droneImages.map((img) =>
        img.id === id ? { ...img, diagnostics } : img
      ),
    })),
  
  clearDroneImages: () => set({ droneImages: [], folderName: '' }),

  // SfM Actions implementation
  setSfMOutputs: (outputs) => set({ sfmOutputs: outputs }),
  setSfMConfig: (config) => set({ sfmConfig: config }),
  setSfMProgress: (progress) => set({ sfmProgress: progress }),
  setStageStatus: (id, status) => {
    get().updateStageStatus(id, status);
    const activeProject = useProjectStore.getState().activeProject;
    if (!activeProject) return;
    set(state => ({
      stageResults: {
        ...(state.stageResults || {}),
        [id]: { ...(state.stageResults?.[id] || {}), status },
      },
    }));
    pipelineApi.saveStageStatus(activeProject.id, id, status).catch(err =>
      console.error('[pipeline-store] save stage status', err)
    );
  },
  addConsoleLog: (level, source, message) => get().addLog({ level, source, message }),

  // ===== DATABASE SYNC =====

  loadPipelineState: async (projectId: string) => {
    try {
      console.log('[pipeline-store] Loading state for project:', projectId);
      const res = await pipelineApi.getPipelineState(projectId);
      if (!res.success || !res.data) return;
      const state = res.data;

      set({ currentStageId: state.currentStageId });

      const stageResults: Record<string, any> = {};
      for (const sp of state.stageProgresses) {
        stageResults[sp.stageId] = {
          status: sp.status,
          progress: sp.progress,
          progressMessage: sp.progressMessage,
          startedAt: sp.startedAt ? new Date(sp.startedAt).getTime() : null,
          completedAt: sp.completedAt ? new Date(sp.completedAt).getTime() : null,
          processingTimeSeconds: sp.processingTimeSeconds,
          errorMessage: sp.errorMessage,
          metadata: sp.metadata,
          outputs: sp.outputs,
        };
      }
      set({ stageResults });

      set({
        activeViewportMode: (state.viewportMode as any) ?? 'split',
        activeViewportOpen: state.activeViewportOpen ?? false,
      });
      console.log('[pipeline-store] State loaded from database');
    } catch (err) {
      console.error('[pipeline-store] loadPipelineState error', err);
    }
  },

  setCurrentStageId: (stageId: string) => {
    set({
      activeStageId: stageId as StageId,
      currentStageId: stageId,
      activeViewportOpen: false,
      activeViewportMode: 'split',
    });
    const activeProject = useProjectStore.getState().activeProject;
    if (!activeProject) return;
    pipelineApi.savePipelineState(activeProject.id, { currentStageId: stageId }).catch(err =>
      console.error('[pipeline-store] save currentStageId', err)
    );
  },

  setStageProgress: (stageId: string, progress: number, message?: string) => {
    const activeProject = useProjectStore.getState().activeProject;
    if (!activeProject) return;
    set(state => ({
      stageResults: {
        ...(state.stageResults || {}),
        [stageId]: {
          ...(state.stageResults?.[stageId] || {}),
          progress,
          progressMessage: message,
        },
      },
    }));
    pipelineApi.saveStageProgress(activeProject.id, {
      stageId,
      status: 'processing',
      progress,
      progressMessage: message,
    }).catch(err => console.error('[pipeline-store] save stage progress', err));
  },

  completeStage: (stageId: string, outputs?: Record<string, any>) => {
    const activeProject = useProjectStore.getState().activeProject;
    if (!activeProject) return;
    const now = Date.now();
    const startedAt = get().stageResults?.[stageId]?.startedAt ?? now;
    const processingTimeSeconds = Math.floor((now - startedAt) / 1000);
    set(state => ({
      stageResults: {
        ...(state.stageResults || {}),
        [stageId]: {
          ...(state.stageResults?.[stageId] || {}),
          status: 'completed',
          completedAt: now,
          processingTimeSeconds,
          outputs,
        },
      },
    }));
    pipelineApi.completeStage(activeProject.id, stageId, outputs).catch(err =>
      console.error('[pipeline-store] completeStage save', err)
    );
  },

  failStage: (stageId: string, errorMessage: string) => {
    const activeProject = useProjectStore.getState().activeProject;
    if (!activeProject) return;
    set(state => ({
      stageResults: {
        ...(state.stageResults || {}),
        [stageId]: {
          ...(state.stageResults?.[stageId] || {}),
          status: 'error',
          errorMessage,
          completedAt: Date.now(),
        },
      },
    }));
    pipelineApi.failStage(activeProject.id, stageId, errorMessage).catch(err =>
      console.error('[pipeline-store] failStage save', err)
    );
  },
}));

// ============================================================================
// UI STORE (for global UI state)
// ============================================================================

interface UIState {
  theme: 'dark' | 'light';
  sidebarCollapsed: boolean;
  showGhostRun: boolean;
  currentView: 'auth' | 'hangar' | 'cockpit';

  // Actions
  setTheme: (theme: 'dark' | 'light') => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setShowGhostRun: (show: boolean) => void;
  setCurrentView: (view: 'auth' | 'hangar' | 'cockpit') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      showGhostRun: false,
      currentView: 'auth',

      setTheme: (theme) => set({ theme }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setShowGhostRun: (show) => set({ showGhostRun: show }),

      setCurrentView: (view) => set({ currentView: view }),
    }),
    {
      name: 'uav2lod1-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);

// ============================================================================
// HELPER HOOKS
// ============================================================================

export const useCurrentStage = () => {
  const { stages, activeStageId } = usePipelineStore();
  return stages.find((s) => s.id === activeStageId) || stages[0];
};

export const useCompletedStagesCount = () => {
  const { stages } = usePipelineStore();
  return stages.filter((s) => s.status === 'completed').length;
};

export const usePipelineProgress = () => {
  const { stages } = usePipelineStore();
  const totalProgress = stages.reduce((acc, stage) => acc + stage.progress, 0);
  return totalProgress / stages.length;
};
