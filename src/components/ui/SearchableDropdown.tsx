import React, { useState, useEffect, useRef } from 'react';
import './SearchableDropdown.css';

interface SearchableDropdownProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export default function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  emptyMessage = 'No results found',
  className = '',
  id,
  disabled = false,
}: SearchableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value === 'All' ? '' : value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchTermRef = useRef(value === 'All' ? '' : value);

  // Sync with value prop changes
  useEffect(() => {
    const nextVal = value === 'All' ? '' : value;
    setSearchTerm(nextVal);
    searchTermRef.current = nextVal;
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Only reset to empty/All when the dropdown was actively open, not on every outside click
        if (!searchTermRef.current.trim()) {
          onChange('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onChange]);

  // Filter options based on search term
  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    searchTermRef.current = val;
    setIsOpen(true);
    setHighlightedIndex(0); // Reset highlight to first filtered item
  };

  // Handle option select
  const selectOption = (opt: string) => {
    setSearchTerm(opt);
    searchTermRef.current = opt;
    onChange(opt);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const listEl = listRef.current;
      const activeEl = listEl.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        const listHeight = listEl.clientHeight;
        const activeTop = activeEl.offsetTop;
        const activeHeight = activeEl.clientHeight;

        if (activeTop + activeHeight > listEl.scrollTop + listHeight) {
          listEl.scrollTop = activeTop + activeHeight - listHeight;
        } else if (activeTop < listEl.scrollTop) {
          listEl.scrollTop = activeTop;
        }
      }
    }
  }, [highlightedIndex, isOpen]);

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
        return;
      }
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(filteredOptions.length - 1);
        return;
      }
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    } else if (e.key === 'Enter') {
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        e.preventDefault();
        selectOption(filteredOptions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
      if (!searchTermRef.current.trim()) {
        onChange('');
      }
    }
  };

  const handleClear = (e: React.MouseEvent) => {
     e.stopPropagation();
     setSearchTerm('');
     searchTermRef.current = '';
     onChange('');
     setIsOpen(false);
     setHighlightedIndex(-1);
   };

  return (
    <div ref={containerRef} className={`searchable-dropdown ${className}`}>
      <div className="searchable-dropdown__input-wrapper">
        <input
          id={id}
          type="text"
          className="searchable-dropdown__input"
          placeholder={placeholder}
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={(e) => {
            if (!disabled) {
              setIsOpen(true);
              e.target.select();
            }
          }}
          onBlur={() => {
            setTimeout(() => {
              if (!searchTermRef.current.trim()) {
                onChange('');
              }
            }, 200);
          }}
          onClick={() => !disabled && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="one-time-code"
          disabled={disabled}
        />
        {searchTerm && !disabled && (
          <button
            type="button"
            className="searchable-dropdown__clear-btn"
            onClick={handleClear}
            aria-label="Clear selection"
          >
            &times;
          </button>
        )}
      </div>
      {isOpen && (
        <div className="searchable-dropdown__menu">
          {filteredOptions.length > 0 ? (
            <ul ref={listRef} className="searchable-dropdown__list">
              {filteredOptions.map((option, idx) => (
                <li
                  key={option}
                  className={`searchable-dropdown__item ${
                    idx === highlightedIndex ? 'searchable-dropdown__item--highlighted' : ''
                  }`}
                  onClick={() => selectOption(option)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  {option}
                </li>
              ))}
            </ul>
          ) : (
            <div className="searchable-dropdown__empty">{emptyMessage}</div>
          )}
        </div>
      )}
    </div>
  );
}
