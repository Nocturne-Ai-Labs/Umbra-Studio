
import { create } from 'zustand';

const DEFAULT_TOAST_DURATION_MS = 6500;
const DEFAULT_ERROR_TOAST_DURATION_MS = 10000;
const DEFAULT_ACTION_TOAST_DURATION_MS = 12000;
const ERROR_NOTIFICATION_DEDUP_MS = 12000;
const MAX_ERROR_NOTIFICATIONS = 50;

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

export interface ErrorNotification {
  id: string;
  message: string;
  createdAt: number;
  updatedAt: number;
  count: number;
  read: boolean;
}

interface ToastState {
  toasts: Toast[];
  notifications: ErrorNotification[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  markNotificationsRead: () => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  notifications: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast = { ...toast, id };
    const now = Date.now();

    set((state) => {
      let notifications = state.notifications;
      let shouldShowToast = true;

      if (toast.type === 'error') {
        const duplicate = state.notifications.find((notification) => (
          notification.message === toast.message
          && now - notification.updatedAt <= ERROR_NOTIFICATION_DEDUP_MS
        ));
        if (duplicate) {
          notifications = state.notifications.map((notification) => (
            notification.id === duplicate.id
              ? {
                ...notification,
                count: notification.count + 1,
                updatedAt: now,
                read: false,
              }
              : notification
          ));
          shouldShowToast = false;
        } else {
          notifications = [{
            id,
            message: toast.message,
            createdAt: now,
            updatedAt: now,
            count: 1,
            read: false,
          }, ...state.notifications].slice(0, MAX_ERROR_NOTIFICATIONS);
        }
      }

      return {
        notifications,
        toasts: shouldShowToast ? [...state.toasts, newToast].slice(-6) : state.toasts,
      };
    });

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
  markNotificationsRead: () => set((state) => ({
    notifications: state.notifications.map((notification) => ({ ...notification, read: true })),
  })),
  dismissNotification: (id) => set((state) => ({
    notifications: state.notifications.filter((notification) => notification.id !== id),
  })),
  clearNotifications: () => set({ notifications: [] }),
}));
