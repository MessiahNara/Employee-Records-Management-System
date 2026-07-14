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
import './EmployeeDetails.css';

function EmployeeDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showRenewalAlert, setShowRenewalAlert] = useState(false);
  const [profilePicture, setProfilePicture] = useState<string | undefined>(undefined);
  const [showRemovePhotoConfirm, setShowRemovePhotoConfirm] = useState(false);
  const [showChangePhotoConfirm, setShowChangePhotoConfirm] = useState(false);
  const [show201Modal, setShow201Modal] = useState(false);
  const [show201History, setShow201History] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const currentUser = getAuthState();
  const userRole = currentUser?.role || 'viewer';
  const canEditEmployee = userRole === 'superadmin' || userRole === 'developer' || userRole === 'admin' ||
    ((userRole === 'staff') && !!currentUser?.permissions?.update);

  useEffect(() => {
    if (id) {
      fetchEmployee(id);
    }
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
    if (!employee?.appointmentTo || employee.status !== 'Active') {
      setShowRenewalAlert(false);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointmentToDate = new Date(employee.appointmentTo);
    appointmentToDate.setHours(0, 0, 0, 0);

    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    const remainingDays = Math.ceil((appointmentToDate.getTime() - today.getTime()) / millisecondsPerDay);

    // Show the renewal alert only for appointments due within 30 days (not overdue).
    setShowRenewalAlert(remainingDays >= 0 && remainingDays <= 30);
  }, [employee]);

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
                <span className="employee-details__meta-value">{employee.fileboxLocation || <span className="employee-details__meta-empty">—</span>}</span>
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
                    {employee.appointmentFrom ? formatDateMDY(employee.appointmentFrom) : '—'}
                  </p>
                </div>
                <div className="employee-details__detailed-field">
                  <label className="employee-details__detailed-label">Duration To</label>
                  <p className="employee-details__detailed-value">
                    {employee.appointmentTo ? formatDateMDY(employee.appointmentTo) : '—'}
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
                    {(employee as any).designatedOrderTo ? formatDateMDY((employee as any).designatedOrderTo) : '—'}
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
        <PDFDocumentsModule employeeId={employee.id} employeeName={`${employee.firstName} ${employee.middleName || ''} ${employee.lastName}`.trim()} />
      </div>

      <Modal
        isOpen={showRenewalAlert}
        onClose={() => setShowRenewalAlert(false)}
        title="Appointment Notice"
        size="sm"
      >
        <p style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.125rem', margin: 0 }}>
          KAILANGAN NG IRENEW!!!
        </p>
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
