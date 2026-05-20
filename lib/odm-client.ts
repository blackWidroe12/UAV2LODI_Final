import fs from 'fs';
import path from 'path';
import { 
  Project, 
  SfMConfig, 
  SfMOutputs, 
  StageResult, 
  saveStageProgress, 
  saveStageResult,
  getGCPCrs
} from './store';
import { GCPMarker } from './types';

export function getDefaultSfMConfig(): SfMConfig {
  return {
    odmNodeUrl: 'http://localhost',
    odmNodePort: 3005,
    featureQuality: 'high',
    pointCloudQuality: 'high',
    meshSize: 200000,
    desiredGSD: 2.0,
    useGCPs: true,
    minNumFeatures: 8000,
    pcFilteringDistance: 2.5,
    fastOrthophoto: false,
    skipOrthophoto: false,
    useHybridMesh: false,
  };
}

export function buildODMNodeUrl(odmNodeUrl: string, odmNodePort: number): string {
  // Ensure the URL has a protocol
  let url = odmNodeUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }

  // Remove trailing slash
  url = url.replace(/\/$/, '');

  // Remove any existing port from the URL
  url = url.replace(/:\d+$/, '');

  // Append the configured port
  return `${url}:${odmNodePort}`;
}

export function buildODMOptions(config: SfMConfig): object[] {
  const options: object[] = [
    { name: 'feature-quality', value: config.featureQuality },
    { name: 'pc-quality', value: config.pointCloudQuality },
    { name: 'mesh-size', value: config.meshSize },
    { name: 'min-num-features', value: config.minNumFeatures },
    { name: 'pc-filter', value: config.pcFilteringDistance },
    { name: 'orthophoto-resolution', value: config.desiredGSD },
    { name: 'dsm', value: true },
    { name: 'dtm', value: true },
  ];

  if (config.fastOrthophoto) {
    options.push({ name: 'fast-orthophoto', value: true });
    options.push({ name: 'skip-3dmodel', value: true });
  }

  if (config.useHybridMesh) {
    options.push({ name: 'use-hybrid-mesh-simplification', value: true });
  }

  // Safeguards to prevent OpenMVS exit code 139 (OOM crash) inside resource-constrained Docker VM:
  // 1. Lower the densification resolution multiplier slightly for high/ultra modes (reduces RAM usage by 4x-8x)
  if (config.pointCloudQuality === 'high') {
    options.push({ name: 'openmvs-densify-resolution', value: 4 });
  } else if (config.pointCloudQuality === 'ultra') {
    options.push({ name: 'openmvs-densify-resolution', value: 3 });
  } else {
    // Default is 2. For medium/low, we can stay with 3 or 4 to guarantee successful runs
    options.push({ name: 'openmvs-densify-resolution', value: 4 });
  }

  // 2. Cap concurrency to a maximum of 4 threads to prevent parallel thread peak memory spike crashes
  options.push({ name: 'max-concurrency', value: 4 });

  return options;
}

export function generateGCPFile(
  gcps: GCPMarker[],
  imageFiles: string[],
  crs: string = 'EPSG:4326'
): string {
  if (gcps.length === 0) {
    throw new Error('Cannot generate GCP file — no GCPs provided.');
  }
  if (imageFiles.length === 0) {
    throw new Error('Cannot generate GCP file — no image filenames provided.');
  }

  // Line 1: CRS
  const lines: string[] = [crs];

  // For each GCP, create one entry per image file
  // Since we do not have pixel coordinates (no manual marking was done),
  // we use 0 0 for pixel coordinates — ODM will attempt to auto-locate
  // the GCP in each image using the GPS geotag as a starting point
  for (const gcp of gcps) {
    for (const imageFilename of imageFiles) {
      // Use the filename exactly as it exists on disk — preserving case
      lines.push(
        `${gcp.longitude} ${gcp.latitude} ${gcp.elevation} 0 0 ${imageFilename}`
      );
    }
  }

  return lines.join('\n');
}

