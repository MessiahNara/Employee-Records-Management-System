import { useState, useEffect } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { MdLock, MdWarning } from 'react-icons/md';
import api from '../../services/api';
import './PasswordConfirmModal.css';

interface PasswordConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (authorizingUser: any) => Promise<void>;
  title?: string;
  message?: string;
  currentUserId?: string;
}

function PasswordConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Deletion',
  message = 'This action requires authorization from another administrator.',
  currentUserId,
}: PasswordConfirmModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setUsername('');
      setPassword('');
      setError('');
      setIsVerifying(false);
      setShowPassword(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      // Verify password with backend
      const result = await api.user.verifyPassword(username, password, currentUserId || '');
      
      if (!result.valid) {
        setError('Invalid credentials');
        return;
      }

      // Check if trying to authorize own account (for Super Admin updates)
      if (currentUserId && result.user.id === currentUserId) {
        setError('You cannot authorize changes to your own account. Another Super Admin must authorize this.');
        return;
      }

      // Pass the authorizing user to the parent
      await onConfirm({
        ...result.user,
        approvalToken: result.approvalToken,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="password-confirm-modal">
        <div className="password-confirm-modal__message">
          <MdLock className="password-confirm-modal__icon" style={{ fontSize: '2rem', color: 'var(--color-primary)' }} />
          <p>{message}</p>
          <p className="password-confirm-modal__note">
            Note: Only Super Admin credentials can be used for authorization.
          </p>
        </div>

        <div className="password-confirm-modal__field">
          <label htmlFor="username" className="password-confirm-modal__label">
            Super Admin Username
          </label>
          <Input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter Super Admin username"
            disabled={isVerifying}
            autoComplete="off"
          />
        </div>

        <div className="password-confirm-modal__password-field">
          <Input
            id="password"
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            disabled={isVerifying}
            autoComplete="off"
            fullWidth
          />
          <button
            type="button"
            className="password-confirm-modal__password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            disabled={isVerifying}
          >
            {showPassword ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>

        {error && (
          <div className="password-confirm-modal__error">
            <MdWarning style={{ marginRight: '0.25rem' }} /> {error}
          </div>
        )}

        <div className="password-confirm-modal__actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isVerifying}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={isVerifying}
          >
            {isVerifying ? 'Verifying...' : 'Confirm'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default PasswordConfirmModal;
