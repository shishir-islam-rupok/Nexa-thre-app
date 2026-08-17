import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-start justify-center p-0 sm:p-4 sm:pt-[8vh] bg-ink-950/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full ${sizes[size]} max-h-[100dvh] sm:max-h-[84vh] bg-white dark:bg-ink-900 rounded-t-2xl sm:rounded-2xl border border-ink-200 dark:border-ink-800 shadow-xl animate-slide-up overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-ink-100 dark:border-ink-800 shrink-0">
            <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50 truncate pr-3">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-2 -mr-1.5 rounded-lg text-ink-400 hover:text-ink-600 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain safe-bottom">{children}</div>
      </div>
    </div>
  );
}
