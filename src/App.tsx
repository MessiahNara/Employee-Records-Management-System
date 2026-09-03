import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import { ToastProvider } from './contexts/ToastContext';
import { IdleTimeoutProvider } from './contexts/IdleTimeoutContext';
import { getAuthState } from './utils/mockAuth';
import { initSocketClient, getSocket } from './services/socket';

// Route-level code splitting so initial application load compiles only Login
const Dashboard = lazy(() => import('./pages/Dashboard'));
const EmployeeDetails = lazy(() => import('./pages/EmployeeDetails'));
const PublicEmployeeView = lazy(() => import('./pages/PublicEmployeeView'));
const Users = lazy(() => import('./pages/Users'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Settings = lazy(() => import('./pages/Settings'));
const Approvals = lazy(() => import('./pages/Approvals'));
const Requests = lazy(() => import('./pages/Requests'));
const Calendar = lazy(() => import('./pages/Calendar'));
const CalendarActivities = lazy(() => import('./pages/CalendarActivities'));
const Chats = lazy(() => import('./pages/Chats'));
const File201 = lazy(() => import('./pages/File201'));
const InventoryAppraisal = lazy(() => import('./pages/InventoryAppraisal'));
const Analytics = lazy(() => import('./pages/Analytics'));
const BackupRestore = lazy(() => import('./pages/BackupRestore'));

const PageLoader = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '50vh',
    gap: '12px',
    color: 'var(--text-secondary)'
  }}>
    <div className="dashboard__spinner" style={{ width: '32px', height: '32px' }} />
    <span style={{ fontSize: '0.875rem' }}>Loading view...</span>
  </div>
);

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = getAuthState();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function App() {
  useEffect(() => {
    initSocketClient();
    
    // Only apply the zoom fix if we are NOT running inside the Electron app.
    if (!(window as any).electron) {
      document.documentElement.style.zoom = '0.65';
    }

    return () => {
      const socket = getSocket();
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  return (
    <ToastProvider>
      <HashRouter>
        <IdleTimeoutProvider>
          <Suspense fallback={<PageLoader />}>
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
              <Route index element={<RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'staff', 'developer']}><Dashboard /></RoleProtectedRoute>} />
              <Route path="inventory" element={<RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'staff', 'developer']}><InventoryAppraisal /></RoleProtectedRoute>} />
              <Route path="chats" element={<RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'staff', 'developer']}><Chats /></RoleProtectedRoute>} />
              <Route path="calendar" element={<RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'staff', 'developer']}><Calendar /></RoleProtectedRoute>} />
              <Route path="calendar-activities" element={<RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'staff', 'developer']}><CalendarActivities /></RoleProtectedRoute>} />
              <Route path="reports" element={<RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'staff', 'developer']}><Dashboard /></RoleProtectedRoute>} />
              <Route path="reports/pulled-out" element={<RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'staff', 'developer']}><Dashboard /></RoleProtectedRoute>} />
              <Route path="reports/transferred" element={<RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'staff', 'developer']}><Dashboard /></RoleProtectedRoute>} />
              <Route path="employees/:id" element={<RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'staff', 'developer']}><EmployeeDetails /></RoleProtectedRoute>} />
              <Route 
                path="users" 
                element={
                  <RoleProtectedRoute allowedRoles={['developer']}>
                    <Users />
                  </RoleProtectedRoute>
                } 
              />
              <Route 
                path="analytics" 
                element={
                  <RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'developer']}>
                    <Analytics />
                  </RoleProtectedRoute>
                } 
              />
              <Route 
                path="file201" 
                element={
                  <RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'developer']}>
                    <File201 />
                  </RoleProtectedRoute>
                } 
              />
              <Route path="audit-logs" element={<RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'developer']}><AuditLogs /></RoleProtectedRoute>} />
              <Route
                path="backup-restore"
                element={
                  <RoleProtectedRoute allowedRoles={['superadmin', 'developer']}>
                    <BackupRestore />
                  </RoleProtectedRoute>
                }
              />
              <Route path="settings" element={<RoleProtectedRoute allowedRoles={['superadmin', 'admin', 'staff', 'developer']}><Settings /></RoleProtectedRoute>} />
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
          </Suspense>
        </IdleTimeoutProvider>
      </HashRouter>
    </ToastProvider>
  );
}

export default App;
