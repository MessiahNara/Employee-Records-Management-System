import { useState, useEffect } from 'react';
import { DocumentCategory, DOCUMENT_FOLDERS } from '../../types/document';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import './UploadModal.css';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: File[], category: DocumentCategory) => Promise<void>;
  defaultCategory?: DocumentCategory;
}

function UploadModal({ isOpen, onClose, onUpload, defaultCategory }: UploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>(
    defaultCategory || 'Personal Information'
  );
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedFiles([]);
      setError(null);
      setIsUploading(false);
      setUploadProgress(null);
      if (defaultCategory) {
        setSelectedCategory(defaultCategory);
      }
    }
  }, [isOpen, defaultCategory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSelectedFiles(files);
      setError(null);
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCategory(e.target.value as DocumentCategory);
  };

  const formatFileSize = (bytes: number): string => {
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(2)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      await onUpload(selectedFiles, selectedCategory);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload documents');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload Document">
      <form onSubmit={handleSubmit} className="upload-modal">
        <div className="upload-modal__field">
          <label htmlFor="category" className="upload-modal__label">
            Document Category
          </label>
          <select
            id="category"
            value={selectedCategory}
            onChange={handleCategoryChange}
            className="upload-modal__select"
            disabled={isUploading}
          >
            {DOCUMENT_FOLDERS.map((folder) => (
              <option key={folder.category} value={folder.category}>
                {folder.icon} {folder.category}
              </option>
            ))}
          </select>
          <p className="upload-modal__hint">
            {DOCUMENT_FOLDERS.find(f => f.category === selectedCategory)?.description}
          </p>
        </div>

        <div className="upload-modal__field">
          <label htmlFor="file" className="upload-modal__label">
            Select PDF File(s)
          </label>
          <input
            id="file"
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={handleFileChange}
            className="upload-modal__file-input"
            disabled={isUploading}
          />
          {selectedFiles.length > 0 && (
            <div className="upload-modal__file-list">
              {selectedFiles.map((file, i) => (
                <div key={i} className="upload-modal__file-info">
                  <span className="upload-modal__file-name">📄 {file.name}</span>
                  <span className="upload-modal__file-size">{formatFileSize(file.size)}</span>
                </div>
              ))}
              {selectedFiles.length > 1 && (
                <div className="upload-modal__file-count">
                  {selectedFiles.length} files selected
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="upload-modal__error">
            ⚠️ {error}
          </div>
        )}
        {uploadProgress && (
          <div className="upload-modal__progress">
            ⏳ {uploadProgress}
          </div>
        )}

        <div className="upload-modal__actions">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={selectedFiles.length === 0 || isUploading}
          >
            {isUploading ? 'Uploading...' : `Upload${selectedFiles.length > 1 ? ` (${selectedFiles.length})` : ''}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default UploadModal;
