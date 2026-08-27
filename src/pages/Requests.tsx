import { useState, useEffect, useCallback, useRef } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import api, { getServerBaseUrl } from '../services/api';
import { getAuthState } from '../utils/mockAuth';
import { useToast } from '../contexts/ToastContext';
import {
  MdRefresh,
  MdAccessTime,
  MdCheckCircle,
  MdCancel,
  MdPending,
  MdVisibility,
  MdPrint,
  MdDownload,
  MdZoomIn,
  MdZoomOut,
  MdRotateRight,
  MdRestartAlt,
} from 'react-icons/md';
import './Requests.css';

const TTL_MINUTES = 30;
const TTL_MS = TTL_MINUTES * 60 * 1000;

const ACTION_LABELS: Record<string, string> = {
  view_document: 'View Document',
  print_document: 'Print Document',
  download_document: 'Download Document',
};

// Returns ms remaining since resolvedAt, or 0 if expired / not yet approved
function getTimeRemaining(req: any): number {
  if (req.status !== 'approved' || !req.resolvedAt) return 0;
  const approvedAt = new Date(req.resolvedAt).getTime();
  const expiresAt = approvedAt + TTL_MS;
  return Math.max(0, expiresAt - Date.now());
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Expired';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  return `${m}m ${s}s`;
}

