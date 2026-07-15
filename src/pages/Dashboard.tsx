import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate, useLocation } from 'react-router-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import Table, { Column } from '../components/ui/Table';
import SearchBar from '../components/ui/SearchBar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import SearchableDropdown from '../components/ui/SearchableDropdown';
import PermissionBanner from '../components/PermissionBanner';
import ImportModal from '../components/ImportModal';
import ExportButton from '../components/ExportButton';
import BackupButton from '../components/BackupButton';
import DownloadTemplateButton from '../components/DownloadTemplateButton';
import PasswordConfirmModal from '../components/ui/PasswordConfirmModal';
import BulkDownloadModal from '../components/BulkDownloadModal';
import { Employee, EmployeeFormData, AppointmentStatus, EmployeeStatus } from '../types/employee';
import { ImportedEmployee } from '../types/importExport';
import { generateImportTemplate } from '../utils/exportUtils';
import { getAuthState } from '../utils/mockAuth';
import { useToast } from '../contexts/ToastContext';
import { formatDateDDMMYYYY, convertToDateInputFormat, formatDateMDY } from '../utils/dateUtils';
import { MdEdit, MdDelete, MdFileUpload, MdPeople, MdCheckCircle, MdPause, MdDescription, MdStorage, MdQrCode, MdLock } from 'react-icons/md';
import api, { getServerBaseUrl } from '../services/api';
import PDFViewer from '../components/documents/PDFViewer';
import { bulkDownloadCodes } from '../utils/bulkDownloadCodes';
import './Dashboard.css';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type ReportSortDirection = 'asc' | 'desc';

interface ReportSortConfig {
  key: string;
  direction: ReportSortDirection;
}

interface ReportRow {
  id: string;
  employeeId: string;
  name: string;
  position: string;
  motherUnit: string;
  aoType: 'Detailed' | 'Designated' | '';
  assignedUnit: string;
  detailedOffice: string;
  designatedPositionFunction: string;
  durationFrom: string;
  durationTo: string;
  dateOfBirth: string;
  aoNumber: string;
  seriesNumber: string;
  birthMonthValue: string;
  aoOrderMonth: string;
  status: EmployeeStatus;
  rawEmployee: Employee;
  docId: string; // ID of the linked Administrative Order document (empty for audit-only rows)
}

const COLUMN_LABELS: Record<string, string> = {
  employeeId: 'Employment ID',
  name: 'Name of Employee',
  position: 'Position',
  motherUnit: 'Mother Unit',
  detailedOffice: 'Detailed/Transferred Office/Hospital',
  designatedPositionFunction: 'Designated Position/Function',
  durationFrom: 'Duration From',
  durationTo: 'Duration To',
  dateOfBirth: 'Date of Birth',
  administrativeOrder: 'Administrative Order No.',
};

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  employeeId: true,
  name: true,
  position: true,
  motherUnit: true,
  detailedOffice: true,
  designatedPositionFunction: true,
  durationFrom: true,
  durationTo: true,
  dateOfBirth: true,
  administrativeOrder: true,
};

const escapeXml = (unsafe: string) => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

const modifySheetXml = (xmlStr: string, title: string, rowsData: any[], aoStatus?: string) => {
  // ── Column header labels ──────────────────────────────────────────────────
  const officeHeader = aoStatus === 'Designated'
    ? 'Designated Office'
    : aoStatus === 'All Employees'
      ? 'Detailed/Designated Office/Hospital'
      : 'Detailed/Transferred Office/Hospital';

  const durationHeader = aoStatus === 'Designated'
    ? 'Duration of Designated Order'
    : 'Duration of Detailed Order';

  // ── Keep original column widths from the template (no changes) ────────────
  // Columns B–D share width 35.77, E=13.11, F=14.66, G=24.

  // ── Dynamic row-height helper ─────────────────────────────────────────────
  // Each data column has a fixed width in Excel units. We estimate how many
  // lines of text a value will wrap to and multiply by the single-line height.
  // Column widths (in Excel chars): B=35.77, C=35.77, D=35.77, G=24
  // Font is ~7pt; at that size, approx 1 Excel width unit ≈ 1 printable char.
  // Add a small buffer and take the max across all wrapped columns.
  const BASE_ROW_HT = 19.95;        // single-line row height (pt) from template
  const LINE_HT = 13.5;         // height per additional wrapped line (pt)
  const CHARS_B = 33;           // usable chars in col B (name) before wrap
  const CHARS_C = 33;           // usable chars in col C (mother unit)
  const CHARS_D = 33;           // usable chars in col D (office)
  const CHARS_G = 22;           // usable chars in col G (AO no.)

  const calcRowHt = (name: string, mother: string, office: string, ao: string): number => {
    const linesFor = (text: string, maxChars: number) =>
      text.length === 0 ? 1 : Math.ceil(text.length / maxChars);
    const lines = Math.max(
      linesFor(name, CHARS_B),
      linesFor(mother, CHARS_C),
      linesFor(office, CHARS_D),
      linesFor(ao, CHARS_G)
    );
    return lines <= 1 ? BASE_ROW_HT : BASE_ROW_HT + (lines - 1) * LINE_HT;
  };

  // ── Replace title cell A6 ─────────────────────────────────────────────────
  xmlStr = xmlStr.replace(
    /(<c r="A6"[^>]*>)([\s\S]*?)(<\/c>)/,
    `<c r="A6" s="39" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c>`
  );

  // ── Replace column headers D7 and E7 ─────────────────────────────────────
  xmlStr = xmlStr.replace(
    /(<c r="D7"[^>]*>)([\s\S]*?)(<\/c>)/,
    `<c r="D7" s="35" t="inlineStr"><is><t>${escapeXml(officeHeader)}</t></is></c>`
  );
  xmlStr = xmlStr.replace(
    /(<c r="E7"[^>]*>)([\s\S]*?)(<\/c>)/,
    `<c r="E7" s="39" t="inlineStr"><is><t>${escapeXml(durationHeader)}</t></is></c>`
  );

  // ── Page layout constants ─────────────────────────────────────────────────
  // Each page: 91 data rows (row 9–99 on page 1, then repeating blocks)
  // Within each page block:
  //   pos 0       → first row styles      (sA=6,  sBC=12, sD=13, sEF=14, sG=15)
  //   pos 1–14    → pre-divider rows      (sA=7,  sBC=16, sD=17, sEF=18, sG=19)
  //   pos 15      → mid-page divider      (sA=11, sBC=22, sD=23, sEF=24, sG=25)
  //   pos 16–57   → post-divider middle   (sA=7,  sBC=16, sD=17, sEF=18, sG=19)
  //   pos 58–88   → near-bottom rows      (sA=8,  sBC=16, sD=17, sEF=26, sG=19)
  //   pos 89      → penultimate row       (sA=9,  sBC=16, sD=17, sEF=27, sG=28)
  //   pos 90      → last row              (sA=10, sBC=29, sD=30, sEF=31, sG=32)
  // Total per page = 91 positions (pos 0–90), but pos 15 is the divider (no data)
  // So each page holds 90 data rows + 1 divider row

  const ROWS_PER_PAGE = 90; // actual data rows per page (divider row doesn't count)
  const DIVIDER_POS = 15;   // position within page block where divider row sits

  const formatDateMDYStr = (dateVal: any) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  };

  // Determine styles for a position within a page block
  const getStyles = (posInPage: number, totalInPage: number) => {
    if (posInPage === 0) return { sA: '6', sBC: '12', sD: '13', sEF: '14', sG: '15' };
    const last = totalInPage - 1; // last data position in this page
    const penul = totalInPage - 2;
    if (posInPage === last) return { sA: '10', sBC: '29', sD: '30', sEF: '31', sG: '32' };
    if (posInPage === penul) return { sA: '9', sBC: '16', sD: '17', sEF: '27', sG: '28' };
    if (posInPage >= 58) return { sA: '8', sBC: '16', sD: '17', sEF: '26', sG: '19' };
    return { sA: '7', sBC: '16', sD: '17', sEF: '18', sG: '19' };
  };

  // ── Extract XML before row 9 and after </sheetData> ───────────────────────
  const row9Start = xmlStr.indexOf('<row r="9"');
  if (row9Start === -1) return xmlStr;
  const sheetDataEnd = xmlStr.indexOf('</sheetData>');
  if (sheetDataEnd === -1) return xmlStr;

  // We'll also need the header rows 1–8 XML to repeat on subsequent pages
  // Extract rows 1–8 from the original XML
  const row9End = row9Start; // everything before row 9 is the header
  const headerRowsXml = xmlStr.substring(xmlStr.indexOf('<row r="1"'), row9End);

  const xmlBefore = xmlStr.substring(0, xmlStr.indexOf('<row r="1"'));
  const xmlAfterSheetData = xmlStr.substring(sheetDataEnd);

  // ── Build pages ───────────────────────────────────────────────────────────
  let newRowsXml = '';
  let globalRowNum = 9; // actual XML row number (increments continuously)
  let dataIdx = 0;      // index into rowsData
  let pageNum = 0;

  while (dataIdx < rowsData.length) {
    // Slice data for this page
    const pageData = rowsData.slice(dataIdx, dataIdx + ROWS_PER_PAGE);
    const pageCount = pageData.length;

    // For page 2+, re-emit the header rows with updated row numbers
    if (pageNum > 0) {
      // Re-emit rows 1–8 shifted to current globalRowNum
      // We just rebuild the 8 header rows manually using the known styles
      const headerStart = globalRowNum;
      // Rows 1–5: header info rows
      const headerTexts = [
        'Republic of the Philippines',
        'Province of Pangasinan',
        'Lingayen',
        'HUMAN RESOURCE MGT. &amp; DEVELOPMENT OFFICE',
        ''
      ];
      newRowsXml += `<row r="${headerStart}" spans="1:12" ht="15" customHeight="1" x14ac:dyDescent="0.25"><c r="A${headerStart}" s="37" t="inlineStr"><is><t>${headerTexts[0]}</t></is></c><c r="B${headerStart}" s="37"/><c r="C${headerStart}" s="37"/><c r="D${headerStart}" s="37"/><c r="E${headerStart}" s="37"/><c r="F${headerStart}" s="37"/><c r="G${headerStart}" s="37"/></row>`;
      for (let h = 1; h <= 4; h++) {
        const rn = headerStart + h;
        const sty = h === 4 ? '38' : '38';
        const txt = headerTexts[h];
        const thickBot = h === 4 ? ' thickBot="1"' : '';
        newRowsXml += `<row r="${rn}" spans="1:12" ht="15" customHeight="1"${thickBot} x14ac:dyDescent="0.25"><c r="A${rn}" s="${sty}" t="inlineStr"><is><t>${escapeXml(txt)}</t></is></c><c r="B${rn}" s="${sty}"/><c r="C${rn}" s="${sty}"/><c r="D${rn}" s="${sty}"/><c r="E${rn}" s="${sty}"/><c r="F${rn}" s="${sty}"/><c r="G${rn}" s="${sty}"/></row>`;
      }
      globalRowNum += 5;

      // Title row (A6 equivalent)
      newRowsXml += `<row r="${globalRowNum}" spans="1:12" ht="25.05" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A${globalRowNum}" s="39" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c><c r="B${globalRowNum}" s="40"/><c r="C${globalRowNum}" s="40"/><c r="D${globalRowNum}" s="40"/><c r="E${globalRowNum}" s="40"/><c r="F${globalRowNum}" s="40"/><c r="G${globalRowNum}" s="41"/></row>`;
      globalRowNum++;

      // Column header row 7
      newRowsXml += `<row r="${globalRowNum}" spans="1:12" ht="12.75" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A${globalRowNum}" s="35" t="inlineStr"><is><t>NO.</t></is></c><c r="B${globalRowNum}" s="35" t="inlineStr"><is><t>Name of Employee</t></is></c><c r="C${globalRowNum}" s="35" t="inlineStr"><is><t>Mother Unit</t></is></c><c r="D${globalRowNum}" s="35" t="inlineStr"><is><t>${escapeXml(officeHeader)}</t></is></c><c r="E${globalRowNum}" s="39" t="inlineStr"><is><t>${escapeXml(durationHeader)}</t></is></c><c r="F${globalRowNum}" s="42"/><c r="G${globalRowNum}" s="35" t="inlineStr"><is><t>Administrative Order No.</t></is></c></row>`;
      globalRowNum++;

      // Sub-header row 8 (From / To)
      newRowsXml += `<row r="${globalRowNum}" spans="1:12" ht="21" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A${globalRowNum}" s="36"/><c r="B${globalRowNum}" s="36"/><c r="C${globalRowNum}" s="36"/><c r="D${globalRowNum}" s="36"/><c r="E${globalRowNum}" s="5" t="inlineStr"><is><t>From</t></is></c><c r="F${globalRowNum}" s="5" t="inlineStr"><is><t>To</t></is></c><c r="G${globalRowNum}" s="36"/></row>`;
      globalRowNum++;
    }

    // Emit data rows for this page
    let posInPage = 0; // tracks position within page (skips divider)
    for (let i = 0; i < pageCount; i++) {
      // Insert divider row at position DIVIDER_POS
      if (posInPage === DIVIDER_POS) {
        newRowsXml += `<row r="${globalRowNum}" spans="1:26" ht="19.95" customHeight="1" x14ac:dyDescent="0.25"><c r="A${globalRowNum}" s="11"/><c r="B${globalRowNum}" s="22"/><c r="C${globalRowNum}" s="22"/><c r="D${globalRowNum}" s="23"/><c r="E${globalRowNum}" s="24"/><c r="F${globalRowNum}" s="24"/><c r="G${globalRowNum}" s="25"/></row>`;
        globalRowNum++;
        posInPage++;
      }

      const row = pageData[i];
      const st = getStyles(posInPage === 0 && i === 0 ? 0 : posInPage, pageCount + (pageCount >= DIVIDER_POS ? 1 : 0));

      const noVal = String(dataIdx + i + 1);
      const nameVal = row.name || '';
      const motherVal = row.motherUnit || '';
      const officeVal = row.detailedOffice || '';
      const fromVal = formatDateMDYStr(row.durationFrom);
      const toVal = formatDateMDYStr(row.durationTo);
      const aoVal = row.aoNumber ? `AO ${row.aoNumber}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}` : '';

      const rowHt = calcRowHt(nameVal, motherVal, officeVal, aoVal);

      newRowsXml += `<row r="${globalRowNum}" spans="1:12" ht="${rowHt}" customHeight="1" x14ac:dyDescent="0.25">`;
      newRowsXml += `<c r="A${globalRowNum}" s="${st.sA}" t="inlineStr"><is><t>${escapeXml(noVal)}</t></is></c>`;
      newRowsXml += `<c r="B${globalRowNum}" s="${st.sBC}" t="inlineStr"><is><t>${escapeXml(nameVal)}</t></is></c>`;
      newRowsXml += `<c r="C${globalRowNum}" s="${st.sBC}" t="inlineStr"><is><t>${escapeXml(motherVal)}</t></is></c>`;
      newRowsXml += `<c r="D${globalRowNum}" s="${st.sD}" t="inlineStr"><is><t>${escapeXml(officeVal)}</t></is></c>`;
      newRowsXml += `<c r="E${globalRowNum}" s="${st.sEF}" t="inlineStr"><is><t>${escapeXml(fromVal)}</t></is></c>`;
      newRowsXml += `<c r="F${globalRowNum}" s="${st.sEF}" t="inlineStr"><is><t>${escapeXml(toVal)}</t></is></c>`;
      newRowsXml += `<c r="G${globalRowNum}" s="${st.sG}" t="inlineStr"><is><t>${escapeXml(aoVal)}</t></is></c>`;
      newRowsXml += `</row>`;

      globalRowNum++;
      posInPage++;
    }

    dataIdx += ROWS_PER_PAGE;
    pageNum++;

    // Emit signature rows after each page's data
    for (let s = 0; s < 13; s++) {
      newRowsXml += `<row r="${globalRowNum}" spans="3:7" ht="12.75" customHeight="1" x14ac:dyDescent="0.25"><c r="C${globalRowNum}" s="3"/><c r="D${globalRowNum}" s="3"/><c r="G${globalRowNum}" s="4"/></row>`;
      globalRowNum++;
    }
  }

  // ── Rebuild mergeCells for all pages ─────────────────────────────────────
  // The original mergeCells only covers page 1. We need to add merges for all
  // repeated header blocks on pages 2+.
  // Page 1 merges are already in the template; pages 2+ need the same pattern
  // offset by their header start row.
  const baseMerges = [
    'A1:G1', 'A2:G2', 'A3:G3', 'A4:G4', 'A5:G5', 'A6:G6',
    'A7:A8', 'B7:B8', 'C7:C8', 'D7:D8', 'E7:F7', 'G7:G8'
  ];

  const allMerges = [...baseMerges]; // page 1 merges

  // Note: for the merge cells we calculate from page 2 onwards
  // using the known offset pattern
  // Page 2 starts at row 9 + (90+1 data+divider rows) + 13 sig rows = 9 + 91 + 13 = 113
  for (let p = 1; p < pageNum; p++) {
    const offset = p * (91 + 8 + 13); // 91=data+divider, 8=header rows, 13=sig
    allMerges.push(
      `A${1 + offset}:G${1 + offset}`,
      `A${2 + offset}:G${2 + offset}`,
      `A${3 + offset}:G${3 + offset}`,
      `A${4 + offset}:G${4 + offset}`,
      `A${5 + offset}:G${5 + offset}`,
      `A${6 + offset}:G${6 + offset}`,
      `A${7 + offset}:A${8 + offset}`,
      `B${7 + offset}:B${8 + offset}`,
      `C${7 + offset}:C${8 + offset}`,
      `D${7 + offset}:D${8 + offset}`,
      `E${7 + offset}:F${7 + offset}`,
      `G${7 + offset}:G${8 + offset}`
    );
  }

  const mergeCellsXml = `<mergeCells count="${allMerges.length}">${allMerges.map(r => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`;

  // Replace existing mergeCells block
  const newXml = xmlBefore + headerRowsXml + newRowsXml + `</sheetData>` +
    xmlAfterSheetData
      .replace(/<mergeCells[\s\S]*?<\/mergeCells>/, mergeCellsXml)
      .replace('</sheetData>', ''); // already added above

  return newXml;
};

