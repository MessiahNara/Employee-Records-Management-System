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
  onUpload: (files: File[], category: DocumentCategory, aoData?: any, compressionLevel?: string, onProgress?: (progressText: string) => void) => Promise<void>;
  defaultCategory?: DocumentCategory;
}

export interface AOData {
  aoType: 'Detailed' | 'Designated' | 'Recalled' | '';
  aoNumber: string;
  aoYear: string;
  detailedTo: string;
  detailedDivision: string;
  detailedFunction: string;
  designatedPositionFunction: string;
  designatedOrderFrom: string;
  designatedOrderTo: string;
  recalledFrom: string;
  recalledTo: string;
  recalledOrderFrom: string;
  recalledOrderTo: string;
  appointmentFrom: string;
  appointmentTo: string;
  files: File[];
  autoRename: boolean;
}

const defaultAO: AOData = {
  aoType: '', aoNumber: '', aoYear: '', detailedTo: '', detailedDivision: '',
  detailedFunction: '', designatedPositionFunction: '', designatedOrderFrom: '',
  designatedOrderTo: '', recalledFrom: '', recalledTo: '', recalledOrderFrom: '',
  recalledOrderTo: '', appointmentFrom: '', appointmentTo: '', files: [], autoRename: false,
};

function UploadModal({ isOpen, onClose, onUpload, defaultCategory }: UploadModalProps) {
  const currentUser = getAuthState();
  const isDeveloper = currentUser?.role === 'developer';

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>(
    defaultCategory || 'Personal Information'
  );
  const [isUploading, setIsUploading] = useState(false);
  const [compressionLevel, setCompressionLevel] = useState<'extreme' | 'recommended' | 'less'>('recommended');
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
  const [aoDataList, setAoDataList] = useState<AOData[]>([{ ...defaultAO }]);
  const [fieldErrorsList, setFieldErrorsList] = useState<Record<string, string>[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const updateAO = (index: number, field: keyof AOData, value: any) => {
    setAoDataList(prev => {
      const newList = [...prev];
      if (field === 'aoType') {
        newList[index] = { 
          ...newList[index], 
          [field]: value as any,
          detailedTo: '', detailedDivision: '', detailedFunction: '',
          designatedPositionFunction: '', designatedOrderFrom: '', designatedOrderTo: '',
          recalledFrom: '', recalledTo: '', recalledOrderFrom: '', recalledOrderTo: '',
          appointmentFrom: '', appointmentTo: ''
        };
      } else {
        newList[index] = { ...newList[index], [field]: value };
      }
      return newList;
    });
  };

  const addAO = () => setAoDataList(prev => [...prev, { ...defaultAO }]);
  const removeAO = (index: number) => {
    setAoDataList(prev => prev.filter((_, i) => i !== index));
    setFieldErrorsList(prev => prev.filter((_, i) => i !== index));
  };

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedFiles([]);
      setError(null);
      setIsUploading(false);
      setCompressionLevel('recommended');
      setUploadProgress(null);
      setFieldErrors({});

      setAoDataList([{ ...defaultAO }]);
      setFieldErrorsList([]);

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
    let isValid = true;
    const newErrorsList: Record<string, string>[] = [];
    const errors: Record<string, string> = {};
    
    if (selectedCategory === 'Administrative Order') {
      aoDataList.forEach((ao, index) => {
        const aoErrors: Record<string, string> = {};
        if (!ao.aoNumber.trim()) aoErrors.aoNumber = 'AO Number is required';
        if (!ao.aoYear) aoErrors.aoYear = 'Series (Year) is required';
        if (!ao.aoType) aoErrors.aoType = 'AO Type is required';
        if (!ao.files || ao.files.length === 0) aoErrors.files = 'At least one PDF file is required';
        
        if (ao.aoType === 'Detailed') {
          if (!ao.detailedTo) aoErrors.detailedTo = 'Detailed/Transferred Office is required';
          if (!ao.appointmentFrom) aoErrors.appointmentFrom = 'Duration From is required';
          if (!ao.appointmentTo) aoErrors.appointmentTo = 'Duration To is required';
        }
        
        if (ao.aoType === 'Designated') {
          if (!ao.detailedTo) aoErrors.detailedTo = 'Designated Office is required';
          if (!ao.designatedPositionFunction) aoErrors.designatedPositionFunction = 'Designated Position Function is required';
          if (!ao.designatedOrderFrom) aoErrors.designatedOrderFrom = 'Duration From is required';
          if (!ao.designatedOrderTo) aoErrors.designatedOrderTo = 'Duration To is required';
        }

        if (ao.aoType === 'Recalled') {
          if (!ao.recalledFrom) aoErrors.recalledFrom = 'Recalled from is required';
          if (!ao.recalledTo) aoErrors.recalledTo = 'Recalled to is required';
          if (!ao.recalledOrderFrom) aoErrors.recalledOrderFrom = 'Duration From is required';
          if (!ao.recalledOrderTo) aoErrors.recalledOrderTo = 'Duration To is required';
        }
        
        newErrorsList[index] = aoErrors;
        if (Object.keys(aoErrors).length > 0) isValid = false;
      });
    }

    setFieldErrorsList(newErrorsList);
    setFieldErrors(errors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedCategory !== 'Administrative Order' && selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const aoData = selectedCategory === 'Administrative Order' ? aoDataList.map(ao => ({
        ...ao,
        detailedDate: ao.aoType === 'Detailed' ? ao.appointmentFrom : undefined,
        detailedOrderFrom: ao.aoType === 'Detailed' ? ao.appointmentFrom : undefined,
        detailedOrderTo: ao.aoType === 'Detailed' ? ao.appointmentTo : undefined,
        designatedOrderFrom: ao.aoType === 'Designated' ? ao.designatedOrderFrom : undefined,
        designatedOrderTo: ao.aoType === 'Designated' ? ao.designatedOrderTo : undefined,
        recalledOrderFrom: ao.aoType === 'Recalled' ? ao.recalledOrderFrom : undefined,
        recalledOrderTo: ao.aoType === 'Recalled' ? ao.recalledOrderTo : undefined,
        autoRename: ao.autoRename,
      })) : undefined;

      await onUpload(selectedFiles, selectedCategory, aoData, compressionLevel, (progressText) => {
        setUploadProgress(progressText);
      });
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
            {aoDataList.map((ao, index) => {
              const currentErrors = fieldErrorsList[index] || {};
              return (
                <div key={index} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1rem', backgroundColor: 'var(--bg-secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 className="upload-modal__section-title" style={{ margin: 0 }}>Administrative Order Details {aoDataList.length > 1 ? `#${index + 1}` : ''}</h3>
                    {index > 0 && (
                      <Button type="button" variant="danger" onClick={() => removeAO(index)} style={{ padding: '0.25rem 0.75rem', height: 'auto' }}>
                        Remove
                      </Button>
                    )}
                  </div>
                  
                  <div className="upload-modal__form-row">
                    <div className="upload-modal__field upload-modal__field--full">
                      <label className="upload-modal__label">AO Status</label>
                      <select
                        className={`upload-modal__select ${currentErrors.aoType ? 'upload-modal__select--error' : ''}`}
                        value={ao.aoType}
                        onChange={(e) => updateAO(index, 'aoType', e.target.value)}
                        disabled={isUploading}
                      >
                        <option value="">Select AO Type</option>
                        <option value="Detailed">Detailed</option>
                        <option value="Designated">Designated</option>
                        <option value="Recalled">Recalled</option>
                      </select>
                      {currentErrors.aoType && <span className="upload-modal__field-error">⚠️ {currentErrors.aoType}</span>}
                    </div>
                  </div>

                  <div className="upload-modal__form-row">
                    <Input
                      id={`ao-number-${index}`}
                      label="AO Number"
                      placeholder="Enter Administrative Order number"
                      value={ao.aoNumber}
                      onChange={(e) => updateAO(index, 'aoNumber', e.target.value)}
                      error={currentErrors.aoNumber}
                      disabled={isUploading}
                      fullWidth
                    />
                    <div className="upload-modal__field">
                      <label className="upload-modal__label">Series</label>
                      <select
                        className={`upload-modal__select ${currentErrors.aoYear ? 'upload-modal__select--error' : ''}`}
                        value={ao.aoYear}
                        onChange={(e) => updateAO(index, 'aoYear', e.target.value)}
                        disabled={isUploading}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      >
                        <option value="">Select series year</option>
                        {dropdownOptions.aoYears.map((year) => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                      {currentErrors.aoYear && <span className="upload-modal__field-error">⚠️ {currentErrors.aoYear}</span>}
                    </div>
                  </div>

                  {ao.aoType === 'Detailed' && (
                    <>
                      <div className="upload-modal__field">
                        <label className="upload-modal__label">Detailed/Transferred Office</label>
                        <SearchableDropdown
                          id={`detailedTo-${index}`}
                          options={dropdownOptions.officeNames}
                          value={ao.detailedTo}
                          onChange={(val) => updateAO(index, 'detailedTo', val)}
                          placeholder="Select or enter office"
                          disabled={isUploading}
                          className={currentErrors.detailedTo ? 'searchable-dropdown--error' : ''}
                        />
                        {currentErrors.detailedTo && <span className="upload-modal__field-error">⚠️ {currentErrors.detailedTo}</span>}
                      </div>

                      <div className="upload-modal__field">
                        <label className="upload-modal__label">Division</label>
                        <input
                          className="input"
                          type="text"
                          placeholder="Enter division"
                          value={ao.detailedDivision}
                          onChange={(e) => updateAO(index, 'detailedDivision', e.target.value)}
                          disabled={isUploading}
                        />
                      </div>

                      <div className="upload-modal__form-row">
                        <Input
                          id={`appointment-from-${index}`}
                          label="Duration of Detailed Order (From)"
                          type="date"
                          value={ao.appointmentFrom}
                          onChange={(e) => updateAO(index, 'appointmentFrom', e.target.value)}
                          error={currentErrors.appointmentFrom}
                          disabled={isUploading}
                          fullWidth
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                          <Input
                            id={`appointment-to-${index}`}
                            label="Duration of Detailed Order (To)"
                            type={ao.appointmentTo === 'Until revoked' ? 'text' : 'date'}
                            value={ao.appointmentTo}
                            onChange={(e) => updateAO(index, 'appointmentTo', e.target.value)}
                            error={currentErrors.appointmentTo}
                            disabled={isUploading || ao.appointmentTo === 'Until revoked'}
                            fullWidth
                          />
                          <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                              type="checkbox"
                              id={`detailed-until-revoked-upload-${index}`}
                              checked={ao.appointmentTo === 'Until revoked'}
                              onChange={(e) => updateAO(index, 'appointmentTo', e.target.checked ? 'Until revoked' : '')}
                              disabled={isUploading}
                            />
                            <label htmlFor={`detailed-until-revoked-upload-${index}`} style={{ fontSize: '0.85rem' }}>Until revoked</label>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {ao.aoType === 'Designated' && (
                    <>
                      <div className="upload-modal__field">
                        <label className="upload-modal__label">Designated Office</label>
                        <SearchableDropdown
                          id={`designatedOffice-${index}`}
                          options={dropdownOptions.officeNames}
                          value={ao.detailedTo}
                          onChange={(val) => updateAO(index, 'detailedTo', val)}
                          placeholder="Select or enter designated office"
                          disabled={isUploading}
                          className={currentErrors.detailedTo ? 'searchable-dropdown--error' : ''}
                        />
                        {currentErrors.detailedTo && <span className="upload-modal__field-error">⚠️ {currentErrors.detailedTo}</span>}
                      </div>

                      <div className="upload-modal__field">
                        <label className="upload-modal__label">Designated Position Function</label>
                        <SearchableDropdown
                          id={`designatedPositionFunction-${index}`}
                          options={dropdownOptions.positions}
                          value={ao.designatedPositionFunction}
                          onChange={(val) => updateAO(index, 'designatedPositionFunction', val)}
                          placeholder="Select or enter position function"
                          disabled={isUploading}
                          className={currentErrors.designatedPositionFunction ? 'searchable-dropdown--error' : ''}
                        />
                        {currentErrors.designatedPositionFunction && <span className="upload-modal__field-error">⚠️ {currentErrors.designatedPositionFunction}</span>}
                      </div>

                      <div className="upload-modal__form-row">
                        <Input
                          id={`designated-order-from-${index}`}
                          label="Designated Order (From)"
                          type="date"
                          value={ao.designatedOrderFrom}
                          onChange={(e) => updateAO(index, 'designatedOrderFrom', e.target.value)}
                          error={currentErrors.designatedOrderFrom}
                          disabled={isUploading}
                          fullWidth
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                          <Input
                            id={`designated-order-to-${index}`}
                            label="Designated Order (To)"
                            type={ao.designatedOrderTo === 'Until revoked' ? 'text' : 'date'}
                            value={ao.designatedOrderTo}
                            onChange={(e) => updateAO(index, 'designatedOrderTo', e.target.value)}
                            error={currentErrors.designatedOrderTo}
                            disabled={isUploading || ao.designatedOrderTo === 'Until revoked'}
                            fullWidth
                          />
                          <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                              type="checkbox"
                              id={`designated-until-revoked-upload-${index}`}
                              checked={ao.designatedOrderTo === 'Until revoked'}
                              onChange={(e) => updateAO(index, 'designatedOrderTo', e.target.checked ? 'Until revoked' : '')}
                              disabled={isUploading}
                            />
                            <label htmlFor={`designated-until-revoked-upload-${index}`} style={{ fontSize: '0.85rem' }}>Until revoked</label>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {ao.aoType === 'Recalled' && (
                    <>
                      <div className="upload-modal__field">
                        <label className="upload-modal__label">Recalled from</label>
                        <SearchableDropdown
                          id={`recalledFrom-${index}`}
                          options={dropdownOptions.officeNames}
                          value={ao.recalledFrom}
                          onChange={(val) => updateAO(index, 'recalledFrom', val)}
                          placeholder="Select or enter recalled from office"
                          disabled={isUploading}
                          className={currentErrors.recalledFrom ? 'searchable-dropdown--error' : ''}
                        />
                        {currentErrors.recalledFrom && <span className="upload-modal__field-error">⚠️ {currentErrors.recalledFrom}</span>}
                      </div>

                      <div className="upload-modal__field">
                        <label className="upload-modal__label">Recalled to</label>
                        <SearchableDropdown
                          id={`recalledTo-${index}`}
                          options={dropdownOptions.officeNames}
                          value={ao.recalledTo}
                          onChange={(val) => updateAO(index, 'recalledTo', val)}
                          placeholder="Select or enter recalled to office"
                          disabled={isUploading}
                          className={currentErrors.recalledTo ? 'searchable-dropdown--error' : ''}
                        />
                        {currentErrors.recalledTo && <span className="upload-modal__field-error">⚠️ {currentErrors.recalledTo}</span>}
                      </div>

                      <div className="upload-modal__form-row">
                        <Input
                          id={`recalled-order-from-${index}`}
                          label="Duration of recalled Order (From)"
                          type="date"
                          value={ao.recalledOrderFrom}
                          onChange={(e) => updateAO(index, 'recalledOrderFrom', e.target.value)}
                          error={currentErrors.recalledOrderFrom}
                          disabled={isUploading}
                          fullWidth
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                          <Input
                            id={`recalled-order-to-${index}`}
                            label="Duration of recalled Order (To)"
                            type={ao.recalledOrderTo === 'Until revoked' ? 'text' : 'date'}
                            value={ao.recalledOrderTo}
                            onChange={(e) => updateAO(index, 'recalledOrderTo', e.target.value)}
                            error={currentErrors.recalledOrderTo}
                            disabled={isUploading || ao.recalledOrderTo === 'Until revoked'}
                            fullWidth
                          />
                          <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                              type="checkbox"
                              id={`recalled-until-revoked-upload-${index}`}
                              checked={ao.recalledOrderTo === 'Until revoked'}
                              onChange={(e) => updateAO(index, 'recalledOrderTo', e.target.checked ? 'Until revoked' : '')}
                              disabled={isUploading}
                            />
                            <label htmlFor={`recalled-until-revoked-upload-${index}`} style={{ fontSize: '0.85rem' }}>Until revoked</label>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  
                  <div className="upload-modal__field" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <label htmlFor={`file-${index}`} className="upload-modal__label">
                      Select PDF File(s) for this AO
                    </label>
                    <input
                      id={`file-${index}`}
                      type="file"
                      accept=".pdf,application/pdf"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        updateAO(index, 'files', files);
                      }}
                      className="upload-modal__file-input"
                      disabled={isUploading}
                    />
                    {ao.files && ao.files.length > 0 && (
                      <div className="upload-modal__file-list">
                        {ao.files.map((file, i) => (
                          <div key={i} className="upload-modal__file-info">
                            <span className="upload-modal__file-name">📄 {file.name}</span>
                            <span className="upload-modal__file-size">{formatFileSize(file.size)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {currentErrors.files && <span className="upload-modal__field-error">⚠️ {currentErrors.files}</span>}
                  </div>

                  <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '0.25rem' }}>
                    <input
                      type="checkbox"
                      id={`auto-rename-${index}`}
                      checked={ao.autoRename}
                      onChange={(e) => updateAO(index, 'autoRename', e.target.checked)}
                      disabled={isUploading}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <label htmlFor={`auto-rename-${index}`} className="upload-modal__label" style={{ margin: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', fontWeight: 500, fontSize: '0.85rem' }}>
                      Auto rename file according to AO details
                    </label>
                  </div>
                </div>
              );
            })}
            
            <Button 
              type="button" 
              variant="secondary" 
              onClick={addAO} 
              disabled={isUploading}
              style={{ width: '100%', marginBottom: '1rem', borderStyle: 'dashed' }}
            >
              + Add Another AO
            </Button>
          </div>
        )}

        {selectedCategory !== 'Administrative Order' && (
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
        )}
        
        <div className="upload-modal__field compression-field">
          <label className="upload-modal__label">Compression level</label>
          <div className="compression-options">
            <div 
              className={`compression-option ${compressionLevel === 'extreme' ? 'active' : ''}`}
              onClick={() => !isUploading && setCompressionLevel('extreme')}
            >
              <div className="compression-option-text">
                <span className="compression-title">EXTREME COMPRESSION</span>
                <span className="compression-desc">Less quality, high compression</span>
              </div>
              {compressionLevel === 'extreme' && <div className="compression-check">✓</div>}
            </div>
            
            <div 
              className={`compression-option ${compressionLevel === 'recommended' ? 'active' : ''}`}
              onClick={() => !isUploading && setCompressionLevel('recommended')}
            >
              <div className="compression-option-text">
                <span className="compression-title">RECOMMENDED COMPRESSION</span>
                <span className="compression-desc">Good quality, good compression</span>
              </div>
              {compressionLevel === 'recommended' && <div className="compression-check">✓</div>}
            </div>
            
            <div 
              className={`compression-option ${compressionLevel === 'less' ? 'active' : ''}`}
              onClick={() => !isUploading && setCompressionLevel('less')}
            >
              <div className="compression-option-text">
                <span className="compression-title">LESS COMPRESSION</span>
                <span className="compression-desc">High quality, less compression</span>
              </div>
              {compressionLevel === 'less' && <div className="compression-check">✓</div>}
            </div>
          </div>
        </div>

        {/* Removed auto-rename checkbox from here */}

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
            disabled={isUploading || (selectedCategory !== 'Administrative Order' && selectedFiles.length === 0) || (selectedCategory === 'Administrative Order' && aoDataList.some(ao => !ao.files || ao.files.length === 0))}
          >
            {isUploading ? 'Uploading...' : `Upload${selectedCategory !== 'Administrative Order' && selectedFiles.length > 1 ? ` (${selectedFiles.length})` : ''}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default UploadModal;
