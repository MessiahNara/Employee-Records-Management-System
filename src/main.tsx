import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import './styles/global.css';

// Clear any stale server URL from localStorage so Electron IPC always
// provides the correct (HTTPS) URL rather than an old cached http:// value.
if (typeof window !== 'undefined' && typeof (window as any).electron !== 'undefined') {
  localStorage.removeItem('serverUrl');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

// Remove the splash screen after React has rendered
const splash = document.getElementById('app-splash');
if (splash) {
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), 300);
}
