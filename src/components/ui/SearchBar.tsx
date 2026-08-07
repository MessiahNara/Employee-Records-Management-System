import { InputHTMLAttributes, useEffect, useState, useRef } from 'react';
import './SearchBar.css';

interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  onClear?: () => void;
  fullWidth?: boolean;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  debounceMs?: number;
}

function SearchBar({ onClear, fullWidth = false, className = '', value, onChange, debounceMs = 300, ...props }: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      onChange({ target: { value: newValue } });
    }, debounceMs);
  };

  const handleClear = () => {
    setLocalValue('');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onChange({ target: { value: '' } });
    if (onClear) onClear();
  };

  const classes = [
    'search-bar',
    fullWidth && 'search-bar--full-width',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <span className="search-bar__icon" aria-hidden="true">
        🔍
      </span>
      <input
        type="search"
        className="search-bar__input"
        value={localValue}
        onChange={handleChange}
        {...props}
      />
      {localValue && (
        <button
          type="button"
          className="search-bar__clear"
          onClick={handleClear}
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default SearchBar;
