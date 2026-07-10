import { getAuthState } from '../utils/mockAuth';
import Badge from './ui/Badge';
import './PermissionBanner.css';

function PermissionBanner() {
  const currentUser = getAuthState();
  const userRole = currentUser?.role || '';
  
  // Only show for Staff and Admin users with custom permissions
  if (userRole !== 'staff' && userRole !== 'admin') {
    return null;
  }

  // Get actual permissions from the user's data
  const permissions = currentUser?.permissions || { create: false, read: true, update: false, delete: false };
  
  const activePermissions: string[] = [];
  if (permissions.create) activePermissions.push('Create');
  if (permissions.read) activePermissions.push('Read');
  if (permissions.update) activePermissions.push('Update');
  if (permissions.delete) activePermissions.push('Delete');

  // If no permissions, don't show banner
  if (activePermissions.length === 0) {
    return null;
  }

  return (
    <div className="permission-banner">
      <div className="permission-banner__content">
        <span className="permission-banner__icon">ℹ️</span>
        <div className="permission-banner__text">
          <strong>Your Permissions:</strong>
          <div className="permission-banner__badges">
            {activePermissions.map((perm, idx) => (
              <Badge key={idx} variant="info" size="sm">
                {perm}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PermissionBanner;
