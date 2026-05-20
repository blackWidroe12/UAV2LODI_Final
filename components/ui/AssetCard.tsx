'use client';

import React from 'react';
import { Eye, Download, FileText, Map, Layers, File } from 'lucide-react';

interface AssetCardProps {
  label: string;
  type: string;
  available: boolean;
  size: string | null;
  downloadUrl: string | null;
  onPreview: () => void;
  token: string | null;
}

export default function AssetCard({
  label,
  type,
  available,
  size,
  downloadUrl,
  onPreview,
  token,
}: AssetCardProps) {
  const icons: Record<string, React.ReactNode> = {
    geotiff: <Map className="w-4 h-4 text-cyan-400" />,
    laz:     <Layers className="w-4 h-4 text-violet-400" />,
    pdf:     <FileText className="w-4 h-4 text-amber-400" />,
  };

  return (
    <div className={`p-3 rounded-md border ${available ? 'border-[rgba(255,255,255,0.08)] bg-[#1C2128]' : 'border-[rgba(255,255,255,0.04)] bg-[#0E1117] opacity-50'}`}>
      <div className="flex items-center gap-2 mb-2">
        {icons[type] ?? <File className="w-4 h-4 text-[#6B7280]" />}
        <span className="text-xs font-medium text-white">{label}</span>
        {available && <span className="ml-auto text-xs text-[#6B7280]">{size}</span>}
      </div>

      {available ? (
        <div className="flex items-center gap-2">
          <button
            onClick={onPreview}
            className="flex-1 flex items-center justify-center gap-1 py-1 text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-900 rounded hover:border-cyan-700 transition-colors"
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
          
          <a
            href={`${downloadUrl}`}
            download
            onClick={e => {
              e.preventDefault();
              if (!downloadUrl) return;
              fetch(downloadUrl, { headers: { 'x-download': 'true', Authorization: `Bearer ${token}` } })
                .then(r => r.blob())
                .then(blob => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = label.toLowerCase().replace(' ', '_') + '.' + (type === 'geotiff' ? 'tif' : type === 'laz' ? 'laz' : 'pdf');
                  a.click();
                  URL.revokeObjectURL(url);
                });
            }}
            className="flex items-center justify-center gap-1 p-1 text-xs text-[#6B7280] hover:text-white border border-[rgba(255,255,255,0.06)] rounded hover:border-[rgba(255,255,255,0.2)] transition-colors"
          >
            <Download className="w-3 h-3" />
          </a>
        </div>
      ) : (
        <p className="text-xs text-[#6B7280]">Not generated</p>
      )}
    </div>
  );
}
