import { useState, useEffect, useRef } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import api from '../services/api';
import { getAuthState } from '../utils/mockAuth';

interface File201ModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  fileLocation?: string;
  currentStatus?: string;
  onStatusChanged: (newStatus: string) => void;
}

type Tab = 'borrow' | 'return';

function File201Modal({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  fileLocation,
  currentStatus,
  onStatusChanged,
}: File201ModalProps) {
  const currentUser = getAuthState();
  const isBorrowed = currentStatus === 'Borrowed';
  const [tab, setTab] = useState<Tab>(isBorrowed ? 'return' : 'borrow');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeBorrow, setActiveBorrow] = useState<any>(null);

  // Borrow form
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerPosition, setBorrowerPosition] = useState('');
  const [borrowerOffice, setBorrowerOffice] = useState('');
  const [purpose, setPurpose] = useState('');

  // Employee autocomplete
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);

  // Return field autocomplete
  const [returnedSuggestions, setReturnedSuggestions] = useState<any[]>([]);
  const [showReturnedSuggestions, setShowReturnedSuggestions] = useState(false);
  const returnedSuggestionRef = useRef<HTMLDivElement>(null);

  const [receivedSuggestions, setReceivedSuggestions] = useState<any[]>([]);
  const [showReceivedSuggestions, setShowReceivedSuggestions] = useState(false);
  const receivedSuggestionRef = useRef<HTMLDivElement>(null);

  const [releasedSuggestions, setReleasedSuggestions] = useState<any[]>([]);
  const [showReleasedSuggestions, setShowReleasedSuggestions] = useState(false);
  const releasedSuggestionRef = useRef<HTMLDivElement>(null);

  const ownerEmp = allEmployees.find(e => e.id === employeeId);

  // Return form
  const [returnedByName, setReturnedByName] = useState('');
  const [receivedByName, setReceivedByName] = useState('');
  const [fileCondition, setFileCondition] = useState('Complete');
  const [remarks, setRemarks] = useState('');

  const defaultReleasedBy = `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim().replace(/^,\s*/, '') || 'Unknown';
  const [releasedByName, setReleasedByName] = useState('');

  // Load all employees once for autocomplete
  useEffect(() => {
    api.employee.getAll().then((emps: any[]) => setAllEmployees(emps)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTab(isBorrowed ? 'return' : 'borrow');
      setError('');
      setBorrowerName('');
      setBorrowerPosition('');
      setBorrowerOffice('');
      setPurpose('');
      setReleasedByName('');
      setReturnedByName('');
      setReceivedByName('');
      setFileCondition('Complete');
      setRemarks('');
      setSuggestions([]);
      setShowSuggestions(false);
      setReturnedSuggestions([]);
      setShowReturnedSuggestions(false);
      setReceivedSuggestions([]);
      setShowReceivedSuggestions(false);
      setReleasedSuggestions([]);
      setShowReleasedSuggestions(false);
      if (isBorrowed) {
        api.file201.getActive(employeeId).then(setActiveBorrow).catch(() => setActiveBorrow(null));
      }
    }
  }, [isOpen, isBorrowed, employeeId]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
      if (returnedSuggestionRef.current && !returnedSuggestionRef.current.contains(e.target as Node)) {
        setShowReturnedSuggestions(false);
      }
      if (receivedSuggestionRef.current && !receivedSuggestionRef.current.contains(e.target as Node)) {
        setShowReceivedSuggestions(false);
      }
      if (releasedSuggestionRef.current && !releasedSuggestionRef.current.contains(e.target as Node)) {
        setShowReleasedSuggestions(false);
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

  const handleBorrowerInput = (value: string) => {
    setBorrowerName(value);
    const filtered = filterEmployees(value);
    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  };

  const selectEmployee = (emp: any) => {
    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
    setBorrowerName(fullName);
    setBorrowerPosition(emp.position || emp.positionFunction || '');
    setBorrowerOffice(emp.officeName || emp.officeHospitalName || '');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleReturnedByInput = (value: string) => {
    setReturnedByName(value);
    const filtered = filterEmployees(value);
    setReturnedSuggestions(filtered);
    setShowReturnedSuggestions(filtered.length > 0);
  };

  const selectReturnedBy = (emp: any) => {
    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
    setReturnedByName(fullName);
    setReturnedSuggestions([]);
    setShowReturnedSuggestions(false);
  };

  const handleReceivedByInput = (value: string) => {
    setReceivedByName(value);
    const filtered = filterEmployees(value);
    setReceivedSuggestions(filtered);
    setShowReceivedSuggestions(filtered.length > 0);
  };

  const selectReceivedBy = (emp: any) => {
    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
    setReceivedByName(fullName);
    setReceivedSuggestions([]);
    setShowReceivedSuggestions(false);
  };

  const handleReleasedByInput = (value: string) => {
    setReleasedByName(value);
    const filtered = filterEmployees(value);
    setReleasedSuggestions(filtered);
    setShowReleasedSuggestions(filtered.length > 0);
  };

  const selectReleasedBy = (emp: any) => {
    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
    setReleasedByName(fullName);
    setReleasedSuggestions([]);
    setShowReleasedSuggestions(false);
  };

    try {
      await api.file201.borrow(employeeId, {
        borrowerName: borrowerName.trim(),
        borrowerPosition: borrowerPosition.trim() || undefined,
        borrowerOffice: borrowerOffice.trim() || undefined,
        purpose: purpose.trim() || undefined,
        releasedBy: releasedByName.trim(),
      });
      onStatusChanged('Borrowed');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to borrow file.');
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!returnedByName.trim()) { setError('Returned By is required.'); return; }
    if (!receivedByName.trim()) { setError('Received By is required.'); return; }
    setLoading(true); setError('');
    try {
      await api.file201.returnFile(employeeId, {
        borrowLogId: activeBorrow?.id,
        fileCondition,
        remarks: remarks.trim() || undefined,
        returnedByName: returnedByName.trim(),
        receivedBy: receivedByName.trim(),
      });
      // Derive new status from the selected file condition
      let newStatus: string;
      if (fileCondition === 'Damaged') {
        newStatus = 'Damaged';
      } else if (fileCondition === 'Incomplete') {
        newStatus = 'Incomplete';
      } else {
        newStatus = 'Available';
      }
      onStatusChanged(newStatus);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record return.');
    } finally {
      setLoading(false);
    }
  };

  const now = new Date().toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="201 File Transaction History"
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          {tab === 'borrow' ? (
            <Button variant="primary" onClick={handleBorrow} loading={loading}>Submit a Request</Button>
          ) : (
            <Button variant="success" onClick={handleReturn} loading={loading}>Record Return</Button>
          )}
        </div>
      }
    >
      <div className="file201-modal">
        {/* Tabs */}
        {!isBorrowed && (
          <div className="file201-modal__tabs">
            <button
              className={`file201-modal__tab ${tab === 'borrow' ? 'file201-modal__tab--active' : ''}`}
              onClick={() => { setTab('borrow'); setError(''); }}
            >
              📤 Borrow
            </button>
            <button
              className={`file201-modal__tab ${tab === 'return' ? 'file201-modal__tab--active' : ''}`}
              onClick={() => { setTab('return'); setError(''); }}
            >
              📥 Return
            </button>
          </div>
        )}

        {/* Employee info header */}
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
          <div className="file201-modal__employee-row">
            <span className="file201-modal__info-label">Date &amp; Time:</span>
            <span className="file201-modal__info-value">{now}</span>
          </div>

          {tab === 'return' && activeBorrow && (
            <div className="file201-modal__employee-row">
              <span className="file201-modal__info-label">Borrowed by:</span>
              <span className="file201-modal__info-value">{activeBorrow.borrowerName}</span>
            </div>
          )}
          {tab === 'return' && activeBorrow && (
            <div className="file201-modal__employee-row">
              <span className="file201-modal__info-label">Date Borrowed:</span>
              <span className="file201-modal__info-value">{new Date(activeBorrow.dateBorrowed).toLocaleString()}</span>
            </div>
          )}
        </div>

        {error && <div className="file201-modal__error">⚠️ {error}</div>}

        {/* BORROW FORM */}
        {tab === 'borrow' && (
          <div className="file201-modal__form">
            {/* Borrowed By with autocomplete */}
            <div className="file201-modal__autocomplete" ref={suggestionRef}>
              <div className="file201-modal__form-field">
                <label className="file201-modal__form-label">Borrowed By *</label>
                <input
                  className="file201-modal__input"
                  type="text"
                  placeholder="Type employee name..."
                  value={borrowerName}
                  onChange={(e) => handleBorrowerInput(e.target.value)}
                  onFocus={(e) => {
                    e.target.select();
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  autoComplete="one-time-code"
                />
              </div>
              {showSuggestions && (
                <div className="file201-modal__suggestions">
                  {suggestions.map((emp) => {
                    const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
                    return (
                      <button
                        key={emp.id}
                        className="file201-modal__suggestion-item"
                        onMouseDown={() => selectEmployee(emp)}
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

            {/* Released By with autocomplete */}
            <div className="file201-modal__autocomplete" ref={releasedSuggestionRef}>
              <div className="file201-modal__form-field">
                <label className="file201-modal__form-label">Released By *</label>
                <input
                  className="file201-modal__input"
                  type="text"
                  placeholder="Type employee name..."
                  value={releasedByName}
                  onChange={(e) => handleReleasedByInput(e.target.value)}
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
                        onMouseDown={() => selectReleasedBy(emp)}
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

            <div className="file201-modal__form-field">
              <label className="file201-modal__form-label">Purpose / Reason for Borrowing</label>
              <textarea
                className="file201-modal__textarea"
                placeholder="Enter reason for borrowing"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* RETURN FORM */}
        {tab === 'return' && (
          <div className="file201-modal__form">
            {/* Returned By autocomplete */}
            <div className="file201-modal__autocomplete" ref={returnedSuggestionRef}>
              <div className="file201-modal__form-field">
                <label className="file201-modal__form-label">Returned By *</label>
                <input
                  className="file201-modal__input"
                  type="text"
                  placeholder="Type employee name..."
                  value={returnedByName}
                  onChange={(e) => handleReturnedByInput(e.target.value)}
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
                        onMouseDown={() => selectReturnedBy(emp)}
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

            {/* Received By autocomplete */}
            <div className="file201-modal__autocomplete" ref={receivedSuggestionRef}>
              <div className="file201-modal__form-field">
                <label className="file201-modal__form-label">Received By *</label>
                <input
                  className="file201-modal__input"
                  type="text"
                  placeholder="Type employee name..."
                  value={receivedByName}
                  onChange={(e) => handleReceivedByInput(e.target.value)}
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
                        onMouseDown={() => selectReceivedBy(emp)}
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
            <div className="file201-modal__form-field">
              <label className="file201-modal__form-label">Remarks (optional)</label>
              <textarea
                className="file201-modal__textarea"
                placeholder="Any remarks about the returned file"
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

export default File201Modal;
