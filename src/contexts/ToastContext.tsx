import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import Toast, { ToastType } from '../components/ui/Toast';

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  icon?: string;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number, icon?: string) => void;
  showWelcomeToast: (firstName: string, lastName: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((
    message: string,
    type: ToastType = 'success',
    duration: number = 10000, // Changed to 10 seconds
    icon?: string
  ) => {
    const id = Date.now().toString();
    const newToast: ToastMessage = { id, message, type, duration, icon };
    
    // Only show one toast at a time (replace existing)
    setToast(newToast);
  }, []);

  const showWelcomeToast = useCallback((firstName: string, lastName: string) => {
    const message = `Welcome back, ${firstName} ${lastName}!`;
    showToast(message, 'success', 10000, '👋');
  }, [showToast]);

  const removeToast = useCallback(() => {
    setToast(null);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, showWelcomeToast }}>
      {children}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          icon={toast.icon}
          onClose={removeToast}
        />
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
