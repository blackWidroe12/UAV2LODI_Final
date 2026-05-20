// ============================================================================
// Settings Configuration - Tier 1 Essential Settings
// ============================================================================

export interface ProcessingSettings {
  qualityPreset: 'draft' | 'medium' | 'high' | 'ultra';
  gpuAcceleration: boolean;
  maxMemoryGb: number; // 4-32
  cpuThreads: 'auto' | number; // auto or 1-16
}

export interface CRSSettings {
  defaultCrs: string; // EPSG code or custom identifier
  displayFormat: 'dd' | 'dms' | 'utm'; // Decimal Degrees, DMS, UTM
  verticalDatum: 'egm96' | 'egm2008' | 'ellipsoidal';
}

export interface GCPImportSettings {
  csvFormat: 'name_xyz' | 'name_latlon'; // Name,X,Y,Z or Name,Lat,Lon,Elev
  coordinateOrder: 'latlon' | 'lonlat';
  accuracyThresholdMeters: number; // RMSE warning threshold
}

export interface Tier1Settings {
  processing: ProcessingSettings;
  crs: CRSSettings;
  gcpImport: GCPImportSettings;
}

// ============================================================================
// Default Settings
// ============================================================================

export const DEFAULT_TIER1_SETTINGS: Tier1Settings = {
  processing: {
    qualityPreset: 'high',
    gpuAcceleration: true,
    maxMemoryGb: 16,
    cpuThreads: 'auto',
  },
  crs: {
    defaultCrs: 'EPSG:32736', // UTM 36S (Zimbabwe default)
    displayFormat: 'dd',
    verticalDatum: 'egm96',
  },
  gcpImport: {
    csvFormat: 'name_xyz',
    coordinateOrder: 'lonlat',
    accuracyThresholdMeters: 0.05,
  },
};

// ============================================================================
// Options Lists
// ============================================================================

export const QUALITY_PRESETS = [
  { value: 'draft', label: 'Draft', description: 'Fast processing, lower quality' },
  { value: 'medium', label: 'Medium', description: 'Balanced speed and quality' },
  { value: 'high', label: 'High', description: 'Recommended for production' },
  { value: 'ultra', label: 'Ultra', description: 'Maximum quality, longer processing' },
];

export const CRS_OPTIONS = [
  { value: 'EPSG:32736', label: 'UTM 36S', region: 'Zimbabwe' },
  { value: 'EPSG:32735', label: 'UTM 35S', region: 'Zimbabwe' },
  { value: 'EPSG:4326', label: 'WGS 84', region: 'Global' },
  { value: 'Lo33', label: 'Lo 33', region: 'Zimbabwe' },
];

export const DISPLAY_FORMATS = [
  { value: 'dd', label: 'Decimal Degrees (DD)', example: '-17.8234°, 29.8542°' },
  { value: 'dms', label: 'Degrees Minutes Seconds (DMS)', example: '17°49\'24.24"S' },
  { value: 'utm', label: 'UTM', example: '36S 12345 8023456' },
];

export const VERTICAL_DATUMS = [
  { value: 'egm96', label: 'EGM96' },
  { value: 'egm2008', label: 'EGM2008' },
  { value: 'ellipsoidal', label: 'Ellipsoidal' },
];

export const CSV_FORMATS = [
  { value: 'name_xyz', label: 'Name,X,Y,Z', example: 'GCP_001,29.8542,-17.8234,1234.5' },
  { value: 'name_latlon', label: 'Name,Lat,Lon,Elev', example: 'GCP_001,-17.8234,29.8542,1234.5' },
];

export const COORDINATE_ORDERS = [
  { value: 'latlon', label: 'Latitude, Longitude (Lat/Lon)' },
  { value: 'lonlat', label: 'Longitude, Latitude (Lon/Lat)' },
];

export const CPU_THREAD_OPTIONS = [
  { value: 'auto', label: 'Auto (System Default)' },
  ...Array.from({ length: 16 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1} Thread${i === 0 ? '' : 's'}`,
  })),
];

export const MEMORY_ALLOCATION_OPTIONS = [
  { value: 4, label: '4 GB' },
  { value: 8, label: '8 GB' },
  { value: 16, label: '16 GB (Default)' },
  { value: 24, label: '24 GB' },
  { value: 32, label: '32 GB' },
];
