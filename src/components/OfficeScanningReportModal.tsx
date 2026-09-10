import React, { useState, useMemo } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { useToast } from '../contexts/ToastContext';
import {
  MdFileDownload,
  MdCalendarToday,
  MdTableChart,
  MdPrint,
  MdSearch,
  MdBusiness,
  MdLocalHospital,
} from 'react-icons/md';
import generateScanningSummaryExcel, {
  ReportOfficeRow,
  ReportTotals,
} from '../utils/generateScanningSummaryExcel';
import { formatDateReadable } from '../utils/dateUtils';
import './OfficeScanningReportModal.css';

interface OfficeScanningReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: ReportOfficeRow[];
  allRows?: ReportOfficeRow[];
  totals: ReportTotals;
  allTotals?: ReportTotals;
  asOfDate?: string;
  dateFrom?: string;
  dateTo?: string;
  onRemarkChange?: (officeAbbr: string, value: string) => void;
}

const ZERO_COUNTS = { regular: 0, casual: 0, jobOrder: 0, consultant: 0, total: 0 };

export default function OfficeScanningReportModal({
  isOpen,
  onClose,
  rows,
  allRows,
  totals,
  allTotals,
  asOfDate,
  dateFrom,
  dateTo,
  onRemarkChange,
}: OfficeScanningReportModalProps) {
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [sourceMode, setSourceMode] = useState<'all' | 'filtered'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Department' | 'Hospital'>('All');
  const [modalSearch, setModalSearch] = useState('');

  const [localRemarks, setLocalRemarks] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('office_matrix_remarks');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleRemarkChange = (abbr: string, val: string) => {
    setLocalRemarks((prev) => {
      const updated = { ...prev, [abbr]: val };
      try {
        localStorage.setItem('office_matrix_remarks', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    if (onRemarkChange) {
      onRemarkChange(abbr, val);
    }
  };

  const formattedAsOf =
    asOfDate ||
    new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  const formattedDateFrom = dateFrom ? formatDateReadable(dateFrom) : '';
  const formattedDateTo = dateTo ? formatDateReadable(dateTo) : '';

  // Determine base rows based on sourceMode
  const baseRows = useMemo(() => {
    if (sourceMode === 'filtered') return rows;
    return allRows && allRows.length > 0 ? allRows : rows;
  }, [sourceMode, allRows, rows]);

  // Apply in-modal filtering
  const displayRows = useMemo(() => {
    return baseRows.filter((r) => {
      if (categoryFilter !== 'All' && r.type !== categoryFilter) return false;
      if (modalSearch.trim()) {
        const q = modalSearch.toLowerCase().trim();
        return (
          r.abbreviation.toLowerCase().includes(q) ||
          (r.name && r.name.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [baseRows, categoryFilter, modalSearch]);

  // Compute totals for displayed rows
  const displayTotals = useMemo<ReportTotals>(() => {
    const t: ReportTotals = {
      employees: { ...ZERO_COUNTS },
      pdf: { ...ZERO_COUNTS },
      file201: { ...ZERO_COUNTS },
    };

    displayRows.forEach((r) => {
      t.employees.regular += r.employees.regular || 0;
      t.employees.casual += r.employees.casual || 0;
      t.employees.jobOrder += r.employees.jobOrder || 0;
      t.employees.consultant += r.employees.consultant || 0;
      t.employees.total += r.employees.total || 0;

      t.pdf.regular += r.pdf?.regular || 0;
      t.pdf.casual += r.pdf?.casual || 0;
      t.pdf.jobOrder += r.pdf?.jobOrder || 0;
      t.pdf.consultant += r.pdf?.consultant || 0;
      t.pdf.total += r.pdf?.total || 0;

      t.file201.regular += r.file201?.regular || 0;
      t.file201.casual += r.file201?.casual || 0;
      t.file201.jobOrder += r.file201?.jobOrder || 0;
      t.file201.consultant += r.file201?.consultant || 0;
      t.file201.total += r.file201?.total || 0;
    });

    return t;
  }, [displayRows]);

  // Handle Export to Excel
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      showToast('Generating Excel report...', 'info');

      // Include fillable remarks in exported rows
      const exportRows = displayRows.map((r) => ({
        ...r,
        remarks: localRemarks[r.abbreviation] !== undefined ? localRemarks[r.abbreviation] : (r.remarks || ''),
      }));

      await generateScanningSummaryExcel({
        rows: exportRows,
        totals: displayTotals,
        asOfDate: formattedAsOf,
        dateFrom,
        dateTo,
      });
      showToast('📊 Report exported to Excel successfully!', 'success');
    } catch (err: any) {
      console.error('Export Excel error:', err);
      showToast(err.message || 'Failed to export Excel report', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Print
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Office and Hospital Scanning Status Report"
      size="xl"
      noPadding
      allowFullscreen
    >
      <div className="scanning-report">
        {/* Main Content Area */}
        <div className="scanning-report__content">
          {/* Header / Banner */}
          <div className="scanning-report__header-banner">
            <h1 className="scanning-report__title-a1">
              DOCUMENT SCANNING DETAILED TRACKER
            </h1>
            <div className="scanning-report__subtitle-a2">
              Human Resource Mgt. and Development Office<br />
              Provincial Government of Pangasinan<br />
              Complete Offices & Hospitals Scanning Status
            </div>
            <div className="scanning-report__as-of-badge">
              <MdCalendarToday className="scanning-report__as-of-icon" />
              <span>As of {formattedAsOf}</span>
              {formattedDateFrom && formattedDateTo && (
                <span className="scanning-report__date-filter-pill">
                  Filter: {formattedDateFrom} to {formattedDateTo}
                </span>
              )}
            </div>

            {/* In-Modal Filter & Search Toolbar */}
            <div className="scanning-report__toolbar">
              {allRows && allRows.length > rows.length && (
                <div className="scanning-report__mode-toggle">
                  <button
                    type="button"
                    className={`scanning-report__mode-btn ${sourceMode === 'all' ? 'active' : ''}`}
                    onClick={() => setSourceMode('all')}
                  >
                    All Offices ({allRows.length})
                  </button>
                  <button
                    type="button"
                    className={`scanning-report__mode-btn ${sourceMode === 'filtered' ? 'active' : ''}`}
                    onClick={() => setSourceMode('filtered')}
                  >
                    Table Filter ({rows.length})
                  </button>
                </div>
              )}

              <div className="scanning-report__cat-filters">
                <button
                  type="button"
                  className={`scanning-report__cat-btn ${categoryFilter === 'All' ? 'active' : ''}`}
                  onClick={() => setCategoryFilter('All')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`scanning-report__cat-btn ${categoryFilter === 'Department' ? 'active' : ''}`}
                  onClick={() => setCategoryFilter('Department')}
                >
                  <MdBusiness style={{ marginRight: 4 }} />
                  Offices
                </button>
                <button
                  type="button"
                  className={`scanning-report__cat-btn ${categoryFilter === 'Hospital' ? 'active' : ''}`}
                  onClick={() => setCategoryFilter('Hospital')}
                >
                  <MdLocalHospital style={{ marginRight: 4 }} />
                  Hospitals
                </button>
              </div>

              <div className="scanning-report__search-wrap">
                <MdSearch className="scanning-report__search-icon" />
                <input
                  type="text"
                  placeholder="Filter offices..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="scanning-report__search-input"
                />
                {modalSearch && (
                  <button
                    type="button"
                    onClick={() => setModalSearch('')}
                    className="scanning-report__search-clear"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Office Scanning Tracker Table */}
          <div className="scanning-report__table-wrap">
            <table className="scanning-report__table">
              <thead>
                <tr className="scanning-report__th-row-1">
                  <th rowSpan={3} className="scanning-report__th-no">No.</th>
                  <th rowSpan={3} className="scanning-report__th-office">Office / Hospital</th>
                  <th colSpan={5} className="scanning-report__th-group scanning-report__th-group--emp">
                    Number of Active Employees as of {formattedAsOf}
                  </th>
                  <th colSpan={5} className="scanning-report__th-group scanning-report__th-group--pdf">
                    Position Description Form (PDF)
                  </th>
                  <th colSpan={5} className="scanning-report__th-group scanning-report__th-group--201">
                    201 File
                  </th>
                  <th rowSpan={3} className="scanning-report__th-remarks">Remarks / Notes</th>
                </tr>

                <tr className="scanning-report__th-row-2">
                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-emp-sub">Regular</th>
                  <th colSpan={3} className="scanning-report__th-col-parent scanning-report__th-emp-sub">Non-Regular</th>
                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-col--total scanning-report__th-emp-tot">Total</th>

                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-pdf-sub">Regular</th>
                  <th colSpan={3} className="scanning-report__th-col-parent scanning-report__th-pdf-sub">Non-Regular</th>
                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-col--total scanning-report__th-pdf-tot">Total PDF</th>

                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-201-sub">Regular</th>
                  <th colSpan={3} className="scanning-report__th-col-parent scanning-report__th-201-sub">Non-Regular</th>
                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-col--total scanning-report__th-201-tot">Total 201 File</th>
                </tr>

                <tr className="scanning-report__th-row-3">
                  <th className="scanning-report__th-sub scanning-report__th-emp-sub">Casual</th>
                  <th className="scanning-report__th-sub scanning-report__th-emp-sub">Job Order</th>
                  <th className="scanning-report__th-sub scanning-report__th-emp-sub">Consultant</th>

                  <th className="scanning-report__th-sub scanning-report__th-pdf-sub">Casual</th>
                  <th className="scanning-report__th-sub scanning-report__th-pdf-sub">Job Order</th>
                  <th className="scanning-report__th-sub scanning-report__th-pdf-sub">Consultant</th>

                  <th className="scanning-report__th-sub scanning-report__th-201-sub">Casual</th>
                  <th className="scanning-report__th-sub scanning-report__th-201-sub">Job Order</th>
                  <th className="scanning-report__th-sub scanning-report__th-201-sub">Consultant</th>
                </tr>
              </thead>

              <tbody>
                {displayRows.map((row, idx) => (
                  <tr key={`${row.abbreviation}-${idx}`} className="scanning-report__tr">
                    <td className="scanning-report__td-no">{idx + 1}</td>
                    <td className="scanning-report__td-office">
                      <div className="scanning-report__office-cell">
                        <span className="scanning-report__office-name" title={row.name ? `${row.abbreviation} - ${row.name}` : row.abbreviation}>
                          {row.abbreviation}
                        </span>
                        <span
                          className={`scanning-report__type-tag ${
                            row.type === 'Hospital' ? 'scanning-report__type-tag--hosp' : ''
                          }`}
                        >
                          {row.type === 'Hospital' ? 'Hospital' : 'Office'}
                        </span>
                      </div>
                    </td>

                    {/* Employees */}
                    <td className="scanning-report__td-num">{row.employees.regular || 0}</td>
                    <td className="scanning-report__td-num">{row.employees.casual || 0}</td>
                    <td className="scanning-report__td-num">{row.employees.jobOrder || 0}</td>
                    <td className="scanning-report__td-num">{row.employees.consultant || 0}</td>
                    <td className="scanning-report__td-num scanning-report__td-subtotal scanning-report__col-tot-emp">
                      {row.employees.total || 0}
                    </td>

                    {/* PDF */}
                    <td className="scanning-report__td-num">{row.pdf?.regular || 0}</td>
                    <td className="scanning-report__td-num">{row.pdf?.casual || 0}</td>
                    <td className="scanning-report__td-num">{row.pdf?.jobOrder || 0}</td>
                    <td className="scanning-report__td-num">{row.pdf?.consultant || 0}</td>
                    <td className="scanning-report__td-num scanning-report__td-subtotal scanning-report__td-pdf-subtotal scanning-report__col-tot-pdf">
                      {row.pdf?.total || 0}
                    </td>

                    {/* 201 File */}
                    <td className="scanning-report__td-num">{row.file201?.regular || 0}</td>
                    <td className="scanning-report__td-num">{row.file201?.casual || 0}</td>
                    <td className="scanning-report__td-num">{row.file201?.jobOrder || 0}</td>
                    <td className="scanning-report__td-num">{row.file201?.consultant || 0}</td>
                    <td className="scanning-report__td-num scanning-report__td-subtotal scanning-report__td-201-subtotal scanning-report__col-tot-201">
                      {row.file201?.total || 0}
                    </td>

                    {/* Fillable Remarks / Progress Notes */}
                    <td className="scanning-report__td-remarks">
                      <input
                        type="text"
                        className="scanning-report__remarks-input"
                        placeholder="Add remarks / notes..."
                        value={localRemarks[row.abbreviation] !== undefined ? localRemarks[row.abbreviation] : (row.remarks || '')}
                        onChange={(e) => handleRemarkChange(row.abbreviation, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}

                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={18} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                      No offices or hospitals found matching your filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>

              <tfoot>
                <tr className="scanning-report__tfoot-row">
                  <td className="scanning-report__td-no"></td>
                  <td className="scanning-report__td-office scanning-report__td-foot-title">TOTAL</td>

                  {/* Employees totals */}
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.employees.regular.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.employees.casual.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.employees.jobOrder.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.employees.consultant.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-grand">
                    {displayTotals.employees.total.toLocaleString()}
                  </td>

                  {/* PDF totals */}
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.pdf.regular.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.pdf.casual.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.pdf.jobOrder.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.pdf.consultant.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-grand">
                    {displayTotals.pdf.total.toLocaleString()}
                  </td>

                  {/* 201 totals */}
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.file201.regular.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.file201.casual.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.file201.jobOrder.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-val">
                    {displayTotals.file201.consultant.toLocaleString()}
                  </td>
                  <td className="scanning-report__td-num scanning-report__td-foot-grand">
                    {displayTotals.file201.total.toLocaleString()}
                  </td>

                  <td className="scanning-report__td-foot-val"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="scanning-report__bottom-bar">
          <div className="scanning-report__bottom-left">
            <span className="scanning-report__badge">
              <MdTableChart /> Scanning Summary Format View
            </span>
            <span className="scanning-report__count-tag">
              {displayRows.length} {displayRows.length === 1 ? 'Office' : 'Offices'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Button
              variant="secondary"
              onClick={handlePrint}
              className="scanning-report__action-btn"
            >
              <MdPrint /> Print
            </Button>
            <Button
              variant="primary"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="scanning-report__action-btn scanning-report__action-btn--excel"
            >
              <MdFileDownload /> {isExporting ? 'Exporting...' : 'Export to Excel'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
