import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuthState, getAuthState } from '../../utils/mockAuth';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { MdQrCodeScanner, MdLogout } from 'react-icons/md';
import './Navbar.css';

interface NavbarProps {
  onToggleSidebar: () => void;
  onOpenScanner: () => void;
}

function Navbar({ onToggleSidebar, onOpenScanner }: NavbarProps) {
  const navigate = useNavigate();
  const [user, setUser] = useState(getAuthState());
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Listen for profile picture updates
  useEffect(() => {
    const handleProfileUpdate = () => {
      setUser(getAuthState());
    };

    // Listen for custom event
    window.addEventListener('profilePictureUpdated', handleProfileUpdate);

    return () => {
      window.removeEventListener('profilePictureUpdated', handleProfileUpdate);
    };
  }, []);

  // Format user name as "LastName, FirstName"
  const getUserDisplayName = () => {
    if (user?.lastName && user?.firstName) {
      return `${user.lastName}, ${user.firstName}`;
    }
    if (user?.name) {
      return user.name;
    }
    if (user?.username) {
      return user.username;
    }
    return 'Admin User';
  };

  // Compact label for narrow screens
  const getMobileUserDisplayName = () => {
    if (user?.firstName) {
      return user.firstName;
    }
    if (user?.name) {
      return user.name.split(' ')[0] || user.name;
    }
    if (user?.username) {
      return user.username;
    }
    return 'Admin';
  };

  // Get initials for avatar
  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
    }
    if (user?.name) {
      return user.name.charAt(0);
    }
    if (user?.username) {
      return user.username.charAt(0).toUpperCase();
    }
    return 'A';
  };

  const handleLogoutConfirm = () => {
    clearAuthState();
    setIsLogoutModalOpen(false);
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="navbar__left">
        <button 
          className="navbar__menu-btn" 
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
        <div className="navbar__user">
          <div className="navbar__user-avatar">
            {user?.profilePicture ? (
              <img 
                src={user.profilePicture} 
                alt="Profile" 
                className="navbar__user-avatar-image"
              />
            ) : (
              getUserInitials()
            )}
          </div>
          <span className="navbar__user-name navbar__user-name--full">{getUserDisplayName()}</span>
          <span className="navbar__user-name navbar__user-name--short">{getMobileUserDisplayName()}</span>
        </div>
      </div>
      
      <div className="navbar__right">
        <button
          className="navbar__scan-btn"
          onClick={onOpenScanner}
          aria-label="Open barcode and QR scanner"
        >
          <MdQrCodeScanner className="navbar__scan-icon" />
          <span className="navbar__scan-text">Scan</span>
        </button>

        <button
          className="navbar__logout-btn"
          onClick={() => setIsLogoutModalOpen(true)}
          aria-label="Logout"
        >
          <MdLogout className="navbar__logout-icon" />
          <span className="navbar__logout-text">Logout</span>
        </button>
      </div>

      <Modal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        title="Confirm Logout"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsLogoutModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleLogoutConfirm}>
              Logout
            </Button>
          </>
        }
      >
        <div style={{ padding: '1rem 0', textAlign: 'center' }}>
          <p style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Are you sure you want to logout?
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            You will need to login again to access the system.
          </p>
        </div>
      </Modal>
    </header>
  );
}

export default Navbar;
