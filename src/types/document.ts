export type DocumentCategory =
  | 'Personal Information'
  | 'Personnel Action / Appointment'
  | 'Position / Job Description'
  | 'Assumptions of Duties / Oath of Office'
  | 'Training'
  | 'Performance / Awards & Recognition'
  | 'Employee Discipline'
  | 'Administrative Order';

export interface EmployeeDocument {
  id: string;
  fileName: string;
  category: DocumentCategory;
  uploadedAt: string;
  uploadedBy: string;
  fileSize: number; // in KB
  aoNumber?: string;
  aoYear?: string;
  aoType?: string;
  detailedTo?: string;
  detailedDivision?: string;
  detailedFunction?: string;
  detailedDate?: string;
  detailedOrderFrom?: string;
  detailedOrderTo?: string;
  designatedPositionFunction?: string;
  designatedOrderFrom?: string;
  designatedOrderTo?: string;
  appointmentFrom?: string;
  appointmentTo?: string;
}

export interface DocumentFolder {
  category: DocumentCategory;
  icon: string;
  description: string;
}

export interface PDFDocumentStorage {
  id: string;
  employeeId: string;
  document: EmployeeDocument;
  pdfData: string; // base64 encoded PDF content
}

export interface PDFDocumentsStore {
  documents: PDFDocumentStorage[];
  version: string; // For future migrations
}

export interface PDFDocument {
  id: string;
  employeeId: string;
  fileName: string;
  category: DocumentCategory;
  uploadedAt: string;
  uploadedBy: string;
  fileSize: number;
  fileData: string; // base64 encoded PDF content
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export const DOCUMENT_FOLDERS: DocumentFolder[] = [
  {
    category: 'Personal Information',
    icon: '👤',
    description: 'Birth certificates, IDs, personal records'
  },
  {
    category: 'Personnel Action / Appointment',
    icon: '📋',
    description: 'Appointment letters, promotions, transfers'
  },
  {
    category: 'Position / Job Description',
    icon: '💼',
    description: 'Job descriptions, position papers'
  },
  {
    category: 'Assumptions of Duties / Oath of Office',
    icon: '✍️',
    description: 'Assumptions of duties and oath of office files'
  },
  {
    category: 'Training',
    icon: '📚',
    description: 'Training certificates, seminars, workshops'
  },
  {
    category: 'Performance / Awards & Recognition',
    icon: '🏆',
    description: 'Performance reviews, awards, recognitions'
  },
  {
    category: 'Employee Discipline',
    icon: '⚖️',
    description: 'Disciplinary actions, warnings, resolutions'
  },
  {
    category: 'Administrative Order',
    icon: '📜',
    description: 'Administrative orders, directives, memorandums'
  }
];
