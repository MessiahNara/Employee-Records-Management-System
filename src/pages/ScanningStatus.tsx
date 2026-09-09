import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import OfficeSearchableSelect from '../components/OfficeSearchableSelect';
import { cleanOfficeDropdownOptions, getOfficeFullName } from '../data/provincialOffices';
import PDFViewer from '../components/documents/PDFViewer';
import { EmployeeDocument } from '../types/document';
import { useToast } from '../contexts/ToastContext';
import api, { getApiBaseUrl, getServerBaseUrl } from '../services/api';
import { getSocket } from '../services/socket';
import {
  MdDocumentScanner,
  MdSearch,
  MdBusiness,
  MdFolderOpen,
  MdRefresh,
  MdPeople,
  MdDescription,
  MdArrowUpward,
  MdArrowDownward,
  MdInsertDriveFile,
  MdVisibility,
} from 'react-icons/md';
import './ScanningStatus.css';

interface ScannedDocument {
  id: string;
  category: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploadedBy?: string | null;
}

interface ScannedEmployee {
  id: string;
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  fullName?: string;
  officeName: string;
  position: string;
  status: string;
  appointmentStatus: string;
  profilePicture?: string | null;
  fileboxLocation?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    documents: number;
  };
  documents: ScannedDocument[];
}

export const getEmployeeDisplayName = (emp?: {
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  fullName?: string;
} | null): string => {
  if (!emp) return '';
  const last = (emp.lastName || '').trim();
  const first = (emp.firstName || '').trim();
  const middle = emp.middleName?.trim() ? ` ${emp.middleName.trim()[0]}.` : '';

  if (last && first) {
    return `${last}, ${first}${middle}`;
  }
  if (last) return `${last}${middle}`;
  if (first) return `${first}${middle}`;
  if (emp.fullName?.trim()) {
    return emp.fullName.trim();
  }
  return 'Unnamed Employee';
};

interface ScanningStats {
  employeesWithScannedFiles: number;
  totalDocumentsScanned: number;
  averageFilesPerEmployee: number;
  totalEmployeesInScope: number;
  activeEmployeesCount?: number;
  inactiveEmployeesCount?: number;
}

