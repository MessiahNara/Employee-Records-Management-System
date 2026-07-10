import { useEffect, useState } from 'react';
import { EmployeeDocument } from '../../types/document';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import './PDFViewer.css';

interface PDFViewerProps {
  isOpen: boolean;
  onClose: () => void;
  document: EmployeeDocument | null;
  pdfData: string | null;
  canDownloadOrPrint?: boolean;
}

function PDFViewer({ isOpen, onClose, document: employeeDocument, pdfData, canDownloadOrPrint = false }: PDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && pdfData) {
      setIsLoading(true);
      // Simulate loading delay
      const timer = setTimeout(() => setIsLoading(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, pdfData]);

  // Intercept Keyboard shortcuts (Print/Save) when access is denied
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && !canDownloadOrPrint) {
        // Prevent Ctrl+P / Cmd+P
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
          e.preventDefault();
          e.stopPropagation();
          alert('Print access is disabled for your account role.');
        }
        // Prevent Ctrl+S / Cmd+S
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          e.stopPropagation();
          alert('Download access is disabled for your account role.');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, canDownloadOrPrint]);

  // Intercept right-clicks to disable "Save As" / "Print" context options
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (isOpen && !canDownloadOrPrint) {
        e.preventDefault();
      }
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, [isOpen, canDownloadOrPrint]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleDownload = async () => {
    if (!pdfData || !employeeDocument || !canDownloadOrPrint) return;

    try {
      const response = await fetch(pdfData);
      if (!response.ok) throw new Error('Failed to fetch file');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = employeeDocument.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handlePrint = () => {
    if (!pdfData || !canDownloadOrPrint) return;
    
    const printWindow = window.open(pdfData, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      }, true);
    }
  };

  if (!employeeDocument) return null;

  // Append toolbar=0 to hide default browser save/print toolbar if unauthorized
  const iframeSrc = pdfData 
    ? (canDownloadOrPrint ? pdfData : `${pdfData}#toolbar=0&navpanes=0`)
    : '';

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={employeeDocument.fileName}
      size="lg"
    >
      <div className={`pdf-viewer ${!canDownloadOrPrint ? 'pdf-viewer--no-print' : ''}`}>
        <div className="pdf-viewer__header">
          <div className="pdf-viewer__metadata">
            <span className="pdf-viewer__meta-item">
              <strong>Category:</strong> {employeeDocument.category}
            </span>
            <span className="pdf-viewer__meta-item">
              <strong>Uploaded by:</strong> {employeeDocument.uploadedBy}
            </span>
            <span className="pdf-viewer__meta-item">
              <strong>Date:</strong> {new Date(employeeDocument.uploadedAt).toLocaleDateString()}
            </span>
          </div>
          {canDownloadOrPrint && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="secondary" size="sm" onClick={handlePrint}>
                🖨️ Print
              </Button>
              <Button variant="primary" size="sm" onClick={handleDownload}>
                ⬇️ Download
              </Button>
            </div>
          )}
        </div>

        <div className="pdf-viewer__content">
          {isLoading && (
            <div className="pdf-viewer__loading">
              <div className="pdf-viewer__spinner"></div>
              <p>Loading PDF...</p>
            </div>
          )}
          {pdfData && (
            <iframe
              src={iframeSrc}
              className="pdf-viewer__iframe"
              title={employeeDocument.fileName}
              style={{ display: isLoading ? 'none' : 'block' }}
            />
          )}
          {!pdfData && !isLoading && (
            <div className="pdf-viewer__error">
              <p>Failed to load PDF document</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default PDFViewer;
