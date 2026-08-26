import { useEffect, useState } from 'react';
import { EmployeeDocument } from '../../types/document';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import api from '../../services/api';
import { getAuthState } from '../../utils/mockAuth';
import { useToast } from '../../contexts/ToastContext';
import './PDFViewer.css';

interface PDFViewerProps {
  isOpen: boolean;
  onClose: () => void;
  document: EmployeeDocument | null;
  pdfData: string | null;
  canDownloadOrPrint?: boolean;
  employeeId?: string;
  employeeName?: string;
}

type ApprovalAction = 'view_document' | 'print_document' | 'download_document' | null;

function PDFViewer({
  isOpen,
  onClose,
  document: employeeDocument,
  pdfData,
  canDownloadOrPrint = false,
  employeeId = '',
  employeeName = '',
}: PDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [showSplitDetails, setShowSplitDetails] = useState(false);

  // Approval-request state
  const [pendingAction, setPendingAction] = useState<ApprovalAction>(null);
  const [approvalPurpose, setApprovalPurpose] = useState('');
  const [purposeError, setPurposeError] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  const { showToast } = useToast();
  const currentUser = getAuthState();

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? dateStr : date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleZoomIn = () => setZoom(prev => Math.min(250, prev + 25));
  const handleZoomOut = () => setZoom(prev => Math.max(50, prev - 25));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleResetZoom = () => {
    setZoom(100);
    setRotation(0);
  };
  const handleOpenNewTab = () => {
    if (iframeSrc) {
      window.open(iframeSrc, '_blank');
    }
  };

  useEffect(() => {
    if (isOpen && pdfData) {
      setIsLoading(true);
      const timer = setTimeout(() => setIsLoading(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, pdfData]);

  // Reset maximized, minimized and zoom state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsMaximized(false);
      setIsMinimized(false);
      setShowSplitDetails(false);
      setZoom(100);
      setRotation(0);
      setPendingAction(null);
      setApprovalPurpose('');
      setPurposeError('');
    }
  }, [isOpen]);

  // Intercept Keyboard shortcuts (Print/Save) when access is denied
  // Only fires when the approval modal is NOT open (so textarea typing works normally)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && !canDownloadOrPrint && pendingAction === null) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
          e.preventDefault();
          e.stopPropagation();
          alert('Print access requires admin approval.');
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          e.stopPropagation();
          alert('Download access requires admin approval.');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, canDownloadOrPrint, pendingAction]);

  // Block right-click context menu on the PDF content only — not inside the approval modal
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (isOpen && !canDownloadOrPrint && pendingAction === null) {
        e.preventDefault();
      }
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, [isOpen, canDownloadOrPrint, pendingAction]);

  // ── Direct actions (for users who already have permission) ───────────────────

  const handleDownloadDirect = async () => {
    if (!pdfData || !employeeDocument) return;
    try {
      const response = await fetch(pdfData);
      if (!response.ok) throw new Error('Failed to fetch file');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = employeeDocument.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      showToast('Download failed.', 'error');
    }
  };

  const handlePrintDirect = () => {
    if (!pdfData) return;
    const printWindow = window.open(pdfData, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      }, true);
    }
  };

  // ── Approval-request actions (for users who need permission) ─────────────────

  const handleRequestApproval = (action: ApprovalAction) => {
    setApprovalPurpose('');
    setPurposeError('');
    setPendingAction(action);
  };

  const handleConfirmApprovalRequest = async () => {
    if (!pendingAction || !employeeDocument) return;

    if (!approvalPurpose.trim()) {
      setPurposeError('Please state your purpose for this request.');
      return;
    }

    setIsSubmittingApproval(true);
    try {
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
        action: pendingAction,
        entityType: 'document',
        entityId: employeeDocument.id,
        entityName: employeeDocument.fileName,
        payload: {
          documentId: employeeDocument.id,
          fileName: employeeDocument.fileName,
          category: employeeDocument.category,
          employeeId,
          employeeName,
          purpose: approvalPurpose.trim(),
          pdfUrl: pdfData,
        },
      });
      showToast(
        `✅ ${pendingAction === 'print_document' ? 'Print' : pendingAction === 'download_document' ? 'Download' : 'View'} request submitted. An admin must approve it before the action is executed.`,
        'info'
      );
      setPendingAction(null);
      setApprovalPurpose('');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit approval request.', 'error');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  if (!employeeDocument) return null;

  if (isOpen && isMinimized) {
    return (
      <div className="pdf-viewer-dock" onClick={(e) => e.stopPropagation()}>
        <span className="pdf-viewer-dock__title" title={employeeDocument.fileName}>
          📄 {employeeDocument.fileName}
        </span>
        <div className="pdf-viewer-dock__actions">
          <button type="button" onClick={() => setIsMinimized(false)} title="Restore window" aria-label="Restore window">
            ➕
          </button>
          <button type="button" onClick={onClose} title="Close" aria-label="Close">
            ✕
          </button>
        </div>
      </div>
    );
  }

  // Only privileged users get a real src — everyone else sees the locked placeholder
  const iframeSrc = pdfData && canDownloadOrPrint ? `${pdfData}#toolbar=0&zoom=${zoom}` : '';

  const modalSize = 'xl';

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={employeeDocument.fileName}
        size={modalSize}
        isMaximized={isMaximized}
        noPadding
      >
        <div className={`pdf-viewer ${!canDownloadOrPrint ? 'pdf-viewer--no-print' : ''} ${isMaximized ? 'pdf-viewer--maximized' : ''}`}>
          <div className="pdf-viewer__header">
            <div className="pdf-viewer__metadata">
              <span className="pdf-viewer__meta-item">
                <strong>Category:</strong> {employeeDocument.category}
              </span>
              <span className="pdf-viewer__meta-item">
                <strong>Uploaded by:</strong> {employeeDocument.uploadedBy || 'System'}
              </span>
              <span className="pdf-viewer__meta-item">
                <strong>Date:</strong> {formatDate(employeeDocument.uploadedAt || (employeeDocument as any).createdAt)}
              </span>
            </div>

            <div className="pdf-viewer__actions">
              {/* Zoom Button Group */}
              <div className="pdf-viewer__btn-group">
                <button
                  type="button"
                  className="pdf-viewer__window-btn"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  aria-label="Zoom Out"
                >
                  ➖
                </button>
                <span className="pdf-viewer__zoom-val">
                  {zoom}%
                </span>
                <button
                  type="button"
                  className="pdf-viewer__window-btn"
                  onClick={handleZoomIn}
                  title="Zoom In"
                  aria-label="Zoom In"
                >
                  ➕
                </button>
              </div>

              {/* Transform Group */}
              <div className="pdf-viewer__btn-group">
                <button
                  type="button"
                  className="pdf-viewer__window-btn"
                  onClick={handleRotate}
                  title="Rotate 90° Clockwise"
                  aria-label="Rotate 90°"
                >
                  ⟳ Rotate
                </button>
                <button
                  type="button"
                  className="pdf-viewer__window-btn"
                  onClick={handleResetZoom}
                  title="Reset Zoom & Rotation"
                  aria-label="Reset View"
                >
                  ↺ Reset
                </button>
              </div>

              {/* Window / Open Tools */}
              <div className="pdf-viewer__btn-group">
                {canDownloadOrPrint && iframeSrc && (
                  <button
                    type="button"
                    className="pdf-viewer__window-btn"
                    onClick={handleOpenNewTab}
                    title="Open in new window / tab"
                    aria-label="Open in new window"
                  >
                    ↗ Open Tab
                  </button>
                )}
                <button
                  type="button"
                  className="pdf-viewer__window-btn"
                  onClick={() => setIsMinimized(true)}
                  title="Minimize file viewer"
                  aria-label="Minimize file viewer"
                >
                  🗕
                </button>
                <button
                  type="button"
                  className={`pdf-viewer__window-btn ${isMaximized ? 'pdf-viewer__window-btn--active' : ''}`}
                  onClick={() => setIsMaximized((prev) => !prev)}
                  title={isMaximized ? 'Restore window size' : 'Maximize window'}
                  aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
                >
                  {isMaximized ? '🗗 Restore' : '🗖 Maximize'}
                </button>
              </div>

              {/* Split View Toggle */}
              <button
                type="button"
                className={`pdf-viewer__window-btn ${showSplitDetails ? 'pdf-viewer__window-btn--active' : ''}`}
                onClick={() => setShowSplitDetails((prev) => !prev)}
                title={showSplitDetails ? 'Hide details panel' : 'Show details side-by-side'}
                aria-label="Toggle details split view"
              >
                📋 {showSplitDetails ? 'Hide Details' : 'Split View'}
              </button>

              {/* Print & Download Buttons */}
              {canDownloadOrPrint ? (
                // Superadmin / admin / developer — direct access
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <Button variant="secondary" size="sm" onClick={handlePrintDirect}>
                    🖨️ Print
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleDownloadDirect}>
                    ⬇️ Download
                  </Button>
                </div>
              ) : (
                // Staff / viewer — must request approval
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRequestApproval('view_document')}
                  >
                    👁️ View
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRequestApproval('print_document')}
                  >
                    🖨️ Print
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRequestApproval('download_document')}
                  >
                    ⬇️ Download
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="pdf-viewer__content">
            <div className={`pdf-viewer__body--split`}>
              <div className="pdf-viewer__split-doc-pane" style={{ overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isLoading && canDownloadOrPrint && (
                  <div className="pdf-viewer__loading">
                    <div className="pdf-viewer__spinner"></div>
                    <p>Loading PDF...</p>
                  </div>
                )}

                {/* Privileged users — render the iframe */}
                {canDownloadOrPrint && iframeSrc && (
                  <iframe
                    key={`${zoom}-${rotation}`}
                    src={iframeSrc}
                    className="pdf-viewer__iframe"
                    title={employeeDocument.fileName}
                    style={{
                      display: isLoading ? 'none' : 'block',
                      transform: `rotate(${rotation}deg) scale(${zoom / 100})`,
                      transformOrigin: 'center center',
                      transition: 'transform 0.2s ease-out',
                    }}
                  />
                )}

                {/* Non-privileged users — locked placeholder */}
                {!canDownloadOrPrint && (
                  <div className="pdf-viewer__locked">
                    <div className="pdf-viewer__locked-icon">🔒</div>
                    <p className="pdf-viewer__locked-title">Access Restricted</p>
                    <p className="pdf-viewer__locked-body">
                      You need admin approval to view, print, or download this file.
                      Use the buttons above to submit a request.
                    </p>
                    <p className="pdf-viewer__locked-filename">
                      {employeeDocument.fileName}
                    </p>
                  </div>
                )}

                {canDownloadOrPrint && !iframeSrc && !isLoading && (
                  <div className="pdf-viewer__error">
                    <p>Failed to load PDF document</p>
                  </div>
                )}
              </div>

              {/* Side Details Pane */}
              {showSplitDetails && (
                <div className="pdf-viewer__split-details-pane">
                  <div className="pdf-viewer__detail-group">
                    <h5 className="pdf-viewer__detail-group-title">Document Metadata</h5>
                    <div className="pdf-viewer__detail-row">
                      <span className="pdf-viewer__detail-label">File Name</span>
                      <span className="pdf-viewer__detail-value">{employeeDocument.fileName}</span>
                    </div>
                    <div className="pdf-viewer__detail-row">
                      <span className="pdf-viewer__detail-label">Category</span>
                      <span className="pdf-viewer__detail-value">{employeeDocument.category}</span>
                    </div>
                    {employeeDocument.fileSize && (
                      <div className="pdf-viewer__detail-row">
                        <span className="pdf-viewer__detail-label">File Size</span>
                        <span className="pdf-viewer__detail-value">
                          {(employeeDocument.fileSize / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    )}
                    <div className="pdf-viewer__detail-row">
                      <span className="pdf-viewer__detail-label">Uploaded By</span>
                      <span className="pdf-viewer__detail-value">{employeeDocument.uploadedBy || 'System'}</span>
                    </div>
                    <div className="pdf-viewer__detail-row">
                      <span className="pdf-viewer__detail-label">Uploaded Date</span>
                      <span className="pdf-viewer__detail-value">
                        {formatDate(employeeDocument.uploadedAt || (employeeDocument as any).createdAt)}
                      </span>
                    </div>
                  </div>

                  {(employeeId || employeeName) && (
                    <div className="pdf-viewer__detail-group">
                      <h5 className="pdf-viewer__detail-group-title">Associated Employee</h5>
                      {employeeName && (
                        <div className="pdf-viewer__detail-row">
                          <span className="pdf-viewer__detail-label">Employee Name</span>
                          <span className="pdf-viewer__detail-value">{employeeName}</span>
                        </div>
                      )}
                      {employeeId && (
                        <div className="pdf-viewer__detail-row">
                          <span className="pdf-viewer__detail-label">Employee ID</span>
                          <span className="pdf-viewer__detail-value">{employeeId}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {(employeeDocument.aoNumber || (employeeDocument as any).aoYear) && (
                    <div className="pdf-viewer__detail-group">
                      <h5 className="pdf-viewer__detail-group-title">Administrative Order Details</h5>
                      {employeeDocument.aoNumber && (
                        <div className="pdf-viewer__detail-row">
                          <span className="pdf-viewer__detail-label">AO Number</span>
                          <span className="pdf-viewer__detail-value">{employeeDocument.aoNumber}</span>
                        </div>
                      )}
                      {(employeeDocument as any).aoYear && (
                        <div className="pdf-viewer__detail-row">
                          <span className="pdf-viewer__detail-label">Series Year</span>
                          <span className="pdf-viewer__detail-value">{(employeeDocument as any).aoYear}</span>
                        </div>
                      )}
                      {(employeeDocument as any).aoType && (
                        <div className="pdf-viewer__detail-row">
                          <span className="pdf-viewer__detail-label">AO Type</span>
                          <span className="pdf-viewer__detail-value">{(employeeDocument as any).aoType}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Approval-request confirmation modal */}
      <Modal
        isOpen={pendingAction !== null}
        onClose={() => { setPendingAction(null); setApprovalPurpose(''); setPurposeError(''); }}
        title="Admin Approval Required"
        size="sm"
      >
        <div className="pdf-viewer__approval-body" onClick={(e) => e.stopPropagation()}>
          <div className="pdf-viewer__approval-icon">🔒</div>
          <p className="pdf-viewer__approval-text">
            {pendingAction === 'print_document'
              ? 'Printing this document requires admin approval.'
              : pendingAction === 'download_document'
              ? 'Downloading this document requires admin approval.'
              : 'Viewing this document requires admin approval.'}
          </p>
          <p className="pdf-viewer__approval-subtext">
            Once approved, you will have <strong>24 hours</strong> to{' '}
            {pendingAction === 'print_document' ? 'print' : pendingAction === 'download_document' ? 'download' : 'view'}{' '}
            the file from your <strong>Requests</strong> panel. After that the access expires.
          </p>
          <p className="pdf-viewer__approval-filename">
            <strong>File:</strong> {employeeDocument?.fileName}
          </p>
          <div className="pdf-viewer__approval-purpose">
            <label className="pdf-viewer__approval-purpose-label">
              Purpose <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <textarea
              className="pdf-viewer__approval-purpose-input"
              placeholder="Briefly explain why you need to access this file…"
              value={approvalPurpose}
              onChange={(e) => {
                setApprovalPurpose(e.target.value);
                if (e.target.value.trim()) setPurposeError('');
              }}
              rows={3}
            />
            {purposeError && (
              <span className="pdf-viewer__approval-purpose-error">⚠️ {purposeError}</span>
            )}
          </div>
        </div>
        <div className="pdf-viewer__approval-footer">
          <Button variant="ghost" onClick={() => setPendingAction(null)} disabled={isSubmittingApproval}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmApprovalRequest}
            disabled={isSubmittingApproval}
          >
            {isSubmittingApproval ? 'Submitting…' : 'Submit Request'}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default PDFViewer;
