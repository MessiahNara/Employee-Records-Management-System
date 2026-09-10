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
import File201HistoryModal from '../components/File201HistoryModal';
import { formatEmployeeNameForFolder } from '../utils/formatUtils';
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
import EmployeeFormWizard from '../components/EmployeeFormWizard';
import EditEmployeeModal from '../components/EditEmployeeModal';
import UnsavedChangesModal from '../components/ui/UnsavedChangesModal';
import { Employee, EmployeeFormData, AppointmentStatus, EmployeeStatus } from '../types/employee';
import { ImportedEmployee } from '../types/importExport';
import { generateImportTemplate } from '../utils/exportUtils';
import { getAuthState } from '../utils/mockAuth';
import { useToast } from '../contexts/ToastContext';
import { formatDateDDMMYYYY, convertToDateInputFormat, formatDateMDY } from '../utils/dateUtils';
import { MdEdit, MdDelete, MdDeleteOutline, MdFileUpload, MdFileDownload, MdPeople, MdCheckCircle, MdPause, MdDescription, MdStorage, MdQrCode, MdLock, MdWarning, MdError, MdCancel, MdPrint, MdDashboard } from 'react-icons/md';
import api, { getServerBaseUrl } from '../services/api';
import PDFViewer from '../components/documents/PDFViewer';
import { bulkDownloadCodes } from '../utils/bulkDownloadCodes';
import generateAOStatusAllEmployeesExcel from '../utils/generateAOStatusAllEmployeesExcel';
import generateAOStatusDetailedExcel from '../utils/generateAOStatusDetailedExcel';
import generateAOStatusDesignatedExcel from '../utils/generateAOStatusDesignatedExcel';
import generateAOStatusRecalledExcel from '../utils/generateAOStatusRecalledExcel';
import generatePulledOutFilesExcel from '../utils/generatePulledOutFilesExcel';
import generateTransferredFilesExcel from '../utils/generateTransferredFilesExcel';
import { cleanOfficeDropdownOptions, getOfficeFullName } from '../data/provincialOffices';
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
  aoType: 'Detailed' | 'Designated' | 'Recalled' | '';
  assignedUnit: string;
  detailedOffice: string;
  designatedPositionFunction: string;
  recalledFrom?: string;
  recalledTo?: string;
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
  recalledFrom: 'Recalled From',
  recalledTo: 'Recalled To',
  durationFrom: 'Duration From',
  durationTo: 'Duration To',
  dateOfBirth: 'Date of Birth',
  administrativeOrder: 'Administrative Order No.',
};

const LOGO_BASE64 = 'data:image/png;base64,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';

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  employeeId: true,
  name: true,
  position: true,
  motherUnit: true,
  detailedOffice: true,
  designatedPositionFunction: true,
  recalledFrom: true,
  recalledTo: true,
  durationFrom: true,
  durationTo: true,
  dateOfBirth: true,
  administrativeOrder: true,
};

const BORROW_COLUMN_LABELS: Record<string, string> = {
  employeeName: 'Employee File (Owner)',
  appointmentStatus: 'Employment Status',
  position: 'Position / Designation',
  officeName: 'Office/Hospital',
  borrowerName: 'Borrowed By',
  purpose: 'Purpose / Reason',
  dateBorrowed: 'Date Borrowed',
  releasedBy: 'Released By',
  status: 'Status',
  dateReturned: 'Date Returned',
  returnedByName: 'Returned By',
  receivedBy: 'Received By',
  fileCondition: 'File Condition',
  remarks: 'Remarks',
};

const DEFAULT_VISIBLE_BORROW_COLUMNS: Record<string, boolean> = {
  employeeName: true,
  appointmentStatus: true,
  position: true,
  officeName: true,
  borrowerName: true,
  purpose: true,
  dateBorrowed: true,
  releasedBy: true,
  status: true,
  dateReturned: true,
  returnedByName: true,
  receivedBy: true,
  fileCondition: true,
  remarks: true,
};

const TRANSFERRED_COLUMN_LABELS: Record<string, string> = {
  employeeName: 'Employee Name (Owner)',
  officeName: 'Office/Hospital',
  position: 'Position / Designation',
  appointmentStatus: 'Employment Status',
  borrowerName: 'Transferred To (Received By)',
  dateBorrowed: 'Date Transferred',
  releasedBy: 'Released By',
  fileCondition: 'File Condition',
  remarks: 'Remarks',
  status: 'Status',
  dateReturned: 'Date Returned',
  returnedByName: 'Returned By',
  receivedBy: 'Received By (Records)',
  returnFileCondition: 'Return Condition',
  returnRemarks: 'Return Remarks',
};

const DEFAULT_VISIBLE_TRANSFERRED_COLUMNS: Record<string, boolean> = {
  employeeName: true,
  officeName: true,
  position: true,
  appointmentStatus: true,
  borrowerName: true,
  dateBorrowed: true,
  releasedBy: true,
  fileCondition: true,
  remarks: true,
  status: true,
  dateReturned: true,
  returnedByName: true,
  receivedBy: true,
  returnFileCondition: true,
  returnRemarks: true,
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
    : aoStatus === 'Recalled'
      ? 'Recalled From'
      : aoStatus === 'All Employees'
        ? 'Detailed/Designated Office/Hospital'
        : 'Detailed/Transferred Office/Hospital';

  const durationHeader = aoStatus === 'Designated'
    ? 'Duration of Designated Order'
    : aoStatus === 'Detailed'
      ? 'Duration of Detailed Order'
      : 'Duration';

  const designatedHeader = aoStatus === 'Designated'
    ? 'Designated Position'
    : aoStatus === 'Recalled'
      ? 'Recalled To'
      : 'Designated Position/Function';

  // ── Re-write column widths to accommodate 7 or 9 columns ──────────────────
  let colsXml = '';
  if (aoStatus === 'Detailed') {
    colsXml = `<cols><col min="1" max="1" width="6.33203125" customWidth="1"/><col min="2" max="4" width="35.77734375" customWidth="1"/><col min="5" max="5" width="13.109375" customWidth="1"/><col min="6" max="6" width="14.6640625" customWidth="1"/><col min="7" max="7" width="24" customWidth="1"/><col min="8" max="26" width="8.6640625" customWidth="1"/></cols>`;
  } else {
    colsXml = `<cols><col min="1" max="1" width="6.33203125" customWidth="1"/><col min="2" max="2" width="30" customWidth="1"/><col min="3" max="3" width="22" customWidth="1"/><col min="4" max="5" width="30" customWidth="1"/><col min="6" max="6" width="22" customWidth="1"/><col min="7" max="7" width="13.109375" customWidth="1"/><col min="8" max="8" width="14.6640625" customWidth="1"/><col min="9" max="9" width="24" customWidth="1"/><col min="10" max="26" width="8.6640625" customWidth="1"/></cols>`;
  }
  xmlStr = xmlStr.replace(/<cols>[\s\S]*?<\/cols>/, colsXml);

  // ── Dynamic row-height helper ─────────────────────────────────────────────
  const BASE_ROW_HT = 19.95;
  const LINE_HT = 13.5;
  const CHARS_B = 24;
  const CHARS_C = 20;
  const CHARS_D = 24;
  const CHARS_E = 24;
  const CHARS_F = 20;
  const CHARS_I = 22;

  const calcRowHt = (name: string, pos: string, mother: string, office: string, desigPos: string, ao: string): number => {
    const linesFor = (text: string, maxChars: number) =>
      text.length === 0 ? 1 : Math.ceil(text.length / maxChars);

    if (aoStatus === 'Detailed') {
      const lines = Math.max(
        linesFor(name, 33),
        linesFor(mother, 33),
        linesFor(office, 33),
        linesFor(ao, 22)
      );
      return lines <= 1 ? BASE_ROW_HT : BASE_ROW_HT + (lines - 1) * LINE_HT;
    } else {
      const lines = Math.max(
        linesFor(name, CHARS_B),
        linesFor(pos, CHARS_C),
        linesFor(mother, CHARS_D),
        linesFor(office, CHARS_E),
        linesFor(desigPos, CHARS_F),
        linesFor(ao, CHARS_I)
      );
      return lines <= 1 ? BASE_ROW_HT : BASE_ROW_HT + (lines - 1) * LINE_HT;
    }
  };

  const ROWS_PER_PAGE = 90;
  const DIVIDER_POS = 15;

  const formatDateMDYStr = (dateVal: any) => {
    if (!dateVal) return '';
    if (typeof dateVal === 'string' && dateVal.trim().toLowerCase() === 'until revoked') return 'Until revoked';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    if (d.getFullYear() === 9999) return 'Until revoked';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  };


  const getStyles = (posInPage: number, totalInPage: number) => {
    if (posInPage === 0) return { sA: '6', sBC: '12', sD: '13', sEF: '14', sG: '15' };
    const last = totalInPage - 1;
    const penul = totalInPage - 2;
    if (posInPage === last) return { sA: '10', sBC: '29', sD: '30', sEF: '31', sG: '32' };
    if (posInPage === penul) return { sA: '9', sBC: '16', sD: '17', sEF: '27', sG: '28' };
    if (posInPage >= 58) return { sA: '8', sBC: '16', sD: '17', sEF: '26', sG: '19' };
    return { sA: '7', sBC: '16', sD: '17', sEF: '18', sG: '19' };
  };

  const generateHeaderBlock = (start: number): string => {
    const designatedHeader = aoStatus === 'Designated'
      ? 'Designated Position'
      : 'Designated Position/Function';

    const headerTexts = [
      'Republic of the Philippines',
      'Province of Pangasinan',
      'Lingayen',
      'HUMAN RESOURCE MGT. &amp; DEVELOPMENT OFFICE',
      ''
    ];

    let block = '';

    if (aoStatus === 'Detailed') {
      block += `<row r="${start}" spans="1:12" ht="15" customHeight="1" x14ac:dyDescent="0.25"><c r="A${start}" s="37" t="inlineStr"><is><t>${headerTexts[0]}</t></is></c><c r="B${start}" s="37"/><c r="C${start}" s="37"/><c r="D${start}" s="37"/><c r="E${start}" s="37"/><c r="F${start}" s="37"/><c r="G${start}" s="37"/></row>`;
      for (let h = 1; h <= 4; h++) {
        const rn = start + h;
        const sty = '38';
        const txt = headerTexts[h];
        const thickBot = h === 4 ? ' thickBot="1"' : '';
        block += `<row r="${rn}" spans="1:12" ht="15" customHeight="1"${thickBot} x14ac:dyDescent="0.25"><c r="A${rn}" s="${sty}" t="inlineStr"><is><t>${escapeXml(txt)}</t></is></c><c r="B${rn}" s="${sty}"/><c r="C${rn}" s="${sty}"/><c r="D${rn}" s="${sty}"/><c r="E${rn}" s="${sty}"/><c r="F${rn}" s="${sty}"/><c r="G${rn}" s="${sty}"/></row>`;
      }
      const titleRow = start + 5;
      block += `<row r="${titleRow}" spans="1:12" ht="25.05" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A${titleRow}" s="39" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c><c r="B${titleRow}" s="40"/><c r="C${titleRow}" s="40"/><c r="D${titleRow}" s="40"/><c r="E${titleRow}" s="40"/><c r="F${titleRow}" s="40"/><c r="G${titleRow}" s="41"/></row>`;

      const h7 = start + 6;
      block += `<row r="${h7}" spans="1:12" ht="12.75" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A${h7}" s="35" t="inlineStr"><is><t>NO.</t></is></c><c r="B${h7}" s="35" t="inlineStr"><is><t>Name of Employee</t></is></c><c r="C${h7}" s="35" t="inlineStr"><is><t>Mother Unit</t></is></c><c r="D${h7}" s="35" t="inlineStr"><is><t>${escapeXml(officeHeader)}</t></is></c><c r="E${h7}" s="39" t="inlineStr"><is><t>${escapeXml(durationHeader)}</t></is></c><c r="F${h7}" s="42"/><c r="G${h7}" s="35" t="inlineStr"><is><t>Administrative Order No.</t></is></c></row>`;

      const h8 = start + 7;
      block += `<row r="${h8}" spans="1:12" ht="21" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A${h8}" s="36"/><c r="B${h8}" s="36"/><c r="C${h8}" s="36"/><c r="D${h8}" s="36"/><c r="E${h8}" s="5" t="inlineStr"><is><t>From</t></is></c><c r="F${h8}" s="5" t="inlineStr"><is><t>To</t></is></c><c r="G${h8}" s="36"/></row>`;
    } else {
      block += `<row r="${start}" spans="1:12" ht="15" customHeight="1" x14ac:dyDescent="0.25"><c r="A${start}" s="37" t="inlineStr"><is><t>${headerTexts[0]}</t></is></c><c r="B${start}" s="37"/><c r="C${start}" s="37"/><c r="D${start}" s="37"/><c r="E${start}" s="37"/><c r="F${start}" s="37"/><c r="G${start}" s="37"/><c r="H${start}" s="37"/><c r="I${start}" s="37"/></row>`;
      for (let h = 1; h <= 4; h++) {
        const rn = start + h;
        const sty = '38';
        const txt = headerTexts[h];
        const thickBot = h === 4 ? ' thickBot="1"' : '';
        block += `<row r="${rn}" spans="1:12" ht="15" customHeight="1"${thickBot} x14ac:dyDescent="0.25"><c r="A${rn}" s="${sty}" t="inlineStr"><is><t>${escapeXml(txt)}</t></is></c><c r="B${rn}" s="${sty}"/><c r="C${rn}" s="${sty}"/><c r="D${rn}" s="${sty}"/><c r="E${rn}" s="${sty}"/><c r="F${rn}" s="${sty}"/><c r="G${rn}" s="${sty}"/><c r="H${rn}" s="${sty}"/><c r="I${rn}" s="${sty}"/></row>`;
      }
      const titleRow = start + 5;
      block += `<row r="${titleRow}" spans="1:12" ht="25.05" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A${titleRow}" s="39" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c><c r="B${titleRow}" s="40"/><c r="C${titleRow}" s="40"/><c r="D${titleRow}" s="40"/><c r="E${titleRow}" s="40"/><c r="F${titleRow}" s="40"/><c r="G${titleRow}" s="40"/><c r="H${titleRow}" s="40"/><c r="I${titleRow}" s="41"/></row>`;

      const h7 = start + 6;
      block += `<row r="${h7}" spans="1:12" ht="12.75" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A${h7}" s="35" t="inlineStr"><is><t>NO.</t></is></c><c r="B${h7}" s="35" t="inlineStr"><is><t>Name of Employee</t></is></c><c r="C${h7}" s="35" t="inlineStr"><is><t>Position</t></is></c><c r="D${h7}" s="35" t="inlineStr"><is><t>Mother Unit</t></is></c><c r="E${h7}" s="35" t="inlineStr"><is><t>${escapeXml(officeHeader)}</t></is></c><c r="F${h7}" s="35" t="inlineStr"><is><t>${escapeXml(designatedHeader)}</t></is></c><c r="G${h7}" s="39" t="inlineStr"><is><t>${escapeXml(durationHeader)}</t></is></c><c r="H${h7}" s="42"/><c r="I${h7}" s="35" t="inlineStr"><is><t>Administrative Order No.</t></is></c></row>`;

      const h8 = start + 7;
      block += `<row r="${h8}" spans="1:12" ht="21" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A${h8}" s="36"/><c r="B${h8}" s="36"/><c r="C${h8}" s="36"/><c r="D${h8}" s="36"/><c r="E${h8}" s="36"/><c r="F${h8}" s="36"/><c r="G${h8}" s="5" t="inlineStr"><is><t>From</t></is></c><c r="H${h8}" s="5" t="inlineStr"><is><t>To</t></is></c><c r="I${h8}" s="36"/></row>`;
    }

    return block;
  };

  const row1Start = xmlStr.indexOf('<row r="1"');
  if (row1Start === -1) return { xml: xmlStr, lastRow: 8 };
  const xmlBefore = xmlStr.substring(0, row1Start);

  const sheetDataEnd = xmlStr.indexOf('</sheetData>');
  if (sheetDataEnd === -1) return { xml: xmlStr, lastRow: 8 };
  const xmlAfterSheetData = xmlStr.substring(sheetDataEnd);

  const row9Start = xmlStr.indexOf('<row r="9"');
  const originalHeaderRowsXml = row9Start !== -1
    ? xmlStr.substring(row1Start, row9Start)
    : xmlStr.substring(row1Start, sheetDataEnd);

  let patchedHeaderRowsXml = originalHeaderRowsXml;
  if (aoStatus === 'Detailed') {
    patchedHeaderRowsXml = patchedHeaderRowsXml
      .replace(
        /<row r="6"[\s\S]*?<\/row>/,
        `<row r="6" spans="1:12" ht="25.05" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A6" s="39" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c><c r="B6" s="40"/><c r="C6" s="40"/><c r="D6" s="40"/><c r="E6" s="40"/><c r="F6" s="40"/><c r="G6" s="41"/></row>`
      )
      .replace(
        /<row r="7"[\s\S]*?<\/row>/,
        `<row r="7" spans="1:12" ht="12.75" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A7" s="35" t="inlineStr"><is><t>NO.</t></is></c><c r="B7" s="35" t="inlineStr"><is><t>Name of Employee</t></is></c><c r="C7" s="35" t="inlineStr"><is><t>Mother Unit</t></is></c><c r="D7" s="35" t="inlineStr"><is><t>${escapeXml(officeHeader)}</t></is></c><c r="E7" s="39" t="inlineStr"><is><t>${escapeXml(durationHeader)}</t></is></c><c r="F7" s="42"/><c r="G7" s="35" t="inlineStr"><is><t>Administrative Order No.</t></is></c></row>`
      )
      .replace(
        /<row r="8"[\s\S]*?<\/row>/,
        `<row r="8" spans="1:12" ht="21" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A8" s="36"/><c r="B8" s="36"/><c r="C8" s="36"/><c r="D8" s="36"/><c r="E8" s="5" t="inlineStr"><is><t>From</t></is></c><c r="F8" s="5" t="inlineStr"><is><t>To</t></is></c><c r="G8" s="36"/></row>`
      );
  } else {
    patchedHeaderRowsXml = patchedHeaderRowsXml
      .replace(
        /<row r="6"[\s\S]*?<\/row>/,
        `<row r="6" spans="1:12" ht="25.05" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A6" s="39" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c><c r="B6" s="40"/><c r="C6" s="40"/><c r="D6" s="40"/><c r="E6" s="40"/><c r="F6" s="40"/><c r="G6" s="40"/><c r="H6" s="40"/><c r="I6" s="41"/></row>`
      )
      .replace(
        /<row r="7"[\s\S]*?<\/row>/,
        `<row r="7" spans="1:12" ht="12.75" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A7" s="35" t="inlineStr"><is><t>NO.</t></is></c><c r="B7" s="35" t="inlineStr"><is><t>Name of Employee</t></is></c><c r="C7" s="35" t="inlineStr"><is><t>Position</t></is></c><c r="D7" s="35" t="inlineStr"><is><t>Mother Unit</t></is></c><c r="E7" s="35" t="inlineStr"><is><t>${escapeXml(officeHeader)}</t></is></c><c r="F7" s="35" t="inlineStr"><is><t>${escapeXml(designatedHeader)}</t></is></c><c r="G7" s="39" t="inlineStr"><is><t>${escapeXml(durationHeader)}</t></is></c><c r="H7" s="42"/><c r="I7" s="35" t="inlineStr"><is><t>Administrative Order No.</t></is></c></row>`
      )
      .replace(
        /<row r="8"[\s\S]*?<\/row>/,
        `<row r="8" spans="1:12" ht="21" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A8" s="36"/><c r="B8" s="36"/><c r="C8" s="36"/><c r="D8" s="36"/><c r="E8" s="36"/><c r="F8" s="36"/><c r="G8" s="5" t="inlineStr"><is><t>From</t></is></c><c r="H8" s="5" t="inlineStr"><is><t>To</t></is></c><c r="I8" s="36"/></row>`
      );
  }

  // ── Build pages ───────────────────────────────────────────────────────────
  let newRowsXml = '';
  let globalRowNum = 9;
  let dataIdx = 0;
  let pageNum = 0;
  const headerStartRows: number[] = [1];

  while (dataIdx < rowsData.length) {
    const pageData = rowsData.slice(dataIdx, dataIdx + ROWS_PER_PAGE);
    const pageCount = pageData.length;

    if (pageNum > 0) {
      headerStartRows.push(globalRowNum);
      newRowsXml += generateHeaderBlock(globalRowNum);
      globalRowNum += 8;
    }

    let posInPage = 0;
    for (let i = 0; i < pageCount; i++) {
      if (posInPage === DIVIDER_POS) {
        if (aoStatus === 'Detailed') {
          newRowsXml += `<row r="${globalRowNum}" spans="1:7" ht="19.95" customHeight="1" x14ac:dyDescent="0.25"><c r="A${globalRowNum}" s="11"/><c r="B${globalRowNum}" s="22"/><c r="C${globalRowNum}" s="22"/><c r="D${globalRowNum}" s="23"/><c r="E${globalRowNum}" s="24"/><c r="F${globalRowNum}" s="24"/><c r="G${globalRowNum}" s="25"/></row>`;
        } else {
          newRowsXml += `<row r="${globalRowNum}" spans="1:9" ht="19.95" customHeight="1" x14ac:dyDescent="0.25"><c r="A${globalRowNum}" s="11"/><c r="B${globalRowNum}" s="22"/><c r="C${globalRowNum}" s="22"/><c r="D${globalRowNum}" s="22"/><c r="E${globalRowNum}" s="23"/><c r="F${globalRowNum}" s="22"/><c r="G${globalRowNum}" s="24"/><c r="H${globalRowNum}" s="24"/><c r="I${globalRowNum}" s="25"/></row>`;
        }
        globalRowNum++;
        posInPage++;
      }

      const row = pageData[i];
      const st = getStyles(posInPage === 0 && i === 0 ? 0 : posInPage, pageCount + (pageCount >= DIVIDER_POS ? 1 : 0));

      const noVal = String(dataIdx + i + 1);
      const nameVal = row.name || '';
      const posVal = row.position || '';
      const motherVal = row.motherUnit || '';
      const officeVal = row.detailedOffice || '';
      const desigPosVal = row.designatedPositionFunction || '';
      const fromVal = formatDateMDYStr(row.durationFrom);
      const toVal = formatDateMDYStr(row.durationTo);
      const aoVal = row.aoNumber ? `AO ${row.aoNumber}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}` : '';

      const rowHt = calcRowHt(nameVal, posVal, motherVal, officeVal, desigPosVal, aoVal);

      if (aoStatus === 'Detailed') {
        newRowsXml += `<row r="${globalRowNum}" spans="1:7" ht="${rowHt}" customHeight="1" x14ac:dyDescent="0.25">`;
        newRowsXml += `<c r="A${globalRowNum}" s="${st.sA}" t="inlineStr"><is><t>${escapeXml(noVal)}</t></is></c>`;
        newRowsXml += `<c r="B${globalRowNum}" s="${st.sBC}" t="inlineStr"><is><t>${escapeXml(nameVal)}</t></is></c>`;
        newRowsXml += `<c r="C${globalRowNum}" s="${st.sBC}" t="inlineStr"><is><t>${escapeXml(motherVal)}</t></is></c>`;
        newRowsXml += `<c r="D${globalRowNum}" s="${st.sD}" t="inlineStr"><is><t>${escapeXml(officeVal)}</t></is></c>`;
        newRowsXml += `<c r="E${globalRowNum}" s="${st.sEF}" t="inlineStr"><is><t>${escapeXml(fromVal)}</t></is></c>`;
        newRowsXml += `<c r="F${globalRowNum}" s="${st.sEF}" t="inlineStr"><is><t>${escapeXml(toVal)}</t></is></c>`;
        newRowsXml += `<c r="G${globalRowNum}" s="${st.sG}" t="inlineStr"><is><t>${escapeXml(aoVal)}</t></is></c>`;
        newRowsXml += `</row>`;
      } else {
        newRowsXml += `<row r="${globalRowNum}" spans="1:9" ht="${rowHt}" customHeight="1" x14ac:dyDescent="0.25">`;
        newRowsXml += `<c r="A${globalRowNum}" s="${st.sA}" t="inlineStr"><is><t>${escapeXml(noVal)}</t></is></c>`;
        newRowsXml += `<c r="B${globalRowNum}" s="${st.sBC}" t="inlineStr"><is><t>${escapeXml(nameVal)}</t></is></c>`;
        newRowsXml += `<c r="C${globalRowNum}" s="${st.sBC}" t="inlineStr"><is><t>${escapeXml(posVal)}</t></is></c>`;
        newRowsXml += `<c r="D${globalRowNum}" s="${st.sBC}" t="inlineStr"><is><t>${escapeXml(motherVal)}</t></is></c>`;
        const colEVal = aoStatus === 'Recalled' ? (row.recalledFrom || '') : officeVal;
        const colFVal = aoStatus === 'Recalled' ? (row.recalledTo || '') : desigPosVal;

        newRowsXml += `<c r="E${globalRowNum}" s="${st.sD}" t="inlineStr"><is><t>${escapeXml(colEVal)}</t></is></c>`;
        newRowsXml += `<c r="F${globalRowNum}" s="${st.sBC}" t="inlineStr"><is><t>${escapeXml(colFVal)}</t></is></c>`;
        newRowsXml += `<c r="G${globalRowNum}" s="${st.sEF}" t="inlineStr"><is><t>${escapeXml(fromVal)}</t></is></c>`;
        newRowsXml += `<c r="H${globalRowNum}" s="${st.sEF}" t="inlineStr"><is><t>${escapeXml(toVal)}</t></is></c>`;
        newRowsXml += `<c r="I${globalRowNum}" s="${st.sG}" t="inlineStr"><is><t>${escapeXml(aoVal)}</t></is></c>`;
        newRowsXml += `</row>`;
      }

      globalRowNum++;
      posInPage++;
    }

    dataIdx += ROWS_PER_PAGE;
    pageNum++;

    for (let s = 0; s < 13; s++) {
      if (aoStatus === 'Detailed') {
        newRowsXml += `<row r="${globalRowNum}" spans="3:7" ht="12.75" customHeight="1" x14ac:dyDescent="0.25"><c r="C${globalRowNum}" s="3"/><c r="D${globalRowNum}" s="3"/><c r="G${globalRowNum}" s="4"/></row>`;
      } else {
        newRowsXml += `<row r="${globalRowNum}" spans="4:9" ht="12.75" customHeight="1" x14ac:dyDescent="0.25"><c r="D${globalRowNum}" s="3"/><c r="E${globalRowNum}" s="3"/><c r="I${globalRowNum}" s="4"/></row>`;
      }
      globalRowNum++;
    }
  }

  // ── Rebuild mergeCells for all pages ─────────────────────────────────────
  const allMerges: string[] = [];
  for (let p = 0; p < pageNum; p++) {
    const start = headerStartRows[p];
    if (aoStatus === 'Detailed') {
      allMerges.push(
        `A${start}:G${start}`,
        `A${1 + start}:G${1 + start}`,
        `A${2 + start}:G${2 + start}`,
        `A${3 + start}:G${3 + start}`,
        `A${4 + start}:G${4 + start}`,
        `A${5 + start}:G${5 + start}`,
        `A${6 + start}:A${7 + start}`,
        `B${6 + start}:B${7 + start}`,
        `C${6 + start}:C${7 + start}`,
        `D${6 + start}:D${7 + start}`,
        `E${6 + start}:F${6 + start}`,
        `G${6 + start}:G${7 + start}`
      );
    } else {
      allMerges.push(
        `A${start}:I${start}`,
        `A${1 + start}:I${1 + start}`,
        `A${2 + start}:I${2 + start}`,
        `A${3 + start}:I${3 + start}`,
        `A${4 + start}:I${4 + start}`,
        `A${5 + start}:I${5 + start}`,
        `A${6 + start}:A${7 + start}`,
        `B${6 + start}:B${7 + start}`,
        `C${6 + start}:C${7 + start}`,
        `D${6 + start}:D${7 + start}`,
        `E${6 + start}:E${7 + start}`,
        `F${6 + start}:F${7 + start}`,
        `G${6 + start}:H${6 + start}`,
        `I${6 + start}:I${7 + start}`
      );
    }
  }

  const mergeCellsXml = `<mergeCells count="${allMerges.length}">${allMerges.map(r => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`;

  const newXml = xmlBefore + patchedHeaderRowsXml + newRowsXml + `</sheetData>` +
    xmlAfterSheetData
      .replace(/<mergeCells[\s\S]*?<\/mergeCells>/, mergeCellsXml)
      .replace('</sheetData>', '');

  return { xml: newXml, lastRow: globalRowNum - 1 };
};

