import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideCloseButton?: boolean;
  isMaximized?: boolean;
  noPadding?: boolean;
}

function Modal({ isOpen, onClose, title, children, footer, size = 'md', hideCloseButton = false, isMaximized = false, noPadding = false }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Store the previously focused element
    previousActiveElement.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = 'unset';

      // Restore focus to the previously focused element
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    // Handle Escape key to close modal
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hideCloseButton) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, hideCloseButton]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`modal-overlay ${isMaximized ? 'modal-overlay--maximized' : ''}`}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className={`modal modal--${size} ${isMaximized ? 'modal--maximized' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="modal__header">
            <h2 className="modal__title">{title}</h2>
            {!hideCloseButton && (
              <button
                className="modal__close"
                onClick={onClose}
                aria-label="Close modal"
              >
                ✕
              </button>
            )}
          </div>
        )}
        <div className={`modal__body ${noPadding ? 'modal__body--no-padding' : ''}`}>{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
