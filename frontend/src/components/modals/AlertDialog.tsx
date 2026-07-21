'use client';

import { BaseModal } from './BaseModal';
import { Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void; // Called when OK is clicked
  title?: string;
  message?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  buttonText?: string;
}

export function AlertDialog({
  isOpen,
  onClose: _onClose,
  onConfirm,
  title = 'Alert',
  message = '',
  type = 'info',
  buttonText = 'OK'
}: AlertDialogProps) {

  const handleClose = () => {
    onConfirm(); // Resolve promise
  };

  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle className="text-green-500" size={32} />;
      case 'warning': return <AlertTriangle className="text-yellow-500" size={32} />;
      case 'error': return <XCircle className="text-red-500" size={32} />;
      default: return <Info className="text-blue-500" size={32} />;
    }
  };

  return (
    <BaseModal 
      isOpen={isOpen} 
      onClose={handleClose} 
      title={title}
      size="sm"
      showCloseButton={false}
    >
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="p-4 bg-white/5 rounded-full mb-2">
          {getIcon()}
        </div>
        
        <p className="text-zinc-300 leading-relaxed text-sm">
          {message}
        </p>

        <div className="flex justify-center w-full pt-4">
          <button
            onClick={handleClose}
            className="w-full py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition-all"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
