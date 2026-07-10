import JSZip from 'jszip';
import { Employee } from '../types/employee';
import { PDFDocument } from '../types/document';
import api from '../services/api';

/**
 * Get all PDF documents from the database
 * @param fromDate - Optional start date in DD/MM/YYYY format
 * @param toDate - Optional end date in DD/MM/YYYY format
 * @returns Promise that resolves to array of all PDF documents with their data
 */
export async function getAllPDFDocuments(fromDate?: string, toDate?: string): Promise<PDFDocument[]> {
  try {
    // Fetch all documents from the API with optional date filters
    const filters: any = {};
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;
    
    const documents = await api.document.getAll(filters);
    
    // Map API response to PDFDocument format
    return documents.map((doc: any) => ({
      id: doc.id,
      employeeId: doc.employeeId,
      fileName: doc.fileName,
      category: doc.category,
      uploadedAt: doc.createdAt,
      uploadedBy: 'User', // TODO: Get from user data when available
      fileSize: Math.round(doc.fileSize / 1024), // Convert bytes to KB
      fileData: doc.filePath, // filePath contains the base64 data
    }));
  } catch (error) {
    console.error('Failed to load documents from database:', error);
    return [];
  }
}

/**
 * Generate a complete backup ZIP file containing employee data and all PDF documents
 * 
 * The backup structure:
 * - employees.json (selected employee data only)
 * - documents/
 *   - [EmployeeName]/
 *     - Personal_Information/
 *       - document1.pdf
 *       - document2.pdf
 *     - Personnel_Action_Appointment/
 *       - document3.pdf
 *     - ... (other categories)
 * 
 * @param employees - Array of selected employees to backup
 * @param fromDate - Optional start date in DD/MM/YYYY format
 * @param toDate - Optional end date in DD/MM/YYYY format
 * @returns Promise that resolves when backup is complete
 */
export async function generateBackup(employees: Employee[], fromDate?: string, toDate?: string): Promise<void> {
  const zip = new JSZip();

  // Add employee data as JSON (only selected employees)
  const employeeData = JSON.stringify(employees, null, 2);
  zip.file('employees.json', employeeData);

  // Get all documents from the database with optional date filters
  const allDocuments = await getAllPDFDocuments(fromDate, toDate);

  // Create a Set of selected employee IDs for fast lookup
  const selectedEmployeeIds = new Set(employees.map(emp => emp.id));

  // Filter documents to only include those belonging to selected employees
  const selectedDocuments = allDocuments.filter(doc => 
    selectedEmployeeIds.has(doc.employeeId)
  );

  // If no documents for selected employees, still create the ZIP with employees.json
  if (selectedDocuments.length === 0) {
    console.log('No documents found for selected employees');
    // Generate ZIP file with just employees.json
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const filename = `employee-backup-${new Date().toISOString().split('T')[0]}.zip`;
    downloadBlob(zipBlob, filename);
    return;
  }

  // Create documents folder
  const documentsFolder = zip.folder('documents');

  if (!documentsFolder) {
    throw new Error('Failed to create documents folder');
  }

  // Organize documents by employee and category (only for selected employees)
  const documentsByEmployee = groupDocumentsByEmployee(selectedDocuments);

  for (const [employeeId, documents] of Object.entries(documentsByEmployee)) {
    // Find employee name from selected employees
    const employee = employees.find((e) => e.id === employeeId);
    
    if (!employee) {
      console.warn(`Employee ${employeeId} not found in selected employees, skipping...`);
      continue;
    }

    const employeeName = `${employee.lastName}_${employee.firstName}`.replace(/\s+/g, '_');

    // Create employee folder
    const employeeFolder = documentsFolder.folder(employeeName);

    if (!employeeFolder) continue;

    // Group documents by category
    const documentsByCategory = groupDocumentsByCategory(documents);

    for (const [category, categoryDocs] of Object.entries(documentsByCategory)) {
      // Sanitize category name: replace spaces with underscores and remove/replace slashes
      // This ensures "Personnel Action / Appointment" becomes "Personnel_Action_Appointment"
      // instead of creating nested folders
      const sanitizedCategory = category
        .replace(/\s*\/\s*/g, '_')  // Replace " / " with "_"
        .replace(/\s+/g, '_');       // Replace remaining spaces with "_"
      
      // Create category folder
      const categoryFolder = employeeFolder.folder(sanitizedCategory);

      if (!categoryFolder) continue;

      // Add each document to the category folder
      for (const doc of categoryDocs) {
        try {
          // Convert base64 to binary
          const base64Data = doc.fileData.split(',')[1];
          const binaryData = base64ToBlob(base64Data);
          categoryFolder.file(doc.fileName, binaryData);
        } catch (error) {
          console.error(`Failed to add document ${doc.fileName}:`, error);
        }
      }
    }
  }

  // Generate ZIP file
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Trigger download
  const filename = `employee-backup-${new Date().toISOString().split('T')[0]}.zip`;
  downloadBlob(zipBlob, filename);
}

/**
 * Group documents by employee ID
 */
function groupDocumentsByEmployee(documents: PDFDocument[]): Record<string, PDFDocument[]> {
  return documents.reduce((acc, doc) => {
    if (!acc[doc.employeeId]) {
      acc[doc.employeeId] = [];
    }
    acc[doc.employeeId].push(doc);
    return acc;
  }, {} as Record<string, PDFDocument[]>);
}

/**
 * Group documents by category
 */
function groupDocumentsByCategory(documents: PDFDocument[]): Record<string, PDFDocument[]> {
  return documents.reduce((acc, doc) => {
    if (!acc[doc.category]) {
      acc[doc.category] = [];
    }
    acc[doc.category].push(doc);
    return acc;
  }, {} as Record<string, PDFDocument[]>);
}

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64: string): Blob {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * Trigger download of a Blob
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
