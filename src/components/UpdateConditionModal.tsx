import { useState, useRef, useEffect } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import api from '../services/api';

interface UpdateConditionModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  onUpdated: () => void;
}

function UpdateConditionModal({ isOpen, onClose, employeeId, employeeName, onUpdated }: UpdateConditionModalProps) {
  const [returnedByName, setReturnedByName] = useState('');
  const [receivedByName, setReceivedByName] = useState('');
  const [fileCondition, setFileCondition] = useState('Complete');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Autocomplete
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [returnedSuggestions, setReturnedSuggestions] = useState<any[]>([]);
  const [showReturnedSuggestions, setShowReturnedSuggestions] = useState(false);
  const [receivedSuggestions, setReceivedSuggestions] = useState<any[]>([]);
  const [showReceivedSuggestions, setShowReceivedSuggestions] = useState(false);
  const returnedRef = useRef<HTMLDivElement>(null);
  const receivedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.employee.getAll()
      .then((emps: any[]) => {
        if (Array.isArray(emps)) {
          setAllEmployees(emps);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isOpen) {
      setReturnedByName('');
      setReceivedByName('');
      setFileCondition('Complete');
      setRemarks('');
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (returnedRef.current && !returnedRef.current.contains(e.target as Node)) setShowReturnedSuggestions(false);
      if (receivedRef.current && !receivedRef.current.contains(e.target as Node)) setShowReceivedSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filterEmployees = (value: string) => {
    if (!value.trim()) return [];
    const q = value.toLowerCase();
    return (allEmployees || []).filter((e) => {
      if (!e) return false;
      const firstName = e.firstName || '';
      const middleName = e.middleName || '';
      const lastName = e.lastName || '';
      const full = `${firstName} ${middleName} ${lastName}`.toLowerCase();
      const reverseFull = `${lastName} ${firstName}`.toLowerCase();
      return full.includes(q) || reverseFull.includes(q);
    }).slice(0, 8);
  };

  const now = new Date().toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const handleSubmit = async () => {
    if (!returnedByName.trim()) { setError('Returned By is required.'); return; }
    if (!receivedByName.trim()) { setError('Received By is required.'); return; }
    setLoading(true);
    setError('');
    try {
      await api.file201.updateCondition(employeeId, {
        returnedByName: returnedByName.trim(),
        receivedBy: receivedByName.trim(),
        fileCondition,
        remarks: remarks.trim() || undefined,
      });
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update file condition.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Update File Condition"
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="success" onClick={handleSubmit} loading={loading}>Record Return</Button>
        </div>
      }
    >
      <div className="file201-modal">
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
          <div className="file201-modal__employee-row">
            <span className="file201-modal__info-label">Date &amp; Time:</span>
            <span className="file201-modal__info-value">{now}</span>
          </div>
        </div>

        {error && <div className="file201-modal__error">⚠️ {error}</div>}

        <div className="file201-modal__form">
          {/* Returned By */}
          <div className="file201-modal__autocomplete" ref={returnedRef}>
            <div className="file201-modal__form-field">
              <label className="file201-modal__form-label">Returned By *</label>
              <input
                className="file201-modal__input"
                type="text"
                placeholder="Type employee name..."
                value={returnedByName}
                onChange={(e) => {
                  setReturnedByName(e.target.value);
                  const filtered = filterEmployees(e.target.value);
                  setReturnedSuggestions(filtered);
                  setShowReturnedSuggestions(filtered.length > 0);
                }}
                onFocus={() => returnedSuggestions.length > 0 && setShowReturnedSuggestions(true)}
                autoComplete="off"
              />
            </div>
            {showReturnedSuggestions && (
              <div className="file201-modal__suggestions">
                {returnedSuggestions.map((emp, idx) => {
                  const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
                  const pos = emp.position || emp.positionFunction || '';
                  const office = emp.officeName || emp.officeHospitalName || '';
                  const subText = [pos, office].filter(Boolean).join(' — ');
                  return (
                    <button key={emp.id || `returned-${idx}`} className="file201-modal__suggestion-item"
                      onMouseDown={() => { setReturnedByName(fullName); setReturnedSuggestions([]); setShowReturnedSuggestions(false); }}
                      type="button"
                    >
                      <span className="file201-modal__suggestion-name">{fullName}</span>
                      {subText && <span className="file201-modal__suggestion-sub">{subText}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Received By */}
          <div className="file201-modal__autocomplete" ref={receivedRef}>
            <div className="file201-modal__form-field">
              <label className="file201-modal__form-label">Received By *</label>
              <input
                className="file201-modal__input"
                type="text"
                placeholder="Type employee name..."
                value={receivedByName}
                onChange={(e) => {
                  setReceivedByName(e.target.value);
                  const filtered = filterEmployees(e.target.value);
                  setReceivedSuggestions(filtered);
                  setShowReceivedSuggestions(filtered.length > 0);
                }}
                onFocus={() => receivedSuggestions.length > 0 && setShowReceivedSuggestions(true)}
                autoComplete="off"
              />
            </div>
            {showReceivedSuggestions && (
              <div className="file201-modal__suggestions">
                {receivedSuggestions.map((emp, idx) => {
                  const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ');
                  const pos = emp.position || emp.positionFunction || '';
                  const office = emp.officeName || emp.officeHospitalName || '';
                  const subText = [pos, office].filter(Boolean).join(' — ');
                  return (
                    <button key={emp.id || `received-${idx}`} className="file201-modal__suggestion-item"
                      onMouseDown={() => { setReceivedByName(fullName); setReceivedSuggestions([]); setShowReceivedSuggestions(false); }}
                      type="button"
                    >
                      <span className="file201-modal__suggestion-name">{fullName}</span>
                      {subText && <span className="file201-modal__suggestion-sub">{subText}</span>}
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

          {/* Remarks */}
          <div className="file201-modal__form-field">
            <label className="file201-modal__form-label">Remarks (optional)</label>
            <textarea
              className="file201-modal__textarea"
              placeholder="Any remarks about the file condition"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default UpdateConditionModal;
