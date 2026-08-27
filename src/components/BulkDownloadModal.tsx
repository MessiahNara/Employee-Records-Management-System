import { useState, useMemo, useCallback, useEffect, useDeferredValue, memo } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import SearchableDropdown from './ui/SearchableDropdown';
import { Employee } from '../types/employee';
import './BulkDownloadModal.css';

interface BulkDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  onDownload: (employeeIds: string[], type: 'barcode' | 'qrcode') => void;
  isLoading?: boolean;
}

// Memoized individual employee row for 60fps performance
interface EmployeeRowProps {
  employee: Employee;
  isSelected: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
}

const EmployeeRow = memo(function EmployeeRow({
  employee,
  isSelected,
  disabled,
  onToggle,
}: EmployeeRowProps) {
  const officeName = employee.officeHospitalName || (employee as any).officeName;
  const status = employee.status || 'Active';
  const isActive = status.toLowerCase() === 'active';

  return (
    <label className={`bulk-download__item ${isSelected ? 'bulk-download__item--selected' : ''}`}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggle(employee.id)}
        disabled={disabled}
      />
      <div className="bulk-download__item-info">
        <div className="bulk-download__item-row">
          <span className="bulk-download__item-name">
            {employee.firstName} {employee.middleName || ''} {employee.lastName}
          </span>
          <span className="bulk-download__item-id">
            {employee.id}
          </span>
        </div>
        <div className="bulk-download__item-meta">
          {officeName && (
            <span className="bulk-download__item-office">
              {officeName}
            </span>
          )}
          <span className={`bulk-download__item-status ${isActive ? 'bulk-download__item-status--active' : 'bulk-download__item-status--inactive'}`}>
            {status}
          </span>
        </div>
      </div>
    </label>
  );
});

