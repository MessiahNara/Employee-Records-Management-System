import Modal from './ui/Modal';
import Button from './ui/Button';
import { MdCheckCircle, MdCancel } from 'react-icons/md';

interface RequestDetailsModalProps {
  isOpen: boolean;
  target: any;
  onClose: () => void;
  formatRequestedInfo: (req: any) => string;
  ACTION_LABELS: Record<string, string>;
  onApproveClick?: () => void;
  onRejectClick?: () => void;
}

function RequestDetailsModal({ isOpen, target, onClose, formatRequestedInfo, ACTION_LABELS, onApproveClick, onRejectClick }: RequestDetailsModalProps) {
  if (!target) return null;

  const infoText = formatRequestedInfo(target);
  // Split on ' | ' to show each detail on a new line if it's a list of changes
  const infoLines = infoText.split(' | ');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Details"
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
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
                  {new Date(target.createdAt).toLocaleString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </div>
              </div>

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
                      {new Date(target.updatedAt).toLocaleString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
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
  );
}

export default RequestDetailsModal;