export default function ScanningStatus() {
  const { showToast } = useToast();

  // State
  const [employees, setEmployees] = useState<ScannedEmployee[]>([]);
  const [stats, setStats] = useState<ScanningStats>({
    employeesWithScannedFiles: 0,
    totalDocumentsScanned: 0,
    averageFilesPerEmployee: 0,
    totalEmployeesInScope: 0,
    activeEmployeesCount: 0,
    inactiveEmployeesCount: 0,
  });
  const [availableOffices, setAvailableOffices] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [officeFilter, setOfficeFilter] = useState('All');
  const [employeeStatus, setEmployeeStatus] = useState<'all' | 'Active' | 'Inactive'>('all');
  const [scanFilter, setScanFilter] = useState<'all' | 'with_docs' | 'without_docs'>('all');
  const [sortBy, setSortBy] = useState<'scannedCount' | 'name' | 'id' | 'office' | 'position'>('scannedCount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSortColumn = (column: 'scannedCount' | 'name' | 'id' | 'office' | 'position') => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder(column === 'scannedCount' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  // Pagination (Server-Side)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Selected Employee for Document Viewer Modal
  const [viewingEmployee, setViewingEmployee] = useState<ScannedEmployee | null>(null);

  // In-App PDF Viewer (Opens inside app without downloading)
  const [selectedDocForViewer, setSelectedDocForViewer] = useState<EmployeeDocument | null>(null);
  const [viewerEmployeeName, setViewerEmployeeName] = useState<string>('');
  const [viewerEmployeeId, setViewerEmployeeId] = useState<string>('');
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [isPdfViewerOpen, setIsPdfViewerOpen] = useState(false);

  // Fetch data
  const fetchData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await api.document.getScanningStatus({
        search: searchTerm.trim() || undefined,
        office: officeFilter !== 'All' ? officeFilter : undefined,
        employeeStatus: employeeStatus !== 'all' ? employeeStatus : undefined,
        scanFilter,
        page: currentPage,
        limit: itemsPerPage,
        sortBy,
        sortOrder,
      });

      if (res.success) {
        setEmployees(res.data || []);
        if (res.stats) setStats(res.stats);
        if (res.pagination) {
          setTotalCount(res.pagination.total);
          setTotalPages(res.pagination.totalPages);
        }
        if (res.offices) setAvailableOffices(cleanOfficeDropdownOptions(res.offices));
      }
    } catch (err: any) {
      console.error('Error loading scanning status:', err);
      showToast(err.message || 'Failed to load scanning status', 'error');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Fetch whenever filters, sort, or pagination change
  useEffect(() => {
    fetchData();
  }, [officeFilter, employeeStatus, scanFilter, sortBy, sortOrder, currentPage, itemsPerPage]);

  // Debounced search (resets to page 1)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        fetchData();
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Listen to socket events for real-time updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleUpdate = () => {
      fetchData(true);
    };

    socket.on('documentsUpdated', handleUpdate);
    socket.on('employeeUpdated', handleUpdate);

    return () => {
      socket.off('documentsUpdated', handleUpdate);
      socket.off('employeeUpdated', handleUpdate);
    };
  }, []);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  // Format date helper
  const formatDate = (dateStr?: string | null): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Open document inside interactive PDF Viewer modal (does not trigger download)
  const handleOpenPdfViewer = (
    doc: {
      id: string;
      fileName: string;
      category: string;
      createdAt?: string;
      uploadedBy?: string | null;
      fileSize?: number;
    },
    emp?: ScannedEmployee
  ) => {
    const empId = emp?.id || viewingEmployee?.id || '';
    const empName = emp
      ? getEmployeeDisplayName(emp)
      : viewingEmployee
      ? getEmployeeDisplayName(viewingEmployee)
      : '';

    const formattedDoc: EmployeeDocument = {
      id: doc.id,
      fileName: doc.fileName,
      category: doc.category as any,
      uploadedAt: doc.createdAt || new Date().toISOString(),
      uploadedBy: doc.uploadedBy || 'System',
      fileSize: Math.round((doc.fileSize || 0) / 1024),
    };

    setSelectedDocForViewer(formattedDoc);
    setViewerEmployeeId(empId);
    setViewerEmployeeName(empName);
    setPdfData(`${getServerBaseUrl()}/api/documents/${doc.id}/file`);
    setIsPdfViewerOpen(true);
  };

  return (
    <div className="scanning-status">
      {/* Header */}
      <div className="scanning-status__header">
        <div className="scanning-status__title-group">
          <div className="scanning-status__title-icon-wrapper">
            <MdDocumentScanner className="scanning-status__title-icon" />
          </div>
          <div>
            <h1 className="scanning-status__title">Employee Scanning Status</h1>
            <p className="scanning-status__subtitle">
              Monitor and track employees with digitized 201 file documents across all provincial departments and hospitals.
            </p>
          </div>
        </div>

        <div className="scanning-status__header-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchData()}
            disabled={isLoading}
            className="scanning-status__btn"
          >
            <MdRefresh className={`scanning-status__action-icon ${isLoading ? 'spinning' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Dynamic Filter-Based KPI Stats Cards (3 Cards) */}
      <div className="scanning-status__stats-grid">
        <Card className="scanning-status__stat-card">
          <div className="scanning-status__stat-icon scanning-status__stat-icon--blue">
            <MdPeople />
          </div>
          <div className="scanning-status__stat-content">
            <span className="scanning-status__stat-label">EMPLOYEES WITH SCANNED FILES</span>
            <div className="scanning-status__stat-value">{stats.employeesWithScannedFiles.toLocaleString()}</div>
            <span className="scanning-status__stat-sub">with documents in folder</span>
          </div>
        </Card>

        <Card className="scanning-status__stat-card">
          <div className="scanning-status__stat-icon scanning-status__stat-icon--green">
            <MdDocumentScanner />
          </div>
          <div className="scanning-status__stat-content">
            <span className="scanning-status__stat-label">TOTAL DOCUMENTS SCANNED</span>
            <div className="scanning-status__stat-value">{stats.totalDocumentsScanned.toLocaleString()}</div>
            <span className="scanning-status__stat-sub">scanned 201 files in system</span>
          </div>
        </Card>

        <Card className="scanning-status__stat-card">
          <div className="scanning-status__stat-icon scanning-status__stat-icon--purple">
            <MdDescription />
          </div>
          <div className="scanning-status__stat-content">
            <span className="scanning-status__stat-label">AVERAGE FILES PER EMPLOYEE</span>
            <div className="scanning-status__stat-value">{stats.averageFilesPerEmployee}</div>
            <span className="scanning-status__stat-sub">documents per folder</span>
          </div>
        </Card>
      </div>

      {/* Filters and Controls Card */}
      <Card className="scanning-status__filters-card">
        <div className="scanning-status__filters-row">
          {/* Search */}
          <div className="scanning-status__search-wrap">
            <MdSearch className="scanning-status__search-icon" />
            <input
              type="text"
              className="scanning-status__search-input"
              placeholder="Search by Employee ID, Name, Position..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="scanning-status__search-clear"
                onClick={() => setSearchTerm('')}
              >
                ×
              </button>
            )}
          </div>

          {/* Office Searchable Dropdown Filter */}
          <div className="scanning-status__filter-select-wrap">
            <label className="scanning-status__filter-label">
              <MdBusiness style={{ marginRight: 4 }} />
              Office:
            </label>
            <OfficeSearchableSelect
              offices={availableOffices}
              value={officeFilter}
              onChange={(newOffice) => {
                setOfficeFilter(newOffice);
                setCurrentPage(1);
              }}
              placeholder="All Offices"
            />
          </div>

          {/* Active / Inactive Filter */}
          <div className="scanning-status__filter-select-wrap">
            <label className="scanning-status__filter-label">Status:</label>
            <select
              className="scanning-status__select"
              value={employeeStatus}
              onChange={(e) => {
                setEmployeeStatus(e.target.value as any);
                setCurrentPage(1);
              }}
            >
              <option value="all">Active & Inactive</option>
              <option value="Active">
                Active {stats.activeEmployeesCount !== undefined ? `(${stats.activeEmployeesCount.toLocaleString()})` : ''}
              </option>
              <option value="Inactive">
                Inactive {stats.inactiveEmployeesCount !== undefined ? `(${stats.inactiveEmployeesCount.toLocaleString()})` : ''}
              </option>
            </select>
          </div>

          {/* Scanned Status Filter */}
          <div className="scanning-status__filter-select-wrap">
            <label className="scanning-status__filter-label">201 Files:</label>
            <select
              className="scanning-status__select"
              value={scanFilter}
              onChange={(e) => {
                setScanFilter(e.target.value as any);
                setCurrentPage(1);
              }}
            >
              <option value="all">All ({stats.totalEmployeesInScope.toLocaleString()})</option>
              <option value="with_docs">With Scanned ({stats.employeesWithScannedFiles.toLocaleString()})</option>
              <option value="without_docs">
                Without Scanned (
                {Math.max(0, stats.totalEmployeesInScope - stats.employeesWithScannedFiles).toLocaleString()}
                )
              </option>
            </select>
          </div>

          {/* Sort By */}
          <div className="scanning-status__filter-select-wrap">
            <label className="scanning-status__filter-label">Sort By:</label>
            <select
              className="scanning-status__select"
              value={sortBy}
              onChange={(e) => {
                const newSort = e.target.value as any;
                setSortBy(newSort);
                setSortOrder(newSort === 'scannedCount' ? 'desc' : 'asc');
                setCurrentPage(1);
              }}
            >
              <option value="scannedCount">Total Scanned Count</option>
              <option value="name">Employee Name (Last, First)</option>
              <option value="id">Employee ID</option>
              <option value="office">Office Name</option>
              <option value="position">Position</option>
            </select>
            <button
              type="button"
              className="scanning-status__sort-direction-btn"
              onClick={() => {
                setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                setCurrentPage(1);
              }}
              title={`Sorting ${sortOrder === 'asc' ? 'Ascending' : 'Descending'} (Click to toggle)`}
            >
              {sortOrder === 'asc' ? <MdArrowUpward /> : <MdArrowDownward />}
            </button>
          </div>
        </div>

        {/* Results summary pill */}
        <div className="scanning-status__results-bar">
          <span className="scanning-status__results-count">
            Showing <strong>{employees.length}</strong> of <strong>{totalCount.toLocaleString()}</strong> matching employees
            {officeFilter !== 'All' && <span> in <strong>{getOfficeFullName(officeFilter)}</strong></span>}
            {employeeStatus !== 'all' && <span> • <strong>{employeeStatus}</strong> status</span>}
            {searchTerm && <span> matching "<strong>{searchTerm}</strong>"</span>}
            {scanFilter === 'with_docs' && <span> (with scanned documents only)</span>}
            {scanFilter === 'without_docs' && <span> (without scanned documents only)</span>}
          </span>
          {searchTerm || officeFilter !== 'All' || employeeStatus !== 'all' || scanFilter !== 'all' ? (
            <button
              type="button"
              className="scanning-status__reset-btn"
              onClick={() => {
                setSearchTerm('');
                setOfficeFilter('All');
                setEmployeeStatus('all');
                setScanFilter('all');
                setCurrentPage(1);
              }}
            >
              Reset Filters
            </button>
          ) : null}
        </div>
      </Card>

      {/* Main Table Card */}
      <Card className="scanning-status__table-card">
        <div className="scanning-status__table-container">
          <table className="scanning-status__table">
            <thead>
              <tr>
                <th
                  className="scanning-status__th-employee scanning-status__th--sortable"
                  onClick={() => handleSortColumn('name')}
                  title="Click to sort by Employee Name"
                >
                  <div className="scanning-status__th-content">
                    <span>Employee</span>
                    <span className="scanning-status__sort-arrow">
                      {sortBy === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th
                  className="scanning-status__th-office scanning-status__th--sortable"
                  onClick={() => handleSortColumn('office')}
                  title="Click to sort by Office / Hospital"
                >
                  <div className="scanning-status__th-content">
                    <span>Office / Hospital</span>
                    <span className="scanning-status__sort-arrow">
                      {sortBy === 'office' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th
                  className="scanning-status__th-position scanning-status__th--sortable"
                  onClick={() => handleSortColumn('position')}
                  title="Click to sort by Position"
                >
                  <div className="scanning-status__th-content">
                    <span>Position</span>
                    <span className="scanning-status__sort-arrow">
                      {sortBy === 'position' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th
                  className="scanning-status__th-total-scanned scanning-status__th--sortable"
                  style={{ textAlign: 'center' }}
                  onClick={() => handleSortColumn('scannedCount')}
                  title="Click to sort by Total Scanned 201 Files"
                >
                  <div className="scanning-status__th-content" style={{ justifyContent: 'center' }}>
                    <span>TOTAL SCANNED 201 FILES</span>
                    <span className="scanning-status__sort-arrow">
                      {sortBy === 'scannedCount' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
                <th className="scanning-status__th-latest">Latest Document</th>
                <th className="scanning-status__th-actions" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="scanning-status__empty-state">
                    <div className="scanning-status__loading-spinner" />
                    <span>Loading scanning status...</span>
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="scanning-status__empty-state">
                    <MdDocumentScanner className="scanning-status__empty-icon" />
                    <h3>No Employees Found</h3>
                    <p>
                      {searchTerm || officeFilter !== 'All' || scanFilter !== 'all'
                        ? 'Try clearing or modifying your search filters above.'
                        : 'No employee records found in the database.'}
                    </p>
                  </td>
                </tr>
              ) : (
                employees.map((emp) => {
                  const latestDoc = emp.documents && emp.documents[0];
                  // Compute category counts for all document tabs
                  const categoryCounts: Record<string, number> = {};
                  emp.documents?.forEach((d) => {
                    categoryCounts[d.category] = (categoryCounts[d.category] || 0) + 1;
                  });

                  const docCount = emp._count?.documents ?? emp.documents?.length ?? 0;
                  const hasDocs = docCount > 0;

                  return (
                    <tr key={emp.id} className="scanning-status__row">
                      {/* Employee Info */}
                      <td className="scanning-status__td-employee">
                        <div className="scanning-status__employee-details">
                          <span className="scanning-status__employee-name">
                            {getEmployeeDisplayName(emp)}
                          </span>
                          <span className="scanning-status__employee-id">{emp.id}</span>
                        </div>
                      </td>

                      {/* Office */}
                      <td className="scanning-status__td-office">
                        <div className="scanning-status__office-cell">
                          <span className="scanning-status__office-badge" title={getOfficeFullName(emp.officeName)}>
                            {getOfficeFullName(emp.officeName)}
                          </span>
                        </div>
                      </td>

                      {/* Position & Status */}
                      <td className="scanning-status__td-position">
                        <div className="scanning-status__position-cell">
                          <span className="scanning-status__position-text">{emp.position || '—'}</span>
                          <div className="scanning-status__tags-row">
                            <span
                              className={`scanning-status__status-badge ${
                                emp.status === 'Active'
                                  ? 'scanning-status__status-badge--active'
                                  : 'scanning-status__status-badge--inactive'
                              }`}
                            >
                              {emp.status}
                            </span>
                            <span className="scanning-status__appointment-tag">{emp.appointmentStatus}</span>
                          </div>
                        </div>
                      </td>

                      {/* Prominent Scanned Count & ALL Document Category Chips */}
                      <td className="scanning-status__td-total-scanned" style={{ textAlign: 'center' }}>
                        <div className="scanning-status__count-wrapper">
                          <div
                            className={`scanning-status__main-count-pill ${
                              !hasDocs ? 'scanning-status__main-count-pill--empty' : ''
                            }`}
                          >
                            <MdDocumentScanner className="scanning-status__main-count-icon" />
                            <span className="scanning-status__main-count-number">{docCount}</span>
                            <span className="scanning-status__main-count-label">
                              {docCount === 1 ? 'File' : 'Files'}
                            </span>
                          </div>

                          {/* All Document Categories / Tabs Counts */}
                          {hasDocs ? (
                            <div className="scanning-status__categories-list">
                              {Object.entries(categoryCounts)
                                .sort((a, b) => b[1] - a[1])
                                .map(([cat, count]) => (
                                  <div
                                    key={cat}
                                    className="scanning-status__cat-item"
                                    title={`${cat}: ${count} document(s)`}
                                  >
                                    <span className="scanning-status__cat-name">{cat}</span>
                                    <span className="scanning-status__cat-count">{count}</span>
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <span className="scanning-status__unscanned-label">No scanned files</span>
                          )}
                        </div>
                      </td>

                      {/* Latest Document */}
                      <td className="scanning-status__td-latest">
                        {latestDoc ? (
                          <div className="scanning-status__latest-doc-cell">
                            <span
                              className="scanning-status__latest-doc-name scanning-status__latest-doc-name--clickable"
                              title={`Click to view ${latestDoc.fileName}`}
                              onClick={() => handleOpenPdfViewer(latestDoc, emp)}
                            >
                              <MdVisibility style={{ marginRight: 4, color: 'var(--color-primary)', flexShrink: 0 }} />
                              {latestDoc.fileName}
                            </span>
                            <span className="scanning-status__latest-doc-meta">
                              {formatDate(latestDoc.createdAt)}
                              {latestDoc.uploadedBy && ` • By ${latestDoc.uploadedBy}`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-secondary" style={{ fontSize: '0.85rem' }}>—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="scanning-status__td-actions" style={{ textAlign: 'right' }}>
                        <div className="scanning-status__actions-cell">
                          {hasDocs ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setViewingEmployee(emp)}
                              title="View all scanned files for this employee"
                              className="scanning-status__action-btn"
                            >
                              <MdFolderOpen style={{ marginRight: 4, fontSize: '1rem', color: '#2563eb' }} />
                              View Files ({docCount})
                            </Button>
                          ) : (
                            <span className="text-secondary" style={{ fontSize: '0.85rem' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalCount > 0 && (
          <div className="scanning-status__pagination-bar">
            <div className="scanning-status__pagination-size">
              <span>Show per page:</span>
              <select
                className="scanning-status__select-compact"
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(parseInt(e.target.value, 10));
                  setCurrentPage(1);
                }}
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="scanning-status__pagination-info">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
              {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount.toLocaleString()}
            </div>

            <div className="scanning-status__pagination-controls">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="scanning-status__page-number">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Scanned Documents Folder Modal */}
      <Modal
        isOpen={Boolean(viewingEmployee)}
        onClose={() => setViewingEmployee(null)}
        title={
          viewingEmployee ? (
            <div className="scanning-status__modal-title">
              <MdFolderOpen style={{ color: '#2563eb', fontSize: '1.25rem' }} />
              <span>
                201 Files: {getEmployeeDisplayName(viewingEmployee)} ({viewingEmployee.id})
              </span>
            </div>
          ) : (
            'Employee 201 Files'
          )
        }
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Total: <strong>{viewingEmployee?.documents?.length || 0}</strong> scanned document(s)
            </span>
            <Button variant="primary" size="sm" onClick={() => setViewingEmployee(null)}>
              Close
            </Button>
          </div>
        }
      >
        {viewingEmployee && (
          <div className="scanning-status__modal-body">
            {/* Employee Quick Summary Header */}
            <div className="scanning-status__modal-summary">
              <div>
                <strong>Office:</strong> {getOfficeFullName(viewingEmployee.officeName)}
              </div>
              <div>
                <strong>Position:</strong> {viewingEmployee.position}
              </div>
              <div>
                <strong>Status:</strong> {viewingEmployee.appointmentStatus}
              </div>
              {viewingEmployee.fileboxLocation && (
                <div>
                  <strong>Physical Box:</strong> {viewingEmployee.fileboxLocation}
                </div>
              )}
            </div>

            {/* Documents List */}
            <div className="scanning-status__modal-table-wrap">
              <table className="scanning-status__modal-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Document Name</th>
                    <th>Date Scanned</th>
                    <th>File Size</th>
                    <th>Uploaded By</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingEmployee.documents?.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <span className="scanning-status__cat-badge">{doc.category}</span>
                      </td>
                      <td>
                        <div className="scanning-status__doc-name-cell">
                          <MdInsertDriveFile className="scanning-status__doc-icon" />
                          <span title={doc.fileName}>{doc.fileName}</span>
                        </div>
                      </td>
                      <td>{formatDate(doc.createdAt)}</td>
                      <td>{formatFileSize(doc.fileSize)}</td>
                      <td>{doc.uploadedBy || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenPdfViewer(doc)}
                          title="View document in viewer"
                          className="scanning-status__open-file-btn"
                        >
                          <MdVisibility style={{ marginRight: 4 }} />
                          View File
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(!viewingEmployee.documents || viewingEmployee.documents.length === 0) && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                        No documents in this folder.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* In-App PDF Viewer (Opens inside app, does not download) */}
      {isPdfViewerOpen && selectedDocForViewer && (
        <PDFViewer
          isOpen={isPdfViewerOpen}
          onClose={() => {
            setIsPdfViewerOpen(false);
            setSelectedDocForViewer(null);
            setPdfData(null);
          }}
          document={selectedDocForViewer}
          pdfData={pdfData}
          canDownloadOrPrint={true}
          employeeId={viewerEmployeeId}
          employeeName={viewerEmployeeName}
        />
      )}
    </div>
  );
}
