import { InputHTMLAttributes } from 'react';
import './SearchBar.css';

interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onClear?: () => void;
  fullWidth?: boolean;
}

function SearchBar({ onClear, fullWidth = false, className = '', value, ...props }: SearchBarProps) {
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
        value={value}
        {...props}
      />
      {value && onClear && (
        <button
          type="button"
          className="search-bar__clear"
          onClick={onClear}
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default SearchBar;
