'use client';

import React, { createContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { BaseModal } from '@/components/modals/BaseModal';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';
import { AlertDialog } from '@/components/modals/AlertDialog';
import { PromptDialog } from '@/components/modals/PromptDialog';

// Define the types of modals available
export type ModalType = 'confirm' | 'alert' | 'prompt' | 'custom';

export interface ModalProps {
  title?: string;
  message?: string;
  [key: string]: any;
}

interface ModalItem {
  id: string;
  type: ModalType;
  props: ModalProps;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  component?: React.ComponentType<any>; // For custom modals
}

interface ModalContextType {
  openModal: <T = any>(type: ModalType, props?: ModalProps, component?: React.ComponentType<any>) => Promise<T>;
  closeModal: (id: string, result?: any) => void;
  closeAll: () => void;
}

export const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modals, setModals] = useState<ModalItem[]>([]);

  const openModal = useCallback(<T = any>(type: ModalType, props: ModalProps = {}, component?: React.ComponentType<any>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substring(2, 9);
      setModals((prev) => [...prev, { id, type, props, resolve, reject, component }]);
    });
  }, []);

  const closeModal = useCallback((id: string, result?: any) => {
    setModals((prev) => {
      const modal = prev.find((m) => m.id === id);
      if (modal) {
        modal.resolve(result);
      }
      return prev.filter((m) => m.id !== id);
    });
  }, []);

  const closeAll = useCallback(() => {
    setModals((prev) => {
      prev.forEach((modal) => modal.resolve(null)); // Resolve all with null/undefined
      return [];
    });
  }, []);

  // ✅ Memoize context value to prevent re-renders
  const contextValue = useMemo(
    () => ({ openModal, closeModal, closeAll }),
    [openModal, closeModal, closeAll]
  );

  return (
    <ModalContext.Provider value={contextValue}>
      {children}
      
      {/* Render Modals */}
      {modals.map((modal) => {
        // Determine which component to render
        let ModalComponent = null;
        
        switch (modal.type) {
          case 'confirm':
            ModalComponent = ConfirmDialog;
            break;
          case 'alert':
            ModalComponent = AlertDialog;
            break;
          case 'prompt':
            ModalComponent = PromptDialog;
            break;
          case 'custom':
            ModalComponent = modal.component || BaseModal;
            break;
          default:
            ModalComponent = BaseModal;
        }

        if (!ModalComponent) return null;

        return (
          <ModalComponent
            key={modal.id}
            {...modal.props}
            isOpen={true} // Always true as presence in array implies open
            onClose={() => closeModal(modal.id, null)} // Default close sends null
            onConfirm={(result: any) => closeModal(modal.id, result)}
          />
        );
      })}
    </ModalContext.Provider>
  );
}
