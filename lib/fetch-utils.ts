import { APIError, ErrorCodes } from './api-errors';

export interface FetchResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, any>;
  };
}

/**
 * Fetch with enhanced error handling and meaningful error messages
 */
export async function fetchWithErrorHandling<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Send cookies with request
    });

    const contentType = response.headers.get('content-type');
    let data: any;

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      // Handle standardized API errors
      if (data?.error?.code) {
        throw new APIError(
          data.error.code,
          response.status,
          data.error.message || `Request failed with status ${response.status}`,
          data.error.details
        );
      }

      // Fallback to generic error
      throw new APIError(
        'REQUEST_FAILED',
        response.status,
        data.error?.message || data.error || `Request failed with status ${response.status}`
      );
    }

    return data.data ?? data;
  } catch (err) {
    if (err instanceof APIError) {
      throw err;
    }

    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new APIError(
        'NETWORK_ERROR',
        0,
        'Network request failed — check your connection and try again'
      );
    }

    throw new APIError(
      'UNKNOWN_ERROR',
      500,
      err instanceof Error ? err.message : 'An unexpected error occurred'
    );
  }
}

/**
 * Helper for file uploads with FormData
 */
export async function uploadFile<T>(
  url: string,
  formData: FormData,
  onProgress?: (progress: number) => void
): Promise<T> {
  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          onProgress(progress);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response.data ?? response);
        } catch {
          resolve(xhr.responseText as any);
        }
      } else {
        try {
          const errorData = JSON.parse(xhr.responseText);
          reject(
            new APIError(
              errorData.error?.code || 'UPLOAD_FAILED',
              xhr.status,
              errorData.error?.message || 'Upload failed',
              errorData.error?.details
            )
          );
        } catch {
          reject(
            new APIError(
              'UPLOAD_FAILED',
              xhr.status,
              `Upload failed with status ${xhr.status}`
            )
          );
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(
        new APIError(
          'NETWORK_ERROR',
          0,
          'Network error during upload'
        )
      );
    });

    xhr.addEventListener('abort', () => {
      reject(
        new APIError(
          'UPLOAD_ABORTED',
          0,
          'Upload was cancelled'
        )
      );
    });

    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}