function Dashboard() {
  const navigate = useNavigate();
  const { showToast, showWelcomeToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilterType, setSearchFilterType] = useState<'all' | 'first_name' | 'middle_name' | 'last_name' | 'id'>('all');
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState(false);
  const [isUpdateEmployeeModalOpen, setIsUpdateEmployeeModalOpen] = useState(false);
  const [isUpdateConfirmModalOpen, setIsUpdateConfirmModalOpen] = useState(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportSyncConfirmModalOpen, setIsImportSyncConfirmModalOpen] = useState(false);
  const [isBulkDownloadModalOpen, setIsBulkDownloadModalOpen] = useState(false);
  const [isBulkDownloadLoading, setIsBulkDownloadLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [aoFile, setAoFile] = useState<File | null>(null);
  const [autoRename, setAutoRename] = useState(false);
  const [pendingUpdatePayload, setPendingUpdatePayload] = useState<{ employeeId: string; changedFields: any } | null>(null);
  const [pendingImportEmployees, setPendingImportEmployees] = useState<ImportedEmployee[] | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [originalEmployeeData, setOriginalEmployeeData] = useState<EmployeeFormData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]); // For KPI cards - always shows all data
  const [isLoading, setIsLoading] = useState(false);
  const [showAllEmployees, setShowAllEmployees] = useState(false);

  // Generated Reports UI states
  const location = useLocation();
  const viewMode = location.pathname.startsWith('/reports') ? 'reports' : 'employees';
  const [reportAoStatus, setReportAoStatus] = useState<'Detailed' | 'Designated' | 'All Employees'>('All Employees');
  const [reportSearchName, setReportSearchName] = useState('');
  const [reportMotherUnit, setReportMotherUnit] = useState('all');
  const [reportDetailedOffice, setReportDetailedOffice] = useState('all');
  const [reportDesignatedPosition, setReportDesignatedPosition] = useState('all');
  const [isReportPreviewOpen, setIsReportPreviewOpen] = useState(false);
  const [reportAoNumber, setReportAoNumber] = useState('');
  const [reportAoYear, setReportAoYear] = useState('');
  const [reportActiveTab, setReportActiveTab] = useState<'active' | 'inactive' | 'expiring' | 'expired'>('active');
  const [reportAoOrderMonthFrom, setReportAoOrderMonthFrom] = useState('');
  const [reportAoOrderMonthTo, setReportAoOrderMonthTo] = useState('');
  const [reportSortPriority, setReportSortPriority] = useState<ReportSortConfig[]>([]);
  const [employeeAuditLogs, setEmployeeAuditLogs] = useState<any[]>([]);
  const [selectedReportRowIds, setSelectedReportRowIds] = useState<Set<string>>(new Set());
  const [isDeleteReportConfirmOpen, setIsDeleteReportConfirmOpen] = useState(false);
  const [pendingDeleteReportIds, setPendingDeleteReportIds] = useState<string[]>([]);
  const [isDeletingReport, setIsDeletingReport] = useState(false);

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('report_visible_columns');
      return saved ? JSON.parse(saved) : DEFAULT_VISIBLE_COLUMNS;
    } catch {
      return DEFAULT_VISIBLE_COLUMNS;
    }
  });
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsColumnDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [reportCurrentPage, setReportCurrentPage] = useState(1);
  const [reportItemsPerPage, setReportItemsPerPage] = useState(10);

  useEffect(() => {
    setReportCurrentPage(1);
  }, [
    reportAoStatus,
    reportSearchName,
    reportMotherUnit,
    reportDetailedOffice,
    reportDesignatedPosition,
    reportAoNumber,
    reportAoYear,
    reportAoOrderMonthFrom,
    reportAoOrderMonthTo,
    reportActiveTab,
  ]);

  const [formData, setFormData] = useState<EmployeeFormData>({
    id: '',
    lastName: '',
    firstName: '',
    middleName: '',
    dateOfBirth: '',
    gender: '',
    officeHospitalName: '',
    appointmentStatus: '',
    appointmentFrom: '',
    appointmentTo: '',
    aoNumber: '',
    aoYear: '',
    aoType: '',
    status: 'Active',
    positionFunction: '',
    dateOfEmployment: '',
    dateOfSeparation: '',
    reasonForSeparation: '',
    motherUnit: '',
    detailedTo: '',
    detailedDivision: '',
    designatedPositionFunction: '',
    designatedOrderFrom: '',
    designatedOrderTo: '',
    fileboxLocation: '',
    file201Status: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof EmployeeFormData, string>>>({});

  // Get current user permissions
  const currentUser = getAuthState();
  const userRole = currentUser?.role || '';
  const canDownloadOrPrint = userRole === 'superadmin' || userRole === 'developer' || userRole === 'admin';
  const [selectedReportDocument, setSelectedReportDocument] = useState<any>(null);
  const [reportPdfData, setReportPdfData] = useState<string | null>(null);
  const [isReportViewerOpen, setIsReportViewerOpen] = useState(false);

  // Dynamic dropdown options loaded from system settings
  const [dropdownOptions, setDropdownOptions] = useState<{
    appointmentStatuses: string[];
    officeNames: string[];
    positions: string[];
    aoYears: string[];
    reasonsForSeparation: string[];
  }>({ appointmentStatuses: [], officeNames: [], positions: [], aoYears: [], reasonsForSeparation: [] });

  const fetchDropdownOptions = useCallback(async () => {
    try {
      const s = await api.systemSettings.get();
      setDropdownOptions({
        appointmentStatuses: s.appointmentStatuses ?? [],
        officeNames: s.officeNames ?? [],
        positions: s.positions ?? [],
        aoYears: s.aoYears ?? [],
        reasonsForSeparation: s.reasonsForSeparation ?? [],
      });
    } catch (err) {
      console.error('Failed to fetch dropdown options:', err);
    }
  }, []);

  useEffect(() => {
    fetchDropdownOptions();
  }, [fetchDropdownOptions]);

  // For superadmin and admin, they have all permissions
  // For superadmin, they have all permissions
  // For admin and staff, use their individual permissions from the database
  const getCurrentUserPermissions = () => {
    if (userRole === 'superadmin' || userRole === 'developer') {
      return { create: true, read: true, update: true, delete: true };
    }

    // For admin and staff, get permissions from the logged-in user's data
    if ((userRole === 'admin' || userRole === 'staff') && currentUser?.permissions) {
      return currentUser.permissions;
    }

    // Default: read-only
    return { create: false, read: true, update: false, delete: false };
  };

  const userPermissions = getCurrentUserPermissions();
  const canCreate = userPermissions.create;
  const canUpdate = userPermissions.update;
  const canDelete = userPermissions.delete;
  const canRead = userPermissions.read;

  // Show welcome toast on first load after login
  useEffect(() => {
    const justLoggedIn = sessionStorage.getItem('justLoggedIn');
    if (justLoggedIn === 'true' && currentUser) {
      // Clear the flag
      sessionStorage.removeItem('justLoggedIn');

      // Show welcome toast
      showWelcomeToast(currentUser.firstName, currentUser.lastName);
    }
  }, [currentUser, showWelcomeToast]);

  // Persist showAllEmployees state to localStorage
  useEffect(() => {
    localStorage.setItem('showAllEmployees', showAllEmployees.toString());
  }, [showAllEmployees]);

  // Fetch all employees for KPI cards on initial load
  useEffect(() => {
    fetchAllEmployeesForKPI();
    fetchEmployeeAuditLogs();
  }, []);

  // Fetch all employees for KPI cards (no filters)
  const fetchAllEmployeesForKPI = async () => {
    try {
      const data = await api.employee.getAll({}); // No filters - get all employees
      setAllEmployees(data);
    } catch (error) {
      console.error('Error fetching all employees for KPI:', error);
      // Don't show error toast for KPI fetch to avoid confusion
    }
  };

  // Debounced search effect
  useEffect(() => {
    // Only fetch if there's a search query OR showAllEmployees is true
    if (searchQuery.trim() || showAllEmployees) {
      const timeoutId = setTimeout(() => {
        fetchEmployees();
      }, 300); // 300ms debounce

      return () => clearTimeout(timeoutId);
    } else {
      // Clear employees when search is empty and not showing all
      setEmployees([]);
      setIsLoading(false);
    }
  }, [searchQuery, searchFilterType, statusFilter, showAllEmployees]);

  const fetchEmployeeAuditLogs = async () => {
    try {
      const logs = await api.audit.getAll({ entity: 'employee', action: 'update', limit: 10000 });
      setEmployeeAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (error) {
      console.error('Error fetching employee audit logs:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      setIsLoading(true);
      const filters: any = {};

      // Add status filter
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }

      // Add search filter
      if (searchQuery.trim()) {
        filters.search = searchQuery.trim();
        filters.filter_type = searchFilterType;
      }

      const data = await api.employee.getAll(filters);
      setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      showToast('Failed to load employees. Please check if the backend server is running.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter employees based on search and filters (now handled by backend)
  const filteredEmployees = useMemo(() => {
    // Since filtering is now done on the backend, just return employees
    // But keep position and office filtering on frontend for now
    return employees.filter((employee) => {
      if (searchQuery.trim()) {
        // Additional frontend filtering for position and office
        const matchesPosition = employee.positionFunction.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesOffice = employee.officeHospitalName.toLowerCase().includes(searchQuery.toLowerCase());

        // If searching globally, also check position and office
        if (searchFilterType === 'all' && (matchesPosition || matchesOffice)) {
          return true;
        }
      }

      return true;
    });
  }, [searchQuery, searchFilterType, employees]);

  // Paginate employees
  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredEmployees.slice(startIndex, endIndex);
  }, [filteredEmployees, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);

  const reportRows = useMemo<ReportRow[]>(() => {
    // Determine AO type from the DB-persisted aoType field first,
    // then fall back to isDetailed flag, then check designated fields.
    const inferAoType = (data: any): ReportRow['aoType'] => {
      const rawAoType = String(data.aoType || '').trim().toLowerCase();
      if (rawAoType === 'detailed') return 'Detailed';
      if (rawAoType === 'designated') return 'Designated';
      // Legacy: isDetailed boolean stored before aoType column existed
      if (data.isDetailed === true) return 'Detailed';
      // Legacy: designated fields present without aoType
      if (
        String(data.designatedPositionFunction || '').trim() ||
        String(data.designatedOrderFrom || '').trim() ||
        String(data.designatedOrderTo || '').trim()
      ) return 'Designated';
      return '';
    };

    const buildRow = (source: any, suffix: string, docId = '', docSource?: any): ReportRow => {
      const birthDate = source.dateOfBirth ? new Date(source.dateOfBirth) : null;
      const birthMonthValue = birthDate ? String(birthDate.getMonth() + 1).padStart(2, '0') : '';

      // If we have a docSource with specific AO details, merge them so they override employee fields.
      const isCurrentAo = !docSource || !docSource.aoNumber || !source.aoNumber ||
        String(docSource.aoNumber || '').trim() === String(source.aoNumber || '').trim();

      const activeSource = docSource
        ? {
          ...source,
          aoNumber: docSource.aoNumber || source.aoNumber,
          aoYear: docSource.aoYear || (isCurrentAo ? source.aoYear : ''),
          aoType: docSource.aoType || (isCurrentAo ? source.aoType : ''),
          detailedTo: docSource.detailedTo || (isCurrentAo ? source.detailedTo : ''),
          detailedDivision: docSource.detailedDivision || (isCurrentAo ? source.detailedDivision : ''),
          detailedFunction: docSource.detailedFunction || (isCurrentAo ? source.detailedFunction : ''),
          detailedDate: docSource.detailedDate || (isCurrentAo ? source.detailedDate : null),
          designatedPositionFunction: docSource.designatedPositionFunction || (isCurrentAo ? source.designatedPositionFunction : ''),
          designatedOrderFrom: docSource.designatedOrderFrom || (isCurrentAo ? source.designatedOrderFrom : null),
          designatedOrderTo: docSource.designatedOrderTo || (isCurrentAo ? source.designatedOrderTo : null),
          appointmentFrom: docSource.appointmentFrom || (isCurrentAo ? source.appointmentFrom : null),
          appointmentTo: docSource.appointmentTo || (isCurrentAo ? source.appointmentTo : null),
        }
        : source;

      const aoType = inferAoType(activeSource);

      // Detailed: duration = appointmentFrom / appointmentTo
      // Designated: duration = designatedOrderFrom / designatedOrderTo
      const durationFrom = aoType === 'Detailed'
        ? String(activeSource.appointmentFrom || '').trim()
        : String(activeSource.designatedOrderFrom || '').trim();
      const durationTo = aoType === 'Detailed'
        ? String(activeSource.appointmentTo || '').trim()
        : String(activeSource.designatedOrderTo || '').trim();

      const aoOrderMonth = durationFrom
        ? String(new Date(durationFrom).getMonth() + 1).padStart(2, '0')
        : '';

      const dateOfBirth = birthDate ? formatDateDDMMYYYY(source.dateOfBirth) : '-';

      // Mother unit = Office/Hospital Name (employment information) — the primary source
      const motherUnit = source.officeHospitalName || source.officeName || source.motherUnit || '';

      // position / positionFunction — the API maps position → positionFunction, but
      // audit log oldValues store the raw DB column name "position"
      const position = source.positionFunction || source.position || '';

      return {
        id: `${source.id}-${suffix}`,
        employeeId: source.id,
        name: `${source.lastName}, ${source.firstName} ${source.middleName || ''}`.trim(),
        position,
        motherUnit,
        aoType,
        assignedUnit: motherUnit || '-',
        detailedOffice: String(activeSource.detailedTo || '').trim(),
        designatedPositionFunction: String(activeSource.designatedPositionFunction || '').trim(),
        durationFrom,
        durationTo,
        dateOfBirth,
        aoNumber: String(activeSource.aoNumber || '').trim(),
        seriesNumber: String(activeSource.aoYear || activeSource.seriesNumber || ''),
        birthMonthValue,
        aoOrderMonth,
        status: source.status,
        rawEmployee: source,
        docId,
      };
    };

    // Current records — one row per Administrative Order document on the employee.
    // This way each AO document is its own entry in the report table.
    const currentRows: ReportRow[] = [];
    allEmployees.forEach((emp) => {
      const docs = (emp as any).documents || [];
      const aoDocs = docs.filter((d: any) => d.category === 'Administrative Order');
      if (aoDocs.length === 0) return;

      aoDocs.forEach((doc: any) => {
        // Build the row prioritizing fields from the document itself if present,
        // and falling back to employee fields.
        const row = buildRow(emp, `doc-${doc.id}`, doc.id, doc);
        // Only include if there's an AO number and a valid AO type
        if (row.aoNumber || row.aoType) {
          currentRows.push(row);
        }
      });
    });

    // Group logs by employee ID to chronologically reconstruct their state backwards
    const logsByEmployee: Record<string, typeof employeeAuditLogs> = {};
    employeeAuditLogs.forEach((log) => {
      const empId = String(log.entityId || '');
      if (!logsByEmployee[empId]) {
        logsByEmployee[empId] = [];
      }
      logsByEmployee[empId].push(log);
    });

    const auditRows: ReportRow[] = [];

    Object.entries(logsByEmployee).forEach(([empId, logs]) => {
      const emp = allEmployees.find((item) => item.id === empId);
      if (!emp) return;

      // Exclude employee historical records if they no longer have an active Administrative Order document
      const docs = (emp as any).documents || [];
      const hasAoDoc = docs.some((d: any) => d.category === 'Administrative Order');
      if (!hasAoDoc) return;

      // Sort logs by createdAt descending (newest first)
      const sortedLogs = [...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Start state is the current employee state
      let currentState = { ...emp };

      sortedLogs.forEach((log) => {
        const changed: string[] = Array.isArray(log.metadata?.changedFields)
          ? log.metadata?.changedFields
          : [];

        const aoFields = [
          'aoNumber', 'aoType', 'detailedTo', 'appointmentFrom', 'appointmentTo',
          'designatedPositionFunction', 'designatedOrderFrom', 'designatedOrderTo',
          'aoYear', 'seriesNumber'
        ];

        const isAoLog = changed.some((f) => aoFields.includes(f)) && log.metadata?.oldValues;

        // Apply oldValues to currentState to get the state BEFORE this log
        const oldValues = log.metadata?.oldValues || {};
        const previousState = { ...currentState, ...oldValues };

        if (isAoLog) {
          const row = buildRow(previousState, `audit-${log.id}`);

          const prevAoNumber = String(previousState.aoNumber || '').trim();
          const currAoNumber = String(emp.aoNumber || '').trim();

          // Skip if the previous state had no AO number
          if (!prevAoNumber) {
            currentState = previousState;
            return;
          }

          // Skip if the previous AO number is identical to the current one
          // (update touched AO fields but didn't actually change the AO assignment)
          if (prevAoNumber === currAoNumber) {
            currentState = previousState;
            return;
          }

          // Skip if the previous AO number matches any current document on this employee
          // (meaning it's already represented as a currentRow)
          const empDocs = (emp as any).documents || [];
          const alreadyCurrentDoc = empDocs.some((d: any) => {
            return d.category === 'Administrative Order' &&
              String(d.aoNumber || '').trim() === prevAoNumber &&
              String(d.aoYear || '').trim() === String(previousState.aoYear || '').trim();
          });
          if (alreadyCurrentDoc) {
            currentState = previousState;
            return;
          }

          // Skip if identical to the current employee state in every AO-relevant way
          if (
            prevAoNumber === currAoNumber &&
            row.aoType === inferAoType(emp) &&
            row.detailedOffice === String((emp as any).detailedTo || '').trim() &&
            row.designatedPositionFunction === String((emp as any).designatedPositionFunction || '').trim()
          ) {
            currentState = previousState;
            return;
          }

          auditRows.push({ ...row, status: emp.status });
        }

        // Update currentState pointer to move backwards in time
        currentState = previousState;
      });
    });

    // Deduplicate:
    // - currentRows are already unique by docId — keep all of them
    // - Two different employees sharing the same AO number is valid — always keep both
    // - For auditRows, only drop a row if an identical entry already exists for the
    //   same employee (same employeeId + aoNumber + seriesNumber + aoType + offices)
    const seenAuditKeys = new Set<string>();
    const dedupedAuditRows: ReportRow[] = [];

    for (const row of auditRows) {
      const key = `${row.employeeId}|${row.aoNumber}|${row.seriesNumber}|${row.aoType}|${row.detailedOffice}|${row.designatedPositionFunction}`;
      if (!seenAuditKeys.has(key)) {
        seenAuditKeys.add(key);
        dedupedAuditRows.push(row);
      }
    }

    return [...currentRows, ...dedupedAuditRows];
  }, [allEmployees, employeeAuditLogs]);

  const uniqueDetailedOfficesInDatabase = useMemo(() => {
    const offices = allEmployees.map(emp => emp.detailedTo).filter(Boolean);
    return [...new Set(offices)].sort();
  }, [allEmployees]);

  const uniqueDesignatedPositionsInDatabase = useMemo(() => {
    const positions = allEmployees.map(emp => (emp as any).designatedPositionFunction).filter(Boolean);
    return [...new Set(positions)].sort();
  }, [allEmployees]);

  const uniqueMotherUnitsInDatabase = useMemo(() => {
    const motherUnits = allEmployees.flatMap(emp => [(emp as any).motherUnit, emp.officeHospitalName]).filter(Boolean);
    return [...new Set(motherUnits)].sort();
  }, [allEmployees]);

  const filteredReportRows = useMemo(() => {
    return reportRows.filter((row) => {
      if (reportAoStatus === 'Detailed' && row.aoType !== 'Detailed') return false;
      if (reportAoStatus === 'Designated' && row.aoType !== 'Designated') return false;

      if (reportSearchName.trim()) {
        const query = reportSearchName.toLowerCase().trim();
        if (!row.name.toLowerCase().includes(query)) return false;
      }

      if (reportMotherUnit !== 'all') {
        const query = reportMotherUnit.toLowerCase();
        const matchesMotherUnit = row.motherUnit.toLowerCase() === query;
        const matchesOfficeHospitalName = row.rawEmployee && row.rawEmployee.officeHospitalName && row.rawEmployee.officeHospitalName.toLowerCase() === query;
        const matchesRawMotherUnit = row.rawEmployee && (row.rawEmployee as any).motherUnit && (row.rawEmployee as any).motherUnit.toLowerCase() === query;
        if (!matchesMotherUnit && !matchesOfficeHospitalName && !matchesRawMotherUnit) return false;
      }

      if (reportDetailedOffice !== 'all') {
        if (row.aoType === 'Detailed' && row.detailedOffice.toLowerCase() !== reportDetailedOffice.toLowerCase()) return false;
      }

      if (reportDesignatedPosition !== 'all') {
        if (row.aoType === 'Designated' && row.designatedPositionFunction.toLowerCase() !== reportDesignatedPosition.toLowerCase()) return false;
      }

      if (reportAoNumber.trim()) {
        if (!row.aoNumber.toLowerCase().includes(reportAoNumber.toLowerCase().trim())) return false;
      }

      if (reportAoYear.trim()) {
        if (!row.seriesNumber.toLowerCase().includes(reportAoYear.toLowerCase().trim())) return false;
      }

      if (reportAoOrderMonthFrom || reportAoOrderMonthTo) {
        const from = reportAoOrderMonthFrom ? parseInt(reportAoOrderMonthFrom, 10) : 1;
        const to = reportAoOrderMonthTo ? parseInt(reportAoOrderMonthTo, 10) : 12;
        if (!row.aoOrderMonth) return false;
        const monthValue = parseInt(row.aoOrderMonth, 10);
        if (from <= to) {
          if (monthValue < from || monthValue > to) return false;
        } else if (monthValue < from && monthValue > to) {
          return false;
        }
      }

      return true;
    });
  }, [reportRows, reportAoStatus, reportSearchName, reportMotherUnit, reportDetailedOffice, reportDesignatedPosition, reportAoNumber, reportAoYear, reportAoOrderMonthFrom, reportAoOrderMonthTo]);

  const getReportSortValue = (row: ReportRow, field: string) => {
    switch (field) {
      case 'employeeId':
        return row.employeeId || '';
      case 'name':
        return row.name || '';
      case 'position':
        return row.position || '';
      case 'motherUnit':
        return row.motherUnit || '';
      case 'assignedUnit':
        return row.assignedUnit || '';
      case 'detailedOffice':
        return row.detailedOffice || '';
      case 'designatedPositionFunction':
        return row.designatedPositionFunction || '';
      case 'durationFrom':
        return row.durationFrom || '';
      case 'durationTo':
        return row.durationTo || '';
      case 'dateOfBirth':
        return row.dateOfBirth || '';
      case 'aoNumber':
        return `${row.aoNumber ? `AO ${row.aoNumber}` : ''}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}`.trim();
      default:
        return '';
    }
  };

  const sortedReportRows = useMemo(() => {
    if (reportSortPriority.length === 0) return filteredReportRows;

    return [...filteredReportRows].sort((a, b) => {
      for (const sort of reportSortPriority) {
        const valueA = getReportSortValue(a, sort.key);
        const valueB = getReportSortValue(b, sort.key);
        const comparison = String(valueA || '').localeCompare(String(valueB || ''), undefined, { sensitivity: 'base' });
        if (comparison !== 0) {
          return sort.direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  }, [filteredReportRows, reportSortPriority]);

  const isNearExpiration = (durationTo: string) => {
    if (!durationTo) return false;
    const expDate = new Date(durationTo);
    if (isNaN(expDate.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(today.getDate() + 30);
    expDate.setHours(0, 0, 0, 0);
    return expDate >= today && expDate <= thirtyDaysLater;
  };

  const isExpired = (durationTo: string) => {
    if (!durationTo) return false;
    const expDate = new Date(durationTo);
    if (isNaN(expDate.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expDate.setHours(0, 0, 0, 0);
    return expDate < today;
  };

  const reportsForActiveTab = useMemo(() => {
    if (reportActiveTab === 'active') {
      return sortedReportRows.filter((row) => row.status === 'Active');
    } else if (reportActiveTab === 'inactive') {
      return sortedReportRows.filter((row) => row.status === 'Inactive');
    } else if (reportActiveTab === 'expiring') {
      return sortedReportRows.filter((row) => isNearExpiration(row.durationTo));
    } else {
      return sortedReportRows.filter((row) => isExpired(row.durationTo));
    }
  }, [sortedReportRows, reportActiveTab]);

  const reportTotalPages = Math.ceil(reportsForActiveTab.length / reportItemsPerPage);

  const paginatedReports = useMemo(() => {
    const startIndex = (reportCurrentPage - 1) * reportItemsPerPage;
    return reportsForActiveTab.slice(startIndex, startIndex + reportItemsPerPage);
  }, [reportsForActiveTab, reportCurrentPage, reportItemsPerPage]);

  const handleReportSort = (field: string) => {
    const validSortFields = new Set([
      'employeeId',
      'name',
      'position',
      'motherUnit',
      'assignedUnit',
      'detailedOffice',
      'designatedPositionFunction',
      'durationFrom',
      'durationTo',
      'dateOfBirth',
      'aoNumber',
    ]);

    if (!validSortFields.has(field)) {
      return;
    }

    setReportSortPriority((prev) => {
      const existing = prev.findIndex((item) => item.key === field);
      if (existing >= 0) {
        if (prev[existing].direction === 'asc') {
          // Second click: toggle to desc
          const updated = [...prev];
          updated[existing] = { ...updated[existing], direction: 'desc' };
          return updated;
        } else {
          // Third click: remove this sort (numbers re-index automatically)
          return prev.filter((_, i) => i !== existing);
        }
      }

      // First click: add as ascending
      return [...prev, { key: field, direction: 'asc' }];
    });
  };

  const handleRemoveSort = (field: string) => {
    setReportSortPriority((prev) => prev.filter((item) => item.key !== field));
  };

  const renderSortableHeader = (label: string, field: string) => {
    const priorityIndex = reportSortPriority.findIndex((item) => item.key === field) + 1;
    const active = reportSortPriority.some((item) => item.key === field);
    const currentDirection = reportSortPriority.find((item) => item.key === field)?.direction;

    return (
      <div className="reports-view__header-cell">
        <span>{label}</span>
        <div className="reports-view__sort-controls">
          <button
            type="button"
            className={`reports-view__sort-btn${active ? ' reports-view__sort-btn--active' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleReportSort(field); }}
            title={active ? (currentDirection === 'asc' ? `Sort ${label} descending` : `Remove ${label} sort`) : `Sort by ${label}`}
          >
            {priorityIndex > 0 ? <span className="reports-view__sort-priority">{priorityIndex}</span> : null}
            {active ? (currentDirection === 'asc' ? '▲' : '▼') : '⇅'}
          </button>
          {active && (
            <button
              type="button"
              className="reports-view__sort-remove-btn"
              onClick={(e) => { e.stopPropagation(); handleRemoveSort(field); }}
              title={`Remove ${label} sort`}
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderAdministrativeOrder = (row: ReportRow) => {
    const label = `${row.aoNumber ? `AO ${row.aoNumber}` : '-'}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}`.trim();
    const docs = (row.rawEmployee as any).documents || [];
    // Use the specific document linked to this row via docId; fall back to any AO doc for audit rows
    const aoDoc = row.docId
      ? docs.find((d: any) => d.id === row.docId)
      : docs.find((d: any) => d.category === 'Administrative Order');

    if (aoDoc) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedReportDocument(aoDoc);
            setReportPdfData(`${getServerBaseUrl()}/api/documents/${aoDoc.id}/file`);
            setIsReportViewerOpen(true);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-primary)',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontWeight: 600,
            padding: 0,
            textAlign: 'left',
          }}
          title="Open Administrative Order PDF"
        >
          {label}
        </button>
      );
    }

    return label || '-';
  };

  const currentAvailableKeys = useMemo<string[]>(() => {
    if (reportAoStatus === 'Detailed') {
      return ['employeeId', 'name', 'position', 'motherUnit', 'detailedOffice', 'durationFrom', 'durationTo', 'administrativeOrder'];
    } else if (reportAoStatus === 'Designated') {
      return ['employeeId', 'name', 'position', 'motherUnit', 'detailedOffice', 'designatedPositionFunction', 'durationFrom', 'durationTo', 'administrativeOrder'];
    } else {
      return ['employeeId', 'name', 'position', 'motherUnit', 'detailedOffice', 'designatedPositionFunction', 'durationFrom', 'durationTo', 'dateOfBirth', 'administrativeOrder'];
    }
  }, [reportAoStatus]);

  const handleSelectAllColumns = () => {
    setVisibleColumns(prev => {
      const next = { ...prev };
      currentAvailableKeys.forEach(key => {
        next[key] = true;
      });
      localStorage.setItem('report_visible_columns', JSON.stringify(next));
      return next;
    });
  };

  const handleClearAllColumns = () => {
    setVisibleColumns(prev => {
      const next = { ...prev };
      currentAvailableKeys.forEach(key => {
        next[key] = false;
      });
      localStorage.setItem('report_visible_columns', JSON.stringify(next));
      return next;
    });
  };

  const reportColumns = useMemo<Column<ReportRow>[]>(() => {
    const selectionColumn: Column<ReportRow> = {
      key: 'selection',
      header: (
        <input
          type="checkbox"
          checked={
            reportsForActiveTab.length > 0 &&
            reportsForActiveTab.every((row) => selectedReportRowIds.has(row.id))
          }
          onChange={(e) => {
            const checked = e.target.checked;
            setSelectedReportRowIds((prev) => {
              const next = new Set(prev);
              reportsForActiveTab.forEach((row) => {
                if (checked) {
                  next.add(row.id);
                } else {
                  next.delete(row.id);
                }
              });
              return next;
            });
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: 'pointer' }}
        />
      ),
      render: (row: ReportRow) => (
        <input
          type="checkbox"
          checked={selectedReportRowIds.has(row.id)}
          onChange={(e) => {
            const checked = e.target.checked;
            setSelectedReportRowIds((prev) => {
              const next = new Set(prev);
              if (checked) {
                next.add(row.id);
              } else {
                next.delete(row.id);
              }
              return next;
            });
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: 'pointer' }}
        />
      ),
      width: '50px',
    };

    let baseColumns: Column<ReportRow>[] = [];

    // All Employees: Employment ID, Name, Position, Mother Unit, Detailed/Transferred, Designated Position/Function, Duration From/To, Date of Birth, AO
    if (reportAoStatus === 'All Employees') {
      baseColumns = [
        {
          key: 'employeeId',
          header: renderSortableHeader('Employment ID', 'employeeId'),
          render: (row) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.employeeId}</span>,
        },
        {
          key: 'name',
          header: renderSortableHeader('Name of Employee', 'name'),
          render: (row) => row.name,
        },
        {
          key: 'position',
          header: renderSortableHeader('Position', 'position'),
          render: (row) => row.position || '-',
        },
        {
          key: 'motherUnit',
          header: renderSortableHeader('Mother Unit', 'motherUnit'),
          render: (row) => row.motherUnit || '-',
        },
        {
          key: 'detailedOffice',
          header: renderSortableHeader('Detailed/Designated Office/Hospital', 'detailedOffice'),
          render: (row) => row.detailedOffice || '',
        },
        {
          key: 'designatedPositionFunction',
          header: renderSortableHeader('Designated Position/Function', 'designatedPositionFunction'),
          render: (row) => row.designatedPositionFunction || '',
        },
        {
          key: 'durationFrom',
          header: renderSortableHeader('Duration From', 'durationFrom'),
          render: (row) => row.durationFrom ? formatDateMDY(row.durationFrom) : '—',
        },
        {
          key: 'durationTo',
          header: renderSortableHeader('Duration To', 'durationTo'),
          render: (row) => row.durationTo ? formatDateMDY(row.durationTo) : '—',
        },
        {
          key: 'dateOfBirth',
          header: renderSortableHeader('Date of Birth', 'dateOfBirth'),
          render: (row) => row.dateOfBirth || '-',
        },
        {
          key: 'administrativeOrder',
          header: renderSortableHeader('Administrative Order No.', 'aoNumber'),
          render: (row) => renderAdministrativeOrder(row),
        },
      ];
    } else if (reportAoStatus === 'Detailed') {
      // Detailed: Name, Position, Mother Unit, Detailed/Transferred Office/Hospital, Duration From/To, AO
      baseColumns = [
        {
          key: 'employeeId',
          header: renderSortableHeader('Employment ID', 'employeeId'),
          render: (row) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.employeeId}</span>,
        },
        {
          key: 'name',
          header: renderSortableHeader('Name of Employee', 'name'),
          render: (row) => row.name,
        },
        {
          key: 'position',
          header: renderSortableHeader('Position', 'position'),
          render: (row) => row.position || '-',
        },
        {
          key: 'motherUnit',
          header: renderSortableHeader('Mother Unit', 'motherUnit'),
          render: (row) => row.motherUnit || '-',
        },
        {
          key: 'detailedOffice',
          header: renderSortableHeader('Detailed/Transferred Office/Hospital', 'detailedOffice'),
          render: (row) => row.detailedOffice || '',
        },
        {
          key: 'durationFrom',
          header: renderSortableHeader('Duration From', 'durationFrom'),
          render: (row) => row.durationFrom ? formatDateMDY(row.durationFrom) : '—',
        },
        {
          key: 'durationTo',
          header: renderSortableHeader('Duration To', 'durationTo'),
          render: (row) => row.durationTo ? formatDateMDY(row.durationTo) : '—',
        },
        {
          key: 'administrativeOrder',
          header: renderSortableHeader('Administrative Order No.', 'aoNumber'),
          render: (row) => renderAdministrativeOrder(row),
        },
      ];
    } else {
      // Designated: Employment ID, Name of Employee, Position, Mother Unit, Designated Position/Function, Duration From/To, AO
      baseColumns = [
        {
          key: 'employeeId',
          header: renderSortableHeader('Employment ID', 'employeeId'),
          render: (row) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.employeeId}</span>,
        },
        {
          key: 'name',
          header: renderSortableHeader('Name of Employee', 'name'),
          render: (row) => row.name,
        },
        {
          key: 'position',
          header: renderSortableHeader('Position', 'position'),
          render: (row) => row.position || '-',
        },
        {
          key: 'motherUnit',
          header: renderSortableHeader('Mother Unit', 'motherUnit'),
          render: (row) => row.motherUnit || '-',
        },
        {
          key: 'detailedOffice',
          header: renderSortableHeader('Designated Office', 'detailedOffice'),
          render: (row) => row.detailedOffice || '',
        },
        {
          key: 'designatedPositionFunction',
          header: renderSortableHeader('Designated Position/Function', 'designatedPositionFunction'),
          render: (row) => row.designatedPositionFunction || '',
        },
        {
          key: 'durationFrom',
          header: renderSortableHeader('Duration From', 'durationFrom'),
          render: (row) => row.durationFrom ? formatDateMDY(row.durationFrom) : '—',
        },
        {
          key: 'durationTo',
          header: renderSortableHeader('Duration To', 'durationTo'),
          render: (row) => {
            if (!row.durationTo) return '—';
            const formattedDate = formatDateMDY(row.durationTo);
            const formattedToday = formatDateMDY(new Date());
            const isDeadlineToday = formattedDate !== '—' && formattedDate === formattedToday;

            if (isDeadlineToday) {
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span>{formattedDate}</span>
                  <span style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: 'var(--color-danger)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.125rem 0.375rem',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    border: '1px solid rgba(239, 68, 68, 0.2)'
                  }}>
                    ⚠️ Today
                  </span>
                </div>
              );
            }
            return formattedDate;
          },
        },
        {
          key: 'administrativeOrder',
          header: renderSortableHeader('Administrative Order No.', 'aoNumber'),
          render: (row) => renderAdministrativeOrder(row),
        },
      ];
    }

    const filteredBaseColumns = baseColumns.filter(
      (column) => visibleColumns[column.key] !== false
    );
    return [selectionColumn, ...filteredBaseColumns];
  }, [reportAoStatus, reportSortPriority, reportsForActiveTab, selectedReportRowIds, visibleColumns]);

  const getFormattedTitle = () => {
    const months = {
      '01': 'JANUARY', '02': 'FEBRUARY', '03': 'MARCH', '04': 'APRIL',
      '05': 'MAY', '06': 'JUNE', '07': 'JULY', '08': 'AUGUST',
      '09': 'SEPTEMBER', '10': 'OCTOBER', '11': 'NOVEMBER', '12': 'DECEMBER'
    };

    const fromMonth = reportAoOrderMonthFrom ? months[reportAoOrderMonthFrom as keyof typeof months] : '';
    const toMonth = reportAoOrderMonthTo ? months[reportAoOrderMonthTo as keyof typeof months] : '';
    const year = reportAoYear ? reportAoYear.trim() : '';

    let title = 'LIST OF EMPLOYEES WITH ADMINISTRATIVE ORDERS';

    if (fromMonth && toMonth) {
      title += ` ISSUED FROM ${fromMonth} - ${toMonth}`;
    } else if (fromMonth) {
      title += ` ISSUED FROM ${fromMonth}`;
    } else if (toMonth) {
      title += ` ISSUED TO ${toMonth}`;
    }

    if (year) {
      title += ` ${year}`;
    }

    return title;
  };

  const exportReportData = async (format: 'xlsx' | 'csv') => {
    // Export only the rows visible in the currently active tab
    const tabRows =
      reportActiveTab === 'active'
        ? sortedReportRows.filter((row) => row.status === 'Active')
        : reportActiveTab === 'inactive'
          ? sortedReportRows.filter((row) => row.status === 'Inactive')
          : reportActiveTab === 'expiring'
            ? sortedReportRows.filter((row) => isNearExpiration(row.durationTo))
            : sortedReportRows.filter((row) => isExpired(row.durationTo));

    const title = getFormattedTitle();
    const fileName = `AO-Report-${reportAoStatus.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'xlsx') {
      try {
        // Fetch the template file
        const response = await fetch('/template.xlsx');
        if (!response.ok) throw new Error('Template file not found or failed to load');
        const arrayBuffer = await response.arrayBuffer();

        // Load zip container
        const zip = await JSZip.loadAsync(arrayBuffer);
        const sheetXmlPath = 'xl/worksheets/sheet1.xml';
        const sheetXmlStr = await zip.file(sheetXmlPath)?.async('string');
        if (!sheetXmlStr) throw new Error('Invalid excel template package: sheet1.xml missing');

        // Modify sheetData XML content — pass the AO status so column headers adapt
        const modifiedXml = modifySheetXml(sheetXmlStr, title, tabRows, reportAoStatus);

        // Patch styles.xml: remove shrinkToFit so the dynamic row heights we
        // set are respected — text wraps within the column and the row expands.
        const stylesXmlPath = 'xl/styles.xml';
        const stylesXmlStr = await zip.file(stylesXmlPath)?.async('string');
        if (stylesXmlStr) {
          const patchedStylesXml = stylesXmlStr.replace(/\s*shrinkToFit="1"/g, '');
          zip.file(stylesXmlPath, patchedStylesXml);
        }

        // Add <sheetPr fitToPage> and update pageSetup with fitToWidth=1
        // so the sheet scales to fit 1 page wide when printed.
        let finalXml = modifiedXml;
        if (!finalXml.includes('<sheetPr')) {
          finalXml = finalXml.replace(
            /(<(?:dimension|sheetViews)[^>]*(?:\/>|>))/,
            '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>$1'
          );
        }
        finalXml = finalXml.replace(
          /<pageSetup([^>]*?)\/>/,
          (_match, attrs: string) => {
            const cleaned = attrs
              .replace(/\s*fitToWidth="[^"]*"/g, '')
              .replace(/\s*fitToHeight="[^"]*"/g, '')
              .replace(/\s*scale="[^"]*"/g, '');
            return `<pageSetup${cleaned} fitToWidth="1" fitToHeight="0"/>`;
          }
        );
        zip.file(sheetXmlPath, finalXml);

        // Re-generate the zip archive as an xlsx file blob
        const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // Save download using file-saver
        saveAs(blob, `${fileName}.xlsx`);
        showToast('✅ Report successfully exported to formatted Excel.', 'success');
      } catch (err: any) {
        console.error('Failed to export using Excel template:', err);
        showToast(`Failed to export Excel template: ${err.message}`, 'error');
      }
    } else {
      // Export as default JSON sheet for non-Detailed XLSX or CSV format
      const exportRows = tabRows.map((row, idx) => {
        const exportObj: Record<string, string> = { '#': String(idx + 1) };
        const allPossibleFields = [
          { key: 'employeeId', label: 'Employment ID', value: row.employeeId },
          { key: 'name', label: 'Name of Employee', value: row.name },
          { key: 'position', label: 'Position', value: row.position || '' },
          { key: 'motherUnit', label: 'Mother Unit', value: row.motherUnit || '' },
          { key: 'detailedOffice', label: reportAoStatus === 'Detailed' ? 'Detailed/Transferred Office/Hospital' : reportAoStatus === 'Designated' ? 'Designated Office' : 'Detailed/Designated Office/Hospital', value: row.detailedOffice || '' },
          { key: 'designatedPositionFunction', label: 'Designated Position/Function', value: row.designatedPositionFunction || '' },
          { key: 'durationFrom', label: 'Duration From', value: row.durationFrom ? formatDateMDY(row.durationFrom) : '' },
          { key: 'durationTo', label: 'Duration To', value: row.durationTo ? formatDateMDY(row.durationTo) : '' },
          { key: 'dateOfBirth', label: 'Date of Birth', value: row.dateOfBirth || '' },
          { key: 'administrativeOrder', label: 'Administrative Order No.', value: `${row.aoNumber ? `AO ${row.aoNumber}` : ''}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}`.trim() },
        ];

        allPossibleFields.forEach(field => {
          if (currentAvailableKeys.includes(field.key) && visibleColumns[field.key] !== false) {
            exportObj[field.label] = field.value;
          }
        });

        return exportObj;
      });

      const sheetName = reportAoStatus === 'Designated' ? 'Designated Reports' : reportAoStatus === 'Detailed' ? 'Detailed Reports' : 'All Employees';
      const worksheet = XLSX.utils.json_to_sheet(exportRows);

      // CSV export
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const printReportData = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Pop-up blocked. Please allow pop-ups to print the report.', 'error');
      return;
    }

    const tabRows =
      reportActiveTab === 'active'
        ? sortedReportRows.filter((row) => row.status === 'Active')
        : reportActiveTab === 'inactive'
          ? sortedReportRows.filter((row) => row.status === 'Inactive')
          : reportActiveTab === 'expiring'
            ? sortedReportRows.filter((row) => isNearExpiration(row.durationTo))
            : sortedReportRows.filter((row) => isExpired(row.durationTo));

    const title = getFormattedTitle();
    const ROWS_PER_PAGE = 90;
    const pageCount = Math.max(1, Math.ceil(tabRows.length / ROWS_PER_PAGE));

    const officeColHeader = reportAoStatus === 'Designated'
      ? 'Designated Office'
      : reportAoStatus === 'All Employees'
        ? 'Detailed/Designated Office/Hospital'
        : 'Detailed/Transferred Office/Hospital';

    const durationColHeader = reportAoStatus === 'Designated'
      ? 'Duration of Designated Order'
      : 'Duration of Detailed Order';

    const logoSrc = `${window.location.origin}/template_logo.png`;

    const headerHtml = `
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:14px;">
        <img src="${logoSrc}" alt="Logo" style="height:65px;width:auto;" onerror="this.style.display='none';" />
        <div style="text-align:center;flex-grow:1;padding:0 12px;">
          <div style="font-size:10.5pt;font-style:italic;font-weight:normal;">Republic of the Philippines</div>
          <div style="font-size:11pt;font-weight:bold;margin-top:2px;">Province of Pangasinan</div>
          <div style="font-size:10pt;font-weight:normal;margin-top:2px;">Lingayen</div>
          <div style="font-size:11.5pt;font-weight:bold;margin-top:4px;font-family:Calibri,Arial,sans-serif;">HUMAN RESOURCE MGT. &amp; DEVELOPMENT OFFICE</div>
        </div>
        <div style="width:65px;"></div>
      </div>`;

    const tableHeaderHtml = `
      <thead>
        <tr style="background-color:#f2f2f2;">
          <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:5%;">NO.</th>
          <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:22%;">Name of Employee</th>
          <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:22%;">Mother Unit</th>
          <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:22%;">${officeColHeader}</th>
          <th colspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;">${durationColHeader}</th>
          <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:19%;">Administrative Order No.</th>
        </tr>
        <tr style="background-color:#f2f2f2;">
          <th style="border:1px solid #000;padding:4px 6px;font-size:9pt;text-align:center;font-weight:bold;width:10%;">From</th>
          <th style="border:1px solid #000;padding:4px 6px;font-size:9pt;text-align:center;font-weight:bold;width:10%;">To</th>
        </tr>
      </thead>`;

    const pagesHtml = Array.from({ length: pageCount }, (_, pageIdx) => {
      const pageRows = tabRows.slice(pageIdx * ROWS_PER_PAGE, (pageIdx + 1) * ROWS_PER_PAGE);
      const rowsHtml = pageRows.length === 0
        ? `<tr><td colspan="7" style="border:1px solid #000;padding:20px;text-align:center;color:#555;">No records found matching current filters.</td></tr>`
        : pageRows.map((row, idx) => {
            const globalIdx = pageIdx * ROWS_PER_PAGE + idx;
            const ao = row.aoNumber ? `AO ${row.aoNumber}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}` : '—';
            return `
              <tr>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:top;">${globalIdx + 1}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:left;vertical-align:top;word-break:break-word;white-space:normal;">${row.name}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:left;vertical-align:top;word-break:break-word;white-space:normal;">${row.motherUnit || ''}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:left;vertical-align:top;word-break:break-word;white-space:normal;">${row.detailedOffice || ''}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:top;">${row.durationFrom ? formatDateMDY(row.durationFrom) : '—'}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:top;">${row.durationTo ? formatDateMDY(row.durationTo) : '—'}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:top;word-break:break-word;">${ao}</td>
              </tr>`;
          }).join('');

      const pageBreakStyle = pageIdx < pageCount - 1
        ? 'page-break-after:always;margin-bottom:40px;padding-bottom:40px;border-bottom:3px dashed #aaa;'
        : '';

      return `
        <div style="${pageBreakStyle}">
          ${headerHtml}
          <div style="text-align:center;font-weight:bold;font-size:11pt;font-family:Calibri,Arial,sans-serif;text-transform:uppercase;margin-bottom:14px;letter-spacing:0.3px;">
            ${title}${pageCount > 1 ? ` <span style="font-size:9pt;font-weight:normal;margin-left:10px;color:#444;">(Page ${pageIdx + 1} of ${pageCount})</span>` : ''}
          </div>
          <table style="width:100%;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;table-layout:fixed;">
            ${tableHeaderHtml}
            <tbody>${rowsHtml}</tbody>
          </table>

        </div>`;
    }).join('');

    const html = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            @media print {
              @page { size: landscape; margin: 0.5in; }
              body { margin: 0; }
            }
            body {
              font-family: Calibri, Arial, sans-serif;
              color: #000;
              margin: 20px;
              padding: 0;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleDeleteReportEntries = (ids: string[]) => {
    setPendingDeleteReportIds(ids);
    setIsDeleteReportConfirmOpen(true);
  };

  const handleConfirmDeleteReportEntries = async () => {
    if (pendingDeleteReportIds.length === 0) return;
    try {
      setIsDeletingReport(true);

      // Build human-readable entry names for the approval request
      const entryNames = pendingDeleteReportIds.map((rawId) => {
        const row = sortedReportRows.find((r) => r.id === rawId);
        return row
          ? `${row.name} — AO ${row.aoNumber || 'N/A'}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}`
          : rawId;
      });

      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
        action: 'delete_report_entry',
        entityType: 'report_entry',
        entityId: pendingDeleteReportIds.length === 1 ? pendingDeleteReportIds[0] : 'bulk',
        entityName: pendingDeleteReportIds.length === 1 ? entryNames[0] : `${pendingDeleteReportIds.length} report entries`,
        payload: { ids: pendingDeleteReportIds, entryNames },
      });

      showToast('✅ Delete request submitted. Go to Approvals to review and execute.', 'info');
      setIsDeleteReportConfirmOpen(false);
      setPendingDeleteReportIds([]);
      setSelectedReportRowIds(new Set());
    } catch (err: any) {
      showToast(`Failed to submit delete request: ${err.message}`, 'error');
    } finally {
      setIsDeletingReport(false);
    }
  };

  // Get badge variant based on status
  const getStatusVariant = (status: EmployeeStatus) => {
    return status === 'Active' ? 'success' : 'danger';
  };

  // Checkbox selection handlers
  const handleSelectAll = () => {
    if (selectedEmployeeIds.size === filteredEmployees.length) {
      // Deselect all
      setSelectedEmployeeIds(new Set());
    } else {
      // Select all employees across all pages
      const allIds = new Set(filteredEmployees.map(emp => emp.id));
      setSelectedEmployeeIds(allIds);
    }
  };

  const handleSelectEmployee = (employeeId: string) => {
    const newSelected = new Set(selectedEmployeeIds);
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId);
    } else {
      newSelected.add(employeeId);
    }
    setSelectedEmployeeIds(newSelected);
  };

  const renderAoNumberColumn = (employee: Employee) => {
    if (!employee.aoNumber) return '—';
    const docs = (employee as any).documents || [];
    const aoDoc = docs.find((d: any) => d.category === 'Administrative Order');

    if (aoDoc) {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedReportDocument(aoDoc);
            setReportPdfData(`${getServerBaseUrl()}/api/documents/${aoDoc.id}/file`);
            setIsReportViewerOpen(true);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-primary)',
            textDecoration: 'underline',
            cursor: 'pointer',
            fontWeight: 600,
            padding: 0,
            textAlign: 'left',
          }}
          title="Open Administrative Order PDF"
        >
          {employee.aoNumber}
        </button>
      );
    }
    return employee.aoNumber;
  };

  const isAllSelected = filteredEmployees.length > 0 && selectedEmployeeIds.size === filteredEmployees.length;
  const isSomeSelected = selectedEmployeeIds.size > 0 && selectedEmployeeIds.size < filteredEmployees.length;

  // Get selected employees info for bulk delete
  const selectedEmployees = employees.filter(emp => selectedEmployeeIds.has(emp.id));

  // Table columns
  const columns: Column<Employee>[] = [
    {
      key: 'checkbox',
      header: (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={isAllSelected}
            ref={(input) => {
              if (input) {
                input.indeterminate = isSomeSelected;
              }
            }}
            onChange={handleSelectAll}
            className="dashboard__checkbox"
            aria-label="Select all employees"
          />
        </div>
      ),
      width: '5%',
      render: (employee) => (
        <div
          className="dashboard__checkbox-cell"
          onClick={(e) => {
            e.stopPropagation();
            handleSelectEmployee(employee.id);
          }}
        >
          <input
            type="checkbox"
            checked={selectedEmployeeIds.has(employee.id)}
            onChange={() => { }}
            className="dashboard__checkbox"
            aria-label={`Select ${employee.lastName}, ${employee.firstName}`}
          />
        </div>
      ),
    },
    {
      key: 'id',
      header: 'Employee ID',
      render: (employee) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
          {employee.id}
        </span>
      ),
    },
    {
      key: 'lastName',
      header: 'Last Name',
      render: (employee) => employee.lastName,
    },
    {
      key: 'firstName',
      header: 'First Name',
      render: (employee) => employee.firstName,
    },
    {
      key: 'middleName',
      header: 'Middle Name',
      render: (employee) => (
        <span className="dashboard__middle-name">
          {employee.middleName || '—'}
        </span>
      ),
    },
    {
      key: 'dateOfBirth',
      header: 'Date of Birth',
      render: (employee) => formatDateDDMMYYYY(employee.dateOfBirth),
    },
    {
      key: 'positionFunction',
      header: 'Position',
      render: (employee) => employee.positionFunction,
    },
    {
      key: 'status',
      header: 'Status',
      width: '80px',
      render: (employee) => (
        <Badge variant={getStatusVariant(employee.status)} size="sm">
          {employee.status}
        </Badge>
      ),
    },
    {
      key: 'appointmentStatus',
      header: 'Appointment',
      render: (employee) => employee.appointmentStatus,
    },
    {
      key: 'dateOfEmployment',
      header: 'Date Employed',
      render: (employee) => formatDateDDMMYYYY(employee.dateOfEmployment),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '170px',
      render: (employee) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          {canUpdate && (
            <Button
              variant="success"
              size="sm"
              style={{ minWidth: '80px' }}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenUpdateEmployeeModal(employee);
              }}
            >
              <MdEdit /> Update
            </Button>
          )}
          {canDelete && (
            <Button
              variant="danger"
              size="sm"
              style={{ minWidth: '80px' }}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDeleteConfirmModal(employee);
              }}
            >
              <MdDelete /> Delete
            </Button>
          )}
          {!canUpdate && !canDelete && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>—</span>
          )}
        </div>
      ),
    },
  ];

  const handleRowClick = (employee: Employee) => {
    navigate(`/employees/${employee.id}`);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (size: number) => {
    setItemsPerPage(size);
    setCurrentPage(1);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleOpenAddEmployeeModal = () => {
    setIsAddEmployeeModalOpen(true);
    setFormData({
      id: '',
      lastName: '',
      firstName: '',
      middleName: '',
      dateOfBirth: '',
      gender: '',
      officeHospitalName: '',
      appointmentStatus: '',
      appointmentFrom: '',
      appointmentTo: '',
      aoNumber: '',
      aoYear: '',
      aoType: '',
      status: 'Active',
      positionFunction: '',
      dateOfEmployment: '',
      dateOfSeparation: '',
      reasonForSeparation: '',
      motherUnit: '',
      detailedTo: '',
      detailedDivision: '',
      designatedPositionFunction: '',
      designatedOrderFrom: '',
      designatedOrderTo: '',
      fileboxLocation: '',
      file201Status: '',
    });
    setAoFile(null);
    setFormErrors({});
  };

  const handleCloseAddEmployeeModal = useCallback(() => {
    setIsAddEmployeeModalOpen(false);
    setAoFile(null);
    setAutoRename(false);
  }, []);

  const handleOpenUpdateEmployeeModal = (employee: Employee) => {
    setSelectedEmployee(employee);
    const employeeFormData: EmployeeFormData = {
      id: employee.id,
      lastName: employee.lastName,
      firstName: employee.firstName,
      middleName: employee.middleName,
      dateOfBirth: convertToDateInputFormat(employee.dateOfBirth),
      gender: employee.gender,
      officeHospitalName: employee.officeHospitalName,
      appointmentStatus: employee.appointmentStatus,
      appointmentFrom: convertToDateInputFormat(employee.appointmentFrom),
      appointmentTo: convertToDateInputFormat(employee.appointmentTo),
      aoNumber: (employee as any).aoNumber || '',
      aoYear: (employee as any).aoYear || '',
      aoType: ((employee as any).aoType || '') as any,
      status: employee.status,
      positionFunction: employee.positionFunction,
      dateOfEmployment: convertToDateInputFormat(employee.dateOfEmployment),
      dateOfSeparation: convertToDateInputFormat(employee.dateOfSeparation),
      reasonForSeparation: employee.reasonForSeparation || '',
      motherUnit: (employee as any).motherUnit || '',
      detailedTo: (employee as any).detailedTo || '',
      detailedDivision: (employee as any).detailedDivision || '',
      designatedPositionFunction: (employee as any).designatedPositionFunction || '',
      designatedOrderFrom: convertToDateInputFormat((employee as any).designatedOrderFrom),
      designatedOrderTo: convertToDateInputFormat((employee as any).designatedOrderTo),
      fileboxLocation: (employee as any).fileboxLocation || '',
      file201Status: (employee as any).file201Status || '',
    };
    setFormData(employeeFormData);
    setOriginalEmployeeData(employeeFormData); // Store original data for comparison
    setFormErrors({});
    setAutoRename(false);
    setIsUpdateEmployeeModalOpen(true);
  };

  const handleCloseUpdateEmployeeModal = useCallback(() => {
    setIsUpdateEmployeeModalOpen(false);
    setSelectedEmployee(null);
    setOriginalEmployeeData(null);
    setAoFile(null);
    setAutoRename(false);
  }, []);

  const handleCloseBulkDownloadModal = useCallback(() => {
    setIsBulkDownloadModalOpen(false);
  }, []);

  const handleFormChange = (field: keyof EmployeeFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (isUpdate: boolean = false): boolean => {
    const errors: Partial<Record<keyof EmployeeFormData, string>> = {};

    // For updates, only validate fields that are being changed
    if (isUpdate) {
      // Only validate non-empty fields
      if (formData.lastName.trim() === '') errors.lastName = 'Last name cannot be empty';
      if (formData.firstName.trim() === '') errors.firstName = 'First name cannot be empty';
      if (formData.officeHospitalName.trim() === '') errors.officeHospitalName = 'Office/Hospital name cannot be empty';
      if (formData.positionFunction.trim() === '') errors.positionFunction = 'Position/Function cannot be empty';

      // Validate status-dependent fields
      if (formData.status === 'Inactive') {
        if (!formData.dateOfSeparation) errors.dateOfSeparation = 'Date of separation is required for inactive employees';
        if (!formData.reasonForSeparation.trim()) errors.reasonForSeparation = 'Reason for separation is required for inactive employees';
      }
    } else {
      // For create, all required fields must be filled
      if (!formData.id.trim()) errors.id = 'Employee ID is required';
      if (!formData.lastName.trim()) errors.lastName = 'Last name is required';
      if (!formData.firstName.trim()) errors.firstName = 'First name is required';
      if (!formData.gender) errors.gender = 'Gender is required';
      if (!formData.officeHospitalName.trim()) errors.officeHospitalName = 'Office/Hospital name is required';
      if (!formData.appointmentStatus) errors.appointmentStatus = 'Appointment status is required';
      if (!formData.positionFunction.trim()) errors.positionFunction = 'Position/Function is required';
      if (formData.appointmentFrom && formData.appointmentTo && formData.appointmentTo < formData.appointmentFrom) {
        errors.appointmentTo = 'Appointment to must be on or after appointment from';
      }

      if (formData.status === 'Inactive') {
        if (!formData.dateOfSeparation) errors.dateOfSeparation = 'Date of separation is required';
        if (!formData.reasonForSeparation.trim()) errors.reasonForSeparation = 'Reason for separation is required';
      }
    }

    // Auto-populate Mother Unit from primary Office/Hospital Name for Detailed AOs
    if (formData.aoType === 'Detailed') {
      formData.motherUnit = formData.officeHospitalName;
    }

    // AO conditional validation: if aoNumber is set, aoYear is required and aoFile is required when updating/creating AO
    if (formData.aoNumber && formData.aoNumber.trim() !== '') {
      if (!formData.aoYear) {
        errors.aoYear = 'Series (Year) is required when AO number is provided';
      }

      const isAoNumberChanged = !isUpdate || (formData.aoNumber !== originalEmployeeData?.aoNumber);
      if (isAoNumberChanged && !aoFile) {
        errors.aoNumber = 'An Administrative Order file upload is required';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEmployee = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      const employeeData = {
        id: formData.id,
        lastName: formData.lastName,
        firstName: formData.firstName,
        middleName: formData.middleName || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        gender: formData.gender,
        officeName: formData.officeHospitalName,
        appointmentStatus: formData.appointmentStatus,
        appointmentFrom: formData.appointmentFrom || undefined,
        appointmentTo: formData.appointmentTo || undefined,
        aoNumber: formData.aoNumber || undefined,
        aoYear: formData.aoYear || undefined,
        aoType: formData.aoType || undefined,
        status: formData.status,
        position: formData.positionFunction,
        dateOfEmployment: formData.dateOfEmployment,
        dateOfSeparation: formData.dateOfSeparation || undefined,
        reasonOfSeparation: formData.reasonForSeparation || undefined,
        motherUnit: formData.aoType === 'Detailed' ? formData.motherUnit || undefined : undefined,
        detailedTo: (formData.aoType === 'Detailed' || formData.aoType === 'Designated') ? formData.detailedTo || undefined : undefined,
        detailedDivision: formData.aoType === 'Detailed' ? formData.detailedDivision || undefined : undefined,
        designatedPositionFunction: formData.aoType === 'Designated' ? formData.designatedPositionFunction || undefined : undefined,
        designatedOrderFrom: formData.aoType === 'Designated' ? formData.designatedOrderFrom || undefined : undefined,
        designatedOrderTo: formData.aoType === 'Designated' ? formData.designatedOrderTo || undefined : undefined,
        fileboxLocation: formData.fileboxLocation || undefined,
      };

      // Pass user info for audit logging
      await api.employee.create(
        employeeData,
        currentUser?.id,
        `${currentUser?.lastName}, ${currentUser?.firstName}`
      );

      // If there is an AO file, upload it
      if (aoFile) {
        const empName = `${formData.lastName}, ${formData.firstName}`;
        try {
          await api.document.upload(
            aoFile,
            {
              employeeId: formData.id,
              employeeName: empName,
              category: 'Administrative Order',
              fileName: aoFile.name,
              fileSize: Math.round(aoFile.size / 1024),
              mimeType: aoFile.type || 'application/pdf',
              aoNumber: formData.aoNumber,
              aoYear: formData.aoYear,
              autoRename,
            },
            currentUser?.id,
            `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim()
          );
        } catch (uploadError) {
          console.error('Error uploading AO file on employee creation:', uploadError);
        }
      }

      showToast('Employee added successfully!', 'success');
      handleCloseAddEmployeeModal();
      fetchEmployees();
      fetchAllEmployeesForKPI(); // Refresh KPI data
      fetchDropdownOptions(); // Refresh searchable dropdown choices
    } catch (error) {
      console.error('Error saving employee:', error);
      showToast('Failed to save employee. Please try again.', 'error');
    }
  };

  const handleUpdateEmployee = async () => {
    if (!validateForm(true) || !selectedEmployee || !originalEmployeeData) {
      return;
    }

    try {
      // Detect changed fields by comparing with original data
      const changedFields: any = {};
      const fieldMapping: Record<keyof EmployeeFormData, string> = {
        id: 'id',
        lastName: 'lastName',
        firstName: 'firstName',
        middleName: 'middleName',
        dateOfBirth: 'dateOfBirth',
        gender: 'gender',
        officeHospitalName: 'officeName',
        appointmentStatus: 'appointmentStatus',
        appointmentFrom: 'appointmentFrom',
        appointmentTo: 'appointmentTo',
        aoNumber: 'aoNumber',
        aoYear: 'aoYear',
        aoType: 'aoType',
        status: 'status',
        positionFunction: 'position',
        dateOfEmployment: 'dateOfEmployment',
        dateOfSeparation: 'dateOfSeparation',
        reasonForSeparation: 'reasonOfSeparation',
        motherUnit: 'motherUnit',
        detailedTo: 'detailedTo',
        detailedDivision: 'detailedDivision',
        designatedPositionFunction: 'designatedPositionFunction',
        designatedOrderFrom: 'designatedOrderFrom',
        designatedOrderTo: 'designatedOrderTo',
        fileboxLocation: 'fileboxLocation',
        file201Status: 'file201Status',
      };

      // Compare each field with original data
      (Object.keys(formData) as Array<keyof EmployeeFormData>).forEach((key) => {
        const currentValue = formData[key];
        const originalValue = originalEmployeeData[key];

        // Check if value has changed
        if (currentValue !== originalValue) {
          const backendField = fieldMapping[key];
          const fromValue = originalValue === '' || originalValue === undefined ? undefined : originalValue;
          const toValue = currentValue === '' || currentValue === undefined ? undefined : currentValue;
          changedFields[backendField] = { from: fromValue, to: toValue };
        }
      });

      // Check if any fields were changed or if an AO file was uploaded
      if (Object.keys(changedFields).length === 0) {
        if (aoFile) {
          try {
            const empName = `${selectedEmployee.lastName}, ${selectedEmployee.firstName}`;
            await api.document.upload(
              aoFile,
              {
                employeeId: selectedEmployee.id,
                employeeName: empName,
                category: 'Administrative Order',
                fileName: aoFile.name,
                fileSize: Math.round(aoFile.size / 1024),
                mimeType: aoFile.type || 'application/pdf',
                aoNumber: formData.aoNumber,
                aoYear: formData.aoYear,
                autoRename,
              },
              currentUser?.id,
              `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim()
            );
            showToast(`✅ AO PDF file "${aoFile.name}" uploaded successfully.`, 'success');
            handleCloseUpdateEmployeeModal();
            fetchEmployees();
            fetchAllEmployeesForKPI();
          } catch (uploadErr: any) {
            showToast(`Failed to upload AO PDF file: ${uploadErr.message}`, 'error');
          }
          return;
        }
        showToast('No changes detected. Please modify at least one field to update.', 'info');
        return;
      }

      setPendingUpdatePayload({ employeeId: selectedEmployee.id, changedFields });

      // All roles — submit to approval queue, no direct execution
      try {
        const empName = `${selectedEmployee.lastName}, ${selectedEmployee.firstName}`;

        // If there is an AO file, upload it first
        if (aoFile) {
          await api.document.upload(
            aoFile,
            {
              employeeId: selectedEmployee.id,
              employeeName: empName,
              category: 'Administrative Order',
              fileName: aoFile.name,
              fileSize: Math.round(aoFile.size / 1024),
              mimeType: aoFile.type || 'application/pdf',
              aoNumber: formData.aoNumber,
              aoYear: formData.aoYear,
              autoRename,
            },
            currentUser?.id,
            `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim()
          );
        }

        await api.approvals.submit({
          requestedBy: currentUser?.id || '',
          requestedByName: `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
          action: 'update_employee',
          entityType: 'employee',
          entityId: selectedEmployee.id,
          entityName: empName,
          payload: changedFields,
        });
        handleCloseUpdateEmployeeModal();
        showToast('✅ Update request submitted. Go to Approvals to review and execute.', 'info');
      } catch (err: any) {
        showToast(err.message || 'Failed to submit approval request.', 'error');
      }
    } catch (error) {
      console.error('Error updating employee:', error);
      showToast('Failed to update employee. Please try again.', 'error');
    }
  };

  const handleCloseUpdateConfirmModal = () => {
    setIsUpdateConfirmModalOpen(false);
    setPendingUpdatePayload(null);
  };

  const handleConfirmUpdateEmployee = async (authorizingUser: any) => {
    if (!pendingUpdatePayload) {
      return;
    }

    try {
      const flatPayload: any = {};
      for (const [k, v] of Object.entries(pendingUpdatePayload.changedFields)) {
        flatPayload[k] = (v && typeof v === 'object' && 'to' in (v as any)) ? (v as any).to : v;
      }

      await api.employee.partialUpdate(
        pendingUpdatePayload.employeeId,
        flatPayload,
        currentUser?.id,
        `${currentUser?.lastName}, ${currentUser?.firstName}`,
        authorizingUser?.approvalToken
      );

      showToast(
        `Employee updated successfully! (${Object.keys(pendingUpdatePayload.changedFields).length} field(s) changed). Authorized by: ${authorizingUser.lastName}, ${authorizingUser.firstName}`,
        'success'
      );
      handleCloseUpdateConfirmModal();
      handleCloseUpdateEmployeeModal();
      fetchEmployees();
      fetchAllEmployeesForKPI();
      fetchDropdownOptions(); // Refresh searchable dropdown choices
    } catch (error: any) {
      console.error('Error updating employee:', error);
      throw new Error(error.message || 'Failed to update employee');
    }
  };

  const handleOpenDeleteConfirmModal = async (employee: Employee) => {
    setSelectedEmployee(employee);
    const empName = `${employee.lastName}, ${employee.firstName}`;
    try {
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName}, ${currentUser?.firstName}`,
        action: 'delete_employee',
        entityType: 'employee',
        entityId: employee.id,
        entityName: empName,
        payload: { id: employee.id, employeeName: empName },
      });
      showToast('✅ Delete request submitted. Go to Approvals to review and execute.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit approval request.', 'error');
    }
  };

  const handleCloseDeleteConfirmModal = () => {
    setIsDeleteConfirmModalOpen(false);
    setSelectedEmployee(null);
  };

  const handleDeleteEmployee = async (authorizingUser: any) => {
    if (!selectedEmployee) return;

    try {
      // Proceed with deletion
      // Pass the current user's info for audit logging
      await api.employee.delete(
        selectedEmployee.id,
        currentUser?.id,
        `${currentUser?.lastName}, ${currentUser?.firstName}`,
        authorizingUser.id,
        `${authorizingUser.lastName}, ${authorizingUser.firstName}`,
        authorizingUser?.approvalToken
      );

      showToast(`Employee deleted successfully! Authorized by: ${authorizingUser.lastName}, ${authorizingUser.firstName}`, 'success');
      handleCloseDeleteConfirmModal();
      fetchEmployees();
      fetchAllEmployeesForKPI(); // Refresh KPI data
    } catch (error: any) {
      console.error('Error deleting employee:', error);
      throw new Error(error.message || 'Failed to delete employee');
    }
  };

  const handleOpenBulkDeleteModal = async () => {
    if (selectedEmployeeIds.size === 0) {
      showToast('Please select at least one employee to delete.', 'warning');
      return;
    }

    const idsArray = Array.from(selectedEmployeeIds);
    const empNames = allEmployees
      .filter(e => idsArray.includes(e.id))
      .map(e => ({ firstName: e.firstName, lastName: e.lastName }));

    try {
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName}, ${currentUser?.firstName}`,
        action: 'bulk_delete_employee',
        entityType: 'employee',
        entityId: 'bulk',
        entityName: `${idsArray.length} employees`,
        payload: { ids: idsArray, employeeNames: empNames },
      });
      showToast('✅ Bulk delete request submitted. Go to Approvals to review and execute.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit approval request.', 'error');
    }
  };

  const handleCloseBulkDeleteModal = () => {
    setIsBulkDeleteModalOpen(false);
  };

  const handleBulkDelete = async (authorizingUser: any) => {
    if (selectedEmployeeIds.size === 0) return;

    try {
      // Get employee names for audit log
      const employeeNames = selectedEmployees.map(emp => ({
        firstName: emp.firstName,
        lastName: emp.lastName
      }));

      // Perform bulk delete
      const idsArray = Array.from(selectedEmployeeIds);
      await api.employee.bulkDelete(
        idsArray,
        currentUser?.id,
        `${currentUser?.lastName}, ${currentUser?.firstName}`,
        employeeNames,
        authorizingUser.id,
        `${authorizingUser.lastName}, ${authorizingUser.firstName}`,
        authorizingUser?.approvalToken
      );

      showToast(`Successfully deleted ${idsArray.length} employee(s)! Authorized by: ${authorizingUser.lastName}, ${authorizingUser.firstName}`, 'success');

      // Clear selection and refresh
      setSelectedEmployeeIds(new Set());
      handleCloseBulkDeleteModal();
      fetchEmployees();
      fetchAllEmployeesForKPI(); // Refresh KPI data
    } catch (error: any) {
      console.error('Error deleting employees:', error);
      throw new Error(error.message || 'Failed to delete employees');
    }
  };

  const handleDownloadTemplate = (format: 'xlsx' | 'csv') => {
    generateImportTemplate(format);
  };

  const handleBulkDownload = async (employeeIds: string[], type: 'barcode' | 'qrcode') => {
    try {
      setIsBulkDownloadLoading(true);

      // Get selected employees
      const selectedEmployees = allEmployees.filter(emp => employeeIds.includes(emp.id));

      // Generate and download ZIP
      await bulkDownloadCodes(selectedEmployees, type);

      showToast(`Successfully downloaded ${type === 'barcode' ? 'barcode(s)' : 'QR code(s)'}!`, 'success');
      setIsBulkDownloadModalOpen(false);
    } catch (error: any) {
      console.error('Error downloading codes:', error);
      const errorMessage = error?.message || 'Failed to download codes. Please try again.';
      showToast(errorMessage, 'error');
    } finally {
      setIsBulkDownloadLoading(false);
    }
  };

  const runLegacyImport = async (importedEmployees: ImportedEmployee[]) => {
    try {
      const successfulEmployees: Array<{ firstName: string; lastName: string }> = [];
      let failCount = 0;
      const errors: string[] = [];
      const skippedDuplicates: string[] = [];

      // Get existing employee IDs for duplicate checking
      const existingIds = new Set(employees.map(emp => emp.id));

      // Import each employee via API (without user info to prevent individual audit logs)
      for (const emp of importedEmployees) {
        try {
          // Check if Employee ID is provided
          if (emp.id && emp.id.trim() !== '') {
            // If ID is provided, check for duplicates
            if (existingIds.has(emp.id)) {
              skippedDuplicates.push(`${emp.lastName}, ${emp.firstName} (ID: ${emp.id})`);
              failCount++;
              continue; // Skip this record
            }
          }

          await api.employee.create(
            {
              id: emp.id && emp.id.trim() !== '' ? emp.id : undefined, // Include ID if provided
              lastName: emp.lastName,
              firstName: emp.firstName,
              middleName: emp.middleName,
              dateOfBirth: emp.dateOfBirth || undefined,
              gender: emp.gender,
              officeName: emp.officeHospitalName, // Map to backend field
              position: emp.positionFunction, // Map to backend field
              appointmentStatus: emp.appointmentStatus,
              appointmentFrom: emp.appointmentFrom || undefined,
              appointmentTo: emp.appointmentTo || undefined,
              status: emp.status,
              dateOfEmployment: emp.dateOfEmployment || undefined,
              dateOfSeparation: emp.dateOfSeparation || null,
              reasonForSeparation: emp.reasonForSeparation || null,
            }
            // Don't pass userId and userName to prevent individual audit logs during import
          );

          // Track successful imports for audit log
          successfulEmployees.push({
            firstName: emp.firstName,
            lastName: emp.lastName,
          });
        } catch (err: any) {
          failCount++;
          const errorMsg = err.message || 'Unknown error';
          // Check if it's a duplicate ID error from backend
          if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
            errors.push(`${emp.lastName}, ${emp.firstName}: Duplicate Employee ID`);
          } else {
            errors.push(`${emp.lastName}, ${emp.firstName}: ${errorMsg}`);
          }
        }
      }

      // Create bulk import audit log if any employees were successfully imported
      if (successfulEmployees.length > 0) {
        try {
          await api.audit.createBulkImport(
            currentUser?.id || 'system',
            `${currentUser?.lastName}, ${currentUser?.firstName}`,
            successfulEmployees
          );
        } catch (auditError) {
          console.error('Failed to create bulk import audit log:', auditError);
        }
      }

      // Refresh employee list
      setShowAllEmployees(true);
      await fetchEmployees();
      await fetchAllEmployeesForKPI(); // Refresh KPI data

      // Show result message
      if (failCount === 0) {
        showToast(`Successfully imported ${successfulEmployees.length} employee(s)!`, 'success');
      } else {
        let message = `Import completed: ${successfulEmployees.length} succeeded, ${failCount} failed.`;

        // Add duplicate information if any
        if (skippedDuplicates.length > 0) {
          message += `\n\nSkipped duplicates (${skippedDuplicates.length}): ${skippedDuplicates.slice(0, 2).join(', ')}${skippedDuplicates.length > 2 ? ` and ${skippedDuplicates.length - 2} more` : ''}`;
        }

        // Add other errors if any
        const otherErrors = errors.filter(e => !e.includes('Duplicate'));
        if (otherErrors.length > 0) {
          const errorMsg = otherErrors.slice(0, 2).join(', ');
          const moreErrors = otherErrors.length > 2 ? ` and ${otherErrors.length - 2} more` : '';
          message += `\n\nOther errors: ${errorMsg}${moreErrors}`;
        }

        showToast(message, 'warning');
      }

      setIsImportModalOpen(false);
    } catch (err: any) {
      console.error('Import error:', err);
      showToast(`Failed to import employees: ${err.message}`, 'error');
    }
  };

  const handleConfirmImport = async (
    importedEmployees: ImportedEmployee[],
    options?: { syncWithBackend?: boolean }
  ) => {
    const shouldSync = options?.syncWithBackend !== false;

    if (!shouldSync) {
      await runLegacyImport(importedEmployees);
      return;
    }

    const missingIdRecord = importedEmployees.find((emp) => !emp.id || !emp.id.trim());
    if (missingIdRecord) {
      showToast(
        'Sync mode requires Employee ID on every row. Please complete missing IDs or disable sync mode.',
        'warning'
      );
      return;
    }

    setPendingImportEmployees(importedEmployees);
    setIsImportSyncConfirmModalOpen(true);
  };

  const handleConfirmImportSync = async (authorizingUser: any) => {
    if (!pendingImportEmployees || pendingImportEmployees.length === 0) {
      setIsImportSyncConfirmModalOpen(false);
      return;
    }

    try {
      const result = await api.employee.syncImport(
        pendingImportEmployees.map((emp) => ({
          id: emp.id,
          lastName: emp.lastName,
          firstName: emp.firstName,
          middleName: emp.middleName,
          dateOfBirth: emp.dateOfBirth || null,
          gender: emp.gender,
          officeHospitalName: emp.officeHospitalName,
          appointmentStatus: emp.appointmentStatus,
          appointmentFrom: emp.appointmentFrom || null,
          appointmentTo: emp.appointmentTo || null,
          status: emp.status,
          positionFunction: emp.positionFunction,
          dateOfEmployment: emp.dateOfEmployment || null,
          dateOfSeparation: emp.dateOfSeparation || null,
          reasonForSeparation: emp.reasonForSeparation || null,
        })),
        currentUser?.id,
        `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
        authorizingUser?.id,
        `${authorizingUser?.lastName || ''}, ${authorizingUser?.firstName || ''}`.trim(),
        authorizingUser?.approvalToken
      );

      setShowAllEmployees(true);
      await fetchEmployees();
      await fetchAllEmployeesForKPI();
      fetchDropdownOptions(); // Refresh searchable dropdown choices

      showToast(
        `Sync complete: ${result.insertedCount} added, ${result.updatedCount} updated.`,
        'success'
      );

      setIsImportSyncConfirmModalOpen(false);
      setIsImportModalOpen(false);
      setPendingImportEmployees(null);
    } catch (error: any) {
      console.error('Sync import error:', error);
      showToast(error.message || 'Failed to sync imported employees', 'error');
    }
  };

  // Check if user has read permission
  if (!canRead) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        gap: '1rem'
      }}>
        <MdLock style={{ fontSize: '4rem', color: 'var(--color-danger)' }} />
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Access Denied</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '500px' }}>
          You do not have permission to view employee records.
          Please contact your administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div>
          <h1 className="dashboard__title">
            {viewMode === 'reports' ? 'Generated Reports' : 'Employee Management'}
          </h1>
          <p className="dashboard__subtitle">
            {viewMode === 'reports'
              ? 'View and generate reports of employees'
              : `Manage and track all employee records in the system (${allEmployees.length} employees)`}
          </p>
        </div>
        {viewMode !== 'reports' && (
          <div className="dashboard__header-actions">
            <DownloadTemplateButton onDownload={handleDownloadTemplate} variant="secondary" size="sm" />
            {canCreate && (
              <Button variant="secondary" size="sm" onClick={() => setIsImportModalOpen(true)}>
                <MdFileUpload /> Import
              </Button>
            )}
            <ExportButton employees={allEmployees} variant="secondary" size="sm" />
            <BackupButton employees={allEmployees} variant="secondary" size="sm" />
            <Button variant="secondary" size="sm" onClick={() => setIsBulkDownloadModalOpen(true)}>
              <MdQrCode /> Codes
            </Button>
            {canCreate && (
              <Button variant="primary" size="sm" onClick={handleOpenAddEmployeeModal}>
                + Add Employee
              </Button>
            )}
          </div>
        )}
      </div>

      {/* KPI Summary Cards */}
      {viewMode !== 'reports' && (
        <div className="dashboard__kpi-grid">
          <Card hoverable>
            <div className="dashboard__kpi-card">
              <div className="dashboard__kpi-header">
                <MdPeople className="dashboard__kpi-icon" style={{ color: '#3b82f6' }} />
                <span className="dashboard__kpi-label">Total Employees</span>
              </div>
              <div className="dashboard__kpi-body">
                <div className="dashboard__kpi-value">{allEmployees.length}</div>
              </div>
            </div>
          </Card>

          <Card hoverable>
            <div className="dashboard__kpi-card">
              <div className="dashboard__kpi-header">
                <MdCheckCircle className="dashboard__kpi-icon" style={{ color: '#22c55e' }} />
                <span className="dashboard__kpi-label">Active Employees</span>
              </div>
              <div className="dashboard__kpi-body">
                <div className="dashboard__kpi-value">
                  {allEmployees.filter(emp => emp.status === 'Active').length}
                </div>
              </div>
            </div>
          </Card>

          <Card hoverable>
            <div className="dashboard__kpi-card">
              <div className="dashboard__kpi-header">
                <MdPause className="dashboard__kpi-icon" style={{ color: '#f59e0b' }} />
                <span className="dashboard__kpi-label">Inactive Employees</span>
              </div>
              <div className="dashboard__kpi-body">
                <div className="dashboard__kpi-value">
                  {allEmployees.filter(emp => emp.status === 'Inactive').length}
                </div>
              </div>
            </div>
          </Card>

          <Card hoverable>
            <div className="dashboard__kpi-card">
              <div className="dashboard__kpi-header">
                <MdDescription className="dashboard__kpi-icon" style={{ color: '#8b5cf6' }} />
                <span className="dashboard__kpi-label">Total Documents</span>
              </div>
              <div className="dashboard__kpi-body">
                <div className="dashboard__kpi-value">
                  {allEmployees.reduce((sum, emp) => sum + ((emp as any).documents?.length || 0), 0)}
                </div>
              </div>
            </div>
          </Card>

          <Card hoverable>
            <div className="dashboard__kpi-card">
              <div className="dashboard__kpi-header">
                <MdStorage className="dashboard__kpi-icon" style={{ color: '#ec4899' }} />
                <span className="dashboard__kpi-label">Storage Used</span>
              </div>
              <div className="dashboard__kpi-body">
                <div className="dashboard__kpi-value">
                  {(allEmployees.reduce((sum, emp) => {
                    const docs = (emp as any).documents || [];
                    return sum + docs.reduce((docSum: number, doc: any) => docSum + (doc.fileSize || 0), 0);
                  }, 0) / (1024 * 1024)).toFixed(1)} MB
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {viewMode === 'reports' ? (
        <div className="reports-view">
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Search and Filter
              </h3>
              <span className="reports-view__summary-pill">Total AO Reports: {sortedReportRows.length}</span>
            </div>

            <div className="reports-view__filters-grid">
              <div className="reports-view__filter-card">
                <label className="dashboard__filter-label">Search Person</label>
                <input
                  type="text"
                  className="dashboard__form-input"
                  placeholder="Search by name..."
                  value={reportSearchName}
                  onChange={(e) => setReportSearchName(e.target.value)}
                />
              </div>

              <div className="reports-view__filter-card">
                <label className="dashboard__filter-label">AO Status</label>
                <select
                  className="dashboard__filter-select"
                  value={reportAoStatus}
                  onChange={(e) => setReportAoStatus(e.target.value as 'Detailed' | 'Designated' | 'All Employees')}
                >
                  <option value="All Employees">All Employees</option>
                  <option value="Detailed">Detailed</option>
                  <option value="Designated">Designated</option>
                </select>
              </div>

              <div className="reports-view__filter-card">
                <label className="dashboard__filter-label">Mother Unit</label>
                <SearchableDropdown
                  options={uniqueMotherUnitsInDatabase}
                  value={reportMotherUnit === 'all' ? '' : reportMotherUnit}
                  onChange={(val) => setReportMotherUnit(val === '' ? 'all' : val)}
                  placeholder="All Mother Units"
                />
              </div>

              <div className="reports-view__filter-card">
                <label className="dashboard__filter-label">AO Number</label>
                <input
                  type="text"
                  className="dashboard__form-input"
                  placeholder="Search by AO Number..."
                  value={reportAoNumber}
                  onChange={(e) => setReportAoNumber(e.target.value)}
                />
              </div>

              <div className="reports-view__filter-card">
                <label className="dashboard__filter-label">Series Year</label>
                <input
                  type="text"
                  className="dashboard__form-input"
                  placeholder="Search by Series Year..."
                  value={reportAoYear}
                  onChange={(e) => setReportAoYear(e.target.value)}
                />
              </div>



            </div>

            <div className="reports-view__filter-row reports-view__filter-row--compact" style={{ marginTop: '0.75rem' }}>
              <div className="reports-view__filter-card">
                <label className="dashboard__filter-label">Administrative Orders Issued Month From</label>
                <select
                  className="dashboard__filter-select"
                  value={reportAoOrderMonthFrom}
                  onChange={(e) => setReportAoOrderMonthFrom(e.target.value)}
                >
                  <option value="">All Months</option>
                  <option value="01">January</option>
                  <option value="02">February</option>
                  <option value="03">March</option>
                  <option value="04">April</option>
                  <option value="05">May</option>
                  <option value="06">June</option>
                  <option value="07">July</option>
                  <option value="08">August</option>
                  <option value="09">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </div>

              <div className="reports-view__filter-card">
                <label className="dashboard__filter-label">Administrative Orders Issued Month To</label>
                <select
                  className="dashboard__filter-select"
                  value={reportAoOrderMonthTo}
                  onChange={(e) => setReportAoOrderMonthTo(e.target.value)}
                >
                  <option value="">All Months</option>
                  <option value="01">January</option>
                  <option value="02">February</option>
                  <option value="03">March</option>
                  <option value="04">April</option>
                  <option value="05">May</option>
                  <option value="06">June</option>
                  <option value="07">July</option>
                  <option value="08">August</option>
                  <option value="09">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setReportSearchName('');
                  setReportMotherUnit('all');
                  setReportDetailedOffice('all');
                  setReportDesignatedPosition('all');
                  setReportAoNumber('');
                  setReportAoYear('');
                  setReportAoOrderMonthFrom('');
                  setReportAoOrderMonthTo('');
                  setReportAoStatus('All Employees');
                  setReportSortPriority([]);
                  setReportActiveTab('active');
                }}
              >
                Reset Filters
              </Button>
            </div>
          </Card>

          {/* Metric Cards */}
          <div className="reports-view__metrics-grid">
            <div className="reports-view__metric-card" style={{ borderLeft: '4px solid var(--color-success)' }}>
              <div className="reports-view__metric-icon-wrapper" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--color-success)' }}>
                ✔
              </div>
              <div className="reports-view__metric-info">
                <span className="reports-view__metric-value">{new Set(filteredReportRows.filter((row) => row.status === 'Active').map((row) => row.employeeId)).size}</span>
                <span className="reports-view__metric-label">Active Employees</span>
              </div>
            </div>

            <div className="reports-view__metric-card" style={{ borderLeft: '4px solid var(--color-danger)' }}>
              <div className="reports-view__metric-icon-wrapper" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}>
                ✖
              </div>
              <div className="reports-view__metric-info">
                <span className="reports-view__metric-value">{new Set(filteredReportRows.filter((row) => row.status === 'Inactive').map((row) => row.employeeId)).size}</span>
                <span className="reports-view__metric-label">Inactive Employees</span>
              </div>
            </div>

            <div className="reports-view__metric-card" style={{ borderLeft: '4px solid var(--color-warning)' }}>
              <div className="reports-view__metric-icon-wrapper" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--color-warning)' }}>
                ⚠️
              </div>
              <div className="reports-view__metric-info">
                <span className="reports-view__metric-value">
                  {filteredReportRows.filter((row) => isNearExpiration(row.durationTo)).length}
                </span>
                <span className="reports-view__metric-label">Near Expiration (30 Days)</span>
              </div>
            </div>

            <div className="reports-view__metric-card" style={{ borderLeft: '4px solid var(--color-danger)' }}>
              <div className="reports-view__metric-icon-wrapper" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)' }}>
                🚫
              </div>
              <div className="reports-view__metric-info">
                <span className="reports-view__metric-value">
                  {filteredReportRows.filter((row) => isExpired(row.durationTo)).length}
                </span>
                <span className="reports-view__metric-label">Reached Deadline (Expired)</span>
              </div>
            </div>
          </div>

          {/* Tabs for detailed listings */}
          <Card>
            <div className="reports-view__tabs">
              <button
                className={`reports-view__tab-btn${reportActiveTab === 'active' ? ' reports-view__tab-btn--active' : ''}`}
                onClick={() => setReportActiveTab('active')}
              >
                🟢 Active Employees ({new Set(filteredReportRows.filter((row) => row.status === 'Active').map((row) => row.employeeId)).size})
              </button>
              <button
                className={`reports-view__tab-btn${reportActiveTab === 'inactive' ? ' reports-view__tab-btn--active' : ''}`}
                onClick={() => setReportActiveTab('inactive')}
              >
                🔴 Inactive Employees ({new Set(filteredReportRows.filter((row) => row.status === 'Inactive').map((row) => row.employeeId)).size})
              </button>
              <button
                className={`reports-view__tab-btn${reportActiveTab === 'expiring' ? ' reports-view__tab-btn--active' : ''}`}
                onClick={() => setReportActiveTab('expiring')}
              >
                ⚠️ Near Expiration ({filteredReportRows.filter((row) => isNearExpiration(row.durationTo)).length})
              </button>
              <button
                className={`reports-view__tab-btn${reportActiveTab === 'expired' ? ' reports-view__tab-btn--active' : ''}`}
                onClick={() => setReportActiveTab('expired')}
              >
                🚫 Reached Deadline ({filteredReportRows.filter((row) => isExpired(row.durationTo)).length})
              </button>
            </div>

            <div className="reports-view__export-actions">
              {selectedReportRowIds.size > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDeleteReportEntries(Array.from(selectedReportRowIds))}
                  style={{ marginRight: 'auto' }}
                >
                  🗑️ Delete Selected ({selectedReportRowIds.size})
                </Button>
              )}

              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsReportPreviewOpen(true)}
                disabled={sortedReportRows.length === 0}
              >
                🖨️ View & Print
              </Button>
              <div ref={dropdownRef} className="reports-view__columns-control" style={{ position: 'relative' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)}
                >
                  ⚙️ Columns
                </Button>
                {isColumnDropdownOpen && (
                  <div className="reports-view__columns-dropdown">
                    <div className="reports-view__columns-dropdown-header">
                      <button
                        type="button"
                        onClick={handleSelectAllColumns}
                        className="reports-view__columns-link"
                      >
                        Select All
                      </button>
                      <span className="reports-view__columns-divider">|</span>
                      <button
                        type="button"
                        onClick={handleClearAllColumns}
                        className="reports-view__columns-link"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="reports-view__columns-dropdown-list">
                      {currentAvailableKeys.map((key) => (
                        <label key={key} className="reports-view__columns-item">
                          <input
                            type="checkbox"
                            className="reports-view__columns-checkbox"
                            checked={visibleColumns[key] !== false}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setVisibleColumns((prev) => {
                                const next = { ...prev, [key]: checked };
                                localStorage.setItem('report_visible_columns', JSON.stringify(next));
                                return next;
                              });
                            }}
                          />
                          <span className="reports-view__columns-label">{COLUMN_LABELS[key] || key}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="reports-view__table-container">
              <div className="dashboard__table-scroll" style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
                <Table
                  columns={reportColumns}
                  data={paginatedReports}
                  keyExtractor={(row) => row.id}
                  onRowClick={() => undefined}
                  emptyMessage="No AO reports matching filters found"
                />
              </div>
              {reportsForActiveTab.length > 0 && (
                <div className="dashboard__pagination" style={{ borderBottomLeftRadius: 'var(--border-radius-lg)', borderBottomRightRadius: 'var(--border-radius-lg)', border: '1px solid var(--border-color)', borderTop: 'none', backgroundColor: 'var(--bg-primary)' }}>
                  <div className="dashboard__page-size">
                    <span className="dashboard__page-size-label">Rows per page:</span>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <button
                        key={size}
                        className={`dashboard__page-size-btn${reportItemsPerPage === size ? ' dashboard__page-size-btn--active' : ''}`}
                        onClick={() => {
                          setReportItemsPerPage(size);
                          setReportCurrentPage(1);
                        }}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  {reportTotalPages > 1 && (
                    <div className="dashboard__pagination-controls">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReportCurrentPage(1)}
                        disabled={reportCurrentPage === 1}
                      >
                        First
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReportCurrentPage(reportCurrentPage - 1)}
                        disabled={reportCurrentPage === 1}
                      >
                        Previous
                      </Button>
                      <div className="dashboard__pagination-info">
                        Page {reportCurrentPage} of {reportTotalPages}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReportCurrentPage(reportCurrentPage + 1)}
                        disabled={reportCurrentPage === reportTotalPages}
                      >
                        Next
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReportCurrentPage(reportTotalPages)}
                        disabled={reportCurrentPage === reportTotalPages}
                      >
                        Last
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : (
        <>
          <PermissionBanner />

          <Card>
            {/* Bulk Actions Bar */}
            {canDelete && selectedEmployeeIds.size > 0 && (
              <div className="dashboard__bulk-actions">
                <div className="dashboard__bulk-info">
                  <span className="dashboard__bulk-count">{selectedEmployeeIds.size} selected</span>
                  <button
                    className="dashboard__bulk-clear"
                    onClick={() => setSelectedEmployeeIds(new Set())}
                  >
                    Clear selection
                  </button>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleOpenBulkDeleteModal}
                >
                  <MdDelete style={{ marginRight: '0.25rem' }} /> Delete Selected ({selectedEmployeeIds.size})
                </Button>
              </div>
            )}

            <div className="dashboard__filters">
              <div className="dashboard__search-container">
                <SearchBar
                  placeholder={`Search by ${searchFilterType === 'all' ? 'name' : searchFilterType.replace('_', ' ')}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClear={handleClearSearch}
                  fullWidth
                />

                <div className="dashboard__search-filters">
                  <label className="dashboard__radio-label">
                    <input
                      type="radio"
                      name="searchFilter"
                      value="all"
                      checked={searchFilterType === 'all'}
                      onChange={(e) => setSearchFilterType(e.target.value as any)}
                      className="dashboard__radio-input"
                    />
                    <span className="dashboard__radio-text">All Fields</span>
                  </label>

                  <label className="dashboard__radio-label">
                    <input
                      type="radio"
                      name="searchFilter"
                      value="last_name"
                      checked={searchFilterType === 'last_name'}
                      onChange={(e) => setSearchFilterType(e.target.value as any)}
                      className="dashboard__radio-input"
                    />
                    <span className="dashboard__radio-text">Last Name</span>
                  </label>

                  <label className="dashboard__radio-label">
                    <input
                      type="radio"
                      name="searchFilter"
                      value="first_name"
                      checked={searchFilterType === 'first_name'}
                      onChange={(e) => setSearchFilterType(e.target.value as any)}
                      className="dashboard__radio-input"
                    />
                    <span className="dashboard__radio-text">First Name</span>
                  </label>

                  <label className="dashboard__radio-label">
                    <input
                      type="radio"
                      name="searchFilter"
                      value="middle_name"
                      checked={searchFilterType === 'middle_name'}
                      onChange={(e) => setSearchFilterType(e.target.value as any)}
                      className="dashboard__radio-input"
                    />
                    <span className="dashboard__radio-text">Middle Name</span>
                  </label>

                  <label className="dashboard__radio-label">
                    <input
                      type="radio"
                      name="searchFilter"
                      value="id"
                      checked={searchFilterType === 'id'}
                      onChange={(e) => setSearchFilterType(e.target.value as any)}
                      className="dashboard__radio-input"
                    />
                    <span className="dashboard__radio-text">Employee ID</span>
                  </label>


                  <div className="dashboard__status-filter">
                    <label htmlFor="status-filter" className="dashboard__filter-label">
                      Status:
                    </label>
                    <select
                      id="status-filter"
                      className="dashboard__filter-select"
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value as EmployeeStatus | 'all');
                        setCurrentPage(1);
                      }}
                    >
                      <option value="all">All Status</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  <div className="dashboard__toggle-container">
                    <label className="dashboard__toggle-label">
                      <input
                        type="checkbox"
                        checked={showAllEmployees}
                        onChange={(e) => setShowAllEmployees(e.target.checked)}
                        className="dashboard__toggle-input"
                      />
                      <span className="dashboard__toggle-text">Show All Employees</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Empty State - No Search */}
            {!searchQuery.trim() && !showAllEmployees && !isLoading && (
              <div className="dashboard__empty-state">
                <MdPeople className="dashboard__empty-icon" />
                <h3 className="dashboard__empty-title">Search employees to display results</h3>
                <p className="dashboard__empty-text">
                  Use the search bar above to find employees by name, or toggle "Show All Employees" to view the complete list
                </p>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="dashboard__loading-state">
                <div className="dashboard__spinner"></div>
                <p className="dashboard__loading-text">Searching employees...</p>
              </div>
            )}

            {/* No Results State */}
            {!isLoading && (searchQuery.trim() || showAllEmployees) && filteredEmployees.length === 0 && (
              <div className="dashboard__empty-state">
                <MdPeople className="dashboard__empty-icon" />
                <h3 className="dashboard__empty-title">No employees found</h3>
                <p className="dashboard__empty-text">
                  Try adjusting your search criteria or filters
                </p>
              </div>
            )}

            {/* Results Table */}
            {!isLoading && (searchQuery.trim() || showAllEmployees) && filteredEmployees.length > 0 && (
              <>
                <div className="dashboard__table-scroll">
                  <Table
                    columns={columns}
                    data={paginatedEmployees}
                    keyExtractor={(employee) => employee.id}
                    onRowClick={handleRowClick}
                    emptyMessage="No employees found"
                  />
                </div>

                <div className="dashboard__pagination">
                  <div className="dashboard__page-size">
                    <span className="dashboard__page-size-label">Rows per page:</span>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <button
                        key={size}
                        className={`dashboard__page-size-btn${itemsPerPage === size ? ' dashboard__page-size-btn--active' : ''}`}
                        onClick={() => handleItemsPerPageChange(size)}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="dashboard__pagination-controls">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePageChange(1)}
                        disabled={currentPage === 1}
                      >
                        First
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <div className="dashboard__pagination-info">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePageChange(totalPages)}
                        disabled={currentPage === totalPages}
                      >
                        Last
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddEmployeeModalOpen}
        onClose={handleCloseAddEmployeeModal}
        title="Add New Employee"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseAddEmployeeModal}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveEmployee}>
              Save Employee
            </Button>
          </>
        }
      >
        <div className="dashboard__employee-form">
          <Input
            id="employee-id"
            label="Employee ID *"
            placeholder="Enter employee ID (e.g., EMP-001)"
            value={formData.id}
            onChange={(e) => handleFormChange('id', e.target.value)}
            error={formErrors.id}
            fullWidth
          />

          <div className="dashboard__form-row">
            <Input
              id="last-name"
              label="Last Name"
              placeholder="Enter last name"
              value={formData.lastName}
              onChange={(e) => handleFormChange('lastName', e.target.value)}
              error={formErrors.lastName}
              fullWidth
            />
            <Input
              id="first-name"
              label="First Name"
              placeholder="Enter first name"
              value={formData.firstName}
              onChange={(e) => handleFormChange('firstName', e.target.value)}
              error={formErrors.firstName}
              fullWidth
            />
          </div>

          <Input
            id="middle-name"
            label="Middle Name"
            placeholder="Enter middle name (optional)"
            value={formData.middleName}
            onChange={(e) => handleFormChange('middleName', e.target.value)}
            fullWidth
          />

          <Input
            id="date-of-birth"
            label="Date of Birth"
            type="date"
            placeholder="Select date of birth (optional)"
            value={formData.dateOfBirth}
            onChange={(e) => handleFormChange('dateOfBirth', e.target.value)}
            fullWidth
          />

          <div className="dashboard__form-field">
            <label htmlFor="gender" className="dashboard__form-label">
              Gender <span className="dashboard__required">*</span>
            </label>
            <select
              id="gender"
              className="dashboard__form-select"
              value={formData.gender}
              onChange={(e) => handleFormChange('gender', e.target.value)}
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            {formErrors.gender && <span className="dashboard__error">{formErrors.gender}</span>}
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="office-hospital-name" className="dashboard__form-label">
              Office / Hospital Name <span className="dashboard__required">*</span>
            </label>
            <SearchableDropdown
              id="office-hospital-name"
              options={dropdownOptions.officeNames}
              value={formData.officeHospitalName}
              onChange={(val) => handleFormChange('officeHospitalName', val)}
              placeholder="Select or enter office or hospital name"
            />
            {formErrors.officeHospitalName && <span className="dashboard__error">{formErrors.officeHospitalName}</span>}
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="position-function" className="dashboard__form-label">
              Position / Function <span className="dashboard__required">*</span>
            </label>
            <SearchableDropdown
              id="position-function"
              options={dropdownOptions.positions}
              value={formData.positionFunction}
              onChange={(val) => handleFormChange('positionFunction', val)}
              placeholder="Select or enter position or function"
            />
            {formErrors.positionFunction && <span className="dashboard__error">{formErrors.positionFunction}</span>}
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="status" className="dashboard__form-label">
              Status <span className="dashboard__required">*</span>
            </label>
            <select
              id="status"
              className="dashboard__form-select"
              value={formData.status}
              onChange={(e) => handleFormChange('status', e.target.value as EmployeeStatus)}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <Input
            id="date-of-employment"
            label="Date of Employment"
            type="date"
            value={formData.dateOfEmployment}
            onChange={(e) => handleFormChange('dateOfEmployment', e.target.value)}
            error={formErrors.dateOfEmployment}
            fullWidth
          />

          {formData.status === 'Inactive' && (
            <>
              <Input
                id="date-of-separation"
                label="Date of Separation"
                type="date"
                value={formData.dateOfSeparation}
                onChange={(e) => handleFormChange('dateOfSeparation', e.target.value)}
                error={formErrors.dateOfSeparation}
                fullWidth
              />

              <div className="dashboard__form-field">
                <label htmlFor="reasonForSeparation" className="dashboard__form-label">
                  Reason for Separation <span className="dashboard__required">*</span>
                </label>
                <select
                  id="reasonForSeparation"
                  className="dashboard__form-select"
                  value={formData.reasonForSeparation}
                  onChange={(e) => handleFormChange('reasonForSeparation', e.target.value)}
                >
                  <option value="">Select reason for separation</option>
                  {dropdownOptions.reasonsForSeparation.map((reason) => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
                {formErrors.reasonForSeparation && (
                  <span className="dashboard__error">{formErrors.reasonForSeparation}</span>
                )}
              </div>
            </>
          )}

          <div className="dashboard__form-field">
            <label htmlFor="appointmentStatus" className="dashboard__form-label">
              Appointment Status <span className="dashboard__required">*</span>
            </label>
            <select
              id="appointmentStatus"
              className="dashboard__form-select"
              value={formData.appointmentStatus}
              onChange={(e) => handleFormChange('appointmentStatus', e.target.value as AppointmentStatus)}
            >
              <option value="">Select appointment status</option>
              {dropdownOptions.appointmentStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {formErrors.appointmentStatus && <span className="dashboard__error">{formErrors.appointmentStatus}</span>}
          </div>

          {/* Durational appointment statuses conditional date inputs */}
          {formData.appointmentStatus && (
            (() => {
              const s = formData.appointmentStatus.toLowerCase().trim();
              return (
                s === 'consultant' ||
                s === 'contract of service' ||
                s === 'contractual' ||
                s === 'casual' ||
                s === 'job order'
              );
            })()
          ) && (
              <div className="dashboard__form-row">
                <Input
                  id="appointment-from"
                  label="Appointment From"
                  type="date"
                  value={formData.appointmentFrom}
                  onChange={(e) => handleFormChange('appointmentFrom', e.target.value)}
                  error={formErrors.appointmentFrom}
                  fullWidth
                />
                <Input
                  id="appointment-to"
                  label="Appointment To"
                  type="date"
                  value={formData.appointmentTo}
                  onChange={(e) => handleFormChange('appointmentTo', e.target.value)}
                  error={formErrors.appointmentTo}
                  fullWidth
                />
              </div>
            )}

          <div className="dashboard__form-field">
            <label htmlFor="ao-type" className="dashboard__form-label">
              AO Status
            </label>
            <select
              id="ao-type"
              className="dashboard__form-select"
              value={formData.aoType}
              onChange={(e) => handleFormChange('aoType', e.target.value as any)}
            >
              <option value="">Select AO Type</option>
              <option value="Detailed">Detailed</option>
              <option value="Designated">Designated</option>
            </select>
          </div>

          <div className="dashboard__form-row">
            <Input
              id="ao-number"
              label="AO Number"
              placeholder="Enter Administrative Order number"
              value={formData.aoNumber}
              onChange={(e) => handleFormChange('aoNumber', e.target.value)}
              fullWidth
            />
            <div className="dashboard__form-field">
              <label htmlFor="ao-year" className="dashboard__form-label">
                Series
              </label>
              <select
                id="ao-year"
                className={`dashboard__form-select${formErrors.aoYear ? ' dashboard__form-select--error' : ''}`}
                value={formData.aoYear}
                onChange={(e) => handleFormChange('aoYear', e.target.value)}
              >
                <option value="">Select series year</option>
                {dropdownOptions.aoYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              {formErrors.aoYear && <span className="dashboard__error">{formErrors.aoYear}</span>}
            </div>
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="ao-file" className="dashboard__form-label">
              Upload AO PDF File {formData.aoNumber.trim() ? '(Required)' : '(Optional)'}
            </label>
            <input
              id="ao-file"
              className="dashboard__form-input"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setAoFile(e.target.files?.[0] || null)}
              style={{
                padding: '0.5rem',
                border: '1px dashed var(--border-color)',
                borderRadius: 'var(--border-radius)',
                backgroundColor: 'var(--bg-secondary)',
                width: '100%'
              }}
            />
            {aoFile && (
              <>
                <p style={{
                  fontSize: '0.8125rem',
                  marginTop: '0.375rem',
                  color: 'var(--color-success)',
                  fontWeight: 500
                }}>
                  ✓ Selected file: {aoFile.name} ({(aoFile.size / 1024).toFixed(1)} KB)
                </p>
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="add-auto-rename"
                    checked={autoRename}
                    onChange={(e) => setAutoRename(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="add-auto-rename" style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    Auto rename file according to AO details
                  </label>
                </div>
              </>
            )}
            {formErrors.aoNumber && <span className="dashboard__error">{formErrors.aoNumber}</span>}
          </div>

          {formData.aoType === 'Detailed' && (
            <>
              <div className="dashboard__form-field">
                <label htmlFor="detailedTo" className="dashboard__form-label">
                  Detailed/Transferred Office
                </label>
                <SearchableDropdown
                  id="detailedTo"
                  options={dropdownOptions.officeNames}
                  value={formData.detailedTo}
                  onChange={(val) => handleFormChange('detailedTo', val)}
                  placeholder="Select or enter office"
                />
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="detailedDivision" className="dashboard__form-label">
                  Division
                </label>
                <input
                  id="detailedDivision"
                  className="dashboard__form-input"
                  type="text"
                  placeholder="Enter division"
                  value={formData.detailedDivision}
                  onChange={(e) => handleFormChange('detailedDivision', e.target.value)}
                />
              </div>

              <div className="dashboard__form-row">
                <Input
                  id="appointment-from-add"
                  label="Duration of Detailed Order (From)"
                  type="date"
                  value={formData.appointmentFrom}
                  onChange={(e) => handleFormChange('appointmentFrom', e.target.value)}
                  fullWidth
                />
                <Input
                  id="appointment-to-add"
                  label="Duration of Detailed Order (To)"
                  type="date"
                  value={formData.appointmentTo}
                  onChange={(e) => handleFormChange('appointmentTo', e.target.value)}
                  fullWidth
                />
              </div>
            </>
          )}

          {formData.aoType === 'Designated' && (
            <>
              <div className="dashboard__form-field">
                <label htmlFor="designatedOffice" className="dashboard__form-label">
                  Designated Office
                </label>
                <SearchableDropdown
                  id="designatedOffice"
                  options={dropdownOptions.officeNames}
                  value={formData.detailedTo}
                  onChange={(val) => handleFormChange('detailedTo', val)}
                  placeholder="Select or enter designated office"
                />
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="designatedPositionFunction" className="dashboard__form-label">
                  Designated Position Function
                </label>
                <SearchableDropdown
                  id="designatedPositionFunction"
                  options={dropdownOptions.positions}
                  value={formData.designatedPositionFunction}
                  onChange={(val) => handleFormChange('designatedPositionFunction', val)}
                  placeholder="Select or enter position function"
                />
              </div>

              <div className="dashboard__form-row">
                <Input
                  id="designated-order-from"
                  label="Designated Order (From)"
                  type="date"
                  value={formData.designatedOrderFrom}
                  onChange={(e) => handleFormChange('designatedOrderFrom', e.target.value)}
                  fullWidth
                />
                <Input
                  id="designated-order-to"
                  label="Designated Order (To)"
                  type="date"
                  value={formData.designatedOrderTo}
                  onChange={(e) => handleFormChange('designatedOrderTo', e.target.value)}
                  fullWidth
                />
              </div>
            </>
          )}

          <Input
            id="filebox-location"
            label="201 File Location"
            type="text"
            placeholder="Enter 201 file location"
            value={formData.fileboxLocation}
            onChange={(e) => handleFormChange('fileboxLocation', e.target.value)}
            fullWidth
          />
        </div>
      </Modal>


      {/* Update Employee Modal */}
      <Modal
        isOpen={isUpdateEmployeeModalOpen}
        onClose={handleCloseUpdateEmployeeModal}
        title="Update Employee"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseUpdateEmployeeModal}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpdateEmployee}>
              Update Employee
            </Button>
          </>
        }
      >
        <div className="dashboard__employee-form">
          <p style={{
            marginBottom: '1.5rem',
            padding: '0.75rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--border-radius)',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)'
          }}>
            ℹ️ Update only the fields you want to change. Unchanged fields will retain their existing values.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
              Current Employee ID
            </label>
            <div style={{
              padding: '0.75rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: 'var(--border-radius)',
              fontSize: '0.875rem',
              color: 'var(--text-secondary)',
              fontFamily: 'monospace'
            }}>
              {selectedEmployee?.id}
            </div>
          </div>

          <div className="dashboard__id-update-section" style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Update Employee ID (Optional)
            </h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              ⚠️ Changing the Employee ID will update all references including documents and audit logs. Use with caution.
            </p>

            <Input
              id="edit-employee-id"
              label="New Employee ID"
              placeholder="Enter new employee ID (e.g., EMP-002)"
              value={formData.id}
              onChange={(e) => handleFormChange('id', e.target.value)}
              fullWidth
            />
          </div>

          <div className="dashboard__form-row">
            <Input
              id="edit-last-name"
              label="Last Name"
              placeholder="Enter last name"
              value={formData.lastName}
              onChange={(e) => handleFormChange('lastName', e.target.value)}
              error={formErrors.lastName}
              fullWidth
            />
            <Input
              id="edit-first-name"
              label="First Name"
              placeholder="Enter first name"
              value={formData.firstName}
              onChange={(e) => handleFormChange('firstName', e.target.value)}
              error={formErrors.firstName}
              fullWidth
            />
          </div>

          <Input
            id="edit-middle-name"
            label="Middle Name"
            placeholder="Enter middle name (optional)"
            value={formData.middleName}
            onChange={(e) => handleFormChange('middleName', e.target.value)}
            fullWidth
          />

          <Input
            id="edit-date-of-birth"
            label="Date of Birth"
            type="date"
            placeholder="Select date of birth (optional)"
            value={formData.dateOfBirth}
            onChange={(e) => handleFormChange('dateOfBirth', e.target.value)}
            fullWidth
          />

          <div className="dashboard__form-field">
            <label htmlFor="update-gender" className="dashboard__form-label">
              Gender
            </label>
            <select
              id="update-gender"
              className="dashboard__form-select"
              value={formData.gender}
              onChange={(e) => handleFormChange('gender', e.target.value)}
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            {formErrors.gender && <span className="dashboard__error">{formErrors.gender}</span>}
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="edit-office-hospital-name" className="dashboard__form-label">
              Office / Hospital Name
            </label>
            <SearchableDropdown
              id="edit-office-hospital-name"
              options={dropdownOptions.officeNames}
              value={formData.officeHospitalName}
              onChange={(val) => handleFormChange('officeHospitalName', val)}
              placeholder="Select or enter office or hospital name"
            />
            {formErrors.officeHospitalName && <span className="dashboard__error">{formErrors.officeHospitalName}</span>}
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="edit-position-function" className="dashboard__form-label">
              Position / Function
            </label>
            <SearchableDropdown
              id="edit-position-function"
              options={dropdownOptions.positions}
              value={formData.positionFunction}
              onChange={(val) => handleFormChange('positionFunction', val)}
              placeholder="Select or enter position or function"
            />
            {formErrors.positionFunction && <span className="dashboard__error">{formErrors.positionFunction}</span>}
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="update-status" className="dashboard__form-label">
              Status
            </label>
            <select
              id="update-status"
              className="dashboard__form-select"
              value={formData.status}
              onChange={(e) => handleFormChange('status', e.target.value as EmployeeStatus)}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <Input
            id="edit-date-of-employment"
            label="Date of Employment"
            type="date"
            value={formData.dateOfEmployment}
            onChange={(e) => handleFormChange('dateOfEmployment', e.target.value)}
            error={formErrors.dateOfEmployment}
            fullWidth
          />

          {formData.status === 'Inactive' && (
            <>
              <Input
                id="edit-date-of-separation"
                label="Date of Separation"
                type="date"
                value={formData.dateOfSeparation}
                onChange={(e) => handleFormChange('dateOfSeparation', e.target.value)}
                error={formErrors.dateOfSeparation}
                fullWidth
              />

              <div className="dashboard__form-field">
                <label htmlFor="update-reasonForSeparation" className="dashboard__form-label">
                  Reason for Separation
                </label>
                <select
                  id="update-reasonForSeparation"
                  className="dashboard__form-select"
                  value={formData.reasonForSeparation}
                  onChange={(e) => handleFormChange('reasonForSeparation', e.target.value)}
                >
                  <option value="">Select reason for separation</option>
                  {dropdownOptions.reasonsForSeparation.map((reason) => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
                {formErrors.reasonForSeparation && (
                  <span className="dashboard__error">{formErrors.reasonForSeparation}</span>
                )}
              </div>
            </>
          )}

          <div className="dashboard__form-field">
            <label htmlFor="update-appointmentStatus" className="dashboard__form-label">
              Appointment Status
            </label>
            <select
              id="update-appointmentStatus"
              className="dashboard__form-select"
              value={formData.appointmentStatus}
              onChange={(e) => handleFormChange('appointmentStatus', e.target.value as AppointmentStatus)}
            >
              <option value="">Select appointment status</option>
              {dropdownOptions.appointmentStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {formErrors.appointmentStatus && <span className="dashboard__error">{formErrors.appointmentStatus}</span>}
          </div>

          {/* Durational appointment statuses conditional date inputs */}
          {formData.appointmentStatus && (
            (() => {
              const s = formData.appointmentStatus.toLowerCase().trim();
              return (
                s === 'consultant' ||
                s === 'contract of service' ||
                s === 'contractual' ||
                s === 'casual' ||
                s === 'job order'
              );
            })()
          ) && (
              <div className="dashboard__form-row">
                <Input
                  id="edit-appointment-from"
                  label="Appointment From"
                  type="date"
                  value={formData.appointmentFrom}
                  onChange={(e) => handleFormChange('appointmentFrom', e.target.value)}
                  error={formErrors.appointmentFrom}
                  fullWidth
                />
                <Input
                  id="edit-appointment-to"
                  label="Appointment To"
                  type="date"
                  value={formData.appointmentTo}
                  onChange={(e) => handleFormChange('appointmentTo', e.target.value)}
                  error={formErrors.appointmentTo}
                  fullWidth
                />
              </div>
            )}

          <div className="dashboard__form-field">
            <label htmlFor="update-ao-type" className="dashboard__form-label">
              Type of AO
            </label>
            <select
              id="update-ao-type"
              className="dashboard__form-select"
              value={formData.aoType}
              onChange={(e) => handleFormChange('aoType', e.target.value as any)}
            >
              <option value="">Select AO Type</option>
              <option value="Detailed">Detailed</option>
              <option value="Designated">Designated</option>
            </select>
          </div>

          <div className="dashboard__form-row">
            <Input
              id="update-ao-number"
              label="AO Number"
              placeholder="Enter Administrative Order number"
              value={formData.aoNumber}
              onChange={(e) => handleFormChange('aoNumber', e.target.value)}
              fullWidth
            />
            <div className="dashboard__form-field">
              <label htmlFor="update-ao-year" className="dashboard__form-label">
                Series
              </label>
              <select
                id="update-ao-year"
                className={`dashboard__form-select${formErrors.aoYear ? ' dashboard__form-select--error' : ''}`}
                value={formData.aoYear}
                onChange={(e) => handleFormChange('aoYear', e.target.value)}
              >
                <option value="">Select series year</option>
                {dropdownOptions.aoYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              {formErrors.aoYear && <span className="dashboard__error">{formErrors.aoYear}</span>}
            </div>
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="update-ao-file" className="dashboard__form-label">
              Upload AO PDF File {formData.aoNumber.trim() && formData.aoNumber !== originalEmployeeData?.aoNumber ? '(Required)' : '(Optional)'}
            </label>
            <input
              id="update-ao-file"
              className="dashboard__form-input"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setAoFile(e.target.files?.[0] || null)}
              style={{
                padding: '0.5rem',
                border: '1px dashed var(--border-color)',
                borderRadius: 'var(--border-radius)',
                backgroundColor: 'var(--bg-secondary)',
                width: '100%'
              }}
            />
            {aoFile && (
              <>
                <p style={{
                  fontSize: '0.8125rem',
                  marginTop: '0.375rem',
                  color: 'var(--color-success)',
                  fontWeight: 500
                }}>
                  ✓ Selected file: {aoFile.name} ({(aoFile.size / 1024).toFixed(1)} KB)
                </p>
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="update-auto-rename"
                    checked={autoRename}
                    onChange={(e) => setAutoRename(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="update-auto-rename" style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    Auto rename file according to AO details
                  </label>
                </div>
              </>
            )}
            {formErrors.aoNumber && <span className="dashboard__error">{formErrors.aoNumber}</span>}
          </div>

          {formData.aoType === 'Detailed' && (
            <>
              <div className="dashboard__form-field">
                <label htmlFor="edit-detailedTo" className="dashboard__form-label">
                  Detailed/Transferred Office
                </label>
                <SearchableDropdown
                  id="edit-detailedTo"
                  options={dropdownOptions.officeNames}
                  value={formData.detailedTo}
                  onChange={(val) => handleFormChange('detailedTo', val)}
                  placeholder="Select or enter office"
                />
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="edit-detailedDivision" className="dashboard__form-label">
                  Division
                </label>
                <input
                  id="edit-detailedDivision"
                  className="dashboard__form-input"
                  type="text"
                  placeholder="Enter division"
                  value={formData.detailedDivision}
                  onChange={(e) => handleFormChange('detailedDivision', e.target.value)}
                />
              </div>

              <div className="dashboard__form-row">
                <Input
                  id="edit-appointment-from-detailed"
                  label="Duration of Detailed Order (From)"
                  type="date"
                  value={formData.appointmentFrom}
                  onChange={(e) => handleFormChange('appointmentFrom', e.target.value)}
                  fullWidth
                />
                <Input
                  id="edit-appointment-to-detailed"
                  label="Duration of Detailed Order (To)"
                  type="date"
                  value={formData.appointmentTo}
                  onChange={(e) => handleFormChange('appointmentTo', e.target.value)}
                  fullWidth
                />
              </div>
            </>
          )}

          {formData.aoType === 'Designated' && (
            <>
              <div className="dashboard__form-field">
                <label htmlFor="edit-designatedOffice" className="dashboard__form-label">
                  Designated Office
                </label>
                <SearchableDropdown
                  id="edit-designatedOffice"
                  options={dropdownOptions.officeNames}
                  value={formData.detailedTo}
                  onChange={(val) => handleFormChange('detailedTo', val)}
                  placeholder="Select or enter designated office"
                />
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="edit-designatedPositionFunction" className="dashboard__form-label">
                  Designated Position Function
                </label>
                <SearchableDropdown
                  id="edit-designatedPositionFunction"
                  options={dropdownOptions.positions}
                  value={formData.designatedPositionFunction}
                  onChange={(val) => handleFormChange('designatedPositionFunction', val)}
                  placeholder="Select or enter position function"
                />
              </div>

              <div className="dashboard__form-row">
                <Input
                  id="edit-designated-order-from"
                  label="Designated Order (From)"
                  type="date"
                  value={formData.designatedOrderFrom}
                  onChange={(e) => handleFormChange('designatedOrderFrom', e.target.value)}
                  fullWidth
                />
                <Input
                  id="edit-designated-order-to"
                  label="Designated Order (To)"
                  type="date"
                  value={formData.designatedOrderTo}
                  onChange={(e) => handleFormChange('designatedOrderTo', e.target.value)}
                  fullWidth
                />
              </div>
            </>
          )}

          <Input
            id="edit-file201-status"
            label="201 File Status"
            type="text"
            placeholder="Enter 201 file status"
            value={formData.file201Status}
            onChange={(e) => handleFormChange('file201Status', e.target.value)}
            fullWidth
          />

          <Input
            id="edit-filebox-location"
            label="201 File Location"
            type="text"
            placeholder="Enter 201 file location"
            value={formData.fileboxLocation}
            onChange={(e) => handleFormChange('fileboxLocation', e.target.value)}
            fullWidth
          />
        </div>
      </Modal>


      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onConfirmImport={handleConfirmImport}
      />

      <PasswordConfirmModal
        isOpen={isImportSyncConfirmModalOpen}
        onClose={() => {
          setIsImportSyncConfirmModalOpen(false);
          setPendingImportEmployees(null);
        }}
        onConfirm={handleConfirmImportSync}
        title="Sync Import - Super Admin Authorization Required"
        message={`This will sync backend data to the imported file and delete backend employees not in the file.\n\nRecords to sync: ${pendingImportEmployees?.length || 0}`}
        currentUserId={currentUser?.id}
      />

      {/* Password Confirmation Modal for Delete */}
      {/* Bulk Download Modal */}
      <BulkDownloadModal
        isOpen={isBulkDownloadModalOpen}
        onClose={handleCloseBulkDownloadModal}
        employees={allEmployees}
        onDownload={handleBulkDownload}
        isLoading={isBulkDownloadLoading}
      />

      <PDFViewer
        isOpen={isReportViewerOpen}
        onClose={() => {
          setIsReportViewerOpen(false);
          setSelectedReportDocument(null);
          setReportPdfData(null);
        }}
        document={selectedReportDocument}
        pdfData={reportPdfData}
        canDownloadOrPrint={canDownloadOrPrint}
      />

      {/* Delete Report Entries Confirmation Modal */}
      <Modal
        isOpen={isDeleteReportConfirmOpen}
        onClose={() => {
          if (!isDeletingReport) {
            setIsDeleteReportConfirmOpen(false);
            setPendingDeleteReportIds([]);
          }
        }}
        title="Request Deletion - Generated Reports"
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setIsDeleteReportConfirmOpen(false);
                setPendingDeleteReportIds([]);
              }}
              disabled={isDeletingReport}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDeleteReportEntries}
              loading={isDeletingReport}
              disabled={isDeletingReport}
            >
              Submit for Approval
            </Button>
          </div>
        }
      >
        <div style={{ padding: '0.5rem 0' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: '1.5' }}>
            You are requesting deletion of <strong>{pendingDeleteReportIds.length}</strong> report entry/entries.
          </p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '0.75rem' }}>
            This request will be sent to a Super Admin for approval. Once approved, the selected entries and their corresponding Administrative Order documents will be permanently removed.
          </p>
        </div>
      </Modal>

      {/* Report Preview Modal */}
      <Modal
        isOpen={isReportPreviewOpen}
        onClose={() => setIsReportPreviewOpen(false)}
        title="Report Preview & Export"
        size="xl"
        footer={
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="secondary"
              onClick={() => setIsReportPreviewOpen(false)}
            >
              Close
            </Button>
            <Button
              variant="secondary"
              onClick={() => exportReportData('csv')}
              disabled={sortedReportRows.length === 0}
            >
              📄 Export CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => exportReportData('xlsx')}
              disabled={sortedReportRows.length === 0}
            >
              📊 Export XLSX
            </Button>
            <Button
              variant="primary"
              onClick={printReportData}
              disabled={sortedReportRows.length === 0}
            >
              🖨️ Print
            </Button>
          </div>
        }
      >
        <div className="printable-report" style={{
          fontFamily: "'Times New Roman', Times, serif",
          color: '#000',
          backgroundColor: '#fff',
          padding: '1rem',
          borderRadius: 'var(--border-radius)',
          border: '1px solid var(--border-color)',
          overflowX: 'auto',
          lineHeight: '1.3'
        }}>
          {(() => {
            const tabRows =
              reportActiveTab === 'active'
                ? sortedReportRows.filter((row) => row.status === 'Active')
                : reportActiveTab === 'inactive'
                  ? sortedReportRows.filter((row) => row.status === 'Inactive')
                  : reportActiveTab === 'expiring'
                    ? sortedReportRows.filter((row) => isNearExpiration(row.durationTo))
                    : sortedReportRows.filter((row) => isExpired(row.durationTo));

            const ROWS_PER_PAGE = 90;
            const pageCount = Math.max(1, Math.ceil(tabRows.length / ROWS_PER_PAGE));
            const officeColHeader = reportAoStatus === 'Designated'
              ? 'Designated Office'
              : reportAoStatus === 'All Employees'
                ? 'Detailed/Designated Office/Hospital'
                : 'Detailed/Transferred Office/Hospital';
            const durationColHeader = reportAoStatus === 'Designated'
              ? 'Duration of Designated Order'
              : 'Duration of Detailed Order';

            const headerBlock = (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '2px solid #000',
                paddingBottom: '10px',
                marginBottom: '14px'
              }}>
                <img
                  src="/template_logo.png"
                  alt="Logo"
                  style={{ height: '65px', width: 'auto' }}
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
                <div style={{ textAlign: 'center', flexGrow: 1, padding: '0 12px' }}>
                  <div style={{ fontSize: '10.5pt', fontStyle: 'italic', fontWeight: 'normal' }}>Republic of the Philippines</div>
                  <div style={{ fontSize: '11pt', fontWeight: 'bold', marginTop: '2px' }}>Province of Pangasinan</div>
                  <div style={{ fontSize: '10pt', fontWeight: 'normal', marginTop: '2px' }}>Lingayen</div>
                  <div style={{ fontSize: '11.5pt', fontWeight: 'bold', marginTop: '4px', fontFamily: 'Calibri, Arial, sans-serif' }}>HUMAN RESOURCE MGT. &amp; DEVELOPMENT OFFICE</div>
                </div>
                <div style={{ width: '65px' }} />
              </div>
            );

            const tableHeader = (
              <thead>
                <tr style={{ backgroundColor: '#f2f2f2' }}>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '5%' }}>NO.</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '22%' }}>Name of Employee</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '22%' }}>Mother Unit</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '22%' }}>{officeColHeader}</th>
                  <th colSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>{durationColHeader}</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '19%' }}>Administrative Order No.</th>
                </tr>
                <tr style={{ backgroundColor: '#f2f2f2' }}>
                  <th style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '9pt', textAlign: 'center', fontWeight: 'bold', width: '10%' }}>From</th>
                  <th style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '9pt', textAlign: 'center', fontWeight: 'bold', width: '10%' }}>To</th>
                </tr>
              </thead>
            );

            if (tabRows.length === 0) {
              return (
                <>
                  {headerBlock}
                  <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt', textTransform: 'uppercase', marginBottom: '16px' }}>{getFormattedTitle()}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    {tableHeader}
                    <tbody>
                      <tr><td colSpan={7} style={{ border: '1px solid #000', padding: '20px', textAlign: 'center', color: '#555' }}>No records found matching current filters.</td></tr>
                    </tbody>
                  </table>
                </>
              );
            }

            return Array.from({ length: pageCount }, (_, pageIdx) => {
              const pageRows = tabRows.slice(pageIdx * ROWS_PER_PAGE, (pageIdx + 1) * ROWS_PER_PAGE);
              return (
                <div
                  key={pageIdx}
                  style={{
                    pageBreakAfter: pageIdx < pageCount - 1 ? 'always' : 'auto',
                    marginBottom: pageIdx < pageCount - 1 ? '40px' : '0',
                    paddingBottom: pageIdx < pageCount - 1 ? '40px' : '0',
                    borderBottom: pageIdx < pageCount - 1 ? '3px dashed #aaa' : 'none',
                  }}
                >
                  {headerBlock}
                  <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt', fontFamily: 'Calibri, Arial, sans-serif', textTransform: 'uppercase', marginBottom: '14px', letterSpacing: '0.3px' }}>
                    {getFormattedTitle()}
                    {pageCount > 1 && (
                      <span style={{ fontSize: '9pt', fontWeight: 'normal', marginLeft: '10px', color: '#444' }}>
                        (Page {pageIdx + 1} of {pageCount})
                      </span>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Calibri, Arial, sans-serif', tableLayout: 'fixed' }}>
                    {tableHeader}
                    <tbody>
                      {pageRows.map((row, idx) => {
                        const globalIdx = pageIdx * ROWS_PER_PAGE + idx;
                        return (
                          <tr key={globalIdx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'top' }}>{globalIdx + 1}</td>
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'left', verticalAlign: 'top', wordBreak: 'break-word', whiteSpace: 'normal' }}>{row.name}</td>
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'left', verticalAlign: 'top', wordBreak: 'break-word', whiteSpace: 'normal' }}>{row.motherUnit || ''}</td>
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'left', verticalAlign: 'top', wordBreak: 'break-word', whiteSpace: 'normal' }}>{row.detailedOffice || ''}</td>
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'top' }}>{row.durationFrom ? formatDateMDY(row.durationFrom) : '—'}</td>
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'top' }}>{row.durationTo ? formatDateMDY(row.durationTo) : '—'}</td>
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'top', wordBreak: 'break-word' }}>
                              {row.aoNumber ? `AO ${row.aoNumber}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                </div>
              );
            });
          })()}
        </div>
      </Modal>
    </div>
  );
}

export default Dashboard;
