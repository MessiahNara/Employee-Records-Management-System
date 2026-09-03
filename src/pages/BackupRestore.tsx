import { useState, useEffect, useRef } from 'react';
import { useToast } from '../contexts/ToastContext';
import { getAuthState } from '../utils/mockAuth';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import {
  MdBackup,
  MdCloudDownload,
  MdRestore,
  MdDelete,
  MdSchedule,
  MdUploadFile,
  MdWarning,
  MdStorage,
  MdSecurity,
  MdRefresh,
  MdVisibility,
  MdFolder,
  MdPeople,
  MdDescription,
  MdAssignmentTurnedIn,
  MdChat,
  MdEvent,
  MdLayers,
  MdHistory,
  MdSettings,
  MdInventory,
  MdFolderOpen,
} from 'react-icons/md';
import api from '../services/api';
import { getSocket } from '../services/socket';
import './BackupRestore.css';

interface BackupItem {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
  type: 'manual' | 'scheduled' | 'safety' | 'uploaded';
  recordCounts: Record<string, number>;
}

interface ScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  time: string;
  retentionCount: number;
  lastRun?: string;
  nextRun?: string;
}

interface LiveRecordCounts {
  users: number;
  employees: number;
  documents: number;
  yellowBoxes: number;
  borrowLogs: number;
  auditLogs: number;
  total: number;
}

