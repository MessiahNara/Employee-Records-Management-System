import { Gender, AppointmentStatus, EmployeeStatus } from './employee';

// Import-related types
export interface ImportedEmployee {
  id?: string; // Employee ID - optional for new imports, required for updates
  lastName: string;
  firstName: string;
  middleName: string;
  dateOfBirth?: string; // Date of Birth - optional
  gender: Gender | '';
  officeHospitalName: string;
  appointmentStatus: AppointmentStatus | '';
  appointmentFrom?: string;
  appointmentTo?: string;
  status: EmployeeStatus;
  positionFunction: string;
  dateOfEmployment?: string;
  dateOfSeparation?: string;
  reasonForSeparation?: string;
}

export interface ImportValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ImportPreviewData {
  validRecords: ImportedEmployee[];
  invalidRecords: Array<{
    data: ImportedEmployee;
    errors: ImportValidationError[];
  }>;
}

// Export-related types
export type ExportFormat = 'xlsx' | 'csv';

export interface ExportOptions {
  format: ExportFormat;
  filename: string;
  includeInactive?: boolean;
}

// Template column mapping
export interface TemplateColumn {
  header: string;
  field: keyof ImportedEmployee;
  required: boolean;
  example?: string;
}
