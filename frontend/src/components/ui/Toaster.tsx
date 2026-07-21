
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useToastStore } from '@/store/useToastStore';
import { cn } from '@/lib/utils';

export function Toaster() {
  const { toasts, dismissToast } = useToastStore();

  return (
    <div
      className="fixed right-6 z-[200000] flex flex-col gap-2 pointer-events-none"
      style={{ bottom: 'calc(var(--umbra-filmstrip-toast-offset, 0px) + 1.5rem)' }}
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className={cn(
              "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl border min-w-[300px]",
              "bg-zinc-900 border-white/10 text-zinc-200"
            )}
          >
            {toast.type === 'success' && <CheckCircle size={18} className="text-green-400" />}
            {toast.type === 'error' && <AlertCircle size={18} className="text-red-400" />}
            {(!toast.type || toast.type === 'info') && <Info size={18} className="text-blue-400" />}
            
            <div className="flex-1 text-sm font-medium">{toast.message}</div>

            {toast.action && (
              <button
                onClick={(e) => {
                    e.stopPropagation();
                    toast.action?.onClick();
                    dismissToast(toast.id);
                }}
                className="px-3 py-1 text-xs font-bold bg-white/10 hover:bg-white/20 rounded transition-colors text-white"
              >
                {toast.action.label}
              </button>
            )}

            <button
              onClick={() => dismissToast(toast.id)}
              className="p-1 hover:bg-white/10 rounded-full text-zinc-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
