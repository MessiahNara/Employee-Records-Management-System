import { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import SearchableDropdown from './ui/SearchableDropdown';
import api from '../services/api';
import './CreateRecordSeriesModal.css';

const DEFAULT_RECORD_LOCATIONS = [
  'Filing Cabinet A', 'Filing Cabinet B', 'Storage Room 1', 'Vault Room', 'HR Records Office', 'Archive Room'
];

export interface RecordSeriesFormData {
  id?: string;
  itemNo?: string;
  prdsGrds?: string;
  seriesTitle: string;
  division?: string;
  classificationCategory: string;
  subCategory?: string;
  scopeDescription?: string;
  inclusiveDates: string;
  volume: string;
  medium: string;
  restrictions?: string;
  locationOfRecords: string;
  frequencyOfUse: string;
  duplication: string;
  appraisalCategory: string;
  utilityValue: string;
  activeDeskYrs: number;
  storageYrs: number;
  totalRetention: number;
  dispositionProvision: string;
  retentionStage?: 'Active' | 'Storage' | 'Disposed';
  storageStartDate?: string;
}

interface CreateRecordSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: RecordSeriesFormData) => Promise<void>;
  initialData?: RecordSeriesFormData | null;
  allowedDivisions?: string[];
}

const defaultFormState: RecordSeriesFormData = {
  itemNo: '',
  prdsGrds: '',
  seriesTitle: '',
  division: '',
  classificationCategory: '',
  subCategory: '',
  scopeDescription: '',
  inclusiveDates: '',
  volume: '',
  medium: 'Paper',
  restrictions: '',
  locationOfRecords: '',
  frequencyOfUse: 'Active',
  duplication: 'Original',
  appraisalCategory: 'Temporary',
  utilityValue: 'Adm (Administrative)',
  activeDeskYrs: 0,
  storageYrs: 0,
  totalRetention: 0,
  dispositionProvision: '',
  retentionStage: 'Active',
};

const parseInclusiveDates = (datesStr: string) => {
  const currentYr = String(new Date().getFullYear());
  if (!datesStr) return { startYear: '', endYear: '', isOngoing: false, dateMode: 'range', customDates: '' };

  const str = datesStr.trim();
  const lower = str.toLowerCase();
  const yearMatches = str.match(/\b\d{4}\b/g) || [];

  // If contains commas, semicolons, or more than 2 years (e.g. 2022, 2024 - 2026), treat as custom non-contiguous dates
  if (str.includes(',') || str.includes(';') || yearMatches.length > 2) {
    return { startYear: '', endYear: '', isOngoing: false, dateMode: 'custom', customDates: str };
  }

  if (lower.includes('present')) {
    const start = yearMatches[0] || '';
    return { startYear: start, endYear: '', isOngoing: true, dateMode: 'range', customDates: '' };
  }

  if (yearMatches.length === 2) {
    return { startYear: yearMatches[0], endYear: yearMatches[1], isOngoing: false, dateMode: 'range', customDates: '' };
  } else if (yearMatches.length === 1) {
    return { startYear: yearMatches[0], endYear: '', isOngoing: false, dateMode: 'range', customDates: '' };
  }

  return { startYear: '', endYear: '', isOngoing: false, dateMode: 'custom', customDates: str };
};

function CreateRecordSeriesModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  allowedDivisions,
}: CreateRecordSeriesModalProps) {
  const currentYear = new Date().getFullYear();
  const [formData, setFormData] = useState<RecordSeriesFormData & { startYear: string; endYear: string; isOngoing: boolean; dateMode?: 'range' | 'custom'; customDates?: string }>({
    ...defaultFormState,
    startYear: '',
    endYear: '',
    isOngoing: false,
    dateMode: 'range',
    customDates: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [dispositionOptions, setDispositionOptions] = useState<string[]>([]);
  const [itemNoOptions, setItemNoOptions] = useState<string[]>([]);
  const [prdsGrdsOptions, setPrdsGrdsOptions] = useState<string[]>([]);
  const [divisionOptions, setDivisionOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      api.systemSettings.get()
        .then((settings) => {
          const locs = (settings as any)?.recordLocations;
          if (Array.isArray(locs)) {
            setLocationOptions(locs);
          }
          const provs = (settings as any)?.dispositionProvisions;
          if (Array.isArray(provs)) {
            setDispositionOptions(provs);
          }
          const items = (settings as any)?.itemNumbers;
          if (Array.isArray(items)) {
            setItemNoOptions(items);
          }
          const prds = (settings as any)?.prdsGrds;
          if (Array.isArray(prds)) {
            setPrdsGrdsOptions(prds);
          }
          const divs = (settings as any)?.divisions;
          if (Array.isArray(divs)) {
            if (allowedDivisions && allowedDivisions.length > 0 && !allowedDivisions.includes('ALL')) {
               const filteredDivs = divs.filter((d: string) => allowedDivisions.some((ad: string) => ad.trim().toLowerCase() === d.trim().toLowerCase()));
               const optionsToUse = filteredDivs.length > 0 ? filteredDivs : allowedDivisions;
               setDivisionOptions(optionsToUse);
            } else {
               setDivisionOptions(divs);
            }
          }
          const cats = (settings as any)?.classificationCategories;
          if (Array.isArray(cats)) {
            setCategoryOptions(cats);
          }
          const subs = (settings as any)?.subCategories;
          if (Array.isArray(subs)) {
            setSubCategoryOptions(subs);
          }
        })
        .catch(() => { });
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      const parsedDates = parseInclusiveDates(initialData.inclusiveDates || '');
      setFormData({
        ...initialData,
        scopeDescription: initialData.scopeDescription || '',
        restrictions: initialData.restrictions || '',
        activeDeskYrs: Number(initialData.activeDeskYrs) || 0,
        storageYrs: Number(initialData.storageYrs) || 0,
        totalRetention: Number(initialData.activeDeskYrs || 0) + Number(initialData.storageYrs || 0),
        startYear: parsedDates.startYear,
        endYear: parsedDates.endYear,
        isOngoing: parsedDates.isOngoing,
        dateMode: parsedDates.dateMode as any || 'range',
        customDates: parsedDates.customDates || '',
      });
    } else {
      setFormData({
        ...defaultFormState,
        startYear: '',
        endYear: '',
        isOngoing: false,
        dateMode: 'range',
        customDates: '',
      });
    }
    
    // Auto-select division if there's only 1 option and no initialData division provided
    if (allowedDivisions && allowedDivisions.length === 1 && !allowedDivisions.includes('ALL') && (!initialData || !initialData.division)) {
      setFormData(prev => ({ ...prev, division: allowedDivisions[0] }));
    }
    
    setError('');
  }, [initialData, isOpen, allowedDivisions]);

  const handleActiveDeskChange = (yrs: number) => {
    const active = Math.max(0, yrs);
    const total = active + (Number(formData.storageYrs) || 0);
    setFormData(prev => ({ ...prev, activeDeskYrs: active, totalRetention: total }));
  };

  const handleStorageChange = (yrs: number) => {
    const storage = Math.max(0, yrs);
    const total = (Number(formData.activeDeskYrs) || 0) + storage;
    setFormData(prev => ({ ...prev, storageYrs: storage, totalRetention: total }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.seriesTitle.trim()) {
      setError('Record Series Title is required.');
      return;
    }

    let finalInclusiveDates = '';

    if (formData.dateMode === 'custom' || (formData.customDates && formData.customDates.trim())) {
      finalInclusiveDates = (formData.customDates || '').trim();
    }

    if (!finalInclusiveDates) {
      const startYr = formData.startYear.trim();
      const endYr = formData.endYear.trim();

      if (formData.isOngoing) {
        if (startYr) {
          finalInclusiveDates = `${startYr} - Present`;
        } else {
          finalInclusiveDates = 'Present';
        }
      } else if (startYr && endYr) {
        finalInclusiveDates = `${startYr} - ${endYr}`;
      } else if (startYr) {
        finalInclusiveDates = `${startYr}`;
      } else if (endYr) {
        finalInclusiveDates = `${endYr}`;
      }
    }

    if (!finalInclusiveDates) {
      setError('Inclusive Dates is required (e.g. 2024 - 2026 or 2022, 2024 - 2026).');
      return;
    }
    if (!formData.locationOfRecords.trim()) {
      setError('Location of Records is required.');
      return;
    }

    const { startYear, endYear, isOngoing, dateMode, customDates, ...payloadData } = formData;
    payloadData.inclusiveDates = finalInclusiveDates;

    setIsSubmitting(true);
    setError('');
    try {
      await onSave(payloadData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save record series.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Record Series Entry' : 'Create Record Series Entry'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Record Series'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="record-modal__form">
        {error && (
          <div style={{ padding: '0.75rem 1rem', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Section 1: General Info */}
        <div className="record-modal__section">
          <div className="record-modal__section-title">
            Record Series Details
          </div>

          <div className="record-modal__grid-2">
            <div className="record-modal__field">
              <label className="record-modal__label">
                Record Series Title <span className="record-modal__required">*</span>
              </label>
              <input
                type="text"
                className="record-modal__input"
                placeholder="e.g. Leave Ledgers, PPSB Resolutions"
                value={formData.seriesTitle}
                onChange={(e) => setFormData({ ...formData, seriesTitle: e.target.value })}
                required
              />
            </div>

            <div className="record-modal__field">
              <label className="record-modal__label">
                PRDS/GRDS
              </label>
              <SearchableDropdown
                options={prdsGrdsOptions.length > 0 ? prdsGrdsOptions : ['GRDS 2009', 'GRDS 2021', 'GRDS', 'PRDS']}
                value={formData.prdsGrds || ''}
                onChange={(val) => setFormData(prev => ({ ...prev, prdsGrds: val }))}
                placeholder="Select or type PRDS/GRDS"
              />
            </div>

            <div className="record-modal__field">
              <label className="record-modal__label">
                Item No.
              </label>
              <SearchableDropdown
                options={itemNoOptions.length > 0 ? itemNoOptions : ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5']}
                value={formData.itemNo || ''}
                onChange={(val) => setFormData(prev => ({ ...prev, itemNo: val }))}
                placeholder="Select or type Item No."
              />
            </div>

            <div className="record-modal__field">
              <label className="record-modal__label">
                Division
              </label>
              <SearchableDropdown
                options={divisionOptions.length > 0 ? divisionOptions : ['ADMINISTRATIVE', 'FINANCE', 'LEGAL', 'RECORDS DIVISION', 'HUMAN RESOURCE', 'OPERATIONS']}
                value={formData.division || ''}
                onChange={(val) => setFormData(prev => ({ ...prev, division: val }))}
                placeholder="Select or type Division"
              />
            </div>

            <div className="record-modal__field">
              <label className="record-modal__label">
                Classification Category
              </label>
              <SearchableDropdown
                options={categoryOptions.length > 0 ? categoryOptions : [
                  'ADMINISTRATIVE',
                  'CSC GENERATED RECORDS',
                  'EMPLOYEE WELFARE, WELLNESS AND REWARDS',
                  'LEAVE RECORDS',
                  'LOGBOOK',
                  'ORDERS',
                  'PAYROLL DRAFT ATTACHMENTS',
                  'QUALITY MANAGEMENT SYSTEM',
                  'RECRUITMENT AND PLACEMENT',
                  'TRAINING AND EMPLOYEE DEVELOPMENT',
                  'FINANCE',
                  'LEGAL',
                  'ARCHIVAL',
                  'ISO GENERATED RECORDS',
                  'ISO DOCUMENTS'
                ]}
                value={formData.classificationCategory}
                onChange={(val) => setFormData(prev => ({ ...prev, classificationCategory: val }))}
                placeholder="Select or type Classification Category"
              />
            </div>

            <div className="record-modal__field">
              <label className="record-modal__label">
                Sub Category
              </label>
              <SearchableDropdown
                options={subCategoryOptions.length > 0 ? subCategoryOptions : [
                  'General Administration',
                  'Personnel Records',
                  'Financial Documents',
                  'Legal Files',
                  'Reports & Minutes',
                  'Policies & Directives',
                  'Certificates & Permits'
                ]}
                value={formData.subCategory || ''}
                onChange={(val) => setFormData(prev => ({ ...prev, subCategory: val }))}
                placeholder="Select or type Sub Category"
              />
            </div>
          </div>

          <div className="record-modal__field">
            <label className="record-modal__label">Scope Description & File Purpose</label>
            <textarea
              className="record-modal__textarea"
              placeholder="Provide context regarding record functions, file contents, and legal requirements..."
              value={formData.scopeDescription}
              onChange={(e) => setFormData({ ...formData, scopeDescription: e.target.value })}
            />
          </div>
        </div>

        {/* Section 2: Location & Storage */}
        <div className="record-modal__section">
          <div className="record-modal__section-title">
            Location, Medium & Restrictions
          </div>

          <div className="record-modal__grid-2">
            <div className="record-modal__field">
              <label className="record-modal__label">
                Location of Records <span className="record-modal__required">*</span>
              </label>
              <SearchableDropdown
                options={locationOptions}
                value={formData.locationOfRecords}
                onChange={(val) => setFormData({ ...formData, locationOfRecords: val })}
                placeholder="Search or type location..."
              />
            </div>

            <div className="record-modal__field">
              <label className="record-modal__label">
                Volume <span className="record-modal__required">*</span>
              </label>
              <input
                type="text"
                className="record-modal__input"
                placeholder="e.g. 0.011376 / 1 Folder"
                value={formData.volume}
                onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="record-modal__field" style={{ marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label className="record-modal__label" style={{ marginBottom: 0 }}>
                Inclusive Dates <span className="record-modal__required">*</span>
              </label>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    background: formData.dateMode !== 'custom' ? 'var(--primary-color)' : 'transparent',
                    color: formData.dateMode !== 'custom' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={() => setFormData(prev => ({ ...prev, dateMode: 'range' }))}
                >
                  Range
                </button>
                <button
                  type="button"
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)',
                    background: formData.dateMode === 'custom' ? 'var(--primary-color)' : 'transparent',
                    color: formData.dateMode === 'custom' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onClick={() => setFormData(prev => {
                    let customVal = prev.customDates;
                    if (!customVal && (prev.startYear || prev.endYear)) {
                      if (prev.isOngoing) {
                        customVal = prev.startYear ? `${prev.startYear} - Present` : 'Present';
                      } else if (prev.startYear && prev.endYear) {
                        customVal = `${prev.startYear} - ${prev.endYear}`;
                      } else {
                        customVal = prev.startYear || prev.endYear;
                      }
                    }
                    return { ...prev, dateMode: 'custom', customDates: customVal };
                  })}
                >
                  Non-contiguous / Custom
                </button>
              </div>
            </div>

            {formData.dateMode === 'custom' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <input
                  type="text"
                  className="record-modal__input"
                  placeholder="e.g. 2022, 2024 - Present or 2022, 2024 - 2026"
                  value={formData.customDates || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, customDates: e.target.value }))}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  💡 Use commas for skipped years and <code>Present</code> for ongoing records (e.g. <code>2022, 2024 - Present</code> will dynamically show <code>2022, 2024 - 2026</code> today and <code>2022, 2024 - 2027</code> next year).
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="number"
                    className="record-modal__input"
                    placeholder="Start Year (e.g. 2025)"
                    min="1900"
                    max="2099"
                    value={formData.startYear}
                    onChange={(e) => setFormData(prev => ({ ...prev, startYear: e.target.value, customDates: '' }))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>–</span>
                  <input
                    type="number"
                    className="record-modal__input"
                    placeholder={formData.isOngoing ? `Present (${currentYear})` : "End Year (e.g. 2026)"}
                    min="1900"
                    max="2099"
                    value={formData.isOngoing ? '' : formData.endYear}
                    onChange={(e) => setFormData(prev => ({ ...prev, endYear: e.target.value, customDates: '' }))}
                    disabled={formData.isOngoing}
                    style={{ flex: 1, opacity: formData.isOngoing ? 0.6 : 1 }}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={formData.isOngoing}
                    onChange={(e) => setFormData(prev => ({ ...prev, isOngoing: e.target.checked }))}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Ongoing / Up to Present ({currentYear})</span>
                </label>
              </div>
            )}
          </div>

          <div className="record-modal__grid-4">
            <div className="record-modal__field">
              <label className="record-modal__label">Medium</label>
              <select
                className="record-modal__select"
                value={formData.medium}
                onChange={(e) => setFormData({ ...formData, medium: e.target.value })}
              >
                <option value="Paper">Paper</option>
                <option value="Digital">Digital</option>
                <option value="Mixed Media">Mixed Media</option>
              </select>
            </div>

            <div className="record-modal__field">
              <label className="record-modal__label">Frequency of Use</label>
              <select
                className="record-modal__select"
                value={formData.frequencyOfUse}
                onChange={(e) => setFormData({ ...formData, frequencyOfUse: e.target.value })}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="As the need arises">As the need arises</option>
              </select>
            </div>

            <div className="record-modal__field">
              <label className="record-modal__label">Duplication</label>
              <select
                className="record-modal__select"
                value={formData.duplication}
                onChange={(e) => setFormData({ ...formData, duplication: e.target.value })}
              >
                <option value="Original">Original</option>
                <option value="Duplication">Duplication</option>
                <option value="Both">Both</option>
              </select>
            </div>

            <div className="record-modal__field">
              <label className="record-modal__label">Restrictions</label>
              <input
                type="text"
                className="record-modal__input"
                placeholder="Enter restrictions..."
                value={formData.restrictions}
                onChange={(e) => setFormData({ ...formData, restrictions: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Appraisal & Retention */}
        <div className="record-modal__section">
          <div className="record-modal__section-title">
            Retention Schedule & Appraisal
          </div>

          <div className="record-modal__grid-2">
            <div className="record-modal__field">
              <label className="record-modal__label">Appraisal Category</label>
              <select
                className="record-modal__select"
                value={formData.appraisalCategory}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'Permanent') {
                    setFormData(prev => ({
                      ...prev,
                      appraisalCategory: val,
                      activeDeskYrs: 0,
                      storageYrs: 0,
                      totalRetention: 0,
                    }));
                  } else {
                    setFormData(prev => ({ ...prev, appraisalCategory: val }));
                  }
                }}
              >
                <option value="Temporary">Temporary</option>
                <option value="Permanent">Permanent</option>
              </select>
            </div>

            <div className="record-modal__field">
              <label className="record-modal__label">Utility Value</label>
              <select
                className="record-modal__select"
                value={formData.utilityValue}
                onChange={(e) => setFormData({ ...formData, utilityValue: e.target.value })}
              >
                <option value="Adm (Administrative)">Adm (Administrative)</option>
                <option value="Fiscal (Accounting)">Fiscal (Accounting)</option>
                <option value="Legal (Legal/Contracts)">Legal (Legal/Contracts)</option>
                <option value="Arc (Historical)">Arc (Historical)</option>
                <option value="Mixed Utility">Mixed Utility</option>
              </select>
            </div>
          </div>

          {formData.appraisalCategory === 'Permanent' ? (
            <div style={{ padding: '0.85rem 1rem', backgroundColor: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '8px', color: '#6366f1', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔵 Permanent Record — Retained indefinitely (no retention years needed).
            </div>
          ) : (
            <div className="record-modal__grid-3">
              <div className="record-modal__field">
                <label className="record-modal__label">Active Desk (Years)</label>
                <input
                  type="number"
                  min="0"
                  className="record-modal__input"
                  value={formData.activeDeskYrs}
                  onChange={(e) => handleActiveDeskChange(parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="record-modal__field">
                <label className="record-modal__label">Storage (Years)</label>
                <input
                  type="number"
                  min="0"
                  className="record-modal__input"
                  value={formData.storageYrs}
                  onChange={(e) => handleStorageChange(parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="record-modal__field">
                <label className="record-modal__label">Total Retention (Years)</label>
                <div className="record-modal__retention-badge">
                  {formData.totalRetention} Year{formData.totalRetention === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          )}

          <div className="record-modal__field">
            <label className="record-modal__label">Disposition Provision</label>
            <SearchableDropdown
              options={dispositionOptions}
              value={formData.dispositionProvision}
              onChange={(val) => setFormData({ ...formData, dispositionProvision: val })}
              placeholder="Search or type disposition provision..."
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default CreateRecordSeriesModal;
