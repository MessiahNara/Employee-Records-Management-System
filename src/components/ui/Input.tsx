import { InputHTMLAttributes, forwardRef } from 'react';
import './Input.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, fullWidth = false, className = '', id, value, onChange, ...props }, ref) => {
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
          <label htmlFor={id} className="input__label">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={`input ${error ? 'input--error' : ''}`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error && id ? `${id}-error` : helperText && id ? `${id}-helper` : undefined}
          value={value}
          onChange={onChange}
          {...props}
        />
        {error && (
          <span id={id ? `${id}-error` : undefined} className="input__error" role="alert">
            {error}
          </span>
        )}
        {helperText && !error && (
          <span id={id ? `${id}-helper` : undefined} className="input__helper">
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
