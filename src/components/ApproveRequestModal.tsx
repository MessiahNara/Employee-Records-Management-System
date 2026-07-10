import { useState, useRef, useEffect } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';

interface ApproveRequestModalProps {
  isOpen: boolean;
  target: any;
  onClose: () => void;
  onApprove: (username: string, password: string) => Promise<void>;
}

function ApproveRequestModal({ isOpen, target, onClose, onApprove }: ApproveRequestModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const usernameRef = useRef<HTMLInputElement>(null);

  // Reset and focus when modal opens
  useEffect(() => {
    if (isOpen) {
      setUsername('');
      setPassword('');
      setError('');
      setLoading(false);
      setTimeout(() => usernameRef.current?.focus(), 80);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setError('Username is required'); return; }
    if (!password.trim()) { setError('Password is required'); return; }
    setLoading(true);
    setError('');
    try {
      await onApprove(username, password);
    } catch (err: any) {
      setError(err.message || 'Approval failed');
      setLoading(false);
    }
  };

  const ACTION_LABELS: Record<string, string> = {
    update_employee: 'Update Employee',
    delete_employee: 'Delete Employee',
    bulk_delete_employee: 'Bulk Delete Employees',
    delete_document: 'Delete Document',
    bulk_delete_document: 'Bulk Delete Documents',
    sync_import: 'Sync Import',
    update_user: 'Update User',
    delete_user: 'Delete User',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Approve Request"
      size="sm"
      footer={
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="success" onClick={handleSubmit as any} loading={loading}>
            Approve &amp; Execute
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {target && (
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--border-radius)',
            padding: '0.75rem',
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}>
            <p style={{ margin: 0 }}><strong>Action:</strong> {ACTION_LABELS[target.action] || target.action}</p>
            <p style={{ margin: 0 }}><strong>Requested by:</strong> {target.requestedByName}</p>
            <p style={{ margin: 0 }}><strong>Target:</strong> {target.entityName || target.entityId}</p>
          </div>
        )}

        <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
          Enter your Super Admin credentials to authorize and execute this action.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="approve-modal-username" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
            Username
          </label>
          <input
            ref={usernameRef}
            id="approve-modal-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            autoComplete="off"
            style={{
              width: '100%', padding: '8px 12px', boxSizing: 'border-box',
              background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--border-radius)', color: 'var(--text-primary)',
              fontSize: 'var(--font-size-sm)', fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="approve-modal-password" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
            Password
          </label>
          <input
            id="approve-modal-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="off"
            style={{
              width: '100%', padding: '8px 12px', boxSizing: 'border-box',
              background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--border-radius)', color: 'var(--text-primary)',
              fontSize: 'var(--font-size-sm)', fontFamily: 'inherit',
            }}
          />
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--border-radius)',
            padding: '0.5rem 0.75rem', fontSize: 'var(--font-size-sm)',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Hidden submit button so Enter key works */}
        <button type="submit" style={{ display: 'none' }} />
      </form>
    </Modal>
  );
}

export default ApproveRequestModal;
