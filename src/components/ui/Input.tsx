import { InputHTMLAttributes, forwardRef, useMemo, useState, useEffect, useRef } from 'react';
import './Input.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  debounceMs?: number;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, fullWidth = false, className = '', id, value, onChange, debounceMs = 0, ...props }, ref) => {
    // Generate a stable ID that doesn't change on re-renders
    const inputId = useMemo(() => {
      return id || `input-${Math.random().toString(36).substr(2, 9)}`;
    }, [id]);
    
    const [localValue, setLocalValue] = useState(value ?? '');
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
      if (value !== undefined) {
        setLocalValue(value);
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      const name = e.target.name;
      
      if (value !== undefined) {
        setLocalValue(newValue);
      }
      
      if (onChange) {
        if (debounceMs > 0) {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            onChange({ target: { name, value: newValue } } as any);
          }, debounceMs);
        } else {
          onChange(e);
        }
      }
    };

    const classes = [
      'input-wrapper',
      fullWidth && 'input-wrapper--full-width',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={classes}>
        {label && (
          <label htmlFor={inputId} className="input__label">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`input ${error ? 'input--error' : ''}`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          value={value !== undefined ? localValue : undefined}
          onChange={handleChange}
          {...props}
        />
        {error && (
          <span id={`${inputId}-error`} className="input__error" role="alert">
            {error}
          </span>
        )}
        {helperText && !error && (
          <span id={`${inputId}-helper`} className="input__helper">
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
