import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { saveAuthState } from '../utils/mockAuth';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';
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
  MdDarkMode
} from 'react-icons/md';
import './Login.css';

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
      const errorMessage = typeof error?.message === 'string' ? error.message : '';

      if (errorMessage.includes('timeout') || errorMessage.includes('Unable to reach the server')) {
        setLoginError(errorMessage);
      } else if (errorMessage.includes('failed to fetch') || errorMessage.includes('network')) {
        setLoginError('Unable to reach the server. Please make sure the backend is running.');
      } else {
        setLoginError('Invalid username or password. Please try again.');
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
          {/* Top Right Floating Dark Mode Toggle Switch */}
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
    </div>
  );
}

export default Login;
