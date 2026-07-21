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
  seriesTitle: string;
  classificationCategory: string;
  scopeDescription: string;
  inclusiveDates: string;
  volume: string;
  medium: string;
  restrictions: string;
  locationOfRecords: string;
  frequencyOfUse: string;
  duplication: string;
  appraisalCategory: string;
  utilityValue: string;
  activeDeskYrs: number;
  storageYrs: number;
  totalRetention: number;
  dispositionProvision: string;
}

interface CreateRecordSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: RecordSeriesFormData) => Promise<void>;
  initialData?: RecordSeriesFormData | null;
}

const defaultFormState: RecordSeriesFormData = {
  seriesTitle: '',
  classificationCategory: 'ADMINISTRATIVE',
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
};

function CreateRecordSeriesModal({
  isOpen,
  onClose,
  onSave,
  initialData,
}: CreateRecordSeriesModalProps) {
  const [formData, setFormData] = useState<RecordSeriesFormData>(defaultFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [locationOptions, setLocationOptions] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      api.systemSettings.get()
        .then((settings) => {
          const locs = (settings as any)?.recordLocations;
          if (Array.isArray(locs)) {
            setLocationOptions(locs);
          }
        })
        .catch(() => { });
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        scopeDescription: initialData.scopeDescription || '',
        restrictions: initialData.restrictions || '',
        activeDeskYrs: Number(initialData.activeDeskYrs) || 0,
        storageYrs: Number(initialData.storageYrs) || 0,
        totalRetention: Number(initialData.activeDeskYrs || 0) + Number(initialData.storageYrs || 0),
      });
    } else {
      setFormData(defaultFormState);
    }
    setError('');
  }, [initialData, isOpen]);

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
    if (!formData.inclusiveDates.trim()) {
      setError('Inclusive Dates is required.');
      return;
    }
    if (!formData.locationOfRecords.trim()) {
      setError('Location of Records is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onSave(formData);
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
                Classification Category <span className="record-modal__required">*</span>
              </label>
              <select
                className="record-modal__select"
                value={formData.classificationCategory}
                onChange={(e) => setFormData({ ...formData, classificationCategory: e.target.value })}
              >
                <option value="ADMINISTRATIVE">ADMINISTRATIVE</option>
                <option value="CSC GENERATED RECORDS">CSC GENERATED RECORDS</option>
                <option value="EMPLOYEE WELFARE, WELLNESS AND REWARDS">EMPLOYEE WELFARE, WELLNESS AND REWARDS</option>
                <option value="LEAVE RECORDS">LEAVE RECORDS</option>
                <option value="LOGBOOK">LOGBOOK</option>
                <option value="ORDERS">ORDERS</option>
                <option value="PAYROLL DRAFT ATTACHMENTS">PAYROLL DRAFT ATTACHMENTS</option>
                <option value="QUALITY MANAGEMENT SYSTEM">QUALITY MANAGEMENT SYSTEM</option>
                <option value="RECRUITMENT AND PLACEMENT">RECRUITMENT AND PLACEMENT</option>
                <option value="TRAINING AND EMPLOYEE DEVELOPMENT">TRAINING AND EMPLOYEE DEVELOPMENT</option>
                <option value="FINANCE">FINANCE</option>
                <option value="LEGAL">LEGAL</option>
                <option value="ARCHIVAL">ARCHIVAL</option>
                <option value="ISO GENERATED RECORDS">ISO GENERATED RECORDS</option>
                <option value="ISO DOCUMENTS">ISO DOCUMENTS</option>
              </select>
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

          <div className="record-modal__grid-3">
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
                Inclusive Dates <span className="record-modal__required">*</span>
              </label>
              <input
                type="text"
                className="record-modal__input"
                placeholder="e.g. 2026-present"
                value={formData.inclusiveDates}
                onChange={(e) => setFormData({ ...formData, inclusiveDates: e.target.value })}
                required
              />
            </div>

            <div className="record-modal__field">
              <label className="record-modal__label">
                Volume <span className="record-modal__required">*</span>
              </label>
              <input
                type="text"
                className="record-modal__input"
                placeholder="e.g. 0.011376 cu. m."
                value={formData.volume}
                onChange={(e) => setFormData({ ...formData, volume: e.target.value })}
                required
              />
            </div>
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
                onChange={(e) => setFormData({ ...formData, appraisalCategory: e.target.value })}
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

          <div className="record-modal__field">
            <label className="record-modal__label">Disposition Provision</label>
            <input
              type="text"
              className="record-modal__input"
              placeholder="e.g. Dispose after completion of audit"
              value={formData.dispositionProvision}
              onChange={(e) => setFormData({ ...formData, dispositionProvision: e.target.value })}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default CreateRecordSeriesModal;