function BulkDownloadModal({
  isOpen,
  onClose,
  employees,
  onDownload,
  isLoading = false,
}: BulkDownloadModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadType, setDownloadType] = useState<'barcode' | 'qrcode'>('qrcode');
  const [selectedOffice, setSelectedOffice] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dateError, setDateError] = useState('');
  const [displayCount, setDisplayCount] = useState(80);

  // Reset displayCount when search, office, status, or date filter changes
  useEffect(() => {
    setDisplayCount(80);
  }, [deferredSearch, selectedOffice, selectedStatus, fromDate, toDate]);

  // Extract unique offices and hospitals (memoized)
  const uniqueOffices = useMemo(() => {
    if (!isOpen) return [];
    const offices = new Set<string>();
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      const office = (emp.officeHospitalName || (emp as any).officeName || emp.yellowBox?.office || '').trim();
      if (office) {
        offices.add(office);
      }
    }
    return Array.from(offices).sort((a, b) => a.localeCompare(b));
  }, [employees, isOpen]);

  // Filter employees based on search, office/hospital, status, and date range
  const filteredEmployees = useMemo(() => {
    if (!isOpen) return [];
    let filtered = employees;

    // Apply search filter (using deferred search for lag-free typing)
    if (deferredSearch.trim()) {
      const query = deferredSearch.toLowerCase().trim();
      filtered = filtered.filter((emp) => {
        const fullName = `${emp.firstName} ${emp.middleName || ''} ${emp.lastName}`.toLowerCase();
        const empStatus = (emp.status || 'Active').toLowerCase();
        return (
          fullName.includes(query) ||
          emp.id.toLowerCase().includes(query) ||
          empStatus === query ||
          (query === 'active' && empStatus === 'active') ||
          (query === 'inactive' && empStatus === 'inactive')
        );
      });
    }

    // Apply office / hospital filter
    if (selectedOffice) {
      const targetOffice = selectedOffice.toLowerCase();
      filtered = filtered.filter((emp) => {
        const empOffice = (emp.officeHospitalName || (emp as any).officeName || emp.yellowBox?.office || '').trim().toLowerCase();
        return empOffice === targetOffice;
      });
    }

    // Apply status filter (Active / Inactive)
    if (selectedStatus) {
      const targetStatus = selectedStatus.toLowerCase();
      filtered = filtered.filter((emp) => {
        const empStatus = (emp.status || 'Active').trim().toLowerCase();
        return empStatus === targetStatus;
      });
    }

    // Apply date range filter
    if (fromDate || toDate) {
      const fromTime = fromDate ? new Date(fromDate).getTime() : null;
      const toTime = toDate ? new Date(toDate).getTime() : null;

      filtered = filtered.filter((emp) => {
        const empTime = new Date(emp.createdAt).getTime();
        if (fromTime !== null && empTime < fromTime) return false;
        if (toTime !== null && empTime > toTime) return false;
        return true;
      });
    }

    return filtered;
  }, [employees, deferredSearch, selectedOffice, selectedStatus, fromDate, toDate, isOpen]);

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

  // Auto-select filtered employees only when office, status, or date filters change (not on search typing)
  useEffect(() => {
    if (selectedOffice || selectedStatus || fromDate || toDate) {
      setSelectedIds(new Set(filteredEmployees.map((emp) => emp.id)));
    }
  }, [selectedOffice, selectedStatus, fromDate, toDate]);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredEmployees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEmployees.map((emp) => emp.id)));
    }
  }, [filteredEmployees, selectedIds.size]);

  // Handle individual selection
  const handleToggleEmployee = useCallback((employeeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  }, []);

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
    setSelectedOffice('');
    setSelectedStatus('');
    setFromDate('');
    setToDate('');
    setDateError('');
    setDisplayCount(80);
    onClose();
  }, [onClose]);

  // Infinite scroll load more on list scroll
  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 80) {
      if (displayCount < filteredEmployees.length) {
        setDisplayCount((prev) => Math.min(prev + 80, filteredEmployees.length));
      }
    }
  };

  const visibleEmployees = useMemo(() => {
    return filteredEmployees.slice(0, displayCount);
  }, [filteredEmployees, displayCount]);

  const isAllSelected = filteredEmployees.length > 0 && selectedIds.size === filteredEmployees.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < filteredEmployees.length;

  if (!isOpen) return null;

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

        {/* Search Bar & Filters Grid */}
        <div className="bulk-download__filters-grid">
          <div className="bulk-download__search">
            <label className="bulk-download__section-label">Search Employee:</label>
            <Input
              id="bulk-download-search"
              type="text"
              placeholder="Search by name, ID, or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="bulk-download__office-filter">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="bulk-download__section-label">Filter by Office / Hospital:</label>
              {selectedOffice && (
                <button
                  type="button"
                  className="bulk-download__clear-link"
                  onClick={() => setSelectedOffice('')}
                  disabled={isLoading}
                >
                  Clear
                </button>
              )}
            </div>
            <SearchableDropdown
              options={uniqueOffices}
              value={selectedOffice}
              onChange={(val) => setSelectedOffice(val)}
              placeholder="All Offices / Hospitals"
              disabled={isLoading}
            />
          </div>

          <div className="bulk-download__status-filter">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="bulk-download__section-label">Filter by Status:</label>
              {selectedStatus && (
                <button
                  type="button"
                  className="bulk-download__clear-link"
                  onClick={() => setSelectedStatus('')}
                  disabled={isLoading}
                >
                  Clear
                </button>
              )}
            </div>
            <select
              id="bulk-download-status-select"
              className="bulk-download__select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              disabled={isLoading}
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
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
          {(fromDate || toDate || selectedOffice || selectedStatus) && !dateError && (
            <div className="bulk-download__date-info">
              ℹ️ {selectedIds.size} employee(s) auto-selected based on current filters
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
        <div className="bulk-download__list" onScroll={handleListScroll}>
          {filteredEmployees.length === 0 ? (
            <div className="bulk-download__empty">
              {searchQuery || selectedOffice || selectedStatus || fromDate || toDate ? 'No employees found matching your filters.' : 'No employees available.'}
            </div>
          ) : (
            <>
              {visibleEmployees.map((employee) => (
                <EmployeeRow
                  key={employee.id}
                  employee={employee}
                  isSelected={selectedIds.has(employee.id)}
                  disabled={isLoading}
                  onToggle={handleToggleEmployee}
                />
              ))}
              {displayCount < filteredEmployees.length && (
                <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  Showing {displayCount} of {filteredEmployees.length} employees (scroll down to load more)
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default BulkDownloadModal;
