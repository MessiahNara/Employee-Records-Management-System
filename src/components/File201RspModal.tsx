import { useState, useEffect, useRef } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import api from '../services/api';

interface File201RspModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  fileLocation?: string;
  isTransferred?: boolean;
  onStatusChanged: (newStatus: string) => void;
}

function File201RspModal({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  fileLocation,
  isTransferred = false,
  onStatusChanged,
}: File201RspModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeRspLog, setActiveRspLog] = useState<any>(null);

  // Form fields for Transfer
  const [receivedByName, setReceivedByName] = useState('');
  const [receivedPosition, setReceivedPosition] = useState('');
  const [receivedOffice, setReceivedOffice] = useState('');
  const [releasedByName, setReleasedByName] = useState('');

  // Form fields for Return back to Records
  const [returnedByName, setReturnedByName] = useState('');
  const [returnReceivedByName, setReturnReceivedByName] = useState('');
  const [fileCondition, setFileCondition] = useState('Complete');
  const [remarks, setRemarks] = useState('');

  // Autocomplete states
  const [allEmployees, setAllEmployees] = useState<any[]>([]);

  // Autocomplete suggestions
  const [receivedSuggestions, setReceivedSuggestions] = useState<any[]>([]);
  const [showReceivedSuggestions, setShowReceivedSuggestions] = useState(false);
  const receivedRef = useRef<HTMLDivElement>(null);

  const [releasedSuggestions, setReleasedSuggestions] = useState<any[]>([]);
  const [showReleasedSuggestions, setShowReleasedSuggestions] = useState(false);
  const releasedRef = useRef<HTMLDivElement>(null);

  const [returnedSuggestions, setReturnedSuggestions] = useState<any[]>([]);
  const [showReturnedSuggestions, setShowReturnedSuggestions] = useState(false);
  const returnedRef = useRef<HTMLDivElement>(null);

  const [returnReceivedSuggestions, setReturnReceivedSuggestions] = useState<any[]>([]);
  const [showReturnReceivedSuggestions, setShowReturnReceivedSuggestions] = useState(false);
  const returnReceivedRef = useRef<HTMLDivElement>(null);

  const ownerEmp = allEmployees.find(e => e.id === employeeId);

  // Load all employees once for autocomplete
  useEffect(() => {
    api.employee.getAll().then((emps: any[]) => setAllEmployees(emps)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setReceivedByName('');
      setReceivedPosition('');
      setReceivedOffice('');
      setReleasedByName('');
      setReturnedByName('');
      setReturnReceivedByName('');
      setFileCondition('Complete');
      setRemarks('');
      setReceivedSuggestions([]);
      setShowReceivedSuggestions(false);
      setReleasedSuggestions([]);
      setShowReleasedSuggestions(false);
      setReturnedSuggestions([]);
      setShowReturnedSuggestions(false);
      setReturnReceivedSuggestions([]);
      setShowReturnReceivedSuggestions(false);

      if (isTransferred) {
        api.file201.getActiveRsp(employeeId)
          .then((log) => setActiveRspLog(log))
          .catch(() => setActiveRspLog(null));
      } else {
        setActiveRspLog(null);
      }
    }
  }, [isOpen, employeeId, isTransferred]);

  // Close suggestion dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (receivedRef.current && !receivedRef.current.contains(e.target as Node)) {
        setShowReceivedSuggestions(false);
      }
      if (releasedRef.current && !releasedRef.current.contains(e.target as Node)) {
        setShowReleasedSuggestions(false);
      }
      if (returnedRef.current && !returnedRef.current.contains(e.target as Node)) {
        setShowReturnedSuggestions(false);
      }
      if (returnReceivedRef.current && !returnReceivedRef.current.contains(e.target as Node)) {
        setShowReturnReceivedSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filterEmployees = (value: string) => {
    if (!value.trim()) return [];
    const q = value.toLowerCase();
    return allEmployees
      .filter((e) => {
        const full = `${e.firstName} ${e.middleName || ''} ${e.lastName}`.toLowerCase();
        const fullAlt = `${e.lastName} ${e.firstName}`.toLowerCase();
        return full.includes(q) || fullAlt.includes(q);
      })
      .slice(0, 8);
  };

  // Transfer handlers
  const handleReceivedInput = (value: string) => {
    setReceivedByName(value);
    const filtered = filterEmployees(value);
    setReceivedSuggestions(filtered);
    setShowReceivedSuggestions(filtered.length > 0);
  };

  const selectReceivedEmployee = (emp: any) => {
    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
    setReceivedByName(fullName);
    setReceivedPosition(emp.position || emp.positionFunction || '');
    setReceivedOffice(emp.officeName || emp.officeHospitalName || '');
    setReceivedSuggestions([]);
    setShowReceivedSuggestions(false);
  };

  const handleReleasedInput = (value: string) => {
    setReleasedByName(value);
    const filtered = filterEmployees(value);
    setReleasedSuggestions(filtered);
    setShowReleasedSuggestions(filtered.length > 0);
  };

  const selectReleasedEmployee = (emp: any) => {
    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
    setReleasedByName(fullName);
    setReleasedSuggestions([]);
    setShowReleasedSuggestions(false);
  };

  // Return back to Records handlers
  const handleReturnedInput = (value: string) => {
    setReturnedByName(value);
    const filtered = filterEmployees(value);
    setReturnedSuggestions(filtered);
    setShowReturnedSuggestions(filtered.length > 0);
  };

  const selectReturnedEmployee = (emp: any) => {
    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
    setReturnedByName(fullName);
    setReturnedSuggestions([]);
    setShowReturnedSuggestions(false);
  };

  const handleReturnReceivedInput = (value: string) => {
    setReturnReceivedByName(value);
    const filtered = filterEmployees(value);
    setReturnReceivedSuggestions(filtered);
    setShowReturnReceivedSuggestions(filtered.length > 0);
  };

  const selectReturnReceivedEmployee = (emp: any) => {
    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
    setReturnReceivedByName(fullName);
    setReturnReceivedSuggestions([]);
    setShowReturnReceivedSuggestions(false);
  };

  // Submit Transfer
  const handleTransfer = async () => {
    if (!receivedByName.trim()) {
      setError('Received By is required.');
      return;
    }
    if (!releasedByName.trim()) {
      setError('Released By is required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.file201.transferRsp(employeeId, {
        receivedBy: receivedByName.trim(),
        releasedBy: releasedByName.trim(),
        receivedPosition: receivedPosition.trim() || undefined,
        receivedOffice: receivedOffice.trim() || undefined,
        fileCondition: fileCondition || 'Complete',
        remarks: remarks.trim() || undefined,
      });
      onStatusChanged('Transferred to RSP');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record transfer to RSP.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Return back to Records
  const handleReturnBackToRecords = async () => {
    if (!returnedByName.trim()) {
      setError('Returned By is required.');
      return;
    }
    if (!returnReceivedByName.trim()) {
      setError('Received By is required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await api.file201.returnRsp(employeeId, {
        logId: activeRspLog?.id,
        returnedByName: returnedByName.trim(),
        receivedBy: returnReceivedByName.trim(),
        fileCondition: fileCondition || 'Complete',
        remarks: remarks.trim() || undefined,
      });
      onStatusChanged(fileCondition === 'Damaged' ? 'Damaged' : fileCondition === 'Incomplete' ? 'Incomplete' : 'Available');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record return back to Records.');
    } finally {
      setLoading(false);
    }
  };

  const now = new Date().toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isTransferred ? 'Returned back to Records — 201 File Transaction' : 'Transferred to RSP — 201 File Transaction'}
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          {isTransferred ? (
            <Button variant="primary" onClick={handleReturnBackToRecords} loading={loading}>
              Returned back to Records
            </Button>
          ) : (
            <Button variant="primary" onClick={handleTransfer} loading={loading}>
              Transferred to RSP
            </Button>
          )}
        </div>
      }
    >
      <div className="file201-modal">
        {/* Employee Info Header */}
        <div className="file201-modal__employee-info">
          <div className="file201-modal__employee-row">
            <span className="file201-modal__info-label">Employee:</span>
            <span className="file201-modal__info-value">{employeeName}</span>
          </div>
          <div className="file201-modal__employee-row">
            <span className="file201-modal__info-label">Employee ID:</span>
            <span className="file201-modal__info-value" style={{ fontFamily: 'monospace' }}>{employeeId}</span>
          </div>
          {ownerEmp && (
            <>
              <div className="file201-modal__employee-row">
                <span className="file201-modal__info-label">Employment Status:</span>
                <span className="file201-modal__info-value">
                  {ownerEmp.status ? (ownerEmp.status.charAt(0).toUpperCase() + ownerEmp.status.slice(1).toLowerCase()) : '—'}
                </span>
              </div>
              <div className="file201-modal__employee-row">
                <span className="file201-modal__info-label">Position:</span>
                <span className="file201-modal__info-value">{ownerEmp.position || '—'}</span>
              </div>
              <div className="file201-modal__employee-row">
                <span className="file201-modal__info-label">Office/Hospital:</span>
                <span className="file201-modal__info-value">{ownerEmp.yellowBox?.office || ownerEmp.officeName || '—'}</span>
              </div>
            </>
          )}
          {fileLocation && (
            <div className="file201-modal__employee-row">
              <span className="file201-modal__info-label">File Location:</span>
              <span className="file201-modal__info-value">{fileLocation}</span>
            </div>
          )}
          {isTransferred && activeRspLog && (
            <>
              <div className="file201-modal__employee-row">
                <span className="file201-modal__info-label">Transferred To:</span>
                <span className="file201-modal__info-value">{activeRspLog.borrowerName}</span>
              </div>
              <div className="file201-modal__employee-row">
                <span className="file201-modal__info-label">Date Transferred:</span>
                <span className="file201-modal__info-value">{new Date(activeRspLog.dateBorrowed).toLocaleString()}</span>
              </div>
            </>
          )}
          <div className="file201-modal__employee-row">
            <span className="file201-modal__info-label">Date &amp; Time:</span>
            <span className="file201-modal__info-value">{now}</span>
          </div>
        </div>

        {error && <div className="file201-modal__error">⚠️ {error}</div>}

        {/* RETURN BACK TO RECORDS FORM */}
        {isTransferred ? (
          <div className="file201-modal__form">
            {/* Returned By with Autocomplete */}
            <div className="file201-modal__autocomplete" ref={returnedRef}>
              <div className="file201-modal__form-field">
                <label className="file201-modal__form-label">Returned By *</label>
                <input
                  className="file201-modal__input"
                  type="text"
                  placeholder="Type name of person returning file..."
                  value={returnedByName}
                  onChange={(e) => handleReturnedInput(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                    if (returnedSuggestions.length > 0) setShowReturnedSuggestions(true);
                  }}
                  autoComplete="one-time-code"
                />
              </div>
              {showReturnedSuggestions && (
                <div className="file201-modal__suggestions">
                  {returnedSuggestions.map((emp) => {
                    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
                    return (
                      <button
                        key={emp.id}
                        className="file201-modal__suggestion-item"
                        onMouseDown={() => selectReturnedEmployee(emp)}
                        type="button"
                      >
                        <span className="file201-modal__suggestion-name">{fullName}</span>
                        <span className="file201-modal__suggestion-sub">
                          {emp.position || emp.positionFunction} — {emp.officeName || emp.officeHospitalName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Received By (Records) with Autocomplete */}
            <div className="file201-modal__autocomplete" ref={returnReceivedRef}>
              <div className="file201-modal__form-field">
                <label className="file201-modal__form-label">Received By *</label>
                <input
                  className="file201-modal__input"
                  type="text"
                  placeholder="Type records personnel name..."
                  value={returnReceivedByName}
                  onChange={(e) => handleReturnReceivedInput(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                    if (returnReceivedSuggestions.length > 0) setShowReturnReceivedSuggestions(true);
                  }}
                  autoComplete="one-time-code"
                />
              </div>
              {showReturnReceivedSuggestions && (
                <div className="file201-modal__suggestions">
                  {returnReceivedSuggestions.map((emp) => {
                    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
                    return (
                      <button
                        key={emp.id}
                        className="file201-modal__suggestion-item"
                        onMouseDown={() => selectReturnReceivedEmployee(emp)}
                        type="button"
                      >
                        <span className="file201-modal__suggestion-name">{fullName}</span>
                        <span className="file201-modal__suggestion-sub">
                          {emp.position || emp.positionFunction} — {emp.officeName || emp.officeHospitalName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Condition of File */}
            <div className="file201-modal__form-field">
              <label className="file201-modal__form-label">Condition of File</label>
              <select
                className="file201-modal__select"
                value={fileCondition}
                onChange={(e) => setFileCondition(e.target.value)}
              >
                <option value="Complete">Complete</option>
                <option value="Incomplete">Incomplete</option>
                <option value="Damaged">Damaged</option>
              </select>
            </div>

            {/* Remarks (optional) */}
            <div className="file201-modal__form-field">
              <label className="file201-modal__form-label">Remarks (optional)</label>
              <textarea
                className="file201-modal__textarea"
                placeholder="Any remarks about the returned file (e.g. missing documents, damages)..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        ) : (
          /* TRANSFER FORM */
          <div className="file201-modal__form">
            {/* Received By with Autocomplete */}
            <div className="file201-modal__autocomplete" ref={receivedRef}>
              <div className="file201-modal__form-field">
                <label className="file201-modal__form-label">Received By *</label>
                <input
                  className="file201-modal__input"
                  type="text"
                  placeholder="Type employee / recipient name..."
                  value={receivedByName}
                  onChange={(e) => handleReceivedInput(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                    if (receivedSuggestions.length > 0) setShowReceivedSuggestions(true);
                  }}
                  autoComplete="one-time-code"
                />
              </div>
              {showReceivedSuggestions && (
                <div className="file201-modal__suggestions">
                  {receivedSuggestions.map((emp) => {
                    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
                    return (
                      <button
                        key={emp.id}
                        className="file201-modal__suggestion-item"
                        onMouseDown={() => selectReceivedEmployee(emp)}
                        type="button"
                      >
                        <span className="file201-modal__suggestion-name">{fullName}</span>
                        <span className="file201-modal__suggestion-sub">
                          {emp.position || emp.positionFunction} — {emp.officeName || emp.officeHospitalName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Released By with Autocomplete */}
            <div className="file201-modal__autocomplete" ref={releasedRef}>
              <div className="file201-modal__form-field">
                <label className="file201-modal__form-label">Released By *</label>
                <input
                  className="file201-modal__input"
                  type="text"
                  placeholder="Type employee / releaser name..."
                  value={releasedByName}
                  onChange={(e) => handleReleasedInput(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                    if (releasedSuggestions.length > 0) setShowReleasedSuggestions(true);
                  }}
                  autoComplete="one-time-code"
                />
              </div>
              {showReleasedSuggestions && (
                <div className="file201-modal__suggestions">
                  {releasedSuggestions.map((emp) => {
                    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
                    return (
                      <button
                        key={emp.id}
                        className="file201-modal__suggestion-item"
                        onMouseDown={() => selectReleasedEmployee(emp)}
                        type="button"
                      >
                        <span className="file201-modal__suggestion-name">{fullName}</span>
                        <span className="file201-modal__suggestion-sub">
                          {emp.position || emp.positionFunction} — {emp.officeName || emp.officeHospitalName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Condition of File */}
            <div className="file201-modal__form-field">
              <label className="file201-modal__form-label">Condition of File</label>
              <select
                className="file201-modal__select"
                value={fileCondition}
                onChange={(e) => setFileCondition(e.target.value)}
              >
                <option value="Complete">Complete</option>
                <option value="Incomplete">Incomplete</option>
                <option value="Damaged">Damaged</option>
              </select>
            </div>

            {/* Remarks (optional) */}
            <div className="file201-modal__form-field">
              <label className="file201-modal__form-label">Remarks (optional)</label>
              <textarea
                className="file201-modal__textarea"
                placeholder="Any remarks about the transferred file (e.g. purpose, notes)..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default File201RspModal;
