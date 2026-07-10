import { useEffect, useRef } from 'react';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
  icon?: string;
}

function Toast({ message, type = 'success', duration = 10000, onClose, icon }: ToastProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const okButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Don't auto-focus if a modal is open
    const modalOpen = document.querySelector('.modal-overlay');
    if (!modalOpen) {
      okButtonRef.current?.focus();
    }

    // Auto-dismiss for success and info toasts
    if (type !== 'warning' && type !== 'error') {
      timerRef.current = setTimeout(() => {
        onClose();
      }, duration);
    }

    // Only handle Escape/Enter when NO modal and NO input is focused
    const handleKeyDown = (e: KeyboardEvent) => {
      const isModalOpen = document.querySelector('.modal-overlay');
      if (isModalOpen) return;

      const active = document.activeElement;
      if (active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        (active as HTMLElement).isContentEditable
      )) return;

      if (e.key === 'Escape' || e.key === 'Enter') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [duration, onClose, type]);

  const getIcon = () => {
    if (icon) return icon;
    switch (type) {
      case 'success': return '✓';
      case 'error':   return '✕';
      case 'warning': return '⚠';
      case 'info':    return 'ℹ';
      default:        return '✓';
    }
  };

  // Don't render the blocking overlay when a modal is open
  const isModalOpen = typeof document !== 'undefined' && !!document.querySelector('.modal-overlay');

  return (
    <>
      {!isModalOpen && <div className="toast-overlay" onClick={onClose} />}
      <div
        className={`toast-center toast-center--${type}`}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <div className="toast-center__icon-wrapper">
          <div className="toast-center__icon">{getIcon()}</div>
        </div>
        <div className="toast-center__content">
          <div className="toast-center__message">{message}</div>
        </div>
        <button
          ref={okButtonRef}
          className="toast-center__button"
          onClick={onClose}
          type="button"
          aria-label="Dismiss notification"
        >
          OK
        </button>
      </div>
    </>
  );
}

export default Toast;
