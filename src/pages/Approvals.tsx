import { useState, useEffect, useCallback, useRef } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ApproveRequestModal from '../components/ApproveRequestModal';
import RejectRequestModal from '../components/RejectRequestModal';
import RequestDetailsModal from '../components/RequestDetailsModal';
import { getAuthState } from '../utils/mockAuth';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import { MdCheckCircle, MdCancel, MdRefresh, MdPending } from 'react-icons/md';
import './Approvals.css';

const ACTION_LABELS: Record<string, string> = {
  update_employee: 'Update Employee',
  delete_employee: 'Delete Employee',
  bulk_delete_employee: 'Bulk Delete Employees',
  delete_document: 'Delete Document',
  bulk_delete_document: 'Bulk Delete Documents',
  delete_report_entry: 'Delete Report Entry',
  delete_borrow_logs: 'Delete Checked-Out File Log',
  sync_import: 'Sync Import',
  update_user: 'Update User',
  delete_user: 'Delete User',
  borrow_201: 'Borrow 201 File',
  view_document: 'View Document',
  print_document: 'Print Document',
  download_document: 'Download Document',
  delete_inventory_record: 'Delete Inventory Record',
  bulk_delete_inventory_records: 'Bulk Delete Inventory Records',
  create_group_chat: 'Create Group Chat',
};

