import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Employee, EmployeeStatus, AppointmentStatus } from '../types/employee';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import SearchableDropdown from './ui/SearchableDropdown';
import { convertToDateInputFormat } from '../utils/dateUtils';
import { MdLock } from 'react-icons/md';

import api from '../services/api';

export interface EditEmployeeFormData {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  dateOfBirth: string;
  gender: string;
  officeHospitalName: string;
  appointmentStatus: AppointmentStatus | '';
  appointmentFrom: string;
  appointmentTo: string;
  aoNumber: string;
  aoYear: string;
  aoType: 'Detailed' | 'Designated' | 'Recalled' | '';
  status: EmployeeStatus;
  positionFunction: string;
  dateOfEmployment: string;
  dateOfSeparation: string;
  reasonForSeparation: string;
  remarks?: string;
  motherUnit: string;
  detailedTo: string;
  detailedDivision: string;
  detailedOrderFrom: string;
  detailedOrderTo: string;
  designatedPositionFunction: string;
  designatedOrderFrom: string;
  designatedOrderTo: string;
  recalledFrom: string;
  recalledTo: string;
  recalledOrderFrom: string;
  recalledOrderTo: string;
  fileboxLocation: string;
  file201Status: string;
}

interface EditEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  dropdownOptions: {
    officeNames: string[];
    positions: string[];
    appointmentStatuses: string[];
    reasonsForSeparation: string[];
    aoYears: string[];
  };
  onSave: (
    formData: EditEmployeeFormData,
    aoFile: File | null,
    autoRename: boolean,
    replace?: boolean
  ) => Promise<void>;
  isSaving?: boolean;
}

const defaultFormData: EditEmployeeFormData = {
  id: '',
  lastName: '',
  firstName: '',
  middleName: '',
  dateOfBirth: '',
  gender: '',
  officeHospitalName: '',
  appointmentStatus: '',
  appointmentFrom: '',
  appointmentTo: '',
  aoNumber: '',
  aoYear: '',
  aoType: '',
  status: 'Active',
  positionFunction: '',
  dateOfEmployment: '',
  dateOfSeparation: '',
  reasonForSeparation: '',
  remarks: '',
  motherUnit: '',
  detailedTo: '',
  detailedDivision: '',
  detailedOrderFrom: '',
  detailedOrderTo: '',
  designatedPositionFunction: '',
  designatedOrderFrom: '',
  designatedOrderTo: '',
  recalledFrom: '',
  recalledTo: '',
  recalledOrderFrom: '',
  recalledOrderTo: '',
  fileboxLocation: '',
  file201Status: 'Available',
};

