import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import PDFDocumentsModule from '../components/documents/PDFDocumentsModule';
import EmployeeBarcode from '../components/EmployeeBarcode';
import File201Modal from '../components/File201Modal';
import File201HistoryModal from '../components/File201HistoryModal';
import '../components/File201Modal.css';
import '../components/File201HistoryModal.css';
import { Employee } from '../types/employee';
import { formatDateDDMMYYYY, formatDateLong, formatDateMDY } from '../utils/dateUtils';
import api from '../services/api';
import { getAuthState } from '../utils/mockAuth';
import { useToast } from '../contexts/ToastContext';
import './EmployeeDetails.css';

function EmployeeDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profilePicture, setProfilePicture] = useState<string | undefined>(undefined);
  const [showRemovePhotoConfirm, setShowRemovePhotoConfirm] = useState(false);
  const [showChangePhotoConfirm, setShowChangePhotoConfirm] = useState(false);
  const [show201Modal, setShow201Modal] = useState(false);
  const [show201History, setShow201History] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { showToast } = useToast();

  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [isNearingExpiration, setIsNearingExpiration] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [remainingDaysCount, setRemainingDaysCount] = useState(0);
  const [hasActionedRenewal, setHasActionedRenewal] = useState(false);

  // Yes (renewal form) workflow
  const [showRenewalForm, setShowRenewalForm] = useState(false);
  const [renewalForm, setRenewalForm] = useState({
    appointmentStatus: '',
    appointmentFrom: '',
    appointmentTo: '',
  });
  const [renewalErrors, setRenewalErrors] = useState<Record<string, string>>({});
  const [isSubmittingRenewal, setIsSubmittingRenewal] = useState(false);

  // No (decline/separation form) workflow
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineForm, setDeclineForm] = useState({
    dateOfSeparation: new Date().toISOString().split('T')[0],
    reasonForSeparation: '',
  });
  const [declineErrors, setDeclineErrors] = useState<Record<string, string>>({});

  // Dynamic dropdown options
  const [dropdownOptions, setDropdownOptions] = useState<{
    appointmentStatuses: string[];
    officeNames: string[];
    positions: string[];
    reasonsForSeparation: string[];
  }>({ appointmentStatuses: [], officeNames: [], positions: [], reasonsForSeparation: [] });

  useEffect(() => {
    api.systemSettings.get().then((s) => {
      setDropdownOptions({
        appointmentStatuses: s.appointmentStatuses ?? [],
        officeNames: s.officeNames ?? [],
        positions: s.positions ?? [],
        reasonsForSeparation: s.reasonsForSeparation ?? [],
      });
    }).catch(() => { });
  }, []);

  const currentUser = getAuthState();
  const userRole = currentUser?.role || 'viewer';
  const canEditEmployee = userRole === 'superadmin' || userRole === 'developer' || userRole === 'admin' ||
    ((userRole === 'staff') && !!currentUser?.permissions?.update);

  useEffect(() => {
    if (id) {
      fetchEmployee(id);
    }
  }, [id]);

  useEffect(() => {
    const handleUpdate = () => {
      if (id) fetchEmployee(id);
    };
    window.addEventListener('employeeUpdated', handleUpdate);
    return () => window.removeEventListener('employeeUpdated', handleUpdate);
  }, [id]);

  // If navigated via barcode scan, auto-open the 201 borrow/return modal
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('scan') === '1' && employee) {
      setShow201Modal(true);
      // Clear ?scan=1 from URL so re-scanning the same employee works again
      navigate(location.pathname, { replace: true });
    }
  }, [location.search, employee]);

  useEffect(() => {
    if (!employee || employee.status !== 'Active' || !employee.appointmentTo || hasActionedRenewal) {
      setShowRenewalModal(false);
      setIsNearingExpiration(false);
      setIsExpired(false);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointmentToDate = new Date(employee.appointmentTo);
    appointmentToDate.setHours(0, 0, 0, 0);

    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    const remainingDays = Math.ceil((appointmentToDate.getTime() - today.getTime()) / millisecondsPerDay);

    if (remainingDays < 0) {
      setIsExpired(true);
      setIsNearingExpiration(false);
      setRemainingDaysCount(Math.abs(remainingDays));
      setShowRenewalModal(true);
    } else if (remainingDays <= 30) {
      setIsNearingExpiration(true);
      setIsExpired(false);
      setRemainingDaysCount(remainingDays);
      setShowRenewalModal(true);
    } else {
      setShowRenewalModal(false);
      setIsNearingExpiration(false);
      setIsExpired(false);
    }
  }, [employee, hasActionedRenewal]);

  const fetchEmployee = async (employeeId: string) => {
    try {
      setIsLoading(true);
      const data = await api.employee.getById(employeeId);
      setEmployee(data);
      setProfilePicture(data.profilePicture);
      setNotFound(false);
    } catch (error) {
      console.error('Error fetching employee:', error);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeclineRenewal = async () => {
    if (!employee) return;
    const errors: Record<string, string> = {};
    // Validation removed: Date and Reason for separation are now optional

    if (Object.keys(errors).length > 0) {
      setDeclineErrors(errors);
      return;
    }

    setIsSubmittingRenewal(true);
    try {
      const changedFields: any = {
        status: { from: employee.status, to: 'Inactive' },
        dateOfSeparation: { 
          from: employee.dateOfSeparation ? new Date(employee.dateOfSeparation).toISOString().split('T')[0] : null, 
          to: declineForm.dateOfSeparation 
        },
        reasonOfSeparation: { 
          from: employee.reasonForSeparation, 
          to: declineForm.reasonForSeparation 
        },
      };

      const empName = `${employee.lastName}, ${employee.firstName}`;
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
        action: 'update_employee',
        entityType: 'employee',
        entityId: employee.id,
        entityName: empName,
        payload: changedFields,
      });

      setHasActionedRenewal(true);
      setShowRenewalModal(false);
      showToast('⚠️ Status update submitted to approval queue.', 'info');
    } catch (err: any) {
      console.error('Error submitting decline renewal:', err);
      showToast(err.message || 'Failed to submit status update request.', 'error');
    } finally {
      setIsSubmittingRenewal(false);
    }
  };

  const handleDeclineFormChange = (key: string, val: string) => {
    setDeclineForm(prev => ({ ...prev, [key]: val }));
    if (declineErrors[key]) {
      setDeclineErrors(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const handleRenewalFormChange = (key: string, val: string) => {
    setRenewalForm(prev => ({ ...prev, [key]: val }));
    if (renewalErrors[key]) {
      setRenewalErrors(prev => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const renewalStatusRequiresDates = (() => {
    const selectedStatus = renewalForm.appointmentStatus.toLowerCase().trim();
    if (!selectedStatus) return false;

    const isDefaultDurational = ['casual', 'consultant', 'contract of service', 'contractual', 'job order'].includes(selectedStatus);
    if (isDefaultDurational) return true;
    
    const matchedOption = dropdownOptions.appointmentStatuses.find(
      (opt) => {
        const name = opt.endsWith('|date') ? opt.slice(0, -5) : opt;
        return name.toLowerCase().trim() === selectedStatus;
      }
    );
    return matchedOption ? matchedOption.endsWith('|date') : false;
  })();

  const handleSubmitRenewal = async () => {
    if (!employee) return;
    const errors: Record<string, string> = {};
    if (!renewalForm.appointmentStatus) errors.appointmentStatus = 'Appointment Status is required';
    if (renewalStatusRequiresDates) {
      if (!renewalForm.appointmentFrom) errors.appointmentFrom = 'Appointment From is required';
      if (!renewalForm.appointmentTo) errors.appointmentTo = 'Appointment To is required';
    }

    if (Object.keys(errors).length > 0) {
      setRenewalErrors(errors);
      return;
    }

    setIsSubmittingRenewal(true);
    try {
      const changedFields: any = {
        appointmentStatus: { from: employee.appointmentStatus, to: renewalForm.appointmentStatus },
        appointmentFrom: { 
          from: employee.appointmentFrom ? new Date(employee.appointmentFrom).toISOString().split('T')[0] : null, 
          to: renewalStatusRequiresDates ? renewalForm.appointmentFrom : null,
        },
        appointmentTo: { 
          from: employee.appointmentTo ? new Date(employee.appointmentTo).toISOString().split('T')[0] : null, 
          to: renewalStatusRequiresDates ? renewalForm.appointmentTo : null,
        },
        status: { from: employee.status, to: 'Active' },
      };

      const empName = `${employee.lastName}, ${employee.firstName}`;
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
        action: 'update_employee',
        entityType: 'employee',
        entityId: employee.id,
        entityName: empName,
        payload: changedFields,
      });

      setHasActionedRenewal(true);
      setShowRenewalModal(false);
      showToast('✅ Renewal update submitted to approval queue.', 'success');
    } catch (err: any) {
      console.error('Error submitting renewal request:', err);
      showToast(err.message || 'Failed to submit renewal request.', 'error');
    } finally {
      setIsSubmittingRenewal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="employee-details">
        <div className="employee-details__not-found">
          <h1>Loading...</h1>
          <p>Please wait while we load the employee details.</p>
        </div>
      </div>
    );
  }

  if (notFound || !employee) {
    return (
      <div className="employee-details">
        <div className="employee-details__not-found">
          <h1>Employee Not Found</h1>
          <p>The employee you're looking for doesn't exist.</p>
          <Button variant="primary" onClick={() => navigate('/')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    return status === 'Active' ? 'success' : 'danger';
  };

  const handleUploadProfilePicture = async (file: File) => {
    if (!employee) return;
    const result = await api.employee.uploadProfilePicture(employee.id, file);
    setProfilePicture(result.profilePicture);
  };

  const handleRemoveProfilePicture = async () => {
    if (!employee) return;
    await api.employee.removeProfilePicture(employee.id);
    setProfilePicture(undefined);
    setShowRemovePhotoConfirm(false);
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await handleUploadProfilePicture(file);
    } catch (err: any) {
      console.error('Avatar upload error:', err);
    }
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  return (
    <div className="employee-details">
      <div className="employee-details__header">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="employee-details__back-btn"
        >
          ← Back to Dashboard
        </Button>
      </div>

      <div className="employee-details__title-section">
        <div className="employee-details__title-left">
          {/* Avatar beside name */}
          <div className="employee-details__avatar-wrapper">
            <div
              className={`employee-details__avatar${canEditEmployee ? ' employee-details__avatar--editable' : ''}`}
            >
              <input
                ref={avatarInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/jpg,image/png"
                onChange={handleAvatarFileChange}
                style={{ display: 'none' }}
              />
              {profilePicture ? (
                <img src={profilePicture} alt="Profile" className="employee-details__avatar-img" />
              ) : (
                <div className="employee-details__avatar-placeholder">
                  {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
                </div>
              )}
              {canEditEmployee && (
                <div className="employee-details__avatar-overlay">
                  <button
                    className="employee-details__avatar-overlay-btn"
                    onClick={(e) => { e.stopPropagation(); setShowChangePhotoConfirm(true); }}
                  >
                    Change Photo
                  </button>
                  {profilePicture && (
                    <button
                      className="employee-details__avatar-overlay-btn employee-details__avatar-overlay-btn--danger"
                      onClick={(e) => { e.stopPropagation(); setShowRemovePhotoConfirm(true); }}
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="employee-details__title-info">
            <h1 className="employee-details__title">
              {employee.firstName} {employee.middleName} {employee.lastName}
            </h1>
            <p className="employee-details__subtitle">{employee.positionFunction}</p>
            <div className="employee-details__meta-fields">
              <div className="employee-details__meta-field">
                <span className="employee-details__meta-label">201 File Location:</span>
                <span className="employee-details__meta-value">
                  {employee.yellowBox ? (
                    <button 
                      onClick={() => navigate(`/file201?highlight=${employee.yellowBox!.id}`)}
                      className="employee-details__location-link-btn"
                      title="Click to view and highlight this box"
                    >
                      Box {employee.yellowBox.boxLabel} ({employee.yellowBox.office})
                    </button>
                  ) : (
                    employee.fileboxLocation || <span className="employee-details__meta-empty">—</span>
                  )}
                </span>
              </div>
              <div className="employee-details__meta-field">
                <span className="employee-details__meta-label">201 File Status:</span>
                <div className="employee-details__status-badges">
                  {(() => {
                    const status = employee.file201Status || 'Available';
                    // Multi-condition: e.g. "Incomplete,Damaged"
                    const conditions = status.split(',').map((s: string) => s.trim()).filter(Boolean);
                    const nonCompleteConditions = conditions.filter((c: string) => c !== 'Available' && c !== 'Borrowed' && c !== 'Complete');

                    if (status === 'Borrowed') {
                      return (
                        <button
                          className="employee-details__status-btn employee-details__status-btn--borrowed"
                          onClick={() => setShow201History(true)}
                          title="Click to view borrow history"
                        >
                          Borrowed
                        </button>
                      );
                    }

                    if (nonCompleteConditions.length > 0) {
                      return nonCompleteConditions.map((cond: string) => (
                        <button
                          key={cond}
                          className={`employee-details__status-btn employee-details__status-btn--${cond.toLowerCase()}`}
                          onClick={() => setShow201History(true)}
                          title="Click to view borrow history"
                        >
                          {cond}
                        </button>
                      ));
                    }

                    return (
                      <button
                        className="employee-details__status-btn employee-details__status-btn--available"
                        onClick={() => setShow201History(true)}
                        title="Click to view borrow history"
                      >
                        Available
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
            {canEditEmployee && (
              <button
                className="employee-details__borrow-btn"
                onClick={() => setShow201Modal(true)}
              >
                {employee.file201Status === 'Borrowed' ? '📥 Return 201 File' : '📤 Borrow 201 File'}
              </button>
            )}
          </div>
        </div>
        {/* Barcode on the right */}
        <div className="employee-details__barcode-section">
          <EmployeeBarcode
            employeeId={employee.id}
            employeeName={`${employee.firstName} ${employee.middleName || ''} ${employee.lastName}`.trim()}
            employeePosition={employee.positionFunction}
            employeeOffice={employee.officeHospitalName}
            showQRCode={true}
            showDownloadButton={true}
            showPrintButton={false}
          />
        </div>
      </div>

      <div className="employee-details__content">
        {/* Personal Information */}
        <Card>
          <h2 className="employee-details__section-title">Personal Information</h2>
          <div className="employee-details__grid employee-details__grid--4col">
            <div className="employee-details__field">
              <label className="employee-details__label">Last Name</label>
              <p className="employee-details__value">{employee.lastName}</p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">First Name</label>
              <p className="employee-details__value">{employee.firstName}</p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">Middle Name</label>
              <p className="employee-details__value">{employee.middleName || 'N/A'}</p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">Date of Birth</label>
              <p className="employee-details__value">{formatDateLong(employee.dateOfBirth)}</p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">Gender</label>
              <p className="employee-details__value">{employee.gender}</p>
            </div>
          </div>
        </Card>

        {/* Employment Information */}
        <Card>
          <h2 className="employee-details__section-title">Employment Information</h2>
          <div className="employee-details__grid employee-details__grid--4col">
            <div className="employee-details__field">
              <label className="employee-details__label">Status</label>
              <p className="employee-details__value">
                <Badge variant={getStatusVariant(employee.status)} size="sm">
                  {employee.status}
                </Badge>
              </p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">Employee ID</label>
              <p className="employee-details__value" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {employee.id}
              </p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">Office / Hospital Assigned</label>
              <p className="employee-details__value">{employee.officeHospitalName}</p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">Position / Function</label>
              <p className="employee-details__value">{employee.positionFunction}</p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">Date Hired</label>
              <p className="employee-details__value">{formatDateDDMMYYYY(employee.dateOfEmployment)}</p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">Appointment Status</label>
              <p className="employee-details__value">{employee.appointmentStatus}</p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">Appointment Effectivity</label>
              <p className="employee-details__value">
                {employee.appointmentFrom && employee.appointmentTo
                  ? `${formatDateMDY(employee.appointmentFrom)} TO ${formatDateMDY(employee.appointmentTo)}`
                  : 'N/A'}
              </p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">Administrative Order</label>
              <p className="employee-details__value">
                {employee.aoNumber || employee.aoYear ? (
                  <>
                    {employee.aoNumber ? `AO ${employee.aoNumber}` : '—'}
                    {employee.aoYear ? `, S. ${employee.aoYear}` : ''}
                  </>
                ) : (
                  'N/A'
                )}
              </p>
            </div>
            <div className="employee-details__field">
              <label className="employee-details__label">Type of AO</label>
              <p className="employee-details__value">{employee.aoType || 'N/A'}</p>
            </div>
          </div>

          {/* Detailed Section (AO Type = Detailed) */}
          {(employee as any).aoType === 'Detailed' && (
            <div className="employee-details__detailed-section">
              <div className="employee-details__detailed-grid">
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Detailed/Transferred Office</label>
                  <p className="employee-details__detailed-value">{employee.detailedTo || '—'}</p>
                </div>
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Division</label>
                  <p className="employee-details__detailed-value">{employee.detailedDivision || '—'}</p>
                </div>
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Duration From</label>
                  <p className="employee-details__detailed-value">
                    {employee.detailedOrderFrom ? formatDateMDY(employee.detailedOrderFrom) : '—'}
                  </p>
                </div>
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Duration To</label>
                  <p className="employee-details__detailed-value">
                    {employee.detailedOrderTo === 'Until revoked' ? 'Until revoked' : (employee.detailedOrderTo ? formatDateMDY(employee.detailedOrderTo) : '—')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Designated Section (AO Type = Designated) */}
          {(employee as any).aoType === 'Designated' && (
            <div className="employee-details__detailed-section">
              <div className="employee-details__detailed-grid">
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Designated Office</label>
                  <p className="employee-details__detailed-value">{(employee as any).detailedTo || '—'}</p>
                </div>
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Designated Position Function</label>
                  <p className="employee-details__detailed-value">{(employee as any).designatedPositionFunction || '—'}</p>
                </div>
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Duration From</label>
                  <p className="employee-details__detailed-value">
                    {(employee as any).designatedOrderFrom ? formatDateMDY((employee as any).designatedOrderFrom) : '—'}
                  </p>
                </div>
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Duration To</label>
                  <p className="employee-details__detailed-value">
                    {(employee as any).designatedOrderTo === 'Until revoked' ? 'Until revoked' : ((employee as any).designatedOrderTo ? formatDateMDY((employee as any).designatedOrderTo) : '—')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Recalled Section (AO Type = Recalled) */}
          {(employee as any).aoType === 'Recalled' && (
            <div className="employee-details__detailed-section">
              <div className="employee-details__detailed-grid">
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Recalled from</label>
                  <p className="employee-details__detailed-value">{(employee as any).recalledFrom || '—'}</p>
                </div>
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Recalled to</label>
                  <p className="employee-details__detailed-value">{(employee as any).recalledTo || '—'}</p>
                </div>
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Duration From</label>
                  <p className="employee-details__detailed-value">
                    {(employee as any).recalledOrderFrom ? formatDateMDY((employee as any).recalledOrderFrom) : '—'}
                  </p>
                </div>
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Duration To</label>
                  <p className="employee-details__detailed-value">
                    {(employee as any).recalledOrderTo === 'Until revoked' ? 'Until revoked' : ((employee as any).recalledOrderTo ? formatDateMDY((employee as any).recalledOrderTo) : '—')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Separation Information (only if Inactive) */}
        {employee.status === 'Inactive' && (
          <Card>
            <h2 className="employee-details__section-title">Separation Information</h2>
            <div className="employee-details__grid">
              <div className="employee-details__field">
                <label className="employee-details__label">Date of Separation</label>
                <p className="employee-details__value">{formatDateDDMMYYYY(employee.dateOfSeparation)}</p>
              </div>
              <div className="employee-details__field employee-details__field--full">
                <label className="employee-details__label">Reason for Separation</label>
                <p className="employee-details__value">{employee.reasonForSeparation || 'N/A'}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Documents Section */}
        <PDFDocumentsModule 
          employeeId={employee.id} 
          employeeName={(() => {
            let surname = employee.lastName.trim().toUpperCase();
            let first = employee.firstName.trim().toUpperCase();
            const middle = employee.middleName ? employee.middleName.trim().toUpperCase() : '';

            let suffix = '';
            const suffixRegex = /(?:,|\s)+(JR\.?|SR\.?|I{2,3}|IV|V|VI{1,3})$/i;

            let match = surname.match(suffixRegex);
            if (match) {
              let rawSuffix = match[1].toUpperCase();
              if (['JR', 'JR.', 'SR', 'SR.'].includes(rawSuffix)) {
                suffix = rawSuffix.replace(/\.?$/, '.');
              } else {
                suffix = rawSuffix;
              }
              surname = surname.replace(suffixRegex, '').trim();
            } else {
              match = first.match(suffixRegex);
              if (match) {
                let rawSuffix = match[1].toUpperCase();
                if (['JR', 'JR.', 'SR', 'SR.'].includes(rawSuffix)) {
                  suffix = rawSuffix.replace(/\.?$/, '.');
                } else {
                  suffix = rawSuffix;
                }
                first = first.replace(suffixRegex, '').trim();
              }
            }

            let formatted = surname;
            if (suffix) {
              formatted += `, ${suffix}`;
            }
            formatted += `, ${first}`;
            if (middle) {
              formatted += ` ${middle}`;
            }
            return formatted;
          })()} 
        />
      </div>

      <Modal
        isOpen={showRenewalModal}
        onClose={() => {
          setHasActionedRenewal(true);
          setShowRenewalModal(false);
          setShowRenewalForm(false);
          setShowDeclineForm(false);
        }}
        title="Appointment Notice"
        size="md"
      >
        <div style={{ padding: '0.5rem 0' }}>
          {!showRenewalForm && !showDeclineForm ? (
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{
                fontSize: '3.5rem',
                marginBottom: '1rem',
                color: isExpired ? 'var(--color-danger)' : 'var(--color-warning, #f59e0b)',
                lineHeight: 1
              }}>
                ⚠️
              </div>
              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                marginBottom: '0.75rem',
                color: 'var(--text-primary)'
              }}>
                {isExpired ? 'Appointment Expired' : 'Appointment Expiration Warning'}
              </h3>
              <p style={{
                fontSize: '1rem',
                color: 'var(--text-secondary)',
                lineHeight: '1.6',
                marginBottom: '1.5rem',
                maxWidth: '420px'
              }}>
                {isExpired ? (
                  <>
                    The active appointment for <strong>{employee.firstName} {employee.lastName}</strong> expired <strong>{remainingDaysCount}</strong> day(s) ago on <strong>{formatDateLong(employee.appointmentTo)}</strong>.
                  </>
                ) : (
                  <>
                    The active appointment for <strong>{employee.firstName} {employee.lastName}</strong> is nearing expiration and will end in <strong>{remainingDaysCount}</strong> day(s) on <strong>{formatDateLong(employee.appointmentTo)}</strong>.
                  </>
                )}
              </p>
              <div style={{
                borderTop: '1px solid var(--border-color)',
                width: '100%',
                paddingTop: '1.25rem',
                marginTop: '0.5rem'
              }}>
                <p style={{
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  marginBottom: '1.25rem',
                  color: 'var(--text-primary)'
                }}>
                  Do you want to renew this employee's appointment?
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <Button 
                    variant="primary" 
                    onClick={() => setShowRenewalForm(true)}
                    style={{ minWidth: '130px', padding: '0.625rem 1.25rem' }}
                  >
                    Yes (Renew)
                  </Button>
                  <Button 
                    variant="danger" 
                    onClick={() => setShowDeclineForm(true)}
                    style={{ minWidth: '150px', padding: '0.625rem 1.25rem' }}
                  >
                    No (Set Inactive)
                  </Button>
                </div>
              </div>
            </div>
          ) : showRenewalForm ? (
            <div style={{ padding: '1rem 1.5rem' }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: 700, 
                marginBottom: '1.5rem', 
                textAlign: 'center',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '0.75rem',
                color: 'var(--text-primary)'
              }}>
                Renew Appointment for {employee.firstName} {employee.lastName}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Appointment Status <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <select
                    className="dashboard__form-select"
                    value={renewalForm.appointmentStatus}
                    onChange={(e) => handleRenewalFormChange('appointmentStatus', e.target.value)}
                    style={{ width: '100%', padding: '0.625rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9375rem' }}
                  >
                    <option value="">Select appointment status</option>
                    {dropdownOptions.appointmentStatuses.map((status) => {
                      const displayName = status.endsWith('|date') ? status.slice(0, -5) : status;
                      return (
                        <option key={status} value={displayName}>{displayName}</option>
                      );
                    })}
                  </select>
                  {renewalErrors.appointmentStatus && (
                    <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem', fontWeight: 500 }}>
                      ⚠️ {renewalErrors.appointmentStatus}
                    </span>
                  )}
                </div>

                {renewalStatusRequiresDates && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Appointment From <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <input
                        type="date"
                        className="dashboard__form-input"
                        value={renewalForm.appointmentFrom}
                        onChange={(e) => handleRenewalFormChange('appointmentFrom', e.target.value)}
                        style={{ width: '100%', padding: '0.625rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box', fontSize: '0.9375rem' }}
                      />
                      {renewalErrors.appointmentFrom && (
                        <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem', fontWeight: 500 }}>
                          ⚠️ {renewalErrors.appointmentFrom}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Appointment To <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <input
                        type="date"
                        className="dashboard__form-input"
                        value={renewalForm.appointmentTo}
                        onChange={(e) => handleRenewalFormChange('appointmentTo', e.target.value)}
                        style={{ width: '100%', padding: '0.625rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box', fontSize: '0.9375rem' }}
                      />
                      {renewalErrors.appointmentTo && (
                        <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem', fontWeight: 500 }}>
                          ⚠️ {renewalErrors.appointmentTo}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                <Button 
                  variant="ghost" 
                  onClick={() => setShowRenewalForm(false)}
                  style={{ padding: '0.625rem 1.25rem' }}
                >
                  Back
                </Button>
                <Button 
                  variant="primary" 
                  disabled={isSubmittingRenewal} 
                  onClick={handleSubmitRenewal}
                  style={{ padding: '0.625rem 1.25rem' }}
                >
                  {isSubmittingRenewal ? 'Submitting...' : 'Submit for Approval'}
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '1rem 1.5rem' }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: 700, 
                marginBottom: '1.5rem', 
                textAlign: 'center',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '0.75rem',
                color: 'var(--text-primary)'
              }}>
                Set Employee Inactive: {employee.firstName} {employee.lastName}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Date of Separation <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <input
                    type="date"
                    className="dashboard__form-input"
                    value={declineForm.dateOfSeparation}
                    onChange={(e) => handleDeclineFormChange('dateOfSeparation', e.target.value)}
                    style={{ width: '100%', padding: '0.625rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box', fontSize: '0.9375rem' }}
                  />
                  {declineErrors.dateOfSeparation && (
                    <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem', fontWeight: 500 }}>
                      ⚠️ {declineErrors.dateOfSeparation}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Reason for Separation <span style={{ color: 'var(--color-danger)' }}>*</span>
                  </label>
                  <select
                    className="dashboard__form-select"
                    value={declineForm.reasonForSeparation}
                    onChange={(e) => handleDeclineFormChange('reasonForSeparation', e.target.value)}
                    style={{ width: '100%', padding: '0.625rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9375rem' }}
                  >
                    <option value="">Select reason for separation</option>
                    {dropdownOptions.reasonsForSeparation.map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                  {declineErrors.reasonForSeparation && (
                    <span style={{ color: 'var(--color-danger)', fontSize: '0.8rem', fontWeight: 500 }}>
                      ⚠️ {declineErrors.reasonForSeparation}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                <Button 
                  variant="ghost" 
                  onClick={() => setShowDeclineForm(false)}
                  style={{ padding: '0.625rem 1.25rem' }}
                >
                  Back
                </Button>
                <Button 
                  variant="danger" 
                  disabled={isSubmittingRenewal} 
                  onClick={handleDeclineRenewal}
                  style={{ padding: '0.625rem 1.25rem' }}
                >
                  {isSubmittingRenewal ? 'Submitting...' : 'Submit for Approval'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showRemovePhotoConfirm}
        onClose={() => setShowRemovePhotoConfirm(false)}
        title="Remove Profile Photo"
        size="sm"
      >
        <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
          <p style={{ marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
            Are you sure you want to remove the profile photo for{' '}
            <strong>{employee.firstName} {employee.lastName}</strong>?
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Button variant="ghost" onClick={() => setShowRemovePhotoConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleRemoveProfilePicture}>
              Remove
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showChangePhotoConfirm}
        onClose={() => setShowChangePhotoConfirm(false)}
        title="Change Profile Photo"
        size="sm"
      >
        <div style={{ textAlign: 'center', padding: '0.5rem 0 1rem' }}>
          <p style={{ marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
            Are you sure you want to change the photo for{' '}
            <strong>{employee.firstName} {employee.lastName}</strong>?
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Button variant="ghost" onClick={() => setShowChangePhotoConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => { setShowChangePhotoConfirm(false); avatarInputRef.current?.click(); }}>
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      {/* 201 File Borrow/Return Modal */}
      <File201Modal
        isOpen={show201Modal}
        onClose={() => setShow201Modal(false)}
        employeeId={employee.id}
        employeeName={`${employee.firstName} ${employee.middleName ? employee.middleName + ' ' : ''}${employee.lastName}`}
        fileLocation={employee.fileboxLocation}
        currentStatus={employee.file201Status || 'Available'}
        onStatusChanged={(newStatus) => {
          setEmployee((prev) => prev ? { ...prev, file201Status: newStatus } : prev);
        }}
      />

      {/* 201 File History Modal */}
      <File201HistoryModal
        isOpen={show201History}
        onClose={() => setShow201History(false)}
        employeeId={employee.id}
        employeeName={`${employee.firstName} ${employee.middleName ? employee.middleName + ' ' : ''}${employee.lastName}`}
        onStatusChanged={(newStatus) => {
          setEmployee((prev) => prev ? { ...prev, file201Status: newStatus } : prev);
        }}
      />
    </div>
  );
}

export default EmployeeDetails;
