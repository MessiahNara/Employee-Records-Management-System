import React, { useState } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { useToast } from '../contexts/ToastContext';
import {
  MdFileDownload,
  MdCalendarToday,
  MdTableChart,
} from 'react-icons/md';
import generateScanningSummaryExcel, {
  ReportOfficeRow,
  ReportTotals,
} from '../utils/generateScanningSummaryExcel';
import { getOfficeFullName } from '../data/provincialOffices';
import './OfficeScanningReportModal.css';

interface OfficeScanningReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: ReportOfficeRow[];
  totals: ReportTotals;
  asOfDate?: string;
  dateFrom?: string;
  dateTo?: string;
  onRemarkChange?: (officeAbbr: string, value: string) => void;
}

export default function OfficeScanningReportModal({
  isOpen,
  onClose,
  rows,
  totals,
  asOfDate,
  dateFrom,
  dateTo,
  onRemarkChange,
}: OfficeScanningReportModalProps) {
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
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

  // Handle Export to Excel
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      showToast('Generating Excel report...', 'info');

      // Include fillable remarks in exported rows
      const exportRows = rows.map((r) => ({
        ...r,
        remarks: localRemarks[r.abbreviation] !== undefined ? localRemarks[r.abbreviation] : (r.remarks || ''),
      }));

      await generateScanningSummaryExcel({
        rows: exportRows,
        totals,
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
              Human Resource Management and Development Office<br />
              Provincial Government of Pangasinan<br />
              Complete Offices & Hospitals Scanning Status
            </div>
            <div className="scanning-report__as-of-badge">
              <MdCalendarToday className="scanning-report__as-of-icon" />
              <span>As of {formattedAsOf}</span>
              {dateFrom && dateTo && (
                <span className="scanning-report__date-filter-pill">
                  Filter: {dateFrom} to {dateTo}
                </span>
              )}
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
                    Number of Employees as of {formattedAsOf}
                  </th>
                  <th colSpan={5} className="scanning-report__th-group scanning-report__th-group--pdf">
                    Position Description Form (PDF)
                  </th>
                  <th colSpan={5} className="scanning-report__th-group scanning-report__th-group--201">
                    201 File
                  </th>
                  <th rowSpan={3} className="scanning-report__th-remarks">Remarks / Progress Notes</th>
                </tr>

                <tr className="scanning-report__th-row-2">
                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-emp-sub">Regular</th>
                  <th colSpan={3} className="scanning-report__th-col-parent scanning-report__th-emp-sub">Non-Regular</th>
                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-col--total scanning-report__th-emp-tot">Total</th>

                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-pdf-sub">Regular</th>
                  <th colSpan={3} className="scanning-report__th-col-parent scanning-report__th-pdf-sub">Non-Regular</th>
                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-col--total scanning-report__th-pdf-tot">Total</th>

                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-201-sub">Regular</th>
                  <th colSpan={3} className="scanning-report__th-col-parent scanning-report__th-201-sub">Non-Regular</th>
                  <th rowSpan={2} className="scanning-report__th-col scanning-report__th-col--total scanning-report__th-201-tot">Total</th>
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
                {rows.map((row, idx) => (
                  <tr key={row.abbreviation} className="scanning-report__tr">
                    <td className="scanning-report__td-no">{idx + 1}</td>
                    <td className="scanning-report__td-office">
                      <div className="scanning-report__office-cell">
                        <span className="scanning-report__office-name" title={getOfficeFullName(row.name || row.abbreviation)}>
                          {getOfficeFullName(row.name || row.abbreviation)}
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
                </tbody>

                <tfoot>
                  <tr className="scanning-report__tfoot-row">
                    <td className="scanning-report__td-no"></td>
                    <td className="scanning-report__td-office scanning-report__td-foot-title">TOTAL</td>

                    {/* Employees totals */}
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.employees.regular.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.employees.casual.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.employees.jobOrder.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.employees.consultant.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-grand">
                      {totals.employees.total.toLocaleString()}
                    </td>

                    {/* PDF totals */}
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.pdf.regular.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.pdf.casual.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.pdf.jobOrder.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.pdf.consultant.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-grand">
                      {totals.pdf.total.toLocaleString()}
                    </td>

                    {/* 201 totals */}
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.file201.regular.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.file201.casual.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.file201.jobOrder.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-val">
                      {totals.file201.consultant.toLocaleString()}
                    </td>
                    <td className="scanning-report__td-num scanning-report__td-foot-grand">
                      {totals.file201.total.toLocaleString()}
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
                {rows.length} Active {rows.length === 1 ? 'Office' : 'Offices'}
              </span>
            </div>
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
      </Modal>
    );
  }
