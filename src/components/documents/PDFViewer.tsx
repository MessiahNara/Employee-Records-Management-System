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
}

function PDFViewer({ isOpen, onClose, document: employeeDocument, pdfData }: PDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen && pdfData) {
      setIsLoading(true);
      // Simulate loading delay
      const timer = setTimeout(() => setIsLoading(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, pdfData]);

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
    if (!pdfData || !employeeDocument) return;

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

  if (!employeeDocument) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={employeeDocument.fileName}
      size="lg"
    >
      <div className="pdf-viewer">
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
          <Button variant="primary" size="sm" onClick={handleDownload}>
            ⬇️ Download
          </Button>
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
              src={pdfData}
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
