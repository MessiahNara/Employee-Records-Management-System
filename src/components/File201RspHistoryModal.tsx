import { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import api from '../services/api';

interface File201RspHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
}

function File201RspHistoryModal({ isOpen, onClose, employeeId, employeeName }: File201RspHistoryModalProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      api.file201.getHistory(employeeId)
        .then((allLogs) => {
          const rspLogs = allLogs.filter((l: any) => l.action === 'transfer_rsp');
          setLogs(rspLogs);
        })
        .catch(() => setLogs([]))
        .finally(() => setLoading(false));
    }
  }, [isOpen, employeeId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Transferred to RSP History — ${employeeName}`}
      size="lg"
    >
      <div className="file201-history">
        {loading && <p className="file201-history__loading">Loading RSP transfer history...</p>}

        {!loading && logs.length === 0 && (
          <div className="file201-history__empty">
            <p>No RSP transfer records found for this employee.</p>
          </div>
        )}

        {!loading && logs.length > 0 && (
          <div className="file201-history__list">
            {logs.map((log) => {
              const isReturned = !!log.dateReturned;
              return (
                <div
                  key={log.id}
                  className={`file201-history__item ${
                    isReturned ? 'file201-history__item--returned' : 'file201-history__item--rsp'
                  }`}
                >
                  <div className="file201-history__item-header">
                    <div className="file201-history__badges">
                      <span
                        className={`file201-history__badge ${
                          isReturned ? 'file201-history__badge--rsp-returned' : 'file201-history__badge--rsp'
                        }`}
                      >
                        {isReturned ? '📥 RETURNED BACK TO RECORDS' : '🔄 TRANSFERRED TO RSP'}
                      </span>
                    </div>
                    <span className="file201-history__date">
                      {new Date(log.dateBorrowed).toLocaleString()}
                    </span>
                  </div>

                  <div className="file201-history__item-body">
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
  );
}

export default File201RspHistoryModal;
