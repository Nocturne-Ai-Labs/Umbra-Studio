
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useToastStore } from '@/store/useToastStore';
import { useStore } from '@/store/useStore';
import { getUmbraRemoteMode } from '@/utils/hostOnly';
import { openUmbraNotificationCenter } from '@/components/ui/NotificationCenter';
import { cn } from '@/lib/utils';

export function Toaster() {
  const { toasts, dismissToast } = useToastStore();
  const enableToasts = useStore((state) => state.appSettings.enableToasts !== false);
  const [isPhoneRemote, setIsPhoneRemote] = React.useState(() => getUmbraRemoteMode() === 'phone');

  React.useEffect(() => {
    const updateMode = () => setIsPhoneRemote(getUmbraRemoteMode() === 'phone');
    updateMode();
    window.addEventListener('umbra:remote-mode-change', updateMode);
    return () => window.removeEventListener('umbra:remote-mode-change', updateMode);
  }, []);

  const visibleToasts = !enableToasts
    ? []
    : isPhoneRemote
      ? toasts.filter((toast) => toast.type !== 'error').slice(-1)
      : toasts.slice(-3);

  return (
    <div
      className={cn(
        'fixed z-[200000] flex flex-col gap-2 pointer-events-none',
        isPhoneRemote ? 'inset-x-2' : 'right-5 w-[min(25rem,calc(100vw-2.5rem))]',
      )}
      style={{
        bottom: isPhoneRemote
          ? 'calc(var(--umbra-phone-bottom-nav-height) + 0.5rem)'
          : 'calc(var(--umbra-filmstrip-toast-offset, 0px) + 1.25rem)',
      }}
    >
      <AnimatePresence>
        {visibleToasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            className={cn(
              'pointer-events-auto flex max-w-full items-start gap-3 rounded-md border px-3 py-2.5 shadow-2xl',
              toast.type === 'error'
                ? 'border-red-400/35 bg-[#1c0c10] text-zinc-100'
                : 'border-white/10 bg-zinc-900 text-zinc-200',
            )}
          >
            {toast.type === 'success' && <CheckCircle size={17} className="mt-0.5 shrink-0 text-green-400" />}
            {toast.type === 'error' && <AlertCircle size={17} className="mt-0.5 shrink-0 text-red-300" />}
            {(!toast.type || toast.type === 'info') && <Info size={17} className="mt-0.5 shrink-0 text-blue-400" />}
            
            <div className="min-w-0 flex-1">
              {toast.type === 'error' ? <div className="mb-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-red-200/75">Issue saved</div> : null}
              <div className="line-clamp-2 break-words text-sm font-medium">{toast.message}</div>
            </div>

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

            {toast.type === 'error' ? (
              <button
                type="button"
                onClick={() => {
                  openUmbraNotificationCenter();
                  dismissToast(toast.id);
                }}
                className="rounded-md border border-red-300/25 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-red-100 transition-colors hover:bg-red-200/10"
              >
                Issues
              </button>
            ) : null}

            <button
              onClick={() => dismissToast(toast.id)}
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
