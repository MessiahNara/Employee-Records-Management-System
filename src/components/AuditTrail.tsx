import { useState } from 'react';
import { AuditLog, AuditActionType } from '../types/audit';
import Badge from './ui/Badge';
import './AuditTrail.css';

interface AuditTrailProps {
  logs: AuditLog[];
}

function AuditTrail({ logs }: AuditTrailProps) {
  const [filterType, setFilterType] = useState<AuditActionType | 'all'>('all');

  const filteredLogs = filterType === 'all' 
    ? logs 
    : logs.filter(log => log.actionType === filterType);

  const getActionIcon = (actionType: AuditActionType): string => {
    switch (actionType) {
      case 'create':
        return '➕';
      case 'update':
        return '✏️';
      case 'status_change':
        return '🔄';
      case 'delete':
        return '🗑️';
      default:
        return '📝';
    }
  };

  const getActionBadgeVariant = (actionType: AuditActionType) => {
    switch (actionType) {
      case 'create':
        return 'success';
      case 'update':
        return 'info';
      case 'status_change':
        return 'warning';
      case 'delete':
        return 'danger';
      default:
        return 'default';
    }
  };

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  };

  if (logs.length === 0) {
    return (
      <div className="audit-trail__empty">
        <p>No audit history available</p>
      </div>
    );
  }

  return (
    <div className="audit-trail">
      <div className="audit-trail__header">
        <h2 className="audit-trail__title">Audit Trail</h2>
        <div className="audit-trail__filter">
          <label htmlFor="action-filter" className="audit-trail__filter-label">
            Filter:
          </label>
          <select
            id="action-filter"
            className="audit-trail__filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as AuditActionType | 'all')}
          >
            <option value="all">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
          </select>
        </div>
      </div>

      <div className="audit-trail__timeline">
        {filteredLogs.map((log, index) => {
          const { date, time } = formatDateTime(log.timestamp);
          return (
            <div key={log.id} className="audit-trail__item">
              <div className="audit-trail__connector">
                <div className="audit-trail__icon">
                  {getActionIcon(log.actionType)}
                </div>
                {index < filteredLogs.length - 1 && (
                  <div className="audit-trail__line" />
                )}
              </div>
              <div className="audit-trail__content">
                <div className="audit-trail__content-header">
                  <div className="audit-trail__action-info">
                    <Badge variant={getActionBadgeVariant(log.actionType)} size="sm">
                      {log.actionType.replace('_', ' ')}
                    </Badge>
                    <span className="audit-trail__action-title">{log.action}</span>
                  </div>
                  <div className="audit-trail__timestamp">
                    <span className="audit-trail__date">{date}</span>
                    <span className="audit-trail__time">{time}</span>
                  </div>
                </div>
                <p className="audit-trail__description">{log.description}</p>
                <div className="audit-trail__user">
                  <span className="audit-trail__user-label">By:</span>
                  <span className="audit-trail__user-name">{log.userName}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredLogs.length === 0 && (
        <div className="audit-trail__no-results">
          <p>No activities found for the selected filter</p>
        </div>
      )}
    </div>
  );
}

export default AuditTrail;
