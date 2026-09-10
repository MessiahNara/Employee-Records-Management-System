import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import { getSocket } from '../services/socket';
import {
  MdSearch,
  MdRefresh,
  MdBusiness,
  MdLocalHospital,
  MdCalendarToday,
  MdFilterAlt,
  MdClose,
  MdAssessment,
} from 'react-icons/md';
import OfficeScanningReportModal from './OfficeScanningReportModal';
import './OfficeHospitalScanningMatrix.css';

interface CountsByCategory {
  regular: number;
  casual: number;
  jobOrder: number;
  consultant: number;
  total: number;
}

interface OfficeMatrixItem {
  abbreviation: string;
  name?: string;
  type: 'Department' | 'Hospital';
  employees: CountsByCategory;
  pdf: CountsByCategory;
  file201: CountsByCategory;
  overall: string;
  remarks: string;
}

interface MatrixTotals {
  employees: CountsByCategory;
  pdf: CountsByCategory;
  file201: CountsByCategory;
}

const ZERO_COUNTS: CountsByCategory = { regular: 0, casual: 0, jobOrder: 0, consultant: 0, total: 0 };

export default function OfficeHospitalScanningMatrix() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<OfficeMatrixItem[]>([]);
  const [totals, setTotals] = useState<MatrixTotals>({
    employees: { ...ZERO_COUNTS },
    pdf: { ...ZERO_COUNTS },
    file201: { ...ZERO_COUNTS },
  });
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Department' | 'Hospital'>('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [asOfDate, setAsOfDate] = useState(() => {
    return new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  });
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const params: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await api.document.getOfficeScanningMatrix(Object.keys(params).length > 0 ? params : undefined);
      if (res.success) {
        setRows(res.rows || []);
        if (res.totals) setTotals(res.totals);
      }
    } catch (err: any) {
      console.error('Error fetching office matrix:', err);
      showToast(err.message || 'Failed to load office matrix', 'error');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [dateFrom, dateTo, showToast]);

  useEffect(() => {
    fetchData();

    // Listen for real-time updates
    const socket = getSocket();
    if (socket) {
      const handleUpdate = () => fetchData(true);
      socket.on('documentsUpdated', handleUpdate);
      socket.on('employeeUpdated', handleUpdate);
      return () => {
        socket.off('documentsUpdated', handleUpdate);
        socket.off('employeeUpdated', handleUpdate);
      };
    }
  }, [fetchData]);

  const clearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
  };

  const hasDateFilter = dateFrom || dateTo;

  const [officeRemarks, setOfficeRemarks] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('office_matrix_remarks');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleRemarkChange = (officeAbbr: string, value: string) => {
    setOfficeRemarks((prev) => {
      const updated = { ...prev, [officeAbbr]: value };
      try {
        localStorage.setItem('office_matrix_remarks', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save office remarks', e);
      }
      return updated;
    });
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((item) => {
      if (typeFilter !== 'All' && item.type !== typeFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        return (
          item.abbreviation.toLowerCase().includes(q) ||
          (item.name && item.name.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [rows, typeFilter, searchTerm]);

  // Compute filtered totals
  const currentTotals = useMemo(() => {
    if (filteredRows.length === rows.length) return totals;
    const t: MatrixTotals = {
      employees: { ...ZERO_COUNTS },
      pdf: { ...ZERO_COUNTS },
      file201: { ...ZERO_COUNTS },
    };
    filteredRows.forEach((r) => {
      t.employees.regular += r.employees.regular;
      t.employees.casual += r.employees.casual;
      t.employees.jobOrder += r.employees.jobOrder;
      t.employees.consultant += r.employees.consultant;
      t.employees.total += r.employees.total;

      t.pdf.regular += r.pdf.regular;
      t.pdf.casual += r.pdf.casual;
      t.pdf.jobOrder += r.pdf.jobOrder;
      t.pdf.consultant += r.pdf.consultant;
      t.pdf.total += r.pdf.total;

      t.file201.regular += r.file201.regular;
      t.file201.casual += r.file201.casual;
      t.file201.jobOrder += r.file201.jobOrder;
      t.file201.consultant += r.file201.consultant;
      t.file201.total += r.file201.total;
    });
    return t;
  }, [filteredRows, rows, totals]);

  const deptCount = useMemo(() => rows.filter((r) => r.type === 'Department').length, [rows]);
  const hospCount = useMemo(() => rows.filter((r) => r.type === 'Hospital').length, [rows]);

  const reportRows = useMemo(() => {
    return filteredRows.map((r) => ({
      ...r,
      remarks: officeRemarks[r.abbreviation] !== undefined ? officeRemarks[r.abbreviation] : (r.remarks || ''),
    }));
  }, [filteredRows, officeRemarks]);

  const allReportRows = useMemo(() => {
    return rows.map((r) => ({
      ...r,
      remarks: officeRemarks[r.abbreviation] !== undefined ? officeRemarks[r.abbreviation] : (r.remarks || ''),
    }));
  }, [rows, officeRemarks]);

  // Helper to render a count cell with coloring
  const renderCountCell = (value: number, className: string) => (
    <td className={`office-matrix__td-num ${className}`}>
      {value > 0 ? (
        <span className="office-matrix__has-scanned">{value}</span>
      ) : (
        <span className="office-matrix__zero">0</span>
      )}
    </td>
  );

  // Helper to render a total cell with badge styling
  const renderTotalCell = (value: number, className: string) => (
    <td className={`office-matrix__td-num ${className}`}>
      {value > 0 ? (
        <span className="office-matrix__total-scanned-badge">{value}</span>
      ) : (
        <span className="office-matrix__zero">0</span>
      )}
    </td>
  );

  return (
    <div className="office-matrix">
      {/* Controls Bar */}
      <Card className="office-matrix__controls-card">
        <div className="office-matrix__controls-row">
          {/* Search */}
          <div className="office-matrix__search-wrap">
            <MdSearch className="office-matrix__search-icon" />
            <input
              type="text"
              className="office-matrix__search-input"
              placeholder="Search office or hospital..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="office-matrix__search-clear"
                onClick={() => setSearchTerm('')}
              >
                ×
              </button>
            )}
          </div>

          {/* Type Filter Buttons */}
          <div className="office-matrix__type-filters">
            <button
              type="button"
              className={`office-matrix__type-btn ${typeFilter === 'All' ? 'office-matrix__type-btn--active' : ''}`}
              onClick={() => setTypeFilter('All')}
            >
              All ({rows.length})
            </button>
            <button
              type="button"
              className={`office-matrix__type-btn ${typeFilter === 'Department' ? 'office-matrix__type-btn--active' : ''}`}
              onClick={() => setTypeFilter('Department')}
            >
              <MdBusiness style={{ marginRight: 4 }} />
              Offices & Departments ({deptCount})
            </button>
            <button
              type="button"
              className={`office-matrix__type-btn ${typeFilter === 'Hospital' ? 'office-matrix__type-btn--active' : ''}`}
              onClick={() => setTypeFilter('Hospital')}
            >
              <MdLocalHospital style={{ marginRight: 4 }} />
              Provincial Hospitals ({hospCount})
            </button>
          </div>

          {/* Date Range Filter */}
          <div className="office-matrix__date-filter-wrap">
            <MdFilterAlt className="office-matrix__date-filter-icon" />
            <div className="office-matrix__date-filter-group">
              <label className="office-matrix__date-filter-label">From</label>
              <input
                type="date"
                className="office-matrix__date-filter-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <span className="office-matrix__date-filter-separator">—</span>
            <div className="office-matrix__date-filter-group">
              <label className="office-matrix__date-filter-label">To</label>
              <input
                type="date"
                className="office-matrix__date-filter-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {hasDateFilter && (
              <button
                type="button"
                className="office-matrix__date-filter-clear"
                onClick={clearDateFilter}
                title="Clear date filter"
              >
                <MdClose />
              </button>
            )}
          </div>

          {/* As Of Date Display / Input */}
          <div className="office-matrix__date-wrap">
            <MdCalendarToday className="office-matrix__date-icon" />
            <span className="office-matrix__date-label">As of:</span>
            <input
              type="text"
              className="office-matrix__date-input"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              title="Click to edit As of Date"
            />
          </div>

          {/* Refresh Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchData()}
            disabled={isLoading}
            className="office-matrix__refresh-btn"
          >
            <MdRefresh className={`office-matrix__action-icon ${isLoading ? 'spinning' : ''}`} />
            Refresh
          </Button>

          {/* Generate Report Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsReportModalOpen(true)}
            className="office-matrix__report-btn"
          >
            <MdAssessment className="office-matrix__action-icon" />
            Generate Report
          </Button>
        </div>
      </Card>

      {/* Active Date Filter Indicator */}
      {hasDateFilter && (
        <div className="office-matrix__date-filter-active">
          <MdFilterAlt />
          <span>
            Showing document counts for:{' '}
            <strong>
              {dateFrom ? new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'All time'}
              {' — '}
              {dateTo ? new Date(dateTo + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Present'}
            </strong>
          </span>
          <button type="button" className="office-matrix__date-filter-active-clear" onClick={clearDateFilter}>
            Clear filter
          </button>
        </div>
      )}

      {/* Main Matrix Table */}
      <Card className="office-matrix__table-card">
        <div className="office-matrix__table-container">
          <table className="office-matrix__table">
            <thead>
              {/* Header Row 1: Section Category Spans */}
              <tr className="office-matrix__header-row-1">
                <th rowSpan={3} className="office-matrix__th-section office-matrix__th-office-top">
                  Office / Hospital
                </th>
                <th colSpan={5} className="office-matrix__th-section office-matrix__th-section--employees">
                  Number of Active Employees as of {asOfDate.toUpperCase() || '____________'}
                </th>
                <th colSpan={5} className="office-matrix__th-section office-matrix__th-section--pdf">
                  Position Description Form (PDF)
                </th>
                <th colSpan={5} className="office-matrix__th-section office-matrix__th-section--201">
                  201 File
                </th>
                <th rowSpan={3} className="office-matrix__th-section office-matrix__th-extra-top">
                  Remarks / Notes
                </th>
              </tr>

              {/* Header Row 2: Sub-group headers */}
              <tr className="office-matrix__header-row-2">
                {/* Under Number of Employees */}
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--regular">Regular</th>
                <th colSpan={3} className="office-matrix__th-col office-matrix__th-col--nonregular-parent">Non-Regular</th>
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--total-emp">Total</th>

                {/* Under Position Description Form (PDF) */}
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--pdf">Regular</th>
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--pdf">Casual</th>
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--pdf">Job Order</th>
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--pdf">Consultant</th>
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--pdf-total">Total PDF</th>

                {/* Under 201 File */}
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--201">Regular</th>
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--201">Casual</th>
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--201">Job Order</th>
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--201">Consultant</th>
                <th rowSpan={2} className="office-matrix__th-col office-matrix__th-col--201-total">Total 201 File</th>
              </tr>

              {/* Header Row 3: Non-Regular sub-columns (Employees only) */}
              <tr className="office-matrix__header-row-3">
                <th className="office-matrix__th-col office-matrix__th-col--casual">Casual</th>
                <th className="office-matrix__th-col office-matrix__th-col--joborder">Job Order</th>
                <th className="office-matrix__th-col office-matrix__th-col--consultant">Consultant</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row) => {
                const isHosp = row.type === 'Hospital';
                const pdfData = row.pdf || ZERO_COUNTS;

                return (
                  <tr key={row.abbreviation} className="office-matrix__tr">
                    {/* Office Abbreviation (Sticky) */}
                    <td className="office-matrix__td-office">
                      <div
                        className="office-matrix__office-badge-wrap"
                        title={row.name ? `${row.abbreviation} - ${row.name}` : row.abbreviation}
                      >
                        <span className="office-matrix__office-abbr">{row.abbreviation}</span>
                        <span
                          className={`office-matrix__office-type-tag ${
                            isHosp ? 'office-matrix__office-type-tag--hosp' : ''
                          }`}
                        >
                          {isHosp ? 'Hospital' : 'Office'}
                        </span>
                      </div>
                    </td>

                    {/* Number of Employees */}
                    <td className="office-matrix__td-num">{row.employees.regular || 0}</td>
                    <td className="office-matrix__td-num">{row.employees.casual || 0}</td>
                    <td className="office-matrix__td-num">{row.employees.jobOrder || 0}</td>
                    <td className="office-matrix__td-num">{row.employees.consultant || 0}</td>
                    <td className="office-matrix__td-num office-matrix__td-total-emp">
                      <strong>{row.employees.total.toLocaleString()}</strong>
                    </td>

                    {/* Position Description Form (PDF) */}
                    {renderCountCell(pdfData.regular, 'office-matrix__td-pdf-val')}
                    {renderCountCell(pdfData.casual, 'office-matrix__td-pdf-val')}
                    {renderCountCell(pdfData.jobOrder, 'office-matrix__td-pdf-val')}
                    {renderCountCell(pdfData.consultant, 'office-matrix__td-pdf-val')}
                    {renderTotalCell(pdfData.total, 'office-matrix__td-pdf-total')}

                    {/* 201 File */}
                    {renderCountCell(row.file201.regular, 'office-matrix__td-201-val')}
                    {renderCountCell(row.file201.casual, 'office-matrix__td-201-val')}
                    {renderCountCell(row.file201.jobOrder, 'office-matrix__td-201-val')}
                    {renderCountCell(row.file201.consultant, 'office-matrix__td-201-val')}
                    {renderTotalCell(row.file201.total, 'office-matrix__td-201-total')}

                    {/* Remarks / Notes (Fillable) */}
                    <td className="office-matrix__td-remarks">
                      <input
                        type="text"
                        className="office-matrix__remarks-input"
                        placeholder="Add remarks / notes..."
                        value={officeRemarks[row.abbreviation] !== undefined ? officeRemarks[row.abbreviation] : (row.remarks || '')}
                        onChange={(e) => handleRemarkChange(row.abbreviation, e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}

              {filteredRows.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={17} className="office-matrix__empty">
                    No offices or hospitals matching "{searchTerm}"
                  </td>
                </tr>
              )}
            </tbody>

            {/* Table Footer: Totals */}
            <tfoot>
              <tr className="office-matrix__tfoot-row">
                <td className="office-matrix__td-office office-matrix__td-office-total">
                  TOTAL
                </td>

                {/* Number of Employees Totals */}
                <td className="office-matrix__td-num office-matrix__td-foot-val">
                  {currentTotals.employees.regular.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-val">
                  {currentTotals.employees.casual.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-val">
                  {currentTotals.employees.jobOrder.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-val">
                  {currentTotals.employees.consultant.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-grand">
                  {currentTotals.employees.total.toLocaleString()}
                </td>

                {/* Position Description Form (PDF) Totals */}
                <td className="office-matrix__td-num office-matrix__td-foot-pdf">
                  {currentTotals.pdf.regular.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-pdf">
                  {currentTotals.pdf.casual.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-pdf">
                  {currentTotals.pdf.jobOrder.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-pdf">
                  {currentTotals.pdf.consultant.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-grand-pdf">
                  {currentTotals.pdf.total.toLocaleString()}
                </td>

                {/* 201 File Totals */}
                <td className="office-matrix__td-num office-matrix__td-foot-201">
                  {currentTotals.file201.regular.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-201">
                  {currentTotals.file201.casual.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-201">
                  {currentTotals.file201.jobOrder.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-201">
                  {currentTotals.file201.consultant.toLocaleString()}
                </td>
                <td className="office-matrix__td-num office-matrix__td-foot-grand-201">
                  {currentTotals.file201.total.toLocaleString()}
                </td>

                {/* Remarks Footer */}
                <td className="office-matrix__td-blank"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Scanning Summary Report Modal (View Format, Print, Export to Excel) */}
      <OfficeScanningReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        rows={reportRows}
        allRows={allReportRows}
        totals={currentTotals}
        allTotals={totals}
        asOfDate={asOfDate}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onRemarkChange={handleRemarkChange}
      />
    </div>
  );
}
