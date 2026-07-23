/**
 * Audit Log Helper
 * Generates human-readable descriptions for audit log entries
 */

interface AuditLogData {
  action: string;
  entity: string;
  entityName?: string;
  userName?: string;
  details?: any;
}

/**
 * Generate a human-readable description for an audit log entry
 */
export function generateAuditDescription(data: AuditLogData): string {
  const { action, entity, entityName, userName, details } = data;
  
  if (details?.description && typeof details.description === 'string') {
    return details.description;
  }
  
  const user = userName || 'System';
  const entityType = formatEntityType(entity);
  const name = entityName || 'Unknown';
  
  switch (action.toLowerCase()) {
    case 'create':
      return `${user} added a new ${entityType}: ${name}`;
    
    case 'update': {
      // Special handling for appointment-related field changes on employees
      if (entity.toLowerCase() === 'employee' && details?.changedFields) {
        const appointmentFields = [
          'appointmentStatus', 'appointmentFrom', 'appointmentTo', 'expirationDate',
          'aoNumber', 'aoYear', 'aoType',
        ];
        const changedFields: string[] = details.changedFields;
        const appointmentChanges = changedFields.filter((f: string) => appointmentFields.includes(f));
        const otherChanges = changedFields.filter((f: string) => !appointmentFields.includes(f));

        if (appointmentChanges.length > 0 && otherChanges.length === 0) {
          // Pure appointment update
          if (appointmentChanges.length === 1) {
            const field = formatFieldName(appointmentChanges[0]);
            const value = details.values?.[appointmentChanges[0]];
            if (value !== undefined && value !== null && value !== '') {
              return `${user} updated appointment ${field} of ${name} to ${value}`;
            }
            return `${user} updated appointment ${field} of ${name}`;
          }
          return `${user} updated appointment details of ${name} (${appointmentChanges.map(formatFieldName).join(', ')})`;
        }

        if (appointmentChanges.length > 0 && otherChanges.length > 0) {
          return `${user} updated appointment and other details of ${name} (${changedFields.length} fields)`;
        }
      }

      if (details?.changedFields) {
        const fields: string[] = details.changedFields;
        if (fields.length === 1) {
          const field = formatFieldName(fields[0]);
          const value = details.values?.[fields[0]];
          if (value !== undefined && value !== null && value !== '') {
            return `${user} updated ${field} of ${name} to ${value}`;
          }
          return `${user} updated ${field} of ${name}`;
        } else if (fields.length > 1) {
          return `${user} updated ${fields.length} fields of ${name}`;
        }
      }
      return `${user} updated ${entityType}: ${name}`;
    }
    
    case 'delete':
      // For documents, show employee name if available
      if (entity.toLowerCase() === 'document' && details?.employeeName) {
        const authInfo = details?.authorizingUserName && details.authorizingUserName !== user 
          ? ` (Authorized by: ${details.authorizingUserName})` 
          : '';
        return `${user} deleted ${entityType} from ${details.employeeName}: ${name}${authInfo}`;
      }
      // For employees and users, show authorizing user if available
      if ((entity.toLowerCase() === 'employee' || entity.toLowerCase() === 'user') && details?.authorizingUserName) {
        const authInfo = details.authorizingUserName !== user 
          ? ` (Authorized by: ${details.authorizingUserName})` 
          : '';
        return `${user} deleted ${entityType}: ${name}${authInfo}`;
      }
      return `${user} deleted ${entityType}: ${name}`;
    
    case 'status_change': {
      const newStatus = details?.status || details?.values?.status;
      if (newStatus) {
        return `${user} changed status of ${name} to ${newStatus}`;
      }
      return `${user} changed status of ${name}`;
    }
    
    case 'upload': {
      const employeeNameUpload = details?.employeeName || name;
      return `${user} uploaded a document to ${employeeNameUpload}: ${name}`;
    }
    
    case 'download': {
      const employeeNameDownload = details?.employeeName || name;
      return `${user} downloaded a document from ${employeeNameDownload}: ${name}`;
    }

    case 'profile_picture_upload':
      return `${user} uploaded a profile picture for ${entityType}: ${name}`;

    case 'profile_picture_remove':
      return `${user} removed the profile picture of ${entityType}: ${name}`;

    case 'permission_change': {
      const authInfo = details?.authorizingUserName && details.authorizingUserName !== user
        ? ` (Authorized by: ${details.authorizingUserName})`
        : '';
      return `${user} updated permissions for user: ${name}${authInfo}`;
    }
    
    default:
      return `${user} performed ${action} on ${entityType}: ${name}`;
  }
}

/**
 * Format entity type for display
 */
function formatEntityType(entity: string): string {
  const entityMap: Record<string, string> = {
    'employee': 'employee',
    'user': 'user',
    'document': 'document',
    'record': 'record',
    'inventory': 'inventory record',
    'inventory_record': 'inventory record',
    'appraisal': 'inventory & appraisal record',
  };
  
  return entityMap[entity.toLowerCase()] || entity;
}

/**
 * Format field name for display
 */
function formatFieldName(field: string): string {
  // Convert camelCase or snake_case to readable format
  const formatted = field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
  
  // Capitalize first letter
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Extract entity name from employee data
 */
export function getEmployeeName(employee: any): string {
  if (!employee) return 'Unknown Employee';
  
  const parts = [
    employee.firstName,
    employee.middleName,
    employee.lastName
  ].filter(Boolean);
  
  return parts.join(' ') || 'Unknown Employee';
}

/**
 * Extract entity name from user data
 */
export function getUserName(user: any): string {
  if (!user) return 'Unknown User';
  
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  
  return user.username || user.name || 'Unknown User';
}

/**
 * Create audit log entry with human-readable description
 */
export async function createAuditLog(
  prisma: any,
  data: {
    userId: string;
    userName?: string;
    action: string;
    entity: string;
    entityId: string;
    entityName?: string;
    details?: any;
  }
) {
  const description = generateAuditDescription({
    action: data.action,
    entity: data.entity,
    entityName: data.entityName,
    userName: data.userName,
    details: data.details,
  });

  // Store the human-readable description in the details field
  return await prisma.auditLog.create({
    data: {
      userId: data.userId,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId,
      details: description, // Store human-readable description here
      metadata: data.details ? data.details : undefined,
    },
  });
}
