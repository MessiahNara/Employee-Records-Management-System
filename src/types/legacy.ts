/**
 * LEGACY/FUTURE TYPES
 * These types are designed for a more comprehensive records management system
 * that is not currently implemented. They are kept for reference and future expansion.
 */

import { UUID, Timestamp, PermissionAction } from './index';

// Unused Enums
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum RecordStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export enum RecordPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum ReportType {
  RECORDS_SUMMARY = 'records_summary',
  USER_ACTIVITY = 'user_activity',
  APPROVAL_METRICS = 'approval_metrics',
  SYSTEM_AUDIT = 'system_audit',
}

// Role interface
export interface Role {
  id: UUID;
  name: string;
  description: string;
  permissions: PermissionAction[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// User Permissions interface
export interface UserPermissions {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
  allowedTabs?: string[];
}

// Record interface
export interface Record {
  id: UUID;
  title: string;
  description: string;
  status: RecordStatus;
  priority: RecordPriority;
  category: string;
  tags: string[];
  createdById: UUID;
  assignedToId?: UUID;
  approvedById?: UUID;
  metadata: RecordMetadata;
  attachments: Attachment[];
  auditLog: AuditLogEntry[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  approvedAt?: Timestamp;
  archivedAt?: Timestamp;
}

export interface RecordMetadata {
  department: string;
  projectCode?: string;
  fiscalYear: number;
  confidential: boolean;
  retentionPeriod?: number; // in years
}

export interface Attachment {
  id: UUID;
  fileName: string;
  fileSize: number; // in bytes
  fileType: string;
  uploadedById: UUID;
  uploadedAt: Timestamp;
  url: string;
}

export interface AuditLogEntry {
  id: UUID;
  action: string;
  performedById: UUID;
  timestamp: Timestamp;
  changes?: { [key: string]: any };
  notes?: string;
}

// Report interface
export interface Report {
  id: UUID;
  title: string;
  type: ReportType;
  description: string;
  generatedById: UUID;
  parameters: ReportParameters;
  data: ReportData;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
}

export interface ReportParameters {
  dateFrom?: Timestamp;
  dateTo?: Timestamp;
  departments?: string[];
  statuses?: RecordStatus[];
  userIds?: UUID[];
}

export interface ReportData {
  summary: { [key: string]: any };
  details: any[];
  charts?: ChartData[];
}

export interface ChartData {
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string[];
    borderColor?: string;
  }[];
}

// API Response types (for future backend integration)
export interface ApiResponse<T> {
  data: T;
  message?: string;
  timestamp: Timestamp;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  timestamp: Timestamp;
}