const modifyBorrowSheetXml = (xmlStr: string, title: string, rowsData: any[]) => {
  // Remove drawing (logo) reference if present in sheet XML
  xmlStr = xmlStr.replace(/<drawing[^>]*\/>/g, '');

  // ── Re-write column widths to accommodate 13 columns ──────────────────
  const colsXml = `<cols>` +
    `<col min="1" max="1" width="6.33203125" customWidth="1"/>` +
    `<col min="2" max="2" width="25" customWidth="1"/>` +
    `<col min="3" max="3" width="25" customWidth="1"/>` +
    `<col min="4" max="4" width="18" customWidth="1"/>` +
    `<col min="5" max="5" width="20" customWidth="1"/>` +
    `<col min="6" max="6" width="13" customWidth="1"/>` +
    `<col min="7" max="7" width="13" customWidth="1"/>` +
    `<col min="8" max="8" width="15" customWidth="1"/>` +
    `<col min="9" max="9" width="20" customWidth="1"/>` +
    `<col min="10" max="10" width="13" customWidth="1"/>` +
    `<col min="11" max="11" width="13" customWidth="1"/>` +
    `<col min="12" max="12" width="16" customWidth="1"/>` +
    `<col min="13" max="13" width="16" customWidth="1"/>` +
    `</cols>`;
  xmlStr = xmlStr.replace(/<cols>[\s\S]*?<\/cols>/, colsXml);

  const BASE_ROW_HT = 19.95;
  const ROWS_PER_PAGE = 90;
  const DIVIDER_POS = 15;

  const calcRowHt = (name: string, office: string, borrower: string, returned: string): number => {
    const linesFor = (text: string, maxChars: number) =>
      text.length === 0 ? 1 : Math.ceil(text.length / maxChars);
    const LINE_HT = 13.5;
    const lines = Math.max(
      linesFor(name, 25),       // Employee Name
      linesFor(office, 25),     // Office/Hospital
      linesFor(borrower, 20),   // Borrower Name
      linesFor(returned, 20)    // Returned Name
    );
    return lines <= 1 ? BASE_ROW_HT : BASE_ROW_HT + (lines - 1) * LINE_HT;
  };

  const formatDatePart = (dateVal: any) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const formatTimePart = (dateVal: any) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  };

  const getStyles = (posInPage: number, totalInPage: number) => {
    if (posInPage === 0) return { sA: '6', sMid: '12', sLast: '15' };
    const last = totalInPage - 1;
    const penul = totalInPage - 2;
    if (posInPage === last) return { sA: '10', sMid: '29', sLast: '32' };
    if (posInPage === penul) return { sA: '9', sMid: '16', sLast: '28' };
    if (posInPage >= 58) return { sA: '8', sMid: '16', sLast: '19' };
    return { sA: '7', sMid: '16', sLast: '19' };
  };

  const generateHeaderBlock = (start: number): string => {
    const headerTexts = [
      'Republic of the Philippines',
      'Province of Pangasinan',
      'Lingayen',
      'HUMAN RESOURCE MGT. & DEVELOPMENT OFFICE',
      ''
    ];

    let block = '';
    // Row 1 (starts at start)
    block += `<row r="${start}" spans="1:13" ht="15" customHeight="1" x14ac:dyDescent="0.25">` +
      `<c r="A${start}" s="37" t="inlineStr"><is><t>${headerTexts[0]}</t></is></c>` +
      Array.from({ length: 12 }, (_, colIdx) => `<c r="${String.fromCharCode(66 + colIdx)}${start}" s="37"/>`).join('') +
      `</row>`;

    // Row 2 to 5
    for (let h = 1; h <= 4; h++) {
      const rn = start + h;
      const sty = '38';
      const txt = headerTexts[h];
      const thickBot = h === 4 ? ' thickBot="1"' : '';
      block += `<row r="${rn}" spans="1:13" ht="15" customHeight="1"${thickBot} x14ac:dyDescent="0.25">` +
        `<c r="A${rn}" s="${sty}" t="inlineStr"><is><t>${escapeXml(txt)}</t></is></c>` +
        Array.from({ length: 12 }, (_, colIdx) => `<c r="${String.fromCharCode(66 + colIdx)}${rn}" s="${sty}"/>`).join('') +
        `</row>`;
    }

    // Title Row (row 6)
    const titleRow = start + 5;
    block += `<row r="${titleRow}" spans="1:13" ht="25.05" customHeight="1" thickBot="1" x14ac:dyDescent="0.3">` +
      `<c r="A${titleRow}" s="39" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c>` +
      Array.from({ length: 11 }, (_, colIdx) => `<c r="${String.fromCharCode(66 + colIdx)}${titleRow}" s="40"/>`).join('') +
      `<c r="M${titleRow}" s="41"/>` +
      `</row>`;

    // Headers row 1 (row 7)
    const h7 = start + 6;
    block += `<row r="${h7}" spans="1:13" ht="12.75" customHeight="1" thickBot="1" x14ac:dyDescent="0.3">` +
      `<c r="A${h7}" s="35" t="inlineStr"><is><t>NO.</t></is></c>` +
      `<c r="B${h7}" s="35" t="inlineStr"><is><t>EMPLOYEE NAME</t></is></c>` +
      `<c r="C${h7}" s="35" t="inlineStr"><is><t>OFFICE/HOSPITAL</t></is></c>` +
      `<c r="D${h7}" s="35" t="inlineStr"><is><t>EMPLOYMENT STATUS</t></is></c>` +
      `<c r="E${h7}" s="39" t="inlineStr"><is><t>BORROWER</t></is></c>` +
      `<c r="F${h7}" s="42"/>` +
      `<c r="G${h7}" s="42"/>` +
      `<c r="H${h7}" s="35" t="inlineStr"><is><t>NAME OF FILES</t></is></c>` +
      `<c r="I${h7}" s="39" t="inlineStr"><is><t>RETURNED</t></is></c>` +
      `<c r="J${h7}" s="42"/>` +
      `<c r="K${h7}" s="42"/>` +
      `<c r="L${h7}" s="35" t="inlineStr"><is><t>RECORDS CONFORMED</t></is></c>` +
      `<c r="M${h7}" s="35" t="inlineStr"><is><t>REMARK</t></is></c>` +
      `</row>`;

    // Headers row 2 (row 8)
    const h8 = start + 7;
    block += `<row r="${h8}" spans="1:13" ht="21" customHeight="1" thickBot="1" x14ac:dyDescent="0.3">` +
      `<c r="A${h8}" s="36"/>` +
      `<c r="B${h8}" s="36"/>` +
      `<c r="C${h8}" s="36"/>` +
      `<c r="D${h8}" s="36"/>` +
      `<c r="E${h8}" s="5" t="inlineStr"><is><t>NAME</t></is></c>` +
      `<c r="F${h8}" s="5" t="inlineStr"><is><t>DATE</t></is></c>` +
      `<c r="G${h8}" s="5" t="inlineStr"><is><t>TIME</t></is></c>` +
      `<c r="H${h8}" s="36"/>` +
      `<c r="I${h8}" s="5" t="inlineStr"><is><t>NAME</t></is></c>` +
      `<c r="J${h8}" s="5" t="inlineStr"><is><t>DATE</t></is></c>` +
      `<c r="K${h8}" s="5" t="inlineStr"><is><t>TIME</t></is></c>` +
      `<c r="L${h8}" s="36"/>` +
      `<c r="M${h8}" s="36"/>` +
      `</row>`;

    return block;
  };

  const row1Start = xmlStr.indexOf('<row r="1"');
  if (row1Start === -1) return { xml: xmlStr, lastRow: 8 };
  const xmlBefore = xmlStr.substring(0, row1Start);

  const sheetDataEnd = xmlStr.indexOf('</sheetData>');
  if (sheetDataEnd === -1) return { xml: xmlStr, lastRow: 8 };
  const xmlAfterSheetData = xmlStr.substring(sheetDataEnd);

  const row9Start = xmlStr.indexOf('<row r="9"');
  const originalHeaderRowsXml = row9Start !== -1
    ? xmlStr.substring(row1Start, row9Start)
    : xmlStr.substring(row1Start, sheetDataEnd);

  let patchedHeaderRowsXml = originalHeaderRowsXml
    .replace(
      /<row r="6"[\s\S]*?<\/row>/,
      `<row r="6" spans="1:13" ht="25.05" customHeight="1" thickBot="1" x14ac:dyDescent="0.3"><c r="A6" s="39" t="inlineStr"><is><t>${escapeXml(title)}</t></is></c>${Array.from({ length: 11 }, (_, colIdx) => `<c r="${String.fromCharCode(66 + colIdx)}6" s="40"/>`).join('')}<c r="M6" s="41"/></row>`
    )
    .replace(
      /<row r="7"[\s\S]*?<\/row>/,
      `<row r="7" spans="1:13" ht="12.75" customHeight="1" thickBot="1" x14ac:dyDescent="0.3">` +
      `<c r="A7" s="35" t="inlineStr"><is><t>NO.</t></is></c>` +
      `<c r="B7" s="35" t="inlineStr"><is><t>EMPLOYEE NAME</t></is></c>` +
      `<c r="C7" s="35" t="inlineStr"><is><t>OFFICE/HOSPITAL</t></is></c>` +
      `<c r="D7" s="35" t="inlineStr"><is><t>EMPLOYMENT STATUS</t></is></c>` +
      `<c r="E7" s="39" t="inlineStr"><is><t>BORROWER</t></is></c>` +
      `<c r="F7" s="42"/>` +
      `<c r="G7" s="42"/>` +
      `<c r="H7" s="35" t="inlineStr"><is><t>NAME OF FILES</t></is></c>` +
      `<c r="I7" s="39" t="inlineStr"><is><t>RETURNED</t></is></c>` +
      `<c r="J7" s="42"/>` +
      `<c r="K7" s="42"/>` +
      `<c r="L7" s="35" t="inlineStr"><is><t>RECORDS CONFORMED</t></is></c>` +
      `<c r="M7" s="35" t="inlineStr"><is><t>REMARK</t></is></c>` +
      `</row>`
    )
    .replace(
      /<row r="8"[\s\S]*?<\/row>/,
      `<row r="8" spans="1:13" ht="21" customHeight="1" thickBot="1" x14ac:dyDescent="0.3">` +
      `<c r="A8" s="36"/>` +
      `<c r="B8" s="36"/>` +
      `<c r="C8" s="36"/>` +
      `<c r="D8" s="36"/>` +
      `<c r="E8" s="5" t="inlineStr"><is><t>NAME</t></is></c>` +
      `<c r="F8" s="5" t="inlineStr"><is><t>DATE</t></is></c>` +
      `<c r="G8" s="5" t="inlineStr"><is><t>TIME</t></is></c>` +
      `<c r="H8" s="36"/>` +
      `<c r="I8" s="5" t="inlineStr"><is><t>NAME</t></is></c>` +
      `<c r="J8" s="5" t="inlineStr"><is><t>DATE</t></is></c>` +
      `<c r="K8" s="5" t="inlineStr"><is><t>TIME</t></is></c>` +
      `<c r="L8" s="36"/>` +
      `<c r="M8" s="36"/>` +
      `</row>`
    );

  let newRowsXml = '';
  let globalRowNum = 9;
  let dataIdx = 0;
  let pageNum = 0;
  const headerStartRows: number[] = [1];

  while (dataIdx < rowsData.length) {
    const pageData = rowsData.slice(dataIdx, dataIdx + ROWS_PER_PAGE);
    const pageCount = pageData.length;

    if (pageNum > 0) {
      headerStartRows.push(globalRowNum);
      newRowsXml += generateHeaderBlock(globalRowNum);
      globalRowNum += 8;
    }

    let posInPage = 0;
    for (let i = 0; i < pageCount; i++) {
      if (posInPage === DIVIDER_POS) {
        newRowsXml += `<row r="${globalRowNum}" spans="1:13" ht="19.95" customHeight="1" x14ac:dyDescent="0.25">` +
          `<c r="A${globalRowNum}" s="11"/>` +
          `<c r="B${globalRowNum}" s="22"/>` +
          `<c r="C${globalRowNum}" s="22"/>` +
          `<c r="D${globalRowNum}" s="22"/>` +
          `<c r="E${globalRowNum}" s="23"/>` +
          `<c r="F${globalRowNum}" s="22"/>` +
          `<c r="G${globalRowNum}" s="22"/>` +
          `<c r="H${globalRowNum}" s="22"/>` +
          `<c r="I${globalRowNum}" s="23"/>` +
          `<c r="J${globalRowNum}" s="22"/>` +
          `<c r="K${globalRowNum}" s="22"/>` +
          `<c r="L${globalRowNum}" s="24"/>` +
          `<c r="M${globalRowNum}" s="25"/>` +
          `</row>`;
        globalRowNum++;
        posInPage++;
      }

      const row = pageData[i];
      const st = getStyles(posInPage === 0 && i === 0 ? 0 : posInPage, pageCount + (pageCount >= DIVIDER_POS ? 1 : 0));

      const noVal = String(dataIdx + i + 1);
      const emp = row.employee;
      const nameVal = emp ? `${emp.lastName}, ${emp.firstName}` : row.employeeId;
      const officeVal = getOfficeFullName(row.employee?.yellowBox?.office || row.employee?.officeName) || '—';
      const statusVal = row.employee?.status || '—'; // Active or Inactive

      const borrowerNameVal = row.borrowerName || '';
      const borrowerDateVal = formatDatePart(row.dateBorrowed);
      const borrowerTimeVal = formatTimePart(row.dateBorrowed);

      const filesVal = '201 File';

      const isReturned = row.action === 'return' || !!row.dateReturned;
      const returnedNameVal = isReturned ? (row.returnedByName || '') : '';
      const returnedDateVal = isReturned ? formatDatePart(row.dateReturned) : '';
      const returnedTimeVal = isReturned ? formatTimePart(row.dateReturned) : '';

      const conformedVal = '';
      const remarkVal = '';

      const rowHt = calcRowHt(nameVal, officeVal, borrowerNameVal, returnedNameVal);

      newRowsXml += `<row r="${globalRowNum}" spans="1:13" ht="${rowHt}" customHeight="1" x14ac:dyDescent="0.25">`;
      newRowsXml += `<c r="A${globalRowNum}" s="${st.sA}" t="inlineStr"><is><t>${escapeXml(noVal)}</t></is></c>`;
      newRowsXml += `<c r="B${globalRowNum}" s="${st.sMid}" t="inlineStr"><is><t>${escapeXml(nameVal)}</t></is></c>`;
      newRowsXml += `<c r="C${globalRowNum}" s="${st.sMid}" t="inlineStr"><is><t>${escapeXml(officeVal)}</t></is></c>`;
      newRowsXml += `<c r="D${globalRowNum}" s="${st.sMid}" t="inlineStr"><is><t>${escapeXml(statusVal)}</t></is></c>`;
      newRowsXml += `<c r="E${globalRowNum}" s="${st.sMid}" t="inlineStr"><is><t>${escapeXml(borrowerNameVal)}</t></is></c>`;
      newRowsXml += `<c r="F${globalRowNum}" s="${st.sMid}" t="inlineStr"><is><t>${escapeXml(borrowerDateVal)}</t></is></c>`;
      newRowsXml += `<c r="G${globalRowNum}" s="${st.sMid}" t="inlineStr"><is><t>${escapeXml(borrowerTimeVal)}</t></is></c>`;
      newRowsXml += `<c r="H${globalRowNum}" s="${st.sMid}" t="inlineStr"><is><t>${escapeXml(filesVal)}</t></is></c>`;
      newRowsXml += `<c r="I${globalRowNum}" s="${st.sMid}" t="inlineStr"><is><t>${escapeXml(returnedNameVal)}</t></is></c>`;
      newRowsXml += `<c r="J${globalRowNum}" s="${st.sMid}" t="inlineStr"><is><t>${escapeXml(returnedDateVal)}</t></is></c>`;
      newRowsXml += `<c r="K${globalRowNum}" s="${st.sMid}" t="inlineStr"><is><t>${escapeXml(returnedTimeVal)}</t></is></c>`;
      newRowsXml += `<c r="L${globalRowNum}" s="${st.sMid}" t="inlineStr"><is><t>${escapeXml(conformedVal)}</t></is></c>`;
      newRowsXml += `<c r="M${globalRowNum}" s="${st.sLast}" t="inlineStr"><is><t>${escapeXml(remarkVal)}</t></is></c>`;
      newRowsXml += `</row>`;

      globalRowNum++;
      posInPage++;
    }

    dataIdx += ROWS_PER_PAGE;
    pageNum++;

    for (let s = 0; s < 13; s++) {
      newRowsXml += `<row r="${globalRowNum}" spans="1:13" ht="12.75" customHeight="1" x14ac:dyDescent="0.25">` +
        `<c r="E${globalRowNum}" s="3"/>` +
        `<c r="F${globalRowNum}" s="3"/>` +
        `<c r="I${globalRowNum}" s="3"/>` +
        `<c r="J${globalRowNum}" s="3"/>` +
        `<c r="M${globalRowNum}" s="4"/>` +
        `</row>`;
      globalRowNum++;
    }
  }

  // ── Rebuild mergeCells for all pages ─────────────────────────────────────
  const allMerges: string[] = [];
  for (let p = 0; p < pageNum; p++) {
    const start = headerStartRows[p];
    allMerges.push(
      `A${start}:M${start}`,
      `A${1 + start}:M${1 + start}`,
      `A${2 + start}:M${2 + start}`,
      `A${3 + start}:M${3 + start}`,
      `A${4 + start}:M${4 + start}`,
      `A${5 + start}:M${5 + start}`,
      `A${6 + start}:A${7 + start}`,
      `B${6 + start}:B${7 + start}`,
      `C${6 + start}:C${7 + start}`,
      `D${6 + start}:D${7 + start}`,
      `E${6 + start}:G${6 + start}`,
      `H${6 + start}:H${7 + start}`,
      `I${6 + start}:K${6 + start}`,
      `L${6 + start}:L${7 + start}`,
      `M${6 + start}:M${7 + start}`
    );
  }

  const mergeCellsXml = `<mergeCells count="${allMerges.length}">${allMerges.map(r => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`;

  const newXml = xmlBefore + patchedHeaderRowsXml + newRowsXml + `</sheetData>` +
    xmlAfterSheetData
      .replace(/<mergeCells[\s\S]*?<\/mergeCells>/, mergeCellsXml)
      .replace('</sheetData>', '');

  return { xml: newXml, lastRow: globalRowNum - 1 };
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
  const [addProfilePicture, setAddProfilePicture] = useState<string | undefined>(undefined);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [pendingUpdatePayload, setPendingUpdatePayload] = useState<{ employeeId: string; changedFields: any } | null>(null);
  const [pendingImportEmployees, setPendingImportEmployees] = useState<ImportedEmployee[] | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [originalEmployeeData, setOriginalEmployeeData] = useState<EmployeeFormData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [employeeStats, setEmployeeStats] = useState<{ total: number, active: number, inactive: number, documents: number, storageUsed: number }>({ total: 0, active: 0, inactive: 0, documents: 0, storageUsed: 0 });
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]); // Note: Still used for reports client-side generation
  const [isLoading, setIsLoading] = useState(false);
  const [showAllEmployees, setShowAllEmployees] = useState(true);

  // Generated Reports UI states
  const location = useLocation();
  const viewMode = location.pathname.startsWith('/reports') ? 'reports' : 'employees';
  const [reportAoStatus, setReportAoStatus] = useState<'Detailed' | 'Designated' | 'Recalled' | 'All Employees'>('All Employees');
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

  // Pulled-Out & Transferred Files UI States
  const reportsTab = location.pathname === '/reports/pulled-out'
    ? 'pulled-out'
    : location.pathname === '/reports/transferred'
    ? 'transferred'
    : 'ao';

  const [borrowLogs, setBorrowLogs] = useState<any[]>([]);
  const [borrowLogsLoading, setBorrowLogsLoading] = useState(false);
  const [borrowSearchTerm, setBorrowSearchTerm] = useState('');
  const [borrowStatusFilter, setBorrowStatusFilter] = useState<'All' | 'Borrowed' | 'Returned'>('All');
  const [borrowDateFromFilter, setBorrowDateFromFilter] = useState('');
  const [borrowDateToFilter, setBorrowDateToFilter] = useState('');
  const [returnDateFromFilter, setReturnDateFromFilter] = useState('');
  const [returnDateToFilter, setReturnDateToFilter] = useState('');
  const [borrowCurrentPage, setBorrowCurrentPage] = useState(1);
  const [borrowItemsPerPage, setBorrowItemsPerPage] = useState(15);
  const [selectedBorrowLog, setSelectedBorrowLog] = useState<any>(null);
  const [isBorrowDetailsModalOpen, setIsBorrowDetailsModalOpen] = useState(false);
  const [selectedBorrowRowIds, setSelectedBorrowRowIds] = useState<Set<string>>(new Set());
  const [isDeleteBorrowConfirmOpen, setIsDeleteBorrowConfirmOpen] = useState(false);
  const [pendingDeleteBorrowIds, setPendingDeleteBorrowIds] = useState<string[]>([]);
  const [isDeletingBorrow, setIsDeletingBorrow] = useState(false);
  const [borrowSortPriority, setBorrowSortPriority] = useState<ReportSortConfig[]>([]);

  // Transferred Files UI States
  const [transferredLogs, setTransferredLogs] = useState<any[]>([]);
  const [transferredLogsLoading, setTransferredLogsLoading] = useState(false);
  const [transferredSearchTerm, setTransferredSearchTerm] = useState('');
  const [transferredStatusFilter, setTransferredStatusFilter] = useState<'All' | 'Transferred' | 'Returned'>('All');
  const [transferredDateFromFilter, setTransferredDateFromFilter] = useState('');
  const [transferredDateToFilter, setTransferredDateToFilter] = useState('');
  const [transferredReturnDateFromFilter, setTransferredReturnDateFromFilter] = useState('');
  const [transferredReturnDateToFilter, setTransferredReturnDateToFilter] = useState('');
  const [transferredCurrentPage, setTransferredCurrentPage] = useState(1);
  const [transferredItemsPerPage, setTransferredItemsPerPage] = useState(15);
  const [selectedTransferredLog, setSelectedTransferredLog] = useState<any>(null);
  const [isTransferredDetailsModalOpen, setIsTransferredDetailsModalOpen] = useState(false);
  const [selectedTransferredRowIds, setSelectedTransferredRowIds] = useState<Set<string>>(new Set());
  const [isDeleteTransferredConfirmOpen, setIsDeleteTransferredConfirmOpen] = useState(false);
  const [pendingDeleteTransferredIds, setPendingDeleteTransferredIds] = useState<string[]>([]);
  const [isDeletingTransferred, setIsDeletingTransferred] = useState(false);
  const [transferredSortPriority, setTransferredSortPriority] = useState<ReportSortConfig[]>([]);
  const [isTransferredReportPreviewOpen, setIsTransferredReportPreviewOpen] = useState(false);
  const [isTransferredColumnDropdownOpen, setIsTransferredColumnDropdownOpen] = useState(false);
  const [visibleTransferredColumns, setVisibleTransferredColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('transferred_visible_columns');
      return saved ? JSON.parse(saved) : DEFAULT_VISIBLE_TRANSFERRED_COLUMNS;
    } catch {
      return DEFAULT_VISIBLE_TRANSFERRED_COLUMNS;
    }
  });
  const transferredDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedReportRowIds(new Set());
    setSelectedBorrowRowIds(new Set());
    setSelectedTransferredRowIds(new Set());
  }, [reportsTab]);

  useEffect(() => {
    if (borrowStatusFilter === 'Borrowed') {
      setReturnDateFromFilter('');
      setReturnDateToFilter('');
    }
  }, [borrowStatusFilter]);

  useEffect(() => {
    if (transferredStatusFilter === 'Transferred') {
      setTransferredReturnDateFromFilter('');
      setTransferredReturnDateToFilter('');
    }
  }, [transferredStatusFilter]);

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

  const [isBorrowReportPreviewOpen, setIsBorrowReportPreviewOpen] = useState(false);
  const [visibleBorrowColumns, setVisibleBorrowColumns] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('borrow_visible_columns');
      return saved ? JSON.parse(saved) : DEFAULT_VISIBLE_BORROW_COLUMNS;
    } catch {
      return DEFAULT_VISIBLE_BORROW_COLUMNS;
    }
  });
  const [isBorrowColumnDropdownOpen, setIsBorrowColumnDropdownOpen] = useState(false);
  const borrowDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsColumnDropdownOpen(false);
      }
      if (borrowDropdownRef.current && !borrowDropdownRef.current.contains(event.target as Node)) {
        setIsBorrowColumnDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [reportCurrentPage, setReportCurrentPage] = useState(1);
  const [reportItemsPerPage, setReportItemsPerPage] = useState(15);

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
    detailedOrderFrom: '',
    detailedOrderTo: '',
    designatedPositionFunction: '',
    designatedOrderFrom: '',
    designatedOrderTo: '',
    recalledFrom: '',
    recalledTo: '',
    recalledOrderFrom: '',
    recalledOrderTo: '',
    fileboxLocation: '',
    file201Status: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof EmployeeFormData, string>>>({});
  const [showIdUpdate, setShowIdUpdate] = useState(false);

  // Get current user permissions
  const currentUser = getAuthState();
  const userRole = currentUser?.role || '';
  const canDownloadOrPrint = userRole === 'superadmin' || userRole === 'developer' || userRole === 'admin';
  const [selectedReportDocument, setSelectedReportDocument] = useState<any>(null);
  const [reportPdfData, setReportPdfData] = useState<string | null>(null);
  const [isReportViewerOpen, setIsReportViewerOpen] = useState(false);

  const selectedReportEmployeeName = useMemo(() => {
    if (!selectedReportDocument) return '';
    const emp = allEmployees.find(e => e.id === selectedReportDocument.employeeId);
    return emp ? `${emp.lastName}, ${emp.firstName} ${emp.middleName || ''}`.trim() : '';
  }, [selectedReportDocument, allEmployees]);

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
        officeNames: cleanOfficeDropdownOptions(s.officeNames ?? []),
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

  const fetchBorrowLogs = useCallback(async () => {
    try {
      setBorrowLogsLoading(true);
      const data = await api.file201.getAllLogs();
      setBorrowLogs(data);
    } catch (error) {
      console.error('Failed to fetch borrow logs:', error);
      showToast('Failed to load transaction logs.', 'error');
    } finally {
      setBorrowLogsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (viewMode === 'reports' && reportsTab === 'pulled-out') {
      fetchBorrowLogs();
    }
  }, [viewMode, reportsTab, fetchBorrowLogs]);

  const fetchTransferredLogs = useCallback(async () => {
    try {
      setTransferredLogsLoading(true);
      const data = await api.file201.getAllTransferredLogs();
      setTransferredLogs(data);
    } catch (error) {
      console.error('Failed to fetch transferred logs:', error);
      showToast('Failed to load transferred 201 file logs.', 'error');
    } finally {
      setTransferredLogsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (viewMode === 'reports' && reportsTab === 'transferred') {
      fetchTransferredLogs();
    }
  }, [viewMode, reportsTab, fetchTransferredLogs]);

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

  // Fetch KPI stats and all employees on initial load
  useEffect(() => {
    fetchEmployeeStats();
    fetchAllEmployeesForKPI();
    if (viewMode === 'reports') {
      fetchEmployeeAuditLogs();
    }
  }, [viewMode]);

  // Listen for updates
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const handleUpdate = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fetchEmployeeStats();
        if (viewMode === 'reports') {
          fetchAllEmployeesForKPI();
          fetchEmployeeAuditLogs();
          fetchTransferredLogs();
          fetchBorrowLogs();
        }
        fetchEmployees();
      }, 250);
    };

    window.addEventListener('employeeUpdated', handleUpdate);
    window.addEventListener('approvalsUpdated', handleUpdate);
    window.addEventListener('documentsUpdated', handleUpdate);
    window.addEventListener('file201Updated', handleUpdate);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('employeeUpdated', handleUpdate);
      window.removeEventListener('approvalsUpdated', handleUpdate);
      window.removeEventListener('documentsUpdated', handleUpdate);
      window.removeEventListener('file201Updated', handleUpdate);
    };
  }, [searchQuery, searchFilterType, statusFilter, showAllEmployees, currentPage, itemsPerPage, viewMode, fetchTransferredLogs, fetchBorrowLogs]);

  // Fetch KPI stats
  const fetchEmployeeStats = async () => {
    try {
      const stats = await api.employee.getStats();
      setEmployeeStats(stats);
    } catch (error) {
      console.error('Error fetching employee stats:', error);
    }
  };

  // Fetch all employees for reports (Warning: Can be slow with 100k+)
  const fetchAllEmployeesForKPI = async () => {
    try {
      const data = await api.employee.getAll({ includeDocuments: true }); // Request documents for AO reports viewer
      setAllEmployees(Array.isArray(data) ? data : (data as any).data || []);
    } catch (error) {
      console.error('Error fetching all employees:', error);
    }
  };

  const searchRequestIdRef = useRef(0);

  // Ultra-responsive debounced search effect (60ms)
  useEffect(() => {
    // Only fetch if there's a search query OR showAllEmployees is true
    if (searchQuery.trim() || showAllEmployees) {
      const currentReqId = ++searchRequestIdRef.current;
      const timeoutId = setTimeout(() => {
        fetchEmployees(currentReqId);
      }, 60); // 60ms ultra-fast debounce

      return () => clearTimeout(timeoutId);
    } else {
      // Clear employees when search is empty and not showing all
      setEmployees([]);
      setTotalEmployees(0);
      setIsLoading(false);
    }
  }, [searchQuery, searchFilterType, statusFilter, showAllEmployees, currentPage, itemsPerPage]);

  const fetchEmployeeAuditLogs = async () => {
    try {
      const logs = await api.audit.getAll({ entity: 'employee', action: 'update', limit: 10000 });
      setEmployeeAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (error) {
      console.error('Error fetching employee audit logs:', error);
    }
  };

  const fetchEmployees = async (requestId?: number) => {
    try {
      setIsLoading(true);
      const filters: any = {
        page: currentPage,
        limit: itemsPerPage
      };

      // Add status filter
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }

      // Add search filter
      if (searchQuery.trim()) {
        filters.search = searchQuery.trim();
        filters.filter_type = searchFilterType;
      }

      const result = await api.employee.getAll(filters);
      // Discard results if a newer search request has already been initiated
      if (requestId && requestId !== searchRequestIdRef.current) {
        return;
      }

      if (result && (result as any).data) {
        setEmployees((result as any).data);
        setTotalEmployees((result as any).total);
      } else if (Array.isArray(result)) {
        setEmployees(result);
        setTotalEmployees(result.length);
      } else {
        setEmployees([]);
        setTotalEmployees(0);
      }
    } catch (error) {
      if (requestId && requestId !== searchRequestIdRef.current) {
        return;
      }
      console.error('Error fetching employees:', error);
      showToast('Failed to load employees. Please check if the backend server is running.', 'error');
    } finally {
      if (!requestId || requestId === searchRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const filteredEmployees = employees;
  const paginatedEmployees = employees;
  
  const totalPages = Math.ceil(totalEmployees / itemsPerPage);

  const reportRows = useMemo<ReportRow[]>(() => {
    // Determine AO type from the DB-persisted aoType field first,
    // then fall back to isDetailed flag, then check designated/recalled fields.
    const inferAoType = (data: any): ReportRow['aoType'] => {
      const rawAoType = String(data.aoType || '').trim().toLowerCase();
      if (rawAoType === 'detailed') return 'Detailed';
      if (rawAoType === 'designated') return 'Designated';
      if (rawAoType === 'recalled') return 'Recalled';
      // Legacy: isDetailed boolean stored before aoType column existed
      if (data.isDetailed === true) return 'Detailed';
      // Legacy: designated fields present without aoType
      if (
        String(data.designatedPositionFunction || '').trim() ||
        String(data.designatedOrderFrom || '').trim() ||
        String(data.designatedOrderTo || '').trim()
      ) return 'Designated';
      if (
        String(data.recalledFrom || '').trim() ||
        String(data.recalledTo || '').trim() ||
        String(data.recalledOrderFrom || '').trim() ||
        String(data.recalledOrderTo || '').trim()
      ) return 'Recalled';
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
          // Prefer doc's aoType; fall back to employee when this doc matches the current AO.
          // Also accept legacy isDetailed flag stored directly on the document.
          aoType: docSource.aoType || (isCurrentAo ? source.aoType : '')
            || (docSource.isDetailed === true ? 'Detailed' : ''),
          detailedTo: docSource.detailedTo || (isCurrentAo ? source.detailedTo : ''),
          detailedDivision: docSource.detailedDivision || (isCurrentAo ? source.detailedDivision : ''),
          detailedFunction: docSource.detailedFunction || (isCurrentAo ? source.detailedFunction : ''),
          detailedDate: docSource.detailedDate || (isCurrentAo ? source.detailedDate : null),
          detailedOrderFrom: docSource.detailedOrderFrom || docSource.appointmentFrom || source.detailedOrderFrom || null,
          detailedOrderTo: docSource.detailedOrderTo || docSource.appointmentTo || source.detailedOrderTo || null,
          designatedPositionFunction: docSource.designatedPositionFunction || (isCurrentAo ? source.designatedPositionFunction : ''),
          designatedOrderFrom: docSource.designatedOrderFrom || source.designatedOrderFrom || null,
          designatedOrderTo: docSource.designatedOrderTo || source.designatedOrderTo || null,
          recalledFrom: docSource.recalledFrom || (isCurrentAo ? source.recalledFrom : ''),
          recalledTo: docSource.recalledTo || (isCurrentAo ? source.recalledTo : ''),
          recalledOrderFrom: docSource.recalledOrderFrom || source.recalledOrderFrom || null,
          recalledOrderTo: docSource.recalledOrderTo || source.recalledOrderTo || null,
          appointmentFrom: docSource.appointmentFrom || (isCurrentAo ? source.appointmentFrom : null),
          appointmentTo: docSource.appointmentTo || (isCurrentAo ? source.appointmentTo : null),
        }
        : source;

      const aoType = inferAoType(activeSource);

      // Detailed: duration = detailedOrderFrom / detailedOrderTo
      // Designated: duration = designatedOrderFrom / designatedOrderTo
      // Recalled: duration = recalledOrderFrom / recalledOrderTo
      const durationFrom = aoType === 'Detailed'
        ? String(activeSource.detailedOrderFrom || activeSource.detailedDate || activeSource.appointmentFrom || '').trim()
        : aoType === 'Recalled'
          ? String(activeSource.recalledOrderFrom || activeSource.appointmentFrom || '').trim()
          : String(activeSource.designatedOrderFrom || activeSource.appointmentFrom || '').trim();
      const durationTo = aoType === 'Detailed'
        ? String(activeSource.detailedOrderTo || activeSource.appointmentTo || '').trim()
        : aoType === 'Recalled'
          ? String(activeSource.recalledOrderTo || activeSource.appointmentTo || '').trim()
          : String(activeSource.designatedOrderTo || activeSource.appointmentTo || '').trim();

      const aoOrderMonth = durationFrom
        ? (() => {
          const d = new Date(durationFrom);
          return isNaN(d.getTime()) ? '' : String(d.getMonth() + 1).padStart(2, '0');
        })()
        : '';

      const dateOfBirth = birthDate ? formatDateDDMMYYYY(source.dateOfBirth) : '-';

      // Mother unit = Office/Hospital Name (employment information) — the primary source
      const motherUnit = getOfficeFullName(source.officeHospitalName || source.officeName || source.motherUnit) || '';

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
        detailedOffice: getOfficeFullName(String(activeSource.detailedTo || '').trim()),
        designatedPositionFunction: String(activeSource.designatedPositionFunction || '').trim(),
        recalledFrom: getOfficeFullName(String(activeSource.recalledFrom || '').trim()),
        recalledTo: getOfficeFullName(String(activeSource.recalledTo || '').trim()),
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
      if (aoDocs.length === 0) {
        const row = buildRow(emp, `emp-${emp.id}`);
        if (row.aoNumber || row.aoType) {
          currentRows.push(row);
        }
        return;
      }

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

    // Optimize employee lookup to prevent O(N^2) performance block
    const employeesById = new Map(allEmployees.map(emp => [String(emp.id), emp]));

    Object.entries(logsByEmployee).forEach(([empId, logs]) => {
      const emp = employeesById.get(empId);
      if (!emp) return;

      // Exclude employee historical records if they no longer have an active Administrative Order document or AO fields
      const docs = (emp as any).documents || [];
      const hasAoDoc = docs.some((d: any) => d.category === 'Administrative Order');
      if (!hasAoDoc && !(emp as any).aoNumber && !(emp as any).aoType) return;

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
          'recalledFrom', 'recalledTo', 'recalledOrderFrom', 'recalledOrderTo',
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
    return cleanOfficeDropdownOptions(motherUnits);
  }, [allEmployees]);

  const filteredReportRows = useMemo(() => {
    return reportRows.filter((row) => {
      if (reportAoStatus === 'Detailed' && row.aoType !== 'Detailed') return false;
      if (reportAoStatus === 'Designated' && row.aoType !== 'Designated') return false;
      if (reportAoStatus === 'Recalled' && row.aoType !== 'Recalled') return false;

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
      return sortedReportRows.filter((row) => row.status === 'Active' && isNearExpiration(row.durationTo));
    } else {
      return sortedReportRows.filter((row) => row.status === 'Active' && isExpired(row.durationTo));
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

  const handleOpenAoPdf = async (e: React.MouseEvent, rowOrEmp: any, docId?: string) => {
    e.stopPropagation();
    const rawEmp = rowOrEmp.rawEmployee || rowOrEmp;
    const docs = (rawEmp as any).documents || [];
    let aoDoc = docId
      ? docs.find((d: any) => d.id === docId)
      : docs.find((d: any) => d.category === 'Administrative Order');

    const empId = rowOrEmp.employeeId || rowOrEmp.id || rawEmp.id;

    if (!aoDoc && empId) {
      try {
        const empDocs = await api.document.getByEmployee(empId);
        aoDoc = docId
          ? empDocs.find((d: any) => d.id === docId)
          : empDocs.find((d: any) => d.category === 'Administrative Order');
      } catch (err) {
        console.error('Failed to load documents for AO viewer:', err);
      }
    }

    if (aoDoc) {
      setSelectedReportDocument(aoDoc);
      setReportPdfData(`${getServerBaseUrl()}/api/documents/${aoDoc.id}/file`);
      setIsReportViewerOpen(true);
    } else {
      showToast('No PDF document attached to this Administrative Order.', 'info');
    }
  };

  const renderAdministrativeOrder = (row: ReportRow) => {
    const label = `${row.aoNumber ? `AO ${row.aoNumber}` : '-'}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}`.trim();
    if (!row.aoNumber && label === '-') return '-';

    return (
      <button
        onClick={(e) => handleOpenAoPdf(e, row, row.docId)}
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
  };

  const currentAvailableKeys = useMemo<string[]>(() => {
    if (reportAoStatus === 'Detailed') {
      return ['employeeId', 'name', 'position', 'motherUnit', 'detailedOffice', 'durationFrom', 'durationTo', 'administrativeOrder'];
    } else if (reportAoStatus === 'Designated') {
      return ['employeeId', 'name', 'position', 'motherUnit', 'detailedOffice', 'designatedPositionFunction', 'durationFrom', 'durationTo', 'administrativeOrder'];
    } else if (reportAoStatus === 'Recalled') {
      return ['employeeId', 'name', 'position', 'motherUnit', 'recalledFrom', 'recalledTo', 'durationFrom', 'durationTo', 'administrativeOrder'];
    } else {
      return ['employeeId', 'name', 'position', 'motherUnit', 'detailedOffice', 'designatedPositionFunction', 'recalledFrom', 'recalledTo', 'durationFrom', 'durationTo', 'dateOfBirth', 'administrativeOrder'];
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

  // --- Pulled-Out Files columns, helpers, and filtering ---

  const handleBorrowSort = (field: string) => {
    const validSortFields = new Set([
      'employeeName',
      'officeName',
      'position',
      'appointmentStatus',
      'borrowerName',
      'purpose',
      'dateBorrowed',
      'releasedBy',
      'status',
      'dateReturned',
      'returnedByName',
      'receivedBy',
      'fileCondition',
      'remarks'
    ]);

    if (!validSortFields.has(field)) return;

    setBorrowSortPriority((prev) => {
      const existing = prev.findIndex((item) => item.key === field);
      if (existing >= 0) {
        if (prev[existing].direction === 'asc') {
          const updated = [...prev];
          updated[existing] = { ...updated[existing], direction: 'desc' };
          return updated;
        } else {
          return prev.filter((_, i) => i !== existing);
        }
      }
      return [...prev, { key: field, direction: 'asc' }];
    });
  };

  const handleRemoveBorrowSort = (field: string) => {
    setBorrowSortPriority((prev) => prev.filter((item) => item.key !== field));
  };

  const renderBorrowSortableHeader = (label: string, field: string) => {
    const priorityIndex = borrowSortPriority.findIndex((item) => item.key === field) + 1;
    const active = borrowSortPriority.some((item) => item.key === field);
    const currentDirection = borrowSortPriority.find((item) => item.key === field)?.direction;

    return (
      <div className="reports-view__header-cell">
        <span>{label}</span>
        <div className="reports-view__sort-controls">
          <button
            type="button"
            className={`reports-view__sort-btn${active ? ' reports-view__sort-btn--active' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleBorrowSort(field); }}
            title={active ? (currentDirection === 'asc' ? `Sort ${label} descending` : `Remove ${label} sort`) : `Sort by ${label}`}
          >
            {priorityIndex > 0 ? <span className="reports-view__sort-priority">{priorityIndex}</span> : null}
            {active ? (currentDirection === 'asc' ? '▲' : '▼') : '⇅'}
          </button>
          {active && (
            <button
              type="button"
              className="reports-view__sort-remove-btn"
              onClick={(e) => { e.stopPropagation(); handleRemoveBorrowSort(field); }}
              title={`Remove ${label} sort`}
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  };

  const getBorrowSortValue = (row: any, field: string) => {
    switch (field) {
      case 'employeeName':
        return row.employee ? `${row.employee.lastName}, ${row.employee.firstName}` : row.employeeId || '';
      case 'officeName':
        return getOfficeFullName(row.employee?.yellowBox?.office || row.employee?.officeName) || '';
      case 'position':
        return row.employee?.position || '';
      case 'appointmentStatus':
        return row.employee?.status || '';
      case 'borrowerName':
        return row.borrowerName || '';
      case 'purpose':
        return row.purpose || '';
      case 'dateBorrowed':
        return row.dateBorrowed || '';
      case 'releasedBy':
        return row.releasedBy || '';
      case 'status':
        const isReturned = row.action === 'return' || !!row.dateReturned;
        return isReturned ? 'Returned' : 'Borrowed';
      case 'dateReturned':
        return row.dateReturned || '';
      case 'returnedByName':
        return row.returnedByName || '';
      case 'receivedBy':
        return row.receivedBy || '';
      case 'fileCondition':
        return row.fileCondition || '';
      case 'remarks':
        return row.remarks || '';
      default:
        return '';
    }
  };

  const filteredBorrowRows = useMemo(() => {
    const filtered = borrowLogs.filter((log) => {
      const emp = log.employee;
      const empName = emp ? `${emp.firstName} ${emp.lastName}`.toLowerCase() : '';
      const borrower = (log.borrowerName || '').toLowerCase();
      const purpose = (log.purpose || '').toLowerCase();
      const released = (log.releasedBy || '').toLowerCase();
      const returnedBy = (log.returnedByName || '').toLowerCase();
      const received = (log.receivedBy || '').toLowerCase();

      const search = borrowSearchTerm.toLowerCase().trim();
      const matchSearch =
        !search ||
        empName.includes(search) ||
        borrower.includes(search) ||
        purpose.includes(search) ||
        released.includes(search) ||
        returnedBy.includes(search) ||
        received.includes(search);

      const isReturned = log.action === 'return' || !!log.dateReturned;
      const matchStatus =
        borrowStatusFilter === 'All' ||
        (borrowStatusFilter === 'Borrowed' && !isReturned) ||
        (borrowStatusFilter === 'Returned' && isReturned);

      let matchBorrowDate = true;
      if (log.dateBorrowed) {
        const logDateStr = new Date(log.dateBorrowed).toLocaleDateString('en-CA');
        if (borrowDateFromFilter && logDateStr < borrowDateFromFilter) matchBorrowDate = false;
        if (borrowDateToFilter && logDateStr > borrowDateToFilter) matchBorrowDate = false;
      } else if (borrowDateFromFilter || borrowDateToFilter) {
        matchBorrowDate = false;
      }

      let matchReturnDate = true;
      if (borrowStatusFilter !== 'Borrowed') {
        if (log.dateReturned) {
          const logReturnDateStr = new Date(log.dateReturned).toLocaleDateString('en-CA');
          if (returnDateFromFilter && logReturnDateStr < returnDateFromFilter) matchReturnDate = false;
          if (returnDateToFilter && logReturnDateStr > returnDateToFilter) matchReturnDate = false;
        } else if (returnDateFromFilter || returnDateToFilter) {
          matchReturnDate = false;
        }
      }

      return matchSearch && matchStatus && matchBorrowDate && matchReturnDate;
    });

    if (borrowSortPriority.length === 0) return filtered;

    return [...filtered].sort((a, b) => {
      for (const sort of borrowSortPriority) {
        const valueA = getBorrowSortValue(a, sort.key);
        const valueB = getBorrowSortValue(b, sort.key);
        const comparison = String(valueA || '').localeCompare(String(valueB || ''), undefined, { sensitivity: 'base' });
        if (comparison !== 0) {
          return sort.direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  }, [borrowLogs, borrowSearchTerm, borrowStatusFilter, borrowDateFromFilter, borrowDateToFilter, returnDateFromFilter, returnDateToFilter, borrowSortPriority]);

  const borrowTotalPages = Math.ceil(filteredBorrowRows.length / borrowItemsPerPage);

  const paginatedBorrowLogs = useMemo(() => {
    const start = (borrowCurrentPage - 1) * borrowItemsPerPage;
    return filteredBorrowRows.slice(start, start + borrowItemsPerPage);
  }, [filteredBorrowRows, borrowCurrentPage, borrowItemsPerPage]);

  useEffect(() => {
    setBorrowCurrentPage(1);
  }, [borrowSearchTerm, borrowStatusFilter, borrowDateFromFilter, borrowDateToFilter, returnDateFromFilter, returnDateToFilter]);

  const borrowColumns = useMemo<Column<any>[]>(() => {
    const selectionColumn: Column<any> = {
      key: 'selection',
      header: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={
              paginatedBorrowLogs.length > 0 &&
              paginatedBorrowLogs.every((row) => selectedBorrowRowIds.has(row.id))
            }
            onChange={(e) => {
              const checked = e.target.checked;
              setSelectedBorrowRowIds((prev) => {
                const next = new Set(prev);
                paginatedBorrowLogs.forEach((row) => {
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
            title="Select All"
          />
          {selectedBorrowRowIds.size > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteBorrowEntries(Array.from(selectedBorrowRowIds));
              }}
              style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem', height: '28px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <MdDelete style={{ fontSize: '0.85rem' }} /> Delete ({selectedBorrowRowIds.size})
            </Button>
          )}
        </div>
      ),
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedBorrowRowIds.has(row.id)}
          onChange={(e) => {
            const checked = e.target.checked;
            setSelectedBorrowRowIds((prev) => {
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
      width: selectedBorrowRowIds.size > 0 ? '160px' : '50px',
    };

    const cols: Column<any>[] = [
      {
        key: 'employeeName',
        header: renderBorrowSortableHeader('Employee Name (Owner)', 'employeeName'),
        render: (row) => {
          const emp = row.employee;
          return emp ? `${emp.lastName}, ${emp.firstName}` : row.employeeId;
        }
      },
      {
        key: 'officeName',
        header: renderBorrowSortableHeader('Office/Hospital', 'officeName'),
        render: (row) => getOfficeFullName(row.employee?.yellowBox?.office || row.employee?.officeName) || '—'
      },
      {
        key: 'position',
        header: renderBorrowSortableHeader('Position / Designation', 'position'),
        render: (row) => row.employee?.position || '—'
      },
      {
        key: 'appointmentStatus',
        header: renderBorrowSortableHeader('Employment Status', 'appointmentStatus'),
        render: (row) => {
          const status = row.employee?.status;
          return status ? (status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()) : '—';
        }
      },
      {
        key: 'borrowerName',
        header: renderBorrowSortableHeader('Borrowed By', 'borrowerName'),
        render: (row) => row.borrowerName || '—'
      },
      {
        key: 'purpose',
        header: renderBorrowSortableHeader('Purpose / Reason', 'purpose'),
        render: (row) => row.purpose || '—'
      },
      {
        key: 'dateBorrowed',
        header: renderBorrowSortableHeader('Date Borrowed', 'dateBorrowed'),
        render: (row) => formatDateMDY(row.dateBorrowed)
      },
      {
        key: 'releasedBy',
        header: renderBorrowSortableHeader('Released By', 'releasedBy'),
        render: (row) => row.releasedBy || '—'
      },
      {
        key: 'status',
        header: renderBorrowSortableHeader('Status', 'status'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return (
            <Badge variant={isReturned ? 'success' : 'warning'}>
              {isReturned ? 'Returned' : 'Borrowed'}
            </Badge>
          );
        }
      },
      {
        key: 'dateReturned',
        header: renderBorrowSortableHeader('Date Returned', 'dateReturned'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return isReturned && row.dateReturned ? formatDateMDY(row.dateReturned) : '';
        }
      },
      {
        key: 'returnedByName',
        header: renderBorrowSortableHeader('Returned By', 'returnedByName'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return isReturned ? row.returnedByName || '—' : '';
        }
      },
      {
        key: 'receivedBy',
        header: renderBorrowSortableHeader('Received By', 'receivedBy'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return isReturned ? row.receivedBy || '—' : '';
        }
      },
      {
        key: 'fileCondition',
        header: renderBorrowSortableHeader('File Condition', 'fileCondition'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return isReturned ? row.fileCondition || '—' : '';
        }
      },
      {
        key: 'remarks',
        header: renderBorrowSortableHeader('Remarks', 'remarks'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return isReturned ? row.remarks || '—' : '';
        }
      }
    ];

    const activeCols = cols.filter(c => {
      if (visibleBorrowColumns[c.key] === false) return false;
      if (borrowStatusFilter === 'Borrowed') {
        const toHide = ['dateReturned', 'returnedByName', 'receivedBy', 'fileCondition', 'remarks'];
        if (toHide.includes(c.key)) return false;
      }
      return true;
    });
    return [selectionColumn, ...activeCols];
  }, [visibleBorrowColumns, paginatedBorrowLogs, selectedBorrowRowIds, borrowStatusFilter, borrowSortPriority]);

  const handleDeleteBorrowEntries = (ids: string[]) => {
    setPendingDeleteBorrowIds(ids);
    setIsDeleteBorrowConfirmOpen(true);
  };

  const handleConfirmDeleteBorrowEntries = async () => {
    if (pendingDeleteBorrowIds.length === 0) return;
    try {
      setIsDeletingBorrow(true);

      const entryNames = pendingDeleteBorrowIds.map((rawId) => {
        const row = borrowLogs.find((r) => r.id === rawId);
        const emp = row?.employee;
        const empName = emp ? `${emp.lastName}, ${emp.firstName}` : (row?.employeeId || 'N/A');
        return row
          ? `${empName} - Borrowed by ${row.borrowerName || 'N/A'} on ${new Date(row.dateBorrowed).toLocaleDateString()}`
          : rawId;
      });

      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
        action: 'delete_borrow_logs',
        entityType: 'file201',
        entityId: pendingDeleteBorrowIds.length === 1 ? pendingDeleteBorrowIds[0] : 'bulk',
        entityName: pendingDeleteBorrowIds.length === 1 ? entryNames[0] : `${pendingDeleteBorrowIds.length} pulled-out file logs`,
        payload: { ids: pendingDeleteBorrowIds, entryNames },
      });

      showToast('🗑️ Delete request submitted. Go to Approvals to review and execute.', 'info');
      setIsDeleteBorrowConfirmOpen(false);
      setPendingDeleteBorrowIds([]);
      setSelectedBorrowRowIds(new Set());
    } catch (err: any) {
      showToast(`Failed to submit delete request: ${err.message}`, 'error');
    } finally {
      setIsDeletingBorrow(false);
    }
  };

  const handlePrintBorrowLogs = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = filteredBorrowRows.map((row, idx) => {
      const emp = row.employee;
      const empName = emp ? `${emp.lastName}, ${emp.firstName}` : row.employeeId;
      const isReturned = row.action === 'return' || !!row.dateReturned;
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${empName}</td>
          <td>${row.employee?.appointmentStatus || '—'}</td>
          <td>${row.employee?.position || '—'}</td>
          <td>${getOfficeFullName(row.employee?.yellowBox?.office || row.employee?.officeName) || '—'}</td>
          <td>${row.borrowerName || '—'}</td>
          <td>${row.purpose || '—'}</td>
          <td>${formatDateMDY(row.dateBorrowed)}</td>
          <td>${row.releasedBy || '—'}</td>
          <td>${isReturned ? 'Returned' : 'Borrowed'}</td>
          <td>${isReturned && row.dateReturned ? formatDateMDY(row.dateReturned) : '—'}</td>
          <td>${isReturned ? (row.returnedByName || '—') : '—'}</td>
          <td>${isReturned ? (row.receivedBy || '—') : '—'}</td>
          <td>${isReturned ? (row.fileCondition || '—') : '—'}</td>
          <td>${isReturned ? (row.remarks || '—') : '—'}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Pulled-Out Files Report</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <h1>Pulled-Out Files Transaction Report</h1>
          <p>Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Employee File (Owner)</th>
                <th>Borrowed By</th>
                <th>Position</th>
                <th>Office</th>
                <th>Purpose</th>
                <th>Date Borrowed</th>
                <th>Released By</th>
                <th>Status</th>
                <th>Date Returned</th>
                <th>Returned By</th>
                <th>Received By</th>
                <th>File Condition</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const formatDateTime = (dateVal: any) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${month}/${day}/${year} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  };

  const handleExportBorrowLogsToExcel = async () => {
    const title = 'PULLED-OUT FILES REPORT';
    try {
      showToast('Generating report...', 'info');
      const buffer = await generatePulledOutFilesExcel(title, filteredBorrowRows);

      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Pulled-Out_Files_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('📊 Report exported successfully!', 'success');
    } catch (error: any) {
      console.error('XLSX export error:', error);
      showToast(`Failed to export report: ${error.message}`, 'error');
    }
  };

  // Transferred Files Helpers
  const handleTransferredSortClick = (field: string) => {
    setTransferredSortPriority((prev) => {
      const existingIndex = prev.findIndex((s) => s.key === field);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        if (existing.direction === 'asc') {
          const next = [...prev];
          next[existingIndex] = { key: field, direction: 'desc' };
          return next;
        } else {
          return prev.filter((s) => s.key !== field);
        }
      }
      return [...prev, { key: field, direction: 'asc' }];
    });
  };

  const handleRemoveTransferredSort = (field: string) => {
    setTransferredSortPriority((prev) => prev.filter((s) => s.key !== field));
  };

  const renderTransferredSortableHeader = (label: string, field: string) => {
    const existingIndex = transferredSortPriority.findIndex((s) => s.key === field);
    const active = existingIndex >= 0;
    const currentDirection = active ? transferredSortPriority[existingIndex].direction : undefined;
    const priorityIndex = active ? existingIndex + 1 : 0;

    return (
      <div className="reports-view__sortable-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span>{label}</span>
        <div className="reports-view__sort-controls" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
          <button
            type="button"
            className={`reports-view__sort-btn${active ? ' reports-view__sort-btn--active' : ''}`}
            onClick={() => handleTransferredSortClick(field)}
            title={`Sort by ${label} (${active ? (currentDirection === 'asc' ? 'Ascending (click for Descending)' : 'Descending (click to clear)') : 'Click to sort Ascending'})`}
          >
            {priorityIndex > 0 ? <span className="reports-view__sort-priority">{priorityIndex}</span> : null}
            {active ? (currentDirection === 'asc' ? '▲' : '▼') : '⇅'}
          </button>
          {active && (
            <button
              type="button"
              className="reports-view__sort-remove-btn"
              onClick={(e) => { e.stopPropagation(); handleRemoveTransferredSort(field); }}
              title={`Remove ${label} sort`}
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  };

  const getTransferredSortValue = (row: any, field: string) => {
    switch (field) {
      case 'employeeName':
        return row.employee ? `${row.employee.lastName}, ${row.employee.firstName}` : row.employeeId || '';
      case 'officeName':
        return getOfficeFullName(row.employee?.yellowBox?.office || row.employee?.officeName) || '';
      case 'position':
        return row.employee?.position || '';
      case 'appointmentStatus':
        return row.employee?.status || '';
      case 'borrowerName':
        return row.borrowerName || '';
      case 'dateBorrowed':
        return row.dateBorrowed || '';
      case 'releasedBy':
        return row.releasedBy || '';
      case 'fileCondition':
        return row.fileCondition || '';
      case 'remarks':
        return row.purpose || row.remarks || '';
      case 'status':
        const isReturned = row.action === 'return' || !!row.dateReturned;
        return isReturned ? 'Returned' : 'Transferred';
      case 'dateReturned':
        return row.dateReturned || '';
      case 'returnedByName':
        return row.returnedByName || '';
      case 'receivedBy':
        return row.receivedBy || '';
      case 'returnFileCondition':
        return row.fileCondition || '';
      case 'returnRemarks':
        return row.remarks || '';
      default:
        return '';
    }
  };

  const filteredTransferredRows = useMemo(() => {
    const filtered = transferredLogs.filter((log) => {
      const emp = log.employee;
      const empName = emp ? `${emp.firstName} ${emp.lastName} ${emp.middleName || ''}`.toLowerCase() : '';
      const office = (emp?.yellowBox?.office || emp?.officeName || '').toLowerCase();
      const pos = (emp?.position || '').toLowerCase();
      const receivedBy = (log.borrowerName || '').toLowerCase();
      const released = (log.releasedBy || '').toLowerCase();
      const returnedBy = (log.returnedByName || '').toLowerCase();
      const recordsReceived = (log.receivedBy || '').toLowerCase();
      const remarks = (log.remarks || '').toLowerCase();
      const purpose = (log.purpose || '').toLowerCase();

      const search = transferredSearchTerm.toLowerCase().trim();
      const matchSearch =
        !search ||
        empName.includes(search) ||
        office.includes(search) ||
        pos.includes(search) ||
        receivedBy.includes(search) ||
        released.includes(search) ||
        returnedBy.includes(search) ||
        recordsReceived.includes(search) ||
        remarks.includes(search) ||
        purpose.includes(search);

      const isReturned = log.action === 'return' || !!log.dateReturned;
      const matchStatus =
        transferredStatusFilter === 'All' ||
        (transferredStatusFilter === 'Transferred' && !isReturned) ||
        (transferredStatusFilter === 'Returned' && isReturned);

      let matchTransferDate = true;
      if (log.dateBorrowed) {
        const logDateStr = new Date(log.dateBorrowed).toLocaleDateString('en-CA');
        if (transferredDateFromFilter && logDateStr < transferredDateFromFilter) matchTransferDate = false;
        if (transferredDateToFilter && logDateStr > transferredDateToFilter) matchTransferDate = false;
      } else if (transferredDateFromFilter || transferredDateToFilter) {
        matchTransferDate = false;
      }

      let matchReturnDate = true;
      if (transferredStatusFilter !== 'Transferred') {
        if (log.dateReturned) {
          const logReturnDateStr = new Date(log.dateReturned).toLocaleDateString('en-CA');
          if (transferredReturnDateFromFilter && logReturnDateStr < transferredReturnDateFromFilter) matchReturnDate = false;
          if (transferredReturnDateToFilter && logReturnDateStr > transferredReturnDateToFilter) matchReturnDate = false;
        } else if (transferredReturnDateFromFilter || transferredReturnDateToFilter) {
          matchReturnDate = false;
        }
      }

      return matchSearch && matchStatus && matchTransferDate && matchReturnDate;
    });

    if (transferredSortPriority.length === 0) return filtered;

    return [...filtered].sort((a, b) => {
      for (const sort of transferredSortPriority) {
        const valueA = getTransferredSortValue(a, sort.key);
        const valueB = getTransferredSortValue(b, sort.key);
        const comparison = String(valueA || '').localeCompare(String(valueB || ''), undefined, { sensitivity: 'base' });
        if (comparison !== 0) {
          return sort.direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  }, [transferredLogs, transferredSearchTerm, transferredStatusFilter, transferredDateFromFilter, transferredDateToFilter, transferredReturnDateFromFilter, transferredReturnDateToFilter, transferredSortPriority]);

  const transferredTotalPages = Math.ceil(filteredTransferredRows.length / transferredItemsPerPage);

  const paginatedTransferredLogs = useMemo(() => {
    const start = (transferredCurrentPage - 1) * transferredItemsPerPage;
    return filteredTransferredRows.slice(start, start + transferredItemsPerPage);
  }, [filteredTransferredRows, transferredCurrentPage, transferredItemsPerPage]);

  useEffect(() => {
    setTransferredCurrentPage(1);
  }, [transferredSearchTerm, transferredStatusFilter, transferredDateFromFilter, transferredDateToFilter, transferredReturnDateFromFilter, transferredReturnDateToFilter]);

  const transferredColumns = useMemo(() => {
    const isAllSelected =
      paginatedTransferredLogs.length > 0 &&
      paginatedTransferredLogs.every((row) => selectedTransferredRowIds.has(row.id));
    const isSomeSelected =
      paginatedTransferredLogs.some((row) => selectedTransferredRowIds.has(row.id)) &&
      !isAllSelected;

    const selectionColumn: Column<any> = {
      key: 'select',
      header: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={isAllSelected}
            ref={(input) => {
              if (input) input.indeterminate = isSomeSelected;
            }}
            onChange={(e) => {
              const checked = e.target.checked;
              setSelectedTransferredRowIds((prev) => {
                const next = new Set(prev);
                paginatedTransferredLogs.forEach((row) => {
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
            title="Select All"
          />
          {selectedTransferredRowIds.size > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteTransferredEntries(Array.from(selectedTransferredRowIds));
              }}
              style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem', height: '28px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <MdDelete style={{ fontSize: '0.85rem' }} /> Delete ({selectedTransferredRowIds.size})
            </Button>
          )}
        </div>
      ),
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedTransferredRowIds.has(row.id)}
          onChange={(e) => {
            const checked = e.target.checked;
            setSelectedTransferredRowIds((prev) => {
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
      width: selectedTransferredRowIds.size > 0 ? '160px' : '50px',
    };

    const cols: Column<any>[] = [
      {
        key: 'employeeName',
        header: renderTransferredSortableHeader('Employee Name (Owner)', 'employeeName'),
        render: (row) => {
          const emp = row.employee;
          return emp ? `${emp.lastName}, ${emp.firstName}` : row.employeeId;
        }
      },
      {
        key: 'officeName',
        header: renderTransferredSortableHeader('Office/Hospital', 'officeName'),
        render: (row) => getOfficeFullName(row.employee?.yellowBox?.office || row.employee?.officeName) || '—'
      },
      {
        key: 'position',
        header: renderTransferredSortableHeader('Position / Designation', 'position'),
        render: (row) => row.employee?.position || '—'
      },
      {
        key: 'appointmentStatus',
        header: renderTransferredSortableHeader('Employment Status', 'appointmentStatus'),
        render: (row) => {
          const status = row.employee?.status;
          return status ? (status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()) : '—';
        }
      },
      {
        key: 'borrowerName',
        header: renderTransferredSortableHeader('Transferred To (Received By)', 'borrowerName'),
        render: (row) => row.borrowerName || '—'
      },
      {
        key: 'dateBorrowed',
        header: renderTransferredSortableHeader('Date Transferred', 'dateBorrowed'),
        render: (row) => formatDateMDY(row.dateBorrowed)
      },
      {
        key: 'releasedBy',
        header: renderTransferredSortableHeader('Released By', 'releasedBy'),
        render: (row) => row.releasedBy || '—'
      },
      {
        key: 'fileCondition',
        header: renderTransferredSortableHeader('File Condition', 'fileCondition'),
        render: (row) => row.transferCondition || row.fileCondition || 'Complete'
      },
      {
        key: 'remarks',
        header: renderTransferredSortableHeader('Remarks', 'remarks'),
        render: (row) => row.transferRemarks || row.purpose || (!row.dateReturned ? row.remarks : '') || '—'
      },
      {
        key: 'status',
        header: renderTransferredSortableHeader('Status', 'status'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return (
            <Badge variant={isReturned ? 'success' : 'purple'}>
              {isReturned ? 'Returned' : 'Transferred'}
            </Badge>
          );
        }
      },
      {
        key: 'dateReturned',
        header: renderTransferredSortableHeader('Date Returned', 'dateReturned'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return isReturned && row.dateReturned ? formatDateMDY(row.dateReturned) : '';
        }
      },
      {
        key: 'returnedByName',
        header: renderTransferredSortableHeader('Returned By', 'returnedByName'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return isReturned ? row.returnedByName || '—' : '';
        }
      },
      {
        key: 'receivedBy',
        header: renderTransferredSortableHeader('Received By (Records)', 'receivedBy'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return isReturned ? row.receivedBy || '—' : '';
        }
      },
      {
        key: 'returnFileCondition',
        header: renderTransferredSortableHeader('Return Condition', 'returnFileCondition'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return isReturned ? (row.returnCondition || row.fileCondition || 'Complete') : '';
        }
      },
      {
        key: 'returnRemarks',
        header: renderTransferredSortableHeader('Return Remarks', 'returnRemarks'),
        render: (row) => {
          const isReturned = row.action === 'return' || !!row.dateReturned;
          return isReturned ? (row.returnRemarks || (row.dateReturned ? row.remarks : '') || '—') : '';
        }
      }
    ];

    const activeCols = cols.filter(c => {
      if (visibleTransferredColumns[c.key] === false) return false;
      if (transferredStatusFilter === 'Transferred') {
        const toHide = ['dateReturned', 'returnedByName', 'receivedBy', 'returnFileCondition', 'returnRemarks'];
        if (toHide.includes(c.key)) return false;
      }
      return true;
    });
    return [selectionColumn, ...activeCols];
  }, [visibleTransferredColumns, paginatedTransferredLogs, selectedTransferredRowIds, transferredStatusFilter, transferredSortPriority]);

  const handleDeleteTransferredEntries = (ids: string[]) => {
    setPendingDeleteTransferredIds(ids);
    setIsDeleteTransferredConfirmOpen(true);
  };

  const handleConfirmDeleteTransferredEntries = async () => {
    if (pendingDeleteTransferredIds.length === 0) return;
    try {
      setIsDeletingTransferred(true);

      const entryNames = pendingDeleteTransferredIds.map((rawId) => {
        const row = transferredLogs.find((r) => r.id === rawId);
        const emp = row?.employee;
        const empName = emp ? `${emp.lastName}, ${emp.firstName}` : (row?.employeeId || 'N/A');
        return row
          ? `${empName} - Transferred to ${row.borrowerName || 'RSP'} on ${new Date(row.dateBorrowed).toLocaleDateString()}`
          : rawId;
      });

      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
        action: 'delete_borrow_logs',
        entityType: 'file201',
        entityId: pendingDeleteTransferredIds.length === 1 ? pendingDeleteTransferredIds[0] : 'bulk',
        entityName: pendingDeleteTransferredIds.length === 1 ? entryNames[0] : `${pendingDeleteTransferredIds.length} transferred file logs`,
        payload: { ids: pendingDeleteTransferredIds, entryNames },
      });

      showToast('🗑️ Delete request submitted. Go to Approvals to review and execute.', 'info');
      setIsDeleteTransferredConfirmOpen(false);
      setPendingDeleteTransferredIds([]);
      setSelectedTransferredRowIds(new Set());
    } catch (err: any) {
      showToast(`Failed to submit delete request: ${err.message}`, 'error');
    } finally {
      setIsDeletingTransferred(false);
    }
  };

  const handleExportTransferredLogsToExcel = async () => {
    let title = 'TRANSFERRED AND RETURNED 201 FILES REPORT';
    let filenamePrefix = 'Transferred_And_Returned_201_Files_Report';
    if (transferredStatusFilter === 'Transferred') {
      title = 'TRANSFERRED 201 FILES TO RSP REPORT';
      filenamePrefix = 'Transferred_201_Files_Report';
    } else if (transferredStatusFilter === 'Returned') {
      title = 'RETURNED 201 FILES TO RECORDS REPORT';
      filenamePrefix = 'Returned_201_Files_Report';
    }

    try {
      showToast('Generating report...', 'info');
      const buffer = await generateTransferredFilesExcel(title, filteredTransferredRows, transferredStatusFilter as any);

      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('📊 Report exported successfully!', 'success');
    } catch (error: any) {
      console.error('XLSX export error:', error);
      showToast(`Failed to export report: ${error.message}`, 'error');
    }
  };

  const reportColumns = useMemo<Column<ReportRow>[]>(() => {
    const selectionColumn: Column<ReportRow> = {
      key: 'selection',
      header: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
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
            title="Select All"
          />
          {selectedReportRowIds.size > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteReportEntries(Array.from(selectedReportRowIds));
              }}
              style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem', height: '28px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <MdDelete style={{ fontSize: '0.85rem' }} /> Delete ({selectedReportRowIds.size})
            </Button>
          )}
        </div>
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
      width: selectedReportRowIds.size > 0 ? '160px' : '50px',
    };

    const renderDurationTo = (row: ReportRow) => {
      if (!row.durationTo) return '—';
      if (row.durationTo === 'Until revoked') return 'Until revoked';
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
    };

    let baseColumns: Column<ReportRow>[] = [];

    // All Employees
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
          key: 'recalledFrom',
          header: renderSortableHeader('Recalled From', 'recalledFrom'),
          render: (row) => row.recalledFrom || '',
        },
        {
          key: 'recalledTo',
          header: renderSortableHeader('Recalled To', 'recalledTo'),
          render: (row) => row.recalledTo || '',
        },
        {
          key: 'durationFrom',
          header: renderSortableHeader('Duration From', 'durationFrom'),
          render: (row) => row.durationFrom ? formatDateMDY(row.durationFrom) : '—',
        },
        {
          key: 'durationTo',
          header: renderSortableHeader('Duration To', 'durationTo'),
          render: renderDurationTo,
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
          render: renderDurationTo,
        },
        {
          key: 'administrativeOrder',
          header: renderSortableHeader('Administrative Order No.', 'aoNumber'),
          render: (row) => renderAdministrativeOrder(row),
        },
      ];
    } else if (reportAoStatus === 'Recalled') {
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
          key: 'recalledFrom',
          header: renderSortableHeader('Recalled From', 'recalledFrom'),
          render: (row) => row.recalledFrom || '',
        },
        {
          key: 'recalledTo',
          header: renderSortableHeader('Recalled To', 'recalledTo'),
          render: (row) => row.recalledTo || '',
        },
        {
          key: 'durationFrom',
          header: renderSortableHeader('Duration From', 'durationFrom'),
          render: (row) => row.durationFrom ? formatDateMDY(row.durationFrom) : '—',
        },
        {
          key: 'durationTo',
          header: renderSortableHeader('Duration To', 'durationTo'),
          render: renderDurationTo,
        },
        {
          key: 'administrativeOrder',
          header: renderSortableHeader('Administrative Order No.', 'aoNumber'),
          render: (row) => renderAdministrativeOrder(row),
        },
      ];
    } else {
      // Designated
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
          render: renderDurationTo,
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
            ? sortedReportRows.filter((row) => row.status === 'Active' && isNearExpiration(row.durationTo))
            : sortedReportRows.filter((row) => row.status === 'Active' && isExpired(row.durationTo));

    const title = getFormattedTitle();
    const fileName = `AO-Report-${reportAoStatus.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'xlsx') {
      try {
        // Fetch the template file
        let arrayBuffer: ArrayBuffer;
        if (typeof window !== 'undefined' && (window as any).electron?.getTemplateFile) {
          arrayBuffer = await (window as any).electron.getTemplateFile();
        } else {
          const response = await fetch('/template.xlsx');
          if (!response.ok) throw new Error('Template file not found or failed to load');
          arrayBuffer = await response.arrayBuffer();
        }

        // Load zip container
        const zip = await JSZip.loadAsync(arrayBuffer);
        const sheetXmlPath = 'xl/worksheets/sheet1.xml';
        const sheetXmlStr = await zip.file(sheetXmlPath)?.async('string');
        if (!sheetXmlStr) throw new Error('Invalid excel template package: sheet1.xml missing');

        // Modify sheetData XML content — pass the AO status so column headers adapt
        const { xml: modifiedXml, lastRow } = modifySheetXml(sheetXmlStr, title, tabRows, reportAoStatus);

        // Patch styles.xml: remove shrinkToFit and ensure wrapText is set on target columns
        // so the dynamic row heights we set are respected — text wraps within the column.
        const stylesXmlPath = 'xl/styles.xml';
        const stylesXmlStr = await zip.file(stylesXmlPath)?.async('string');
        if (stylesXmlStr) {
          const patchedStylesXml = stylesXmlStr.replace(
            /<cellXfs\s+count="(\d+)">([\s\S]*?)<\/cellXfs>/,
            (match: string, count: string, xfsContent: string) => {
              const xfRegex = /<xf\s+([^>]*)>([\s\S]*?)<\/xf>/g;
              let idx = 0;
              const modifiedXfs = xfsContent.replace(xfRegex, (xfMatch: string, xfAttrs: string, xfBody: string) => {
                let updatedBody = xfBody;
                const targetIndexes = [12, 13, 15, 16, 17, 19, 22, 23, 28, 29, 30, 32];
                if (targetIndexes.includes(idx)) {
                  if (updatedBody.includes('<alignment')) {
                    updatedBody = updatedBody.replace(/<alignment\s+([^>]*)\/>/, (alignMatch: string, alignAttrs: string) => {
                      const cleanedAttrs = alignAttrs
                        .replace(/\s*shrinkToFit="[^"]*"/g, '')
                        .replace(/\s*wrapText="[^"]*"/g, '');
                      return `<alignment ${cleanedAttrs} wrapText="1"/>`;
                    });
                  }
                } else {
                  if (updatedBody.includes('<alignment')) {
                    updatedBody = updatedBody.replace(/<alignment\s+([^>]*)\/>/, (alignMatch: string, alignAttrs: string) => {
                      const cleanedAttrs = alignAttrs.replace(/\s*shrinkToFit="[^"]*"/g, '');
                      return `<alignment ${cleanedAttrs}/>`;
                    });
                  }
                }
                idx++;
                return `<xf ${xfAttrs}>${updatedBody}</xf>`;
              });
              return `<cellXfs count="${count}">${modifiedXfs}</cellXfs>`;
            }
          );
          zip.file(stylesXmlPath, patchedStylesXml);
        }

        // Add <sheetPr fitToPage> and update pageSetup with fitToWidth=1
        // so the sheet scales to fit 1 page wide when printed.
        const lastColLetter = reportAoStatus === 'Detailed' ? 'G' : 'I';
        let finalXml = modifiedXml;
        // Update sheet dimension to match the exact row count written
        finalXml = finalXml.replace(
          /<dimension\s+ref="[^"]*"\s*\/>/,
          `<dimension ref="A1:${lastColLetter}${lastRow}"/>`
        );

        if (!finalXml.includes('<sheetPr')) {
          finalXml = finalXml.replace(
            /(<(?:dimension|sheetViews)[^>]*(?:\/>|>))/,
            '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>$1'
          );
        }
        finalXml = finalXml.replace(
          /<pageSetup([^>]*?)\/>/,
          (_match: string, attrs: string) => {
            const cleaned = attrs
              .replace(/\s*fitToWidth="[^"]*"/g, '')
              .replace(/\s*fitToHeight="[^"]*"/g, '')
              .replace(/\s*scale="[^"]*"/g, '')
              .replace(/\s*r:id="[^"]*"/g, '');
            return `<pageSetup${cleaned} fitToWidth="1" fitToHeight="0"/>`;
          }
        );
        zip.file(sheetXmlPath, finalXml);

        // Remove printerSettings relationship from sheet1.xml.rels and delete printerSettings1.bin
        // to prevent Excel from using cached binary printer/page setup configurations.
        const relsXmlPath = 'xl/worksheets/_rels/sheet1.xml.rels';
        const relsXmlStr = await zip.file(relsXmlPath)?.async('string');
        if (relsXmlStr) {
          const patchedRelsXml = relsXmlStr.replace(
            /<Relationship[^>]*printerSettings[^>]*\/>/,
            ''
          );
          zip.file(relsXmlPath, patchedRelsXml);
        }
        zip.remove('xl/printerSettings/printerSettings1.bin');

        // Patch workbook.xml print area to match the exact row count written
        const workbookXmlPath = 'xl/workbook.xml';
        const workbookXmlStr = await zip.file(workbookXmlPath)?.async('string');
        if (workbookXmlStr) {
          const patchedWorkbookXml = workbookXmlStr.replace(
            /<definedName name="_xlnm\.Print_Area"([^>]*)>([^<]*)<\/definedName>/,
            (match: string, attrs: string, val: string) => {
              const newVal = val.replace(/\$[G|I]\$\d+$/, `$${lastColLetter}$${lastRow}`);
              return `<definedName name="_xlnm.Print_Area"${attrs}>${newVal}</definedName>`;
            }
          );
          zip.file(workbookXmlPath, patchedWorkbookXml);
        }

        // Shift logo drawing anchor to column D (index 3) for Designated / All Employees
        // to maintain its centered position in the 9-column sheet.
        const drawingXmlPath = 'xl/drawings/drawing1.xml';
        const drawingXmlStr = await zip.file(drawingXmlPath)?.async('string');
        if (drawingXmlStr) {
          let patchedDrawingXml = drawingXmlStr;
          if (reportAoStatus !== 'Detailed') {
            // Keep column index 2 (Column C) but increase colOff to 1,450,000 EMUs
            // to adjust the logo slightly to the right to match the centering of the template.
            patchedDrawingXml = patchedDrawingXml.replace(
              /<xdr:colOff>18203<\/xdr:colOff>/,
              '<xdr:colOff>1300000</xdr:colOff>'
            );
          }
          zip.file(drawingXmlPath, patchedDrawingXml);
        }

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
          { key: 'recalledFrom', label: 'Recalled From', value: row.recalledFrom || '' },
          { key: 'recalledTo', label: 'Recalled To', value: row.recalledTo || '' },
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
            ? sortedReportRows.filter((row) => row.status === 'Active' && isNearExpiration(row.durationTo))
            : sortedReportRows.filter((row) => row.status === 'Active' && isExpired(row.durationTo));

    const title = getFormattedTitle();
    const ROWS_PER_PAGE = 13;
    const pageCount = Math.max(1, Math.ceil(tabRows.length / ROWS_PER_PAGE));

    const officeColHeader = reportAoStatus === 'Designated'
      ? 'Designated Office'
      : reportAoStatus === 'All Employees'
        ? 'Detailed/Designated Office/Hospital'
        : 'Detailed/Transferred Office/Hospital';

    const durationColHeader = reportAoStatus === 'Designated'
      ? 'Duration of Designated Order'
      : reportAoStatus === 'Detailed'
        ? 'Duration of Detailed Order'
        : 'Duration';

    const logoSrc = LOGO_BASE64;

    const headerHtml = `
      <div style="border:1px solid #000;border-bottom:2px solid #000;padding:10px 12px;display:flex;align-items:center;gap:12px;">
        <img src="${logoSrc}" alt="Logo" style="height:42px;width:auto;flex-shrink:0;" onerror="this.style.display='none';" />
        <div style="text-align:center;flex:1;">
          <div style="font-size:10.5pt;font-style:italic;font-weight:normal;">Republic of the Philippines</div>
          <div style="font-size:11pt;font-weight:bold;margin-top:2px;">Province of Pangasinan</div>
          <div style="font-size:10pt;font-weight:normal;margin-top:2px;">Lingayen</div>
          <div style="font-size:11.5pt;font-weight:bold;margin-top:4px;font-family:Calibri,Arial,sans-serif;">HUMAN RESOURCE MGT. &amp; DEVELOPMENT OFFICE</div>
        </div>
      </div>`;

    const designatedHeader = reportAoStatus === 'Designated'
      ? 'Designated Position'
      : 'Designated Position/Function';

    const isDetailed = reportAoStatus === 'Detailed';
    const isRecalled = reportAoStatus === 'Recalled';
    const isAllEmployees = reportAoStatus === 'All Employees';
    let tableHeaderHtml = '';

    const renderPrintDuration = (duration: any) => {
      if (!duration) return '—';
      if (typeof duration === 'string' && duration.trim().toLowerCase() === 'until revoked') return 'Until revoked';
      return formatDateMDY(duration);
    };

    if (isDetailed) {
      tableHeaderHtml = `
        <thead>
          <tr style="background-color:#ffffff;">
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:5%;">NO.</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:22%;">Name of Employee</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:22%;">Mother Unit</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:22%;">${officeColHeader}</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:19%;">Administrative Order No.</th>
          </tr>
        </thead>`;
    } else if (isRecalled) {
      tableHeaderHtml = `
        <thead>
          <tr style="background-color:#ffffff;">
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:4%;">NO.</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:15%;">Name of Employee</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:12%;">Position</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:15%;">Mother Unit</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:10%;">Recalled From</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:10%;">Recalled To</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:14%;">Duration From</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:14%;">Duration To</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:13%;">Administrative Order No.</th>
          </tr>
        </thead>`;
    } else {
      tableHeaderHtml = `
        <thead>
          <tr style="background-color:#ffffff;">
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:4%;">NO.</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:12%;">Name of Employee</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:10%;">Position</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:10%;">Mother Unit</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:12%;">${officeColHeader}</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:12%;">${designatedHeader}</th>
            ${isAllEmployees ? '<th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:8%;">Recalled From</th><th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:8%;">Recalled To</th>' : ''}
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:14%;">Duration From</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:14%;">Duration To</th>
            <th rowspan="2" style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;font-weight:bold;width:14%;">Administrative Order No.</th>
          </tr>
        </thead>`;
    }

    const pagesHtml = Array.from({ length: pageCount }, (_, pageIdx) => {
      const pageRows = tabRows.slice(pageIdx * ROWS_PER_PAGE, (pageIdx + 1) * ROWS_PER_PAGE);
      const rowsHtml = pageRows.length === 0
        ? `<tr><td colspan="${isDetailed ? 7 : (isRecalled ? 8 : (isAllEmployees ? 10 : 9))}" style="border:1px solid #000;padding:20px;text-align:center;color:#555;font-family:'Times New Roman',Times,serif;vertical-align:middle;">No records found matching current filters.</td></tr>`
        : pageRows.map((row, idx) => {
          const globalIdx = pageIdx * ROWS_PER_PAGE + idx;
          const ao = row.aoNumber ? `AO ${row.aoNumber}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}` : '—';
          const recalledText = row.recalledFrom && row.recalledTo ? `${row.recalledFrom} to ${row.recalledTo}` : (row.recalledFrom || row.recalledTo || '');

          if (isDetailed) {
            return `
              <tr style="background-color:#ffffff;">
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;">${globalIdx + 1}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.name}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.motherUnit || ''}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.detailedOffice || ''}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;">${renderPrintDuration(row.durationFrom)}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;">${renderPrintDuration(row.durationTo)}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;">${ao}</td>
              </tr>`;
          } else if (isRecalled) {
            return `
              <tr style="background-color:#ffffff;">
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;">${globalIdx + 1}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.name}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.position || ''}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.motherUnit || ''}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.recalledFrom || ''}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.recalledTo || ''}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;">${renderPrintDuration(row.durationFrom)}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;">${renderPrintDuration(row.durationTo)}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;">${ao}</td>
              </tr>`;
          } else {
            return `
              <tr style="background-color:#ffffff;">
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;">${globalIdx + 1}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.name}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.position || ''}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.motherUnit || ''}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.detailedOffice || ''}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.designatedPositionFunction || ''}</td>
                ${isAllEmployees ? `<td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.recalledFrom || ''}</td><td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;white-space:normal;">${row.recalledTo || ''}</td>` : ''}
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;">${renderPrintDuration(row.durationFrom)}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;">${renderPrintDuration(row.durationTo)}</td>
                <td style="border:1px solid #000;padding:5px 6px;font-size:9pt;text-align:center;vertical-align:middle;word-break:break-word;">${ao}</td>
              </tr>`;
          }
        }).join('');

      const pageBreakStyle = pageIdx < pageCount - 1
        ? 'page-break-after:always;margin-bottom:40px;padding-bottom:40px;border-bottom:3px dashed #aaa;'
        : '';

      return `
        <div style="${pageBreakStyle}">
          ${headerHtml}
          <div style="text-align:center;font-weight:bold;font-size:11pt;font-family:'Times New Roman',Times,serif;text-transform:uppercase;padding:8px 6px;border-left:1px solid #000;border-right:1px solid #000;border-bottom:1px solid #000;letter-spacing:0.3px;">
            ${title}${pageCount > 1 ? ` <span style="font-size:9pt;font-weight:normal;margin-left:10px;color:#444;">(Page ${pageIdx + 1} of ${pageCount})</span>` : ''}
          </div>
          <table style="width:100%;border-collapse:collapse;font-family:'Times New Roman',Times,serif;table-layout:fixed;">
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
              @page { size: 13in 8.5in; margin: 0.5in; }
              body { margin: 0; }
            }
            body {
              font-family: 'Times New Roman', Times, serif;
              color: #000;
              margin: 20px;
              padding: 0;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
          <script>
            // Run print immediately once DOM is written
            window.print();
            window.onafterprint = function() {
              window.close();
            };
            // Fallback timeout in case onafterprint doesn't fire
            setTimeout(function() { window.close(); }, 10000);
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
  const handleSelectAll = async () => {
    if (filteredEmployees.length > 0 && filteredEmployees.every(emp => selectedEmployeeIds.has(emp.id))) {
      // Deselect all
      setSelectedEmployeeIds(new Set());
    } else {
      // Select all employees across all pages by fetching all matching results
      try {
        const filters: any = { limit: 100000 };
        if (statusFilter !== 'all') filters.status = statusFilter;
        if (searchQuery.trim()) {
          filters.search = searchQuery.trim();
          filters.filter_type = searchFilterType;
        }
        
        const result = await api.employee.getAll(filters);
        const data = (result as any).data || result;
        
        if (Array.isArray(data)) {
          const allIds = new Set(data.map((emp: any) => emp.id));
          setSelectedEmployeeIds(allIds);
          showToast(`Selected all ${allIds.size} matching employees`, 'success');
        }
      } catch (error) {
        console.error('Error fetching all employees for selection:', error);
        showToast('Failed to select all employees across pages', 'error');
      }
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

  const isAllSelected = filteredEmployees.length > 0 && filteredEmployees.every(emp => selectedEmployeeIds.has(emp.id));
  const isSomeSelected = filteredEmployees.some(emp => selectedEmployeeIds.has(emp.id)) && !isAllSelected;

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
              style={{ minWidth: '80px', textAlign: 'center', justifyContent: 'center' }}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenUpdateEmployeeModal(employee);
              }}
            >
              Update
            </Button>
          )}
          {canDelete && (
            <Button
              variant="danger"
              size="sm"
              style={{ minWidth: '80px', textAlign: 'center', justifyContent: 'center' }}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDeleteConfirmModal(employee);
              }}
            >
              Delete
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
    setCurrentPage(1);
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
      detailedOrderFrom: '',
      detailedOrderTo: '',
      designatedPositionFunction: '',
      designatedOrderFrom: '',
      designatedOrderTo: '',
      recalledFrom: '',
      recalledTo: '',
      recalledOrderFrom: '',
      recalledOrderTo: '',
      fileboxLocation: '',
      file201Status: '',
    });
    setAoFile(null);
    setAddProfilePicture(undefined);
    setFormErrors({});
  };

  const handleCloseAddEmployeeModal = useCallback(() => {
    setIsAddEmployeeModalOpen(false);
    setAoFile(null);
    setAutoRename(false);
    setAddProfilePicture(undefined);
    setShowUnsavedChangesModal(false);
  }, []);

  const isAddFormDirty = useMemo(() => {
    return Boolean(
      formData.id?.trim() ||
      formData.lastName?.trim() ||
      formData.firstName?.trim() ||
      formData.middleName?.trim() ||
      formData.officeHospitalName?.trim() ||
      formData.positionFunction?.trim() ||
      formData.appointmentStatus?.trim() ||
      formData.aoNumber?.trim() ||
      aoFile ||
      addProfilePicture
    );
  }, [formData, aoFile, addProfilePicture]);

  const handleRequestCloseAddEmployee = useCallback(() => {
    if (isAddFormDirty) {
      setShowUnsavedChangesModal(true);
    } else {
      handleCloseAddEmployeeModal();
    }
  }, [isAddFormDirty, handleCloseAddEmployeeModal]);

  const existingEmployeeIds = useMemo(() => {
    return employees.map((e) => e.id);
  }, [employees]);

  const existingAoKeys = useMemo(() => {
    return employees
      .filter((e) => (e as any).aoNumber && (e as any).aoYear)
      .map((e) => `${(e as any).aoNumber}_${(e as any).aoYear}`);
  }, [employees]);

  const handleOpenUpdateEmployeeModal = (employee: Employee) => {
    setShowIdUpdate(false);
    setSelectedEmployee(employee);
    const employeeFormData: EmployeeFormData = {
      id: employee.id || '',
      lastName: employee.lastName || '',
      firstName: employee.firstName || '',
      middleName: employee.middleName || '',
      dateOfBirth: convertToDateInputFormat(employee.dateOfBirth),
      gender: employee.gender || '',
      officeHospitalName: employee.officeHospitalName || (employee as any).officeName || '',
      appointmentStatus: (employee.appointmentStatus as AppointmentStatus) || '',
      appointmentFrom: convertToDateInputFormat(employee.appointmentFrom),
      appointmentTo: convertToDateInputFormat(employee.appointmentTo),
      aoNumber: (employee as any).aoNumber || '',
      aoYear: (employee as any).aoYear || '',
      aoType: ((employee as any).aoType || ((employee as any).isDetailed ? 'Detailed' : '')) as any,
      status: employee.status || 'Active',
      positionFunction: employee.positionFunction || (employee as any).position || '',
      dateOfEmployment: convertToDateInputFormat(employee.dateOfEmployment),
      dateOfSeparation: convertToDateInputFormat(employee.dateOfSeparation),
      reasonForSeparation: employee.reasonForSeparation || (employee as any).reasonOfSeparation || '',
      motherUnit: (employee as any).motherUnit || '',
      detailedTo: (employee as any).detailedTo || '',
      detailedDivision: (employee as any).detailedDivision || '',
      detailedOrderFrom: convertToDateInputFormat((employee as any).detailedOrderFrom),
      detailedOrderTo: convertToDateInputFormat((employee as any).detailedOrderTo),
      designatedPositionFunction: (employee as any).designatedPositionFunction || '',
      designatedOrderFrom: convertToDateInputFormat((employee as any).designatedOrderFrom),
      designatedOrderTo: convertToDateInputFormat((employee as any).designatedOrderTo),
      recalledFrom: (employee as any).recalledFrom || '',
      recalledTo: (employee as any).recalledTo || '',
      recalledOrderFrom: convertToDateInputFormat((employee as any).recalledOrderFrom),
      recalledOrderTo: convertToDateInputFormat((employee as any).recalledOrderTo),
      fileboxLocation: (employee as any).fileboxLocation || '',
      file201Status: (employee as any).file201Status || 'Available',
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

  const validateForm = (isUpdate: boolean = false, dataToValidate?: EmployeeFormData): boolean => {
    const currentData = dataToValidate || formData;
    const errors: Partial<Record<keyof EmployeeFormData, string>> = {};

    // For updates, only validate fields that are being changed
    if (isUpdate) {
      // Only validate non-empty fields
      if (currentData.lastName.trim() === '') errors.lastName = 'Last name cannot be empty';
      if (currentData.firstName.trim() === '') errors.firstName = 'First name cannot be empty';
      if (currentData.officeHospitalName.trim() === '') errors.officeHospitalName = 'Office/Hospital name cannot be empty';

      // Validate status-dependent fields (made optional per request)
      if (currentData.status === 'Inactive') {
        // Validation removed: Date and Reason for separation are now optional
      }
    } else {
      // For create, all required fields must be filled
      if (!currentData.id.trim()) errors.id = 'Employee ID is required';
      if (!currentData.lastName.trim()) errors.lastName = 'Last name is required';
      if (!currentData.firstName.trim()) errors.firstName = 'First name is required';
      if (!currentData.gender) errors.gender = 'Gender is required';
      if (!currentData.officeHospitalName.trim()) errors.officeHospitalName = 'Office/Hospital name is required';
      if (!currentData.appointmentStatus) errors.appointmentStatus = 'Appointment status is required';
      if (currentData.appointmentFrom && currentData.appointmentTo && currentData.appointmentTo < currentData.appointmentFrom) {
        errors.appointmentTo = 'Appointment to must be on or after appointment from';
      }

      if (currentData.status === 'Inactive') {
        // Validation removed: Date and Reason for separation are now optional
      }
    }

    // Auto-populate Mother Unit from primary Office/Hospital Name for Detailed AOs
    if (currentData.aoType === 'Detailed') {
      currentData.motherUnit = currentData.officeHospitalName;
    }

    // AO conditional validation: if aoNumber is set, aoYear is required and aoFile is required when updating/creating AO
    if (currentData.aoNumber && currentData.aoNumber.trim() !== '') {
      if (!currentData.aoYear) {
        errors.aoYear = 'Series (Year) is required when AO number is provided';
      }

      const isAoNumberChanged = !isUpdate || (currentData.aoNumber !== originalEmployeeData?.aoNumber);
      if (isAoNumberChanged && !aoFile) {
        errors.aoNumber = 'An Administrative Order file upload is required';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEmployee = async (customFormData?: any) => {
    const dataToSave = customFormData || formData;
    if (customFormData) {
      setFormData(customFormData);
    }
    if (!validateForm(false, dataToSave)) {
      return;
    }

    try {
      const employeeData = {
        id: dataToSave.id,
        lastName: dataToSave.lastName,
        firstName: dataToSave.firstName,
        middleName: dataToSave.middleName || undefined,
        dateOfBirth: dataToSave.dateOfBirth || undefined,
        gender: dataToSave.gender,
        officeName: getOfficeFullName(dataToSave.officeHospitalName) || dataToSave.officeHospitalName,
        appointmentStatus: dataToSave.appointmentStatus,
        appointmentFrom: dataToSave.appointmentFrom || undefined,
        appointmentTo: dataToSave.appointmentTo || undefined,
        aoNumber: dataToSave.aoNumber || undefined,
        aoYear: dataToSave.aoYear || undefined,
        aoType: dataToSave.aoType || undefined,
        status: dataToSave.status,
        position: dataToSave.positionFunction,
        dateOfEmployment: dataToSave.dateOfEmployment,
        dateOfSeparation: dataToSave.dateOfSeparation || undefined,
        reasonOfSeparation: dataToSave.reasonForSeparation || undefined,
        motherUnit: dataToSave.motherUnit ? (getOfficeFullName(dataToSave.motherUnit) || dataToSave.motherUnit) : undefined,
        detailedTo: (dataToSave.aoType === 'Detailed' || dataToSave.aoType === 'Designated') ? (dataToSave.detailedTo ? (getOfficeFullName(dataToSave.detailedTo) || dataToSave.detailedTo) : undefined) : undefined,
        detailedDivision: dataToSave.aoType === 'Detailed' ? dataToSave.detailedDivision || undefined : undefined,
        detailedOrderFrom: dataToSave.aoType === 'Detailed' ? dataToSave.detailedOrderFrom || undefined : undefined,
        detailedOrderTo: dataToSave.aoType === 'Detailed' ? dataToSave.detailedOrderTo || undefined : undefined,
        designatedPositionFunction: dataToSave.aoType === 'Designated' ? dataToSave.designatedPositionFunction || undefined : undefined,
        designatedOrderFrom: dataToSave.aoType === 'Designated' ? dataToSave.designatedOrderFrom || undefined : undefined,
        designatedOrderTo: dataToSave.aoType === 'Designated' ? dataToSave.designatedOrderTo || undefined : undefined,
        recalledFrom: dataToSave.aoType === 'Recalled' ? (dataToSave.recalledFrom ? (getOfficeFullName(dataToSave.recalledFrom) || dataToSave.recalledFrom) : undefined) : undefined,
        recalledTo: dataToSave.aoType === 'Recalled' ? (dataToSave.recalledTo ? (getOfficeFullName(dataToSave.recalledTo) || dataToSave.recalledTo) : undefined) : undefined,
        recalledOrderFrom: dataToSave.aoType === 'Recalled' ? dataToSave.recalledOrderFrom || undefined : undefined,
        recalledOrderTo: dataToSave.aoType === 'Recalled' ? dataToSave.recalledOrderTo || undefined : undefined,
        fileboxLocation: dataToSave.fileboxLocation || undefined,
        profilePicture: addProfilePicture || undefined,
      };

      // Pass user info for audit logging
      await api.employee.create(
        employeeData,
        currentUser?.id,
        `${currentUser?.lastName}, ${currentUser?.firstName}`
      );

      // If there is an AO file, upload it
      if (aoFile) {
        const empName = formatEmployeeNameForFolder(formData.firstName, formData.lastName, formData.middleName);
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
              aoType: formData.aoType,
              detailedTo: formData.detailedTo,
              detailedOrderFrom: formData.aoType === 'Detailed' ? formData.detailedOrderFrom || undefined : undefined,
              detailedOrderTo: formData.aoType === 'Detailed' ? formData.detailedOrderTo || undefined : undefined,
              designatedPositionFunction: formData.aoType === 'Designated' ? formData.designatedPositionFunction || undefined : undefined,
              designatedOrderFrom: formData.aoType === 'Designated' ? formData.designatedOrderFrom || undefined : undefined,
              designatedOrderTo: formData.aoType === 'Designated' ? formData.designatedOrderTo || undefined : undefined,
              recalledFrom: formData.aoType === 'Recalled' ? formData.recalledFrom || undefined : undefined,
              recalledTo: formData.aoType === 'Recalled' ? formData.recalledTo || undefined : undefined,
              recalledOrderFrom: formData.aoType === 'Recalled' ? formData.recalledOrderFrom || undefined : undefined,
              recalledOrderTo: formData.aoType === 'Recalled' ? formData.recalledOrderTo || undefined : undefined,
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

  const handleUpdateEmployee = async (
    updatedFormData: any,
    updatedAoFile: File | null,
    updatedAutoRename: boolean,
    updatedReplace: boolean = false
  ) => {
    if (!selectedEmployee) {
      showToast('No employee selected for update.', 'error');
      return;
    }

    try {
      const origData: any = originalEmployeeData || {
        id: selectedEmployee.id || '',
        lastName: selectedEmployee.lastName || '',
        firstName: selectedEmployee.firstName || '',
        middleName: selectedEmployee.middleName || '',
        dateOfBirth: convertToDateInputFormat(selectedEmployee.dateOfBirth),
        gender: selectedEmployee.gender || '',
        officeHospitalName: selectedEmployee.officeHospitalName || (selectedEmployee as any).officeName || '',
        appointmentStatus: (selectedEmployee.appointmentStatus as AppointmentStatus) || '',
        appointmentFrom: convertToDateInputFormat(selectedEmployee.appointmentFrom),
        appointmentTo: convertToDateInputFormat(selectedEmployee.appointmentTo),
        aoNumber: (selectedEmployee as any).aoNumber || '',
        aoYear: (selectedEmployee as any).aoYear || '',
        aoType: ((selectedEmployee as any).aoType || ((selectedEmployee as any).isDetailed ? 'Detailed' : '')) as any,
        status: selectedEmployee.status || 'Active',
        positionFunction: selectedEmployee.positionFunction || (selectedEmployee as any).position || '',
        dateOfEmployment: convertToDateInputFormat(selectedEmployee.dateOfEmployment),
        dateOfSeparation: convertToDateInputFormat(selectedEmployee.dateOfSeparation),
        reasonForSeparation: selectedEmployee.reasonForSeparation || (selectedEmployee as any).reasonOfSeparation || '',
        motherUnit: (selectedEmployee as any).motherUnit || '',
        detailedTo: (selectedEmployee as any).detailedTo || '',
        detailedDivision: (selectedEmployee as any).detailedDivision || '',
        detailedOrderFrom: convertToDateInputFormat((selectedEmployee as any).detailedOrderFrom),
        detailedOrderTo: convertToDateInputFormat((selectedEmployee as any).detailedOrderTo),
        designatedPositionFunction: (selectedEmployee as any).designatedPositionFunction || '',
        designatedOrderFrom: convertToDateInputFormat((selectedEmployee as any).designatedOrderFrom),
        designatedOrderTo: convertToDateInputFormat((selectedEmployee as any).designatedOrderTo),
        recalledFrom: (selectedEmployee as any).recalledFrom || '',
        recalledTo: (selectedEmployee as any).recalledTo || '',
        recalledOrderFrom: convertToDateInputFormat((selectedEmployee as any).recalledOrderFrom),
        recalledOrderTo: convertToDateInputFormat((selectedEmployee as any).recalledOrderTo),
        fileboxLocation: (selectedEmployee as any).fileboxLocation || '',
        file201Status: (selectedEmployee as any).file201Status || 'Available',
        remarks: (selectedEmployee as any).remarks || '',
      };

      // Detect changed fields by comparing with original data
      const changedFields: any = {};
      const fieldMapping: Record<string, string> = {
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
        remarks: 'remarks',
        motherUnit: 'motherUnit',
        detailedTo: 'detailedTo',
        detailedDivision: 'detailedDivision',
        detailedOrderFrom: 'detailedOrderFrom',
        detailedOrderTo: 'detailedOrderTo',
        designatedPositionFunction: 'designatedPositionFunction',
        designatedOrderFrom: 'designatedOrderFrom',
        designatedOrderTo: 'designatedOrderTo',
        recalledFrom: 'recalledFrom',
        recalledTo: 'recalledTo',
        recalledOrderFrom: 'recalledOrderFrom',
        recalledOrderTo: 'recalledOrderTo',
        fileboxLocation: 'fileboxLocation',
        file201Status: 'file201Status',
      };

      const officeKeys = ['officeHospitalName', 'motherUnit', 'detailedTo', 'recalledFrom', 'recalledTo'];
      Object.keys(fieldMapping).forEach((key) => {
        let currentValue = updatedFormData[key];
        const originalValue = origData[key];

        if (officeKeys.includes(key) && currentValue) {
          currentValue = getOfficeFullName(String(currentValue));
        }

        const normCurrent = currentValue === undefined || currentValue === null ? '' : String(currentValue).trim();
        const normOriginal = originalValue === undefined || originalValue === null ? '' : String(originalValue).trim();

        if (normCurrent !== normOriginal) {
          const backendField = fieldMapping[key];
          changedFields[backendField] = {
            from: normOriginal === '' ? null : originalValue,
            to: normCurrent === '' ? null : currentValue,
          };
        }
      });

      // Check if any fields were changed or if an AO file was uploaded
      if (Object.keys(changedFields).length === 0) {
        if (updatedAoFile) {
          changedFields.aoFile = {
            from: 'Current AO Document',
            to: `${updatedAoFile.name}${updatedReplace ? ' (Replace Existing)' : ''}`,
          };
        } else {
          changedFields.aoNumber = {
            from: origData.aoNumber || '—',
            to: updatedFormData.aoNumber || '—',
          };
          changedFields.aoYear = {
            from: origData.aoYear || '—',
            to: updatedFormData.aoYear || '—',
          };
          changedFields.aoType = {
            from: origData.aoType || '—',
            to: updatedFormData.aoType || '—',
          };
        }
      }

      setPendingUpdatePayload({ employeeId: selectedEmployee.id, changedFields });

      // All roles — submit to approval queue, no direct execution
      try {
        const empName = formatEmployeeNameForFolder(
          selectedEmployee.firstName,
          selectedEmployee.lastName,
          selectedEmployee.middleName
        );

        let payloadToSubmit: any = { ...changedFields };

        // If there is an AO file, attach it to the payload as base64 so it can be uploaded upon approval
        if (updatedAoFile) {
          try {
            const aoFileData = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(updatedAoFile);
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
            });

            payloadToSubmit._aoFile = {
              data: aoFileData,
              metadata: {
                employeeId: selectedEmployee.id,
                employeeName: empName,
                category: 'Administrative Order',
                fileName: updatedAoFile.name,
                fileSize: Math.round(updatedAoFile.size / 1024),
                mimeType: updatedAoFile.type || 'application/pdf',
                aoNumber: updatedFormData.aoNumber,
                aoYear: updatedFormData.aoYear,
                aoType: updatedFormData.aoType,
                detailedTo: updatedFormData.detailedTo,
                detailedOrderFrom: updatedFormData.aoType === 'Detailed' ? updatedFormData.detailedOrderFrom || undefined : undefined,
                detailedOrderTo: updatedFormData.aoType === 'Detailed' ? updatedFormData.detailedOrderTo || undefined : undefined,
                designatedPositionFunction: updatedFormData.aoType === 'Designated' ? updatedFormData.designatedPositionFunction || undefined : undefined,
                designatedOrderFrom: updatedFormData.aoType === 'Designated' ? updatedFormData.designatedOrderFrom || undefined : undefined,
                designatedOrderTo: updatedFormData.aoType === 'Designated' ? updatedFormData.designatedOrderTo || undefined : undefined,
                recalledFrom: updatedFormData.aoType === 'Recalled' ? updatedFormData.recalledFrom || undefined : undefined,
                recalledTo: updatedFormData.aoType === 'Recalled' ? updatedFormData.recalledTo || undefined : undefined,
                recalledOrderFrom: updatedFormData.aoType === 'Recalled' ? updatedFormData.recalledOrderFrom || undefined : undefined,
                recalledOrderTo: updatedFormData.aoType === 'Recalled' ? updatedFormData.recalledOrderTo || undefined : undefined,
                autoRename: updatedAutoRename,
                replace: updatedReplace,
              }
            };
          } catch (fileErr) {
            console.error('Failed to encode AO file:', fileErr);
            showToast('Failed to attach AO file to request.', 'error');
            return;
          }
        }

        await api.approvals.submit({
          requestedBy: currentUser?.id || '',
          requestedByName: `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
          action: 'update_employee',
          entityType: 'employee',
          entityId: selectedEmployee.id,
          entityName: empName,
          payload: payloadToSubmit,
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

      // Generate and download (PDF for barcodes, ZIP for QR codes)
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
        <div className="dashboard__title-group">
          <div className="dashboard__title-icon-wrapper">
            <MdDashboard className="dashboard__title-icon" />
          </div>
          <div>
            <h1 className="dashboard__title">
              {viewMode === 'reports'
                ? (reportsTab === 'pulled-out'
                  ? 'Pulled-Out Files Report'
                  : reportsTab === 'transferred'
                  ? 'Transferred Files Report'
                  : 'Administrative Reports')
                : 'Employee Management'}
            </h1>
            <p className="dashboard__subtitle">
              {viewMode === 'reports'
                ? (reportsTab === 'pulled-out'
                  ? 'View and track all borrowed and returned physical 201 records'
                  : reportsTab === 'transferred'
                  ? 'View and track all 201 files transferred to RSP and returned back to Records'
                  : 'Generate administrative reports of employees')
                : `Manage and track all employee records in the system (${employeeStats.total} employees)`}
            </p>
          </div>
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
          <Card hoverable className="dashboard__kpi-card">
            <div className="dashboard__kpi-inner">
              <div className="dashboard__kpi-icon-wrapper dashboard__kpi-icon-wrapper--blue">
                <MdPeople />
              </div>
              <div className="dashboard__kpi-info">
                <span className="dashboard__kpi-label">Total Employees</span>
                <span className="dashboard__kpi-value dashboard__kpi-value--blue">{employeeStats.total}</span>
              </div>
            </div>
          </Card>

          <Card hoverable className="dashboard__kpi-card">
            <div className="dashboard__kpi-inner">
              <div className="dashboard__kpi-icon-wrapper dashboard__kpi-icon-wrapper--green">
                <MdCheckCircle />
              </div>
              <div className="dashboard__kpi-info">
                <span className="dashboard__kpi-label">Active Employees</span>
                <span className="dashboard__kpi-value dashboard__kpi-value--green">{employeeStats.active}</span>
              </div>
            </div>
          </Card>

          <Card hoverable className="dashboard__kpi-card">
            <div className="dashboard__kpi-inner">
              <div className="dashboard__kpi-icon-wrapper dashboard__kpi-icon-wrapper--amber">
                <MdPause />
              </div>
              <div className="dashboard__kpi-info">
                <span className="dashboard__kpi-label">Inactive Employees</span>
                <span className="dashboard__kpi-value dashboard__kpi-value--amber">{employeeStats.inactive}</span>
              </div>
            </div>
          </Card>

          <Card hoverable className="dashboard__kpi-card">
            <div className="dashboard__kpi-inner">
              <div className="dashboard__kpi-icon-wrapper dashboard__kpi-icon-wrapper--purple">
                <MdDescription />
              </div>
              <div className="dashboard__kpi-info">
                <span className="dashboard__kpi-label">Total Documents</span>
                <span className="dashboard__kpi-value dashboard__kpi-value--purple">{employeeStats.documents}</span>
              </div>
            </div>
          </Card>

          <Card hoverable className="dashboard__kpi-card">
            <div className="dashboard__kpi-inner">
              <div className="dashboard__kpi-icon-wrapper dashboard__kpi-icon-wrapper--pink">
                <MdStorage />
              </div>
              <div className="dashboard__kpi-info">
                <span className="dashboard__kpi-label">Storage Used</span>
                <span className="dashboard__kpi-value dashboard__kpi-value--pink">{(employeeStats.storageUsed / (1024 * 1024)).toFixed(1)} MB</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {viewMode === 'reports' ? (
        <div className="reports-view">

          {reportsTab === 'ao' ? (
            <>
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
                    <Input
                      type="text"
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
                      onChange={(e) => setReportAoStatus(e.target.value as 'Detailed' | 'Designated' | 'Recalled' | 'All Employees')}
                    >
                      <option value="All Employees">All Employees</option>
                      <option value="Detailed">Detailed</option>
                      <option value="Designated">Designated</option>
                      <option value="Recalled">Recalled</option>
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
                    <Input
                      type="text"
                      placeholder="Search by AO Number..."
                      value={reportAoNumber}
                      onChange={(e) => setReportAoNumber(e.target.value)}
                    />
                  </div>

                  <div className="reports-view__filter-card">
                    <label className="dashboard__filter-label">Series Year</label>
                    <select
                      className="dashboard__filter-select"
                      value={reportAoYear}
                      onChange={(e) => setReportAoYear(e.target.value)}
                    >
                      <option value="">All Series Years</option>
                      {dropdownOptions.aoYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
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
                <div className="reports-view__metric-card reports-view__metric-card--success">
                  <div className="reports-view__metric-icon-wrapper reports-view__metric-icon-wrapper--success">
                    <MdCheckCircle />
                  </div>
                  <div className="reports-view__metric-info">
                    <span className="reports-view__metric-label">Active Employees</span>
                    <span className="reports-view__metric-value">{new Set(filteredReportRows.filter((row) => row.status === 'Active').map((row) => row.employeeId)).size}</span>
                  </div>
                </div>

                <div className="reports-view__metric-card reports-view__metric-card--danger">
                  <div className="reports-view__metric-icon-wrapper reports-view__metric-icon-wrapper--danger">
                    <MdCancel />
                  </div>
                  <div className="reports-view__metric-info">
                    <span className="reports-view__metric-label">Inactive Employees</span>
                    <span className="reports-view__metric-value">{new Set(filteredReportRows.filter((row) => row.status === 'Inactive').map((row) => row.employeeId)).size}</span>
                  </div>
                </div>

                <div className="reports-view__metric-card reports-view__metric-card--warning">
                  <div className="reports-view__metric-icon-wrapper reports-view__metric-icon-wrapper--warning">
                    <MdWarning />
                  </div>
                  <div className="reports-view__metric-info">
                    <span className="reports-view__metric-label">Near Expiration (30 Days)</span>
                    <span className="reports-view__metric-value">
                      {filteredReportRows.filter((row) => row.status === 'Active' && isNearExpiration(row.durationTo)).length}
                    </span>
                  </div>
                </div>

                <div className="reports-view__metric-card reports-view__metric-card--expired">
                  <div className="reports-view__metric-icon-wrapper reports-view__metric-icon-wrapper--expired">
                    <MdError />
                  </div>
                  <div className="reports-view__metric-info">
                    <span className="reports-view__metric-label">Reached Deadline (Expired)</span>
                    <span className="reports-view__metric-value">
                      {filteredReportRows.filter((row) => row.status === 'Active' && isExpired(row.durationTo)).length}
                    </span>
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
                    <MdCheckCircle style={{ color: '#10b981' }} /> Active Employees ({new Set(filteredReportRows.filter((row) => row.status === 'Active').map((row) => row.employeeId)).size})
                  </button>
                  <button
                    className={`reports-view__tab-btn${reportActiveTab === 'inactive' ? ' reports-view__tab-btn--active' : ''}`}
                    onClick={() => setReportActiveTab('inactive')}
                  >
                    <MdCancel style={{ color: '#ef4444' }} /> Inactive Employees ({new Set(filteredReportRows.filter((row) => row.status === 'Inactive').map((row) => row.employeeId)).size})
                  </button>
                  <button
                    className={`reports-view__tab-btn${reportActiveTab === 'expiring' ? ' reports-view__tab-btn--active' : ''}`}
                    onClick={() => setReportActiveTab('expiring')}
                  >
                    <MdWarning style={{ color: '#f59e0b' }} /> Near Expiration ({filteredReportRows.filter((row) => row.status === 'Active' && isNearExpiration(row.durationTo)).length})
                  </button>
                  <button
                    className={`reports-view__tab-btn${reportActiveTab === 'expired' ? ' reports-view__tab-btn--active' : ''}`}
                    onClick={() => setReportActiveTab('expired')}
                  >
                    <MdError style={{ color: '#dc2626' }} /> Reached Deadline ({filteredReportRows.filter((row) => row.status === 'Active' && isExpired(row.durationTo)).length})
                  </button>
                </div>

                <div className="reports-view__export-actions">
                  <Button
                    variant="secondary"
                    onClick={() => setIsReportPreviewOpen(true)}
                    disabled={sortedReportRows.length === 0}
                  >
                    <MdPrint style={{ marginRight: '0.35rem', fontSize: '1.05rem' }} /> View & Print
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
                </div>
                {reportsForActiveTab.length > 0 && (
                  <div className="reports-view__pagination-bar">
                    <div className="reports-view__pagination-size">
                      <span>Show per page:</span>
                      <select
                        className="reports-view__select-compact"
                        value={reportItemsPerPage}
                        onChange={(e) => {
                          setReportItemsPerPage(parseInt(e.target.value, 10));
                          setReportCurrentPage(1);
                        }}
                      >
                        <option value={15}>15</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>

                    <div className="reports-view__pagination-info">
                      Showing {(reportCurrentPage - 1) * reportItemsPerPage + 1} to{' '}
                      {Math.min(reportCurrentPage * reportItemsPerPage, reportsForActiveTab.length)} of {reportsForActiveTab.length.toLocaleString()}
                    </div>

                    <div className="reports-view__pagination-controls">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setReportCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={reportCurrentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="reports-view__page-number">
                        Page {reportCurrentPage} of {reportTotalPages || 1}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setReportCurrentPage((p) => Math.min(reportTotalPages, p + 1))}
                        disabled={reportCurrentPage === reportTotalPages || reportTotalPages <= 1}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </>
          ) : reportsTab === 'pulled-out' ? (
            <div className="pulled-out-reports">
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    Search and Filter
                  </h3>
                  <span className="reports-view__summary-pill">Total Transactions: {filteredBorrowRows.length}</span>
                </div>

                <div className="reports-view__filters-grid">
                  <div className="reports-view__filter-card">
                    <label className="dashboard__filter-label">Search</label>
                    <Input
                      type="text"
                      placeholder="Search borrower, employee, purpose..."
                      value={borrowSearchTerm}
                      onChange={(e) => setBorrowSearchTerm(e.target.value)}
                    />
                  </div>

                  <div className="reports-view__filter-card">
                    <label className="dashboard__filter-label">Borrow Status</label>
                    <select
                      className="dashboard__filter-select"
                      value={borrowStatusFilter}
                      onChange={(e) => setBorrowStatusFilter(e.target.value as any)}
                    >
                      <option value="All">All Transactions</option>
                      <option value="Borrowed">Currently Borrowed</option>
                      <option value="Returned">Returned</option>
                    </select>
                  </div>

                  <div className="reports-view__filter-card">
                    <label className="dashboard__filter-label">Date Borrowed From</label>
                    <input
                      type="date"
                      className="dashboard__form-input"
                      value={borrowDateFromFilter}
                      onChange={(e) => setBorrowDateFromFilter(e.target.value)}
                    />
                  </div>

                  <div className="reports-view__filter-card">
                    <label className="dashboard__filter-label">Date Borrowed To</label>
                    <input
                      type="date"
                      className="dashboard__form-input"
                      value={borrowDateToFilter}
                      onChange={(e) => setBorrowDateToFilter(e.target.value)}
                    />
                  </div>

                  {borrowStatusFilter !== 'Borrowed' && (
                    <>
                      <div className="reports-view__filter-card">
                        <label className="dashboard__filter-label">Date Returned From</label>
                        <input
                          type="date"
                          className="dashboard__form-input"
                          value={returnDateFromFilter}
                          onChange={(e) => setReturnDateFromFilter(e.target.value)}
                        />
                      </div>

                      <div className="reports-view__filter-card">
                        <label className="dashboard__filter-label">Date Returned To</label>
                        <input
                          type="date"
                          className="dashboard__form-input"
                          value={returnDateToFilter}
                          onChange={(e) => setReturnDateToFilter(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setBorrowSearchTerm('');
                      setBorrowStatusFilter('All');
                      setBorrowDateFromFilter('');
                      setBorrowDateToFilter('');
                      setReturnDateFromFilter('');
                      setReturnDateToFilter('');
                    }}
                  >
                    Reset Filters
                  </Button>
                </div>
              </Card>

              <Card>
                {borrowLogsLoading ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading transactions...</div>
                ) : (
                  <>
                    <div className="reports-view__export-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <Button
                        variant="secondary"
                        onClick={() => setIsBorrowReportPreviewOpen(true)}
                        disabled={filteredBorrowRows.length === 0}
                      >
                        <MdPrint style={{ marginRight: '0.35rem', fontSize: '1.05rem' }} /> View & Print
                      </Button>
                      <div ref={borrowDropdownRef} className="reports-view__columns-control" style={{ position: 'relative' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setIsBorrowColumnDropdownOpen(!isBorrowColumnDropdownOpen)}
                        >
                          ⚙️ Columns
                        </Button>
                        {isBorrowColumnDropdownOpen && (
                          <div className="reports-view__columns-dropdown">
                            <div className="reports-view__columns-dropdown-header">
                              <button
                                type="button"
                                onClick={() => {
                                  setVisibleBorrowColumns(DEFAULT_VISIBLE_BORROW_COLUMNS);
                                  localStorage.setItem('borrow_visible_columns', JSON.stringify(DEFAULT_VISIBLE_BORROW_COLUMNS));
                                }}
                                className="reports-view__columns-link"
                              >
                                Select All
                              </button>
                              <span className="reports-view__columns-divider">|</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const cleared = Object.keys(DEFAULT_VISIBLE_BORROW_COLUMNS).reduce((acc, k) => ({ ...acc, [k]: false }), {});
                                  setVisibleBorrowColumns(cleared);
                                  localStorage.setItem('borrow_visible_columns', JSON.stringify(cleared));
                                }}
                                className="reports-view__columns-link"
                              >
                                Clear All
                              </button>
                            </div>
                            <div className="reports-view__columns-dropdown-list">
                              {Object.keys(BORROW_COLUMN_LABELS).map((key) => (
                                <label key={key} className="reports-view__columns-item">
                                  <input
                                    type="checkbox"
                                    className="reports-view__columns-checkbox"
                                    checked={visibleBorrowColumns[key] !== false}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setVisibleBorrowColumns((prev) => {
                                        const next = { ...prev, [key]: checked };
                                        localStorage.setItem('borrow_visible_columns', JSON.stringify(next));
                                        return next;
                                      });
                                    }}
                                  />
                                  <span className="reports-view__columns-label">{BORROW_COLUMN_LABELS[key] || key}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="reports-view__table-container" style={{ marginTop: '1rem' }}>
                      <div className="dashboard__table-scroll" style={{ borderBottomLeftRadius: borrowTotalPages <= 1 ? 'var(--border-radius-lg)' : 0, borderBottomRightRadius: borrowTotalPages <= 1 ? 'var(--border-radius-lg)' : 0 }}>
                        <Table
                          columns={borrowColumns}
                          data={paginatedBorrowLogs}
                          keyExtractor={(row) => row.id}
                          onRowClick={(row) => {
                            setSelectedBorrowLog(row);
                            setIsBorrowDetailsModalOpen(true);
                          }}
                          emptyMessage="No borrow/return transactions found"
                        />
                      </div>
                    </div>

                    {filteredBorrowRows.length > 0 && (
                      <div className="reports-view__pagination-bar">
                        <div className="reports-view__pagination-size">
                          <span>Show per page:</span>
                          <select
                            className="reports-view__select-compact"
                            value={borrowItemsPerPage}
                            onChange={(e) => {
                              setBorrowItemsPerPage(parseInt(e.target.value, 10));
                              setBorrowCurrentPage(1);
                            }}
                          >
                            <option value={15}>15</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>

                        <div className="reports-view__pagination-info">
                          Showing {(borrowCurrentPage - 1) * borrowItemsPerPage + 1} to{' '}
                          {Math.min(borrowCurrentPage * borrowItemsPerPage, filteredBorrowRows.length)} of {filteredBorrowRows.length.toLocaleString()}
                        </div>

                        <div className="reports-view__pagination-controls">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setBorrowCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={borrowCurrentPage === 1}
                          >
                            Previous
                          </Button>
                          <span className="reports-view__page-number">
                            Page {borrowCurrentPage} of {borrowTotalPages || 1}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setBorrowCurrentPage((p) => Math.min(borrowTotalPages, p + 1))}
                            disabled={borrowCurrentPage === borrowTotalPages || borrowTotalPages <= 1}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </div>
          ) : (
            <div className="transferred-reports">
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    Search and Filter
                  </h3>
                  <span className="reports-view__summary-pill">Total Transferred Records: {filteredTransferredRows.length}</span>
                </div>

                <div className="reports-view__filters-grid">
                  <div className="reports-view__filter-card">
                    <label className="dashboard__filter-label">Search</label>
                    <Input
                      type="text"
                      placeholder="Search recipient, employee, office, position..."
                      value={transferredSearchTerm}
                      onChange={(e) => setTransferredSearchTerm(e.target.value)}
                    />
                  </div>

                  <div className="reports-view__filter-card">
                    <label className="dashboard__filter-label">Transfer Status</label>
                    <select
                      className="dashboard__filter-select"
                      value={transferredStatusFilter}
                      onChange={(e) => setTransferredStatusFilter(e.target.value as any)}
                    >
                      <option value="All">All Records</option>
                      <option value="Transferred">Currently Transferred</option>
                      <option value="Returned">Returned Back to Records</option>
                    </select>
                  </div>

                  <div className="reports-view__filter-card">
                    <label className="dashboard__filter-label">Date Transferred From</label>
                    <input
                      type="date"
                      className="dashboard__form-input"
                      value={transferredDateFromFilter}
                      onChange={(e) => setTransferredDateFromFilter(e.target.value)}
                    />
                  </div>

                  <div className="reports-view__filter-card">
                    <label className="dashboard__filter-label">Date Transferred To</label>
                    <input
                      type="date"
                      className="dashboard__form-input"
                      value={transferredDateToFilter}
                      onChange={(e) => setTransferredDateToFilter(e.target.value)}
                    />
                  </div>

                  {transferredStatusFilter !== 'Transferred' && (
                    <>
                      <div className="reports-view__filter-card">
                        <label className="dashboard__filter-label">Date Returned From</label>
                        <input
                          type="date"
                          className="dashboard__form-input"
                          value={transferredReturnDateFromFilter}
                          onChange={(e) => setTransferredReturnDateFromFilter(e.target.value)}
                        />
                      </div>

                      <div className="reports-view__filter-card">
                        <label className="dashboard__filter-label">Date Returned To</label>
                        <input
                          type="date"
                          className="dashboard__form-input"
                          value={transferredReturnDateToFilter}
                          onChange={(e) => setTransferredReturnDateToFilter(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setTransferredSearchTerm('');
                      setTransferredStatusFilter('All');
                      setTransferredDateFromFilter('');
                      setTransferredDateToFilter('');
                      setTransferredReturnDateFromFilter('');
                      setTransferredReturnDateToFilter('');
                    }}
                  >
                    Reset Filters
                  </Button>
                </div>
              </Card>

              <Card>
                {transferredLogsLoading ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading transferred files...</div>
                ) : (
                  <>
                    <div className="reports-view__export-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button
                        variant="secondary"
                        onClick={() => setIsTransferredReportPreviewOpen(true)}
                        disabled={filteredTransferredRows.length === 0}
                      >
                        <MdPrint style={{ marginRight: '0.35rem', fontSize: '1.05rem' }} /> View & Print
                      </Button>
                      <div ref={transferredDropdownRef} className="reports-view__columns-control" style={{ position: 'relative' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setIsTransferredColumnDropdownOpen(!isTransferredColumnDropdownOpen)}
                        >
                          ⚙️ Columns
                        </Button>
                        {isTransferredColumnDropdownOpen && (
                          <div className="reports-view__columns-dropdown">
                            <div className="reports-view__columns-dropdown-header">
                              <button
                                type="button"
                                onClick={() => {
                                  setVisibleTransferredColumns(DEFAULT_VISIBLE_TRANSFERRED_COLUMNS);
                                  localStorage.setItem('transferred_visible_columns', JSON.stringify(DEFAULT_VISIBLE_TRANSFERRED_COLUMNS));
                                }}
                                className="reports-view__columns-link"
                              >
                                Select All
                              </button>
                              <span className="reports-view__columns-divider">|</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const cleared = Object.keys(DEFAULT_VISIBLE_TRANSFERRED_COLUMNS).reduce((acc, k) => ({ ...acc, [k]: false }), {});
                                  setVisibleTransferredColumns(cleared);
                                  localStorage.setItem('transferred_visible_columns', JSON.stringify(cleared));
                                }}
                                className="reports-view__columns-link"
                              >
                                Clear All
                              </button>
                            </div>
                            <div className="reports-view__columns-dropdown-list">
                              {Object.keys(TRANSFERRED_COLUMN_LABELS).map((key) => (
                                <label key={key} className="reports-view__columns-item">
                                  <input
                                    type="checkbox"
                                    className="reports-view__columns-checkbox"
                                    checked={visibleTransferredColumns[key] !== false}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setVisibleTransferredColumns((prev) => {
                                        const next = { ...prev, [key]: checked };
                                        localStorage.setItem('transferred_visible_columns', JSON.stringify(next));
                                        return next;
                                      });
                                    }}
                                  />
                                  <span className="reports-view__columns-label">{TRANSFERRED_COLUMN_LABELS[key] || key}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="reports-view__table-container" style={{ marginTop: '1rem' }}>
                      <div className="dashboard__table-scroll" style={{ borderBottomLeftRadius: transferredTotalPages <= 1 ? 'var(--border-radius-lg)' : 0, borderBottomRightRadius: transferredTotalPages <= 1 ? 'var(--border-radius-lg)' : 0 }}>
                        <Table
                          columns={transferredColumns}
                          data={paginatedTransferredLogs}
                          keyExtractor={(row) => row.id}
                          onRowClick={(row) => {
                            setSelectedTransferredLog(row);
                            setIsTransferredDetailsModalOpen(true);
                          }}
                          emptyMessage="No transferred file records found"
                        />
                      </div>
                    </div>

                    {filteredTransferredRows.length > 0 && (
                      <div className="reports-view__pagination-bar">
                        <div className="reports-view__pagination-size">
                          <span>Show per page:</span>
                          <select
                            className="reports-view__select-compact"
                            value={transferredItemsPerPage}
                            onChange={(e) => {
                              setTransferredItemsPerPage(parseInt(e.target.value, 10));
                              setTransferredCurrentPage(1);
                            }}
                          >
                            <option value={15}>15</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>

                        <div className="reports-view__pagination-info">
                          Showing {(transferredCurrentPage - 1) * transferredItemsPerPage + 1} to{' '}
                          {Math.min(transferredCurrentPage * transferredItemsPerPage, filteredTransferredRows.length)} of {filteredTransferredRows.length.toLocaleString()}
                        </div>

                        <div className="reports-view__pagination-controls">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setTransferredCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={transferredCurrentPage === 1}
                          >
                            Previous
                          </Button>
                          <span className="reports-view__page-number">
                            Page {transferredCurrentPage} of {transferredTotalPages || 1}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setTransferredCurrentPage((p) => Math.min(transferredTotalPages, p + 1))}
                            disabled={transferredCurrentPage === transferredTotalPages || transferredTotalPages <= 1}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </div>
          )}
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
                  placeholder={`Search by ${searchFilterType === 'all' ? 'name, office, position, ID, or AO...' : searchFilterType.replace('_', ' ')}...`}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
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
                      onChange={(e) => {
                        setSearchFilterType(e.target.value as any);
                        setCurrentPage(1);
                      }}
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
                      onChange={(e) => {
                        setSearchFilterType(e.target.value as any);
                        setCurrentPage(1);
                      }}
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
                      onChange={(e) => {
                        setSearchFilterType(e.target.value as any);
                        setCurrentPage(1);
                      }}
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
                      onChange={(e) => {
                        setSearchFilterType(e.target.value as any);
                        setCurrentPage(1);
                      }}
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
                      onChange={(e) => {
                        setSearchFilterType(e.target.value as any);
                        setCurrentPage(1);
                      }}
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
            {!searchQuery.trim() && !showAllEmployees && !isLoading && filteredEmployees.length === 0 && (
              <div className="dashboard__empty-state">
                <MdPeople className="dashboard__empty-icon" />
                <h3 className="dashboard__empty-title">Search employees to display results</h3>
                <p className="dashboard__empty-text">
                  Use the search bar above to find employees by name, or toggle "Show All Employees" to view the complete list
                </p>
              </div>
            )}

            {/* Initial Loading State (only when table is empty) */}
            {isLoading && filteredEmployees.length === 0 && (
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

            {/* Results Table - Stays smoothly mounted during typing */}
            {filteredEmployees.length > 0 && (
              <>
                <div className="dashboard__table-scroll" style={{ opacity: isLoading ? 0.75 : 1, transition: 'opacity 0.1s ease', position: 'relative' }}>
                  {isLoading && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, var(--color-primary-light, #60a5fa), var(--color-primary, #3b82f6), var(--color-primary-light, #60a5fa))', backgroundSize: '200% 100%', animation: 'shimmer 1s infinite linear', zIndex: 10 }} />
                  )}
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

      {/* Add Employee Modal with Multi-Step Wizard */}
      <Modal
        isOpen={isAddEmployeeModalOpen}
        onClose={handleCloseAddEmployeeModal}
        title="Add New Employee"
        size="lg"
      >
        <EmployeeFormWizard
          formData={formData as any}
          formErrors={formErrors as any}
          dropdownOptions={dropdownOptions}
          existingEmployeeIds={existingEmployeeIds}
          existingAoKeys={existingAoKeys}
          aoFile={aoFile}
          setAoFile={setAoFile}
          autoRename={autoRename}
          setAutoRename={setAutoRename}
          profilePicture={addProfilePicture}
          setProfilePicture={setAddProfilePicture}
          onSave={(data) => handleSaveEmployee(data)}
          onCancel={handleCloseAddEmployeeModal}
          isSaving={isLoading}
        />
      </Modal>

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedChangesModal
        isOpen={showUnsavedChangesModal}
        onKeepEditing={() => setShowUnsavedChangesModal(false)}
        onDiscard={() => {
          setShowUnsavedChangesModal(false);
          handleCloseAddEmployeeModal();
        }}
      />


      {/* Update Employee Modal */}
      <EditEmployeeModal
        isOpen={isUpdateEmployeeModalOpen}
        onClose={handleCloseUpdateEmployeeModal}
        employee={selectedEmployee}
        dropdownOptions={dropdownOptions}
        onSave={handleUpdateEmployee}
        isSaving={isLoading}
      />


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
        employeeId={selectedReportDocument?.employeeId || ''}
        employeeName={selectedReportEmployeeName}
      />

      {/* Delete Report Entries Confirmation Modal (Administrative Order) */}
      <Modal
        isOpen={isDeleteReportConfirmOpen}
        onClose={() => {
          if (!isDeletingReport) {
            setIsDeleteReportConfirmOpen(false);
            setPendingDeleteReportIds([]);
          }
        }}
        title="Confirm Deletion Request — Administrative Order"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
            <Button
              variant="ghost"
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
              <MdDeleteOutline /> Submit Delete Request
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '12px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--border-radius)',
          }}>
            <MdWarning style={{ fontSize: '1.4rem', color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ display: 'block', fontSize: '0.875rem', color: '#ef4444', marginBottom: '2px' }}>
                Permanent Removal Warning
              </strong>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                You are requesting deletion of <strong>{pendingDeleteReportIds.length}</strong> Administrative Order entry/entries. This action requires approval from a Super Admin / Developer.
              </p>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '6px',
              borderBottom: '1px solid var(--border-color)',
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                Selected Administrative Order Entries
              </span>
              <Badge variant="danger" size="sm">
                {pendingDeleteReportIds.length} {pendingDeleteReportIds.length === 1 ? 'ENTRY' : 'ENTRIES'}
              </Badge>
            </div>

            <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              {pendingDeleteReportIds.slice(0, 6).map((id) => {
                const row = sortedReportRows.find((r) => r.id === id);
                return (
                  <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem', padding: '4px 0', borderBottom: '1px dashed var(--border-color)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row?.name || id}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      {row?.aoNumber ? `AO ${row.aoNumber}` : 'No AO Number'}{row?.seriesNumber ? `, S. ${row.seriesNumber}` : ''} • {row?.position || 'N/A'}
                    </span>
                  </div>
                );
              })}
              {pendingDeleteReportIds.length > 6 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', paddingTop: '4px' }}>
                  + and {pendingDeleteReportIds.length - 6} more entries
                </div>
              )}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            Once submitted, this request will appear under <strong>Admin Tools ➔ Request &amp; Approvals</strong>. Once approved, the corresponding Administrative Order documents will be permanently removed.
          </p>
        </div>
      </Modal>

      {/* Delete Borrow Logs Confirmation Modal (Pulled-Out Files) */}
      <Modal
        isOpen={isDeleteBorrowConfirmOpen}
        onClose={() => {
          if (!isDeletingBorrow) {
            setIsDeleteBorrowConfirmOpen(false);
            setPendingDeleteBorrowIds([]);
          }
        }}
        title="Confirm Deletion Request — Pulled-Out Files Log"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
            <Button
              variant="ghost"
              onClick={() => {
                setIsDeleteBorrowConfirmOpen(false);
                setPendingDeleteBorrowIds([]);
              }}
              disabled={isDeletingBorrow}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDeleteBorrowEntries}
              loading={isDeletingBorrow}
              disabled={isDeletingBorrow}
            >
              <MdDeleteOutline /> Submit Delete Request
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '12px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--border-radius)',
          }}>
            <MdWarning style={{ fontSize: '1.4rem', color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ display: 'block', fontSize: '0.875rem', color: '#ef4444', marginBottom: '2px' }}>
                Permanent Removal Warning
              </strong>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                You are requesting deletion of <strong>{pendingDeleteBorrowIds.length}</strong> pulled-out file log entry/entries.
              </p>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '6px',
              borderBottom: '1px solid var(--border-color)',
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                Selected Pulled-Out File Records
              </span>
              <Badge variant="danger" size="sm">
                {pendingDeleteBorrowIds.length} {pendingDeleteBorrowIds.length === 1 ? 'RECORD' : 'RECORDS'}
              </Badge>
            </div>

            <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              {pendingDeleteBorrowIds.slice(0, 6).map((id) => {
                const row = borrowLogs.find((r) => r.id === id);
                const emp = row?.employee;
                const empName = emp ? `${emp.lastName}, ${emp.firstName}` : (row?.employeeId || 'N/A');
                return (
                  <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem', padding: '4px 0', borderBottom: '1px dashed var(--border-color)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{empName}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      Borrowed by: {row?.borrowerName || 'N/A'} • {row?.dateBorrowed ? new Date(row.dateBorrowed).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                );
              })}
              {pendingDeleteBorrowIds.length > 6 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', paddingTop: '4px' }}>
                  + and {pendingDeleteBorrowIds.length - 6} more records
                </div>
              )}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            This deletion request will be submitted to a Super Admin or Developer for review in the Approvals queue.
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
              variant="primary"
              style={{ background: '#10b981', borderColor: '#10b981' }}
              onClick={async () => {
                try {
                  showToast('Generating Excel...', 'info');
                  
                  // Map table data to the expected service format
                  const recordsToExport = sortedReportRows.map(row => ({
                    nameOfEmployee: row.name,
                    position: row.position || '',
                    motherUnit: row.motherUnit || '',
                    detailedOffice: row.detailedOffice || '',
                    designatedPosition: row.designatedPositionFunction || '',
                    recalledFrom: row.recalledFrom || '',
                    recalledTo: row.recalledTo || '',
                    durationFrom: row.durationFrom ? row.durationFrom.split('T')[0] : '',
                    durationTo: row.durationTo 
                      ? (row.durationTo.startsWith('9999-12-31') ? 'Until revoked' : row.durationTo.split('T')[0]) 
                      : '',
                    adminOrderNo: row.aoNumber ? `AO ${row.aoNumber}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}` : ''
                  }));

                  const filterData = {
                    monthFrom: reportAoOrderMonthFrom || '',
                    monthTo: reportAoOrderMonthTo || '',
                    seriesYear: reportAoYear || '',
                    visibleColumns,
                    records: recordsToExport
                  };

                  let buffer;
                  if (reportAoStatus === 'Detailed') {
                    buffer = await generateAOStatusDetailedExcel(filterData);
                  } else if (reportAoStatus === 'Designated') {
                    buffer = await generateAOStatusDesignatedExcel(filterData);
                  } else if (reportAoStatus === 'Recalled') {
                    buffer = await generateAOStatusRecalledExcel(filterData);
                  } else {
                    buffer = await generateAOStatusAllEmployeesExcel(filterData);
                  }
                  const blob = new Blob([buffer as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                  saveAs(blob, 'AO_Status_Report.xlsx');
                  
                  showToast('Excel exported successfully!', 'success');
                } catch (error: any) {
                  console.error('Export error:', error);
                  showToast('Error exporting to Excel: ' + (error.message || 'Unknown error'), 'error');
                }
              }}
              disabled={sortedReportRows.length === 0}
            >
              <MdFileDownload style={{ marginRight: '0.35rem', fontSize: '1.1rem' }} /> Export Request (Excel)
            </Button>
          </div>
        }
      >
        <div className="printable-report" style={{
          fontFamily: "'Times New Roman', Times, serif",
          color: 'var(--text-primary)',
          backgroundColor: 'var(--bg-primary)',
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
                    ? sortedReportRows.filter((row) => row.status === 'Active' && isNearExpiration(row.durationTo))
                    : sortedReportRows.filter((row) => row.status === 'Active' && isExpired(row.durationTo));

            const ROWS_PER_PAGE = 13;
            const pageCount = Math.max(1, Math.ceil(tabRows.length / ROWS_PER_PAGE));
            const officeColHeader = reportAoStatus === 'Designated'
              ? 'Designated Office'
              : reportAoStatus === 'All Employees'
                ? 'Detailed/Designated Office/Hospital'
                : 'Detailed/Transferred Office/Hospital';
            const durationColHeader = reportAoStatus === 'Designated'
              ? 'Duration of Designated Order'
              : reportAoStatus === 'Detailed'
                ? 'Duration of Detailed Order'
                : 'Duration';

            const headerBlock = (
              <div style={{
                border: '1px solid var(--border-color)',
                borderBottom: '2px solid var(--border-color)',
                padding: '10px 12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '10.5pt', fontStyle: 'italic', fontWeight: 'normal' }}>Republic of the Philippines</div>
                <div style={{ fontSize: '11pt', fontWeight: 'bold', marginTop: '2px' }}>Province of Pangasinan</div>
                <div style={{ fontSize: '10pt', fontWeight: 'normal', marginTop: '2px' }}>Lingayen</div>
                <div style={{ fontSize: '11.5pt', fontWeight: 'bold', marginTop: '4px', fontFamily: 'Calibri, Arial, sans-serif' }}>HUMAN RESOURCE MGT. &amp; DEVELOPMENT OFFICE</div>
              </div>
            );

            const isDetailed = reportAoStatus === 'Detailed';
            const isRecalled = reportAoStatus === 'Recalled';
            const isAllEmployees = reportAoStatus === 'All Employees';
            const designatedHeader = reportAoStatus === 'Designated'
              ? 'Designated Position'
              : 'Designated Position/Function';

            const renderPrintDuration = (duration: any) => {
              if (!duration) return '—';
              if (duration === 'Until revoked') return 'Until revoked';
              return formatDateMDY(duration);
            };

            // Dynamic column definitions based on reportAoStatus AND visibleColumns
            const rawPreviewColDefs = [
              { key: 'no', label: 'NO.', width: 4 },
              { key: 'name', label: 'Name of Employee', width: 15 },
              ...(reportAoStatus === 'Recalled' || reportAoStatus === 'All Employees' 
                ? [{ key: 'position', label: 'Position', width: 12, show: visibleColumns.position !== false }] 
                : []),
              { key: 'motherUnit', label: 'Mother Unit', width: 12, show: visibleColumns.motherUnit !== false },
              ...(reportAoStatus === 'Detailed' || reportAoStatus === 'All Employees' 
                ? [{ key: 'detailedOffice', label: officeColHeader, width: 12, show: visibleColumns.detailedOffice !== false }] 
                : []),
              ...(reportAoStatus === 'Designated' || reportAoStatus === 'All Employees' 
                ? [{ key: 'designatedPositionFunction', label: designatedHeader, width: 12, show: visibleColumns.designatedPositionFunction !== false }] 
                : []),
              ...(reportAoStatus === 'Recalled' || reportAoStatus === 'All Employees' 
                ? [
                    { key: 'recalledFrom', label: 'Recalled From', width: 8, show: visibleColumns.recalledFrom !== false },
                    { key: 'recalledTo', label: 'Recalled To', width: 8, show: visibleColumns.recalledTo !== false }
                  ] 
                : []),
              { key: 'durationFrom', label: 'Duration From', width: 8, show: visibleColumns.durationFrom !== false },
              { key: 'durationTo', label: 'Duration To', width: 8, show: visibleColumns.durationTo !== false },
              { key: 'administrativeOrder', label: 'Administrative Order No.', width: 14, show: visibleColumns.administrativeOrder !== false }
            ];

            const previewColDefs = rawPreviewColDefs.filter(c => c.show !== false);
            const totalWidthWeight = previewColDefs.reduce((acc, col) => acc + col.width, 0);

            let tableHeader = (
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)' }}>
                  {previewColDefs.map(col => {
                    const percentageWidth = `${(col.width / totalWidthWeight) * 100}%`;
                    return (
                      <th key={col.key} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: percentageWidth }}>
                        {col.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
            );

            if (tabRows.length === 0) {
              return (
                <>
                  {headerBlock}
                  <div style={{
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '11pt',
                    fontFamily: "'Times New Roman', Times, serif",
                    textTransform: 'uppercase',
                    padding: '8px 6px',
                    borderLeft: '1px solid #000',
                    borderRight: '1px solid #000',
                    borderBottom: '1px solid #000',
                    letterSpacing: '0.3px'
                  }}>{getFormattedTitle()}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: "'Times New Roman', Times, serif" }}>
                    {tableHeader}
                    <tbody>
                      <tr><td colSpan={previewColDefs.length} style={{ border: '1px solid #000', padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', verticalAlign: 'middle' }}>No records found matching current filters.</td></tr>
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
                  <div style={{
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '11pt',
                    fontFamily: "'Times New Roman', Times, serif",
                    textTransform: 'uppercase',
                    padding: '8px 6px',
                    borderLeft: '1px solid #000',
                    borderRight: '1px solid #000',
                    borderBottom: '1px solid #000',
                    letterSpacing: '0.3px'
                  }}>
                    {getFormattedTitle()}
                    {pageCount > 1 && (
                      <span style={{ fontSize: '9pt', fontWeight: 'normal', marginLeft: '10px', color: 'var(--text-secondary)' }}>
                        (Page {pageIdx + 1} of {pageCount})
                      </span>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Times New Roman', Times, serif", tableLayout: 'fixed' }}>
                    {tableHeader}
                    <tbody>
                      {pageRows.map((row, idx) => {
                        const globalIdx = pageIdx * ROWS_PER_PAGE + idx;
                        const ao = row.aoNumber ? `AO ${row.aoNumber}${row.seriesNumber ? `, S. ${row.seriesNumber}` : ''}` : '—';
                        return (
                          <tr key={globalIdx} style={{ backgroundColor: 'var(--bg-primary)' }}>
                            {previewColDefs.map(col => {
                              let val: React.ReactNode = '';
                              if (col.key === 'no') val = globalIdx + 1;
                              else if (col.key === 'name') val = row.name;
                              else if (col.key === 'position') val = row.position || '';
                              else if (col.key === 'motherUnit') val = getOfficeFullName(row.motherUnit) || '';
                              else if (col.key === 'detailedOffice') val = getOfficeFullName(row.detailedOffice) || '';
                              else if (col.key === 'designatedPositionFunction') val = row.designatedPositionFunction || '';
                              else if (col.key === 'recalledFrom') val = getOfficeFullName(row.recalledFrom) || '';
                              else if (col.key === 'recalledTo') val = getOfficeFullName(row.recalledTo) || '';
                              else if (col.key === 'durationFrom') val = renderPrintDuration(row.durationFrom);
                              else if (col.key === 'durationTo') val = renderPrintDuration(row.durationTo);
                              else if (col.key === 'administrativeOrder') val = ao;

                              const isNormalWhiteSpace = ['name', 'position', 'motherUnit', 'detailedOffice', 'designatedPositionFunction', 'recalledFrom', 'recalledTo'].includes(col.key);

                              return (
                                <td key={col.key} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: isNormalWhiteSpace ? 'normal' : 'normal' }}>
                                  {val}
                                </td>
                              );
                            })}
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
      {/* Borrow Report Preview Modal */}
      <Modal
        isOpen={isBorrowReportPreviewOpen}
        onClose={() => setIsBorrowReportPreviewOpen(false)}
        title="Pulled-Out Files Report Preview & Export"
        size="xl"
        footer={
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="primary"
              style={{ background: '#10b981', borderColor: '#10b981' }}
              onClick={handleExportBorrowLogsToExcel}
            >
              <MdFileDownload style={{ marginRight: '0.35rem', fontSize: '1.1rem' }} /> Export Request (Excel)
            </Button>
          </div>
        }
      >
        <div className="printable-report" style={{
          fontFamily: "'Times New Roman', Times, serif",
          color: 'var(--text-primary)',
          backgroundColor: 'var(--bg-primary)',
          padding: '1rem',
          borderRadius: 'var(--border-radius)',
          border: '1px solid var(--border-color)',
          overflowX: 'auto',
          lineHeight: '1.3'
        }}>
          {(() => {
            const tabRows = filteredBorrowRows;
            const ROWS_PER_PAGE = 13;
            const pageCount = Math.max(1, Math.ceil(tabRows.length / ROWS_PER_PAGE));

            const headerBlock = (
              <div style={{
                border: '1px solid var(--border-color)',
                borderBottom: '2px solid var(--border-color)',
                padding: '10px 12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '10.5pt', fontStyle: 'italic', fontWeight: 'normal' }}>Republic of the Philippines</div>
                <div style={{ fontSize: '11pt', fontWeight: 'bold', marginTop: '2px' }}>Province of Pangasinan</div>
                <div style={{ fontSize: '10pt', fontWeight: 'normal', marginTop: '2px' }}>Lingayen</div>
                <div style={{ fontSize: '11.5pt', fontWeight: 'bold', marginTop: '4px', fontFamily: 'Calibri, Arial, sans-serif' }}>HUMAN RESOURCE MGT. &amp; DEVELOPMENT OFFICE</div>
              </div>
            );

            const tableHeader = (
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)' }}>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '3%' }}>NO.</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '14%' }}>EMPLOYEE NAME</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '14%' }}>OFFICE/HOSPITAL</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '9%' }}>EMPLOYMENT STATUS</th>
                  <th colSpan={3} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>BORROWER</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '9%' }}>NAME OF FILES</th>
                  <th colSpan={3} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>RETURNED</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '8%' }}>RECORDS CONFORMED</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '7%' }}>REMARK</th>
                </tr>
                <tr style={{ backgroundColor: 'var(--bg-primary)' }}>
                  <th style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '9pt', textAlign: 'center', fontWeight: 'bold', width: '8%', verticalAlign: 'middle' }}>NAME</th>
                  <th style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '9pt', textAlign: 'center', fontWeight: 'bold', width: '5%', verticalAlign: 'middle' }}>DATE</th>
                  <th style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '9pt', textAlign: 'center', fontWeight: 'bold', width: '5%', verticalAlign: 'middle' }}>TIME</th>
                  <th style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '9pt', textAlign: 'center', fontWeight: 'bold', width: '8%', verticalAlign: 'middle' }}>NAME</th>
                  <th style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '9pt', textAlign: 'center', fontWeight: 'bold', width: '5%', verticalAlign: 'middle' }}>DATE</th>
                  <th style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '9pt', textAlign: 'center', fontWeight: 'bold', width: '5%', verticalAlign: 'middle' }}>TIME</th>
                </tr>
              </thead>
            );

            if (tabRows.length === 0) {
              return (
                <>
                  {headerBlock}
                  <div style={{
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '11pt',
                    fontFamily: "'Times New Roman', Times, serif",
                    textTransform: 'uppercase',
                    padding: '8px 6px',
                    borderLeft: '1px solid #000',
                    borderRight: '1px solid #000',
                    borderBottom: '1px solid #000',
                    letterSpacing: '0.3px'
                  }}>PULLED-OUT FILES REPORT</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Times New Roman', Times, serif", tableLayout: 'fixed' }}>
                    {tableHeader}
                    <tbody>
                      <tr>
                        <td colSpan={14} style={{ border: '1px solid #000', padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No records found.
                        </td>
                      </tr>
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
                  <div style={{
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '11pt',
                    fontFamily: "'Times New Roman', Times, serif",
                    textTransform: 'uppercase',
                    padding: '8px 6px',
                    borderLeft: '1px solid #000',
                    borderRight: '1px solid #000',
                    borderBottom: '1px solid #000',
                    letterSpacing: '0.3px'
                  }}>
                    PULLED-OUT FILES REPORT
                    {pageCount > 1 && (
                      <span style={{ fontSize: '9pt', fontWeight: 'normal', marginLeft: '10px', color: 'var(--text-secondary)' }}>
                        (Page {pageIdx + 1} of {pageCount})
                      </span>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Times New Roman', Times, serif", tableLayout: 'fixed' }}>
                    {tableHeader}
                    <tbody>
                      {pageRows.map((row, idx) => {
                        const globalIdx = pageIdx * ROWS_PER_PAGE + idx;
                        const emp = row.employee;
                        const empName = emp ? `${emp.lastName}, ${emp.firstName}` : row.employeeId;
                        const isReturned = row.action === 'return' || !!row.dateReturned;

                        return (
                          <tr key={globalIdx} style={{ backgroundColor: 'var(--bg-primary)' }}>
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {globalIdx + 1}
                            </td>
                            {/* Employee Name */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {empName}
                            </td>
                            {/* Office/Hospital */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {getOfficeFullName(row.employee?.yellowBox?.office || row.employee?.officeName) || '—'}
                            </td>
                            {/* Employment Status */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {row.employee?.status || '—'}
                            </td>
                            {/* Borrower Name */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {row.borrowerName || ''}
                            </td>
                            {/* Borrower Date */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {row.dateBorrowed ? new Date(row.dateBorrowed).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : ''}
                            </td>
                            {/* Borrower Time */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {row.dateBorrowed ? new Date(row.dateBorrowed).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </td>
                            {/* Name of Files */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              201 File
                            </td>
                            {/* Returned Name */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {isReturned ? (row.returnedByName || '') : ''}
                            </td>
                            {/* Returned Date */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {isReturned && row.dateReturned ? new Date(row.dateReturned).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : ''}
                            </td>
                            {/* Returned Time */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {isReturned && row.dateReturned ? new Date(row.dateReturned).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </td>
                            {/* Records Conformed */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                            </td>
                            {/* Remark */}
                            <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
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

      {/* Borrow Details Modal */}
      <Modal
        isOpen={isBorrowDetailsModalOpen}
        onClose={() => {
          setIsBorrowDetailsModalOpen(false);
          setSelectedBorrowLog(null);
        }}
        title="201 File Transaction Details"
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setIsBorrowDetailsModalOpen(false);
                setSelectedBorrowLog(null);
              }}
            >
              Close
            </Button>
          </div>
        }
      >
        {selectedBorrowLog && (() => {
          const emp = selectedBorrowLog.employee;
          const empName = emp ? `${emp.lastName}, ${emp.firstName} ${emp.middleName || ''}`.trim() : selectedBorrowLog.employeeId;
          const isReturned = selectedBorrowLog.action === 'return' || !!selectedBorrowLog.dateReturned;

          return (
            <div className="borrow-details" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.5rem 0' }}>

              {/* Top Overview Badge */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-secondary)',
                padding: '1rem',
                borderRadius: 'var(--border-radius)',
                border: '1px solid var(--border-color)'
              }}>
                <div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Owner Employee File</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{empName}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontFamily: 'monospace', marginTop: '0.125rem' }}>ID: {selectedBorrowLog.employeeId}</div>
                </div>
                <span style={{ display: 'inline-block', transform: 'scale(1.1)' }}>
                  <Badge variant={isReturned ? 'success' : 'warning'}>
                    {isReturned ? 'Returned' : 'Currently Borrowed'}
                  </Badge>
                </span>
              </div>

              {/* Side-by-Side Timeline */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1.5rem',
                position: 'relative'
              }}>

                {/* Left Card: Check-out details */}
                <div style={{
                  flex: '1 1 280px',
                  backgroundColor: 'rgba(59, 130, 246, 0.04)',
                  border: '1px solid rgba(59, 130, 246, 0.15)',
                  borderRadius: 'var(--border-radius-lg)',
                  padding: '1.5rem',
                  position: 'relative',
                  zIndex: 1
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <div style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      color: '#3b82f6',
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '1.1rem'
                    }}>
                      📤
                    </div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Check-Out Log</h4>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Borrowed By</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{selectedBorrowLog.borrowerName || '—'}</div>
                      {(selectedBorrowLog.borrowerPosition || selectedBorrowLog.borrowerOffice) && (
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                          {selectedBorrowLog.borrowerPosition} {selectedBorrowLog.borrowerOffice ? `(${selectedBorrowLog.borrowerOffice})` : ''}
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time Borrowed</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                        {new Date(selectedBorrowLog.dateBorrowed).toLocaleString('en-US', {
                          month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released By (Records Officer)</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{selectedBorrowLog.releasedBy || '—'}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Purpose of Borrowing</div>
                      <div style={{
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        marginTop: '0.25rem',
                        fontSize: '0.875rem',
                        lineHeight: '1.4',
                        fontStyle: selectedBorrowLog.purpose ? 'normal' : 'italic'
                      }}>
                        {selectedBorrowLog.purpose || 'No purpose specified'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Card: Check-in / Return details */}
                <div style={{
                  flex: '1 1 280px',
                  backgroundColor: isReturned ? 'rgba(34, 197, 94, 0.04)' : 'rgba(245, 158, 11, 0.04)',
                  border: isReturned ? '1px solid rgba(34, 197, 94, 0.15)' : '1px solid rgba(245, 158, 11, 0.15)',
                  borderRadius: 'var(--border-radius-lg)',
                  padding: '1.5rem',
                  position: 'relative',
                  zIndex: 1
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <div style={{
                      backgroundColor: isReturned ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: isReturned ? '#22c55e' : '#f59e0b',
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '1.1rem'
                    }}>
                      {isReturned ? '📥' : '⏳'}
                    </div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                      {isReturned ? 'Return Log' : 'Pending Return'}
                    </h4>
                  </div>

                  {isReturned ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Returned By</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{selectedBorrowLog.returnedByName || '—'}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Received By (Records Officer)</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{selectedBorrowLog.receivedBy || '—'}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time Returned</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                          {new Date(selectedBorrowLog.dateReturned).toLocaleString('en-US', {
                            month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>File Condition upon Return</div>
                        <div style={{ marginTop: '0.375rem' }}>
                          <Badge variant={
                            selectedBorrowLog.fileCondition === 'Complete' ? 'success' :
                              selectedBorrowLog.fileCondition === 'Incomplete' ? 'warning' : 'danger'
                          }>
                            {selectedBorrowLog.fileCondition || 'Complete'}
                          </Badge>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Remarks</div>
                        <div style={{
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          marginTop: '0.25rem',
                          fontSize: '0.875rem',
                          lineHeight: '1.4',
                          fontStyle: selectedBorrowLog.remarks ? 'normal' : 'italic'
                        }}>
                          {selectedBorrowLog.remarks || 'No remarks added'}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '80%',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      padding: '2rem 1rem'
                    }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
                      <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: 0 }}>This file is currently checked out.</p>
                      <p style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>No return details have been recorded yet.</p>
                    </div>
                  )}
                </div>

              </div>

            </div>
          );
        })()}
      </Modal>

      {/* Transferred Files Report Preview Modal */}
      <Modal
        isOpen={isTransferredReportPreviewOpen}
        onClose={() => setIsTransferredReportPreviewOpen(false)}
        title="Transferred 201 Files Report Preview & Export"
        size="xl"
        footer={
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="primary"
              style={{ background: '#10b981', borderColor: '#10b981' }}
              onClick={handleExportTransferredLogsToExcel}
            >
              <MdFileDownload style={{ marginRight: '0.35rem', fontSize: '1.1rem' }} /> Export Request (Excel)
            </Button>
          </div>
        }
      >
        <div className="printable-report" style={{
          fontFamily: "'Times New Roman', Times, serif",
          color: 'var(--text-primary)',
          backgroundColor: 'var(--bg-primary)',
          padding: '1rem',
          borderRadius: 'var(--border-radius)',
          border: '1px solid var(--border-color)',
          overflowX: 'auto',
          lineHeight: '1.3'
        }}>
          {(() => {
            const tabRows = filteredTransferredRows;
            const ROWS_PER_PAGE = 13;
            const pageCount = Math.max(1, Math.ceil(tabRows.length / ROWS_PER_PAGE));

            const headerBlock = (
              <div style={{
                border: '1px solid var(--border-color)',
                borderBottom: '2px solid var(--border-color)',
                padding: '10px 12px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '10.5pt', fontStyle: 'italic', fontWeight: 'normal' }}>Republic of the Philippines</div>
                <div style={{ fontSize: '11pt', fontWeight: 'bold', marginTop: '2px' }}>Province of Pangasinan</div>
                <div style={{ fontSize: '10pt', fontWeight: 'normal', marginTop: '2px' }}>Lingayen</div>
                <div style={{ fontSize: '11.5pt', fontWeight: 'bold', marginTop: '4px', fontFamily: 'Calibri, Arial, sans-serif' }}>HUMAN RESOURCE MGT. &amp; DEVELOPMENT OFFICE</div>
              </div>
            );

            const isTransferredMode = transferredStatusFilter === 'Transferred';
            const reportTitle = isTransferredMode 
              ? 'TRANSFERRED 201 FILES TO RSP REPORT'
              : 'TRANSFERRED AND RETURNED 201 FILES REPORT';

            const tableHeader = isTransferredMode ? (
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)' }}>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '4%' }}>NO.</th>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '13%' }}>EMPLOYEE NAME</th>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '12%' }}>OFFICE/HOSPITAL</th>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '11%' }}>POSITION / DESIGNATION</th>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '8%' }}>EMPLOYMENT STATUS</th>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '9%' }}>RELEASED BY</th>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '9%' }}>RECEIVED BY</th>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '6%' }}>DATE</th>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '5%' }}>TIME</th>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '8%' }}>RECORDS CONFORMED</th>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '7%' }}>FILE CONDITION</th>
                  <th style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '8%' }}>REMARKS</th>
                </tr>
              </thead>
            ) : (
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)' }}>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '3%' }}>NO.</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '9%' }}>EMPLOYEE NAME</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '8%' }}>OFFICE / HOSPITAL</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '8%' }}>POSITION / DESIGNATION</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '5.5%' }}>EMPLOYMENT STATUS</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '5.5%' }}>RELEASED BY</th>
                  <th colSpan={3} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '13%' }}>TRANSFERRED TO (RSP)</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '5%' }}>RECORDS CONFORMED</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '4.5%' }}>FILE CONDITION</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '5.5%' }}>REMARKS</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '4%' }}>STATUS</th>
                  <th colSpan={3} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '13%' }}>RETURNED BACK TO RECORDS</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '5%' }}>RECEIVED BY</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '5%' }}>RECORDS CONFORMED</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '4.5%' }}>RETURN CONDITION</th>
                  <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', fontSize: '8.5pt', textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold', width: '5.5%' }}>RETURN REMARKS</th>
                </tr>
                <tr style={{ backgroundColor: 'var(--bg-primary)' }}>
                  <th style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', fontWeight: 'bold', width: '5%', verticalAlign: 'middle' }}>RECEIVED BY</th>
                  <th style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', fontWeight: 'bold', width: '4%', verticalAlign: 'middle' }}>DATE</th>
                  <th style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', fontWeight: 'bold', width: '4%', verticalAlign: 'middle' }}>TIME</th>
                  <th style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', fontWeight: 'bold', width: '5%', verticalAlign: 'middle' }}>RETURNED BY</th>
                  <th style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', fontWeight: 'bold', width: '4%', verticalAlign: 'middle' }}>DATE</th>
                  <th style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', fontWeight: 'bold', width: '4%', verticalAlign: 'middle' }}>TIME</th>
                </tr>
              </thead>
            );

            if (tabRows.length === 0) {
              return (
                <>
                  {headerBlock}
                  <div style={{
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '11pt',
                    fontFamily: "'Times New Roman', Times, serif",
                    textTransform: 'uppercase',
                    padding: '8px 6px',
                    borderLeft: '1px solid #000',
                    borderRight: '1px solid #000',
                    borderBottom: '1px solid #000',
                    letterSpacing: '0.3px'
                  }}>{reportTitle}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Times New Roman', Times, serif", tableLayout: 'fixed' }}>
                    {tableHeader}
                    <tbody>
                      <tr>
                        <td colSpan={isTransferredMode ? 12 : 20} style={{ border: '1px solid #000', padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No records found.
                        </td>
                      </tr>
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
                  <div style={{
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '11pt',
                    fontFamily: "'Times New Roman', Times, serif",
                    textTransform: 'uppercase',
                    padding: '8px 6px',
                    borderLeft: '1px solid #000',
                    borderRight: '1px solid #000',
                    borderBottom: '1px solid #000',
                    letterSpacing: '0.3px'
                  }}>
                    {reportTitle}
                    {pageCount > 1 && (
                      <span style={{ fontSize: '9pt', fontWeight: 'normal', marginLeft: '10px', color: 'var(--text-secondary)' }}>
                        (Page {pageIdx + 1} of {pageCount})
                      </span>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Times New Roman', Times, serif", tableLayout: 'fixed' }}>
                    {tableHeader}
                    <tbody>
                      {pageRows.map((row, idx) => {
                        const globalIdx = pageIdx * ROWS_PER_PAGE + idx;
                        const emp = row.employee;
                        const empName = emp ? `${emp.lastName}, ${emp.firstName}` : row.employeeId;
                        const isReturned = row.action === 'return' || !!row.dateReturned;

                        if (isTransferredMode) {
                          return (
                            <tr key={globalIdx} style={{ backgroundColor: 'var(--bg-primary)' }}>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                                {globalIdx + 1}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                {empName}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                {getOfficeFullName(row.employee?.yellowBox?.office || row.employee?.officeName) || '—'}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                {row.employee?.position || '—'}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                                {row.employee?.status || '—'}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                                {row.releasedBy || '—'}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                {row.borrowerName || ''}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                                {row.dateBorrowed ? new Date(row.dateBorrowed).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : ''}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                                {row.dateBorrowed ? new Date(row.dateBorrowed).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                                {/* Records Conformed signature */}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle' }}>
                                {row.transferCondition || row.fileCondition || 'Complete'}
                              </td>
                              <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '9pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                {row.transferRemarks || row.purpose || (!row.dateReturned ? row.remarks : '') || '—'}
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={globalIdx} style={{ backgroundColor: 'var(--bg-primary)' }}>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {globalIdx + 1}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {empName}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {getOfficeFullName(row.employee?.yellowBox?.office || row.employee?.officeName) || '—'}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {row.employee?.position || '—'}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {row.employee?.status || '—'}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {row.releasedBy || '—'}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {row.borrowerName || ''}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {row.dateBorrowed ? new Date(row.dateBorrowed).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : ''}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {row.dateBorrowed ? new Date(row.dateBorrowed).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {/* Records Conformed Transfer */}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {row.transferCondition || row.fileCondition || 'Complete'}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {row.transferRemarks || row.purpose || (!row.dateReturned ? row.remarks : '') || '—'}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {isReturned ? 'Returned' : 'Transferred'}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {isReturned ? (row.returnedByName || '') : ''}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {isReturned && row.dateReturned ? new Date(row.dateReturned).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : ''}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {isReturned && row.dateReturned ? new Date(row.dateReturned).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {isReturned ? (row.receivedBy || '') : ''}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {/* Records Conformed Return */}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle' }}>
                              {isReturned ? (row.returnCondition || row.fileCondition || 'Complete') : ''}
                            </td>
                            <td style={{ border: '1px solid #000', padding: '3px 2px', fontSize: '8pt', textAlign: 'center', verticalAlign: 'middle', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {isReturned ? (row.returnRemarks || (row.dateReturned ? row.remarks : '') || '—') : ''}
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

      {/* TRANSFERRED DETAILS / TIMELINE MODAL */}
      <Modal
        isOpen={isTransferredDetailsModalOpen && !!selectedTransferredLog}
        onClose={() => {
          setIsTransferredDetailsModalOpen(false);
          setSelectedTransferredLog(null);
        }}
        title="201 File Transfer to RSP — Transaction Details"
        size="lg"
      >
        {selectedTransferredLog && (() => {
          const emp = selectedTransferredLog.employee;
          const isReturned = selectedTransferredLog.action === 'return' || !!selectedTransferredLog.dateReturned;
          const empFullName = emp
            ? `${emp.lastName}, ${emp.firstName} ${emp.middleName || ''} ${emp.nameExtension || ''}`.trim()
            : selectedTransferredLog.employeeId;

          return (
            <div className="borrow-details" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '0.5rem 0' }}>
              
              {/* Employee Summary Card */}
              <div style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius-lg)',
                padding: '1.25rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Employee (Owner)</div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>{empFullName}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>ID: {emp?.employeeIdNumber || selectedTransferredLog.employeeId}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Position & Office</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{emp?.position || '—'}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>{getOfficeFullName(emp?.yellowBox?.office || emp?.officeName) || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Employment Status</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{emp?.status || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overall File Status</div>
                  <div style={{ marginTop: '0.375rem' }}>
                    <Badge variant={isReturned ? 'success' : 'purple'}>
                      {isReturned ? 'Returned Back to Records' : 'Currently Transferred to RSP'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Two Column Transaction Timeline Cards */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1.5rem',
                position: 'relative'
              }}>

                {/* Left Card: Transfer to RSP details */}
                <div style={{
                  flex: '1 1 280px',
                  backgroundColor: 'rgba(59, 130, 246, 0.04)',
                  border: '1px solid rgba(59, 130, 246, 0.15)',
                  borderRadius: 'var(--border-radius-lg)',
                  padding: '1.5rem',
                  position: 'relative',
                  zIndex: 1
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <div style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      color: '#3b82f6',
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '1.1rem'
                    }}>
                      🔄
                    </div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Transfer to RSP Log</h4>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Received By (RSP Officer)</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{selectedTransferredLog.borrowerName || '—'}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time Transferred</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                        {new Date(selectedTransferredLog.dateBorrowed).toLocaleString('en-US', {
                          month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released By (Records Officer)</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{selectedTransferredLog.releasedBy || '—'}</div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>File Condition upon Transfer</div>
                      <div style={{ marginTop: '0.375rem' }}>
                        <Badge variant={
                          (selectedTransferredLog.transferCondition || selectedTransferredLog.fileCondition) === 'Complete' ? 'success' :
                            (selectedTransferredLog.transferCondition || selectedTransferredLog.fileCondition) === 'Incomplete' ? 'warning' : 'danger'
                        }>
                          {selectedTransferredLog.transferCondition || selectedTransferredLog.fileCondition || 'Complete'}
                        </Badge>
                      </div>
                    </div>

                    {(selectedTransferredLog.transferRemarks || selectedTransferredLog.purpose || (!selectedTransferredLog.dateReturned ? selectedTransferredLog.remarks : '')) && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Remarks / Purpose</div>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginTop: '0.25rem', fontSize: '0.875rem' }}>
                          {selectedTransferredLog.transferRemarks || selectedTransferredLog.purpose || (!selectedTransferredLog.dateReturned ? selectedTransferredLog.remarks : '')}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Card: Return from RSP details */}
                <div style={{
                  flex: '1 1 280px',
                  backgroundColor: isReturned ? 'rgba(16, 185, 129, 0.04)' : 'var(--bg-secondary)',
                  border: isReturned ? '1px solid rgba(16, 185, 129, 0.2)' : '1px dashed var(--border-color)',
                  borderRadius: 'var(--border-radius-lg)',
                  padding: '1.5rem',
                  position: 'relative',
                  zIndex: 1
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <div style={{
                      backgroundColor: isReturned ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-tertiary)',
                      color: isReturned ? '#10b981' : 'var(--text-secondary)',
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '1.1rem'
                    }}>
                      {isReturned ? '📥' : '⏳'}
                    </div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: isReturned ? 'var(--text-primary)' : 'var(--text-secondary)', margin: 0 }}>
                      {isReturned ? 'Return to Records Log' : 'Pending Return'}
                    </h4>
                  </div>

                  {isReturned ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Returned By (RSP Officer)</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{selectedTransferredLog.returnedByName || '—'}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Received By (Records Officer)</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{selectedTransferredLog.receivedBy || '—'}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time Returned</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                          {new Date(selectedTransferredLog.dateReturned).toLocaleString('en-US', {
                            month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>File Condition upon Return</div>
                        <div style={{ marginTop: '0.375rem' }}>
                          <Badge variant={
                            (selectedTransferredLog.returnCondition || selectedTransferredLog.fileCondition) === 'Complete' ? 'success' :
                              (selectedTransferredLog.returnCondition || selectedTransferredLog.fileCondition) === 'Incomplete' ? 'warning' : 'danger'
                          }>
                            {selectedTransferredLog.returnCondition || selectedTransferredLog.fileCondition || 'Complete'}
                          </Badge>
                        </div>
                      </div>

                      {(selectedTransferredLog.returnRemarks || (selectedTransferredLog.dateReturned ? selectedTransferredLog.remarks : '')) && (
                        <div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Remarks</div>
                          <div style={{
                            fontWeight: 500,
                            color: 'var(--text-primary)',
                            marginTop: '0.25rem',
                            fontSize: '0.875rem',
                            lineHeight: '1.4'
                          }}>
                            {selectedTransferredLog.remarks}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '80%',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      padding: '2rem 1rem'
                    }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
                      <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: 0 }}>This file is currently transferred to RSP.</p>
                      <p style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>No return back to records has been logged yet.</p>
                    </div>
                  )}
                </div>

              </div>

            </div>
          );
        })()}
      </Modal>

      {/* Delete Transferred Confirmation Modal */}
      <Modal
        isOpen={isDeleteTransferredConfirmOpen}
        onClose={() => {
          if (!isDeletingTransferred) {
            setIsDeleteTransferredConfirmOpen(false);
            setPendingDeleteTransferredIds([]);
          }
        }}
        title="Confirm Deletion Request — Transferred 201 Files Log"
        size="md"
        footer={
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="ghost"
              onClick={() => {
                setIsDeleteTransferredConfirmOpen(false);
                setPendingDeleteTransferredIds([]);
              }}
              disabled={isDeletingTransferred}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDeleteTransferredEntries}
              loading={isDeletingTransferred}
            >
              <MdDeleteOutline /> Submit Delete Request
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '12px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 'var(--border-radius)',
          }}>
            <MdWarning style={{ fontSize: '1.4rem', color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ display: 'block', fontSize: '0.875rem', color: '#ef4444', marginBottom: '2px' }}>
                Permanent Removal Warning
              </strong>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                You are requesting deletion of <strong>{pendingDeleteTransferredIds.length}</strong> transferred file transaction log(s).
              </p>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '6px',
              borderBottom: '1px solid var(--border-color)',
            }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
                Selected Transferred File Records
              </span>
              <Badge variant="danger" size="sm">
                {pendingDeleteTransferredIds.length} {pendingDeleteTransferredIds.length === 1 ? 'RECORD' : 'RECORDS'}
              </Badge>
            </div>

            <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              {pendingDeleteTransferredIds.slice(0, 6).map((id) => {
                const row = transferredLogs.find((r) => r.id === id);
                const emp = row?.employee;
                const empName = emp ? `${emp.lastName}, ${emp.firstName}` : (row?.employeeId || 'N/A');
                return (
                  <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem', padding: '4px 0', borderBottom: '1px dashed var(--border-color)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{empName}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      Transferred to: {row?.borrowerName || 'RSP'} • {row?.dateBorrowed ? new Date(row.dateBorrowed).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                );
              })}
              {pendingDeleteTransferredIds.length > 6 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', paddingTop: '4px' }}>
                  + and {pendingDeleteTransferredIds.length - 6} more records
                </div>
              )}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            This deletion request will be submitted to a Super Admin or Developer for review in the Approvals queue.
          </p>
        </div>
      </Modal>
    </div>
  );
}

export default Dashboard;
