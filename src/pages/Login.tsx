import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { saveAuthState } from '../utils/mockAuth';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import './Login.css';

interface LoginFormData {
  username: string;
  password: string;
}

function Login() {
  const navigate = useNavigate();
  const { showWelcomeToast } = useToast();
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
        {/* Left Side - Branding */}
        <div className="login__brand">
          <div className="login__brand-content">
            <div className="login__brand-logo">
              <span className="login__brand-icon">🗂️</span>
              <span className="login__brand-text">HRMDO ERMS</span>
            </div>
            <h2 className="login__brand-title">Employee Records Management System</h2>
            <p className="login__brand-description">
              Streamline your workforce management with our comprehensive employee records platform.
              Track, manage, and analyze employee data with ease.
            </p>
            <div className="login__brand-features">
              <div className="login__feature">
                <span className="login__feature-icon">✓</span>
                <span>Secure Data Management</span>
              </div>
              <div className="login__feature">
                <span className="login__feature-icon">✓</span>
                <span>Real-time Audit Logs</span>
              </div>
              <div className="login__feature">
                <span className="login__feature-icon">✓</span>
                <span>Role-based Access Control</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="login__form-container">
          <div className="login__card">
            <div className="login__header">
              <h1 className="login__title">MABUHAY!</h1>
              <p className="login__subtitle">Employee Records Management System</p>
            </div>

            <form className="login__form" onSubmit={handleSubmit}>
              {loginError && (
                <div className="login__error-banner" role="alert">
                  <span className="login__error-icon">⚠️</span>
                  <span>{loginError}</span>
                </div>
              )}

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
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={isLoading}
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
