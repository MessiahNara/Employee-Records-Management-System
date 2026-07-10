import { useState, useRef, useEffect } from 'react';
import Button from './ui/Button';
import './DownloadTemplateButton.css';

interface DownloadTemplateButtonProps {
  onDownload: (format: 'xlsx' | 'csv') => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

function DownloadTemplateButton({ onDownload, variant = 'secondary', size = 'md' }: DownloadTemplateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleDownload = (format: 'xlsx' | 'csv') => {
    onDownload(format);
    setIsOpen(false);
  };

  return (
    <div className="download-template" ref={dropdownRef}>
      <Button
        variant={variant}
        size={size}
        onClick={() => setIsOpen(!isOpen)}
        className="download-template__button"
      >
        <span className="download-template__icon">📥</span>
        <span className="download-template__text">Template</span>
        <span className={`download-template__arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </Button>

      {isOpen && (
        <div className="download-template__dropdown">
          <div className="download-template__header">
            <span className="download-template__title">Choose Format</span>
            <p className="download-template__description">
              Download a pre-formatted template to import employees
            </p>
          </div>

          <div className="download-template__options">
            <button
              className="download-template__option"
              onClick={() => handleDownload('xlsx')}
            >
              <div className="download-template__option-icon">📊</div>
              <div className="download-template__option-content">
                <div className="download-template__option-title">Excel Format (.xlsx)</div>
                <div className="download-template__option-subtitle">
                  Recommended • Better formatting • Easier to edit
                </div>
              </div>
              <div className="download-template__option-badge">Recommended</div>
            </button>

            <button
              className="download-template__option"
              onClick={() => handleDownload('csv')}
            >
              <div className="download-template__option-icon">📄</div>
              <div className="download-template__option-content">
                <div className="download-template__option-title">CSV Format (.csv)</div>
                <div className="download-template__option-subtitle">
                  Universal • Works with any spreadsheet app
                </div>
              </div>
            </button>
          </div>

          <div className="download-template__footer">
            <div className="download-template__info">
              <span className="download-template__info-icon">💡</span>
              <span className="download-template__info-text">
                Template includes sample data and all required fields
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DownloadTemplateButton;
