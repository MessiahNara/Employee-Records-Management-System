import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface BarcodeScannerOptions {
  onScan?: (barcode: string) => void;
  minLength?: number;
  maxLength?: number;
  timeout?: number;
  enabled?: boolean;
}

/**
 * Hook to detect barcode scanner input
 * Barcode scanners type very fast and end with Enter
 * This hook detects that pattern and triggers navigation
 */
export function useBarcodeScanner(options: BarcodeScannerOptions = {}) {
  const {
    onScan,
    minLength = 5,
    maxLength = 50,
    timeout = 100, // Time between keystrokes (ms)
    enabled = true,
  } = options;

  const navigate = useNavigate();
  const barcodeBuffer = useRef<string>('');
  const lastKeystrokeTime = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyPress = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input field, textarea, or contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Also check if any parent element is a modal or has contenteditable
      let parent = target.parentElement;
      while (parent) {
        if (parent.classList.contains('modal') || parent.isContentEditable) {
          return;
        }
        parent = parent.parentElement;
      }

      const currentTime = Date.now();
      const timeSinceLastKey = currentTime - lastKeystrokeTime.current;

      // If too much time has passed, reset the buffer
      if (timeSinceLastKey > timeout) {
        barcodeBuffer.current = '';
      }

      lastKeystrokeTime.current = currentTime;

      // Handle Enter key (scanner sends this at the end)
      if (event.key === 'Enter') {
        const barcode = barcodeBuffer.current.trim();
        
        // Validate barcode length
        if (barcode.length >= minLength && barcode.length <= maxLength) {
          console.log('Barcode scanned:', barcode);
          
          // Call custom handler if provided
          if (onScan) {
            onScan(barcode);
          } else {
            // Default behavior: navigate to employee details
            navigate(`/employees/${barcode}`);
          }
        }
        
        // Reset buffer
        barcodeBuffer.current = '';
        event.preventDefault();
        return;
      }

      // Ignore special keys
      if (
        event.key.length > 1 && 
        event.key !== 'Enter' &&
        event.key !== 'Backspace'
      ) {
        return;
      }

      // Handle Backspace
      if (event.key === 'Backspace') {
        barcodeBuffer.current = barcodeBuffer.current.slice(0, -1);
        return;
      }

      // Add character to buffer
      barcodeBuffer.current += event.key;

      // Clear buffer after timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        barcodeBuffer.current = '';
      }, timeout * 10); // Clear after 1 second of inactivity
    };

    // Add event listener
    window.addEventListener('keypress', handleKeyPress);

    // Cleanup
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, minLength, maxLength, timeout, onScan, navigate]);

  return {
    // Expose method to manually trigger scan
    simulateScan: (barcode: string) => {
      if (onScan) {
        onScan(barcode);
      } else {
        navigate(`/employees/${barcode}`);
      }
    },
  };
}
