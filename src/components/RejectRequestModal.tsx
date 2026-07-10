import { useState } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';

interface RejectRequestModalProps {
  isOpen: boolean;
  target: any | null;
  actionLabels: Record<string, string>;
  onClose: () => void;
  onReject: (reason: string) => Promise<void>;
}

function RejectRequestModal({ isOpen, target, actionLabels, onClose, onReject }: RejectRequestModalProps) {
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  const handleReject = async () => {
    setRejectLoading(true);
    try {
      await onReject(rejectReason || 'Rejected by administrator');
      setRejectReason('');
      onClose();
    } catch (error) {
      console.error('Reject failed:', error);
    } finally {
      setRejectLoading(false);
    }
  };

  const handleClose = () => {
    setRejectReason('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Reject Request"
      size="sm"
      footer={
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={handleClose} disabled={rejectLoading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleReject} loading={rejectLoading}>
            Reject
          </Button>
        </div>
      }
    >
      {target && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Rejecting:{' '}
            <strong>{actionLabels[target.action] || target.action}</strong> for{' '}
            <strong>{target.entityName || target.entityId}</strong>
          </p>
          <div>
            <label
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                display: 'block',
                marginBottom: '0.35rem',
              }}
            >
              Reason (optional)
            </label>
            <textarea
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                fontSize: 'var(--font-size-sm)',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
              rows={3}
              placeholder="Enter reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

export default RejectRequestModal;
