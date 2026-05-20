import { getCurrentUser } from '@/lib/auth-db';
import { getProjectById } from '@/lib/store';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; filename: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return new Response('Unauthorized', { status: 401 });

    const { projectId, filename } = await params;
    const project = await getProjectById(projectId);
    if (!project || project.userId !== user.id) {
      return new Response('Not found', { status: 404 });
    }

    // Sanitise filename — prevent path traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(
      process.cwd(), 'data', 'outputs', projectId, 'sfm', safeFilename
    );

    if (!fs.existsSync(filePath)) {
      return new Response('File not found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(safeFilename).toLowerCase();

    const contentTypes: Record<string, string> = {
      '.tif':  'image/tiff',
      '.tiff': 'image/tiff',
      '.laz':  'application/octet-stream',
      '.pdf':  'application/pdf',
      '.zip':  'application/zip',
    };

    const contentType = contentTypes[ext] ?? 'application/octet-stream';
    
    // Check header for download
    const isDownload = request.headers.get('x-download') === 'true' || request.url.includes('download=true');

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Content-Disposition': isDownload
          ? `attachment; filename="${safeFilename}"`
          : `inline; filename="${safeFilename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    return new Response(error.message || 'Internal server error', { status: 500 });
  }
}
