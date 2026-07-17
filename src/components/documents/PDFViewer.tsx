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

  const handleZoomIn = () => setZoom(prev => Math.min(200, prev + 25));
  const handleZoomOut = () => setZoom(prev => Math.max(50, prev - 25));

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
      setZoom(100);
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
  const iframeSrc = pdfData && canDownloadOrPrint ? `${pdfData}#zoom=${zoom}` : '';

  const modalSize = isMaximized ? 'xl' : 'lg';

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={employeeDocument.fileName}
        size={modalSize}
        isMaximized={isMaximized}
      >
        <div className={`pdf-viewer ${!canDownloadOrPrint ? 'pdf-viewer--no-print' : ''} ${isMaximized ? 'pdf-viewer--maximized' : ''}`}>
          <div className="pdf-viewer__header">
            <div className="pdf-viewer__metadata">
              <span className="pdf-viewer__meta-item">
                <strong>Category:</strong> {employeeDocument.category}
              </span>
              <span className="pdf-viewer__meta-item">
                <strong>Uploaded by:</strong> {employeeDocument.uploadedBy}
              </span>
              <span className="pdf-viewer__meta-item">
                <strong>Date:</strong> {formatDate(employeeDocument.uploadedAt || (employeeDocument as any).createdAt)}
              </span>
            </div>

            <div className="pdf-viewer__actions">
              {/* Window Controls: Minus (Minimize) and Plus (Maximize) */}
              <button
                type="button"
                className="pdf-viewer__window-btn"
                onClick={() => setIsMinimized(true)}
                title="Minimize file viewer"
                aria-label="Minimize file viewer"
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
              >
                ➖
              </button>

              <button
                type="button"
                className="pdf-viewer__window-btn"
                onClick={() => setIsMaximized((prev) => !prev)}
                title={isMaximized ? 'Restore window' : 'Maximize window'}
                aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
              >
                ➕
              </button>

              {canDownloadOrPrint ? (
                // Superadmin / admin / developer — direct access
                <>
                  <Button variant="secondary" size="sm" onClick={handlePrintDirect}>
                    🖨️ Print
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleDownloadDirect}>
                    ⬇️ Download
                  </Button>
                </>
              ) : (
                // Staff / viewer — must request approval
                <>
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
                </>
              )}
            </div>
          </div>

          <div className="pdf-viewer__content">
            {isLoading && canDownloadOrPrint && (
              <div className="pdf-viewer__loading">
                <div className="pdf-viewer__spinner"></div>
                <p>Loading PDF...</p>
              </div>
            )}

            {/* Privileged users — render the iframe */}
            {canDownloadOrPrint && iframeSrc && (
              <iframe
                key={zoom}
                src={iframeSrc}
                className="pdf-viewer__iframe"
                title={employeeDocument.fileName}
                style={{ display: isLoading ? 'none' : 'block' }}
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
