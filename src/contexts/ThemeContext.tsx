'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface ThemeContextType {
  isDarkMode: boolean;
  setIsDarkMode: (isDark: boolean) => void;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkModeState] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Initialize dark mode from localStorage only - default to light mode
  useEffect(() => {
    // Set mounted immediately to prevent hydration mismatch
    setMounted(true);
    
    const savedTheme = localStorage.getItem('dtps-staff-theme');
    
    // Only use dark mode if explicitly saved as 'dark', otherwise default to light
    const prefersDark = savedTheme === 'dark';

    setIsDarkModeState(prefersDark);
    applyTheme(prefersDark);
  }, []);

  const applyTheme = (isDark: boolean) => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.backgroundColor = '#0a0a0a';
      document.body.style.backgroundColor = '#0a0a0a';
      document.body.style.color = '#ffffff';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.backgroundColor = '#ffffff';
      document.body.style.backgroundColor = '#ffffff';
      document.body.style.color = '#000000';
    }
  };

  const setIsDarkMode = (isDark: boolean) => {
    setIsDarkModeState(isDark);
    localStorage.setItem('dtps-staff-theme', isDark ? 'dark' : 'light');
    applyTheme(isDark);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Always return provider to ensure useTheme() works
  // Before mounting, isDarkMode is false (light mode as default)
  return (
    <ThemeContext.Provider value={{ isDarkMode, setIsDarkMode, toggleDarkMode }}>
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