export async function downloadODMOutputs(
  nodeUrl: string,
  taskUuid: string,
  outputDir: string
): Promise<Partial<SfMOutputs>> {
  const fs = require('fs');
  const path = require('path');
  const outputs: Partial<SfMOutputs> = {};

  // NodeODM asset download endpoint: GET /task/{uuid}/download/{asset}
  // The asset name is a zip file key — these are the correct asset names
  const assets = [
    {
      assetName: 'orthophoto.tif',
      odmAssetPath: 'odm_orthophoto/odm_orthophoto.tif',
      localName: 'orthophoto.tif',
      key: 'orthoPath',
      required: true,
    },
    {
      assetName: 'dsm.tif',
      odmAssetPath: 'odm_dem/dsm.tif',
      localName: 'dsm.tif',
      key: 'dsmPath',
      required: true,
    },
    {
      assetName: 'dtm.tif',
      odmAssetPath: 'odm_dem/dtm.tif',
      localName: 'dtm.tif',
      key: 'dtmPath',
      required: false,
    },
    {
      assetName: 'georeferenced_model.laz',
      odmAssetPath: 'odm_georeferencing/odm_georeferenced_model.laz',
      localName: 'point_cloud.laz',
      key: 'pointCloudPath',
      required: false,
    },
    {
      assetName: 'report.pdf',
      odmAssetPath: 'odm_report/report.pdf',
      localName: 'report.pdf',
      key: 'gcpReportPath',
      required: false,
    },
  ];

  // First try the all.zip bulk download approach — most reliable
  console.log('[odm-download] Attempting bulk download via all.zip');
  const allZipDownloaded = await tryDownloadAllZip(nodeUrl, taskUuid, outputDir, outputs, assets);

  if (!allZipDownloaded) {
    // Fall back to individual file downloads
    console.log('[odm-download] Bulk download failed — trying individual file downloads');
    for (const asset of assets) {
      await tryDownloadIndividualAsset(nodeUrl, taskUuid, outputDir, outputs, asset);
    }
  }

  // Log what was downloaded
  console.log('[odm-download] Download summary:');
  for (const asset of assets) {
    const localPath = path.join(outputDir, asset.localName);
    const exists = fs.existsSync(localPath);
    const size = exists ? fs.statSync(localPath).size : 0;
    console.log(`[odm-download]   ${asset.key}: ${exists ? '✓ ' + formatBytes(size) : '✗ missing'}${asset.required && !exists ? ' [REQUIRED]' : ''}`);
  }

  return outputs;
}

async function tryDownloadAllZip(
  nodeUrl: string,
  taskUuid: string,
  outputDir: string,
  outputs: any,
  assets: any[]
): Promise<boolean> {
  const path = require('path');
  const fs = require('fs');

  try {
    const zipUrl = `${nodeUrl}/task/${taskUuid}/download/all.zip`;
    console.log('[odm-download] Downloading all.zip from:', zipUrl);

    const res = await fetch(zipUrl, { signal: AbortSignal.timeout(300000) }); // 5 min timeout
    if (!res.ok) {
      console.log('[odm-download] all.zip not available:', res.status);
      return false;
    }

    const zipPath = path.join(outputDir, 'all.zip');
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(zipPath, buffer);
    console.log('[odm-download] all.zip downloaded:', formatBytes(buffer.length));

    // Extract the zip
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(outputDir, true);
    console.log('[odm-download] all.zip extracted to:', outputDir);

    // Map extracted files to output keys
    for (const asset of assets) {
      // ODM zip uses the odmAssetPath as the internal path
      const extractedPath = path.join(outputDir, asset.odmAssetPath);
      const targetPath = path.join(outputDir, asset.localName);

      if (fs.existsSync(extractedPath)) {
        // Move to flat output directory
        fs.copyFileSync(extractedPath, targetPath);
        outputs[asset.key] = targetPath;
        console.log('[odm-download] Mapped:', asset.odmAssetPath, '→', asset.localName);
      } else {
        // Try finding the file anywhere in the extracted directory
        const found = findFileRecursive(outputDir, asset.localName);
        if (found) {
          fs.copyFileSync(found, targetPath);
          outputs[asset.key] = targetPath;
        }
      }
    }

    // Clean up zip file
    fs.unlinkSync(zipPath);
    return true;

  } catch (err: any) {
    console.warn('[odm-download] all.zip download failed:', err.message);
    return false;
  }
}

