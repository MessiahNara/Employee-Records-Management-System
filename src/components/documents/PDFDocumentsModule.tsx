import { useState, useMemo } from 'react';
import { DocumentCategory, DOCUMENT_FOLDERS, EmployeeDocument } from '../../types/document';
import { usePDFDocuments } from '../../hooks/usePDFDocuments';
import { getAuthState } from '../../utils/mockAuth';
import { useToast } from '../../contexts/ToastContext';
import api, { getServerBaseUrl } from '../../services/api';
import CategoryTabs from './CategoryTabs';
import DocumentList from './DocumentList';
import UploadModal from './UploadModal';
import PDFViewer from './PDFViewer';
import Button from '../ui/Button';
import Card from '../ui/Card';
import './PDFDocumentsModule.css';

interface PDFDocumentsModuleProps {
  employeeId: string;
  employeeName: string;
}

function PDFDocumentsModule({ employeeId, employeeName }: PDFDocumentsModuleProps) {
  const [activeCategory, setActiveCategory] = useState<DocumentCategory>('Personal Information');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<EmployeeDocument | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [pdfData, setPdfData] = useState<string | null>(null);
  const { showToast } = useToast();

  const {
    documents,
    loading,
    error,
    uploadDocument,
    refreshDocuments,
  } = usePDFDocuments(employeeId, employeeName);

  // Get current user role
  const currentUser = getAuthState();
  const userRole = currentUser?.role || 'viewer';
  const canDownloadOrPrint = userRole === 'superadmin' || userRole === 'developer' || userRole === 'admin';
  
  // Check permissions based on role and custom permissions
  const getUserPermissions = () => {
    if (userRole === 'superadmin' || userRole === 'developer') {
      return { create: true, update: true, delete: true };
    }
    if ((userRole === 'admin' || userRole === 'staff') && currentUser?.permissions) {
      return currentUser.permissions;
    }
    return { create: false, update: false, delete: false };
  };
  
  const permissions = getUserPermissions();
  const canUpload = permissions.create;
  const canDelete = permissions.delete;

  // Filter documents by active category
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => doc.category === activeCategory);
  }, [documents, activeCategory]);

  // Calculate document counts per category
  const documentCounts = useMemo(() => {
    const counts: Record<DocumentCategory, number> = {
      'Personal Information': 0,
      'Personnel Action / Appointment': 0,
      'Position / Job Description': 0,
      'Training': 0,
      'Performance / Awards & Recognition': 0,
      'Employee Discipline': 0,
      'Administrative Order': 0
    };

    documents.forEach(doc => {
      counts[doc.category]++;
    });

    return counts;
  }, [documents]);

  // Checkbox selection handlers
  const handleSelectAll = () => {
    if (selectedDocumentIds.size === filteredDocuments.length) {
      // Deselect all
      setSelectedDocumentIds(new Set());
    } else {
      // Select all in current category
      const allIds = new Set(filteredDocuments.map(doc => doc.id));
      setSelectedDocumentIds(allIds);
    }
  };

  const handleSelectDocument = (documentId: string) => {
    const newSelected = new Set(selectedDocumentIds);
    if (newSelected.has(documentId)) {
      newSelected.delete(documentId);
    } else {
      newSelected.add(documentId);
    }
    setSelectedDocumentIds(newSelected);
  };

  const isAllSelected = filteredDocuments.length > 0 && selectedDocumentIds.size === filteredDocuments.length;
  const isSomeSelected = selectedDocumentIds.size > 0 && selectedDocumentIds.size < filteredDocuments.length;

  // Get selected documents info for bulk delete
  const selectedDocuments = documents.filter(doc => selectedDocumentIds.has(doc.id));

  const handleUpload = async (files: File[], category: DocumentCategory) => {
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadDocument(files[i], category);
      }
      setActiveCategory(category);
      showToast(
        files.length > 1
          ? `${files.length} documents uploaded successfully!`
          : 'Document uploaded successfully!',
        'success'
      );
    } catch (err: any) {
      console.error('PDFDocumentsModule: Upload failed:', err);
      throw err;
    }
  };

  const handleView = (document: EmployeeDocument) => {
    setSelectedDocument(document);
    setIsViewerOpen(true);
    // Build URL pointing to the server file endpoint
    setPdfData(`${getServerBaseUrl()}/api/documents/${document.id}/file`);
  };

  const handleOpenDeleteConfirm = async (documentId: string) => {
    const doc = documents.find(d => d.id === documentId);
    try {
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName}, ${currentUser?.firstName}`,
        action: 'delete_document',
        entityType: 'document',
        entityId: documentId,
        entityName: doc?.fileName || documentId,
        payload: { id: documentId, fileName: doc?.fileName, category: doc?.category },
      });
      showToast('✅ Delete request submitted. Go to Approvals to review and execute.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit approval request.', 'error');
    }
  };

  const handleOpenBulkDeleteConfirm = async () => {
    if (selectedDocumentIds.size === 0) {
      showToast('Please select at least one document to delete.', 'warning');
      return;
    }
    const idsArray = Array.from(selectedDocumentIds);
    const documentNames = selectedDocuments.map(doc => ({ fileName: doc.fileName, category: doc.category }));
    try {
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName}, ${currentUser?.firstName}`,
        action: 'bulk_delete_document',
        entityType: 'document',
        entityId: 'bulk',
        entityName: `${idsArray.length} documents`,
        payload: { ids: idsArray, documentNames },
      });
      showToast('✅ Bulk delete request submitted. Go to Approvals to review and execute.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit approval request.', 'error');
    }
  };

  const handleCloseViewer = () => {
    setIsViewerOpen(false);
    setSelectedDocument(null);
    setPdfData(null);
  };

  return (
    <Card>
      <div className="pdf-documents-module">
        <div className="pdf-documents-module__header">
          <h2 className="pdf-documents-module__title">Documents</h2>
          {canUpload && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsUploadModalOpen(true)}
            >
              📤 Upload Document
            </Button>
          )}
        </div>

        {error && (
          <div className="pdf-documents-module__error">
            ⚠️ {error}
          </div>
        )}

        <CategoryTabs
          categories={DOCUMENT_FOLDERS}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          documentCounts={documentCounts}
        />

        {/* Bulk Actions Bar */}
        {canDelete && selectedDocumentIds.size > 0 && (
          <div className="pdf-documents-module__bulk-actions">
            <div className="pdf-documents-module__bulk-info">
              <span className="pdf-documents-module__bulk-count">{selectedDocumentIds.size} selected</span>
              <button
                className="pdf-documents-module__bulk-clear"
                onClick={() => setSelectedDocumentIds(new Set())}
              >
                Clear selection
              </button>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={handleOpenBulkDeleteConfirm}
            >
              🗑️ Delete Selected ({selectedDocumentIds.size})
            </Button>
          </div>
        )}

        <DocumentList
          documents={filteredDocuments}
          onView={handleView}
          onDelete={handleOpenDeleteConfirm}
          canDelete={canDelete}
          loading={loading}
          selectedIds={selectedDocumentIds}
          onSelectAll={handleSelectAll}
          onSelectDocument={handleSelectDocument}
          isAllSelected={isAllSelected}
          isSomeSelected={isSomeSelected}
        />

        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onUpload={handleUpload}
          defaultCategory={activeCategory}
        />

        <PDFViewer
          isOpen={isViewerOpen}
          onClose={handleCloseViewer}
          document={selectedDocument}
          pdfData={pdfData}
          canDownloadOrPrint={canDownloadOrPrint}
        />

      </div>
    </Card>
  );
}

export default PDFDocumentsModule;
