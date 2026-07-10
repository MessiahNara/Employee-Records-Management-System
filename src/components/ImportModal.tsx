import { useState, useRef } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { ImportedEmployee, ImportPreviewData } from '../types/importExport';
import { parseImportFile } from '../utils/importUtils';
import './ImportModal.css';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmImport: (employees: ImportedEmployee[], options?: { syncWithBackend?: boolean }) => void;
}

function ImportModal({ isOpen, onClose, onConfirmImport }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<ImportPreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [syncWithBackend, setSyncWithBackend] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf('.'));

    if (!validTypes.includes(selectedFile.type) && !validExtensions.includes(fileExtension)) {
      setError('Unsupported file format. Please upload .xlsx or .csv files.');
      return;
    }

    // Validate file size (10MB limit)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.');
      return;
    }

    setFile(selectedFile);
    setError('');
    setIsLoading(true);

    try {
      const preview = await parseImportFile(selectedFile);
      setPreviewData(preview);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setIsLoading(false);
      setPreviewData(null);
    }
  };

  const handleConfirm = () => {
    if (previewData && previewData.validRecords.length > 0) {
      onConfirmImport(previewData.validRecords, { syncWithBackend });
      handleClose();
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreviewData(null);
    setError('');
    setIsLoading(false);
    setSyncWithBackend(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Employee Records"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!previewData || previewData.validRecords.length === 0 || isLoading}
          >
            Confirm Import ({previewData?.validRecords.length || 0} records)
          </Button>
        </>
      }
    >
      <div className="import-modal">
        {/* File Upload Section */}
        <div className="import-modal__upload-section">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <div className="import-modal__upload-area" onClick={handleUploadClick}>
            <div className="import-modal__upload-icon">📁</div>
            <p className="import-modal__upload-text">
              {file ? file.name : 'Click to select a file or drag and drop'}
            </p>
            <p className="import-modal__upload-hint">Supported formats: .xlsx, .csv (Max 10MB)</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleUploadClick}>
            Choose File
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="import-modal__error">
            <span className="import-modal__error-icon">⚠️</span>
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="import-modal__loading">
            <div className="import-modal__spinner"></div>
            <p>Parsing file...</p>
          </div>
        )}

        {/* Preview Section */}
        {previewData && !isLoading && (
          <div className="import-modal__preview">
            <div className="import-modal__summary">
              <div className="import-modal__summary-item import-modal__summary-item--success">
                <span className="import-modal__summary-label">Valid Records:</span>
                <span className="import-modal__summary-value">{previewData.validRecords.length}</span>
              </div>
              <div className="import-modal__summary-item import-modal__summary-item--error">
                <span className="import-modal__summary-label">Invalid Records:</span>
                <span className="import-modal__summary-value">
                  {previewData.invalidRecords.length}
                </span>
              </div>
            </div>

            {/* Preview Table */}
            <div className="import-modal__table-container">
              <table className="import-modal__table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Employee ID</th>
                    <th>Last Name</th>
                    <th>First Name</th>
                    <th>Position / Function</th>
                    <th>Appointment Status</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.validRecords.map((record, index) => (
                    <tr key={`valid-${index}`} className="import-modal__row--valid">
                      <td>
                        <span className="import-modal__status-badge import-modal__status-badge--valid">
                          ✓
                        </span>
                      </td>
                      <td>{record.id || '(auto-generate)'}</td>
                      <td>{record.lastName}</td>
                      <td>{record.firstName}</td>
                      <td>{record.positionFunction}</td>
                      <td>{record.appointmentStatus}</td>
                      <td>—</td>
                    </tr>
                  ))}
                  {previewData.invalidRecords.map((record, index) => (
                    <tr key={`invalid-${index}`} className="import-modal__row--invalid">
                      <td>
                        <span className="import-modal__status-badge import-modal__status-badge--invalid">
                          ✗
                        </span>
                      </td>
                      <td>{record.data.id || '—'}</td>
                      <td>{record.data.lastName || '—'}</td>
                      <td>{record.data.firstName || '—'}</td>
                      <td>{record.data.positionFunction || '—'}</td>
                      <td>{record.data.appointmentStatus || '—'}</td>
                      <td>
                        <div className="import-modal__errors">
                          {record.errors.map((err, errIndex) => (
                            <div key={errIndex} className="import-modal__error-item">
                              <strong>{err.field}:</strong> {err.message}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewData.invalidRecords.length > 0 && (
              <div className="import-modal__warning">
                <span className="import-modal__warning-icon">ℹ️</span>
                Invalid records will be skipped. Only valid records will be imported.
              </div>
            )}

            <div className="import-modal__warning" style={{ marginTop: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={syncWithBackend}
                  onChange={(e) => setSyncWithBackend(e.target.checked)}
                />
                Sync mode: Keep backend exactly the same as this file
              </label>
              <p style={{ marginTop: '0.5rem' }}>
                When enabled, records not present in this import file will be deleted from the backend.
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default ImportModal;
