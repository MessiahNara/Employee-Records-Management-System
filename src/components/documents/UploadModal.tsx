import { useState, useEffect } from 'react';
import { DocumentCategory, DOCUMENT_FOLDERS } from '../../types/document';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import SearchableDropdown from '../ui/SearchableDropdown';
import api from '../../services/api';
import { getAuthState } from '../../utils/mockAuth';
import './UploadModal.css';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: File[], category: DocumentCategory, aoData?: any) => Promise<void>;
  defaultCategory?: DocumentCategory;
}

function UploadModal({ isOpen, onClose, onUpload, defaultCategory }: UploadModalProps) {
  const currentUser = getAuthState();
  const isDeveloper = currentUser?.role === 'developer';

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>(
    defaultCategory || 'Personal Information'
  );
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Dropdown options from settings
  const [dropdownOptions, setDropdownOptions] = useState<{
    officeNames: string[];
    positions: string[];
    aoYears: string[];
  }>({
    officeNames: [],
    positions: [],
    aoYears: [],
  });

  // AO specific form fields
  const [aoType, setAoType] = useState<'Detailed' | 'Designated' | ''>('');
  const [aoNumber, setAoNumber] = useState('');
  const [aoYear, setAoYear] = useState('');
  const [detailedTo, setDetailedTo] = useState('');
  const [detailedDivision, setDetailedDivision] = useState('');
  const [detailedFunction, setDetailedFunction] = useState('');
  const [designatedPositionFunction, setDesignatedPositionFunction] = useState('');
  const [designatedOrderFrom, setDesignatedOrderFrom] = useState('');
  const [designatedOrderTo, setDesignatedOrderTo] = useState('');
  const [appointmentFrom, setAppointmentFrom] = useState('');
  const [appointmentTo, setAppointmentTo] = useState('');
  const [autoRename, setAutoRename] = useState(false);

  // Field validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedFiles([]);
      setError(null);
      setIsUploading(false);
      setUploadProgress(null);
      setFieldErrors({});

      setAoType('');
      setAoNumber('');
      setAoYear('');
      setDetailedTo('');
      setDetailedDivision('');
      setDetailedFunction('');
      setDesignatedPositionFunction('');
      setDesignatedOrderFrom('');
      setDesignatedOrderTo('');
      setAppointmentFrom('');
      setAppointmentTo('');
      setAutoRename(false);

      if (defaultCategory) {
        setSelectedCategory(defaultCategory);
      }

      // Fetch office names and positions options
      const fetchOptions = async () => {
        try {
          const res = await api.systemSettings.get();
          setDropdownOptions({
            officeNames: res.officeNames || [],
            positions: res.positions || [],
            aoYears: res.aoYears || [],
          });
        } catch (err) {
          console.error('Failed to load system setting dropdown options:', err);
        }
      };
      fetchOptions();
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

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (selectedCategory === 'Administrative Order') {
      if (!aoNumber.trim()) {
        errors.aoNumber = 'AO Number is required';
      }
      if (!aoYear) {
        errors.aoYear = 'Series (Year) is required';
      }
      if (!aoType) {
        errors.aoType = 'AO Type is required';
      }
      
      if (aoType === 'Detailed') {
        if (!detailedTo) {
          errors.detailedTo = 'Detailed/Transferred Office is required';
        }
        if (!appointmentFrom) {
          errors.appointmentFrom = 'Duration From is required';
        }
        if (!appointmentTo) {
          errors.appointmentTo = 'Duration To is required';
        }
      }
      
      if (aoType === 'Designated') {
        if (!detailedTo) {
          errors.detailedTo = 'Designated Office is required';
        }
        if (!designatedPositionFunction) {
          errors.designatedPositionFunction = 'Designated Position Function is required';
        }
        if (!designatedOrderFrom) {
          errors.designatedOrderFrom = 'Duration From is required';
        }
        if (!designatedOrderTo) {
          errors.designatedOrderTo = 'Duration To is required';
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const aoData = selectedCategory === 'Administrative Order' ? {
        aoNumber,
        aoYear,
        aoType,
        detailedTo,
        detailedDivision,
        detailedFunction,
        detailedDate: aoType === 'Detailed' ? appointmentFrom : undefined,
        detailedOrderFrom: aoType === 'Detailed' ? appointmentFrom : undefined,
        detailedOrderTo: aoType === 'Detailed' ? appointmentTo : undefined,
        designatedPositionFunction,
        designatedOrderFrom: aoType === 'Designated' ? designatedOrderFrom : undefined,
        designatedOrderTo: aoType === 'Designated' ? designatedOrderTo : undefined,
        appointmentFrom: aoType === 'Detailed' ? appointmentFrom : undefined,
        appointmentTo: aoType === 'Detailed' ? appointmentTo : undefined,
        autoRename,
      } : undefined;

      await onUpload(selectedFiles, selectedCategory, aoData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload documents');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload Document"
      size={selectedCategory === 'Administrative Order' ? 'lg' : 'md'}
    >
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

        {selectedCategory === 'Administrative Order' && (
          <div className="upload-modal__ao-form">
            <h3 className="upload-modal__section-title">Administrative Order Details</h3>
            
            <div className="upload-modal__form-row">
              <div className="upload-modal__field upload-modal__field--full">
                <label htmlFor="ao-type" className="upload-modal__label">
                  AO Status
                </label>
                <select
                  id="ao-type"
                  className={`upload-modal__select ${fieldErrors.aoType ? 'upload-modal__select--error' : ''}`}
                  value={aoType}
                  onChange={(e) => {
                    setAoType(e.target.value as any);
                    setDetailedTo('');
                    setDetailedDivision('');
                    setDetailedFunction('');
                    setDesignatedPositionFunction('');
                    setDesignatedOrderFrom('');
                    setDesignatedOrderTo('');
                    setAppointmentFrom('');
                    setAppointmentTo('');
                  }}
                  disabled={isUploading}
                >
                  <option value="">Select AO Type</option>
                  <option value="Detailed">Detailed</option>
                  <option value="Designated">Designated</option>
                </select>
                {fieldErrors.aoType && <span className="upload-modal__field-error">⚠️ {fieldErrors.aoType}</span>}
              </div>
            </div>

            <div className="upload-modal__form-row">
              <Input
                id="ao-number"
                label="AO Number"
                placeholder="Enter Administrative Order number"
                value={aoNumber}
                onChange={(e) => setAoNumber(e.target.value)}
                error={fieldErrors.aoNumber}
                disabled={isUploading}
                fullWidth
              />
              <div className="upload-modal__field">
                <label htmlFor="ao-year" className="upload-modal__label">
                  Series
                </label>
                  <select
                    id="ao-year"
                    className={`upload-modal__select ${fieldErrors.aoYear ? 'upload-modal__select--error' : ''}`}
                    value={aoYear}
                    onChange={(e) => setAoYear(e.target.value)}
                    disabled={isUploading}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    <option value="">Select series year</option>
                    {dropdownOptions.aoYears.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                {fieldErrors.aoYear && <span className="upload-modal__field-error">⚠️ {fieldErrors.aoYear}</span>}
              </div>
            </div>

            {aoType === 'Detailed' && (
              <>
                <div className="upload-modal__field">
                  <label htmlFor="detailedTo" className="upload-modal__label">
                    Detailed/Transferred Office
                  </label>
                  <SearchableDropdown
                    id="detailedTo"
                    options={dropdownOptions.officeNames}
                    value={detailedTo}
                    onChange={setDetailedTo}
                    placeholder="Select or enter office"
                    disabled={isUploading}
                    className={fieldErrors.detailedTo ? 'searchable-dropdown--error' : ''}
                  />
                  {fieldErrors.detailedTo && <span className="upload-modal__field-error">⚠️ {fieldErrors.detailedTo}</span>}
                </div>

                <div className="upload-modal__field">
                  <label htmlFor="detailedDivision" className="upload-modal__label">
                    Division
                  </label>
                  <input
                    id="detailedDivision"
                    className="input"
                    type="text"
                    placeholder="Enter division"
                    value={detailedDivision}
                    onChange={(e) => setDetailedDivision(e.target.value)}
                    disabled={isUploading}
                  />
                </div>

                <div className="upload-modal__form-row">
                  <Input
                    id="appointment-from"
                    label="Duration of Detailed Order (From)"
                    type="date"
                    value={appointmentFrom}
                    onChange={(e) => setAppointmentFrom(e.target.value)}
                    error={fieldErrors.appointmentFrom}
                    disabled={isUploading}
                    fullWidth
                  />
                  <Input
                    id="appointment-to"
                    label="Duration of Detailed Order (To)"
                    type="date"
                    value={appointmentTo}
                    onChange={(e) => setAppointmentTo(e.target.value)}
                    error={fieldErrors.appointmentTo}
                    disabled={isUploading}
                    fullWidth
                  />
                </div>
              </>
            )}

            {aoType === 'Designated' && (
              <>
                <div className="upload-modal__field">
                  <label htmlFor="designatedOffice" className="upload-modal__label">
                    Designated Office
                  </label>
                  <SearchableDropdown
                    id="designatedOffice"
                    options={dropdownOptions.officeNames}
                    value={detailedTo}
                    onChange={setDetailedTo}
                    placeholder="Select or enter designated office"
                    disabled={isUploading}
                    className={fieldErrors.detailedTo ? 'searchable-dropdown--error' : ''}
                  />
                  {fieldErrors.detailedTo && <span className="upload-modal__field-error">⚠️ {fieldErrors.detailedTo}</span>}
                </div>

                <div className="upload-modal__field">
                  <label htmlFor="designatedPositionFunction" className="upload-modal__label">
                    Designated Position Function
                  </label>
                  <SearchableDropdown
                    id="designatedPositionFunction"
                    options={dropdownOptions.positions}
                    value={designatedPositionFunction}
                    onChange={setDesignatedPositionFunction}
                    placeholder="Select or enter position function"
                    disabled={isUploading}
                    className={fieldErrors.designatedPositionFunction ? 'searchable-dropdown--error' : ''}
                  />
                  {fieldErrors.designatedPositionFunction && <span className="upload-modal__field-error">⚠️ {fieldErrors.designatedPositionFunction}</span>}
                </div>

                <div className="upload-modal__form-row">
                  <Input
                    id="designated-order-from"
                    label="Designated Order (From)"
                    type="date"
                    value={designatedOrderFrom}
                    onChange={(e) => setDesignatedOrderFrom(e.target.value)}
                    error={fieldErrors.designatedOrderFrom}
                    disabled={isUploading}
                    fullWidth
                  />
                  <Input
                    id="designated-order-to"
                    label="Designated Order (To)"
                    type="date"
                    value={designatedOrderTo}
                    onChange={(e) => setDesignatedOrderTo(e.target.value)}
                    error={fieldErrors.designatedOrderTo}
                    disabled={isUploading}
                    fullWidth
                  />
                </div>
              </>
            )}

            
          </div>
        )}

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

        {selectedCategory === 'Administrative Order' && (
          <div className="upload-modal__field" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="auto-rename"
              checked={autoRename}
              onChange={(e) => setAutoRename(e.target.checked)}
              disabled={isUploading}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="auto-rename" className="upload-modal__label" style={{ margin: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', fontWeight: 500 }}>
              Auto rename file according to AO details
            </label>
          </div>
        )}

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
