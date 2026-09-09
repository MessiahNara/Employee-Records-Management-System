import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MdRemove,
  MdCropSquare,
  MdFullscreenExit,
  MdClose,
  MdOpenInFull,
} from 'react-icons/md';
import './Modal.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  hideCloseButton?: boolean;
  isMaximized?: boolean;
  noPadding?: boolean;
  allowMinimize?: boolean;
  allowFullscreen?: boolean;
  maxWidth?: string | number;
  maxHeight?: string | number;
  style?: React.CSSProperties;
}

function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  hideCloseButton = false,
  isMaximized = false,
  noPadding = false,
  allowMinimize,
  allowFullscreen,
  maxWidth,
  maxHeight,
  style,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Automatically disable minimize and fullscreen on small confirmation/alert dialogs (size="sm")
  const showMinimize = allowMinimize !== undefined ? allowMinimize : size !== 'sm';
  const showFullscreen = allowFullscreen !== undefined ? allowFullscreen : size !== 'sm';

  const [isFullscreen, setIsFullscreen] = useState(isMaximized);
  const [isMinimized, setIsMinimized] = useState(false);

  // Sync isFullscreen when isMaximized prop changes externally
  useEffect(() => {
    setIsFullscreen(isMaximized);
  }, [isMaximized]);

  // Reset minimized state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setIsMinimized(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isMinimized) {
      return;
    }

    // Store the previously focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Capture scroll positions across potential scroll containers
    const mainLayoutMain = document.querySelector('.main-layout__main');
    const mainY = mainLayoutMain ? mainLayoutMain.scrollTop : 0;
    const windowY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

    return () => {
      // Restore focus to previously active element without triggering scroll
      if (previousActiveElement.current && previousActiveElement.current.isConnected) {
        try {
          previousActiveElement.current.focus({ preventScroll: true });
        } catch {
          // ignore focus error
        }
      }

      // Re-assert scroll positions
      if (mainLayoutMain && mainY > 0) {
        mainLayoutMain.scrollTop = mainY;
      }
      if (windowY > 0) {
        window.scrollTo(0, windowY);
      }
    };
  }, [isOpen, isMinimized]);

  useEffect(() => {
    if (!isOpen || isMinimized) return;

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
  }, [isOpen, isMinimized, onClose, hideCloseButton]);

  if (!isOpen) return null;

  // Render Minimized Floating Dock Pill
  if (isMinimized) {
    return createPortal(
      <div
        className="modal-minimized-dock"
        onClick={() => setIsMinimized(false)}
        role="button"
        tabIndex={0}
        title="Click to restore active window"
      >
        <div className="modal-minimized-dock__indicator" />
        <div className="modal-minimized-dock__content">
          <span className="modal-minimized-dock__title">
            {typeof title === 'string' ? title : 'Active Window'}
          </span>
          <span className="modal-minimized-dock__sub">Click to restore</span>
        </div>
        <div
          className="modal-minimized-dock__actions"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="modal-minimized-dock__btn"
            onClick={() => setIsMinimized(false)}
            title="Restore Window"
            aria-label="Restore Window"
          >
            <MdOpenInFull size={14} />
          </button>
          {!hideCloseButton && (
            <button
              type="button"
              className="modal-minimized-dock__btn modal-minimized-dock__btn--close"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              <MdClose size={14} />
            </button>
          )}
        </div>
      </div>,
      document.body
    );
  }

  const effectiveMaximized = isFullscreen;

  return createPortal(
    <div
      className={`modal-overlay ${effectiveMaximized ? 'modal-overlay--maximized' : ''}`}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className={`modal modal--${size} ${effectiveMaximized ? 'modal--maximized modal--fullscreen' : ''}`}
        style={effectiveMaximized ? undefined : {
          ...(maxWidth ? { maxWidth } : {}),
          ...(maxHeight ? { maxHeight } : {}),
          ...style,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div
            className="modal__header"
            onDoubleClick={() => showFullscreen && setIsFullscreen((prev) => !prev)}
            title={showFullscreen ? 'Double-click to toggle fullscreen' : undefined}
          >
            <h2 className="modal__title">{title}</h2>
            <div className="modal__controls">
              {showMinimize && (
                <button
                  type="button"
                  className="modal__control-btn modal__control-btn--minimize"
                  onClick={() => setIsMinimized(true)}
                  title="Minimize window"
                  aria-label="Minimize modal"
                >
                  <MdRemove size={18} />
                </button>
              )}
              {showFullscreen && (
                <button
                  type="button"
                  className="modal__control-btn modal__control-btn--fullscreen"
                  onClick={() => setIsFullscreen((prev) => !prev)}
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <MdFullscreenExit size={18} /> : <MdCropSquare size={16} />}
                </button>
              )}
              {!hideCloseButton && (
                <button
                  type="button"
                  className="modal__control-btn modal__control-btn--close"
                  onClick={onClose}
                  title="Close (Esc)"
                  aria-label="Close modal"
                >
                  <MdClose size={18} />
                </button>
              )}
            </div>
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
