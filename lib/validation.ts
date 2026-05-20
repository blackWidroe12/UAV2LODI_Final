export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateProjectCreate(data: any): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.name = 'Project name is required';
  } else if (data.name.length > 255) {
    errors.name = 'Project name must be less than 255 characters';
  }

  if (!data.directoryPath || typeof data.directoryPath !== 'string') {
    errors.directoryPath = 'Image directory path is required';
  } else if (data.directoryPath.includes('..')) {
    errors.directoryPath = 'Invalid path — path traversal not allowed';
  }

  if (data.crs && typeof data.crs !== 'string') {
    errors.crs = 'CRS must be a string';
  } else if (data.crs && !data.crs.match(/^EPSG:\d+$/)) {
    errors.crs = 'CRS must be in format EPSG:XXXX';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateGCPImport(data: any): ValidationResult {
  const errors: Record<string, string> = {};

  if (!Array.isArray(data.gcps)) {
    errors.gcps = 'GCPs must be an array';
  } else if (data.gcps.length === 0) {
    errors.gcps = 'At least one GCP is required';
  } else {
    for (let i = 0; i < data.gcps.length; i++) {
      const gcp = data.gcps[i];
      if (typeof gcp.lng !== 'number' || gcp.lng < -180 || gcp.lng > 180) {
        errors[`gcps[${i}].lng`] = 'Longitude must be between -180 and 180';
      }
      if (typeof gcp.lat !== 'number' || gcp.lat < -90 || gcp.lat > 90) {
        errors[`gcps[${i}].lat`] = 'Latitude must be between -90 and 90';
      }
      if (typeof gcp.elevation !== 'number') {
        errors[`gcps[${i}].elevation`] = 'Elevation must be a number';
      }
    }
  }

  if (!data.crs || typeof data.crs !== 'string') {
    errors.crs = 'CRS is required';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateProjectUpdate(data: any): ValidationResult {
  const errors: Record<string, string> = {};

  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.name = 'Project name must be a non-empty string';
    } else if (data.name.length > 255) {
      errors.name = 'Project name must be less than 255 characters';
    }
  }

  if (data.directoryPath !== undefined) {
    if (typeof data.directoryPath !== 'string') {
      errors.directoryPath = 'Directory path must be a string';
    } else if (data.directoryPath.includes('..')) {
      errors.directoryPath = 'Invalid path — path traversal not allowed';
    }
  }

  if (data.crs !== undefined) {
    if (typeof data.crs !== 'string') {
      errors.crs = 'CRS must be a string';
    } else if (!data.crs.match(/^EPSG:\d+$/)) {
      errors.crs = 'CRS must be in format EPSG:XXXX';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