function EditEmployeeModal({
  isOpen,
  onClose,
  employee,
  dropdownOptions,
  onSave,
  isSaving = false,
}: EditEmployeeModalProps) {
  const [formData, setFormData] = useState<EditEmployeeFormData>(defaultFormData);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof EditEmployeeFormData, string>>>({});
  const [showIdUpdate, setShowIdUpdate] = useState(false);
  const [aoFile, setAoFile] = useState<File | null>(null);
  const [autoRename, setAutoRename] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{
    isOpen: boolean;
    existingFileName: string;
    existingAoNumber?: string;
    existingAoYear?: string;
  } | null>(null);

  // Sync state when employee opens
  useEffect(() => {
    if (isOpen && employee) {
      setFormData({
        id: employee.id || '',
        lastName: employee.lastName || '',
        firstName: employee.firstName || '',
        middleName: employee.middleName || '',
        dateOfBirth: convertToDateInputFormat(employee.dateOfBirth),
        gender: employee.gender || '',
        officeHospitalName: employee.officeHospitalName || (employee as any).officeName || '',
        appointmentStatus: (employee.appointmentStatus as AppointmentStatus) || '',
        appointmentFrom: convertToDateInputFormat(employee.appointmentFrom),
        appointmentTo: convertToDateInputFormat(employee.appointmentTo),
        aoNumber: employee.aoNumber || '',
        aoYear: (employee as any).aoYear || '',
        aoType: (employee as any).aoType || ((employee as any).isDetailed ? 'Detailed' : ''),
        status: employee.status || 'Active',
        positionFunction: employee.positionFunction || (employee as any).position || '',
        dateOfEmployment: convertToDateInputFormat(employee.dateOfEmployment),
        dateOfSeparation: convertToDateInputFormat(employee.dateOfSeparation),
        reasonForSeparation: (() => {
          const raw = String(employee.reasonForSeparation || (employee as any).reasonOfSeparation || '').trim();
          if (!raw) return '';
          if (raw.includes(' - ')) return raw.split(' - ')[0].trim();
          const knownReasons = [
            'Resigned', 'Retired', 'Terminated', 'Contract Ended', 'Deceased',
            'AWOL', 'Dismissed', 'Transferred', 'End of Contract', 'Separated',
            'Dropped from the Rolls', 'End of Term',
            ...(dropdownOptions.reasonsForSeparation || [])
          ];
          const isReason = knownReasons.some((r) => r.toLowerCase() === raw.toLowerCase());
          return isReason ? raw : '';
        })(),
        remarks: (() => {
          const explicitRemarks = (employee as any).remarks;
          if (explicitRemarks && String(explicitRemarks).trim()) return String(explicitRemarks).trim();
          const raw = String(employee.reasonForSeparation || (employee as any).reasonOfSeparation || '').trim();
          if (!raw) return '';
          if (raw.includes(' - ')) return raw.split(' - ').slice(1).join(' - ').trim();
          const knownReasons = [
            'Resigned', 'Retired', 'Terminated', 'Contract Ended', 'Deceased',
            'AWOL', 'Dismissed', 'Transferred', 'End of Contract', 'Separated',
            'Dropped from the Rolls', 'End of Term',
            ...(dropdownOptions.reasonsForSeparation || [])
          ];
          const isReason = knownReasons.some((r) => r.toLowerCase() === raw.toLowerCase());
          return isReason ? '' : raw;
        })(),
        motherUnit: employee.motherUnit || '',
        detailedTo: employee.detailedTo || '',
        detailedDivision: employee.detailedDivision || '',
        detailedOrderFrom: convertToDateInputFormat((employee as any).detailedOrderFrom),
        detailedOrderTo: convertToDateInputFormat((employee as any).detailedOrderTo),
        designatedPositionFunction: (employee as any).designatedPositionFunction || '',
        designatedOrderFrom: convertToDateInputFormat((employee as any).designatedOrderFrom),
        designatedOrderTo: convertToDateInputFormat((employee as any).designatedOrderTo),
        recalledFrom: (employee as any).recalledFrom || '',
        recalledTo: (employee as any).recalledTo || '',
        recalledOrderFrom: convertToDateInputFormat((employee as any).recalledOrderFrom),
        recalledOrderTo: convertToDateInputFormat((employee as any).recalledOrderTo),
        fileboxLocation: employee.fileboxLocation || '',
        file201Status: employee.file201Status || 'Available',
      });
      setFormErrors({});
      setShowIdUpdate(false);
      setAoFile(null);
      setAutoRename(false);
      setDuplicateConfirm(null);
    }
  }, [isOpen, employee]);

  const handleChange = (field: keyof EditEmployeeFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof EditEmployeeFormData, string>> = {};

    if (!formData.lastName || formData.lastName.trim() === '') errors.lastName = 'Last name cannot be empty';
    if (!formData.firstName || formData.firstName.trim() === '') errors.firstName = 'First name cannot be empty';
    if (!formData.officeHospitalName || formData.officeHospitalName.trim() === '') errors.officeHospitalName = 'Office/Hospital name cannot be empty';

    if (formData.aoNumber && formData.aoNumber.trim() !== '') {
      if (!formData.aoYear) {
        errors.aoYear = 'Series (Year) is required when AO number is provided';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      if (employee) {
        let existingDocs: any[] = (employee as any).documents || [];
        if (employee.id) {
          try {
            const fetched = await api.document.getByEmployee(employee.id);
            if (Array.isArray(fetched) && fetched.length > 0) {
              existingDocs = fetched;
            }
          } catch (err) {
            console.warn('Failed to load employee documents for duplicate check', err);
          }
        }

        let targetFileName = aoFile ? aoFile.name : '';
        if (aoFile && autoRename) {
          const surname = (formData.lastName || employee.lastName || '').trim().toUpperCase();
          const firstName = (formData.firstName || employee.firstName || '').trim().toUpperCase();
          const middleInitial = formData.middleName && formData.middleName.trim() !== ''
            ? formData.middleName.trim().charAt(0).toUpperCase()
            : '';
          const namePart = middleInitial ? `${surname}, ${firstName}, ${middleInitial}.` : `${surname}, ${firstName}`;
          const aoNum = formData.aoNumber.trim() || (employee.aoNumber ? employee.aoNumber.trim() : 'NO AO');
          const aoYr = formData.aoYear.trim() || ((employee as any).aoYear ? String((employee as any).aoYear).trim() : 'NO SERIES');
          const ext = aoFile.name.substring(aoFile.name.lastIndexOf('.')) || '.pdf';
          targetFileName = `${namePart}_AO. ${aoNum}, S. ${aoYr}`.replace(/[/\\?%*:|"<>]/g, '-') + ext;
        }

        const matchActiveAo = Boolean(
          formData.aoNumber &&
          formData.aoNumber.trim() !== '' &&
          employee.aoNumber &&
          String(employee.aoNumber).trim().toLowerCase() === formData.aoNumber.trim().toLowerCase() &&
          String((employee as any).aoYear || '').trim().toLowerCase() === String(formData.aoYear || '').trim().toLowerCase()
        );

        const duplicate = existingDocs.find((doc: any) => {
          if (doc.category !== 'Administrative Order') return false;
          const matchFileName = aoFile && (
            doc.fileName.toLowerCase() === targetFileName.toLowerCase() ||
            doc.fileName.toLowerCase() === aoFile.name.toLowerCase()
          );
          const matchAoNumber =
            doc.aoNumber &&
            formData.aoNumber &&
            formData.aoNumber.trim() !== '' &&
            String(doc.aoNumber).trim().toLowerCase() === formData.aoNumber.trim().toLowerCase() &&
            String(doc.aoYear || '').trim().toLowerCase() === String(formData.aoYear || '').trim().toLowerCase();
          return matchFileName || matchAoNumber;
        });

        if (aoFile && (duplicate || matchActiveAo)) {
          setDuplicateConfirm({
            isOpen: true,
            existingFileName: duplicate?.fileName || (employee.aoNumber ? `AO ${employee.aoNumber}, Series ${(employee as any).aoYear || ''}` : targetFileName),
            existingAoNumber: duplicate?.aoNumber || employee.aoNumber || undefined,
            existingAoYear: duplicate?.aoYear || (employee as any).aoYear || undefined,
          });
          return;
        }
      }

      await onSave(formData, aoFile, autoRename, false);
    } catch (err: any) {
      console.error('Error submitting employee update:', err);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
      onClose={onClose}
      title="Update Employee"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Update Employee'}
          </Button>
        </>
      }
    >
      <div className="dashboard__employee-form">
        <p
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 'var(--border-radius)',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>ℹ️</span> Update only the fields you want to change. Unchanged fields will retain their existing values.
        </p>

        {/* Collapsible ID Update Section */}
        <div className="dashboard__form-section">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setShowIdUpdate(!showIdUpdate)}
          >
            <span
              className="dashboard__form-section-header"
              style={{
                borderBottom: 'none',
                paddingBottom: 0,
                marginBottom: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <MdLock style={{ color: 'var(--color-primary)' }} /> Update Employee ID (Advanced Options)
            </span>
            <span style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600 }}>
              {showIdUpdate ? 'Collapse ▲' : 'Expand ▼'}
            </span>
          </div>

          {showIdUpdate && (
            <div
              className="dashboard__id-update-section"
              style={{
                marginTop: '0.75rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-color)',
              }}
            >
              <p
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--color-warning)',
                  marginBottom: '1rem',
                  fontWeight: 500,
                }}
              >
                ⚠️ Changing the Employee ID will update all references including documents and audit logs. Use with caution.
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                  }}
                >
                  Current Employee ID
                </label>
                <div
                  style={{
                    padding: '0.75rem',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--border-radius)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                  }}
                >
                  {employee?.id}
                </div>
              </div>
              <Input
                id="edit-employee-id"
                label="New Employee ID"
                placeholder="Enter new employee ID (e.g., EMP-002)"
                value={formData.id}
                onChange={(e) => handleChange('id', e.target.value)}
                fullWidth
              />
            </div>
          )}
        </div>

        <div className="dashboard__form-section">
          <h4 className="dashboard__form-section-header">Personal Information</h4>

          <div className="dashboard__form-row">
            <Input
              id="edit-last-name"
              label="Last Name"
              placeholder="Enter last name"
              value={formData.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              error={formErrors.lastName}
              fullWidth
            />
            <Input
              id="edit-first-name"
              label="First Name"
              placeholder="Enter first name"
              value={formData.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              error={formErrors.firstName}
              fullWidth
            />
          </div>

          <Input
            id="edit-middle-name"
            label="Middle Name"
            placeholder="Enter middle name (optional)"
            value={formData.middleName}
            onChange={(e) => handleChange('middleName', e.target.value)}
            fullWidth
          />

          <div className="dashboard__form-row">
            <Input
              id="edit-date-of-birth"
              label="Date of Birth"
              type="date"
              placeholder="Select date of birth (optional)"
              value={formData.dateOfBirth}
              onChange={(e) => handleChange('dateOfBirth', e.target.value)}
              fullWidth
            />

            <div className="dashboard__form-field">
              <label htmlFor="update-gender" className="dashboard__form-label">
                Gender
              </label>
              <select
                id="update-gender"
                className="dashboard__form-select"
                value={formData.gender}
                onChange={(e) => handleChange('gender', e.target.value)}
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
              {formErrors.gender && <span className="dashboard__error">{formErrors.gender}</span>}
            </div>
          </div>
        </div>

        <div className="dashboard__form-section">
          <h4 className="dashboard__form-section-header">Employment Details</h4>

          <div className="dashboard__form-field">
            <label htmlFor="edit-office-hospital-name" className="dashboard__form-label">
              Office / Hospital Name
            </label>
            <SearchableDropdown
              id="edit-office-hospital-name"
              options={dropdownOptions.officeNames}
              value={formData.officeHospitalName}
              onChange={(val) => handleChange('officeHospitalName', val)}
              placeholder="Select or enter office or hospital name"
            />
            {formErrors.officeHospitalName && (
              <span className="dashboard__error">{formErrors.officeHospitalName}</span>
            )}
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="edit-position-function" className="dashboard__form-label">
              Position / Function <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(Optional)</span>
            </label>
            <SearchableDropdown
              id="edit-position-function"
              options={dropdownOptions.positions}
              value={formData.positionFunction}
              onChange={(val) => handleChange('positionFunction', val)}
              placeholder="Select or enter position or function"
            />
          </div>

          <div className="dashboard__form-row">
            <div className="dashboard__form-field">
              <label htmlFor="update-status" className="dashboard__form-label">
                Status
              </label>
              <select
                id="update-status"
                className="dashboard__form-select"
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value as EmployeeStatus)}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <Input
              id="edit-date-of-employment"
              label="Date of Employment"
              type="date"
              value={formData.dateOfEmployment}
              onChange={(e) => handleChange('dateOfEmployment', e.target.value)}
              fullWidth
            />
          </div>

          {formData.status === 'Inactive' && (
            <div style={{ background: 'rgba(239, 68, 68, 0.04)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.15)', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="dashboard__form-row">
                <Input
                  id="edit-date-of-separation"
                  label="Date of Separation"
                  type="date"
                  value={formData.dateOfSeparation}
                  onChange={(e) => handleChange('dateOfSeparation', e.target.value)}
                  fullWidth
                />

                <div className="dashboard__form-field">
                  <label htmlFor="update-reasonForSeparation" className="dashboard__form-label">
                    Reason for Separation <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(Optional)</span>
                  </label>
                  <select
                    id="update-reasonForSeparation"
                    className="dashboard__form-select"
                    value={formData.reasonForSeparation}
                    onChange={(e) => handleChange('reasonForSeparation', e.target.value)}
                  >
                    <option value="">Select reason for separation</option>
                    {dropdownOptions.reasonsForSeparation.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="edit-remarks" className="dashboard__form-label">
                  Remarks <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(Optional)</span>
                </label>
                <Input
                  id="edit-remarks"
                  placeholder="Enter remarks for inactive status"
                  value={formData.remarks || ''}
                  onChange={(e) => handleChange('remarks', e.target.value)}
                  fullWidth
                />
              </div>
            </div>
          )}

          <div className="dashboard__form-field">
            <label htmlFor="update-appointmentStatus" className="dashboard__form-label">
              Appointment Status <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(Optional)</span>
            </label>
            <select
              id="update-appointmentStatus"
              className="dashboard__form-select"
              value={formData.appointmentStatus}
              onChange={(e) => handleChange('appointmentStatus', e.target.value as AppointmentStatus)}
            >
              <option value="">Select appointment status</option>
              {dropdownOptions.appointmentStatuses.map((s) => {
                const displayName = s.endsWith('|date') ? s.slice(0, -5) : s;
                return (
                  <option key={s} value={displayName}>
                    {displayName}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Durational appointment statuses conditional date inputs */}
          {formData.appointmentStatus &&
            (() => {
              const s = formData.appointmentStatus.toLowerCase().trim();
              const isDefaultDurational =
                s === 'consultant' ||
                s === 'contract of service' ||
                s === 'contractual' ||
                s === 'casual' ||
                s === 'job order';
              if (isDefaultDurational) return true;

              const matchedOption = dropdownOptions.appointmentStatuses.find((opt) => {
                const name = opt.endsWith('|date') ? opt.slice(0, -5) : opt;
                return name.toLowerCase().trim() === s;
              });
              return matchedOption ? matchedOption.endsWith('|date') : false;
            })() && (
              <div className="dashboard__form-row">
                <Input
                  id="edit-appointment-from"
                  label="Appointment From"
                  type="date"
                  value={formData.appointmentFrom}
                  onChange={(e) => handleChange('appointmentFrom', e.target.value)}
                  fullWidth
                />
                <Input
                  id="edit-appointment-to"
                  label="Appointment To"
                  type="date"
                  value={formData.appointmentTo}
                  onChange={(e) => handleChange('appointmentTo', e.target.value)}
                  fullWidth
                />
              </div>
            )}
        </div>

        <div className="dashboard__form-section">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.25rem',
            }}
          >
            <h4
              className="dashboard__form-section-header"
              style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}
            >
              Administrative Order (AO) Details
            </h4>
            <button
              type="button"
              onClick={() => {
                handleChange('aoType', '');
                handleChange('aoNumber', '');
                handleChange('aoYear', '');
                handleChange('detailedTo', '');
                handleChange('detailedDivision', '');
                handleChange('detailedOrderFrom', '');
                handleChange('detailedOrderTo', '');
                handleChange('designatedPositionFunction', '');
                handleChange('designatedOrderFrom', '');
                handleChange('designatedOrderTo', '');
                handleChange('recalledFrom', '');
                handleChange('recalledTo', '');
                handleChange('recalledOrderFrom', '');
                handleChange('recalledOrderTo', '');
                setAoFile(null);
              }}
              style={{
                background: 'none',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '3px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--color-danger)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Clear AO Inputs
            </button>
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="update-ao-type" className="dashboard__form-label">
              Type of AO
            </label>
            <select
              id="update-ao-type"
              className="dashboard__form-select"
              value={formData.aoType}
              onChange={(e) => handleChange('aoType', e.target.value as any)}
            >
              <option value="">Select AO Type</option>
              <option value="Detailed">Detailed</option>
              <option value="Designated">Designated</option>
              <option value="Recalled">Recalled</option>
            </select>
          </div>

          <div className="dashboard__form-row">
            <Input
              id="update-ao-number"
              label="AO Number"
              placeholder="Enter Administrative Order number"
              value={formData.aoNumber}
              onChange={(e) => handleChange('aoNumber', e.target.value)}
              fullWidth
            />
            <div className="dashboard__form-field">
              <label htmlFor="update-ao-year" className="dashboard__form-label">
                Series
              </label>
              <select
                id="update-ao-year"
                className={`dashboard__form-select${formErrors.aoYear ? ' dashboard__form-select--error' : ''}`}
                value={formData.aoYear}
                onChange={(e) => handleChange('aoYear', e.target.value)}
              >
                <option value="">Select series year</option>
                {dropdownOptions.aoYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              {formErrors.aoYear && <span className="dashboard__error">{formErrors.aoYear}</span>}
            </div>
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="update-ao-file" className="dashboard__form-label">
              Upload AO PDF File {formData.aoNumber.trim() && formData.aoNumber !== (employee?.aoNumber || '') ? '(Required)' : '(Optional)'}
            </label>
            <input
              id="update-ao-file"
              className="dashboard__form-input"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setAoFile(e.target.files?.[0] || null)}
              style={{
                padding: '0.5rem',
                border: '1px dashed var(--border-color)',
                borderRadius: 'var(--border-radius)',
                backgroundColor: 'var(--bg-secondary)',
                width: '100%',
              }}
            />
            {aoFile && (
              <>
                <p
                  style={{
                    fontSize: '0.8125rem',
                    marginTop: '0.375rem',
                    color: 'var(--color-success)',
                    fontWeight: 500,
                  }}
                >
                  ✓ Selected file: {aoFile.name} ({(aoFile.size / 1024).toFixed(1)} KB)
                </p>
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="update-auto-rename"
                    checked={autoRename}
                    onChange={(e) => setAutoRename(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label
                    htmlFor="update-auto-rename"
                    style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}
                  >
                    Auto rename file according to AO details
                  </label>
                </div>
              </>
            )}
            {formErrors.aoNumber && <span className="dashboard__error">{formErrors.aoNumber}</span>}
          </div>

          {formData.aoType === 'Detailed' && (
            <>
              <div className="dashboard__form-field">
                <label htmlFor="edit-detailedTo" className="dashboard__form-label">
                  Detailed/Transferred Office
                </label>
                <SearchableDropdown
                  id="edit-detailedTo"
                  options={dropdownOptions.officeNames}
                  value={formData.detailedTo}
                  onChange={(val) => handleChange('detailedTo', val)}
                  placeholder="Select or enter office"
                />
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="edit-detailedDivision" className="dashboard__form-label">
                  Division
                </label>
                <input
                  id="edit-detailedDivision"
                  className="dashboard__form-input"
                  type="text"
                  placeholder="Enter division"
                  value={formData.detailedDivision}
                  onChange={(e) => handleChange('detailedDivision', e.target.value)}
                />
              </div>

              <div className="dashboard__form-row">
                <Input
                  id="edit-appointment-from-detailed"
                  label="Duration of Detailed Order (From)"
                  type="date"
                  value={formData.detailedOrderFrom}
                  onChange={(e) => handleChange('detailedOrderFrom', e.target.value)}
                  fullWidth
                />
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <Input
                    id="edit-appointment-to-detailed"
                    label="Duration of Detailed Order (To)"
                    type={formData.detailedOrderTo === 'Until revoked' ? 'text' : 'date'}
                    value={formData.detailedOrderTo}
                    onChange={(e) => handleChange('detailedOrderTo', e.target.value)}
                    disabled={formData.detailedOrderTo === 'Until revoked'}
                    fullWidth
                  />
                  <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="detailed-until-revoked-edit"
                      checked={formData.detailedOrderTo === 'Until revoked'}
                      onChange={(e) => handleChange('detailedOrderTo', e.target.checked ? 'Until revoked' : '')}
                    />
                    <label htmlFor="detailed-until-revoked-edit" style={{ fontSize: '0.85rem' }}>
                      Until revoked
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}

          {formData.aoType === 'Designated' && (
            <>
              <div className="dashboard__form-field">
                <label htmlFor="edit-designatedOffice" className="dashboard__form-label">
                  Designated Office
                </label>
                <SearchableDropdown
                  id="edit-designatedOffice"
                  options={dropdownOptions.officeNames}
                  value={formData.detailedTo}
                  onChange={(val) => handleChange('detailedTo', val)}
                  placeholder="Select or enter designated office"
                />
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="edit-designatedPositionFunction" className="dashboard__form-label">
                  Designated Position Function
                </label>
                <SearchableDropdown
                  id="edit-designatedPositionFunction"
                  options={dropdownOptions.positions}
                  value={formData.designatedPositionFunction}
                  onChange={(val) => handleChange('designatedPositionFunction', val)}
                  placeholder="Select or enter position function"
                />
              </div>

              <div className="dashboard__form-row">
                <Input
                  id="edit-designated-order-from"
                  label="Designated Order (From)"
                  type="date"
                  value={formData.designatedOrderFrom}
                  onChange={(e) => handleChange('designatedOrderFrom', e.target.value)}
                  fullWidth
                />
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <Input
                    id="edit-designated-order-to"
                    label="Designated Order (To)"
                    type={formData.designatedOrderTo === 'Until revoked' ? 'text' : 'date'}
                    value={formData.designatedOrderTo}
                    onChange={(e) => handleChange('designatedOrderTo', e.target.value)}
                    disabled={formData.designatedOrderTo === 'Until revoked'}
                    fullWidth
                  />
                  <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="designated-until-revoked-edit"
                      checked={formData.designatedOrderTo === 'Until revoked'}
                      onChange={(e) => handleChange('designatedOrderTo', e.target.checked ? 'Until revoked' : '')}
                    />
                    <label htmlFor="designated-until-revoked-edit" style={{ fontSize: '0.85rem' }}>
                      Until revoked
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}

          {formData.aoType === 'Recalled' && (
            <>
              <div className="dashboard__form-field">
                <label htmlFor="edit-recalledFrom" className="dashboard__form-label">
                  Recalled from
                </label>
                <SearchableDropdown
                  id="edit-recalledFrom"
                  options={dropdownOptions.officeNames}
                  value={formData.recalledFrom}
                  onChange={(val) => handleChange('recalledFrom', val)}
                  placeholder="Select or enter recalled from office"
                />
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="edit-recalledTo" className="dashboard__form-label">
                  Recalled to
                </label>
                <SearchableDropdown
                  id="edit-recalledTo"
                  options={dropdownOptions.officeNames}
                  value={formData.recalledTo}
                  onChange={(val) => handleChange('recalledTo', val)}
                  placeholder="Select or enter recalled to office"
                />
              </div>

              <div className="dashboard__form-row">
                <Input
                  id="edit-recalled-order-from"
                  label="Recalled Order (From)"
                  type="date"
                  value={formData.recalledOrderFrom}
                  onChange={(e) => handleChange('recalledOrderFrom', e.target.value)}
                  fullWidth
                />
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <Input
                    id="edit-recalled-order-to"
                    label="Recalled Order (To)"
                    type={formData.recalledOrderTo === 'Until revoked' ? 'text' : 'date'}
                    value={formData.recalledOrderTo}
                    onChange={(e) => handleChange('recalledOrderTo', e.target.value)}
                    disabled={formData.recalledOrderTo === 'Until revoked'}
                    fullWidth
                  />
                  <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="recalled-until-revoked-edit"
                      checked={formData.recalledOrderTo === 'Until revoked'}
                      onChange={(e) => handleChange('recalledOrderTo', e.target.checked ? 'Until revoked' : '')}
                    />
                    <label htmlFor="recalled-until-revoked-edit" style={{ fontSize: '0.85rem' }}>
                      Until revoked
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>

    {duplicateConfirm && createPortal(
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999999,
          padding: '1rem',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDuplicateConfirm(null);
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderRadius: 'var(--border-radius-lg, 12px)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.55)',
            width: '100%',
            maxWidth: '560px',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--bg-primary)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Duplicate Administrative Order Document
            </h3>
            <button
              type="button"
              onClick={() => setDuplicateConfirm(null)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.25rem',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ padding: '1.5rem' }}>
            <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              An Administrative Order document with this name or AO Number already exists for this employee in <strong>Documents</strong>:
            </p>
            <div
              style={{
                padding: '0.875rem 1.25rem',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius, 8px)',
                marginBottom: '1.25rem',
              }}
            >
              <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-all', fontSize: '0.95rem' }}>
                📄 {duplicateConfirm?.existingFileName}
              </p>
              {(duplicateConfirm?.existingAoNumber || duplicateConfirm?.existingAoYear) && (
                <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  AO Number: {duplicateConfirm?.existingAoNumber || '—'} {duplicateConfirm?.existingAoYear ? `, Series: ${duplicateConfirm.existingAoYear}` : ''}
                </p>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '0.925rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              Do you want to <strong>replace</strong> the existing file with your newly selected file, or <strong>keep the existing file</strong> and proceed to submit the update request?
            </p>
          </div>
          <div
            style={{
              padding: '1rem 1.5rem',
              backgroundColor: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant="secondary"
              onClick={() => setDuplicateConfirm(null)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                setDuplicateConfirm(null);
                await onSave(formData, null, false, false);
              }}
              disabled={isSaving}
            >
              Keep Existing File
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                setDuplicateConfirm(null);
                await onSave(formData, aoFile, autoRename, true);
              }}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Replace Existing File'}
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}

export default EditEmployeeModal;