function Approvals() {
  const { showToast } = useToast();
  const currentUser = getAuthState();
  const isSuperAdminOrDeveloper = currentUser?.role === 'superadmin' || currentUser?.role === 'developer';

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [fileConditions, setFileConditions] = useState<Record<string, string>>({});

  // Approve modal
  const [approveTarget, setApproveTarget] = useState<any>(null);
  const [bulkApproveMode, setBulkApproveMode] = useState(false);
  const approveUsernameRef = useRef<HTMLInputElement>(null);

  // Focus username field once when approve modal opens
  useEffect(() => {
    if (approveTarget) {
      setTimeout(() => approveUsernameRef.current?.focus(), 50);
    }
  }, [!!approveTarget]);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [bulkRejectMode, setBulkRejectMode] = useState(false);

  // View Details modal
  const [viewDetailsTarget, setViewDetailsTarget] = useState<any>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = filter === 'pending'
        ? await api.approvals.getPending()
        : await api.approvals.getAll();
      setRequests(data);

      // Fetch file conditions for approved borrow_201 requests
      const approvedBorrows = data.filter(
        (r: any) => r.action === 'borrow_201' && r.status === 'approved' && r.payload?.employeeId
      );
      if (approvedBorrows.length > 0) {
        const uniqueEmployeeIds = [...new Set(approvedBorrows.map((r: any) => r.payload.employeeId))] as string[];
        const conditionMap: Record<string, string> = {};
        await Promise.all(
          uniqueEmployeeIds.map(async (empId: string) => {
            try {
              const emp = await api.employee.getById(empId);
              conditionMap[empId] = emp.file201Status || 'Available';
            } catch {
              conditionMap[empId] = 'Available';
            }
          })
        );
        setFileConditions(conditionMap);
      }
    } catch {
      showToast('Failed to fetch approval requests', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    const handleUpdate = () => {
      fetchRequests();
    };
    window.addEventListener('approvalsUpdated', handleUpdate);
    return () => window.removeEventListener('approvalsUpdated', handleUpdate);
  }, [fetchRequests]);

  const formatRequestedInfo = (req: any): string => {
    const payload = req.payload || {};
    switch (req.action) {
      case 'update_employee':
      case 'update_user': {
        const FIELD_LABELS: Record<string, string> = {
          lastName: 'Last Name',
          firstName: 'First Name',
          middleName: 'Middle Name',
          dateOfBirth: 'Date of Birth',
          gender: 'Gender',
          officeName: 'Office / Hospital',
          appointmentStatus: 'Appointment Status',
          appointmentFrom: 'Appointment From',
          appointmentTo: 'Appointment To',
          status: 'Status',
          position: 'Position',
          dateOfEmployment: 'Date of Employment',
          dateOfSeparation: 'Date of Separation',
          reasonOfSeparation: 'Reason for Separation',
          isDetailed: 'Detailed',
          motherUnit: 'Mother Unit',
          detailedTo: 'Detailed To',
          detailedDivision: 'Detailed Division',
          detailedFunction: 'Detailed Function',
          detailedDate: 'Detailed Date',
          fileboxLocation: 'Filebox Location',
          file201Status: '201 File Status',
          username: 'Username',
          email: 'Email',
          role: 'Role',
          permissions: 'Permissions',
          password: 'Password',
        };

        // update_user wraps fields under changedFields; update_employee stores them directly
        const fields_map = req.action === 'update_user'
          ? (payload.changedFields || {})
          : payload;

        const fields = Object.keys(fields_map).filter(k => k !== 'userId');
        if (fields.length === 0) return 'No changes detected';

        return fields.map(k => {
          const label = FIELD_LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
          const val = fields_map[k];
          // { from, to } structure
          if (val && typeof val === 'object' && 'from' in val && 'to' in val) {
            const from = val.from ?? '—';
            const to = val.to ?? '—';
            if (typeof from === 'object' || typeof to === 'object') return `${label}: (permissions updated)`;
            return `${label}: (From) ${from} → (To) ${to}`;
          }
          // Legacy flat value (backward compat for existing records)
          if (typeof val === 'object' && val !== null) return `${label}: (permissions updated)`;
          return `${label}: ${val ?? '—'}`;
        }).join(' | ');
      }
      case 'delete_employee':
      case 'delete_user':
        return `Delete: ${payload.employeeName || payload.userName || req.entityName}`;
      case 'bulk_delete_employee': {
        const names = (payload.employeeNames || []).map((e: any) => `${e.lastName}, ${e.firstName}`).join('; ');
        return `Delete ${payload.ids?.length || 0} employees${names ? ': ' + names : ''}`;
      }
      case 'delete_report_entry': {
        const entryNames = (payload.entryNames || []).join('; ');
        return `Delete ${payload.ids?.length || 1} report entr${payload.ids?.length === 1 ? 'y' : 'ies'}${entryNames ? ': ' + entryNames : ''}`;
      }
      case 'delete_borrow_logs': {
        const entryNames = (payload.entryNames || []).join('; ');
        return `Delete ${payload.ids?.length || 1} pulled-out file log${payload.ids?.length === 1 ? '' : 's'}${entryNames ? ': ' + entryNames : ''}`;
      }
      case 'delete_document':
        return `Delete document: ${payload.fileName || req.entityName}${payload.category ? ` (${payload.category})` : ''}`;
      case 'bulk_delete_document': {
        const docNames = (payload.documentNames || []).map((d: any) => d.fileName).join('; ');
        return `Delete ${payload.ids?.length || 0} documents${docNames ? ': ' + docNames : ''}`;
      }
      case 'delete_inventory_record':
        return `Delete Inventory Record: ${payload.seriesTitle}`;
      case 'bulk_delete_inventory_records':
        return `Delete ${payload.count} Inventory Records`;
      case 'borrow_201':
        return `Borrow 201 of ${payload.employeeName}${payload.borrowerName ? ' — Borrowed By: ' + payload.borrowerName : ''}`;
      case 'view_document':
      case 'print_document':
      case 'download_document': {
        const actionWord = req.action === 'view_document' ? 'View' : req.action === 'print_document' ? 'Print' : 'Download';
        return `${actionWord}: ${payload.fileName || req.entityName}${payload.category ? ` (${payload.category})` : ''}${payload.employeeName ? ` — Employee: ${payload.employeeName}` : ''}`;
      }
      case 'create_group_chat': {
        return `Create Group Chat: "${payload.groupName}" with ${payload.selectedMemberIds?.length || 0} members (${payload.memberNames || 'None'})`;
      }
      default:
        return req.entityName || req.entityId;
    }
  };

  const handleApprove = async (username: string, password: string) => {
    if (bulkApproveMode) {
      return handleBulkApprove(username, password);
    }
    const result = await api.approvals.approve(approveTarget.id, { username, password });
    await executeApprovedAction(result);
    showToast(`✅ Request approved and executed successfully.`, 'success');
    setApproveTarget(null);
    fetchRequests();
  };

  const handleBulkApprove = async (username: string, password: string) => {
    let successCount = 0;
    for (const id of selectedIds) {
      try {
        const result = await api.approvals.approve(id, { username, password });
        await executeApprovedAction(result);
        successCount++;
      } catch (err) {
        console.error('Failed to approve request', id, err);
      }
    }
    showToast(`✅ ${successCount} requests approved.`, 'success');
    setBulkApproveMode(false);
    setSelectedIds(new Set());
    fetchRequests();
  };

  const executeApprovedAction = async (result: any) => {
    const { action, entityId, entityName, payload, approvalToken, requestedBy, requestedByName, approverName } = result;

    switch (action) {
      case 'update_employee': {
        // Extract only the 'to' values from { from, to } structure
        const flatPayload: any = {};
        for (const [k, v] of Object.entries(payload)) {
          if (k === '_aoFile') continue;
          flatPayload[k] = (v && typeof v === 'object' && 'to' in (v as any)) ? (v as any).to : v;
        }

        // Upload AO File if present in payload
        if (payload._aoFile) {
          try {
            // Convert base64 back to File
            const { data, metadata } = payload._aoFile;
            
            // Extract content type and base64 string
            const arr = data.split(',');
            const mimeMatch = arr[0].match(/:(.*?);/);
            const mime = mimeMatch ? mimeMatch[1] : metadata.mimeType;
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while(n--){
                u8arr[n] = bstr.charCodeAt(n);
            }
            const file = new File([u8arr], metadata.fileName, { type: mime });

            await api.document.upload(
              file,
              metadata,
              requestedBy, // Original requester
              requestedByName
            );
          } catch (uploadError) {
            console.error("Failed to upload attached AO file during approval execution", uploadError);
          }
        }

        await api.employee.partialUpdate(entityId, flatPayload, requestedBy, requestedByName, approvalToken);
        break;
      }
      case 'delete_employee':
        await api.employee.delete(entityId, requestedBy, requestedByName, undefined, approverName, approvalToken);
        break;
      case 'bulk_delete_employee':
        await api.employee.bulkDelete(
          payload.ids,
          requestedBy,
          requestedByName,
          payload.employeeNames,
          undefined,
          approverName,
          approvalToken
        );
        break;
      case 'delete_document':
        await api.document.delete(entityId, requestedBy, requestedByName, undefined, approverName, approvalToken);
        break;
      case 'bulk_delete_document':
        await api.document.bulkDelete(
          payload.ids,
          requestedBy,
          requestedByName,
          payload.documentNames,
          undefined,
          approverName,
          approvalToken
        );
        break;
      case 'delete_report_entry':
        await api.employee.deleteReportEntries(payload.ids || [entityId]);
        break;
      case 'delete_borrow_logs':
        await api.file201.deleteLogs(payload.ids || [entityId]);
        break;
      case 'delete_inventory_record':
        await api.inventory.delete(entityId, approvalToken);
        break;
      case 'bulk_delete_inventory_records':
        await api.inventory.bulkDelete(payload.ids, approvalToken);
        break;
      case 'update_user': {
        // Extract only the 'to' values from { from, to } structure
        const flatUserFields: any = {};
        for (const [k, v] of Object.entries(payload.changedFields || {})) {
          flatUserFields[k] = (v && typeof v === 'object' && 'to' in (v as any)) ? (v as any).to : v;
        }
        await api.user.partialUpdate(payload.userId, flatUserFields, requestedBy, approvalToken);
        break;
      }
      case 'delete_user':
        await api.user.delete(payload.id, approvalToken);
        break;
      case 'create_group_chat':
        await api.chats.createGroup({
          id: entityId || `group_${Date.now()}`,
          name: payload.groupName || entityName,
          creatorId: requestedBy || payload.creatorId,
          creatorName: (approveTarget as any)?.requestedByName || payload.creatorName || 'User',
          memberIds: payload.selectedMemberIds || payload.members || payload.memberIds || [],
        });
        break;
      case 'borrow_201':
        await api.file201.borrow(payload.employeeId, {
          borrowerName: payload.borrowerName,
          borrowerPosition: payload.borrowerPosition || undefined,
          borrowerOffice: payload.borrowerOffice || undefined,
          purpose: payload.purpose || undefined,
          releasedBy: payload.releasedBy,
        });
        break;
      case 'view_document':
        // Approval grants 24-hour access — the actual viewing happens in the Requests panel.
        // Nothing to execute server-side; the updated status + resolvedAt in the DB is enough.
        break;
      case 'print_document':
      case 'download_document':
        // These are also executed from the Requests panel after approval.
        break;
      default:
        console.warn('Unknown action to execute:', action);
    }
  };

  const handleReject = async (reason: string) => {
    if (bulkRejectMode) {
      return handleBulkReject(reason);
    }
    await api.approvals.reject(rejectTarget.id, reason);
    showToast('Request rejected.', 'info');
    fetchRequests();
  };

  const handleBulkReject = async (reason: string) => {
    let successCount = 0;
    for (const id of selectedIds) {
      try {
        await api.approvals.reject(id, reason);
        successCount++;
      } catch (err) {
        console.error('Failed to reject request', id, err);
      }
    }
    showToast(`${successCount} requests rejected.`, 'info');
    setBulkRejectMode(false);
    setSelectedIds(new Set());
    fetchRequests();
  };

  const handleDelete = async (id: string) => {
    try {
      await api.approvals.remove(id);
      fetchRequests();
    } catch {
      showToast('Failed to delete request', 'error');
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (!isSuperAdminOrDeveloper) {
    return (
      <div className="approvals">
        <Card>
          <div className="approvals__unauthorized">
            <p>You don't have permission to view this page.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="approvals">
      {/* Header */}
      <div className="approvals__header">
        <div>
          <h1 className="approvals__title">Request &amp; Approvals</h1>
          <p className="approvals__subtitle">
            Review and approve pending requests from other users
            {pendingCount > 0 && filter === 'pending' && (
              <span className="approvals__pending-badge">{pendingCount} pending</span>
            )}
          </p>
        </div>
        <div className="approvals__header-actions">
          {selectedIds.size > 0 ? (
            <div className="approvals__bulk-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="approvals__bulk-count" style={{ fontSize: '14px', fontWeight: '500', marginRight: '8px' }}>
                {selectedIds.size} selected
              </span>
              <Button variant="success" size="sm" onClick={() => setBulkApproveMode(true)}>
                <MdCheckCircle /> Approve
              </Button>
              <Button variant="danger" size="sm" onClick={() => setBulkRejectMode(true)}>
                <MdCancel /> Reject
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="approvals__filter-tabs">
              <button
                className={`approvals__filter-tab ${filter === 'pending' ? 'approvals__filter-tab--active' : ''}`}
                onClick={() => setFilter('pending')}
              >
                <MdPending /> Pending
              </button>
              <button
                className={`approvals__filter-tab ${filter === 'all' ? 'approvals__filter-tab--active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All
              </button>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={fetchRequests}>
            <MdRefresh /> Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Card><p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</p></Card>
      ) : requests.length === 0 ? (
        <Card>
          <div className="approvals__empty">
            <MdCheckCircle className="approvals__empty-icon" />
            <p>No {filter === 'pending' ? 'pending' : ''} approval requests.</p>
          </div>
        </Card>
      ) : (
        <div className="approvals__list">
          {requests.map((req) => (
            <Card 
              key={req.id} 
              className={`approvals__card approvals__card--${req.status}`}
              onClick={() => setViewDetailsTarget(req)}
              style={{ cursor: 'pointer', transition: 'box-shadow 0.2s', padding: '1.5rem' }}
            >
              <div className="approvals__card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {req.status === 'pending' && filter === 'pending' && (
                    <input 
                      type="checkbox" 
                      className="approvals__checkbox"
                      checked={selectedIds.has(req.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => {
                        const newSelected = new Set(selectedIds);
                        if (newSelected.has(req.id)) newSelected.delete(req.id);
                        else newSelected.add(req.id);
                        setSelectedIds(newSelected);
                      }}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', margin: 0 }}
                    />
                  )}
                  <div className="approvals__card-title">
                    <span className="approvals__action-label">{ACTION_LABELS[req.action] || req.action}</span>
                  </div>
                </div>
                <div className="approvals__card-meta">
                  <Badge
                    variant={req.status === 'approved' ? 'success' : req.status === 'rejected' ? 'danger' : 'warning'}
                    size="sm"
                  >
                    {req.status.toUpperCase()}
                  </Badge>
                  <span className="approvals__timestamp">
                    {new Date(req.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="approvals__card-body">
                <div className="approvals__info-row">
                  <span className="approvals__info-label">Request By:</span>
                  <span className="approvals__info-value">
                    {req.requestedByName}
                    {req.requestedBy === currentUser?.id && (
                      <span className="approvals__self-tag"> (you — cannot self-approve)</span>
                    )}
                  </span>
                </div>
                <div className="approvals__info-row">
                  <span className="approvals__info-label">
                    {req.action === 'update_employee' || req.action === 'update_user' ? 'Updated:' : 'Requested:'}
                  </span>
                  <span className="approvals__info-value" style={{ 
                    display: '-webkit-box', 
                    WebkitLineClamp: 1, 
                    WebkitBoxOrient: 'vertical', 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {formatRequestedInfo(req)}
                  </span>
                </div>
                {req.payload?.purpose && (
                  <div className="approvals__info-row">
                    <span className="approvals__info-label">Purpose:</span>
                    <span className="approvals__info-value" style={{ fontStyle: 'italic' }}>
                      {req.payload.purpose}
                    </span>
                  </div>
                )}
                {(req.status === 'approved') && req.approvedByName && (
                  <div className="approvals__info-row">
                    <span className="approvals__info-label">Approved by:</span>
                    <span className="approvals__info-value">{req.approvedByName}</span>
                  </div>
                )}
                {/* File condition badges for approved borrow_201 requests */}
                {req.action === 'borrow_201' && req.status === 'approved' && req.payload?.employeeId && (
                  <div className="approvals__info-row">
                    <span className="approvals__info-label">File Status:</span>
                    <span className="approvals__info-value">
                      <span className="approvals__condition-badges">
                        {(() => {
                          const status = fileConditions[req.payload.employeeId] || 'Available';
                          const conditions = status.split(',').map((s: string) => s.trim()).filter(Boolean);
                          const nonComplete = conditions.filter((c: string) => c !== 'Available' && c !== 'Borrowed');

                          if (status === 'Borrowed') {
                            return <span className="approvals__condition-badge approvals__condition-badge--borrowed">BORROWED</span>;
                          }
                          return (
                            <>
                              <span className="approvals__condition-badge approvals__condition-badge--returned">RETURNED</span>
                              {nonComplete.map((cond: string) => (
                                <span key={cond} className={`approvals__condition-badge approvals__condition-badge--${cond.toLowerCase()}`}>
                                  {cond.toUpperCase()}
                                </span>
                              ))}
                            </>
                          );
                        })()}
                      </span>
                    </span>
                  </div>
                )}
                {req.status === 'rejected' && (
                  <div className="approvals__info-row">
                    <span className="approvals__info-label">Rejected by:</span>
                    <span className="approvals__info-value">{req.approvedByName || '—'}</span>
                  </div>
                )}
                {req.rejectedReason && (
                  <div className="approvals__info-row">
                    <span className="approvals__info-label">Reason:</span>
                    <span className="approvals__info-value">{req.rejectedReason}</span>
                  </div>
                )}
              </div>

              {req.status === 'pending' && (
                <div className="approvals__card-actions" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => {
                      if (req.requestedBy === currentUser?.id) {
                        showToast('You cannot approve your own request. Another Super Admin or Developer must approve it.', 'warning');
                        return;
                      }
                      setApproveTarget(req);
                    }}
                  >
                    <MdCheckCircle /> Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => { setRejectTarget(req); }}
                  >
                    <MdCancel /> Reject
                  </Button>
                </div>
              )}

              {req.status !== 'pending' && currentUser?.role === 'developer' && (
                <div className="approvals__card-actions" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(req.id)}>
                    Delete
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Approve Modal */}
      <ApproveRequestModal
        isOpen={!!approveTarget || bulkApproveMode}
        target={bulkApproveMode ? { action: 'Bulk Action', entityName: `Approve ${selectedIds.size} requests` } : approveTarget}
        onClose={() => { setApproveTarget(null); setBulkApproveMode(false); }}
        onApprove={handleApprove}
      />

      {/* Reject Modal */}
      <RejectRequestModal
        isOpen={!!rejectTarget || bulkRejectMode}
        target={bulkRejectMode ? { action: 'Bulk Action', entityName: `Reject ${selectedIds.size} requests` } : rejectTarget}
        actionLabels={ACTION_LABELS}
        onClose={() => { setRejectTarget(null); setBulkRejectMode(false); }}
        onReject={handleReject}
      />

      <RequestDetailsModal
        isOpen={!!viewDetailsTarget}
        target={viewDetailsTarget}
        onClose={() => setViewDetailsTarget(null)}
        formatRequestedInfo={formatRequestedInfo}
        ACTION_LABELS={ACTION_LABELS}
        onApproveClick={() => {
          if (!viewDetailsTarget) return;
          if (viewDetailsTarget.requestedBy === currentUser?.id) {
            showToast('You cannot approve your own request. Another Super Admin or Developer must approve it.', 'warning');
            return;
          }
          setApproveTarget(viewDetailsTarget);
          setViewDetailsTarget(null);
        }}
        onRejectClick={() => {
          if (!viewDetailsTarget) return;
          setRejectTarget(viewDetailsTarget);
          setViewDetailsTarget(null);
        }}
      />
    </div>
  );
}

export default Approvals;
