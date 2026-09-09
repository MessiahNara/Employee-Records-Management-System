import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MdBusiness, MdSearch, MdExpandMore, MdCheck, MdClose } from 'react-icons/md';
import { cleanOfficeDropdownOptions, DEFAULT_PROVINCIAL_OFFICES, getOfficeFullName } from '../data/provincialOffices';
import './OfficeSearchableSelect.css';

interface OfficeSearchableSelectProps {
  offices: string[];
  value: string;
  onChange: (office: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function OfficeSearchableSelect({
  offices,
  value,
  onChange,
  placeholder = 'All Offices',
  disabled = false,
}: OfficeSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Clean and sanitize offices into full names only (no abbreviations)
  const cleanOffices = useMemo(() => {
    return cleanOfficeDropdownOptions(offices);
  }, [offices]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  // Filter options based on search query (allows searching by full name or abbreviation)
  const filteredOffices = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return cleanOffices;
    return cleanOffices.filter((office) => {
      if (office.toLowerCase().includes(trimmed)) return true;
      const matched = DEFAULT_PROVINCIAL_OFFICES.find(
        (o) => o.fullName.toLowerCase() === office.toLowerCase()
      );
      if (matched && matched.abbreviation && matched.abbreviation.toLowerCase().includes(trimmed)) {
        return true;
      }
      return false;
    });
  }, [cleanOffices, searchQuery]);

  // Combined options including 'All' if search allows
  const showAllOption = useMemo(() => {
    if (!searchQuery.trim()) return true;
    return 'all offices'.includes(searchQuery.trim().toLowerCase());
  }, [searchQuery]);

  const handleSelect = (office: string) => {
    onChange(office);
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('All');
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = (showAllOption ? 1 : 0) + filteredOffices.length;
    if (totalItems === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0) {
        if (showAllOption) {
          if (highlightedIndex === 0) {
            handleSelect('All');
          } else {
            handleSelect(filteredOffices[highlightedIndex - 1]);
          }
        } else {
          handleSelect(filteredOffices[highlightedIndex]);
        }
      } else if (filteredOffices.length > 0) {
        handleSelect(filteredOffices[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const isSelectedAll = !value || value === 'All';

  return (
    <div ref={containerRef} className="office-select">
      {/* Trigger Button */}
      <button
        type="button"
        className={`office-select__trigger ${isOpen ? 'office-select__trigger--open' : ''} ${
          !isSelectedAll ? 'office-select__trigger--selected' : ''
        }`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="office-select__trigger-content">
          <MdBusiness className="office-select__icon" />
          <span className="office-select__label" title={isSelectedAll ? placeholder : getOfficeFullName(value)}>
            {isSelectedAll ? placeholder : getOfficeFullName(value)}
          </span>
        </span>

        <span className="office-select__trigger-actions">
          {!isSelectedAll && !disabled && (
            <span
              role="button"
              className="office-select__clear-btn"
              onClick={handleClear}
              title="Reset to All Offices"
            >
              <MdClose />
            </span>
          )}
          <MdExpandMore className={`office-select__chevron ${isOpen ? 'office-select__chevron--open' : ''}`} />
        </span>
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div className="office-select__dropdown" onKeyDown={handleKeyDown}>
          {/* Search Input Bar */}
          <div className="office-select__search-box">
            <MdSearch className="office-select__search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="office-select__search-input"
              placeholder={`Search ${offices.length} offices & hospitals...`}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(0);
              }}
            />
            {searchQuery && (
              <button
                type="button"
                className="office-select__search-clear"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
              >
                <MdClose />
              </button>
            )}
          </div>

          {/* Results Count Header */}
          <div className="office-select__results-header">
            <span>
              {searchQuery.trim() ? (
                <>
                  Found <strong>{filteredOffices.length}</strong> matching
                </>
              ) : (
                <>
                  All <strong>{offices.length}</strong> Offices & Hospitals
                </>
              )}
            </span>
            {!isSelectedAll && (
              <button
                type="button"
                className="office-select__reset-link"
                onClick={() => handleSelect('All')}
              >
                Clear Filter
              </button>
            )}
          </div>

          {/* Options List */}
          <ul ref={listRef} className="office-select__list" role="listbox">
            {/* 'All Offices' option */}
            {showAllOption && (
              <li
                role="option"
                aria-selected={isSelectedAll}
                className={`office-select__item office-select__item--all ${
                  isSelectedAll ? 'office-select__item--active' : ''
                } ${highlightedIndex === 0 ? 'office-select__item--highlighted' : ''}`}
                onClick={() => handleSelect('All')}
                onMouseEnter={() => setHighlightedIndex(0)}
              >
                <span className="office-select__item-name">All Offices & Hospitals</span>
                {isSelectedAll && <MdCheck className="office-select__check-icon" />}
              </li>
            )}

            {/* Filtered offices */}
            {filteredOffices.map((office, idx) => {
              const itemIndex = showAllOption ? idx + 1 : idx;
              const fullOfficeName = getOfficeFullName(office);
              const isSelected = value === fullOfficeName || value === office;
              return (
                <li
                  key={`${fullOfficeName}-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`office-select__item ${
                    isSelected ? 'office-select__item--active' : ''
                  } ${highlightedIndex === itemIndex ? 'office-select__item--highlighted' : ''}`}
                  onClick={() => handleSelect(fullOfficeName)}
                  onMouseEnter={() => setHighlightedIndex(itemIndex)}
                  title={fullOfficeName}
                >
                  <span className="office-select__item-name">{fullOfficeName}</span>
                  {isSelected && <MdCheck className="office-select__check-icon" />}
                </li>
              );
            })}

            {/* No match state */}
            {filteredOffices.length === 0 && !showAllOption && (
              <li className="office-select__empty-state">
                No offices found matching "<strong>{searchQuery}</strong>"
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
