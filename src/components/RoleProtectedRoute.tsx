import { Navigate, useLocation } from 'react-router-dom';
import { getAuthState } from '../utils/mockAuth';
import Card from './ui/Card';
import Button from './ui/Button';
import './RoleProtectedRoute.css';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[]; // e.g., ['superadmin', 'admin']
  redirectTo?: string;
  showAccessDenied?: boolean;
}

function RoleProtectedRoute({
  children,
  allowedRoles,
  redirectTo = '/',
  showAccessDenied = true
}: RoleProtectedRouteProps) {
  const currentUser = getAuthState();
  const location = useLocation();
  const currentPath = location.pathname;

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const userRole = currentUser.role || '';
  let hasAccess = allowedRoles.includes(userRole);

  const routeToTabMap: Record<string, string> = {
    '/users': 'Users',
    '/file201': 'File Locator',
    '/audit-logs': 'Audit Logs',
    '/backup-restore': 'Backup & Restore',
    '/analytics': 'Dashboard Analytics',
    '/requests': 'Requests',
    '/approvals': 'Request & Approvals',
    '/dashboard': 'Dashboard',
    '/': 'Dashboard',
    '/calendar': 'Calendar',
    '/calendar-activities': 'Calendar',
    '/reports': 'Generated Reports',
    '/reports/pulled-out': 'Generated Reports',
    '/reports/transferred': 'Generated Reports',
    '/inventory': 'Inventory and Appraisal',
    '/chats': 'Chats',
    '/settings': 'Settings'
  };

  // Superadmin and Developer always have full access to tools allowed for their role
  if (userRole === 'superadmin' || userRole === 'developer') {
    hasAccess = allowedRoles.includes(userRole);
  } else if (currentUser?.permissions?.allowedTabs) {
    const tabName = routeToTabMap[currentPath];
    if (tabName) {
      hasAccess = hasAccess && currentUser.permissions.allowedTabs.includes(tabName);
    } else if (currentPath.startsWith('/employees/')) {
      hasAccess = hasAccess && (currentUser.permissions.allowedTabs.includes('Dashboard') || currentUser.permissions.allowedTabs.includes('File Locator'));
    }
  }

  if (!hasAccess) {
    if (showAccessDenied) {
      // Map role names for display
      const roleDisplayNames: Record<string, string> = {
        'superadmin': 'Super Admin',
        'admin': 'Admin',
        'staff': 'Staff',
        'developer': 'Developer'
      };

      const displayRole = roleDisplayNames[userRole] || userRole;
      const displayAllowedRoles = allowedRoles.map(r => roleDisplayNames[r] || r).join(', ');

      return (
        <div className="role-protected">
          <Card>
            <div className="role-protected__content">
              <div className="role-protected__icon">🔒</div>
              <h1 className="role-protected__title">Access Restricted</h1>
              <p className="role-protected__message">
                You do not have permission to access this page.
              </p>
              <p className="role-protected__details">
                Your role: <strong>{displayRole}</strong>
              </p>
              <p className="role-protected__details">
                Required roles: <strong>{displayAllowedRoles}</strong>
              </p>
              <div className="role-protected__actions">
                <Button
                  variant="primary"
                  onClick={() => window.location.href = redirectTo}
                >
                  Go to Dashboard
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

export default RoleProtectedRoute;
