import type { Toast } from '@/store/useToastStore';

export function shouldShowToast(
  toast: Omit<Toast, 'id'>,
  { enableToasts, isPhoneRemote }: { enableToasts: boolean; isPhoneRemote: boolean },
): boolean {
  if (toast.type === 'error') return true;
  if (!enableToasts) return false;
  return !isPhoneRemote || toast.scope !== 'generation' || !!toast.action;
}
