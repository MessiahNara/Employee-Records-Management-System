import { useState, useMemo, useEffect } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import { Employee } from '../types/employee';
import './EmployeeSelectionModal.css';

interface EmployeeSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedEmployeeIds: string[], fromDate?: string, toDate?: string) => void;
  employees: Employee[];
  title: string;
  confirmButtonText?: string;
  showDateFilter?: boolean;
}

function EmployeeSelectionModal({
  isOpen,
  onClose,
  onConfirm,
  employees,
  title,
  confirmButtonText = 'Confirm',
  showDateFilter = false,
}: EmployeeSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dateError, setDateError] = useState('');

  // Reset selection when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedIds(new Set());
      setFromDate('');
      setToDate('');
      setDateError('');
    }
  }, [isOpen]);

  // Filter employees based on search query
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;

    const query = searchQuery.toLowerCase();
    return employees.filter((emp) => {
      const fullName = `${emp.firstName} ${emp.middleName} ${emp.lastName}`.toLowerCase();
      return (
        emp.firstName.toLowerCase().includes(query) ||
        emp.middleName?.toLowerCase().includes(query) ||
        emp.lastName.toLowerCase().includes(query) ||
        fullName.includes(query)
      );
    });
  }, [employees, searchQuery]);

  // Handle select all
  const handleSelectAll = () => {
    if (selectedIds.size === filteredEmployees.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all filtered employees
      setSelectedIds(new Set(filteredEmployees.map((emp) => emp.id)));
    }
  };

  // Handle individual selection
  const handleToggleEmployee = (employeeId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId);
    } else {
      newSelected.add(employeeId);
    }
    setSelectedIds(newSelected);
  };

  // Handle confirm
  const handleConfirm = () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one employee');
      return;
    }

    // Validate date range if dates are provided
    if (showDateFilter && (fromDate || toDate)) {
      if (fromDate && toDate) {
        const from = new Date(fromDate);
        const to = new Date(toDate);
        
        if (from > to) {
          setDateError('Start date must be before or equal to end date');
          return;
        }
      }
      
      // Pass the datetime strings directly (they're already in ISO format from datetime-local)
      onConfirm(Array.from(selectedIds), fromDate || undefined, toDate || undefined);
    } else {
      onConfirm(Array.from(selectedIds));
    }
  };

  // Handle date changes with validation
  const handleFromDateChange = (value: string) => {
    setFromDate(value);
    if (toDate && value && new Date(value) > new Date(toDate)) {
      setDateError('"From" date cannot be after "To" date');
    } else {
      setDateError('');
    }
  };

  const handleToDateChange = (value: string) => {
    setToDate(value);
    if (fromDate && value && new Date(value) < new Date(fromDate)) {
      setDateError('"To" date cannot be before "From" date');
    } else {
      setDateError('');
    }
  };

  // Auto-select employees when date range is set
  useMemo(() => {
    if (fromDate || toDate) {
      const fromDateTime = fromDate ? new Date(fromDate) : null;
      const toDateTime = toDate ? new Date(toDate) : null;

      const employeesInRange = filteredEmployees.filter((emp) => {
        const empCreatedAt = new Date(emp.createdAt);
        
        if (fromDateTime && toDateTime) {
          return empCreatedAt >= fromDateTime && empCreatedAt <= toDateTime;
        } else if (fromDateTime) {
          return empCreatedAt >= fromDateTime;
        } else if (toDateTime) {
          return empCreatedAt <= toDateTime;
        }
        return false;
      });

      const autoSelectedIds = new Set(employeesInRange.map((emp) => emp.id));
      setSelectedIds(autoSelectedIds);
    }
  }, [fromDate, toDate, filteredEmployees]);

  const allSelected = filteredEmployees.length > 0 && selectedIds.size === filteredEmployees.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredEmployees.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} size="md">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            size="md"
          >
            {confirmButtonText} ({selectedIds.size})
          </Button>
        </>
      }
    >
      <div className="employee-selection-modal">
        {/* Search Bar */}
        <div className="employee-selection-modal__search">
          <Input
            id="employee-selection-search"
            type="text"
            placeholder="Search by first, middle, or last name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Date Range Filter */}
        {showDateFilter && (
          <div className="employee-selection-modal__date-filter">
            <label className="employee-selection-modal__section-label">
              Filter by Date Added (Optional):
            </label>
            <div className="employee-selection-modal__date-inputs">
              <div className="employee-selection-modal__date-field">
                <label>From Date & Time</label>
                <Input
                  id="employee-selection-from-date"
                  type="datetime-local"
                  value={fromDate}
                  onChange={(e) => handleFromDateChange(e.target.value)}
                  placeholder="Start date and time"
                />
              </div>
              <div className="employee-selection-modal__date-field">
                <label>To Date & Time</label>
                <Input
                  id="employee-selection-to-date"
                  type="datetime-local"
                  value={toDate}
                  onChange={(e) => handleToDateChange(e.target.value)}
                  placeholder="End date and time"
                />
              </div>
            </div>
            {dateError && (
              <div className="employee-selection-modal__date-error">
                {dateError}
              </div>
            )}
            {(fromDate || toDate) && !dateError && (
              <div className="employee-selection-modal__date-info">
                ℹ️ {selectedIds.size} employee(s) auto-selected based on date range
              </div>
            )}
          </div>
        )}

        {/* Select All */}
        <div className="employee-selection-modal__select-all">
          <label className="employee-selection-modal__checkbox">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(input) => {
                if (input) {
                  input.indeterminate = someSelected;
                }
              }}
              onChange={handleSelectAll}
            />
            <span>
              Select All {filteredEmployees.length > 0 && `(${filteredEmployees.length})`}
            </span>
          </label>
          {selectedIds.size > 0 && (
            <span className="employee-selection-modal__selected-count">
              {selectedIds.size} selected
            </span>
          )}
        </div>

        {/* Employee List */}
        <div className="employee-selection-modal__list">
          {filteredEmployees.length === 0 ? (
            <div className="employee-selection-modal__empty">
              {searchQuery || fromDate || toDate ? 'No employees found matching your filters.' : 'No employees available.'}
            </div>
          ) : (
            filteredEmployees.map((employee) => (
              <label key={employee.id} className="employee-selection-modal__item">
                <input
                  type="checkbox"
                  checked={selectedIds.has(employee.id)}
                  onChange={() => handleToggleEmployee(employee.id)}
                />
                <div className="employee-selection-modal__item-info">
                  <span className="employee-selection-modal__item-name">
                    {employee.lastName}, {employee.firstName} {employee.middleName}
                  </span>
                  <span className="employee-selection-modal__item-id">
                    {employee.id}
                  </span>
                </div>
              </label>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

export default EmployeeSelectionModal;
