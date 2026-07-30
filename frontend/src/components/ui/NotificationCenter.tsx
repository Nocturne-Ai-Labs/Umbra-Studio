import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Bell, BellRing, CheckCheck, Trash2, X } from 'lucide-react';
import { getUmbraRemoteMode } from '@/utils/hostOnly';
import { useToastStore } from '@/store/useToastStore';
import { cn } from '@/lib/utils';

const OPEN_NOTIFICATION_CENTER_EVENT = 'umbra:open-notification-center';

export function openUmbraNotificationCenter(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_NOTIFICATION_CENTER_EVENT));
}

function formatCount(count: number): string {
  return count > 99 ? '99+' : String(Math.max(0, count));
}

function formatTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

type NotificationBellButtonProps = {
  className?: string;
  compact?: boolean;
  label?: string;
  description?: string;
};

export function NotificationBellButton({
  className,
  compact = false,
  label = 'Issues',
  description,
}: NotificationBellButtonProps) {
  const unreadCount = useToastStore((state) => state.notifications
    .filter((notification) => !notification.read)
    .reduce((total, notification) => total + notification.count, 0));

  return (
    <button
      type="button"
      onClick={openUmbraNotificationCenter}
      className={cn(
        'relative inline-flex min-h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.025] text-zinc-400 transition-colors hover:border-white/25 hover:bg-white/[0.055] hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--umbra-accent)]/60',
        className,
      )}
      title={unreadCount > 0 ? `${unreadCount} unread issue${unreadCount === 1 ? '' : 's'}` : 'Open issues'}
      aria-label={unreadCount > 0 ? `${unreadCount} unread issue${unreadCount === 1 ? '' : 's'}. Open issues.` : 'Open issues'}
    >
      {unreadCount > 0 ? <BellRing size={compact ? 12 : 15} className="shrink-0 text-amber-300" /> : <Bell size={compact ? 12 : 15} className="shrink-0" />}
      {!compact ? (
        <span className="min-w-0 text-left">
          <strong className="block truncate text-[10px] font-black uppercase tracking-[0.1em]">{label}</strong>
          {description ? <small className="block truncate text-[10px] text-zinc-500">{description}</small> : null}
        </span>
      ) : null}
      {unreadCount > 0 ? (
        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-black leading-5 text-zinc-950">
          {formatCount(unreadCount)}
        </span>
      ) : null}
    </button>
  );
}

export function NotificationCenter() {
  const notifications = useToastStore((state) => state.notifications);
  const markNotificationsRead = useToastStore((state) => state.markNotificationsRead);
  const dismissNotification = useToastStore((state) => state.dismissNotification);
  const clearNotifications = useToastStore((state) => state.clearNotifications);
  const [open, setOpen] = React.useState(false);
  const [isPhoneRemote, setIsPhoneRemote] = React.useState(() => getUmbraRemoteMode() === 'phone');

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateMode = () => setIsPhoneRemote(getUmbraRemoteMode() === 'phone');
    const openCenter = () => {
      updateMode();
      setOpen(true);
      markNotificationsRead();
    };
    window.addEventListener(OPEN_NOTIFICATION_CENTER_EVENT, openCenter);
    window.addEventListener('umbra:remote-mode-change', updateMode);
    return () => {
      window.removeEventListener(OPEN_NOTIFICATION_CENTER_EVENT, openCenter);
      window.removeEventListener('umbra:remote-mode-change', updateMode);
    };
  }, [markNotificationsRead]);

  React.useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close issues"
            className="fixed inset-0 z-[299999] cursor-default border-0 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Issues"
            initial={{ opacity: 0, y: isPhoneRemote ? 18 : 10, scale: isPhoneRemote ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: isPhoneRemote ? 18 : 10, scale: isPhoneRemote ? 1 : 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={cn(
              'fixed z-[300000] flex flex-col overflow-hidden border border-white/15 bg-[#0a0c10] text-zinc-100 shadow-2xl shadow-black/70',
              isPhoneRemote
                ? 'inset-x-2 bottom-[calc(var(--umbra-phone-bottom-nav-height)+0.5rem)] max-h-[calc(100dvh-var(--umbra-phone-bottom-nav-height)-1rem)] rounded-lg'
                : 'bottom-5 right-5 w-[min(28rem,calc(100vw-2.5rem))] max-h-[min(34rem,calc(100dvh-2.5rem))] rounded-lg',
            )}
          >
            <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <AlertCircle size={18} className="text-amber-300" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black tracking-[0.06em]">Issues</h2>
                <p className="mt-0.5 text-xs text-zinc-500">Recent actions that need attention.</p>
              </div>
              {notifications.length > 0 ? (
                <button
                  type="button"
                  onClick={clearNotifications}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 transition-colors hover:border-red-400/50 hover:bg-red-400/10 hover:text-red-200"
                  title="Clear issues"
                  aria-label="Clear issues"
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 transition-colors hover:border-white/25 hover:bg-white/[0.06] hover:text-white"
                aria-label="Close issues"
              >
                <X size={15} />
              </button>
            </header>
            <div className="min-h-0 overflow-y-auto p-3 custom-scrollbar">
              {notifications.length > 0 ? (
                <div className="space-y-2">
                  {notifications.map((notification) => (
                    <article
                      key={notification.id}
                      className="flex gap-3 rounded-md border border-red-400/20 bg-red-400/[0.055] p-3"
                    >
                      <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-300" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm leading-5 text-zinc-200">{notification.message}</p>
                        <div className="mt-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">
                          <span>{formatTime(notification.updatedAt)}</span>
                          {notification.count > 1 ? <span>{notification.count} repeats</span> : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissNotification(notification.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-white"
                        title="Dismiss issue"
                        aria-label="Dismiss issue"
                      >
                        <X size={14} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 text-center text-zinc-500">
                  <CheckCheck size={28} className="text-emerald-300" />
                  <p className="text-sm">No issues have been recorded in this session.</p>
                </div>
              )}
            </div>
          </motion.section>
        </>
      ) : null}
    </AnimatePresence>
  );
}
