import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
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
import Calendar from './pages/Calendar';
import CalendarActivities from './pages/CalendarActivities';
import Chats from './pages/Chats';
import File201 from './pages/File201';
import InventoryAppraisal from './pages/InventoryAppraisal';
import Analytics from './pages/Analytics';
import BackupRestore from './pages/BackupRestore';
import RoleProtectedRoute from './components/RoleProtectedRoute';
import { ToastProvider } from './contexts/ToastContext';
import { IdleTimeoutProvider } from './contexts/IdleTimeoutContext';
import { getAuthState } from './utils/mockAuth';
import { initSocketClient, getSocket } from './services/socket';

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
        </IdleTimeoutProvider>
      </HashRouter>
    </ToastProvider>
  );
}

export default App;
