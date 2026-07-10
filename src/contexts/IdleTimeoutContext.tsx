import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';

interface IdleTimeoutContextType {
  idleTimeout: number | null;
  isLoggedIn: boolean;
  setIsLoggedIn: (value: boolean) => void;
  refreshIdleTimeout: () => Promise<void>;
}

const IdleTimeoutContext = createContext<IdleTimeoutContextType | undefined>(undefined);

export const useIdleTimeout = () => {
  const context = useContext(IdleTimeoutContext);
  if (!context) {
    throw new Error('useIdleTimeout must be used within IdleTimeoutProvider');
  }
  return context;
};

interface IdleTimeoutProviderProps {
  children: React.ReactNode;
}

export const IdleTimeoutProvider: React.FC<IdleTimeoutProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [idleTimeout, setIdleTimeout] = useState<number | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    // Initialize based on auth state
    const user = localStorage.getItem('authUser') || sessionStorage.getItem('authUser');
    return !!user;
  });
  
  const logoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isOnLoginPage = location.pathname === '/login';

  // Auto-detect login state changes
  useEffect(() => {
    const checkAuthState = () => {
      const user = localStorage.getItem('authUser') || sessionStorage.getItem('authUser');
      const loggedIn = !!user;
      
      if (loggedIn !== isLoggedIn) {
        setIsLoggedIn(loggedIn);
      }
    };

    // Check immediately
    checkAuthState();

    // Check periodically (every second)
    const interval = setInterval(checkAuthState, 1000);

    return () => clearInterval(interval);
  }, [isLoggedIn]);

  // Fetch global idle timeout from backend
  const fetchIdleTimeout = useCallback(async (): Promise<void> => {
    try {
      const settings = await api.systemSettings.get();
      setIdleTimeout(settings.idleTimeout);
    } catch (error) {
      console.error('Failed to fetch idle timeout:', error);
    }
  }, []);

  // Logout function
  const logout = useCallback(() => {
    // Clear all timers
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    
    // Clear auth state
    localStorage.removeItem('authUser');
    sessionStorage.removeItem('authUser');
    setIsLoggedIn(false);
    
    // Redirect to login
    navigate('/login');
  }, [navigate]);

  // Start idle timer
  const startIdleTimer = useCallback(() => {
    // Clear existing timer
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }

    // Only start timer if:
    // 1. User is logged in
    // 2. Not on login page
    // 3. Idle timeout is enabled (not null)
    if (!isLoggedIn || isOnLoginPage || !idleTimeout) {
      return;
    }

    const timeoutMs = idleTimeout * 60 * 1000; // Convert minutes to milliseconds
    
    // Set logout timer
    logoutTimerRef.current = setTimeout(() => {
      logout();
    }, timeoutMs);
  }, [idleTimeout, isLoggedIn, isOnLoginPage, logout]);

  // Reset idle timer on user activity
  const resetIdleTimer = useCallback(() => {
    if (!isLoggedIn || isOnLoginPage || !idleTimeout) {
      return;
    }
    
    startIdleTimer();
  }, [isLoggedIn, isOnLoginPage, idleTimeout, startIdleTimer]);

  // Fetch idle timeout on mount and when user logs in
  useEffect(() => {
    if (isLoggedIn) {
      fetchIdleTimeout();
    }
  }, [isLoggedIn, fetchIdleTimeout]);

  // Start/restart timer when idle timeout changes or user logs in
  useEffect(() => {
    if (isLoggedIn && !isOnLoginPage && idleTimeout) {
      startIdleTimer();
    }

    return () => {
      // Cleanup on unmount
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
    };
  }, [idleTimeout, isLoggedIn, isOnLoginPage, startIdleTimer]);

  // Clear timers when on login page
  useEffect(() => {
    if (isOnLoginPage) {
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
    }
  }, [isOnLoginPage]);

  // Activity event listeners
  useEffect(() => {
    if (!isLoggedIn || isOnLoginPage || !idleTimeout) {
      return;
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      window.addEventListener(event, resetIdleTimer);
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, resetIdleTimer);
      });
    };
  }, [isLoggedIn, isOnLoginPage, idleTimeout, resetIdleTimer]);

  const value: IdleTimeoutContextType = {
    idleTimeout,
    isLoggedIn,
    setIsLoggedIn,
    refreshIdleTimeout: fetchIdleTimeout,
  };

  return (
    <IdleTimeoutContext.Provider value={value}>
      {children}
    </IdleTimeoutContext.Provider>
  );
};
