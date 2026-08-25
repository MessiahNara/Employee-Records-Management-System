import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { saveAuthState } from '../utils/mockAuth';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import api, { setServerBaseUrl, getApiBaseUrl } from '../services/api';
import Modal from '../components/ui/Modal';
import {
  MdFolderSpecial,
  MdShield,
  MdHistory,
  MdAdminPanelSettings,
  MdVisibility,
  MdVisibilityOff,
  MdWarning,
  MdLogin,
  MdLightMode,
  MdDarkMode,
  MdSettings
} from 'react-icons/md';
import './Login.css';

const CLIENT_VERSION = 'v1.5.0';

interface LoginFormData {
  username: string;
  password: string;
}

function Login() {
  const navigate = useNavigate();
  const { showWelcomeToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginFormData, string>>>({});
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isServerConfigOpen, setIsServerConfigOpen] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [serverVersion, setServerVersion] = useState<string>('v1.5.0');
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const checkServerHealth = () => {
    setServerStatus('checking');
    api.healthCheck()
      .then((res) => {
        setServerVersion(res.version ? `v${res.version.replace(/^v/, '')}` : 'v1.5.0');
        setServerStatus('online');
      })
      .catch(() => {
        setServerStatus('offline');
      });
  };

  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(checkServerHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // Pre-fill server URL input with current base URL or default
  const handleOpenServerConfig = () => {
    setServerUrlInput(getApiBaseUrl ? getApiBaseUrl() : 'https://127.0.0.1:5000');
    setIsServerConfigOpen(true);
  };

  const handleSaveServerConfig = async () => {
    let urlToSave = serverUrlInput.trim();
    if (!urlToSave) return;
    
    // Auto-add https:// if missing
    if (!urlToSave.startsWith('http://') && !urlToSave.startsWith('https://')) {
      urlToSave = 'https://' + urlToSave;
    }
    
    const success = await setServerBaseUrl(urlToSave);
    if (success) {
      showWelcomeToast('Server', 'Configured Successfully');
      setIsServerConfigOpen(false);
      checkServerHealth();
    } else {
      setLoginError('Failed to save server URL. Make sure you are using the Electron client.');
      setIsServerConfigOpen(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof LoginFormData, string>> = {};

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    }

    if (!formData.password.trim()) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const userData = await api.user.login(formData.username, formData.password);

      const user = {
        id: userData.id,
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        name: `${userData.lastName}, ${userData.firstName}`,
        email: `${userData.username}@example.com`,
        role: userData.role,
        permissions: userData.permissions,
        profilePicture: userData.profilePicture,
        activeSessionId: userData.activeSessionId,
      };

      localStorage.removeItem('authUser');
      saveAuthState(user, false);
      sessionStorage.setItem('justLoggedIn', 'true');
      navigate('/');

      setTimeout(() => {
        showWelcomeToast(userData.firstName, userData.lastName);
      }, 100);
    } catch (error: any) {
      console.error('Login error:', error);
      const errorMessage = typeof error?.message === 'string' ? error.message : 'An unexpected error occurred.';

      if (errorMessage.includes('failed to fetch') || errorMessage.includes('network')) {
        setLoginError('Unable to reach the server. Please make sure the backend is running.');
      } else if (errorMessage === 'Request failed' || errorMessage.includes('HTTP 50')) {
        setLoginError('Server error occurred during login. Please try again or contact support.');
      } else {
        setLoginError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: keyof LoginFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
    setLoginError('');
  };

  return (
    <div className="login">
      <div className="login__split">
        {/* Left Side - Modern Linear/Vercel-style Branding */}
        <div className="login__brand">
          <div className="login__brand-grid-overlay" />
          <div className="login__brand-content">
            <div className="login__brand-logo">
              <div className="login__brand-icon-wrapper">
                <MdFolderSpecial className="login__brand-logo-icon" />
              </div>
              <span className="login__brand-text">HRMDO ERMS</span>
            </div>

            <h2 className="login__brand-title">Employee Records Management System</h2>
            <p className="login__brand-description">
              Streamline workforce management, employee appraisals, and record retention lifecycles with enterprise-grade security.
            </p>

            <div className="login__brand-features">
              <div className="login__feature-card">
                <MdShield className="login__feature-icon login__feature-icon--cyan" />
                <div className="login__feature-text">
                  <strong>Secure Profile & Document Storage</strong>
                  <span>Encrypted records & compliance tracking</span>
                </div>
              </div>

              <div className="login__feature-card">
                <MdHistory className="login__feature-icon login__feature-icon--indigo" />
                <div className="login__feature-text">
                  <strong>Real-Time Audit Logs</strong>
                  <span>Complete lifecycle & disposition history</span>
                </div>
              </div>

              <div className="login__feature-card">
                <MdAdminPanelSettings className="login__feature-icon login__feature-icon--purple" />
                <div className="login__feature-text">
                  <strong>Role-Based Access Control</strong>
                  <span>Granular permissions for Admins & Officers</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Modern Login Form */}
        <div className="login__form-container">
          {/* Top Right Floating Actions */}
          <div className="login__top-actions">
            <button
              type="button"
              className="login__theme-toggle"
              onClick={handleOpenServerConfig}
              title="Configure Server Address"
              aria-label="Server Configuration"
            >
              <MdSettings className="login__theme-icon" style={{ color: 'var(--text-secondary)' }} />
              <span>Server</span>
            </button>

            <button
              type="button"
              className="login__theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <>
                  <MdLightMode className="login__theme-icon login__theme-icon--sun" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <MdDarkMode className="login__theme-icon login__theme-icon--moon" />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>

          <div className="login__card">
            <div className="login__header">
              <span className="login__mabuhay-pill">MABUHAY!</span>
              <h1 className="login__title">Sign In</h1>
              <p className="login__subtitle">Enter your credentials to access the Employee Records Management System</p>
            </div>

            <form className="login__form" onSubmit={handleSubmit}>
              {loginError && (
                <div className="login__error-banner" role="alert">
                  <MdWarning className="login__error-icon" />
                  <span>{loginError}</span>
                </div>
              )}

              <div className="login__input-group">
                <Input
                  label="Username"
                  type="text"
                  placeholder="Enter your username"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  error={errors.username}
                  fullWidth
                  autoComplete="username"
                />
              </div>

              <div className="login__password-field">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  error={errors.password}
                  fullWidth
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login__password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <MdVisibilityOff /> : <MdVisibility />}
                </button>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={isLoading}
                disabled={isLoading}
                style={{
                  height: '48px',
                  borderRadius: '10px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  marginTop: '0.5rem',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.22)'
                }}
              >
                {!isLoading && <MdLogin style={{ fontSize: '1.2rem' }} />}
                <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
              </Button>
            </form>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isServerConfigOpen}
        onClose={() => setIsServerConfigOpen(false)}
        title="Server Configuration"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="ghost" onClick={() => setIsServerConfigOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveServerConfig}>Save & Connect</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Enter the IP address or domain name of the Server PC to connect. (e.g. <code>https://192.168.1.100:5000</code>)
          </p>
          <Input
            label="Server URL"
            value={serverUrlInput}
            onChange={(e) => setServerUrlInput(e.target.value)}
            placeholder="https://192.168.x.x:5000"
            fullWidth
          />
        </div>
      </Modal>

      {/* Bottom-Right System Version Indicator */}
      <div
        className="login__version-badge"
        onClick={handleOpenServerConfig}
        title="Click to view/change Server Configuration"
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          padding: '0.4rem 0.85rem',
          background: 'var(--bg-secondary, rgba(255, 255, 255, 0.85))',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--border-color)',
          borderRadius: '9999px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          zIndex: 10,
          userSelect: 'none',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Client:</span> {CLIENT_VERSION}
        </span>
        <span style={{ color: 'var(--border-color)' }}>•</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Server:</span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            color: serverStatus === 'online' ? '#10b981' : serverStatus === 'offline' ? '#ef4444' : '#f59e0b',
            fontWeight: 600,
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: serverStatus === 'online' ? '#10b981' : serverStatus === 'offline' ? '#ef4444' : '#f59e0b',
              display: 'inline-block',
            }} />
            {serverVersion}
          </span>
        </span>
      </div>

    </div>
  );
}

export default Login;
