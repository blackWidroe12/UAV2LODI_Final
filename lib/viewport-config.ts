import type { StageId } from './types';

/**
 * Viewport availability configuration per pipeline stage.
 * This is the single source of truth for which viewports are available on each stage.
 */

export type ViewportModeType = '2d' | '3d' | 'split';

export interface StageViewportConfig {
  /** Whether any viewport is available on this stage */
  available: boolean;
  /** Which viewport modes are permitted on this stage */
  modes: ViewportModeType[];
  /** The default mode when the viewport is opened (null if no viewport available) */
  defaultMode: ViewportModeType | null;
  /** The label for the "Open Viewport" button */
  openButtonLabel: string | null;
  /** Default split sizes: [stagePanel, viewport] as percentages */
  defaultSplitSizes: [number, number];
}

/**
 * Viewport availability rules:
 * 
 * | Stage          | Viewport Available | Default Mode           |
 * |----------------|-------------------|------------------------|
 * | 1 - Diagnostic | None              | Full-width stage panel |
 * | 2 - Intake     | 2D Map only       | Hidden until called    |
 * | 3 - SfM        | None              | Full-width stage panel |
 * | 4 - Dense Cloud| 3D only           | Hidden until called    |
 * | 5 - DSM/DTM    | Both (Split)      | Hidden until called    |
 * | 6 - Segmentation| None             | Full-width stage panel |
 * | 7 - LoD Modeling| 3D only          | Hidden until called    |
 * | 8 - Validation | 3D only           | Hidden until called    |
 * | 9 - Analytics  | None              | Full-width stage panel |
 * | 10 - Export    | None              | Full-width stage panel |
 */
export const STAGE_VIEWPORT_CONFIG: Record<StageId, StageViewportConfig> = {
  diagnostic: {
    available: false,
    modes: [],
    defaultMode: null,
    openButtonLabel: null,
    defaultSplitSizes: [100, 0],
  },
  intake: {
    available: true,
    modes: ['2d'],
    defaultMode: '2d',
    openButtonLabel: 'Open 2D Map',
    defaultSplitSizes: [40, 60],
  },
  sfm: {
    available: false,
    modes: [],
    defaultMode: null,
    openButtonLabel: null,
    defaultSplitSizes: [100, 0],
  },
  dense_cloud: {
    available: true,
    modes: ['3d'],
    defaultMode: '3d',
    openButtonLabel: 'Open 3D View',
    defaultSplitSizes: [35, 65],
  },
  dsm_dtm: {
    available: true,
    modes: ['2d', '3d', 'split'],
    defaultMode: 'split',
    openButtonLabel: 'Open Split View',
    defaultSplitSizes: [30, 70],
  },
  segmentation: {
    available: false,
    modes: [],
    defaultMode: null,
    openButtonLabel: null,
    defaultSplitSizes: [100, 0],
  },
  lod_modeling: {
    available: true,
    modes: ['3d'],
    defaultMode: '3d',
    openButtonLabel: 'Open 3D View',
    defaultSplitSizes: [35, 65],
  },
  validation: {
    available: true,
    modes: ['3d'],
    defaultMode: '3d',
    openButtonLabel: 'Open 3D View',
    defaultSplitSizes: [35, 65],
  },
  analytics: {
    available: false,
    modes: [],
    defaultMode: null,
    openButtonLabel: null,
    defaultSplitSizes: [100, 0],
  },
  export: {
    available: false,
    modes: [],
    defaultMode: null,
    openButtonLabel: null,
    defaultSplitSizes: [100, 0],
  },
};

/**
 * Helper to check if a stage has viewport available
 */
export function hasViewportAvailable(stageId: StageId): boolean {
  return STAGE_VIEWPORT_CONFIG[stageId]?.available ?? false;
}

/**
 * Helper to get permitted modes for a stage
 */
export function getPermittedModes(stageId: StageId): ViewportModeType[] {
  return STAGE_VIEWPORT_CONFIG[stageId]?.modes ?? [];
}

/**
 * Helper to check if a specific mode is permitted on a stage
 */
export function isModePermitted(stageId: StageId, mode: ViewportModeType): boolean {
  return STAGE_VIEWPORT_CONFIG[stageId]?.modes.includes(mode) ?? false;
}
