import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import './styles/global.css';

if (typeof window !== 'undefined') {
  try {
    const u = localStorage.getItem('authUser');
    if (u === 'undefined' || u === 'null') {
      localStorage.removeItem('authUser');
    }
  } catch (_) {}
  if (typeof (window as any).electron !== 'undefined') {
    localStorage.removeItem('serverUrl');
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
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
