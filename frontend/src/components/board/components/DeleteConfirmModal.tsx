import { motion } from 'framer-motion';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import type { DatasetImage } from '../types';

interface DeleteConfirmModalProps {
  images: DatasetImage[];
  datasetName: string;
  conceptFolder: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  images,
  datasetName,
  conceptFolder,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="glass-panel flex max-h-[80vh] w-[480px] flex-col border-white/10"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded border border-red-500/30 bg-red-500/12">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white">Confirm Deletion</h2>
            <p className="text-sm text-zinc-400">
              {images.length} image{images.length !== 1 ? 's' : ''} will be permanently deleted
            </p>
          </div>
          <button
            onClick={onCancel}
            className="umbra-icon-button rounded p-2 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Image Grid */}
        <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-4 gap-2">
            {images.map(img => {
              const imageUrl = `/api/files/datasets/${datasetName}/${conceptFolder}/${img.filename}`;
              return (
                <div
                  key={img.filename}
                  className="umbra-surface-deep aspect-square overflow-hidden rounded border border-red-500/30"
                >
                  <img
                    src={imageUrl}
                    alt={img.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Warning */}
        <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            This action cannot be undone. Caption files will also be deleted.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 p-4">
          <button
            onClick={onCancel}
            className="umbra-icon-button rounded px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 rounded border border-red-500/40 bg-red-500/20 px-4 py-2 text-sm font-bold text-red-100 transition-colors hover:bg-red-500/30"
          >
            <Trash2 className="w-4 h-4" />
            Delete {images.length} Image{images.length !== 1 ? 's' : ''}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
