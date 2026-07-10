import { useState, useMemo, useEffect } from 'react';
import Table, { Column } from '../components/ui/Table';
import SearchBar from '../components/ui/SearchBar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import { AuditLog, AuditActionType } from '../types/audit';
import api, { getServerBaseUrl } from '../services/api';
import PDFViewer from '../components/documents/PDFViewer';
import { getAuthState } from '../utils/mockAuth';
import { exportAuditLogsToFile } from '../utils/exportUtils';
import './AuditLogs.css';

const ITEMS_PER_PAGE = 15;

function AuditLogs() {
  const currentUser = getAuthState();
  const userRole = currentUser?.role || 'viewer';
  const canDownloadOrPrint = userRole === 'superadmin' || userRole === 'developer' || userRole === 'admin';

  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<AuditActionType | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateError, setDateError] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportActionFilter, setExportActionFilter] = useState<AuditActionType | 'all'>('all');
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');

  // Fetch audit logs from API
  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      setIsLoading(true);
      const data = await api.audit.getAll();
      
      // Map API response to AuditLog format
      const mappedLogs: AuditLog[] = data.map((log: any) => {
        // Use userName and userRole from API response
        const userName = log.userName || 'System';
        const userRole = log.userRole || 'system';
        
        // Use details field as the description (it now contains human-readable text)
        let description = log.details || `${log.action} on ${log.entity}`;
        
        // Clean up date strings in description - remove timezone info
        // Match patterns like "Thu Jan 08 2004 08:00:00 GMT+0800 (Philippine Standard Time)"
        description = description.replace(
          /([A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{4}) \d{2}:\d{2}:\d{2} GMT[+-]\d{4} \([^)]+\)/g,
          '$1'
        );
        
        // Remove user name from the beginning of description to avoid repetition
        // Patterns like "Palma, Ivan imported..." or "Ivan Palma imported..."
        // Remove "LastName, FirstName " or "FirstName LastName " from start
        description = description.replace(/^[A-Z][a-z]+,?\s+[A-Z][a-z]+\s+/i, '');
        
        return {
          id: log.id,
          userId: log.userId,
          timestamp: log.createdAt,
          action: log.action,
          actionType: log.action as AuditActionType,
          description: description,
          userName: userName,
          userRole: userRole,
          entityType: log.entity,
          entityId: log.entityId,
          metadata: log.metadata || undefined,
        };
      });
      
      setAuditLogs(mappedLogs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      alert('Failed to load audit logs. Please check if the backend server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter audit logs based on search and filters
  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const matchesSearch =
        searchQuery === '' ||
        log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesAction = actionFilter === 'all' || log.actionType === actionFilter;

      // Date range filter
      let matchesDateRange = true;
      if (dateFrom || dateTo) {
        const logDate = new Date(log.timestamp);
        
        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          matchesDateRange = matchesDateRange && logDate >= fromDate;
        }
        
        if (dateTo) {
          const toDate = new Date(dateTo);
          matchesDateRange = matchesDateRange && logDate <= toDate;
        }
      }

      return matchesSearch && matchesAction && matchesDateRange;
    });
  }, [searchQuery, actionFilter, dateFrom, dateTo, auditLogs]);

  // Paginate logs
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredLogs.slice(startIndex, endIndex);
  }, [filteredLogs, currentPage]);

  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);

  const getActionBadgeVariant = (actionType: AuditActionType) => {
    switch (actionType) {
      case 'create':
        return 'success';
      case 'update':
        return 'info';
      case 'status_change':
        return 'warning';
      case 'delete':
        return 'danger';
      case 'upload':
        return 'success';
      case 'import':
        return 'success';
      default:
        return 'default';
    }
  };

  const getActionIcon = (actionType: AuditActionType): string => {
    switch (actionType) {
      case 'create':
        return '➕';
      case 'update':
        return '✏️';
      case 'status_change':
        return '🔄';
      case 'delete':
        return '🗑️';
      case 'upload':
        return '📤';
      case 'import':
        return '📥';
      default:
        return '📝';
    }
  };

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  };

  // Table columns
  const columns: Column<AuditLog>[] = [
    {
      key: 'timestamp',
      header: 'Date & Time',
      width: '15%',
      render: (log) => {
        const { date, time } = formatDateTime(log.timestamp);
        return (
          <div className="audit-logs__datetime">
            <div className="audit-logs__date">{date}</div>
            <div className="audit-logs__time">{time}</div>
          </div>
        );
      },
    },
    {
      key: 'actionType',
      header: 'Action',
      width: '12%',
      render: (log) => (
        <div className="audit-logs__action-type">
          <span className="audit-logs__icon">{getActionIcon(log.actionType)}</span>
          <Badge variant={getActionBadgeVariant(log.actionType)} size="sm">
            {log.actionType.replace('_', ' ')}
          </Badge>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      width: '40%',
      render: (log) => {
        // Check if log is expandable (import or bulk delete with metadata)
        const isExpandable = (log.actionType === 'import' || log.actionType === 'delete') && 
                            log.metadata?.employees && 
                            log.metadata.employees.length > 0;
        const isExpanded = expandedRows.has(log.id);
        const employees = log.metadata?.employees || [];

        // Determine the header text based on action type
        const headerText = log.actionType === 'import' 
          ? `Imported Employees (${employees.length}):`
          : `Deleted Employees (${employees.length}):`;

        const isUpload = (log.actionType === 'upload' || log.actionType === 'create') && log.entityType === 'document' && log.entityId;

        return (
          <div className="audit-logs__description-wrapper">
            <div className="audit-logs__description" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{log.description}</span>
              {isUpload && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const doc = await api.document.getById(log.entityId);
                      setSelectedDocument(doc);
                      setPdfData(`${getServerBaseUrl()}/api/documents/${log.entityId}/file`);
                      setIsViewerOpen(true);
                    } catch (err) {
                      alert('Failed to load file. It might have been deleted or moved.');
                    }
                  }}
                  className="audit-logs__file-link-btn"
                  title="Open uploaded file"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginLeft: '8px',
                    padding: '2px 8px',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    color: 'var(--color-primary)',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-primary)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                    e.currentTarget.style.color = 'var(--color-primary)';
                  }}
                >
                  📄 View File
                </button>
              )}
            </div>
            {isExpandable && (
              <>
                <button
                  className="audit-logs__expand-button"
                  onClick={() => {
                    const newExpanded = new Set(expandedRows);
                    if (isExpanded) {
                      newExpanded.delete(log.id);
                    } else {
                      newExpanded.add(log.id);
                    }
                    setExpandedRows(newExpanded);
                  }}
                >
                  {isExpanded ? '▼ Hide Details' : '▶ View Details'}
                </button>
                {isExpanded && (
                  <div className="audit-logs__expanded-content">
                    <div className="audit-logs__expanded-header">
                      {headerText}
                    </div>
                    <div className="audit-logs__expanded-list">
                      {employees.map((emp, index) => (
                        <div key={index} className="audit-logs__expanded-item">
                          • {emp.first_name} {emp.last_name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      },
    },
    {
      key: 'userName',
      header: 'User',
      width: '18%',
      render: (log) => (
        <div className="audit-logs__user">
          <div className="audit-logs__user-name">{log.userName}</div>
          <div className="audit-logs__user-role">{log.userRole}</div>
        </div>
      ),
    },
    {
      key: 'entityType',
      header: 'Entity',
      width: '15%',
      render: (log) => (
        <span className="audit-logs__entity">{log.entityType}</span>
      ),
    },
  ];

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleExport = () => {
    setIsExportModalOpen(true);
  };

  const handleCloseExportModal = () => {
    setIsExportModalOpen(false);
  };

  const handleConfirmExport = () => {
    // Filter logs based on export criteria
    let logsToExport = auditLogs;

    // Apply action filter
    if (exportActionFilter !== 'all') {
      logsToExport = logsToExport.filter(log => log.actionType === exportActionFilter);
    }

    // Apply date range filter
    if (exportDateFrom || exportDateTo) {
      logsToExport = logsToExport.filter(log => {
        const logDate = new Date(log.timestamp);
        let matches = true;

        if (exportDateFrom) {
          const fromDate = new Date(exportDateFrom);
          matches = matches && logDate >= fromDate;
        }

        if (exportDateTo) {
          const toDate = new Date(exportDateTo);
          matches = matches && logDate <= toDate;
        }

        return matches;
      });
    }

    if (logsToExport.length === 0) {
      alert('No audit logs match the selected criteria.');
      return;
    }

    // Export the filtered logs
    exportAuditLogsToFile(logsToExport, {
      format: exportFormat,
      filename: `audit-logs-${new Date().toISOString().split('T')[0]}`,
    });

    setIsExportModalOpen(false);
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    setDateError('');
    
    // Validate date range
    if (value && dateTo) {
      const from = new Date(value);
      const to = new Date(dateTo);
      if (from > to) {
        setDateError('From date cannot be later than To date');
      }
    }
    setCurrentPage(1);
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    setDateError('');
    
    // Validate date range
    if (dateFrom && value) {
      const from = new Date(dateFrom);
      const to = new Date(value);
      if (from > to) {
        setDateError('From date cannot be later than To date');
      }
    }
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setDateError('');
    setSearchQuery('');
    setActionFilter('all');
    setCurrentPage(1);
  };

  return (
    <div className="audit-logs">
      <div className="audit-logs__header">
        <div>
          <h1 className="audit-logs__title">Audit Logs</h1>
          <p className="audit-logs__subtitle">
            Track all system activities and changes ({filteredLogs.length} entries)
          </p>
        </div>
        <Button variant="secondary" onClick={handleExport}>
          📥 Export
        </Button>
      </div>

      <Card>
        {/* Date Range Filter */}
        <div className="audit-logs__date-filter">
          <div className="audit-logs__date-filter-group">
            <label htmlFor="date-from" className="audit-logs__filter-label">
              From:
            </label>
            <input
              type="datetime-local"
              id="date-from"
              className="audit-logs__date-input"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
            />
          </div>

          <div className="audit-logs__date-filter-group">
            <label htmlFor="date-to" className="audit-logs__filter-label">
              To:
            </label>
            <input
              type="datetime-local"
              id="date-to"
              className="audit-logs__date-input"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
            />
          </div>

          <Button variant="secondary" size="sm" onClick={handleResetFilters}>
            🔄 Reset Filters
          </Button>
        </div>

        {dateError && (
          <div className="audit-logs__date-error">
            ⚠️ {dateError}
          </div>
        )}

        <div className="audit-logs__filters">
          <SearchBar
            placeholder="Search by user, action, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={handleClearSearch}
            fullWidth
          />

          <div className="audit-logs__filter-group">
            <label htmlFor="action-filter" className="audit-logs__filter-label">
              Action Type:
            </label>
            <select
              id="action-filter"
              className="audit-logs__filter-select"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value as AuditActionType | 'all');
                setCurrentPage(1);
              }}
            >
              <option value="all">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="upload">Upload</option>
              <option value="import">Import</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading audit logs...
          </div>
        ) : (
          <Table
            columns={columns}
            data={paginatedLogs}
            keyExtractor={(log) => log.id}
            emptyMessage="No audit logs found"
          />
        )}

        {totalPages > 1 && (
          <div className="audit-logs__pagination">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>

            <div className="audit-logs__pagination-info">
              Page {currentPage} of {totalPages}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </Card>

      {/* Export Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={handleCloseExportModal}
        title="Export Audit Logs"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseExportModal}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmExport}>
              📥 Export
            </Button>
          </>
        }
      >
        <div className="audit-logs__export-modal">
          <p className="audit-logs__export-description">
            Select the criteria for exporting audit logs. Only logs matching your filters will be exported.
          </p>

          {/* Date Range Filter */}
          <div className="audit-logs__export-section">
            <h4 className="audit-logs__export-section-title">Date Range (Optional)</h4>
            <div className="audit-logs__export-date-filters">
              <div className="audit-logs__export-field">
                <label htmlFor="export-date-from" className="audit-logs__export-label">
                  From:
                </label>
                <input
                  type="datetime-local"
                  id="export-date-from"
                  className="audit-logs__export-input"
                  value={exportDateFrom}
                  onChange={(e) => setExportDateFrom(e.target.value)}
                />
              </div>

              <div className="audit-logs__export-field">
                <label htmlFor="export-date-to" className="audit-logs__export-label">
                  To:
                </label>
                <input
                  type="datetime-local"
                  id="export-date-to"
                  className="audit-logs__export-input"
                  value={exportDateTo}
                  onChange={(e) => setExportDateTo(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Action Type Filter */}
          <div className="audit-logs__export-section">
            <h4 className="audit-logs__export-section-title">Action Type</h4>
            <select
              id="export-action-filter"
              className="audit-logs__export-select"
              value={exportActionFilter}
              onChange={(e) => setExportActionFilter(e.target.value as AuditActionType | 'all')}
            >
              <option value="all">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="upload">Upload</option>
              <option value="import">Import</option>
            </select>
          </div>

          {/* Export Format */}
          <div className="audit-logs__export-section">
            <h4 className="audit-logs__export-section-title">Export Format</h4>
            <div className="audit-logs__export-format-options">
              <label className="audit-logs__export-radio-label">
                <input
                  type="radio"
                  name="export-format"
                  value="xlsx"
                  checked={exportFormat === 'xlsx'}
                  onChange={(e) => setExportFormat(e.target.value as 'xlsx' | 'csv')}
                />
                <span>Excel (.xlsx)</span>
              </label>
              <label className="audit-logs__export-radio-label">
                <input
                  type="radio"
                  name="export-format"
                  value="csv"
                  checked={exportFormat === 'csv'}
                  onChange={(e) => setExportFormat(e.target.value as 'xlsx' | 'csv')}
                />
                <span>CSV (.csv)</span>
              </label>
            </div>
          </div>
        </div>
      </Modal>

      <PDFViewer
        isOpen={isViewerOpen}
        onClose={() => {
          setIsViewerOpen(false);
          setSelectedDocument(null);
          setPdfData(null);
        }}
        document={selectedDocument}
        pdfData={pdfData}
        canDownloadOrPrint={canDownloadOrPrint}
      />
    </div>
  );
}

export default AuditLogs;