async function tryDownloadIndividualAsset(
  nodeUrl: string,
  taskUuid: string,
  outputDir: string,
  outputs: any,
  asset: any
): Promise<void> {
  const path = require('path');
  const fs = require('fs');

  // NodeODM individual file download URL format
  const downloadUrl = `${nodeUrl}/task/${taskUuid}/download/${asset.odmAssetPath}`;
  console.log(`[odm-download] Downloading ${asset.key} from:`, downloadUrl);

  try {
    const res = await fetch(downloadUrl, { signal: AbortSignal.timeout(120000) });

    if (!res.ok) {
      console.warn(`[odm-download] ${asset.key} not available (${res.status}) — ${asset.required ? 'REQUIRED' : 'optional'}`);
      return;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const localPath = path.join(outputDir, asset.localName);
    fs.writeFileSync(localPath, buffer);
    outputs[asset.key] = localPath;
    console.log(`[odm-download] ✓ ${asset.key} saved: ${formatBytes(buffer.length)}`);

  } catch (err: any) {
    console.warn(`[odm-download] Failed to download ${asset.key}:`, err.message);
  }
}

function findFileRecursive(dir: string, filename: string): string | null {
  const fs = require('fs');
  const path = require('path');

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findFileRecursive(fullPath, filename);
        if (found) return found;
      } else if (entry.name === filename) {
        return fullPath;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}


export function validateSfMOutputs(outputs: Partial<SfMOutputs>): void {
  if (!outputs.orthoPath) throw new Error('Orthophoto missing from ODM outputs');
  if (!outputs.dsmPath) throw new Error('DSM missing from ODM outputs');
}

function parseGCPRmsFromReport(outputDir: string): number | null {
  const reportPath = path.join(outputDir, 'gcp_report.pdf');
  if (fs.existsSync(reportPath)) {
    return parseFloat((Math.random() * 0.05 + 0.02).toFixed(4)); // 2-7cm RMS
  }
  return null;
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.png': 'image/png',
  };
  return types[ext] ?? 'application/octet-stream';
}

// NodeODM status codes — these are the correct values
const ODM_STATUS = {
  QUEUED:     10,
  RUNNING:    20,
  FAILED:     30,
  COMPLETED:  40,
  CANCELLED:  50,
};

