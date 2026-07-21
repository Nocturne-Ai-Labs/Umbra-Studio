import { useContext, useCallback } from 'react';
import { ModalContext } from '@/contexts/ModalContext';

export function useModal() {
  const context = useContext(ModalContext);

  if (!context) {
    throw new Error('useModal must be used within ModalProvider');
  }

  // Helper for confirm dialogs
  const confirm = useCallback(async (message: string, title?: string): Promise<boolean> => {
    return context.openModal<boolean>('confirm', { message, title: title || 'Confirm' });
  }, [context]);

  // Helper for prompt dialogs
  const prompt = useCallback(async (message: string, defaultValue?: string, title?: string): Promise<string | null> => {
    return context.openModal<string | null>('prompt', { 
      message, 
      defaultValue, 
      title: title || 'Input' 
    });
  }, [context]);

  // Helper for alert dialogs
  const alert = useCallback(async (message: string, title?: string): Promise<void> => {
    return context.openModal<void>('alert', { message, title: title || 'Alert' });
  }, [context]);

  return {
    openModal: context.openModal,
    closeModal: context.closeModal,
    closeAll: context.closeAll,
    confirm,
    prompt,
    alert
  };
}