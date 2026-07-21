
import { create } from 'zustand';

const DEFAULT_TOAST_DURATION_MS = 6500;
const DEFAULT_ERROR_TOAST_DURATION_MS = 10000;
const DEFAULT_ACTION_TOAST_DURATION_MS = 12000;

export interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id };

    set((state) => ({ toasts: [...state.toasts, newToast] }));

    if (toast.duration !== Infinity) {
      const hasCustomDuration = typeof toast.duration === 'number' && Number.isFinite(toast.duration);
      const timeoutMs = hasCustomDuration
        ? toast.duration!
        : toast.action
          ? DEFAULT_ACTION_TOAST_DURATION_MS
          : toast.type === 'error'
            ? DEFAULT_ERROR_TOAST_DURATION_MS
            : DEFAULT_TOAST_DURATION_MS;
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, timeoutMs);
    }
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
