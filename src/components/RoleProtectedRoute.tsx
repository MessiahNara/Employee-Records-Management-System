import { Navigate } from 'react-router-dom';
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
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const userRole = currentUser.role || '';
  const hasAccess = allowedRoles.includes(userRole);

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
