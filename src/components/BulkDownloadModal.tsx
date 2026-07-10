import { useState, useMemo, useCallback } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import { Employee } from '../types/employee';
import './BulkDownloadModal.css';

interface BulkDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  onDownload: (employeeIds: string[], type: 'barcode' | 'qrcode') => void;
  isLoading?: boolean;
}

function BulkDownloadModal({
  isOpen,
  onClose,
  employees,
  onDownload,
  isLoading = false,
}: BulkDownloadModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadType, setDownloadType] = useState<'barcode' | 'qrcode'>('qrcode');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dateError, setDateError] = useState('');

  // Filter employees based on search and date range
  const filteredEmployees = useMemo(() => {
    let filtered = employees;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((emp) => {
        const fullName = `${emp.firstName} ${emp.middleName || ''} ${emp.lastName}`.toLowerCase();
        const employeeId = emp.id.toLowerCase();
        return fullName.includes(query) || employeeId.includes(query);
      });
    }

    // Apply date range filter with time component
    if (fromDate || toDate) {
      filtered = filtered.filter((emp) => {
        // Parse employee's createdAt as a Date object
        const empDate = new Date(emp.createdAt);
        
        if (fromDate) {
          // Parse the datetime-local input (format: "YYYY-MM-DDTHH:mm")
          const from = new Date(fromDate);
          // Employee must be created on or after the from datetime
          if (empDate < from) return false;
        }
        
        if (toDate) {
          // Parse the datetime-local input (format: "YYYY-MM-DDTHH:mm")
          const to = new Date(toDate);
          // Employee must be created on or before the to datetime
          if (empDate > to) return false;
        }
        
        return true;
      });
    }

    return filtered;
  }, [employees, searchQuery, fromDate, toDate]);

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
      const autoSelectedIds = new Set(filteredEmployees.map((emp) => emp.id));
      setSelectedIds(autoSelectedIds);
    }
  }, [fromDate, toDate, filteredEmployees]);

  // Handle select all
  const handleSelectAll = () => {
    if (selectedIds.size === filteredEmployees.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all filtered employees
      const allIds = new Set(filteredEmployees.map((emp) => emp.id));
      setSelectedIds(allIds);
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

  // Handle download
  const handleDownload = () => {
    if (selectedIds.size === 0) return;
    onDownload(Array.from(selectedIds), downloadType);
  };

  // Reset on close
  const handleClose = useCallback(() => {
    setSearchQuery('');
    setSelectedIds(new Set());
    setDownloadType('qrcode');
    setFromDate('');
    setToDate('');
    setDateError('');
    onClose();
  }, [onClose]);

  const isAllSelected = filteredEmployees.length > 0 && selectedIds.size === filteredEmployees.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < filteredEmployees.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Bulk Download Barcodes / QR Codes"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleDownload}
            disabled={selectedIds.size === 0 || isLoading}
          >
            {isLoading ? 'Generating...' : `Download ${selectedIds.size} ${downloadType === 'barcode' ? 'Barcode(s)' : 'QR Code(s)'}`}
          </Button>
        </>
      }
    >
      <div className="bulk-download">
        {/* Type Selection */}
        <div className="bulk-download__type-section">
          <label className="bulk-download__section-label">Select Type:</label>
          <div className="bulk-download__type-options">
            <label className="bulk-download__radio">
              <input
                type="radio"
                name="downloadType"
                value="qrcode"
                checked={downloadType === 'qrcode'}
                onChange={() => setDownloadType('qrcode')}
                disabled={isLoading}
              />
              <span>QR Code</span>
            </label>
            <label className="bulk-download__radio">
              <input
                type="radio"
                name="downloadType"
                value="barcode"
                checked={downloadType === 'barcode'}
                onChange={() => setDownloadType('barcode')}
                disabled={isLoading}
              />
              <span>Barcode</span>
            </label>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bulk-download__search">
          <Input
            id="bulk-download-search"
            type="text"
            placeholder="Search by name or employee ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLoading}
          />
        </div>

        {/* Date Range Filter */}
        <div className="bulk-download__date-filter">
          <label className="bulk-download__section-label">
            Filter by Date Added (Optional):
          </label>
          <div className="bulk-download__date-inputs">
            <div className="bulk-download__date-field">
              <label>From Date & Time</label>
              <Input
                id="bulk-download-from-date"
                type="datetime-local"
                value={fromDate}
                onChange={(e) => handleFromDateChange(e.target.value)}
                placeholder="Start date and time"
                disabled={isLoading}
              />
            </div>
            <div className="bulk-download__date-field">
              <label>To Date & Time</label>
              <Input
                id="bulk-download-to-date"
                type="datetime-local"
                value={toDate}
                onChange={(e) => handleToDateChange(e.target.value)}
                placeholder="End date and time"
                disabled={isLoading}
              />
            </div>
          </div>
          {dateError && (
            <div className="bulk-download__date-error">
              {dateError}
            </div>
          )}
          {(fromDate || toDate) && !dateError && (
            <div className="bulk-download__date-info">
              ℹ️ {selectedIds.size} employee(s) auto-selected based on date range
            </div>
          )}
        </div>

        {/* Select All */}
        <div className="bulk-download__select-all">
          <label className="bulk-download__checkbox">
            <input
              type="checkbox"
              checked={isAllSelected}
              ref={(input) => {
                if (input) {
                  input.indeterminate = isSomeSelected;
                }
              }}
              onChange={handleSelectAll}
              disabled={isLoading}
            />
            <span>
              Select All {filteredEmployees.length > 0 && `(${filteredEmployees.length})`}
            </span>
          </label>
          {selectedIds.size > 0 && (
            <span className="bulk-download__selected-count">
              {selectedIds.size} selected
            </span>
          )}
        </div>

        {/* Employee List */}
        <div className="bulk-download__list">
          {filteredEmployees.length === 0 ? (
            <div className="bulk-download__empty">
              {searchQuery || fromDate || toDate ? 'No employees found matching your filters.' : 'No employees available.'}
            </div>
          ) : (
            filteredEmployees.map((employee) => (
              <label key={employee.id} className="bulk-download__item">
                <input
                  type="checkbox"
                  checked={selectedIds.has(employee.id)}
                  onChange={() => handleToggleEmployee(employee.id)}
                  disabled={isLoading}
                />
                <div className="bulk-download__item-info">
                  <span className="bulk-download__item-name">
                    {employee.firstName} {employee.middleName || ''} {employee.lastName}
                  </span>
                  <span className="bulk-download__item-id">
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

export default BulkDownloadModal;
