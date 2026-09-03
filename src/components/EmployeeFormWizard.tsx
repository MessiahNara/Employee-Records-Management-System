import React, { useState, useMemo, useEffect } from 'react';
import Button from './ui/Button';
import Input from './ui/Input';
import SearchableDropdown from './ui/SearchableDropdown';
import ProfilePictureUpload from './ProfilePictureUpload';
import { MdPerson, MdWork, MdDescription, MdCheck, MdArrowForward, MdArrowBack, MdWarning } from 'react-icons/md';
import './EmployeeFormWizard.css';

export interface EmployeeWizardFormData {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  dateOfBirth: string;
  gender: string;
  officeHospitalName: string;
  positionFunction: string;
  status: 'Active' | 'Inactive';
  dateOfEmployment: string;
  dateOfSeparation: string;
  reasonForSeparation: string;
  remarks?: string;
  appointmentStatus: string;
  appointmentFrom: string;
  appointmentTo: string;
  aoType: 'Detailed' | 'Designated' | 'Recalled' | '';
  aoNumber: string;
  aoYear: string;
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
}

interface DropdownOptions {
  appointmentStatuses: string[];
  officeNames: string[];
  positions: string[];
  reasonsForSeparation: string[];
  aoYears: string[];
}

interface EmployeeFormWizardProps {
  formData: EmployeeWizardFormData;
  onChange?: (field: keyof EmployeeWizardFormData, value: any) => void;
  formErrors: Record<string, string>;
  dropdownOptions: DropdownOptions;
  existingEmployeeIds?: string[];
  existingAoKeys?: string[]; // e.g. "AO-123_2024"
  aoFile: File | null;
  setAoFile: (file: File | null) => void;
  autoRename: boolean;
  setAutoRename: (val: boolean) => void;
  profilePicture?: string;
  setProfilePicture: (pic: string | undefined) => void;
  onSave: (data?: EmployeeWizardFormData) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export const EmployeeFormWizard: React.FC<EmployeeFormWizardProps> = ({
  formData,
  onChange,
  formErrors,
  dropdownOptions,
  existingEmployeeIds = [],
  existingAoKeys = [],
  aoFile,
  setAoFile,
  autoRename,
  setAutoRename,
  profilePicture,
  setProfilePicture,
  onSave,
  onCancel,
  isSaving = false,
}) => {
  const [localFormData, setLocalFormData] = useState<EmployeeWizardFormData>(formData);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setLocalFormData(formData);
  }, [formData]);

  const handleChange = (field: keyof EmployeeWizardFormData, value: any) => {
    setLocalFormData((prev) => ({ ...prev, [field]: value }));
    onChange?.(field, value);
    if (stepErrors[field]) {
      setStepErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  // Check duplicate ID
  const isDuplicateId = useMemo(() => {
    if (!localFormData.id || !localFormData.id.trim()) return false;
    const clean = localFormData.id.trim().toLowerCase();
    return existingEmployeeIds.some((id) => id.trim().toLowerCase() === clean);
  }, [localFormData.id, existingEmployeeIds]);

  // Check duplicate AO
  const isDuplicateAo = useMemo(() => {
    if (!localFormData.aoNumber.trim() || !localFormData.aoYear.trim()) return false;
    const key = `${localFormData.aoNumber.trim().toLowerCase()}_${localFormData.aoYear.trim().toLowerCase()}`;
    return existingAoKeys.some((k) => k.toLowerCase() === key);
  }, [localFormData.aoNumber, localFormData.aoYear, existingAoKeys]);

  // Determine if Step 1 is valid
  const isStep1Valid = useMemo(() => {
    return (
      localFormData.id.trim().length > 0 &&
      !isDuplicateId &&
      localFormData.lastName.trim().length > 0 &&
      localFormData.firstName.trim().length > 0 &&
      localFormData.gender.trim().length > 0
    );
  }, [localFormData.id, isDuplicateId, localFormData.lastName, localFormData.firstName, localFormData.gender]);

  // Determine if Step 2 is valid
  const isStep2Valid = useMemo(() => {
    return (
      localFormData.officeHospitalName.trim().length > 0 &&
      localFormData.positionFunction.trim().length > 0
    );
  }, [localFormData.officeHospitalName, localFormData.positionFunction]);

  // Validate step before advancing
  const handleNextStep = () => {
    const errs: Record<string, string> = {};

    if (currentStep === 1) {
      if (!localFormData.id.trim()) errs.id = 'Employee ID is required';
      else if (isDuplicateId) errs.id = 'Employee ID already exists!';
      if (!localFormData.lastName.trim()) errs.lastName = 'Last Name is required';
      if (!localFormData.firstName.trim()) errs.firstName = 'First Name is required';
      if (!localFormData.gender.trim()) errs.gender = 'Gender is required';

      if (Object.keys(errs).length > 0) {
        setStepErrors(errs);
        return;
      }
      setStepErrors({});
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!localFormData.officeHospitalName.trim()) errs.officeHospitalName = 'Office / Hospital is required';

      if (Object.keys(errs).length > 0) {
        setStepErrors(errs);
        return;
      }
      setStepErrors({});
      setCurrentStep(3);
    }
  };

  const handlePrevStep = () => {
    setStepErrors({});
    if (currentStep === 3) setCurrentStep(2);
    else if (currentStep === 2) setCurrentStep(1);
  };

  const calculateProgress = () => {
    if (currentStep === 1) return 33;
    if (currentStep === 2) return 66;
    return 100;
  };

  // Helper for durational appointment statuses
  const isDurationalAppointment = useMemo(() => {
    if (!localFormData.appointmentStatus) return false;
    const s = localFormData.appointmentStatus.toLowerCase().trim();
    const isDefaultDurational = (
      s === 'consultant' ||
      s === 'contract of service' ||
      s === 'contractual' ||
      s === 'casual' ||
      s === 'job order'
    );
    if (isDefaultDurational) return true;

    const matchedOption = dropdownOptions.appointmentStatuses.find((opt) => {
      const name = opt.endsWith('|date') ? opt.slice(0, -5) : opt;
      return name.toLowerCase().trim() === s;
    });
    return matchedOption ? matchedOption.endsWith('|date') : false;
  }, [localFormData.appointmentStatus, dropdownOptions.appointmentStatuses]);

  const clearAoInputs = () => {
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
  };

  return (
    <div className="form-wizard">
      {/* Stepper Header */}
      <div className="form-wizard__stepper">
        <ol className="form-wizard__steps-list">
          {/* Step 1 */}
          <li
            className={`form-wizard__step-item ${currentStep === 1 ? 'form-wizard__step-item--active' : ''} ${isStep1Valid ? 'form-wizard__step-item--completed' : ''}`}
            onClick={() => setCurrentStep(1)}
          >
            <div className="form-wizard__step-indicator">
              {isStep1Valid && currentStep !== 1 ? <MdCheck size={20} /> : <MdPerson size={18} />}
            </div>
            <div className="form-wizard__step-label-group">
              <span className="form-wizard__step-number">Step 1</span>
              <span className="form-wizard__step-title">Personal Info</span>
            </div>
          </li>

          {/* Step 2 */}
          <li
            className={`form-wizard__step-item ${currentStep === 2 ? 'form-wizard__step-item--active' : ''} ${isStep2Valid ? 'form-wizard__step-item--completed' : ''} ${!isStep1Valid ? 'form-wizard__step-item--disabled' : ''}`}
            onClick={() => {
              if (isStep1Valid) setCurrentStep(2);
            }}
          >
            <div className="form-wizard__step-indicator">
              {isStep2Valid && currentStep !== 2 ? <MdCheck size={20} /> : <MdWork size={18} />}
            </div>
            <div className="form-wizard__step-label-group">
              <span className="form-wizard__step-number">Step 2</span>
              <span className="form-wizard__step-title">Employment</span>
            </div>
          </li>

          {/* Step 3 */}
          <li
            className={`form-wizard__step-item ${currentStep === 3 ? 'form-wizard__step-item--active' : ''} ${!isStep1Valid || !isStep2Valid ? 'form-wizard__step-item--disabled' : ''}`}
            onClick={() => {
              if (isStep1Valid && isStep2Valid) setCurrentStep(3);
            }}
          >
            <div className="form-wizard__step-indicator">
              <MdDescription size={18} />
            </div>
            <div className="form-wizard__step-label-group">
              <span className="form-wizard__step-number">Step 3</span>
              <span className="form-wizard__step-title">AO &amp; 201 File</span>
            </div>
          </li>
        </ol>

        {/* Animated Progress Bar */}
        <div className="form-wizard__progress-container">
          <div className="form-wizard__progress-bar">
            <div className="form-wizard__progress-fill" style={{ width: `${calculateProgress()}%` }} />
          </div>
          <span className="form-wizard__progress-text">Step {currentStep} of 3 ({calculateProgress()}%)</span>
        </div>
      </div>

      {/* Form Body by Step */}
      <div className="form-wizard__body">
        {/* STEP 1: PERSONAL INFORMATION */}
        {currentStep === 1 && (
          <div className="form-wizard__section">
            <div className="form-wizard__section-header">
              <div>
                <h4 className="form-wizard__section-title">
                  <MdPerson /> Personal Information
                </h4>
                <p className="form-wizard__section-subtitle">
                  Enter identity details and upload an optional employee profile photo.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
              <ProfilePictureUpload
                currentPicture={profilePicture}
                onUpload={async (file: File) => {
                  return new Promise<void>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      setProfilePicture(reader.result as string);
                      resolve();
                    };
                    reader.readAsDataURL(file);
                  });
                }}
                onRemove={async () => {
                  setProfilePicture(undefined);
                }}
                firstName={localFormData.firstName || 'New'}
                lastName={localFormData.lastName || 'Employee'}
              />
            </div>

            <div className="form-wizard__field">
              <label className="form-wizard__label" htmlFor="wizard-employee-id">
                <span>Employee ID <span className="form-wizard__required">*</span></span>
                {localFormData.id.trim() && (
                  isDuplicateId ? (
                    <span className="form-wizard__validation-status form-wizard__validation-status--duplicate">
                      <MdWarning /> Duplicate ID
                    </span>
                  ) : (
                    <span className="form-wizard__validation-status form-wizard__validation-status--valid">
                      <MdCheck /> ID Available
                    </span>
                  )
                )}
              </label>
              <Input
                id="wizard-employee-id"
                placeholder="Enter unique employee ID (e.g., EMP-2024-001)"
                value={localFormData.id}
                onChange={(e) => handleChange('id', e.target.value)}
                error={stepErrors.id || formErrors.id}
                fullWidth
              />
            </div>

            <div className="form-wizard__row">
              <div className="form-wizard__field">
                <label className="form-wizard__label" htmlFor="wizard-last-name">
                  <span>Last Name <span className="form-wizard__required">*</span></span>
                  {localFormData.lastName.trim() && (
                    <span className="form-wizard__validation-status form-wizard__validation-status--valid">
                      <MdCheck />
                    </span>
                  )}
                </label>
                <Input
                  id="wizard-last-name"
                  placeholder="Enter last name"
                  value={localFormData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  error={stepErrors.lastName || formErrors.lastName}
                  fullWidth
                />
              </div>

              <div className="form-wizard__field">
                <label className="form-wizard__label" htmlFor="wizard-first-name">
                  <span>First Name <span className="form-wizard__required">*</span></span>
                  {localFormData.firstName.trim() && (
                    <span className="form-wizard__validation-status form-wizard__validation-status--valid">
                      <MdCheck />
                    </span>
                  )}
                </label>
                <Input
                  id="wizard-first-name"
                  placeholder="Enter first name"
                  value={localFormData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  error={stepErrors.firstName || formErrors.firstName}
                  fullWidth
                />
              </div>
            </div>

            <div className="form-wizard__field">
              <label className="form-wizard__label" htmlFor="wizard-middle-name">
                Middle Name (Optional)
              </label>
              <Input
                id="wizard-middle-name"
                placeholder="Enter middle name"
                value={localFormData.middleName}
                onChange={(e) => handleChange('middleName', e.target.value)}
                fullWidth
              />
            </div>

            <div className="form-wizard__row">
              <div className="form-wizard__field">
                <label className="form-wizard__label" htmlFor="wizard-date-of-birth">
                  Date of Birth
                </label>
                <Input
                  id="wizard-date-of-birth"
                  type="date"
                  value={localFormData.dateOfBirth}
                  onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                  fullWidth
                />
              </div>

              <div className="form-wizard__field">
                <label className="form-wizard__label" htmlFor="wizard-gender">
                  <span>Gender <span className="form-wizard__required">*</span></span>
                  {localFormData.gender.trim() && (
                    <span className="form-wizard__validation-status form-wizard__validation-status--valid">
                      <MdCheck />
                    </span>
                  )}
                </label>
                <select
                  id="wizard-gender"
                  className={`form-wizard__select ${stepErrors.gender || formErrors.gender ? 'form-wizard__select--error' : localFormData.gender ? 'form-wizard__select--valid' : ''}`}
                  value={localFormData.gender}
                  onChange={(e) => handleChange('gender', e.target.value)}
                >
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                {(stepErrors.gender || formErrors.gender) && (
                  <span className="form-wizard__error-text">⚠️ {stepErrors.gender || formErrors.gender}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: EMPLOYMENT & APPOINTMENT */}
        {currentStep === 2 && (
          <div className="form-wizard__section">
            <div className="form-wizard__section-header">
              <div>
                <h4 className="form-wizard__section-title">
                  <MdWork /> Employment &amp; Appointment Details
                </h4>
                <p className="form-wizard__section-subtitle">
                  Define organizational placement, position, tenure, and appointment duration.
                </p>
              </div>
            </div>

            <div className="form-wizard__field">
              <label className="form-wizard__label" htmlFor="wizard-office-name">
                <span>Office / Hospital Name <span className="form-wizard__required">*</span></span>
                {localFormData.officeHospitalName.trim() && (
                  <span className="form-wizard__validation-status form-wizard__validation-status--valid">
                    <MdCheck />
                  </span>
                )}
              </label>
              <SearchableDropdown
                id="wizard-office-name"
                options={dropdownOptions.officeNames}
                value={localFormData.officeHospitalName}
                onChange={(val) => {
                  handleChange('officeHospitalName', val);
                  if (stepErrors.officeHospitalName) setStepErrors(prev => ({ ...prev, officeHospitalName: '' }));
                }}
                placeholder="Select or type office/hospital"
              />
              {(stepErrors.officeHospitalName || formErrors.officeHospitalName) && (
                <span className="form-wizard__error-text">⚠️ {stepErrors.officeHospitalName || formErrors.officeHospitalName}</span>
              )}
            </div>

            <div className="form-wizard__field">
              <label className="form-wizard__label" htmlFor="wizard-position">
                <span>Position / Function <span className="form-wizard__optional">(Optional)</span></span>
                {localFormData.positionFunction.trim() && (
                  <span className="form-wizard__validation-status form-wizard__validation-status--valid">
                    <MdCheck />
                  </span>
                )}
              </label>
              <SearchableDropdown
                id="wizard-position"
                options={dropdownOptions.positions}
                value={localFormData.positionFunction}
                onChange={(val) => {
                  handleChange('positionFunction', val);
                  if (stepErrors.positionFunction) setStepErrors(prev => ({ ...prev, positionFunction: '' }));
                }}
                placeholder="Select or type position/function"
              />
              {(stepErrors.positionFunction || formErrors.positionFunction) && (
                <span className="form-wizard__error-text">⚠️ {stepErrors.positionFunction || formErrors.positionFunction}</span>
              )}
            </div>

            <div className="form-wizard__row">
              <div className="form-wizard__field">
                <label className="form-wizard__label" htmlFor="wizard-status">
                  Employment Status <span className="form-wizard__required">*</span>
                </label>
                <select
                  id="wizard-status"
                  className="form-wizard__select"
                  value={localFormData.status}
                  onChange={(e) => handleChange('status', e.target.value as any)}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="form-wizard__field">
                <label className="form-wizard__label" htmlFor="wizard-date-of-employment">
                  Date of Employment
                </label>
                <Input
                  id="wizard-date-of-employment"
                  type="date"
                  value={localFormData.dateOfEmployment}
                  onChange={(e) => handleChange('dateOfEmployment', e.target.value)}
                  error={formErrors.dateOfEmployment}
                  fullWidth
                />
              </div>
            </div>

            {localFormData.status === 'Inactive' && (
              <div style={{ background: 'rgba(239,68,68,0.03)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.15)', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="form-wizard__row">
                  <div className="form-wizard__field">
                    <label className="form-wizard__label" htmlFor="wizard-date-of-separation">
                      Date of Separation
                    </label>
                    <Input
                      id="wizard-date-of-separation"
                      type="date"
                      value={localFormData.dateOfSeparation}
                      onChange={(e) => handleChange('dateOfSeparation', e.target.value)}
                      error={formErrors.dateOfSeparation}
                      fullWidth
                    />
                  </div>

                  <div className="form-wizard__field">
                    <label className="form-wizard__label" htmlFor="wizard-reason-separation">
                      <span>Reason for Separation <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(Optional)</span></span>
                    </label>
                    <select
                      id="wizard-reason-separation"
                      className={`form-wizard__select ${stepErrors.reasonForSeparation || formErrors.reasonForSeparation ? 'form-wizard__select--error' : ''}`}
                      value={localFormData.reasonForSeparation}
                      onChange={(e) => {
                        handleChange('reasonForSeparation', e.target.value);
                        if (stepErrors.reasonForSeparation) setStepErrors(prev => ({ ...prev, reasonForSeparation: '' }));
                      }}
                    >
                      <option value="">Select reason for separation</option>
                      {dropdownOptions.reasonsForSeparation.map((reason) => (
                        <option key={reason} value={reason}>{reason}</option>
                      ))}
                    </select>
                    {(stepErrors.reasonForSeparation || formErrors.reasonForSeparation) && (
                      <span className="form-wizard__error-text">⚠️ {stepErrors.reasonForSeparation || formErrors.reasonForSeparation}</span>
                    )}
                  </div>
                </div>

                <div className="form-wizard__field">
                  <label className="form-wizard__label" htmlFor="wizard-remarks">
                    <span>Remarks <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(Optional)</span></span>
                  </label>
                  <Input
                    id="wizard-remarks"
                    placeholder="Enter remarks for inactive status"
                    value={localFormData.remarks || ''}
                    onChange={(e) => handleChange('remarks', e.target.value)}
                    fullWidth
                  />
                </div>
              </div>
            )}

            <div className="form-wizard__field">
              <label className="form-wizard__label" htmlFor="wizard-appointment-status">
                <span>Appointment Status <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)', fontWeight: 'normal' }}>(Optional)</span></span>
                {localFormData.appointmentStatus.trim() && (
                  <span className="form-wizard__validation-status form-wizard__validation-status--valid">
                    <MdCheck />
                  </span>
                )}
              </label>
              <select
                id="wizard-appointment-status"
                className={`form-wizard__select ${stepErrors.appointmentStatus || formErrors.appointmentStatus ? 'form-wizard__select--error' : localFormData.appointmentStatus ? 'form-wizard__select--valid' : ''}`}
                value={localFormData.appointmentStatus}
                onChange={(e) => {
                  handleChange('appointmentStatus', e.target.value);
                  if (stepErrors.appointmentStatus) setStepErrors(prev => ({ ...prev, appointmentStatus: '' }));
                }}
              >
                <option value="">Select appointment status</option>
                {dropdownOptions.appointmentStatuses.map((s) => {
                  const displayName = s.endsWith('|date') ? s.slice(0, -5) : s;
                  return <option key={s} value={displayName}>{displayName}</option>;
                })}
              </select>
              {(stepErrors.appointmentStatus || formErrors.appointmentStatus) && (
                <span className="form-wizard__error-text">⚠️ {stepErrors.appointmentStatus || formErrors.appointmentStatus}</span>
              )}
            </div>

            {isDurationalAppointment && (
              <div className="form-wizard__row">
                <div className="form-wizard__field">
                  <label className="form-wizard__label" htmlFor="wizard-appointment-from">
                    Appointment Duration From
                  </label>
                  <Input
                    id="wizard-appointment-from"
                    type="date"
                    value={localFormData.appointmentFrom}
                    onChange={(e) => handleChange('appointmentFrom', e.target.value)}
                    error={formErrors.appointmentFrom}
                    fullWidth
                  />
                </div>

                <div className="form-wizard__field">
                  <label className="form-wizard__label" htmlFor="wizard-appointment-to">
                    Appointment Duration To
                  </label>
                  <Input
                    id="wizard-appointment-to"
                    type="date"
                    value={localFormData.appointmentTo}
                    onChange={(e) => handleChange('appointmentTo', e.target.value)}
                    error={formErrors.appointmentTo}
                    fullWidth
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: AO & 201 DOCUMENT */}
        {currentStep === 3 && (
          <div className="form-wizard__section">
            <div className="form-wizard__section-header">
              <div>
                <h4 className="form-wizard__section-title">
                  <MdDescription /> Administrative Order (AO) &amp; 201 Document
                </h4>
                <p className="form-wizard__section-subtitle">
                  Attach official Administrative Orders, designations, details, and initial 201 file documents.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={clearAoInputs}
                style={{ color: 'var(--color-danger)' }}
              >
                Clear AO Inputs
              </Button>
            </div>

            <div className="form-wizard__field">
              <label className="form-wizard__label" htmlFor="wizard-ao-type">
                AO Status / Type
              </label>
              <select
                id="wizard-ao-type"
                className="form-wizard__select"
                value={localFormData.aoType}
                onChange={(e) => handleChange('aoType', e.target.value as any)}
              >
                <option value="">Select AO Type (Optional)</option>
                <option value="Detailed">Detailed</option>
                <option value="Designated">Designated</option>
                <option value="Recalled">Recalled</option>
              </select>
            </div>

            <div className="form-wizard__row">
              <div className="form-wizard__field">
                <label className="form-wizard__label" htmlFor="wizard-ao-number">
                  <span>AO Number</span>
                  {isDuplicateAo && (
                    <span className="form-wizard__validation-status form-wizard__validation-status--duplicate">
                      <MdWarning /> Series collision
                    </span>
                  )}
                </label>
                <Input
                  id="wizard-ao-number"
                  placeholder="Enter Administrative Order number"
                  value={localFormData.aoNumber}
                  onChange={(e) => handleChange('aoNumber', e.target.value)}
                  fullWidth
                />
              </div>

              <div className="form-wizard__field">
                <label className="form-wizard__label" htmlFor="wizard-ao-year">
                  Series Year
                </label>
                <select
                  id="wizard-ao-year"
                  className="form-wizard__select"
                  value={localFormData.aoYear}
                  onChange={(e) => handleChange('aoYear', e.target.value)}
                >
                  <option value="">Select series year</option>
                  {dropdownOptions.aoYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dynamic fields based on AO Type */}
            {localFormData.aoType === 'Detailed' && (
              <div style={{ background: 'rgba(59,130,246,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.15)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="form-wizard__field">
                  <label className="form-wizard__label" htmlFor="wizard-detailed-to">
                    Detailed / Transferred Office
                  </label>
                  <SearchableDropdown
                    id="wizard-detailed-to"
                    options={dropdownOptions.officeNames}
                    value={localFormData.detailedTo}
                    onChange={(val) => handleChange('detailedTo', val)}
                    placeholder="Select or enter office"
                  />
                </div>

                <div className="form-wizard__field">
                  <label className="form-wizard__label" htmlFor="wizard-detailed-division">
                    Division
                  </label>
                  <Input
                    id="wizard-detailed-division"
                    placeholder="Enter division"
                    value={localFormData.detailedDivision}
                    onChange={(e) => handleChange('detailedDivision', e.target.value)}
                    fullWidth
                  />
                </div>

                <div className="form-wizard__row">
                  <div className="form-wizard__field">
                    <label className="form-wizard__label" htmlFor="wizard-detailed-from">
                      Duration From
                    </label>
                    <Input
                      id="wizard-detailed-from"
                      type="date"
                      value={localFormData.detailedOrderFrom}
                      onChange={(e) => handleChange('detailedOrderFrom', e.target.value)}
                      fullWidth
                    />
                  </div>

                  <div className="form-wizard__field">
                    <label className="form-wizard__label" htmlFor="wizard-detailed-to-date">
                      Duration To
                    </label>
                    <Input
                      id="wizard-detailed-to-date"
                      type={localFormData.detailedOrderTo === 'Until revoked' ? 'text' : 'date'}
                      value={localFormData.detailedOrderTo}
                      onChange={(e) => handleChange('detailedOrderTo', e.target.value)}
                      disabled={localFormData.detailedOrderTo === 'Until revoked'}
                      fullWidth
                    />
                    <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="wizard-detailed-until-revoked"
                        checked={localFormData.detailedOrderTo === 'Until revoked'}
                        onChange={(e) => handleChange('detailedOrderTo', e.target.checked ? 'Until revoked' : '')}
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor="wizard-detailed-until-revoked" style={{ fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        Until revoked
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {localFormData.aoType === 'Designated' && (
              <div style={{ background: 'rgba(59,130,246,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.15)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="form-wizard__field">
                  <label className="form-wizard__label" htmlFor="wizard-designated-position">
                    Designated Position / Function
                  </label>
                  <SearchableDropdown
                    id="wizard-designated-position"
                    options={dropdownOptions.positions}
                    value={localFormData.designatedPositionFunction}
                    onChange={(val) => handleChange('designatedPositionFunction', val)}
                    placeholder="Select or enter designated function"
                  />
                </div>

                <div className="form-wizard__row">
                  <div className="form-wizard__field">
                    <label className="form-wizard__label" htmlFor="wizard-designated-from">
                      Designation From
                    </label>
                    <Input
                      id="wizard-designated-from"
                      type="date"
                      value={localFormData.designatedOrderFrom}
                      onChange={(e) => handleChange('designatedOrderFrom', e.target.value)}
                      fullWidth
                    />
                  </div>

                  <div className="form-wizard__field">
                    <label className="form-wizard__label" htmlFor="wizard-designated-to">
                      Designation To
                    </label>
                    <Input
                      id="wizard-designated-to"
                      type={localFormData.designatedOrderTo === 'Until revoked' ? 'text' : 'date'}
                      value={localFormData.designatedOrderTo}
                      onChange={(e) => handleChange('designatedOrderTo', e.target.value)}
                      disabled={localFormData.designatedOrderTo === 'Until revoked'}
                      fullWidth
                    />
                    <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="wizard-designated-until-revoked"
                        checked={localFormData.designatedOrderTo === 'Until revoked'}
                        onChange={(e) => handleChange('designatedOrderTo', e.target.checked ? 'Until revoked' : '')}
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor="wizard-designated-until-revoked" style={{ fontSize: '0.8rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        Until revoked
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {localFormData.aoType === 'Recalled' && (
              <div style={{ background: 'rgba(59,130,246,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.15)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="form-wizard__row">
                  <div className="form-wizard__field">
                    <label className="form-wizard__label" htmlFor="wizard-recalled-from">
                      Recalled From (Office)
                    </label>
                    <SearchableDropdown
                      id="wizard-recalled-from"
                      options={dropdownOptions.officeNames}
                      value={localFormData.recalledFrom}
                      onChange={(val) => handleChange('recalledFrom', val)}
                      placeholder="Select office recalled from"
                    />
                  </div>

                  <div className="form-wizard__field">
                    <label className="form-wizard__label" htmlFor="wizard-recalled-to">
                      Recalled To (Mother Unit)
                    </label>
                    <SearchableDropdown
                      id="wizard-recalled-to"
                      options={dropdownOptions.officeNames}
                      value={localFormData.recalledTo}
                      onChange={(val) => handleChange('recalledTo', val)}
                      placeholder="Select mother unit office"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Document Upload Zone */}
            <div className="form-wizard__field">
              <label className="form-wizard__label" htmlFor="wizard-ao-file">
                <span>Upload AO Document {localFormData.aoNumber.trim() ? '(Required for AO)' : '(Optional)'}</span>
              </label>

              <div className={`form-wizard__upload-zone ${aoFile ? 'form-wizard__upload-zone--has-file' : ''}`} onClick={() => document.getElementById('wizard-ao-file-input')?.click()}>
                <input
                  id="wizard-ao-file-input"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setAoFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
                {aoFile ? (
                  <div>
                    <strong style={{ color: 'var(--color-success)', display: 'block' }}>✓ {aoFile.name}</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {(aoFile.size / 1024).toFixed(1)} KB — Click to change file
                    </span>
                  </div>
                ) : (
                  <div>
                    <strong>Choose a PDF file or drag &amp; drop here</strong>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Accepts scanned Appointment Orders, Special Orders, or 201 records (PDF)
                    </p>
                  </div>
                )}
              </div>

              {aoFile && (
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="wizard-auto-rename"
                    checked={autoRename}
                    onChange={(e) => setAutoRename(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="wizard-auto-rename" style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    Auto-rename file according to AO series details
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="form-wizard__footer">
        <div className="form-wizard__footer-left">
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        </div>

        <div className="form-wizard__footer-right">
          {currentStep > 1 && (
            <Button variant="secondary" onClick={handlePrevStep} disabled={isSaving}>
              <MdArrowBack /> Previous
            </Button>
          )}

          {currentStep < 3 ? (
            <Button variant="primary" onClick={handleNextStep}>
              Next Step <MdArrowForward />
            </Button>
          ) : (
            <Button variant="success" onClick={() => onSave(localFormData)} loading={isSaving}>
              <MdCheck /> Save Employee Record
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeFormWizard;
