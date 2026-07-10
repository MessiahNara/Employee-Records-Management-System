// Base types
export type UUID = string;
export type Timestamp = string; // ISO 8601 format

// Enums
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

// Permission Action enum (actually used in Users.tsx)
export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  APPROVE = 'approve',
  ARCHIVE = 'archive',
}

// User Permissions interface (used in Users.tsx)
export interface UserPermissions {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

// Role interface (used in Users.tsx)
export interface Role {
  id: UUID;
  name: string;
  description: string;
  permissions: PermissionAction[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// User interface (used in frontend)
export interface User {
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  profilePicture?: string; // URL or file path to profile picture (optional)
  roleId: UUID;
  status: UserStatus;
  department: string;
  permissions?: UserPermissions;
  lastLogin?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy?: string; // Name of user who last updated this record
}