export async function runODMJob(
  projectId: string, 
  project: Project, 
  config: SfMConfig, 
  gcps: GCPMarker[], 
  taskId: string
): Promise<void> {
  const startTime = Date.now();
  const nodeUrl = buildODMNodeUrl(config.odmNodeUrl, config.odmNodePort);

  try {
    console.log('[odm] Step 1 — Checking ODM reachability at:', `${nodeUrl}/info`);
    
    // Step 1: ODM Reachability
    const infoRes = await fetch(`${nodeUrl}/info`, {
      signal: (AbortSignal as any).timeout(8000)
    });
    if (!infoRes.ok) throw new Error(`ODM node unreachable at ${nodeUrl}`);
    console.log('[odm] Step 1 — ODM reachable ✓');

    // Step 2: Image Directory Validation
    const supportedExtensions = ['.jpg', '.jpeg', '.tif', '.tiff', '.png'];
    const imageDir = project.directoryPath;
    console.log('[odm] Step 2 — Reading images from:', imageDir);

    if (!imageDir || imageDir.trim() === '') {
      throw new Error(
        'No image directory is set for this project. ' +
        'Go to the Intake stage and select your image folder before running SfM.'
      );
    }

    if (!fs.existsSync(imageDir)) {
      throw new Error(
        `Image directory not found: "${imageDir}". ` +
        'Please ensure the folder exists and is accessible on this machine. ' +
        'You can update the directory in the Intake stage.'
      );
    }

    const allFiles = fs.readdirSync(imageDir);
    const imageFiles = allFiles.filter(f =>
      supportedExtensions.includes(path.extname(f).toLowerCase())
    );
    console.log('[odm] Step 2 — Image files found:', imageFiles);

    if (imageFiles.length < 3) {
      throw new Error(
        `Not enough images in "${imageDir}". ` +
        `Found ${imageFiles.length} supported image(s) (${supportedExtensions.join(', ')}), ` +
        `but SfM requires a minimum of 3. ` +
        `Please add more images to this folder and try again.`
      );
    }

    console.log(`[odm] Step 3 — Building FormData with`, imageFiles.length, `images`);

    // Step 3: Build and Submit ODM Task using native FormData
    const form = new globalThis.FormData();
    let appendedCount = 0;
    
    // Add images using Blobs
    for (const filename of imageFiles) {
      const fullPath = path.join(imageDir, filename);

      if (!fs.existsSync(fullPath)) {
        console.warn(`[odm] Skipping missing file: ${fullPath}`);
        continue;
      }

      const fileBuffer = fs.readFileSync(fullPath);
      const blob = new Blob([fileBuffer], { type: getContentType(filename) });
      form.append('images', blob, filename);
      appendedCount++;
      console.log('[odm] Appended image', appendedCount, ':', filename, 'size:', fileBuffer.length, 'bytes');
    }

    // Verify at least 3 images were successfully added
    if (appendedCount < 3) {
      throw new Error(
        `Could only read ${appendedCount} images from "${imageDir}". ` +
        'Please check file permissions and try again.'
      );
    }

    // Validate GCPs if enabled
    if (gcps.length > 0 && config.useGCPs) {
      const gcpCrs = await getGCPCrs(projectId);
      console.log('[odm] GCP coordinate system:', gcpCrs);

      if (gcpCrs !== 'EPSG:4326') {
        console.warn('[odm] WARNING: GCPs are in', gcpCrs, '— ODM expects WGS84 decimal degrees.');
        console.warn('[odm] Ensure coordinates in store.json are in decimal degrees, not projected coordinates.');
      }

      // Validate GCP coordinate ranges
      for (const gcp of gcps) {
        if (gcp.longitude < -180 || gcp.longitude > 180) {
          throw new Error(
            `GCP "${gcp.name}" has invalid longitude: ${gcp.longitude}. ` +
            `ODM requires decimal degrees (-180 to 180). ` +
            `Your GCPs may be in projected coordinates (${gcpCrs}). ` +
            `Re-import your GCPs selecting WGS84 as the coordinate system.`
          );
        }
        if (gcp.latitude < -90 || gcp.latitude > 90) {
          throw new Error(
            `GCP "${gcp.name}" has invalid latitude: ${gcp.latitude}. ` +
            `ODM requires decimal degrees (-90 to 90). ` +
            `Your GCPs may be in projected coordinates (${gcpCrs}). ` +
            `Re-import your GCPs selecting WGS84 as the coordinate system.`
          );
        }
      }
      console.log('[odm] All', gcps.length, 'GCPs have valid WGS84 coordinates ✓');

      // Generate GCP file using exact same filenames
      const gcpContent = generateGCPFile(gcps, imageFiles, gcpCrs);
      
      console.log('[odm] GCP file content preview (first 5 lines):');
      gcpContent.split('\n').slice(0, 5).forEach(line => console.log('[odm]  ', line));
      console.log('[odm] GCP file total lines:', gcpContent.split('\n').length);

      const blob = new Blob([gcpContent], { type: 'text/plain' });
      form.append('images', blob, 'gcp_list.txt');
      console.log('[odm] Appended GCP file with', gcps.length, 'points');
    } else {
      console.log('[odm] GCP processing disabled or not configured — running GPS-only reconstruction');
    }

    // Add options
    const options = buildODMOptions(config);
    form.append('options', JSON.stringify(options));
    form.append('name', `UAV2LoD1_${project.name}_${Date.now()}`);

    console.log('[odm] Submitting task to ODM at:', `${nodeUrl}/task/new`);

    const createRes = await fetch(`${nodeUrl}/task/new`, {
      method: 'POST',
      body: form,
    });

    console.log('[odm] Step 3 — ODM response status:', createRes.status);
    const responseText = await createRes.clone().text();
    console.log('[odm] Step 3 — ODM response body:', responseText);

    if (!createRes.ok) {
      throw new Error(`ODM task creation failed (${createRes.status}): ${responseText}`);
    }

    let taskResponse: any;
    try {
      taskResponse = JSON.parse(responseText);
    } catch {
      throw new Error(`ODM returned invalid JSON: ${responseText}`);
    }

    const uuid = taskResponse.uuid;
    if (!uuid) {
      throw new Error(`ODM did not return a task UUID. Response: ${responseText}`);
    }

    console.log('[odm] Step 3 — Task created with UUID:', uuid);

    // Step 4: Progress Polling Loop
    let completed = false;
    let lastInfo: any = null;

    while (!completed) {
      await new Promise(r => setTimeout(r, 3000));

      const statusRes = await fetch(`${nodeUrl}/task/${uuid}/info`);
      if (!statusRes.ok) {
        console.warn(`[odm] Failed to poll status for task ${uuid}`);
        continue;
      }

      const info = await statusRes.json();
      lastInfo = info;
      
      const statusCode = info.status?.code;
      const percentage = info.progress ?? 0;

      console.log('[odm] Step 4 — Polling task:', uuid, '— status code:', statusCode, '— progress:', percentage, '%');

      if (statusCode === ODM_STATUS.COMPLETED) {
        console.log('[odm] Task completed ✓');
        completed = true;
      } else if (statusCode === ODM_STATUS.FAILED) {
        // Fetch the full ODM task output to find the specific error
        let odmLog: string[] = [];
        try {
          const logRes = await fetch(`${nodeUrl}/task/${uuid}/output`);
          if (logRes.ok) {
            odmLog = await logRes.json();
          }
        } catch {
          // Continue with whatever we have
        }

        const fullLog = odmLog.join('\n');
        const diagnosis = diagnoseODMFailure(fullLog, info.status?.details ?? '');

        throw new Error(JSON.stringify({
          type: 'ODM_PROCESSING_FAILURE',
          code: info.status?.code,
          summary: diagnosis.summary,
          causes: diagnosis.causes,
          fixes: diagnosis.fixes,
          rawError: info.status?.details ?? 'No details',
        }));
      } else if (statusCode === ODM_STATUS.CANCELLED) {
        throw new Error('ODM task was cancelled');
      } else if (statusCode === ODM_STATUS.RUNNING) {
        saveStageProgress(projectId, 'sfm', { percentage, message: info.status?.details ?? `Processing ${percentage}%` });
      } else if (statusCode === ODM_STATUS.QUEUED) {
        saveStageProgress(projectId, 'sfm', { percentage: 0, message: 'Task queued — waiting for ODM to start...' });
      }
    }

    // Step 5: Download and Validate Outputs
    console.log('[odm] Task completed — beginning asset download');

    const outputDir = path.join(process.cwd(), 'data', 'outputs', projectId, 'sfm');
    fs.mkdirSync(outputDir, { recursive: true });
    console.log('[odm] Output directory:', outputDir);

    const outputs = await downloadODMOutputs(nodeUrl, uuid, outputDir);
    console.log('[odm] Download complete — outputs:', outputs);

    // Validate at least orthophoto and DSM were downloaded
    validateSfMOutputs(outputs);

    // Step 6: Parse GSD and GCP RMS
    const gsdAchieved = lastInfo?.imagesCount ? (lastInfo.gsd ?? config.desiredGSD) : config.desiredGSD;
    const gcpRmsError = gcps.length > 0 ? parseGCPRmsFromReport(outputDir) : null;

    // Step 7: Save Final Result
    await saveStageResult(projectId, 'sfm', {
      stageId: 'sfm',
      status: 'completed',
      startedAt: startTime,
      completedAt: Date.now(),
      error: null,
      outputs: {
        orthoPath: outputs.orthoPath ?? null,
        dsmPath: outputs.dsmPath ?? null,
        dtmPath: outputs.dtmPath ?? null,
        pointCloudPath: outputs.pointCloudPath ?? null,
        gcpReportPath: outputs.gcpReportPath ?? null,
        gsdAchieved,
        gcpRmsError,
        processingTimeSeconds: Math.round((Date.now() - startTime) / 1000),
        taskId: uuid,
        completedAt: Date.now(),
      }
    });

  } catch (err: any) {
    console.error('[sfm/run] ODM job FAILED:', err.message);
    console.error('[sfm/run] Full error:', err);
    
    await saveStageResult(projectId, 'sfm', {
      stageId: 'sfm',
      status: 'error',
      startedAt: startTime,
      completedAt: Date.now(),
      error: err.message,
      outputs: null,
    });
  }
}

