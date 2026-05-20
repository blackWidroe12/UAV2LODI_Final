// ============================================================================
// UAV2LoD1-ZW Frontend Types
// ============================================================================

// User & Authentication
export type User = {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  department: string;
  avatarUrl?: string | null;
  passwordHash?: string; // Optional for frontend
  emailVerified?: boolean;
  isActive?: boolean;
  createdAt?: string;
};

// Project Configuration
export type ProjectConfig = {
  id: string;
  userId: string;
  name: string;
  directoryPath: string;
  crs: string; // e.g., 'EPSG:32736' (UTM 36S)
  createdAt: string;
  lastModified: string;
  lastCompletedPhase: StageId | null;
  flightParams: {
    altitude: number;
    frontOverlap: number;
    sideOverlap: number;
    sensorWidth: number;
  };
  processingOptions: {
    engine: 'odm' | 'pix4d';
    gsd: number;
    useGcp: boolean;
  };
  settings?: {
    processing: {
      qualityPreset: 'draft' | 'medium' | 'high' | 'ultra';
      gpuAcceleration: boolean;
      maxMemoryGb: number;
      cpuThreads: 'auto' | number;
    };
    crs: {
      defaultCrs: string;
      displayFormat: 'dd' | 'dms' | 'utm';
      verticalDatum: 'egm96' | 'egm2008' | 'ellipsoidal';
    };
    gcpImport: {
      csvFormat: 'name_xyz' | 'name_latlon';
      coordinateOrder: 'latlon' | 'lonlat';
      accuracyThresholdMeters: number;
    };
  };
  imageCount?: number;
  areaHectares?: number;
};

// Pipeline Stages
export type StageId =
  | 'diagnostic'
  | 'intake'
  | 'sfm'
  | 'dense_cloud'
  | 'dsm_dtm'
  | 'segmentation'
  | 'lod_modeling'
  | 'validation'
  | 'analytics'
  | 'export';

export type StageStatus = 'locked' | 'ready' | 'processing' | 'completed' | 'error';

export interface Stage {
  id: StageId;
  name: string;
  shortName: string;
  description: string;
  status: StageStatus;
  progress: number; // 0 to 100
  errorMessage?: string;
  estimatedDuration?: number; // in seconds
  actualDuration?: number;
}

// Logging
export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug';

export type LogEntry = {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  source: string; // e.g., 'system', 'sfm-engine', 'swinv2'
};

// Viewport & Map
export type ViewportMode = '2d-only' | '3d-only' | 'split';

export type CoordinateSystem = 'wgs84' | 'utm36s' | 'lo33';

export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

// Viewport Layers
export interface ViewportLayer2D {
  id: string;
  type: 'raster' | 'vector' | 'geojson';
  url: string;
  label: string;
  visible: boolean;
  token?: string;
}

export interface ViewportLayer3D {
  id: string;
  type: 'pointcloud' | 'mesh';
  url: string;
  label: string;
  visible: boolean;
  token?: string;
}

// GCP (Ground Control Points)
export interface GCPMarker {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  elevation: number;
  imageX?: number;
  imageY?: number;
  imageId?: string;
  isVerified: boolean;
  accuracyH?: number;
  accuracyV?: number;
  description?: string;
}

// Diagnostic Analysis
export interface ImageDiagnostic {
  id: string;
  filename: string;
  blurScore: number; // 0-100, lower is blurrier
  exposureScore: number;
  overlapPercent: number;
  hasMetadata: boolean;
  gpsValid: boolean;
  thumbnail?: string;
}

// Validation Metrics
export interface ValidationMetrics {
  rmseX: number;
  rmseY: number;
  rmseZ: number;
  positionalAccuracy: number;
  relativeAccuracy: number;
  gcpResiduals: { id: string; residual: number }[];
}

// Analytics / Volumetrics
export interface VolumeAnalysis {
  polygonCoordinates: [number, number][];
  cutVolume: number; // cubic meters
  fillVolume: number;
  netVolume: number;
  surfaceArea: number;
}

// Export Options
export type ExportFormat = 'cityjson' | 'geopackage' | 'obj' | 'geojson' | 'las' | 'tiff';

export interface ExportConfig {
  format: ExportFormat;
  includeTextures: boolean;
  lodLevel: 1 | 2;
  cloudUrl?: string;
}

// Ghost Run Timeline
export interface GhostRunEstimate {
  stageId: StageId;
  estimatedStart: Date;
  estimatedEnd: Date;
  estimatedDurationMinutes: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SSEMessage {
  type: 'progress' | 'log' | 'complete' | 'error';
  stageId?: StageId;
  progress?: number;
  message?: string;
  level?: LogLevel;
}

// SfM Types
export interface SfMConfig {
  odmNodeUrl: string;
  odmNodePort: number;
  featureQuality: 'ultra' | 'high' | 'medium' | 'draft';
  pointCloudQuality: 'ultra' | 'high' | 'medium' | 'draft';
  meshSize: number;
  desiredGSD: number;
  useGCPs: boolean;
  minNumFeatures: number;
  pcFilteringDistance: number;
  fastOrthophoto?: boolean;
  skipOrthophoto?: boolean;
  useHybridMesh?: boolean;
}

export interface SfMOutputs {
  orthoPath: string | null;
  dsmPath: string | null;
  dtmPath: string | null;
  pointCloudPath: string | null;
  gcpReportPath: string | null;
  gsdAchieved: number | null;
  gcpRmsError: number | null;
  processingTimeSeconds: number | null;
  taskId: string | null;
  completedAt: number | null;
  assets?: Record<string, any>;
}

export interface StageResult {
  stageId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  outputs: SfMOutputs | null;
}

export interface GCPImportMeta {
  sourceFile: string;
  crs: string;
  importedAt: number;
  totalImported: number;
  totalRows: number;
  skippedRows: number;
}
