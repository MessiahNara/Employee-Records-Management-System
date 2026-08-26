import { useState } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import SplitDocumentViewer, { DiffField } from './documents/SplitDocumentViewer';
import { MdCheckCircle, MdCancel, MdCompareArrows, MdPictureAsPdf } from 'react-icons/md';

interface RequestDetailsModalProps {
  isOpen: boolean;
  target: any;
  onClose: () => void;
  formatRequestedInfo: (req: any) => string;
  ACTION_LABELS: Record<string, string>;
  onApproveClick?: () => void;
  onRejectClick?: () => void;
}

function RequestDetailsModal({
  isOpen,
  target,
  onClose,
  formatRequestedInfo,
  ACTION_LABELS,
  onApproveClick,
  onRejectClick,
}: RequestDetailsModalProps) {
  const [showSplitViewer, setShowSplitViewer] = useState(false);

  if (!target) return null;

  const infoText = formatRequestedInfo(target);
  const infoLines = infoText.split(' | ');

  // Extract structured diffs if available in payload
  const diffs: DiffField[] = [];
  if (target.payload && (target.action === 'update_employee' || target.action === 'update_user')) {
    const changes = target.payload.changes || target.payload;
    if (typeof changes === 'object') {
      Object.keys(changes).forEach((key) => {
        if (key !== 'changes' && key !== 'purpose' && key !== 'id' && key !== 'userId') {
          const val = changes[key];
          if (typeof val === 'object' && val !== null && 'old' in val && 'new' in val) {
            diffs.push({
              label: key.replace(/([A-Z])/g, ' $1').trim(),
              oldValue: val.old,
              newValue: val.new,
            });
          }
        }
      });
    }
  }

  // Check if target has an attached or associated PDF
  const hasDocument = Boolean(
    target.payload?.pdfUrl ||
    target.payload?.pdfData ||
    target.payload?.filePath ||
    target.action?.includes('document') ||
    target.entityType === 'document'
  );

  const documentPdfSrc = target.payload?.pdfData || target.payload?.pdfUrl || (target.payload?.filePath ? `/api/documents/file/${encodeURIComponent(target.payload.filePath)}` : null);

  return (
    <>
      <Modal
        isOpen={isOpen && !showSplitViewer}
        onClose={onClose}
        title="Request Details & Review"
        size={target.status !== 'pending' ? 'lg' : 'md'}
      >
        <div style={{ padding: '0.5rem 0' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.5rem',
            position: 'relative'
          }}>
            {/* Left Card: Request Info */}
            <div style={{
              flex: '1 1 280px',
              backgroundColor: 'rgba(59, 130, 246, 0.04)',
              border: '1px solid rgba(59, 130, 246, 0.15)',
              borderRadius: 'var(--border-radius-lg)',
              padding: '1.5rem',
              position: 'relative',
              zIndex: 1
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    color: '#3b82f6',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '1.1rem'
                  }}>
                    📄
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Request Information</h4>
                </div>

                {hasDocument && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSplitViewer(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.75rem',
                      color: 'var(--color-primary)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                    }}
                  >
                    <MdPictureAsPdf /> Split View
                  </Button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{ACTION_LABELS[target.action] || target.action}</div>
                </div>
                
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Requested By</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{target.requestedByName || 'Unknown'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time Requested</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                    {target.createdAt ? new Date(target.createdAt).toLocaleString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : 'Unknown Date'}
                  </div>
                </div>

                {/* Diffs view if structured */}
                {diffs.length > 0 ? (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
                      Changes Requested
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {diffs.map((d, idx) => (
                        <div key={idx} style={{
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          padding: '0.5rem 0.75rem',
                          fontSize: '0.8rem'
                        }}>
                          <strong style={{ display: 'block', textTransform: 'capitalize', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                            {d.label}
                          </strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                            <span style={{ textDecoration: 'line-through', color: 'var(--color-danger)', background: 'rgba(239,68,68,0.1)', padding: '1px 5px', borderRadius: '3px' }}>
                              {String(d.oldValue || '(empty)')}
                            </span>
                            <span>➔</span>
                            <span style={{ color: 'var(--color-success)', background: 'rgba(16,185,129,0.1)', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>
                              {String(d.newValue || '(empty)')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {target.action === 'update_employee' || target.action === 'update_user' ? 'Changes Requested' : 'Details'}
                    </div>
                    <div style={{ 
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      marginTop: '0.25rem',
                      fontSize: '0.875rem',
                      lineHeight: '1.4'
                    }}>
                      {infoLines.length > 1 ? (
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {infoLines.map((line, idx) => (
                            <li key={idx}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{infoText}</p>
                      )}
                    </div>
                  </div>
                )}

                {target.payload?.purpose && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Purpose</div>
                    <div style={{ 
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      marginTop: '0.25rem',
                      fontSize: '0.875rem',
                      lineHeight: '1.4',
                      fontStyle: 'italic'
                    }}>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{target.payload.purpose}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Card: Status Details (if not pending) */}
            {target.status !== 'pending' && (() => {
              const isApproved = target.status === 'approved';
              const colorRgb = isApproved ? '34, 197, 94' : '239, 68, 68'; // Green for approved, Red for rejected
              const icon = isApproved ? '✅' : '❌';

              return (
                <div style={{
                  flex: '1 1 280px',
                  backgroundColor: `rgba(${colorRgb}, 0.04)`,
                  border: `1px solid rgba(${colorRgb}, 0.15)`,
                  borderRadius: 'var(--border-radius-lg)',
                  padding: '1.5rem',
                  position: 'relative',
                  zIndex: 1
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <div style={{
                      backgroundColor: `rgba(${colorRgb}, 0.15)`,
                      color: `rgb(${colorRgb})`,
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '1.1rem'
                    }}>
                      {icon}
                    </div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Approval Status</h4>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</div>
                      <div style={{ fontWeight: 700, color: `rgb(${colorRgb})`, marginTop: '0.25rem', textTransform: 'uppercase' }}>
                        {target.status}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {isApproved ? 'Approved By' : 'Rejected By'}
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                        {target.approvedByName || 'Unknown'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                        {target.resolvedAt || target.createdAt ? new Date(target.resolvedAt || target.createdAt).toLocaleString('en-US', {
                          month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        }) : 'Unknown Date'}
                      </div>
                    </div>
                    {target.rejectedReason && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reason for Rejection</div>
                        <div style={{ fontWeight: 600, color: 'var(--color-danger)', marginTop: '0.25rem', lineHeight: '1.4' }}>
                          {target.rejectedReason}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {target.status === 'pending' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <Button variant="success" onClick={onApproveClick}>
                <MdCheckCircle /> Approve
              </Button>
              <Button variant="danger" onClick={onRejectClick}>
                <MdCancel /> Reject
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Side-by-side Split Viewer Modal if user triggers it */}
      {showSplitViewer && (
        <SplitDocumentViewer
          isOpen={showSplitViewer}
          onClose={() => setShowSplitViewer(false)}
          title={`Review Request: ${ACTION_LABELS[target.action] || target.action}`}
          pdfUrl={documentPdfSrc}
          diffs={diffs}
          documentMetadata={{
            fileName: target.payload?.fileName || target.entityName || 'Attached Document',
            category: target.payload?.category || 'Request Attachment',
            uploadedBy: target.requestedByName,
            createdAt: target.createdAt,
          }}
          employeeData={{
            name: target.payload?.employeeName || target.entityName,
            id: target.payload?.employeeId || target.entityId,
            office: target.payload?.officeHospitalName || target.payload?.officeName,
            position: target.payload?.positionFunction || target.payload?.position,
          }}
          actions={
            target.status === 'pending' ? (
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Button variant="danger" onClick={() => { setShowSplitViewer(false); onRejectClick?.(); }}>
                  <MdCancel /> Reject
                </Button>
                <Button variant="success" onClick={() => { setShowSplitViewer(false); onApproveClick?.(); }}>
                  <MdCheckCircle /> Approve Request
                </Button>
              </div>
            ) : undefined
          }
        />
      )}
    </>
  );
}

export default RequestDetailsModal;

