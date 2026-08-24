import { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import UpdateConditionModal from './UpdateConditionModal';
import api from '../services/api';
import { getAuthState } from '../utils/mockAuth';

interface File201HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  onStatusChanged?: (newStatus: string) => void;
}

function File201HistoryModal({ isOpen, onClose, employeeId, employeeName, onStatusChanged }: File201HistoryModalProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const currentUser = getAuthState();
  const isDeveloper = currentUser?.role === 'developer';

  const refreshLogs = () => {
    setLoading(true);
    api.file201.getHistory(employeeId)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setConfirmClear(false);
      api.file201.getHistory(employeeId)
        .then(setLogs)
        .catch(() => setLogs([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, employeeId]);

  const handleClear = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setClearing(true);
    try {
      await api.file201.clearHistory(employeeId);
      setLogs([]);
      setConfirmClear(false);
      onStatusChanged?.('Available');
    } catch (err) {
      console.error('Failed to clear history', err);
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`201 File History — ${employeeName}`}
      size="lg"
      footer={isDeveloper ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {confirmClear && (
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-danger)' }}>
              ⚠️ This will delete all history. Click again to confirm.
            </span>
          )}
          <Button
            variant="danger"
            size="sm"
            onClick={handleClear}
            loading={clearing}
            disabled={logs.length === 0}
          >
            {confirmClear ? 'Confirm Clear' : 'Clear History'}
          </Button>
          {confirmClear && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
          )}
        </div>
      ) : undefined}
    >
      <div className="file201-history">
        {loading && <p className="file201-history__loading">Loading history...</p>}

        {!loading && logs.length === 0 && (
          <div className="file201-history__empty">
            <p>No transaction records found for this employee.</p>
          </div>
        )}

        {!loading && logs.length > 0 && (
          <div className="file201-history__list">
            {logs.map((log) => {
              const isRsp = log.action === 'transfer_rsp';
              const isBorrow = log.action === 'borrow' && !log.dateReturned;
              const isReturned = !!log.dateReturned;

              return (
                <div
                  key={log.id}
                  className={`file201-history__item ${
                    isRsp && !isReturned
                      ? 'file201-history__item--rsp'
                      : isBorrow
                      ? 'file201-history__item--borrowed'
                      : 'file201-history__item--returned'
                  }`}
                >
                  <div className="file201-history__item-header">
                    <div className="file201-history__badges">
                      <span
                        className={`file201-history__badge ${
                          isRsp && !isReturned
                            ? 'file201-history__badge--rsp'
                            : isRsp && isReturned
                            ? 'file201-history__badge--rsp-returned'
                            : isBorrow
                            ? 'file201-history__badge--borrowed'
                            : 'file201-history__badge--returned'
                        }`}
                      >
                        {isRsp
                          ? !isReturned
                            ? '🔄 TRANSFERRED TO RSP'
                            : '📥 RETURNED BACK TO RECORDS'
                          : isBorrow
                          ? '📤 BORROWED'
                          : '📥 RETURNED'}
                      </span>
                      {!isRsp && isReturned && log.fileCondition && log.fileCondition !== 'Complete' && (
                        <span className={`file201-history__badge file201-history__badge--condition-${log.fileCondition.toLowerCase()}`}>
                          {log.fileCondition.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="file201-history__date">
                      {new Date(log.dateBorrowed).toLocaleString()}
                    </span>
                  </div>

                  <div className="file201-history__item-body">
                    {/* RSP Record */}
                    {isRsp ? (
                      <>
                        <div className="file201-history__row">
                          <span className="file201-history__label">Received By (RSP):</span>
                          <span className="file201-history__value">{log.borrowerName}</span>
                        </div>
                        {log.borrowerPosition && (
                          <div className="file201-history__row">
                            <span className="file201-history__label">Position:</span>
                            <span className="file201-history__value">{log.borrowerPosition}</span>
                          </div>
                        )}
                        {log.borrowerOffice && (
                          <div className="file201-history__row">
                            <span className="file201-history__label">Office:</span>
                            <span className="file201-history__value">{log.borrowerOffice}</span>
                          </div>
                        )}
                        {log.releasedBy && (
                          <div className="file201-history__row">
                            <span className="file201-history__label">Released by:</span>
                            <span className="file201-history__value">{log.releasedBy}</span>
                          </div>
                        )}
                        <div className="file201-history__row">
                          <span className="file201-history__label">Date Transferred:</span>
                          <span className="file201-history__value">{new Date(log.dateBorrowed).toLocaleString()}</span>
                        </div>
                        {isReturned && (
                          <>
                            <div className="file201-history__divider" />
                            <div className="file201-history__row">
                              <span className="file201-history__label">Date Returned:</span>
                              <span className="file201-history__value">{new Date(log.dateReturned).toLocaleString()}</span>
                            </div>
                            {log.returnedByName && (
                              <div className="file201-history__row">
                                <span className="file201-history__label">Returned by:</span>
                                <span className="file201-history__value">{log.returnedByName}</span>
                              </div>
                            )}
                            {log.receivedBy && (
                              <div className="file201-history__row">
                                <span className="file201-history__label">Received by (Records):</span>
                                <span className="file201-history__value">{log.receivedBy}</span>
                              </div>
                            )}
                            {log.remarks && (
                              <div className="file201-history__row">
                                <span className="file201-history__label">Remarks:</span>
                                <span className="file201-history__value">{log.remarks}</span>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      /* Standard Borrow / Return Record */
                      <>
                        <div className="file201-history__row">
                          <span className="file201-history__label">Borrowed By:</span>
                          <span className="file201-history__value">{log.borrowerName}</span>
                        </div>
                        {log.borrowerPosition && (
                          <div className="file201-history__row">
                            <span className="file201-history__label">Position:</span>
                            <span className="file201-history__value">{log.borrowerPosition}</span>
                          </div>
                        )}
                        {log.borrowerOffice && (
                          <div className="file201-history__row">
                            <span className="file201-history__label">Office:</span>
                            <span className="file201-history__value">{log.borrowerOffice}</span>
                          </div>
                        )}
                        {log.purpose && (
                          <div className="file201-history__row">
                            <span className="file201-history__label">Purpose:</span>
                            <span className="file201-history__value">{log.purpose}</span>
                          </div>
                        )}
                        {log.expectedReturnDate && (
                          <div className="file201-history__row">
                            <span className="file201-history__label">Expected Return:</span>
                            <span className="file201-history__value">{new Date(log.expectedReturnDate).toLocaleDateString()}</span>
                          </div>
                        )}
                        {log.releasedBy && (
                          <div className="file201-history__row">
                            <span className="file201-history__label">Released by:</span>
                            <span className="file201-history__value">{log.releasedBy}</span>
                          </div>
                        )}
                        {isReturned && (
                          <>
                            <div className="file201-history__divider" />
                            <div className="file201-history__row">
                              <span className="file201-history__label">Date Returned:</span>
                              <span className="file201-history__value">{new Date(log.dateReturned).toLocaleString()}</span>
                            </div>
                            {log.returnedByName && (
                              <div className="file201-history__row">
                                <span className="file201-history__label">Returned by:</span>
                                <span className="file201-history__value">{log.returnedByName}</span>
                              </div>
                            )}
                            {log.receivedBy && (
                              <div className="file201-history__row">
                                <span className="file201-history__label">Received by:</span>
                                <span className="file201-history__value">{log.receivedBy}</span>
                              </div>
                            )}
                            {log.fileCondition && (
                              <div className="file201-history__row">
                                <span className="file201-history__label">File Condition:</span>
                                <span className={`file201-history__condition file201-history__condition--${log.fileCondition.toLowerCase()}`}>
                                  {log.fileCondition}
                                </span>
                              </div>
                            )}
                            {log.remarks && (
                              <div className="file201-history__row">
                                <span className="file201-history__label">Remarks:</span>
                                <span className="file201-history__value">{log.remarks}</span>
                              </div>
                            )}
                            {(log.fileCondition === 'Incomplete' || log.fileCondition === 'Damaged') && (
                              <div className="file201-history__update-row">
                                <button
                                  className="file201-history__update-btn"
                                  onClick={() => setShowUpdateModal(true)}
                                >
                                  ✏️ Update File Condition
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>

    <UpdateConditionModal
      isOpen={showUpdateModal}
      onClose={() => setShowUpdateModal(false)}
      employeeId={employeeId}
      employeeName={employeeName}
      onUpdated={() => {
        refreshLogs();
        onStatusChanged?.('updated');
      }}
    />
  </>
  );
}

export default File201HistoryModal;
