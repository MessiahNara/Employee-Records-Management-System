import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import {
  MdZoomIn,
  MdZoomOut,
  MdRotateRight,
  MdRestartAlt,
  MdOpenInNew,
  MdFullscreen,
  MdFullscreenExit,
  MdPerson,
  MdDescription,
  MdCompareArrows,
  MdDownload,
  MdPrint,
} from 'react-icons/md';
import './SplitDocumentViewer.css';

export interface DiffField {
  label: string;
  oldValue: any;
  newValue: any;
}

interface SplitDocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  pdfUrl?: string | null;
  pdfData?: string | null;
  documentMetadata?: {
    fileName?: string;
    category?: string;
    fileSize?: number;
    uploadedBy?: string;
    createdAt?: string;
    aoNumber?: string;
    aoYear?: string;
    aoType?: string;
    [key: string]: any;
  } | null;
  employeeData?: {
    id?: string;
    name?: string;
    office?: string;
    position?: string;
    status?: string;
    appointmentStatus?: string;
    [key: string]: any;
  } | null;
  diffs?: DiffField[] | null;
  customRightContent?: React.ReactNode;
  actions?: React.ReactNode;
  canDownloadOrPrint?: boolean;
}

export const SplitDocumentViewer: React.FC<SplitDocumentViewerProps> = ({
  isOpen,
  onClose,
  title = 'Document & Details Inspection',
  pdfUrl,
  pdfData,
  documentMetadata,
  employeeData,
  diffs,
  customRightContent,
  actions,
  canDownloadOrPrint = true,
}) => {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [layoutMode, setLayoutMode] = useState<'50-50' | '65-35' | '35-65' | '100-0'>('50-50');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const activeSrc = pdfUrl || pdfData;

  useEffect(() => {
    if (isOpen && activeSrc) {
      setIsLoading(true);
      const timer = setTimeout(() => setIsLoading(false), 400);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeSrc]);

  useEffect(() => {
    if (!isOpen) {
      setZoom(100);
      setRotation(0);
      setIsFullscreen(false);
      setLayoutMode('50-50');
    }
  }, [isOpen]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 250));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));
  const handleResetZoom = () => {
    setZoom(100);
    setRotation(0);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleOpenNewTab = () => {
    if (activeSrc) {
      window.open(activeSrc, '_blank');
    }
  };

  const getFlexLeft = () => {
    if (layoutMode === '100-0') return '1';
    if (layoutMode === '65-35') return '0.65';
    if (layoutMode === '35-65') return '0.35';
    return '0.5';
  };

  const getFlexRight = () => {
    if (layoutMode === '100-0') return '0';
    if (layoutMode === '65-35') return '0.35';
    if (layoutMode === '35-65') return '0.65';
    return '0.5';
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="xl"
    >
      <div className="split-viewer">
        {/* Top bar */}
        <div className="split-viewer__topbar">
          <div className="split-viewer__title-group">
            <div className="split-viewer__badge-icon">
              <MdDescription />
            </div>
            <div>
              <h3 className="split-viewer__filename">
                {documentMetadata?.fileName || title}
              </h3>
              <span className="split-viewer__meta-tag">
                {documentMetadata?.category ? `${documentMetadata.category} • ` : ''}
                Side-by-Side Review
              </span>
            </div>
          </div>

          {/* Layout Ratio Selector */}
          <div className="split-viewer__layout-switcher">
            <button
              type="button"
              className={`split-viewer__layout-btn ${layoutMode === '50-50' ? 'split-viewer__layout-btn--active' : ''}`}
              onClick={() => setLayoutMode('50-50')}
              title="Equal 50/50 Split"
            >
              50:50
            </button>
            <button
              type="button"
              className={`split-viewer__layout-btn ${layoutMode === '65-35' ? 'split-viewer__layout-btn--active' : ''}`}
              onClick={() => setLayoutMode('65-35')}
              title="Document Focused 65/35"
            >
              65:35
            </button>
            <button
              type="button"
              className={`split-viewer__layout-btn ${layoutMode === '35-65' ? 'split-viewer__layout-btn--active' : ''}`}
              onClick={() => setLayoutMode('35-65')}
              title="Data Focused 35/65"
            >
              35:65
            </button>
            <button
              type="button"
              className={`split-viewer__layout-btn ${layoutMode === '100-0' ? 'split-viewer__layout-btn--active' : ''}`}
              onClick={() => setLayoutMode('100-0')}
              title="Full Document View"
            >
              Doc Only
            </button>
          </div>

          {/* PDF Toolbar */}
          <div className="split-viewer__pdf-toolbar">
            <button
              type="button"
              className="split-viewer__tool-btn"
              onClick={handleZoomOut}
              title="Zoom Out"
            >
              <MdZoomOut size={16} />
            </button>
            <span className="split-viewer__zoom-pill">{zoom}%</span>
            <button
              type="button"
              className="split-viewer__tool-btn"
              onClick={handleZoomIn}
              title="Zoom In"
            >
              <MdZoomIn size={16} />
            </button>
            <button
              type="button"
              className="split-viewer__tool-btn"
              onClick={handleRotate}
              title="Rotate 90° Clockwise"
            >
              <MdRotateRight size={16} />
            </button>
            <button
              type="button"
              className="split-viewer__tool-btn"
              onClick={handleResetZoom}
              title="Reset View"
            >
              <MdRestartAlt size={16} />
            </button>
            {canDownloadOrPrint && activeSrc && (
              <button
                type="button"
                className="split-viewer__tool-btn"
                onClick={handleOpenNewTab}
                title="Open in new window"
              >
                <MdOpenInNew size={16} />
              </button>
            )}
            <button
              type="button"
              className="split-viewer__tool-btn"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <MdFullscreenExit size={16} /> : <MdFullscreen size={16} />}
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="split-viewer__main">
          {/* Left: PDF Frame */}
          <div
            className="split-viewer__pane-left"
            style={{ flex: getFlexLeft() }}
          >
            {isLoading && (
              <div className="split-viewer__loading-overlay">
                <div className="split-viewer__spinner" />
                <span>Loading Document Preview...</span>
              </div>
            )}

            <div className="split-viewer__iframe-wrapper">
              {activeSrc ? (
                <iframe
                  key={`${zoom}-${rotation}`}
                  src={`${activeSrc}#toolbar=0&navpanes=0&zoom=${zoom}`}
                  className="split-viewer__iframe"
                  title="Document Preview"
                  style={{
                    transform: `rotate(${rotation}deg) scale(${zoom / 100})`,
                    transformOrigin: 'center center',
                  }}
                />
              ) : (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>
                  <p>No preview available for this document.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Data / Review Panel */}
          {layoutMode !== '100-0' && (
            <div
              className="split-viewer__pane-right"
              style={{ flex: getFlexRight() }}
            >
              <div className="split-viewer__pane-right-content">
                {/* Custom Content Slot */}
                {customRightContent}

                {/* Diff View if provided */}
                {diffs && diffs.length > 0 && (
                  <div className="split-viewer__section-card">
                    <h4 className="split-viewer__section-title">
                      <MdCompareArrows size={18} color="var(--color-warning)" />
                      Changes Comparison (Diff)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      {diffs.map((d, idx) => (
                        <div key={idx} className="split-viewer__diff-item">
                          <span className="split-viewer__kv-key">{d.label}</span>
                          <div className="split-viewer__diff-row">
                            <span className="split-viewer__diff-badge-old">
                              {d.oldValue !== undefined && d.oldValue !== null && d.oldValue !== '' ? String(d.oldValue) : '(empty)'}
                            </span>
                            <span>➔</span>
                            <span className="split-viewer__diff-badge-new">
                              {d.newValue !== undefined && d.newValue !== null && d.newValue !== '' ? String(d.newValue) : '(empty)'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Employee Info Card */}
                {employeeData && (
                  <div className="split-viewer__section-card">
                    <h4 className="split-viewer__section-title">
                      <MdPerson size={18} color="var(--color-primary)" />
                      Associated Employee
                    </h4>
                    <div className="split-viewer__kv-grid">
                      {employeeData.name && (
                        <div className="split-viewer__kv-item">
                          <span className="split-viewer__kv-key">Full Name</span>
                          <span className="split-viewer__kv-val">{employeeData.name}</span>
                        </div>
                      )}
                      {employeeData.id && (
                        <div className="split-viewer__kv-item">
                          <span className="split-viewer__kv-key">Employee ID</span>
                          <span className="split-viewer__kv-val">{employeeData.id}</span>
                        </div>
                      )}
                      {employeeData.office && (
                        <div className="split-viewer__kv-item">
                          <span className="split-viewer__kv-key">Office / Hospital</span>
                          <span className="split-viewer__kv-val">{employeeData.office}</span>
                        </div>
                      )}
                      {employeeData.position && (
                        <div className="split-viewer__kv-item">
                          <span className="split-viewer__kv-key">Position</span>
                          <span className="split-viewer__kv-val">{employeeData.position}</span>
                        </div>
                      )}
                      {employeeData.status && (
                        <div className="split-viewer__kv-item">
                          <span className="split-viewer__kv-key">Status</span>
                          <span className="split-viewer__kv-val">{employeeData.status}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Document Metadata Card */}
                {documentMetadata && (
                  <div className="split-viewer__section-card">
                    <h4 className="split-viewer__section-title">
                      <MdDescription size={18} color="var(--color-info)" />
                      Document Metadata
                    </h4>
                    <div className="split-viewer__kv-grid">
                      {documentMetadata.fileName && (
                        <div className="split-viewer__kv-item">
                          <span className="split-viewer__kv-key">File Name</span>
                          <span className="split-viewer__kv-val">{documentMetadata.fileName}</span>
                        </div>
                      )}
                      {documentMetadata.category && (
                        <div className="split-viewer__kv-item">
                          <span className="split-viewer__kv-key">Category</span>
                          <span className="split-viewer__kv-val">{documentMetadata.category}</span>
                        </div>
                      )}
                      {documentMetadata.fileSize && (
                        <div className="split-viewer__kv-item">
                          <span className="split-viewer__kv-key">File Size</span>
                          <span className="split-viewer__kv-val">{formatFileSize(documentMetadata.fileSize)}</span>
                        </div>
                      )}
                      {documentMetadata.uploadedBy && (
                        <div className="split-viewer__kv-item">
                          <span className="split-viewer__kv-key">Uploaded By</span>
                          <span className="split-viewer__kv-val">{documentMetadata.uploadedBy}</span>
                        </div>
                      )}
                      {documentMetadata.aoNumber && (
                        <div className="split-viewer__kv-item">
                          <span className="split-viewer__kv-key">AO Number</span>
                          <span className="split-viewer__kv-val">{documentMetadata.aoNumber}</span>
                        </div>
                      )}
                      {documentMetadata.aoYear && (
                        <div className="split-viewer__kv-item">
                          <span className="split-viewer__kv-key">Series Year</span>
                          <span className="split-viewer__kv-val">{documentMetadata.aoYear}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Footer in Right Pane */}
              <div className="split-viewer__action-footer">
                {actions ? (
                  actions
                ) : (
                  <Button variant="secondary" onClick={onClose}>
                    Close
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SplitDocumentViewer;
