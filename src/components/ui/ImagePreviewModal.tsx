import { useEffect } from 'react';
import './ImagePreviewModal.css';

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  imageAlt: string;
}

function ImagePreviewModal({ isOpen, onClose, imageSrc, imageAlt }: ImagePreviewModalProps) {
  // Handle ESC key press
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="image-preview-modal"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div className="image-preview-modal__overlay" />
      <div className="image-preview-modal__content">
        <img
          src={imageSrc}
          alt={imageAlt}
          className="image-preview-modal__image"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

export default ImagePreviewModal;
