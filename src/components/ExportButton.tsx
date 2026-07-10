import { useState, useRef, useEffect, useCallback } from 'react';
import Button from './ui/Button';
import EmployeeSelectionModal from './EmployeeSelectionModal';
import { Employee } from '../types/employee';
import { ExportFormat } from '../types/importExport';
import { exportEmployeesToFile } from '../utils/exportUtils';
import './ExportButton.css';

interface ExportButtonProps {
  employees: Employee[];
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

function ExportButton({ employees, variant = 'secondary', size = 'md' }: ExportButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (showDropdown && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [showDropdown]);

  const handleFormatSelect = (format: ExportFormat) => {
    setSelectedFormat(format);
    setShowDropdown(false);
    setShowSelectionModal(true);
  };

  const handleCloseModal = useCallback(() => {
    setShowSelectionModal(false);
  }, []);

  const handleConfirmExport = async (selectedEmployeeIds: string[], fromDate?: string, toDate?: string) => {
    if (!selectedFormat) return;

    setIsExporting(true);
    setShowSelectionModal(false);

    try {
      // Filter employees by selected IDs
      const selectedEmployees = employees.filter((emp) =>
        selectedEmployeeIds.includes(emp.id)
      );

      // Build filename with date range if provided
      let filename = `employee-records-${new Date().toISOString().split('T')[0]}`;
      if (fromDate && toDate) {
        filename = `employee-records_${fromDate}_to_${toDate}`;
      } else if (fromDate) {
        filename = `employee-records_from_${fromDate}`;
      } else if (toDate) {
        filename = `employee-records_until_${toDate}`;
      }

      exportEmployeesToFile(selectedEmployees, {
        format: selectedFormat,
        filename,
        includeInactive: true,
      });

      // Small delay to show loading state
      await new Promise((resolve) => setTimeout(resolve, 300));
      setIsExporting(false);
    } catch (error) {
      console.error('Export failed:', error);
      setIsExporting(false);
      alert('Failed to export file. Please try again.');
    }
  };

  return (
    <>
      <div className="export-button" ref={dropdownRef}>
        <Button
          ref={buttonRef}
          variant={variant}
          size={size}
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={isExporting || employees.length === 0}
        >
          {isExporting ? '⏳ Exporting...' : '📥 Export'}
        </Button>

        {showDropdown && (
          <div 
            className="export-button__dropdown"
            style={{
              top: `${dropdownPosition.top}px`,
              right: `${dropdownPosition.right}px`,
            }}
          >
            <button
              className="export-button__option"
              onClick={() => handleFormatSelect('xlsx')}
              disabled={isExporting}
            >
              <span className="export-button__option-icon">📊</span>
              <div className="export-button__option-content">
                <div className="export-button__option-title">Export to Excel</div>
                <div className="export-button__option-description">Download as .xlsx file</div>
              </div>
            </button>
            <button
              className="export-button__option"
              onClick={() => handleFormatSelect('csv')}
              disabled={isExporting}
            >
              <span className="export-button__option-icon">📄</span>
              <div className="export-button__option-content">
                <div className="export-button__option-title">Export to CSV</div>
                <div className="export-button__option-description">Download as .csv file</div>
              </div>
            </button>
          </div>
        )}
      </div>

      <EmployeeSelectionModal
        isOpen={showSelectionModal}
        onClose={handleCloseModal}
        onConfirm={handleConfirmExport}
        employees={employees}
        title="Select Employees to Export"
        confirmButtonText="Export"
        showDateFilter={true}
      />
    </>
  );
}

export default ExportButton;
