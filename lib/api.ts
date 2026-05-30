import type {
  User,
  ProjectConfig,
  StageId,
  ApiResponse,
  SSEMessage,
  ImageDiagnostic,
  GCPMarker,
  ValidationMetrics,
  VolumeAnalysis,
  ExportConfig,
} from './types';

// ============================================================================
// API Configuration & Token Caching
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * Token cache — stored on globalThis so it survives HMR module re-evaluation
 * without requiring a page reload.
 */
declare global {
  // eslint-disable-next-line no-var
  var __tokenCache: { token: string | null; timestamp: number } | undefined;
}

if (!globalThis.__tokenCache) {
  globalThis.__tokenCache = { token: null, timestamp: 0 };
}

const tokenCache = globalThis.__tokenCache;

// How long (ms) the in-memory cache is considered fresh before we re-read
// localStorage. 30 s is plenty — the only realistic staleness scenario is a
// token change in another tab, which is rare.
const CACHE_TTL = 30_000;

/**
 * Return the current auth token.
 * Priority:
 *   1. In-memory cache (if fresh)
 *   2. Zustand localStorage entry  (synchronous fallback)
 *   3. null
 */
function getCachedToken(): string | null {
  // 1. Fresh in-memory cache
  if (tokenCache.token && Date.now() - tokenCache.timestamp < CACHE_TTL) {
    return tokenCache.token;
  }

  // 2. Synchronous localStorage fallback
  try {
    const raw = localStorage.getItem('uav2lod1-auth');
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
      const t = parsed?.state?.token ?? null;
      tokenCache.token = t;
      tokenCache.timestamp = Date.now();
      return t;
    }
  } catch {
    // localStorage unavailable (SSR or private-browsing edge case)
  }

  return null;
}

/**
 * Explicitly set the cached token — called by the Zustand auth store
 * immediately after login/register/rehydration so the very next API call
 * has the token without waiting for Zustand to flush to localStorage.
 */
export function setCachedToken(token: string | null) {
  tokenCache.token = token;
  tokenCache.timestamp = token ? Date.now() : 0;
}

/**
 * Get auth headers for API requests
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getCachedToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Safe fetch wrapper that checks for HTML responses (missing API routes)
 * and throws an error instead of trying to parse HTML as JSON.
 */
async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, options);
  
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('text/html')) {
    throw new Error(`API route not found: ${url} — returned HTML instead of JSON`);
  }
  
  return response;
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit & { skipContentType?: boolean } = {}
): Promise<ApiResponse<T>> {
  try {
    const token = getCachedToken();
    const { skipContentType = false, ...requestOptions } = options as any;

    const headers = new Headers(requestOptions.headers ?? {});

    // Only set Content-Type if not FormData and not skipped
    if (!skipContentType && !(requestOptions.body instanceof FormData)) {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    }

    // Add auth token if we have one in memory
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...requestOptions,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, any>;
      let errorMsg = body.error || body.detail || response.statusText;

      // Ensure error is always a string, not an object
      if (typeof errorMsg === 'object') {
        errorMsg = errorMsg?.message || JSON.stringify(errorMsg);
      }
      errorMsg = String(errorMsg);

      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          // Dynamic import to avoid circular dependencies
          import('./stores').then(({ useAuthStore }) => {
            useAuthStore.getState().logout();
            window.location.href = '/';
          });
        }
      }

      // Intercept 404 project not found
      if (response.status === 404) {
        const lowerError = errorMsg.toLowerCase();
        const codeStr = body.error && typeof body.error === 'object' ? String(body.error.code).toLowerCase() : '';
        const msgStr = body.error && typeof body.error === 'object' ? String(body.error.message).toLowerCase() : '';

        if (
          lowerError.includes('project not found') ||
          codeStr === 'not_found' ||
          msgStr.includes('project not found')
        ) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('project-not-found'));
          }
        }
      }

      return { success: false, error: errorMsg };
    }

    // Every API route responds with { success: true, data: <payload> }.
    // Unwrap so callers receive the inner payload directly.
    const body = await response.json() as { success: boolean; data: T };
    return { success: true, data: body.data ?? (body as unknown as T) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export function uploadFile<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
  return fetchApi<T>(endpoint, {
    method: 'POST',
    body: formData,
    skipContentType: true,
  });
}

// ============================================================================
// Authentication API
// ============================================================================

