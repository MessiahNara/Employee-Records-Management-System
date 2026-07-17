import { useState, useEffect } from 'react';
import { EmployeeDocument, DocumentCategory } from '../types/document';
import { getAuthState } from '../utils/mockAuth';
import api from '../services/api';

interface UsePDFDocumentsReturn {
  documents: EmployeeDocument[];
  loading: boolean;
  error: string | null;
  uploadDocument: (file: File, category: DocumentCategory, aoData?: any, skipRefresh?: boolean, replace?: boolean) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  getDocumentData: (documentId: string) => string | null;
  refreshDocuments: () => void;
}

// Helper to validate PDF file
const validatePDFFile = (file: File): { valid: boolean; error?: string } => {
  if (!file) return { valid: false, error: 'No file selected' };
  if (file.type !== 'application/pdf') return { valid: false, error: 'Only PDF files are allowed' };
  if (!file.name.toLowerCase().endsWith('.pdf')) return { valid: false, error: 'File must have .pdf extension' };
  if (file.size === 0) return { valid: false, error: 'File is empty' };
  return { valid: true };
};

export function usePDFDocuments(employeeId: string, employeeName: string): UsePDFDocumentsReturn {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load documents from API
  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const docs = await api.document.getByEmployee(employeeId);
      
      // Map API response to EmployeeDocument format
      const mappedDocs: EmployeeDocument[] = docs.map((doc: any) => ({
        id: doc.id,
        fileName: doc.fileName,
        category: doc.category as DocumentCategory,
        uploadedAt: doc.createdAt,
        uploadedBy: doc.uploadedBy || 'Unknown',
        fileSize: Math.round(doc.fileSize / 1024), // Convert bytes to KB
        aoNumber: doc.aoNumber || undefined,
        aoYear: doc.aoYear || undefined,
        aoType: doc.aoType || undefined,
        detailedTo: doc.detailedTo || undefined,
        detailedDivision: doc.detailedDivision || undefined,
        detailedFunction: doc.detailedFunction || undefined,
        detailedDate: doc.detailedDate || undefined,
        designatedPositionFunction: doc.designatedPositionFunction || undefined,
        designatedOrderFrom: doc.designatedOrderFrom || undefined,
        designatedOrderTo: doc.designatedOrderTo || undefined,
        appointmentFrom: doc.appointmentFrom || undefined,
        appointmentTo: doc.appointmentTo || undefined,
      }));
      
      setDocuments(mappedDocs);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [employeeId]);

  // Upload a new document
  const uploadDocument = async (
    file: File,
    category: DocumentCategory,
    aoData?: any,
    skipRefresh = false,
    replace = false
  ): Promise<void> => {
    // Validate file before entering try-catch
    const validation = validatePDFFile(file);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid file');
    }

    try {
      const currentUser = getAuthState();

      await api.document.upload(
        file,
        {
          employeeId,
          employeeName,
          category,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          replace,
          ...aoData
        },
        currentUser?.id,
        currentUser?.name ||
          [currentUser?.lastName, currentUser?.firstName].filter(Boolean).join(', ') ||
          currentUser?.username ||
          'Unknown'
      );

      if (!skipRefresh) {
        try {
          await loadDocuments();
        } catch (refreshErr) {
          console.warn('Failed to refresh documents after upload:', refreshErr);
        }
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      throw new Error(err.message || 'Failed to upload document');
    }
  };

  // Delete a document
  const deleteDocument = async (documentId: string): Promise<void> => {
    try {
      await api.document.delete(documentId);
      
      // Refresh documents list (don't let refresh errors affect delete success)
      try {
        await loadDocuments();
      } catch (refreshErr) {
        console.warn('Failed to refresh documents after delete:', refreshErr);
        // Don't throw - delete was successful
      }
      
      // Success - no error thrown
    } catch (err: any) {
      console.error('Delete error:', err);
      const errorMessage = err.message || 'Failed to delete document';
      throw new Error(errorMessage);
    }
  };

  // Get PDF data for viewing
  const getDocumentData = (): string | null => {
    // Since we need to fetch from API, we'll need to make this async
    // For now, return null and handle in the component
    return null;
  };

  // Refresh documents manually
  const refreshDocuments = () => {
    loadDocuments();
  };

  return {
    documents,
    loading,
    error,
    uploadDocument,
    deleteDocument,
    getDocumentData,
    refreshDocuments
  };
}