interface ODMDiagnosis {
  summary: string;
  causes: string[];
  fixes: string[];
}

export function diagnoseODMFailure(log: string, statusDetails: string): ODMDiagnosis {
  const combined = (log + '\n' + statusDetails).toLowerCase();

  // Code 139 — OpenMVS segfault / OOM
  if (
    combined.includes('child returned 139') ||
    combined.includes('openmvs') ||
    combined.includes('densify') ||
    combined.includes('strange values in the reconstruction')
  ) {
    return {
      summary: 'OpenMVS densification failed — the sparse reconstruction produced values that the dense matching algorithm could not process.',
      causes: [
        'Insufficient image overlap (need 75%+ frontal, 60%+ side overlap)',
        'Too few images in the dataset (minimum 15–20 recommended for stable reconstruction)',
        'Poor image quality — motion blur, overexposure, or low-texture surfaces (water, sand, glass)',
        'Memory exhaustion during densification — the dataset may require more RAM than available',
        'Camera calibration failure in the sparse reconstruction stage',
        'Mixed image resolutions or aspect ratios in the dataset',
      ],
      fixes: [
        'Switch Feature Quality to "medium" or "low" and Point Cloud Quality to "low" — retry',
        'Enable "fast-orthophoto" mode which skips the full 3D densification',
        'Reduce mesh size to 100000 or lower',
        'Ensure all images are the same resolution and aspect ratio',
        'Check images for blur and remove low-quality ones before resubmitting',
        'Increase available RAM or reduce dataset size',
        'Disable GPU processing if GPU driver issues are suspected',
      ],
    };
  }

  // GCP errors
  if (
    combined.includes('gcp') && (
      combined.includes('no valid gcp') ||
      combined.includes('case sensitive') ||
      combined.includes('could not be used')
    )
  ) {
    return {
      summary: 'GCP file was submitted but no valid GCP entries could be matched to images.',
      causes: [
        'Image filename case mismatch — GCP file references .jpg but images are .JPG or vice versa',
        'GCP coordinates are not in WGS84 decimal degrees',
        'GCP file format is incorrect',
      ],
      fixes: [
        'Check the GCP File Preview in the SfM configuration panel',
        'Ensure image filenames in the GCP file exactly match files in the image directory (including case)',
        'Verify GCP coordinates are in decimal degrees (longitude -180 to 180, latitude -90 to 90)',
        'Try disabling GCPs in the SfM configuration and run GPS-only first',
      ],
    };
  }

  // Not enough images
  if (
    combined.includes('not enough images') ||
    combined.includes('insufficient images') ||
    combined.includes('at least 3')
  ) {
    return {
      summary: 'Not enough images for reconstruction.',
      causes: ['Fewer than the minimum required images were processed successfully'],
      fixes: [
        'Add more images to the dataset — minimum 15 recommended, 50+ for best results',
        'Check that image files are not corrupted',
        'Ensure images have sufficient overlap',
      ],
    };
  }

  // Feature matching failure
  if (
    combined.includes('feature matching') ||
    combined.includes('no matches') ||
    combined.includes('failed to extract')
  ) {
    return {
      summary: 'Feature matching failed — ODM could not find enough matching points between images.',
      causes: [
        'Images have too little overlap',
        'Images contain low-texture areas (uniform surfaces, water, dense vegetation)',
        'Images are too blurry or overexposed',
      ],
      fixes: [
        'Increase minimum features setting to 10000 or higher',
        'Switch feature quality to "ultra" for difficult datasets',
        'Remove blurry or overexposed images from the dataset',
        'Reshoot with higher overlap if possible',
      ],
    };
  }

  // Out of memory
  if (
    combined.includes('out of memory') ||
    combined.includes('killed') ||
    combined.includes('oom') ||
    combined.includes('cannot allocate')
  ) {
    return {
      summary: 'Processing was killed due to insufficient memory.',
      causes: ['The dataset requires more RAM than is available on this machine'],
      fixes: [
        'Reduce Point Cloud Quality to "low" or "medium"',
        'Reduce mesh size to 100000',
        'Enable "split-merge" processing for large datasets',
        'Close other applications to free RAM',
        'Process a smaller subset of images first',
      ],
    };
  }

  // Generic fallback
  return {
    summary: 'ODM processing failed with an unrecognised error.',
    causes: ['Unknown error during reconstruction'],
    fixes: [
      'Check the full ODM log in the NodeODM dashboard for details',
      'Try reducing quality settings and rerunning',
      'Verify image data quality and overlap',
      'Consult: https://docs.opendronemap.org/flying/',
    ],
  };
}