function BackupRestore() {
  const { showToast } = useToast();
  const currentUser = getAuthState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAuthorized = currentUser?.role === 'superadmin' || currentUser?.role === 'developer';

  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [liveCounts, setLiveCounts] = useState<LiveRecordCounts | null>(null);
  const [schedule, setSchedule] = useState<ScheduleConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Details Modal State
  const [selectedBackupForDetails, setSelectedBackupForDetails] = useState<BackupItem | null>(null);

  // Restore Modal State
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<BackupItem | null>(null);
  const [superadminPassword, setSuperadminPassword] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  // Delete Modal State
  const [selectedBackupForDelete, setSelectedBackupForDelete] = useState<BackupItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Schedule Modal State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<ScheduleConfig>({
    enabled: true,
    frequency: 'daily',
    time: '02:00',
    retentionCount: 10,
  });
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Real-Time Progress Timer State
  const [progressState, setProgressState] = useState<{
    isOpen: boolean;
    type: 'create' | 'restore';
    title: string;
    percent: number;
    stage: string;
    detail: string;
    step: number;
    totalSteps: number;
    logs: string[];
    elapsedMs: number;
  }>({
    isOpen: false,
    type: 'create',
    title: '',
    percent: 0,
    stage: '',
    detail: '',
    step: 1,
    totalSteps: 6,
    logs: [],
    elapsedMs: 0,
  });

  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Listen to real-time socket progress events from the backend
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleBackupProgress = (data: { step: number; totalSteps: number; percent: number; stage: string; detail: string }) => {
      setProgressState((prev) => {
        if (!prev.isOpen || prev.type !== 'create') return prev;
        const newLogs = data.detail && !prev.logs.includes(data.detail)
          ? [...prev.logs, data.detail].slice(-5)
          : prev.logs;
        return {
          ...prev,
          percent: data.percent,
          stage: data.stage,
          detail: data.detail,
          step: data.step,
          totalSteps: data.totalSteps,
          logs: newLogs,
        };
      });
    };

    const handleRestoreProgress = (data: { step: number; totalSteps: number; percent: number; stage: string; detail: string }) => {
      setProgressState((prev) => {
        if (!prev.isOpen || prev.type !== 'restore') return prev;
        const newLogs = data.detail && !prev.logs.includes(data.detail)
          ? [...prev.logs, data.detail].slice(-5)
          : prev.logs;
        return {
          ...prev,
          percent: data.percent,
          stage: data.stage,
          detail: data.detail,
          step: data.step,
          totalSteps: data.totalSteps,
          logs: newLogs,
        };
      });
    };

    socket.on('backupProgress', handleBackupProgress);
    socket.on('restoreProgress', handleRestoreProgress);

    return () => {
      socket.off('backupProgress', handleBackupProgress);
      socket.off('restoreProgress', handleRestoreProgress);
    };
  }, []);

  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}s`;
  };

  const startProgress = (type: 'create' | 'restore') => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    const startTime = Date.now();

    setProgressState({
      isOpen: true,
      type,
      title: type === 'create' ? 'Creating Instant Database Snapshot' : 'Restoring Database Snapshot',
      percent: 8,
      stage: type === 'create' ? 'Querying Database Tables' : 'Initializing Safety Backup',
      detail: type === 'create' ? 'Executing parallel queries across all database tables...' : 'Creating pre-restore rollback safety snapshot...',
      step: 1,
      totalSteps: type === 'create' ? 6 : 7,
      logs: [type === 'create' ? 'Initiated database extraction' : 'Initiated restore sequence'],
      elapsedMs: 0,
    });

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgressState((prev) => {
        if (!prev.isOpen) return prev;
        // Only track elapsedMs and provide a subtle micro-pulse capped by the actual current server step
        const stepCap = Math.min(94, (prev.step / prev.totalSteps) * 94);
        const microInc = prev.percent < stepCap ? 0.08 : 0;
        return {
          ...prev,
          percent: Math.min(stepCap, prev.percent + microInc),
          elapsedMs: elapsed,
        };
      });
    }, 100);
  };

  const completeProgress = (successMessage: string) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setProgressState((prev) => ({
      ...prev,
      percent: 100,
      stage: successMessage,
      detail: 'All tasks completed successfully.',
      logs: [...prev.logs, successMessage].slice(-5),
    }));
    setTimeout(() => {
      setProgressState((prev) => ({ ...prev, isOpen: false }));
    }, 650);
  };

  const failProgress = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setProgressState((prev) => ({ ...prev, isOpen: false }));
  };

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  const fetchBackups = async () => {
    if (!isAuthorized) return;
    try {
      setIsLoading(true);
      const res = await api.backup.list();
      if (res.success) {
        setBackups(res.backups || []);
        setLiveCounts(res.liveRecordCounts || null);
        if (res.schedule) {
          setSchedule(res.schedule);
          setScheduleForm(res.schedule);
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch backup list:', error);
      showToast('Failed to load backup records.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchBackups();
    }
  }, [isAuthorized]);

  const handleCreateBackup = async () => {
    try {
      setIsCreating(true);
      startProgress('create');
      const res = await api.backup.create({
        createdBy: currentUser?.username || 'Administrator',
        type: 'manual',
      });
      if (res.success) {
        completeProgress('Snapshot created successfully!');
        showToast('Database backup created successfully!', 'success');
        fetchBackups();
      } else {
        failProgress();
      }
    } catch (error: any) {
      failProgress();
      console.error('Create backup failed:', error);
      showToast(error.message || 'Failed to create backup.', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      const url = await api.backup.getDownloadUrl(filename);
      window.open(url, '_blank');
    } catch (e) {
      showToast('Failed to generate download URL.', 'error');
    }
  };

  const handleInitiateDelete = (backup: BackupItem) => {
    setSelectedBackupForDelete(backup);
  };

  const handleConfirmDelete = async () => {
    if (!selectedBackupForDelete) return;
    try {
      setIsDeleting(true);
      const res = await api.backup.delete(selectedBackupForDelete.filename);
      if (res.success) {
        showToast('Backup snapshot deleted successfully.', 'success');
        setBackups((prev) => prev.filter((b) => b.filename !== selectedBackupForDelete.filename));
        setSelectedBackupForDelete(null);
      }
    } catch (error: any) {
      console.error('Delete backup failed:', error);
      showToast(error.message || 'Failed to delete backup snapshot.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInitiateRestore = (backup: BackupItem) => {
    setSelectedBackupForRestore(backup);
    setSuperadminPassword('');
    setRestoreError('');
  };

  const handleConfirmRestore = async () => {
    if (!selectedBackupForRestore) return;
    if (!superadminPassword.trim()) {
      setRestoreError('Superadmin or Developer password is required.');
      return;
    }

    try {
      setIsRestoring(true);
      setRestoreError('');
      startProgress('restore');
      const res = await api.backup.restore({
        filename: selectedBackupForRestore.filename,
        superadminPassword,
        username: currentUser?.username || 'admin',
      });

      if (res.success) {
        completeProgress('Database successfully restored! All sessions synced.');
        showToast('Database successfully restored from snapshot!', 'success');
        setSelectedBackupForRestore(null);
        fetchBackups();
      } else {
        failProgress();
      }
    } catch (error: any) {
      failProgress();
      console.error('Restore failed:', error);
      setRestoreError(error.message || 'Database restoration failed.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleSaveSchedule = async () => {
    try {
      setIsSavingSchedule(true);
      const res = await api.backup.saveSchedule(scheduleForm);
      if (res.success) {
        setSchedule(res.schedule);
        setIsScheduleModalOpen(false);
        showToast('Backup schedule updated successfully.', 'success');
      }
    } catch (error: any) {
      console.error('Save schedule failed:', error);
      showToast('Failed to update backup schedule.', 'error');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const res = await api.backup.upload(file);
      if (res.success) {
        showToast('Backup file uploaded and added to restore points!', 'success');
        setIsUploadModalOpen(false);
        fetchBackups();
      }
    } catch (error: any) {
      console.error('Upload backup failed:', error);
      showToast(error.message || 'Failed to upload backup file.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const lastBackup = backups.length > 0 ? backups[0] : null;

  if (!isAuthorized) {
    return (
      <div className="backup-page">
        <div className="backup-table-card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem', color: '#ef4444' }}>
            <MdSecurity />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Access Restricted
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '520px', margin: '0 auto' }}>
            The <strong>Database Backup &amp; Disaster Recovery Hub</strong> is strictly restricted to accounts with <strong>Superadmin</strong> or <strong>Developer</strong> administrative roles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="backup-page">
      {/* Header */}
      <div className="backup-page__header">
        <div>
          <h1 className="backup-page__title">Database Backup &amp; Disaster Recovery</h1>
          <p className="backup-page__subtitle">
            Manage PostgreSQL database snapshots, restore points, automated cron schedules, and emergency disaster recovery
          </p>
        </div>

        <div className="backup-page__header-actions">
          <Button variant="ghost" size="sm" onClick={fetchBackups} disabled={isLoading}>
            <MdRefresh /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setIsScheduleModalOpen(true)}>
            <MdSchedule /> Schedule Settings
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setIsUploadModalOpen(true)}>
            <MdUploadFile /> Upload Backup
          </Button>
          <Button variant="primary" size="sm" onClick={handleCreateBackup} disabled={isCreating}>
            <MdBackup /> {isCreating ? 'Creating Snapshot...' : '⚡ Instant Backup'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="backup-page__stats-grid">
        <div className="backup-stat-card">
          <div className="backup-stat-card__icon-wrapper backup-stat-card__icon-wrapper--blue">
            <MdStorage />
          </div>
          <div className="backup-stat-card__content">
            <span className="backup-stat-card__label">Total Live Records</span>
            <p className="backup-stat-card__value">
              {liveCounts ? liveCounts.total.toLocaleString() : '...'}
            </p>
            <span className="backup-stat-card__subtext">
              {liveCounts ? `${liveCounts.employees} Employees • ${liveCounts.documents} 201 Docs` : 'Loading...'}
            </span>
          </div>
        </div>

        <div className="backup-stat-card">
          <div className="backup-stat-card__icon-wrapper backup-stat-card__icon-wrapper--emerald">
            <MdBackup />
          </div>
          <div className="backup-stat-card__content">
            <span className="backup-stat-card__label">Available Restore Points</span>
            <p className="backup-stat-card__value">{backups.length}</p>
            <span className="backup-stat-card__subtext">
              {lastBackup ? `Latest: ${formatDate(lastBackup.createdAt)}` : 'No backups yet'}
            </span>
          </div>
        </div>

        <div className="backup-stat-card">
          <div className="backup-stat-card__icon-wrapper backup-stat-card__icon-wrapper--purple">
            <MdSchedule />
          </div>
          <div className="backup-stat-card__content">
            <span className="backup-stat-card__label">Auto-Backup Status</span>
            <p className="backup-stat-card__value">
              {schedule?.enabled ? 'Active' : 'Disabled'}
            </p>
            <span className="backup-stat-card__subtext">
              {schedule?.enabled
                ? `${schedule.frequency.toUpperCase()} at ${schedule.time} (Keep ${schedule.retentionCount})`
                : 'Automated backups disabled'}
            </span>
          </div>
        </div>

        <div className="backup-stat-card">
          <div className="backup-stat-card__icon-wrapper backup-stat-card__icon-wrapper--amber">
            <MdSecurity />
          </div>
          <div className="backup-stat-card__content">
            <span className="backup-stat-card__label">Disaster Recovery</span>
            <p className="backup-stat-card__value">Armed</p>
            <span className="backup-stat-card__subtext">
              Auto-safety snapshot on every restore
            </span>
          </div>
        </div>
      </div>

      {/* Backups Table */}
      <div className="backup-table-card">
        <div className="backup-table-card__header">
          <h2 className="backup-table-card__title">
            <MdBackup /> Restore Points Repository <span className="backup-table-card__count">{backups.length}</span>
          </h2>
        </div>

        {isLoading ? (
          <div className="backup-table__empty">Loading restore points...</div>
        ) : backups.length === 0 ? (
          <div className="backup-table__empty">
            <div className="backup-table__empty-icon">💾</div>
            <h3>No Restore Points Found</h3>
            <p>Click "⚡ Instant Backup" to create your first database snapshot.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="backup-table">
              <thead>
                <tr>
                  <th>Snapshot Name</th>
                  <th>Created Date</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Table Breakdown</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((item) => (
                  <tr key={item.filename}>
                    <td>
                      <span
                        className="backup-table__filename"
                        title="Click to view full snapshot breakdown"
                        onClick={() => setSelectedBackupForDetails(item)}
                        style={{ cursor: 'pointer' }}
                      >
                        💾 {item.filename}
                      </span>
                    </td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>
                      <span className={`backup-table__type-badge backup-table__type-badge--${item.type}`}>
                        {item.type === 'safety' ? '🛡️ Pre-Restore Safety' : item.type}
                      </span>
                    </td>
                    <td>{formatBytes(item.sizeBytes)}</td>
                    <td>
                      <div className="backup-table__records-summary">
                        {item.recordCounts?.employees !== undefined && (
                          <span className="backup-table__record-chip backup-table__record-chip--emp">
                            👤 {item.recordCounts.employees} Emp
                          </span>
                        )}
                        {item.recordCounts?.documents !== undefined && (
                          <span className="backup-table__record-chip backup-table__record-chip--doc">
                            📄 {item.recordCounts.documents} Docs
                          </span>
                        )}
                        {item.recordCounts?.inventoryRecords !== undefined && item.recordCounts.inventoryRecords > 0 && (
                          <span className="backup-table__record-chip backup-table__record-chip--inv">
                            📦 {item.recordCounts.inventoryRecords} Inv
                          </span>
                        )}
                        {item.recordCounts?.users !== undefined && (
                          <span className="backup-table__record-chip backup-table__record-chip--user">
                            👥 {item.recordCounts.users} Users
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="backup-table__actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedBackupForDetails(item)}
                          title="View complete snapshot details"
                        >
                          <MdVisibility /> Details
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadBackup(item.filename)}
                          title="Download backup file"
                        >
                          <MdCloudDownload /> Download
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleInitiateRestore(item)}
                          title="Restore database to this point"
                        >
                          <MdRestore /> Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleInitiateDelete(item)}
                          title="Delete this snapshot"
                          style={{ color: '#ef4444' }}
                        >
                          <MdDelete />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Snapshot Full Details & Record Breakdown Modal */}
      {selectedBackupForDetails && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedBackupForDetails(null)}
          title="Snapshot Details & Data Breakdown"
          size="lg"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <Button
                variant="ghost"
                onClick={() => {
                  const toDelete = selectedBackupForDetails;
                  setSelectedBackupForDetails(null);
                  handleInitiateDelete(toDelete);
                }}
                style={{ color: '#ef4444' }}
              >
                <MdDelete /> Delete Snapshot
              </Button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button
                  variant="secondary"
                  onClick={() => handleDownloadBackup(selectedBackupForDetails.filename)}
                >
                  <MdCloudDownload /> Download File
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const toRestore = selectedBackupForDetails;
                    setSelectedBackupForDetails(null);
                    handleInitiateRestore(toRestore);
                  }}
                >
                  <MdRestore /> Restore This Snapshot
                </Button>
              </div>
            </div>
          }
        >
          <div className="snapshot-details">
            {/* Metadata Summary */}
            <div className="snapshot-meta-banner">
              <div className="snapshot-meta-item">
                <span className="snapshot-meta-item__label">Filename</span>
                <span className="snapshot-meta-item__value" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>
                  {selectedBackupForDetails.filename}
                </span>
              </div>
              <div className="snapshot-meta-item">
                <span className="snapshot-meta-item__label">Date Created</span>
                <span className="snapshot-meta-item__value">
                  {formatDate(selectedBackupForDetails.createdAt)}
                </span>
              </div>
              <div className="snapshot-meta-item">
                <span className="snapshot-meta-item__label">Backup Type</span>
                <span className="snapshot-meta-item__value">
                  <span className={`backup-table__type-badge backup-table__type-badge--${selectedBackupForDetails.type}`}>
                    {selectedBackupForDetails.type === 'safety' ? '🛡️ Pre-Restore Safety' : selectedBackupForDetails.type}
                  </span>
                </span>
              </div>
              <div className="snapshot-meta-item">
                <span className="snapshot-meta-item__label">File Size</span>
                <span className="snapshot-meta-item__value">
                  {formatBytes(selectedBackupForDetails.sizeBytes)} ({selectedBackupForDetails.sizeBytes.toLocaleString()} bytes)
                </span>
              </div>
              <div className="snapshot-meta-item">
                <span className="snapshot-meta-item__label">Created By</span>
                <span className="snapshot-meta-item__value">
                  {selectedBackupForDetails.createdBy || 'System'}
                </span>
              </div>
            </div>

            {/* Complete Table Breakdown Grid */}
            <div className="snapshot-tables-section">
              <h4>
                <MdLayers /> Complete Table Records Breakdown
              </h4>
              <div className="snapshot-tables-grid">
                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#3b82f6' }}>
                    <MdPeople />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.employees ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Employee Profiles</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#10b981' }}>
                    <MdDescription />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.documents ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">201 Documents</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#f59e0b' }}>
                    <MdStorage />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.inventoryRecords ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Inventory Appraisal</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#ef4444' }}>
                    <MdHistory />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.disposalHistory ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Disposal History</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#0ea5e9' }}>
                    <MdFolder />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.transferredStorage ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Transferred Storage</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#6366f1' }}>
                    <MdAssignmentTurnedIn />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.inventoryRequests ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Inventory Requests</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#8b5cf6' }}>
                    <MdPeople />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.users ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">System Users</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#eab308' }}>
                    <MdFolder />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.yellowBoxes ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Yellow Boxes</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#06b6d4' }}>
                    <MdHistory />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.file201BorrowLogs ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">201 Borrow Logs</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#10b981' }}>
                    <MdAssignmentTurnedIn />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.approvalRequests ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Approval Requests</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#f59e0b' }}>
                    <MdSecurity />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.auditLogs ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Audit Trail Logs</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#8b5cf6' }}>
                    <MdChat />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.chatMessages ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Chat Messages</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#ec4899' }}>
                    <MdEvent />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.activities ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Calendar Events</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#059669' }}>
                    <MdFolderOpen />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.physicalFiles ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Physical Upload Files</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#3b82f6' }}>
                    <MdChat />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.groupChats ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Group Chats</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#d97706' }}>
                    <MdInventory />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.inventoryRecords ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">Inventory Series</span>
                  </div>
                </div>

                <div className="snapshot-table-card">
                  <div className="snapshot-table-card__icon" style={{ color: '#64748b' }}>
                    <MdSettings />
                  </div>
                  <div className="snapshot-table-card__info">
                    <span className="snapshot-table-card__count">
                      {(selectedBackupForDetails.recordCounts?.systemSettings ?? 0).toLocaleString()}
                    </span>
                    <span className="snapshot-table-card__label">System Settings</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Snapshot Confirmation Modal */}
      {selectedBackupForDelete && (
        <Modal
          isOpen={true}
          onClose={() => !isDeleting && setSelectedBackupForDelete(null)}
          title="Delete Backup Snapshot"
          size="md"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setSelectedBackupForDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
              >
                {isDeleting ? 'Deleting Snapshot...' : '🗑️ Delete Snapshot Permanently'}
              </Button>
            </>
          }
        >
          <div className="delete-modal__warning">
            <MdWarning className="delete-modal__warning-icon" />
            <div>
              <h4 className="delete-modal__warning-title">PERMANENT FILE DELETION</h4>
              <p className="delete-modal__warning-text">
                Are you sure you want to delete this backup snapshot? This file will be permanently removed from disk storage and cannot be recovered.
              </p>
            </div>
          </div>

          <div className="delete-modal__details">
            <h5 className="delete-modal__details-title">Snapshot to Delete</h5>
            <div className="delete-modal__details-row">
              <span>Filename:</span>
              <strong>{selectedBackupForDelete.filename}</strong>
            </div>
            <div className="delete-modal__details-row">
              <span>Created Date:</span>
              <strong>{formatDate(selectedBackupForDelete.createdAt)}</strong>
            </div>
            <div className="delete-modal__details-row">
              <span>Size:</span>
              <strong>{formatBytes(selectedBackupForDelete.sizeBytes)}</strong>
            </div>
            <div className="delete-modal__details-row">
              <span>Type:</span>
              <strong>{selectedBackupForDelete.type}</strong>
            </div>
          </div>
        </Modal>
      )}

      {/* Restore Confirmation Modal */}
      {selectedBackupForRestore && (
        <Modal
          isOpen={true}
          onClose={() => !isRestoring && setSelectedBackupForRestore(null)}
          title="Confirm Database Restoration"
          size="md"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setSelectedBackupForRestore(null)}
                disabled={isRestoring}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
              >
                {isRestoring ? 'Restoring Database...' : '⚠️ Execute Database Restore'}
              </Button>
            </>
          }
        >
          <div className="restore-modal__warning">
            <MdWarning className="restore-modal__warning-icon" />
            <div>
              <h4 className="restore-modal__warning-title">CRITICAL DATABASE RESTORATION</h4>
              <p className="restore-modal__warning-text">
                Restoring will overwrite current live database records with data from this snapshot.
                An automated <strong>Pre-Restore Safety Snapshot</strong> will be created immediately before changes are applied.
              </p>
            </div>
          </div>

          <div className="restore-modal__details">
            <h5 className="restore-modal__details-title">Selected Restore Point</h5>
            <div className="restore-modal__details-row">
              <span>File:</span>
              <strong>{selectedBackupForRestore.filename}</strong>
            </div>
            <div className="restore-modal__details-row">
              <span>Date Created:</span>
              <strong>{formatDate(selectedBackupForRestore.createdAt)}</strong>
            </div>
            <div className="restore-modal__details-row">
              <span>Size:</span>
              <strong>{formatBytes(selectedBackupForRestore.sizeBytes)}</strong>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.85rem', fontWeight: 600 }}>
              Superadmin or Developer Password Verification <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <Input
              type="password"
              placeholder="Enter Superadmin or Developer password"
              value={superadminPassword}
              onChange={(e) => setSuperadminPassword(e.target.value)}
              disabled={isRestoring}
              error={restoreError}
              autoFocus
            />
          </div>
        </Modal>
      )}

      {/* Schedule Settings Modal */}
      <Modal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        title="Automated Backup Schedule"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsScheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveSchedule} disabled={isSavingSchedule}>
              {isSavingSchedule ? 'Saving...' : 'Save Settings'}
            </Button>
          </>
        }
      >
        <div className="schedule-modal__form">
          <div className="schedule-modal__checkbox-container">
            <div>
              <p className="schedule-modal__checkbox-label">Automated Background Backups</p>
              <p className="schedule-modal__checkbox-sub">Automatically create scheduled snapshots</p>
            </div>
            <input
              type="checkbox"
              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              checked={scheduleForm.enabled}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
          </div>

          <div className="schedule-modal__field">
            <label className="schedule-modal__label">Backup Frequency</label>
            <select
              className="schedule-modal__select"
              value={scheduleForm.frequency}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, frequency: e.target.value as any }))}
              disabled={!scheduleForm.enabled}
            >
              <option value="daily">Daily (Every Day)</option>
              <option value="weekly">Weekly (Every Sunday)</option>
            </select>
          </div>

          <div className="schedule-modal__field">
            <label className="schedule-modal__label">Backup Execution Time (24-hr)</label>
            <input
              type="time"
              className="schedule-modal__input"
              value={scheduleForm.time}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, time: e.target.value }))}
              disabled={!scheduleForm.enabled}
            />
          </div>

          <div className="schedule-modal__field">
            <label className="schedule-modal__label">Retention Limit (Keep Last N Backups)</label>
            <select
              className="schedule-modal__select"
              value={scheduleForm.retentionCount}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, retentionCount: Number(e.target.value) }))}
              disabled={!scheduleForm.enabled}
            >
              <option value={5}>Keep Last 5 Backups</option>
              <option value={10}>Keep Last 10 Backups</option>
              <option value={20}>Keep Last 20 Backups</option>
              <option value={30}>Keep Last 30 Backups</option>
              <option value={50}>Keep Last 50 Backups</option>
              <option value={100}>Keep Last 100 Backups</option>
              <option value={0}>Unlimited (Keep All Restore Points)</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Upload Backup File Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => !isUploading && setIsUploadModalOpen(false)}
        title="Upload Backup File"
        size="md"
        footer={
          <Button variant="secondary" onClick={() => setIsUploadModalOpen(false)} disabled={isUploading}>
            Close
          </Button>
        }
      >
        <div
          className="backup-upload-zone"
          onClick={() => fileInputRef.current?.click()}
        >
          <MdUploadFile className="backup-upload-zone__icon" />
          <h4 className="backup-upload-zone__title">
            {isUploading ? 'Uploading and validating backup...' : 'Click to Browse JSON Backup File'}
          </h4>
          <p className="backup-upload-zone__subtitle">
            Supported formats: .json database snapshot files
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
            disabled={isUploading}
          />
        </div>
      </Modal>
      {/* Real-time Percentage & Timer Progress Modal */}
      <Modal
        isOpen={progressState.isOpen}
        onClose={() => {}}
        title={progressState.title}
        size="md"
        hideCloseButton={true}
        allowMinimize={false}
        allowFullscreen={false}
      >
        <div className="backup-progress-modal">
          <div className="backup-progress-modal__header-badge">
            <div className={`backup-progress-modal__spinner backup-progress-modal__spinner--${progressState.type}`}>
              {progressState.type === 'create' ? <MdBackup size={30} /> : <MdRestore size={30} />}
            </div>
            <div className="backup-progress-modal__percent-wrap">
              <span className="backup-progress-modal__percent">{Math.round(progressState.percent)}%</span>
              <span className="backup-progress-modal__timer">
                <MdSchedule size={14} /> {formatElapsed(progressState.elapsedMs)}
              </span>
            </div>
          </div>

          <div className="backup-progress-modal__track">
            <div
              className={`backup-progress-modal__bar backup-progress-modal__bar--${progressState.type}`}
              style={{ width: `${Math.min(100, Math.max(5, progressState.percent))}%` }}
            />
          </div>

          <div className="backup-progress-modal__status-row">
            <div className="backup-progress-modal__stage-wrap">
              <div className="backup-progress-modal__stage-header">
                <span className="backup-progress-modal__stage">{progressState.stage}</span>
                <span className="backup-progress-modal__step-badge">
                  Step {progressState.step} of {progressState.totalSteps}
                </span>
              </div>
              <p className="backup-progress-modal__detail">{progressState.detail}</p>
            </div>
            <span
              className={`backup-progress-modal__status-tag ${
                progressState.percent >= 100 ? 'backup-progress-modal__status-tag--completed' : ''
              }`}
            >
              {progressState.percent >= 100 ? 'COMPLETED' : 'IN PROGRESS'}
            </span>
          </div>

          {/* Live Action Log Console */}
          <div className="backup-progress-modal__console">
            <div className="backup-progress-modal__console-header">
              <span>Live Action Log</span>
              {progressState.percent < 100 && (
                <span className="backup-progress-modal__working-indicator">
                  <span className="backup-progress-modal__pulse-dot" /> Active
                </span>
              )}
            </div>
            <div className="backup-progress-modal__console-body">
              {progressState.logs.map((log, index) => (
                <div key={index} className="backup-progress-modal__log-line">
                  <span className="backup-progress-modal__log-check">✓</span>
                  <span className="backup-progress-modal__log-text">{log}</span>
                </div>
              ))}
              {progressState.percent < 100 && (
                <div className="backup-progress-modal__log-line backup-progress-modal__log-line--active">
                  <span className="backup-progress-modal__log-spinner">⏳</span>
                  <span className="backup-progress-modal__log-text">{progressState.detail || progressState.stage}</span>
                </div>
              )}
            </div>
          </div>

          {progressState.percent >= 85 && progressState.percent < 100 && (
            <div className="backup-progress-modal__note">
              Writing snapshot file and validating integrity. Please do not close this window.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default BackupRestore;
