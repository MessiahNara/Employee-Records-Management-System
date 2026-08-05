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
import Modal from '../ui/Modal';
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
  const [isFolderUploading, setIsFolderUploading] = useState(false);
  const [folderUploadProgress, setFolderUploadProgress] = useState<string | null>(null);
  const [folderUploadConfirm, setFolderUploadConfirm] = useState<{ files: File[] } | null>(null);
  const [folderCompressionLevel, setFolderCompressionLevel] = useState<'extreme' | 'recommended' | 'less'>('recommended');
  const [duplicateConfirm, setDuplicateConfirm] = useState<{
    fileName: string;
    onResolve: (action: 'replace' | 'skip', applyToAll: boolean) => void;
  } | null>(null);
  const { showToast } = useToast();

  const promptDuplicate = (fileName: string): Promise<{ action: 'replace' | 'skip'; applyToAll: boolean }> => {
    return new Promise((resolve) => {
      setDuplicateConfirm({
        fileName,
        onResolve: (action, applyToAll) => {
          setDuplicateConfirm(null);
          resolve({ action, applyToAll });
        }
      });
    });
  };

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
      'Assumptions of Duties / Oath of Office': 0,
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

  const handleUpload = async (files: File[], category: DocumentCategory, aoData?: any, compressionLevel: string = 'recommended', onProgress?: (progressText: string) => void) => {
    try {
      let globalDuplicateAction: 'replace' | 'skip' | null = null;
      let uploadedCount = 0;
      let canceledCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isDuplicate = documents.some(
          (doc) => doc.fileName.toLowerCase() === file.name.toLowerCase() &&
                   doc.category.toLowerCase() === category.toLowerCase()
        );

        let replace = false;
        if (isDuplicate) {
          if (globalDuplicateAction === 'skip') {
            canceledCount++;
            continue;
          }
          if (globalDuplicateAction === 'replace') {
            replace = true;
          } else {
            const result = await promptDuplicate(file.name);
            if (result.applyToAll) {
              globalDuplicateAction = result.action;
            }
            if (result.action === 'skip') {
              canceledCount++;
              continue;
            }
            replace = true;
          }
        }

        await uploadDocument(file, category, aoData, true, replace, compressionLevel, (e: ProgressEvent) => {
          if (onProgress) {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              onProgress(`Uploading ${file.name}... ${percent}%`);
            } else {
              onProgress(`Uploading ${file.name}...`);
            }
          }
        });
        uploadedCount++;
      }

      setActiveCategory(category);

      if (uploadedCount > 0) {
        showToast(
          `Uploaded ${uploadedCount} document(s) successfully.${canceledCount > 0 ? ` Canceled ${canceledCount} duplicate(s).` : ''}`,
          'success'
        );
      } else if (canceledCount > 0) {
        showToast(`Upload canceled: ${canceledCount} duplicate file(s) skipped.`, 'info');
      }

      // We skipped refresh during the loop, now refresh once globally
      refreshDocuments();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('employeeUpdated'));
        window.dispatchEvent(new Event('documentsUpdated'));
      }
    } catch (err: any) {
      console.error('PDFDocumentsModule: Upload failed:', err);
      showToast(err.message || 'Failed to upload document', 'error');
    }
  };

  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Filter only PDF files
    const pdfFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      showToast('No PDF files found in the selected folder.', 'warning');
      return;
    }

    setFolderUploadConfirm({ files: pdfFiles });
    // Reset input so the same folder can be picked again if needed
    e.target.value = '';
  };

  const executeFolderUpload = async () => {
    if (!folderUploadConfirm) return;
    const pdfFiles = folderUploadConfirm.files;
    setFolderUploadConfirm(null);
    
    setIsFolderUploading(true);
    let successCount = 0;
    let failCount = 0;
    let canceledCount = 0;

    // Define category mappings matching folder names
    const getCategoryFromPath = (pathString: string): DocumentCategory => {
      const normalizedPath = pathString.replace(/\\/g, '/');
      const parts = normalizedPath.split('/');
      
      // The category folder is the immediate parent of the file, which is parts[parts.length - 2]
      if (parts.length < 2) return activeCategory;
      const parentDir = parts[parts.length - 2].toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

      if (parentDir.includes('personalinformation')) return 'Personal Information';
      if (parentDir.includes('personnelaction') || parentDir.includes('appointment')) return 'Personnel Action / Appointment';
      if (parentDir.includes('position') || parentDir.includes('jobdescription')) return 'Position / Job Description';
      if (parentDir.includes('training')) return 'Training';
      if (parentDir.includes('performance') || parentDir.includes('awards') || parentDir.includes('recognition')) return 'Performance / Awards & Recognition';
      if (parentDir.includes('discipline')) return 'Employee Discipline';
      if (parentDir.includes('administrative') || parentDir.includes('order')) return 'Administrative Order';
      if (parentDir.includes('assumption') || parentDir.includes('oath')) return 'Assumptions of Duties / Oath of Office';

      return activeCategory;
    };

    try {
      let globalDuplicateAction: 'replace' | 'skip' | null = null;
      
      const totalFiles = pdfFiles.length;
      let currentIndex = 0;

      for (const file of pdfFiles) {
        const relPath = file.webkitRelativePath || file.name;
        const resolvedCategory = getCategoryFromPath(relPath);

        // Skip Administrative Order category in folder upload
        if (resolvedCategory === 'Administrative Order') {
          console.log(`Skipping Administrative Order document from folder scan: ${file.name}`);
          continue;
        }

        const isDuplicate = documents.some(
          (doc) => doc.fileName.toLowerCase() === file.name.toLowerCase() &&
                   doc.category.toLowerCase() === resolvedCategory.toLowerCase()
        );

        let replace = false;
        if (isDuplicate) {
          if (globalDuplicateAction === 'skip') {
            canceledCount++;
            continue;
          }
          if (globalDuplicateAction === 'replace') {
            replace = true;
          } else {
            const result = await promptDuplicate(file.name);
            if (result.applyToAll) {
              globalDuplicateAction = result.action;
            }
            if (result.action === 'skip') {
              canceledCount++;
              continue;
            }
            replace = true;
          }
        }

        try {
          currentIndex++;
          await uploadDocument(file, resolvedCategory, undefined, true, replace, folderCompressionLevel, (e: ProgressEvent) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              setFolderUploadProgress(`File ${currentIndex} of ${totalFiles} (${percent}%)`);
            } else {
              setFolderUploadProgress(`File ${currentIndex} of ${totalFiles}`);
            }
          });
          successCount++;
        } catch (uploadError) {
          console.error(`Failed to upload ${file.name}:`, uploadError);
          failCount++;
        }
      }

      // We skipped refresh during the loop, now refresh once globally
      refreshDocuments();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('employeeUpdated'));
        window.dispatchEvent(new Event('documentsUpdated'));
      }

      let summaryMessage = `Uploaded ${successCount} document(s).`;
      if (canceledCount > 0) {
        summaryMessage += ` Canceled ${canceledCount} duplicate(s).`;
      }
      if (failCount > 0) {
        summaryMessage += ` Failed ${failCount} document(s).`;
      }

      if (failCount === 0) {
        showToast(summaryMessage, 'success');
      } else {
        showToast(summaryMessage, 'warning');
      }
    } catch (err: any) {
      console.error('Folder upload error:', err);
      showToast(err.message || 'Error uploading folder.', 'error');
    } finally {
      setIsFolderUploading(false);
      setFolderUploadProgress(null);
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsUploadModalOpen(true)}
                disabled={isFolderUploading}
              >
                📤 Upload Document
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => document.getElementById('folder-upload-input')?.click()}
                disabled={isFolderUploading}
              >
                {isFolderUploading ? (folderUploadProgress || '⏳ Uploading...') : '📁 Upload Folder'}
              </Button>
              <input
                id="folder-upload-input"
                type="file"
                /* @ts-ignore */
                webkitdirectory=""
                directory=""
                multiple
                style={{ display: 'none' }}
                onChange={handleFolderUpload}
              />
            </div>
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
          employeeId={employeeId}
          employeeName={employeeName}
        />

        {folderUploadConfirm && (
          <Modal
            isOpen={true}
            onClose={() => setFolderUploadConfirm(null)}
            title="Confirm Folder Upload"
          >
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <p style={{ margin: 0 }}>Ready to upload <strong>{folderUploadConfirm.files.length}</strong> PDF documents from the selected folder.</p>
              
              <div className="upload-modal__field compression-field" style={{ marginTop: 0 }}>
                <label className="upload-modal__label">Compression level</label>
                <div className="compression-options">
                  <div 
                    className={`compression-option ${folderCompressionLevel === 'extreme' ? 'active' : ''}`}
                    onClick={() => setFolderCompressionLevel('extreme')}
                  >
                    <div className="compression-option-text">
                      <span className="compression-title">EXTREME COMPRESSION</span>
                      <span className="compression-desc">Less quality, high compression</span>
                    </div>
                    {folderCompressionLevel === 'extreme' && <div className="compression-check">✓</div>}
                  </div>
                  
                  <div 
                    className={`compression-option ${folderCompressionLevel === 'recommended' ? 'active' : ''}`}
                    onClick={() => setFolderCompressionLevel('recommended')}
                  >
                    <div className="compression-option-text">
                      <span className="compression-title">RECOMMENDED COMPRESSION</span>
                      <span className="compression-desc">Good quality, good compression</span>
                    </div>
                    {folderCompressionLevel === 'recommended' && <div className="compression-check">✓</div>}
                  </div>
                  
                  <div 
                    className={`compression-option ${folderCompressionLevel === 'less' ? 'active' : ''}`}
                    onClick={() => setFolderCompressionLevel('less')}
                  >
                    <div className="compression-option-text">
                      <span className="compression-title">LESS COMPRESSION</span>
                      <span className="compression-desc">High quality, less compression</span>
                    </div>
                    {folderCompressionLevel === 'less' && <div className="compression-check">✓</div>}
                  </div>
                </div>
              </div>

              <div className="upload-modal__actions">
                <Button variant="ghost" onClick={() => setFolderUploadConfirm(null)}>Cancel</Button>
                <Button variant="primary" onClick={executeFolderUpload}>Start Upload</Button>
              </div>
            </div>
          </Modal>
        )}

        {duplicateConfirm && (
          <Modal
            isOpen={true}
            onClose={() => duplicateConfirm.onResolve('skip', false)}
            title="Duplicate File Warning"
            size="sm"
          >
            <div style={{ padding: '0.5rem 0' }}>
              <p style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', fontSize: '0.95rem', lineHeight: '1.5' }}>
                A document named <strong>{duplicateConfirm.fileName}</strong> already exists. What would you like to do?
              </p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
                <input
                  type="checkbox"
                  id="apply-to-all-dup"
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="apply-to-all-dup" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', cursor: 'pointer', userSelect: 'none' }}>
                  Apply to all remaining duplicate files
                </label>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const checkbox = document.getElementById('apply-to-all-dup') as HTMLInputElement;
                    duplicateConfirm.onResolve('skip', checkbox?.checked || false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const checkbox = document.getElementById('apply-to-all-dup') as HTMLInputElement;
                    duplicateConfirm.onResolve('replace', checkbox?.checked || false);
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          </Modal>
        )}

      </div>
    </Card>
  );
}

export default PDFDocumentsModule;
