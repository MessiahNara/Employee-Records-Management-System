import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getAuthState } from '../../utils/mockAuth';
import { MdDashboard, MdPeople, MdDescription, MdSettings, MdFolder, MdFactCheck, MdInsertChart, MdInbox } from 'react-icons/md';
import api from '../../services/api';
import './Sidebar.css';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor: string;
  requiredRoles?: string[];
  badge?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  isCollapsed: boolean;
  isMobileOpen: boolean;
}

function Sidebar({ isCollapsed, isMobileOpen }: SidebarProps) {
  const currentUser = getAuthState();
  const userRole = currentUser?.role || '';
  const isSuperAdminOrDeveloper = userRole === 'superadmin' || userRole === 'developer';
  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin';
  const [pendingCount, setPendingCount] = useState(0);
  const [myRequestsCount, setMyRequestsCount] = useState(0);

  // Poll pending approvals count every 5 seconds (admins/superadmins) & listen for updates
  useEffect(() => {
    if (!isSuperAdminOrDeveloper) return;

    const fetch = () => {
      api.approvals.getPendingCount()
        .then((r) => setPendingCount(r.count))
        .catch(() => {});
    };

    fetch();
    window.addEventListener('approvalsUpdated', fetch);
    const interval = setInterval(fetch, 5000);
    return () => {
      window.removeEventListener('approvalsUpdated', fetch);
      clearInterval(interval);
    };
  }, [isSuperAdminOrDeveloper]);

  // Poll staff's own pending requests count every 5 seconds & listen for updates
  useEffect(() => {
    if (!isStaffOrAdmin || !currentUser?.id) return;

    const fetchMyCount = () => {
      api.approvals.getMyRequests(currentUser.id)
        .then((reqs) => {
          const pending = reqs.filter((r: any) => r.status === 'pending').length;
          setMyRequestsCount(pending);
        })
        .catch(() => {});
    };

    fetchMyCount();
    window.addEventListener('approvalsUpdated', fetchMyCount);
    const interval = setInterval(fetchMyCount, 5000);
    return () => {
      window.removeEventListener('approvalsUpdated', fetchMyCount);
      clearInterval(interval);
    };
  }, [isStaffOrAdmin, currentUser?.id]);

  const isAdmin = userRole === 'superadmin' || userRole === 'admin' || userRole === 'developer';

  const mainItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: MdDashboard, iconColor: '#3b82f6' },
    { path: '/reports', label: 'Generated Reports', icon: MdInsertChart, iconColor: '#10b981' },
  ];

  // For non-admins (staff), put Requests under Main
  if (!isAdmin) {
    mainItems.push({
      path: '/requests',
      label: 'Requests',
      icon: MdInbox,
      iconColor: '#6366f1',
      requiredRoles: ['staff', 'admin'],
      badge: myRequestsCount
    });
  }

  mainItems.push({ path: '/settings', label: 'Settings', icon: MdSettings, iconColor: '#6b7280' });

  const adminItems: NavItem[] = [
    { path: '/users', label: 'Users', icon: MdPeople, iconColor: '#8b5cf6', requiredRoles: ['superadmin', 'admin', 'developer'] },
    { path: '/audit-logs', label: 'Audit Logs', icon: MdDescription, iconColor: '#f59e0b', requiredRoles: ['superadmin', 'admin', 'developer'] },
    // If admin has role 'admin', they see Requests under Admin Tools
    {
      path: '/requests',
      label: 'Requests',
      icon: MdInbox,
      iconColor: '#6366f1',
      requiredRoles: ['staff', 'admin'],
      badge: myRequestsCount
    },
    // If admin has role 'superadmin' or 'developer', they see Request & Approvals under Admin Tools
    {
      path: '/approvals',
      label: 'Request & Approvals',
      icon: MdFactCheck,
      iconColor: '#10b981',
      requiredRoles: ['superadmin', 'developer'],
      badge: pendingCount
    },
  ];

  const navGroups: NavGroup[] = [
    {
      label: 'Main',
      items: mainItems,
    },
  ];

  if (isAdmin) {
    navGroups.push({
      label: 'Admin Tools',
      items: adminItems,
    });
  }

  const hasAccess = (item: NavItem): boolean => {
    if (!item.requiredRoles || item.requiredRoles.length === 0) return true;
    return item.requiredRoles.includes(userRole);
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'sidebar--collapsed' : ''} ${isMobileOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__header">
        <div className="sidebar__logo">
          <MdFolder className="sidebar__logo-icon" style={{ color: '#3b82f6' }} />
          {!isCollapsed && <span className="sidebar__logo-text" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: '1.4', display: 'block', width: '100%' }}>Employee Records Management System</span>}
        </div>
      </div>

      <nav className="sidebar__nav">
        {navGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="sidebar__nav-group">
            {!isCollapsed && (
              <div className="sidebar__nav-group-label">{group.label}</div>
            )}
            <div className="sidebar__nav-items">
              {group.items.filter(item => hasAccess(item)).map((item) => {
                const IconComponent = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`
                    }
                    title={isCollapsed ? item.label : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        <span style={{ position: 'relative', display: 'inline-flex' }}>
                          <IconComponent
                            className="sidebar__nav-icon"
                            style={{ color: isActive ? '#ffffff' : item.iconColor }}
                          />
                          {isCollapsed && item.badge != null && item.badge > 0 && (
                            <span className="sidebar__nav-badge">{item.badge > 99 ? '99+' : item.badge}</span>
                          )}
                        </span>
                        {!isCollapsed && <span className="sidebar__nav-label">{item.label}</span>}
                        {!isCollapsed && item.badge != null && item.badge > 0 && (
                          <span className="sidebar__nav-badge-label">{item.badge > 99 ? '99+' : item.badge}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
