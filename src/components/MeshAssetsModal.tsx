import React, { useRef } from 'react';
import {
  X,
  Upload,
  Box,
  Download,
  Copy,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { CustomMeshAsset } from '../urdf/types';
import { createSampleLidarStl } from '../urdf/templates';

interface MeshAssetsModalProps {
  open: boolean;
  onClose: () => void;
  meshAssets: Record<string, CustomMeshAsset>;
  onUploadMeshes: (files: FileList) => void;
  onRemoveMesh: (name: string) => void;
  onInsertMeshSnippet: (filename: string) => void;
}

export const MeshAssetsModal: React.FC<MeshAssetsModalProps> = ({
  open,
  onClose,
  meshAssets,
  onUploadMeshes,
  onRemoveMesh,
  onInsertMeshSnippet,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const assetsList = Object.values(meshAssets) as CustomMeshAsset[];

  const handleDownloadSampleStl = () => {
    const stlText = createSampleLidarStl();
    const blob = new Blob([stlText], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lidar_head.stl';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mesh-assets-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-xl bg-[#111827] border border-[#26334d] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#26334d]">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-sky-400" />
            <h2
              id="mesh-assets-modal-title"
              className="text-sm font-semibold text-white"
            >
              ROS2 Custom Mesh Assets (.stl / .obj)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Mesh Assets Modal"
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Upload local <code className="font-mono text-sky-300">.stl</code> or{' '}
            <code className="font-mono text-sky-300">.obj</code> mesh files to
            render them inside your URDF{' '}
            <code className="font-mono text-slate-200">
              &lt;mesh filename=&quot;package://your_pkg/meshes/part.stl&quot;/&gt;
            </code>{' '}
            tags. The compiler resolves uploaded meshes automatically by
            filename.
          </p>

          {/* Upload Dropzone / Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-[#0b0f17] border border-dashed border-[#334155] rounded-lg">
            <div className="text-xs text-slate-300">
              <div className="font-medium text-white">
                Add binary or ASCII .stl / .obj files
              </div>
              <div className="text-slate-400 mt-0.5">
                Files stay 100% local in browser memory
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadSampleStl}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#161f30] hover:bg-slate-800 border border-[#26334d] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Download Sample .stl</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload .STL / .OBJ</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".stl,.obj"
                multiple
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onUploadMeshes(e.target.files);
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />
            </div>
          </div>

          {/* Registered Mesh List */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <div className="text-xs font-medium text-slate-400">
              Registered Mesh Files ({assetsList.length})
            </div>

            {assetsList.map((asset) => (
              <div
                key={asset.name}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-[#161f30] border border-[#26334d] rounded-lg"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs font-mono font-semibold text-white truncate">
                      {asset.name}
                    </span>
                    <span className="text-xs text-slate-400">
                      · {asset.format.toUpperCase()} ·{' '}
                      {(asset.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                    URI: package://robot_description/meshes/{asset.name}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onInsertMeshSnippet(asset.name);
                      onClose();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-300 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 rounded transition-colors whitespace-nowrap"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Insert &lt;mesh&gt;</span>
                  </button>
                  {!asset.isBuiltIn && (
                    <button
                      type="button"
                      onClick={() => onRemoveMesh(asset.name)}
                      aria-label={`Remove ${asset.name}`}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 bg-[#0b0f17] border-t border-[#26334d]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
