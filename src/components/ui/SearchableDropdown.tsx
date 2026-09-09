import React, { useState, useEffect, useRef, useMemo } from 'react';
import { cleanOfficeDropdownOptions, DEFAULT_PROVINCIAL_OFFICES, getOfficeFullName } from '../../data/provincialOffices';
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

  // Automatically sanitize options so abbreviations or combined "Abbr - Full Name" strings are never shown as options
  const sanitizedOptions = useMemo(() => {
    const isOfficeList = options.some((opt) => {
      if (!opt) return false;
      const clean = opt.trim();
      return (
        clean.includes(' - ') ||
        clean.includes('(') ||
        clean.includes('[') ||
        DEFAULT_PROVINCIAL_OFFICES.some(
          (o) =>
            o.fullName.toLowerCase() === clean.toLowerCase() ||
            (o.abbreviation && o.abbreviation.toLowerCase() === clean.toLowerCase()) ||
            (o.aliases && o.aliases.some((a) => a.toLowerCase() === clean.toLowerCase()))
        ) ||
        getOfficeFullName(clean) !== clean
      );
    });
    if (isOfficeList) {
      return cleanOfficeDropdownOptions(options);
    }
    return options;
  }, [options]);

  const displayVal = useMemo(() => {
    if (!value || value === 'All') return '';
    return getOfficeFullName(value);
  }, [value]);

  const [searchTerm, setSearchTerm] = useState(displayVal);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchTermRef = useRef(displayVal);

  // Sync with value prop changes
  useEffect(() => {
    setSearchTerm(displayVal);
    searchTermRef.current = displayVal;
  }, [displayVal]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
        if (!searchTermRef.current.trim()) {
          onChange('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [onChange]);

  // Memoize filtered options based on search term (supports typing abbreviation to find full name)
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return sanitizedOptions;
    const lower = searchTerm.toLowerCase();
    return sanitizedOptions.filter((option) => {
      const full = getOfficeFullName(option);
      if (full.toLowerCase().includes(lower)) return true;
      const matched = DEFAULT_PROVINCIAL_OFFICES.find(
        (o) => o.fullName.toLowerCase() === full.toLowerCase()
      );
      if (matched) {
        if (matched.abbreviation && matched.abbreviation.toLowerCase().includes(lower)) return true;
        if (matched.aliases && matched.aliases.some((a) => a.toLowerCase().includes(lower))) return true;
      }
      return false;
    });
  }, [sanitizedOptions, searchTerm]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    searchTermRef.current = val;
    onChange(val);
    setIsOpen(true);
    setHighlightedIndex(0); // Reset highlight to first filtered item
  };

  // Handle option select
  const selectOption = (opt: string) => {
    const clean = getOfficeFullName(opt);
    setSearchTerm(clean);
    searchTermRef.current = clean;
    onChange(clean);
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
          onBlur={(e) => {
            if (!containerRef.current?.contains(e.relatedTarget as Node)) {
              setIsOpen(false);
              setHighlightedIndex(-1);
              if (!searchTermRef.current.trim()) {
                onChange('');
              }
            }
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
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(option);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  {getOfficeFullName(option)}
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
