import { NextResponse } from "next/server";
import { APIError, ErrorCodes, errorResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth-db";
import { getProjectById, getSfMConfig } from '@/lib/store';
import { getDefaultSfMConfig, buildODMNodeUrl } from '@/lib/odm-client';
import fs from 'fs';
import path from 'path';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return errorResponse(new APIError(ErrorCodes.UNAUTHORIZED, 401, 'Not authenticated.'));

    const { projectId } = await params;
    const project = await getProjectById(projectId);
    if (!project) return errorResponse(new APIError(ErrorCodes.PROJECT_NOT_FOUND, 404, 'Project not found.'));

    const config = await getSfMConfig(projectId) ?? getDefaultSfMConfig();
    const nodeUrl = buildODMNodeUrl(config.odmNodeUrl, config.odmNodePort);

    const diagnostics: string[] = [];

    // Test 1 — ODM reachability
    try {
      const infoRes = await fetch(`${nodeUrl}/info`, { signal: (AbortSignal as any).timeout(5000) });
      const info = await infoRes.json();
      diagnostics.push(`✓ ODM reachable at ${nodeUrl} — version: ${info.version}`);
    } catch (err: any) {
      return NextResponse.json({
        success: false,
        error: `ODM not reachable at ${nodeUrl}: ${err.message}`,
        diagnostics,
      });
    }

    // Test 2 — Image directory
    const imageDir = project.directoryPath;
    if (!imageDir || !fs.existsSync(imageDir)) {
      return NextResponse.json({
        success: false,
        error: `Image directory not found: "${imageDir}"`,
        diagnostics,
      });
    }

    const supportedExts = ['.jpg', '.jpeg', '.tif', '.tiff', '.png'];
    const imageFiles = fs.readdirSync(imageDir)
      .filter(f => supportedExts.includes(path.extname(f).toLowerCase()));

    diagnostics.push(`✓ Image directory: ${imageDir}`);
    diagnostics.push(`✓ Images found: ${imageFiles.length}`);

    if (imageFiles.length < 3) {
      return NextResponse.json({
        success: false,
        error: `Not enough images. Found ${imageFiles.length}, need at least 3.`,
        diagnostics,
      });
    }

    // Test 3 — Submit minimal task to ODM
    const form = new globalThis.FormData();
    const testImages = imageFiles.slice(0, 3); // Use first 3 only for test

    for (const filename of testImages) {
      const fullPath = path.join(imageDir, filename);
      const fileBuffer = fs.readFileSync(fullPath);
      const blob = new Blob([fileBuffer]);
      form.append('images', blob, filename);
    }

    form.append('options', JSON.stringify([
      { name: 'feature-quality', value: 'lowest' },
      { name: 'pc-quality', value: 'lowest' },
      { name: 'fast-orthophoto', value: true },
    ]));
    form.append('name', `UAV2LoD1_test_${Date.now()}`);

    try {
      const createRes = await fetch(`${nodeUrl}/task/new`, {
        method: 'POST',
        body: form,
      });

      const responseText = await createRes.text();
      diagnostics.push(`ODM /task/new status: ${createRes.status}`);
      diagnostics.push(`ODM response: ${responseText}`);

      if (!createRes.ok) {
        return NextResponse.json({
          success: false,
          error: `Task submission failed: ${responseText}`,
          diagnostics,
        });
      }

      const taskResponse = JSON.parse(responseText);
      diagnostics.push(`✓ Task submitted — UUID: ${taskResponse.uuid}`);

      // Immediately cancel the test task to avoid wasting ODM resources
      try {
        await fetch(`${nodeUrl}/task/${taskResponse.uuid}/cancel`, { method: 'POST' });
        diagnostics.push(`✓ Test task cancelled — submission pipeline is working`);
      } catch (cancelErr: any) {
        diagnostics.push(`⚠️ Tried to cancel test task but: ${cancelErr.message}`);
      }

      return NextResponse.json({
        success: true,
        message: 'Full submission test passed. ODM is receiving tasks correctly.',
        diagnostics,
      });
    } catch (err: any) {
      return NextResponse.json({
        success: false,
        error: `Task submission error: ${err.message}`,
        diagnostics,
      });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}
