import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import EmployeeDetails from './pages/EmployeeDetails';
import PublicEmployeeView from './pages/PublicEmployeeView';
import Users from './pages/Users';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import Approvals from './pages/Approvals';
import Requests from './pages/Requests';
import Login from './pages/Login';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import { ToastProvider } from './contexts/ToastContext';
import { IdleTimeoutProvider } from './contexts/IdleTimeoutContext';
import { getAuthState } from './utils/mockAuth';

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = getAuthState();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function App() {
  // Note: Using sessionStorage for auth means users are automatically logged out
  // when they close the browser/tab (no additional logic needed)

  return (
    <ToastProvider>
      <HashRouter>
        <IdleTimeoutProvider>
          <Routes>
            {/* Public Routes - No authentication required */}
            <Route path="/public/employee/:id" element={<PublicEmployeeView />} />
            
            {/* Auth Routes */}
            <Route path="/login" element={<Login />} />
            
            {/* Protected Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="reports" element={<Dashboard />} />
              <Route path="employees/:id" element={<EmployeeDetails />} />
              <Route 
                path="users" 
                element={
                  <RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'developer']}>
                    <Users />
                  </RoleProtectedRoute>
                } 
              />
              <Route path="audit-logs" element={<AuditLogs />} />
              <Route path="settings" element={<Settings />} />
              <Route
                path="requests"
                element={
                  <RoleProtectedRoute allowedRoles={['staff', 'admin']}>
                    <Requests />
                  </RoleProtectedRoute>
                }
              />
              <Route
                path="approvals"
                element={
                  <RoleProtectedRoute allowedRoles={['superadmin', 'developer']}>
                    <Approvals />
                  </RoleProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </IdleTimeoutProvider>
      </HashRouter>
    </ToastProvider>
  );
}

export default App;