export const authApi = {
  login: (credentials: { email: string; password: string; rememberMe?: boolean }) =>
    fetchApi<{ user: User; token?: string; rememberMe?: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  register: (userData: {
    email: string;
    password: string;
    username: string;
    firstName: string;
    lastName: string;
    department: string;
  }) =>
    fetchApi<{ user: User; token?: string; requiresVerification?: boolean; verificationCode?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

  // Email/Username availability checks
  checkEmail: (email: string) =>
    fetchApi<{ available: boolean; reason: string | null }>('/auth/check-email', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  checkUsername: (username: string) =>
    fetchApi<{ available: boolean; reason: string | null }>('/auth/check-username', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  // Email verification
  sendVerification: (email: string) =>
    fetchApi<{ message: string; expiresIn: number; code?: string }>('/auth/send-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyEmail: (email: string, code: string) =>
    fetchApi<{ verified: boolean; message: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),

  // Password reset
  forgotPassword: (email: string) =>
    fetchApi<{ message: string; token?: string; resetUrl?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  validateResetToken: (token: string) =>
    fetchApi<{ valid: boolean; email?: string }>(`/auth/reset-password?token=${token}`),

  resetPassword: (token: string, password: string, confirmPassword: string) =>
    fetchApi<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password, confirmPassword }),
    }),

  uploadAvatar: async (file: File, authToken?: string): Promise<ApiResponse<{ avatarUrl: string }>> => {
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const token = authToken ?? getCachedToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await fetch(`${API_BASE_URL}/auth/avatar`, {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) return { success: false, error: 'Failed to upload avatar' };

      const data = await response.json() as { avatarUrl: string };
      return { success: true, data };
    } catch {
      return { success: false, error: 'Network error' };
    }
  },

  getCurrentUser: () => fetchApi<User>('/auth/me'),

  logout: () => fetchApi<void>('/auth/logout', { method: 'POST' }),
};

// ============================================================================
// Project API
// ============================================================================

export const projectApi = {
  list: () => fetchApi<ProjectConfig[]>('/projects'),

  get: (projectId: string) => fetchApi<ProjectConfig>(`/projects/${projectId}`),

  create: (data: { name: string; directoryPath: string; crs?: string }) =>
    fetchApi<ProjectConfig>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (projectId: string, updates: Partial<ProjectConfig>) =>
    fetchApi<ProjectConfig>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: (projectId: string) =>
    fetchApi<void>(`/projects/${projectId}`, { method: 'DELETE' }),
};

// ============================================================================
// Pipeline Stage APIs
// ============================================================================

export const pipelineApi = {
  runDiagnostic: (projectId: string) =>
    fetchApi<{ diagnostics: ImageDiagnostic[]; overlapHeatmap: string }>(
      `/projects/${projectId}/stages/diagnostic`,
      { method: 'POST' }
    ),

  getGCPs: (projectId: string) =>
    fetchApi<GCPMarker[]>(`/projects/${projectId}/gcps`),

  saveGCPs: (projectId: string, gcps: GCPMarker[]) =>
    fetchApi<void>(`/projects/${projectId}/gcps`, {
      method: 'PUT',
      body: JSON.stringify(gcps),
    }),

  runIntake: (projectId: string) =>
    fetchApi<void>(`/projects/${projectId}/stages/intake`, { method: 'POST' }),

  runSfM: (projectId: string) =>
    fetchApi<{ cameraPositions: Array<{ x: number; y: number; z: number; rotation: number[] }> }>(
      `/projects/${projectId}/stages/sfm`,
      { method: 'POST' }
    ),

  runDenseCloud: (projectId: string, options?: { quality: 'low' | 'medium' | 'high' }) =>
    fetchApi<{ pointCloudUrl: string; pointCount: number }>(
      `/projects/${projectId}/stages/dense_cloud`,
      { method: 'POST', body: JSON.stringify(options || {}) }
    ),

  runDsmDtm: (projectId: string) =>
    fetchApi<{ dsmUrl: string; dtmUrl: string; orthoUrl: string }>(
      `/projects/${projectId}/stages/dsm_dtm`,
      { method: 'POST' }
    ),

  runSegmentation: (projectId: string) =>
    fetchApi<{ footprintsGeoJson: string; buildingCount: number }>(
      `/projects/${projectId}/stages/segmentation`,
      { method: 'POST' }
    ),

  runLodModeling: (projectId: string, options?: { lodLevel: 1 | 2 }) =>
    fetchApi<{ modelUrl: string; buildingCount: number }>(
      `/projects/${projectId}/stages/lod_modeling`,
      { method: 'POST', body: JSON.stringify(options || { lodLevel: 1 }) }
    ),

  runValidation: (projectId: string) =>
    fetchApi<ValidationMetrics>(`/projects/${projectId}/stages/validation`, {
      method: 'POST',
    }),

  calculateVolume: (projectId: string, polygon: [number, number][]) =>
    fetchApi<VolumeAnalysis>(`/projects/${projectId}/analytics/volume`, {
      method: 'POST',
      body: JSON.stringify({ polygon }),
    }),

  exportProject: (projectId: string, config: ExportConfig) =>
    fetchApi<{ downloadUrl: string; cloudUrl?: string }>(
      `/projects/${projectId}/export`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  runStage: (projectId: string, stageId: StageId, options?: Record<string, unknown>) =>
    fetchApi<unknown>(`/projects/${projectId}/stages/${stageId}`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  runAll: (projectId: string) =>
    fetchApi<void>(`/projects/${projectId}/run-all`, { method: 'POST' }),

  getPipelineState: (projectId: string) =>
    fetchApi<{
      currentStageId: string;
      overallProgress: number;
      isProcessing: boolean;
      viewportMode: string;
      activeViewportOpen: boolean;
      stageProgresses: Array<{
        stageId: string;
        status: string;
        progress: number;
        progressMessage: string | null;
        startedAt: string | null;
        completedAt: string | null;
        processingTimeSeconds: number | null;
        errorMessage: string | null;
        metadata: any;
        outputs: any;
      }>;
      lastActivityAt: string | null;
    }>(`/projects/${projectId}/pipeline/state`),

  savePipelineState: (projectId: string, data: any) =>
    fetchApi<void>(`/projects/${projectId}/pipeline/state`, {
      method: 'POST',
      body: JSON.stringify({ action: 'saveState', data }),
    }),

  saveStageProgress: (projectId: string, stageData: any) =>
    fetchApi<void>(`/projects/${projectId}/pipeline/state`, {
      method: 'POST',
      body: JSON.stringify({ action: 'saveProgress', stageData }),
    }),

  saveStageStatus: (projectId: string, stageId: string, status: string) =>
    fetchApi<void>(`/projects/${projectId}/pipeline/state`, {
      method: 'POST',
      body: JSON.stringify({ action: 'saveStatus', stageId, status }),
    }),

  completeStage: (projectId: string, stageId: string, outputs?: Record<string, any>) =>
    fetchApi<void>(`/projects/${projectId}/pipeline/state`, {
      method: 'POST',
      body: JSON.stringify({ action: 'completeStage', stageId, outputs }),
    }),

  failStage: (projectId: string, stageId: string, errorMessage: string) =>
    fetchApi<void>(`/projects/${projectId}/pipeline/state`, {
      method: 'POST',
      body: JSON.stringify({ action: 'failStage', stageId, errorMessage }),
    }),
};

// ============================================================================
// SSE (Server-Sent Events) for Real-time Updates
// ============================================================================

export function subscribeToStageProgress(
  projectId: string,
  stageId: StageId,
  onMessage: (message: SSEMessage) => void,
  onError?: (error: Event) => void
): () => void {
  const eventSource = new EventSource(
    `${API_BASE_URL}/projects/${projectId}/stages/${stageId}/stream`
  );
  eventSource.onmessage = (event) => {
    try { onMessage(JSON.parse(event.data) as SSEMessage); } catch { /* ignore */ }
  };
  eventSource.onerror = (error) => { onError?.(error); eventSource.close(); };
  return () => eventSource.close();
}

export function subscribeToGlobalProgress(
  projectId: string,
  onMessage: (message: SSEMessage) => void,
  onError?: (error: Event) => void
): () => void {
  const eventSource = new EventSource(
    `${API_BASE_URL}/projects/${projectId}/progress/stream`
  );
  eventSource.onmessage = (event) => {
    try { onMessage(JSON.parse(event.data) as SSEMessage); } catch { /* ignore */ }
  };
  eventSource.onerror = (error) => { onError?.(error); eventSource.close(); };
  return () => eventSource.close();
}

// ============================================================================
// Ghost Run Estimation
// ============================================================================

export const estimateApi = {
  getGhostRun: (projectId: string, imageCount: number) =>
    fetchApi<{
      estimates: Array<{ stageId: StageId; estimatedDurationMinutes: number }>;
      totalMinutes: number;
    }>(`/projects/${projectId}/estimate`, {
      method: 'POST',
      body: JSON.stringify({ imageCount }),
    }),
};
