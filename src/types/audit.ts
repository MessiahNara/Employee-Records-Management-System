export type AuditActionType = 'create' | 'update' | 'status_change' | 'delete' | 'upload' | 'import';

export interface AuditMetadata {
  employees?: Array<{
    first_name: string;
    last_name: string;
  }>;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole?: string;
  actionType: AuditActionType;
  action: string;
  description: string;
  entityId: string;
  entityType: 'employee' | 'user' | 'record' | 'report' | 'document' | 'file201';
  metadata?: AuditMetadata;
}
