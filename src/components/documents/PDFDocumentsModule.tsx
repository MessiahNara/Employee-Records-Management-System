import { useState, useMemo, useRef, useEffect } from 'react';
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

interface FolderUploadLiveProgress {
  currentFileName: string;
  currentCategory: string;
  currentIndex: number;
  totalFiles: number;
  filePercent: number;
  overallPercent: number;
  loadedBytes: number;
  totalBytes: number;
  successCount: number;
  failCount: number;
  canceledCount: number;
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
  const [folderLiveProgress, setFolderLiveProgress] = useState<FolderUploadLiveProgress | null>(null);
  const [folderUploadConfirm, setFolderUploadConfirm] = useState<{ files: File[] } | null>(null);
  const [folderUploadErrors, setFolderUploadErrors] = useState<{ name: string; error: string }[]>([]);
  const [folderCompressionLevel, setFolderCompressionLevel] = useState<'extreme' | 'recommended' | 'less'>('recommended');
  const [folderSkippedAOCount, setFolderSkippedAOCount] = useState(0);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
      (folderInputRef.current as any).webkitdirectory = true;
      (folderInputRef.current as any).directory = true;
    }
  }, []);
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

  const handleUpload = async (
    files: File[],
    category: DocumentCategory,
    aoData?: any | any[],
    compressionLevel: string = 'recommended',
    onProgress?: (progress: any) => void
  ) => {
    try {
      let globalDuplicateAction: 'replace' | 'skip' | null = null;
      let uploadedCount = 0;
      let canceledCount = 0;

      const aoList = Array.isArray(aoData) ? aoData : (aoData ? [aoData] : []);

      const uploadQueue: { file: File, ao?: any }[] = [];

      if (category === 'Administrative Order') {
        for (const ao of aoList) {
          const aoFiles: File[] = ao.files || [];
          for (const file of aoFiles) {
            uploadQueue.push({ file, ao });
          }
        }
      } else {
        for (const file of files) {
          uploadQueue.push({ file });
        }
      }

      for (let i = 0; i < uploadQueue.length; i++) {
        const { file, ao } = uploadQueue[i];
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

        await uploadDocument(file, category, ao, true, replace, compressionLevel, (e: ProgressEvent) => {
          if (onProgress) {
            if (e.lengthComputable) {
              const filePercent = Math.round((e.loaded / e.total) * 100);
              const overallPercent = Math.min(
                100,
                Math.round(((i + (e.loaded / e.total)) / uploadQueue.length) * 100)
              );
              onProgress({
                percent: filePercent,
                overallPercent,
                currentFile: file.name,
                currentIndex: i + 1,
                totalFiles: uploadQueue.length,
                loadedBytes: e.loaded,
                totalBytes: e.total,
              });
            } else {
              const overallPercent = Math.round(((i + 0.5) / uploadQueue.length) * 100);
              onProgress({
                percent: 50,
                overallPercent,
                currentFile: file.name,
                currentIndex: i + 1,
                totalFiles: uploadQueue.length,
              });
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

  // Define category mappings matching folder names from relative path
  const getCategoryFromPath = (pathString: string): DocumentCategory => {
    const normalizedPath = pathString.replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(Boolean);
    
    // If only filename or no parent folder, return active category
    if (parts.length < 2) return activeCategory;
    
    // Check parent folder names from deepest to root (excluding the filename at the end)
    const folderSegments = parts.slice(0, -1).reverse();

    for (const segment of folderSegments) {
      const clean = segment.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');

      if (clean.includes('personal') || clean.includes('pds') || clean.includes('info')) {
        return 'Personal Information';
      }
      if (clean.includes('appointment') || clean.includes('personnelaction') || clean.includes('plantilla')) {
        return 'Personnel Action / Appointment';
      }
      if (clean.includes('position') || clean.includes('jobdesc') || clean.includes('jobdescription')) {
        return 'Position / Job Description';
      }
      if (clean.includes('assumption') || clean.includes('oath') || clean.includes('duties')) {
        return 'Assumptions of Duties / Oath of Office';
      }
      if (clean.includes('training') || clean.includes('seminar') || clean.includes('workshop') || clean.includes('certificate')) {
        return 'Training';
      }
      if (clean.includes('performance') || clean.includes('award') || clean.includes('recognition') || clean.includes('ipcr') || clean.includes('spms') || clean.includes('opcr')) {
        return 'Performance / Awards & Recognition';
      }
      if (clean.includes('discipline') || clean.includes('disciplinary') || clean.includes('administrativecase')) {
        return 'Employee Discipline';
      }
      if (clean.includes('administrativeorder') || clean.includes('adminorder') || clean.includes('ao') || (clean.includes('order') && !clean.includes('disorder'))) {
        return 'Administrative Order';
      }
    }

    return activeCategory;
  };

  const handleTriggerFolderUpload = () => {
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
      folderInputRef.current.click();
    }
  };

  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Filter only PDF files
    const pdfFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      showToast('No PDF files found in the selected folder.', 'warning');
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
      return;
    }

    // Exclude Administrative Order files — they require manual information input
    const nonAOFiles: File[] = [];
    let skippedAO = 0;
    for (const file of pdfFiles) {
      const relPath = file.webkitRelativePath || file.name;
      const resolvedCategory = getCategoryFromPath(relPath);
      if (resolvedCategory === 'Administrative Order') {
        skippedAO++;
      } else {
        nonAOFiles.push(file);
      }
    }
    setFolderSkippedAOCount(skippedAO);

    if (nonAOFiles.length === 0) {
      showToast(`All ${skippedAO} PDF file(s) are Administrative Orders, which must be uploaded individually with required information. No files to upload.`, 'warning');
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
      return;
    }

    setFolderUploadConfirm({ files: nonAOFiles });
    // Note: Do NOT reset input.value here! In Chromium/WebKit, clearing the input value
    // immediately revokes the sandbox file access token before files can be read/uploaded.
  };

  const cancelFolderUpload = () => {
    setFolderUploadConfirm(null);
    setFolderSkippedAOCount(0);
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  // Category breakdown for folder upload confirmation
  const folderCategorySummary = useMemo(() => {
    if (!folderUploadConfirm) return {};
    const counts: Record<string, number> = {};
    for (const file of folderUploadConfirm.files) {
      const relPath = file.webkitRelativePath || file.name;
      const cat = getCategoryFromPath(relPath);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [folderUploadConfirm, activeCategory]);

  const executeFolderUpload = async () => {
    if (!folderUploadConfirm) return;
    const pdfFiles = folderUploadConfirm.files;
    setFolderUploadConfirm(null);
    
    setIsFolderUploading(true);
    setFolderUploadErrors([]);
    let successCount = 0;
    let failCount = 0;
    let canceledCount = 0;
    const failedFiles: { name: string; error: string }[] = [];

    try {
      let globalDuplicateAction: 'replace' | 'skip' | null = null;
      
      const totalFiles = pdfFiles.length;
      let currentIndex = 0;

      for (const file of pdfFiles) {
        currentIndex++;
        const relPath = file.webkitRelativePath || file.name;
        const resolvedCategory = getCategoryFromPath(relPath);

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

        // Initialize live progress for this file
        setFolderLiveProgress({
          currentFileName: file.name,
          currentCategory: resolvedCategory,
          currentIndex,
          totalFiles,
          filePercent: 0,
          overallPercent: Math.min(99, Math.round(((currentIndex - 1) / totalFiles) * 100)),
          loadedBytes: 0,
          totalBytes: file.size || 0,
          successCount,
          failCount,
          canceledCount,
        });

        try {
          await uploadDocument(file, resolvedCategory, undefined, true, replace, folderCompressionLevel, (e: ProgressEvent) => {
            if (e.lengthComputable) {
              const filePercent = Math.round((e.loaded / e.total) * 100);
              const overallPercent = Math.min(
                100,
                Math.round((((currentIndex - 1) + (e.loaded / e.total)) / totalFiles) * 100)
              );
              setFolderUploadProgress(`File ${currentIndex} of ${totalFiles} (${filePercent}%)`);
              setFolderLiveProgress({
                currentFileName: file.name,
                currentCategory: resolvedCategory,
                currentIndex,
                totalFiles,
                filePercent,
                overallPercent,
                loadedBytes: e.loaded,
                totalBytes: e.total,
                successCount,
                failCount,
                canceledCount,
              });
            } else {
              setFolderUploadProgress(`File ${currentIndex} of ${totalFiles}`);
              setFolderLiveProgress(prev => prev ? { ...prev, filePercent: 50 } : null);
            }
          });
          successCount++;
        } catch (uploadError: any) {
          const errorMsg = uploadError?.response?.data?.error || uploadError?.message || uploadError?.error || 'Upload failed';
          console.error(`Failed to upload ${file.name}:`, uploadError);
          failedFiles.push({ name: file.name, error: errorMsg });
          failCount++;
        }
      }

      setFolderUploadErrors(failedFiles);

      // Refresh once after all files are processed
      refreshDocuments();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('employeeUpdated'));
        window.dispatchEvent(new Event('documentsUpdated'));
      }

      let summaryMessage = `Uploaded ${successCount} document(s).`;
      if (canceledCount > 0) {
        summaryMessage += ` Skipped ${canceledCount} duplicate(s).`;
      }
      if (failCount > 0) {
        const errorPreview = failedFiles.slice(0, 3).map(f => `"${f.name}" (${f.error})`).join(', ');
        const extra = failedFiles.length > 3 ? ` and ${failedFiles.length - 3} more` : '';
        summaryMessage += ` Failed (${failCount}): ${errorPreview}${extra}`;
      }

      if (failCount === 0) {
        showToast(summaryMessage, 'success');
      } else {
        showToast(summaryMessage, 'error');
      }
    } catch (err: any) {
      console.error('Folder upload error:', err);
      showToast(err.message || 'Error uploading folder.', 'error');
    } finally {
      setIsFolderUploading(false);
      setFolderUploadProgress(null);
      setFolderLiveProgress(null);
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
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
                onClick={handleTriggerFolderUpload}
                disabled={isFolderUploading}
              >
                {isFolderUploading ? (folderUploadProgress || '⏳ Uploading...') : '📁 Upload Folder'}
              </Button>
              <input
                ref={folderInputRef}
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

        {folderUploadErrors.length > 0 && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid var(--color-danger, #ef4444)',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-danger, #ef4444)', fontSize: '0.9rem' }}>
                ⚠️ {folderUploadErrors.length} file(s) failed during folder upload:
              </span>
              <button
                onClick={() => setFolderUploadErrors([])}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem' }}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              {folderUploadErrors.map((item, idx) => (
                <li key={idx} style={{ marginBottom: '3px' }}>
                  <strong>{item.name}</strong>: <span style={{ color: 'var(--color-danger, #dc2626)' }}>{item.error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

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
            onClose={cancelFolderUpload}
            title="Confirm Folder Upload"
          >
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <p style={{ margin: 0, fontSize: '0.95rem' }}>
                Ready to upload <strong>{folderUploadConfirm.files.length}</strong> PDF document(s) from the selected folder.
              </p>

              {folderSkippedAOCount > 0 && (
                <div style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '8px',
                  padding: '0.65rem 1rem',
                  fontSize: '0.85rem',
                  color: '#92400e',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                }}
                >
                  <span style={{ fontSize: '1.1rem', lineHeight: 1.3 }}>⚠️</span>
                  <span>
                    <strong>{folderSkippedAOCount}</strong> Administrative Order file(s) were excluded.
                    Administrative Orders require manual input of additional information and must be uploaded individually.
                  </span>
                </div>
              )}

              {Object.keys(folderCategorySummary).length > 0 && (
                <div style={{
                  backgroundColor: 'var(--color-background-subtle, #f8fafc)',
                  border: '1px solid var(--color-border, #e2e8f0)',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem'
                }}>
                  <strong style={{ display: 'block', marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                    Destination Categories:
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-secondary)' }}>
                    {Object.entries(folderCategorySummary).map(([cat, count]) => (
                      <li key={cat} style={{ marginBottom: '2px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cat}</span>: {count} file(s)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
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
                <Button variant="ghost" onClick={cancelFolderUpload}>Cancel</Button>
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

        {isFolderUploading && folderLiveProgress && (
          <Modal
            isOpen={true}
            onClose={() => {}}
            title="Uploading Folder in Progress"
            size="md"
          >
            <div className="folder-live-progress-container">
              <div className="folder-live-progress-header">
                <div className="folder-live-file-badge">
                  <span className="folder-live-file-icon">📄</span>
                  <div className="folder-live-file-info">
                    <span className="folder-live-filename" title={folderLiveProgress.currentFileName}>
                      {folderLiveProgress.currentFileName}
                    </span>
                    <span className="folder-live-category-tag">
                      Target Category: <strong>{folderLiveProgress.currentCategory}</strong>
                    </span>
                  </div>
                </div>
                <div className="folder-live-badge-percent">
                  {folderLiveProgress.overallPercent}%
                </div>
              </div>

              {/* Overall Progress */}
              <div className="folder-live-section">
                <div className="folder-live-label-row">
                  <span className="folder-live-label">Overall Progress</span>
                  <span className="folder-live-detail">
                    {folderLiveProgress.currentIndex} of {folderLiveProgress.totalFiles} files
                  </span>
                </div>
                <div className="folder-live-bar-track">
                  <div
                    className="folder-live-bar-fill folder-live-bar-fill--overall"
                    style={{ width: `${folderLiveProgress.overallPercent}%` }}
                  />
                </div>
              </div>

              {/* Current File Progress */}
              <div className="folder-live-section">
                <div className="folder-live-label-row">
                  <span className="folder-live-label">Current File</span>
                  <span className="folder-live-detail">
                    {folderLiveProgress.totalBytes > 0
                      ? `${((folderLiveProgress.loadedBytes || 0) / 1024 / 1024).toFixed(1)} / ${(folderLiveProgress.totalBytes / 1024 / 1024).toFixed(1)} MB (${folderLiveProgress.filePercent}%)`
                      : `${folderLiveProgress.filePercent}%`}
                  </span>
                </div>
                <div className="folder-live-bar-track folder-live-bar-track--sub">
                  <div
                    className="folder-live-bar-fill folder-live-bar-fill--current"
                    style={{ width: `${folderLiveProgress.filePercent}%` }}
                  />
                </div>
              </div>

              {/* Upload Stats Chips */}
              <div className="folder-live-stats-row">
                <span className="folder-live-chip folder-live-chip--success">
                  ✅ {folderLiveProgress.successCount} Uploaded
                </span>
                {folderLiveProgress.canceledCount > 0 && (
                  <span className="folder-live-chip folder-live-chip--skipped">
                    ⏭️ {folderLiveProgress.canceledCount} Skipped
                  </span>
                )}
                {folderLiveProgress.failCount > 0 && (
                  <span className="folder-live-chip folder-live-chip--error">
                    ❌ {folderLiveProgress.failCount} Failed
                  </span>
                )}
                <span className="folder-live-chip folder-live-chip--remaining">
                  ⏳ {Math.max(0, folderLiveProgress.totalFiles - folderLiveProgress.currentIndex)} Remaining
                </span>
              </div>
            </div>
          </Modal>
        )}

      </div>
    </Card>
  );
}

export default PDFDocumentsModule;