function Requests() {
  const { showToast } = useToast();
  const currentUser = getAuthState();

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  // Countdown tick — re-renders every second
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // PDF viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom((z) => Math.min(250, z + 25));
  const handleZoomOut = () => setZoom((z) => Math.max(50, z - 25));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleResetZoom = () => {
    setZoom(100);
    setRotation(0);
  };

  // Secondary-request (print/download needs new approval)
  const [secondaryAction, setSecondaryAction] = useState<{ req: any; action: 'print_document' | 'download_document' } | null>(null);
  const [secondaryPurpose, setSecondaryPurpose] = useState('');
  const [secondaryPurposeError, setSecondaryPurposeError] = useState('');
  const [isSubmittingSecondary, setIsSubmittingSecondary] = useState(false);

  const fetchRequests = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const data = await api.approvals.getMyRequests(currentUser.id);
      // Only show document access request types
      const docRequests = data.filter((r: any) =>
        r.action === 'view_document' ||
        r.action === 'print_document' ||
        r.action === 'download_document'
      );
      setRequests(docRequests);
    } catch {
      showToast('Failed to load your requests.', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchRequests();

    const handleUpdate = () => {
      fetchRequests();
    };

    window.addEventListener('approvalsUpdated', handleUpdate);
    window.addEventListener('documentsUpdated', handleUpdate);

    return () => {
      window.removeEventListener('approvalsUpdated', handleUpdate);
      window.removeEventListener('documentsUpdated', handleUpdate);
    };
  }, [fetchRequests]);

  // Auto-remove expired approved requests from the visible list every 10s
  useEffect(() => {
    const id = setInterval(() => {
      setRequests((prev) =>
        prev.filter((r) => {
          if (r.status !== 'approved') return true;
          return getTimeRemaining(r) > 0;
        })
      );
    }, 10000);
    return () => clearInterval(id);
  }, []);

  const visibleRequests = filter === 'active'
    ? requests.filter((r) => {
        if (r.status === 'pending' || r.status === 'rejected') return true;
        if (r.status === 'approved') return getTimeRemaining(r) > 0;
        return false;
      })
    : requests;

  // ── View action ────────────────────────────────────────────────────────────
  const handleView = (req: any) => {
    const remaining = getTimeRemaining(req);
    if (remaining <= 0) {
      showToast('Your access has expired.', 'warning');
      return;
    }
    const docUrl = req.payload?.pdfUrl
      ? req.payload.pdfUrl
      : req.payload?.documentId
      ? `${getServerBaseUrl()}/api/documents/${req.payload.documentId}/file`
      : null;

    if (!docUrl) {
      showToast('Document URL not found.', 'error');
      return;
    }
    setViewerSrc(`${docUrl}#toolbar=0&navpanes=0`);
    setViewerTitle(req.payload?.fileName || req.entityName || 'Document');
    setViewerOpen(true);
  };

  // ── Download action ────────────────────────────────────────────────────────
  const handleDownload = async (req: any) => {
    const remaining = getTimeRemaining(req);
    if (remaining <= 0) {
      showToast('Your access has expired.', 'warning');
      return;
    }
    const docUrl = req.payload?.pdfUrl
      ? req.payload.pdfUrl
      : req.payload?.documentId
      ? `${getServerBaseUrl()}/api/documents/${req.payload.documentId}/file`
      : null;

    if (!docUrl) { showToast('Document URL not found.', 'error'); return; }

    try {
      const response = await fetch(docUrl);
      if (!response.ok) throw new Error('Failed to fetch file');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = req.payload?.fileName || req.entityName || 'document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      showToast('Download failed.', 'error');
    }
  };

  // ── Print action ───────────────────────────────────────────────────────────
  const handlePrint = async (req: any) => {
    const remaining = getTimeRemaining(req);
    if (remaining <= 0) {
      showToast('Your access has expired.', 'warning');
      return;
    }
    const docUrl = req.payload?.pdfUrl
      ? req.payload.pdfUrl
      : req.payload?.documentId
      ? `${getServerBaseUrl()}/api/documents/${req.payload.documentId}/file`
      : null;

    if (!docUrl) {
      showToast('Document URL not found.', 'error');
      return;
    }

    try {
      let blobUrl = docUrl;
      let isCreatedBlob = false;
      if (!docUrl.startsWith('blob:') && !docUrl.startsWith('data:')) {
        const response = await fetch(docUrl);
        if (!response.ok) throw new Error('Failed to fetch document for printing');
        const blob = await response.blob();
        blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        isCreatedBlob = true;
      }

      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = 'none';
      printFrame.style.opacity = '0';
      printFrame.style.pointerEvents = 'none';
      printFrame.src = blobUrl;

      printFrame.onload = () => {
        setTimeout(() => {
          try {
            printFrame.contentWindow?.focus();
            printFrame.contentWindow?.print();
          } catch (err) {
            console.error('Print trigger failed:', err);
          } finally {
            setTimeout(() => {
              if (document.body.contains(printFrame)) {
                document.body.removeChild(printFrame);
              }
              if (isCreatedBlob) URL.revokeObjectURL(blobUrl);
            }, 60000);
          }
        }, 500);
      };

      document.body.appendChild(printFrame);
    } catch (err) {
      console.error('Print failed:', err);
      showToast('Failed to start printing.', 'error');
    }
  };

  // ── Secondary request (from within viewer — print/download needs new approval) ──
  const openSecondaryRequest = (req: any, action: 'print_document' | 'download_document') => {
    setSecondaryPurpose('');
    setSecondaryPurposeError('');
    setSecondaryAction({ req, action });
  };

  const handleSubmitSecondary = async () => {
    if (!secondaryAction) return;
    if (!secondaryPurpose.trim()) {
      setSecondaryPurposeError('Please state your purpose.');
      return;
    }
    setIsSubmittingSecondary(true);
    try {
      const { req, action } = secondaryAction;
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
        action,
        entityType: 'document',
        entityId: req.payload?.documentId || req.entityId,
        entityName: req.payload?.fileName || req.entityName,
        payload: {
          ...req.payload,
          purpose: secondaryPurpose.trim(),
        },
      });
      showToast(
        `✅ ${action === 'print_document' ? 'Print' : 'Download'} request submitted for admin approval.`,
        'info'
      );
      setSecondaryAction(null);
      fetchRequests();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit request.', 'error');
    } finally {
      setIsSubmittingSecondary(false);
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="requests">
      <div className="requests__header">
        <div>
          <h1 className="requests__title">Request &amp; Approvals</h1>
          <p className="requests__subtitle">
            Review and approve pending requests from other users
            {pendingCount > 0 && (
              <span className="requests__pending-badge">{pendingCount} pending</span>
            )}
          </p>
        </div>
        <div className="requests__header-actions">
          <div className="requests__filter-tabs">
            <button
              className={`requests__filter-tab ${filter === 'active' ? 'requests__filter-tab--active' : ''}`}
              onClick={() => setFilter('active')}
            >
              {filter === 'active' && <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ffffff', display: 'inline-block' }} />}
              Pending
            </button>
            <button
              className={`requests__filter-tab ${filter === 'all' ? 'requests__filter-tab--active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={fetchRequests} className="requests__refresh-btn">
            <MdRefresh style={{ marginRight: '0.25rem' }} /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading your requests…
          </p>
        </Card>
      ) : visibleRequests.length === 0 ? (
        <Card>
          <div className="requests__empty">
            <MdCheckCircle className="requests__empty-icon" />
            <p>No {filter === 'active' ? 'active' : ''} requests found.</p>
            <p className="requests__empty-sub">
              When you request to view, print, or download a document, it will appear here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="requests__list">
          {visibleRequests.map((req) => {
            const remaining = getTimeRemaining(req);
            const isExpired = req.status === 'approved' && remaining <= 0;
            const isActive = req.status === 'approved' && remaining > 0;
            const actionLabel = ACTION_LABELS[req.action] || req.action;
            const actionIcon = req.action === 'view_document' ? '👁️'
              : req.action === 'print_document' ? '🖨️' : '⬇️';

            return (
              <Card key={req.id} className={`requests__card requests__card--${isExpired ? 'expired' : req.status}`}>
                <div className="requests__card-header">
                  <div className="requests__card-title">
                    <span className="requests__action-icon">{actionIcon}</span>
                    <span className="requests__action-label">{actionLabel}</span>
                  </div>
                  <div className="requests__card-meta">
                    <Badge
                      variant={
                        isExpired ? 'danger'
                          : req.status === 'approved' ? 'success'
                          : req.status === 'rejected' ? 'danger'
                          : 'warning'
                      }
                      size="sm"
                    >
                      {isExpired ? 'EXPIRED' : req.status.toUpperCase()}
                    </Badge>
                    <span className="requests__timestamp">
                      {new Date(req.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="requests__card-body">
                  {/* File info */}
                  <div className="requests__info-row">
                    <span className="requests__info-label">File:</span>
                    <span className="requests__info-value requests__info-value--filename">
                      {req.payload?.fileName || req.entityName || '—'}
                    </span>
                  </div>
                  {req.payload?.category && (
                    <div className="requests__info-row">
                      <span className="requests__info-label">Category:</span>
                      <span className="requests__info-value">{req.payload.category}</span>
                    </div>
                  )}
                  {req.payload?.employeeName && (
                    <div className="requests__info-row">
                      <span className="requests__info-label">Employee:</span>
                      <span className="requests__info-value">{req.payload.employeeName}</span>
                    </div>
                  )}
                  {req.payload?.purpose && (
                    <div className="requests__info-row">
                      <span className="requests__info-label">Purpose:</span>
                      <span className="requests__info-value">{req.payload.purpose}</span>
                    </div>
                  )}

                  {/* Countdown or rejection reason */}
                  {isActive && (
                    <div className="requests__countdown-row">
                      <MdAccessTime className="requests__countdown-icon" />
                      <span className="requests__countdown-label">Access expires in:</span>
                      <span className="requests__countdown-value">
                        {formatCountdown(remaining)}
                      </span>
                    </div>
                  )}
                  {isExpired && (
                    <div className="requests__expired-row">
                      <MdAccessTime className="requests__expired-icon" />
                      <span>Access window has expired. Submit a new request to regain access.</span>
                    </div>
                  )}
                  {req.status === 'rejected' && req.rejectedReason && (
                    <div className="requests__rejected-row">
                      <MdCancel className="requests__rejected-icon" />
                      <span><strong>Reason:</strong> {req.rejectedReason}</span>
                    </div>
                  )}
                  {req.status === 'approved' && req.approvedByName && (
                    <div className="requests__info-row">
                      <span className="requests__info-label">Approved by:</span>
                      <span className="requests__info-value">{req.approvedByName}</span>
                    </div>
                  )}
                </div>

                {/* Action buttons — only for active approved requests */}
                {isActive && (
                  <div className="requests__card-actions">
                    {req.action === 'view_document' && (
                      <>
                        <Button variant="primary" size="sm" onClick={() => handleView(req)}>
                          <MdVisibility style={{ marginRight: '0.25rem' }} /> View File
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openSecondaryRequest(req, 'print_document')}
                        >
                          <MdPrint style={{ marginRight: '0.25rem' }} /> Request Print
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openSecondaryRequest(req, 'download_document')}
                        >
                          <MdDownload style={{ marginRight: '0.25rem' }} /> Request Download
                        </Button>
                      </>
                    )}
                    {req.action === 'print_document' && (
                      <Button variant="secondary" size="sm" onClick={() => handlePrint(req)}>
                        <MdPrint style={{ marginRight: '0.25rem' }} /> Print Now
                      </Button>
                    )}
                    {req.action === 'download_document' && (
                      <Button variant="primary" size="sm" onClick={() => handleDownload(req)}>
                        <MdDownload style={{ marginRight: '0.25rem' }} /> Download Now
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Inline PDF Viewer Modal ────────────────────────────────────────── */}
      <Modal
        isOpen={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          setZoom(100);
          setRotation(0);
        }}
        title={viewerTitle}
        size="xl"
        allowMinimize={true}
        allowFullscreen={true}
        noPadding
      >
        <div className="requests__viewer">
          <div className="requests__viewer-toolbar">
            <div className="requests__viewer-btn-group">
              <button
                type="button"
                className="requests__viewer-tool-btn"
                onClick={handleZoomOut}
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <MdZoomOut size={16} />
              </button>
              <span className="requests__viewer-zoom-val">{zoom}%</span>
              <button
                type="button"
                className="requests__viewer-tool-btn"
                onClick={handleZoomIn}
                title="Zoom In"
                aria-label="Zoom In"
              >
                <MdZoomIn size={16} />
              </button>
            </div>

            <div className="requests__viewer-btn-group">
              <button
                type="button"
                className="requests__viewer-tool-btn"
                onClick={handleRotate}
                title="Rotate 90° Clockwise"
                aria-label="Rotate 90°"
              >
                <MdRotateRight size={16} /> Rotate
              </button>
              <button
                type="button"
                className="requests__viewer-tool-btn"
                onClick={handleResetZoom}
                title="Reset View"
                aria-label="Reset View"
              >
                <MdRestartAlt size={16} /> Reset
              </button>
            </div>
          </div>
          <div className="requests__viewer-doc-container">
            <iframe
              key={`${zoom}-${rotation}`}
              src={viewerSrc}
              className="requests__viewer-iframe"
              title={viewerTitle}
              style={{
                transform: `rotate(${rotation}deg) scale(${zoom / 100})`,
                transformOrigin: 'center center',
                transition: 'transform 0.2s ease-out',
              }}
            />
          </div>
        </div>
      </Modal>

      {/* ── Secondary approval request modal ──────────────────────────────── */}
      <Modal
        isOpen={secondaryAction !== null}
        onClose={() => setSecondaryAction(null)}
        title="Request Admin Approval"
        size="sm"
      >
        <div className="requests__secondary-body">
          <div className="requests__secondary-icon">🔒</div>
          <p className="requests__secondary-text">
            {secondaryAction?.action === 'print_document'
              ? 'Printing requires admin approval.'
              : 'Downloading requires admin approval.'}
          </p>
          <p className="requests__secondary-filename">
            <strong>File:</strong>{' '}
            {secondaryAction?.req?.payload?.fileName || secondaryAction?.req?.entityName}
          </p>
          <div className="requests__secondary-purpose">
            <label className="requests__secondary-purpose-label">
              Purpose <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <textarea
              className="requests__secondary-purpose-input"
              placeholder="Briefly explain why you need to print/download this file…"
              value={secondaryPurpose}
              onChange={(e) => {
                setSecondaryPurpose(e.target.value);
                if (e.target.value.trim()) setSecondaryPurposeError('');
              }}
              rows={3}
            />
            {secondaryPurposeError && (
              <span className="requests__secondary-purpose-error">
                ⚠️ {secondaryPurposeError}
              </span>
            )}
          </div>
        </div>
        <div className="requests__secondary-footer">
          <Button
            variant="ghost"
            onClick={() => setSecondaryAction(null)}
            disabled={isSubmittingSecondary}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmitSecondary}
            disabled={isSubmittingSecondary}
          >
            {isSubmittingSecondary ? 'Submitting…' : 'Submit Request'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default Requests;
