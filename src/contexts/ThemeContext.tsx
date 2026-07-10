import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Get theme from localStorage with proper error handling
function getStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      return saved as Theme;
    }
  } catch (error) {
    console.warn('Failed to read theme from localStorage:', error);
  }
  return 'light';
}

// Save theme to localStorage with proper error handling
function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem('theme', theme);
    localStorage.setItem('themeTimestamp', new Date().toISOString());
  } catch (error) {
    console.warn('Failed to save theme to localStorage:', error);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getStoredTheme());
  const [isInitialized, setIsInitialized] = useState(false);

  // Apply theme on component mount and whenever it changes
  useEffect(() => {
    // Apply theme to DOM
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    
    // Persist to localStorage
    saveTheme(theme);
    
    // Mark as initialized after first theme application
    if (!isInitialized) {
      setIsInitialized(true);
    }
  }, [theme, isInitialized]);

  // Ensure theme is restored on app reload
  useEffect(() => {
    const storedTheme = getStoredTheme();
    if (storedTheme !== theme) {
      setTheme(storedTheme);
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
