import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import './styles/global.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('RootErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          fontFamily: 'sans-serif',
          backgroundColor: '#f9fafb',
          color: '#111827'
        }}>
          <h2 style={{ color: '#ef4444', marginBottom: '8px' }}>Application Render Error</h2>
          <p style={{ color: '#4b5563', maxWidth: '600px', textAlign: 'center', marginBottom: '16px' }}>
            {this.state.error?.message || 'An unexpected error occurred while rendering the page.'}
          </p>
          <pre style={{
            backgroundColor: '#1f2937',
            color: '#f3f4f6',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '12px',
            maxWidth: '800px',
            overflow: 'auto',
            marginBottom: '16px',
            textAlign: 'left'
          }}>
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Clear any stale server URL from localStorage so Electron IPC always
// provides the correct (HTTPS) URL rather than an old cached http:// value.
if (typeof window !== 'undefined' && typeof (window as any).electron !== 'undefined') {
  localStorage.removeItem('serverUrl');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);

// Remove the splash screen after React has rendered
const removeSplash = () => {
  const splash = document.getElementById('app-splash');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => {
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, 300);
  }
};

removeSplash();
setTimeout(removeSplash, 100);
