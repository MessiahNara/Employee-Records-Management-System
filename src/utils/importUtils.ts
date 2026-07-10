import * as XLSX from 'xlsx';
import {
  ImportedEmployee,
  ImportValidationError,
  ImportPreviewData,
} from '../types/importExport';
import { Gender, AppointmentStatus, EmployeeStatus } from '../types/employee';

/**
 * Parse an imported file (Excel or CSV) and return preview data with validation
 * @param file - The file to parse
 * @returns Promise resolving to preview data with valid and invalid records
 */
export async function parseImportFile(file: File): Promise<ImportPreviewData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('Failed to read file'));
          return;
        }

        // Parse the file using xlsx
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

        // Validate and categorize records
        const validRecords: ImportedEmployee[] = [];
        const invalidRecords: Array<{ data: ImportedEmployee; errors: ImportValidationError[] }> = [];

        rawData.forEach((row, index) => {
          const mappedEmployee = mapRowToEmployee(row);
          const errors = validateImportedEmployee(mappedEmployee, index + 2); // +2 for header row and 0-index

          if (errors.length === 0) {
            validRecords.push(mappedEmployee);
          } else {
            invalidRecords.push({ data: mappedEmployee, errors });
          }
        });

        resolve({ validRecords, invalidRecords });
      } catch (error) {
        reject(new Error('Failed to parse file. Please check the file format.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Validate an imported employee record
 * @param data - The employee data to validate
 * @param rowIndex - The row number in the Excel file (for error messages)
 * @returns Array of validation errors (empty if valid)
 */
export function validateImportedEmployee(
  data: ImportedEmployee,
  rowIndex: number
): ImportValidationError[] {
  const errors: ImportValidationError[] = [];

  if (!data.id || data.id.trim() === '') {
    errors.push({ row: rowIndex, field: 'id', message: 'Employee ID is required' });
  }

  if (!data.lastName || data.lastName.trim() === '') {
    errors.push({ row: rowIndex, field: 'lastName', message: 'Last name is required' });
  }

  if (!data.firstName || data.firstName.trim() === '') {
    errors.push({ row: rowIndex, field: 'firstName', message: 'First name is required' });
  }

  // Middle name is optional — no validation

  if (!data.dateOfBirth || !isValidDate(data.dateOfBirth)) {
    errors.push({ row: rowIndex, field: 'dateOfBirth', message: 'Date of Birth is required and must be a valid date (YYYY-MM-DD)' });
  }

  // Gender is optional — no validation

  if (!data.officeHospitalName || data.officeHospitalName.trim() === '') {
    errors.push({ row: rowIndex, field: 'officeHospitalName', message: 'Office/Hospital name is required' });
  }

  if (!data.appointmentStatus || data.appointmentStatus.trim() === '') {
    errors.push({ row: rowIndex, field: 'appointmentStatus', message: 'Appointment status is required' });
  }

  if (!data.status || !['Active', 'Inactive'].includes(data.status)) {
    errors.push({ row: rowIndex, field: 'status', message: 'Status must be Active or Inactive' });
  }

  return errors;
}

/**
 * Map a raw row from Excel/CSV to ImportedEmployee format
 * @param row - Raw row data from xlsx
 * @returns Mapped employee object
 */
export function mapRowToEmployee(row: any): ImportedEmployee {
  return {
    id: String(row['Employee ID'] || '').trim() || undefined,
    lastName: String(row['Last Name'] || '').trim(),
    firstName: String(row['First Name'] || '').trim(),
    middleName: String(row['Middle Name'] || '').trim(),
    dateOfBirth: row['Date of Birth'] ? formatDateFromExcel(row['Date of Birth']) : '',
    gender: String(row['Gender'] || '').trim() as Gender | '',
    officeHospitalName: String(row['Office / Hospital Name'] || row['Office/Hospital Name'] || '').trim(),
    appointmentStatus: String(row['Appointment Status'] || '').trim() as AppointmentStatus | '',
    appointmentFrom: row['Appointment From'] ? formatDateFromExcel(row['Appointment From']) : '',
    appointmentTo: row['Appointment To'] ? formatDateFromExcel(row['Appointment To']) : '',
    status: (String(row['Status'] || 'Active').trim() as EmployeeStatus) || 'Active',
    positionFunction: String(row['Position / Function'] || row['Position/Function'] || '').trim(),
    dateOfEmployment: row['Date of Employment'] ? formatDateFromExcel(row['Date of Employment']) : '',
    dateOfSeparation: row['Date of Separation'] ? formatDateFromExcel(row['Date of Separation']) : '',
    reasonForSeparation: String(row['Reason for Separation'] || '').trim(),
  };
}

/**
 * Check if a date string is valid
 * @param dateString - Date string to validate
 * @returns True if valid date
 */
export function isValidDate(dateString: string): boolean {
  if (!dateString) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Format date from Excel serial number or string to YYYY-MM-DD
 * Supports DD/MM/YYYY, MM/DD/YYYY, and Excel serial numbers
 * @param value - Date value from Excel (can be serial number or string)
 * @returns Formatted date string in YYYY-MM-DD format
 */
function formatDateFromExcel(value: any): string {
  if (!value) return '';

  // If it's already a string, try to parse it
  if (typeof value === 'string') {
    const trimmed = value.trim();
    
    // Check for DD/MM/YYYY format
    const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyyMatch) {
      const [, day, month, year] = ddmmyyyyMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Try parsing as standard date
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    
    return trimmed;
  }

  // If it's an Excel serial number
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const year = date.y;
      const month = String(date.m).padStart(2, '0');
      const day = String(date.d).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  return '';
}
