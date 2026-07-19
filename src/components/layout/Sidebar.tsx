import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { getAuthState } from '../../utils/mockAuth';
import {
  MdDashboard, MdPeople, MdDescription, MdSettings, MdFolder,
  MdAssignmentTurnedIn, MdInsertChart, MdInbox, MdCalendarToday,
  MdExpandMore, MdChevronRight, MdChat
} from 'react-icons/md';
import api from '../../services/api';
import './Sidebar.css';

interface SubItem {
  path: string;
  label: string;
  badge?: number;
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  iconColor: string;
  requiredRoles?: string[];
  badge?: number;
  subItems?: SubItem[];
  isOpen?: boolean;
  onToggle?: () => void;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  isCollapsed: boolean;
  isMobileOpen: boolean;
  onExpandSidebar?: () => void;
}

function Sidebar({ isCollapsed, isMobileOpen, onExpandSidebar }: SidebarProps) {
  const currentUser = getAuthState();
  const userRole = currentUser?.role || '';
  const isSuperAdminOrDeveloper = userRole === 'superadmin' || userRole === 'developer';
  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin';
  const [pendingCount, setPendingCount] = useState(0);
  const [myRequestsCount, setMyRequestsCount] = useState(0);
  const [calendarCount, setCalendarCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const location = useLocation();
  const currentPath = location.pathname;

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);

  // Auto-expand menus based on current URL path
  useEffect(() => {
    if (currentPath === '/calendar' || currentPath === '/calendar-activities') {
      setIsCalendarOpen(true);
    }
    if (currentPath === '/reports') {
      setIsReportsOpen(true);
    }
  }, [currentPath]);

  // Poll pending approvals count every 5 seconds (admins/superadmins) & listen for updates
  useEffect(() => {
    if (!isSuperAdminOrDeveloper) return;

    const fetch = () => {
      api.approvals.getPendingCount()
        .then((r) => setPendingCount(r.count))
        .catch(() => { });
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
        .catch(() => { });
    };

    fetchMyCount();
    window.addEventListener('approvalsUpdated', fetchMyCount);
    const interval = setInterval(fetchMyCount, 5000);
    return () => {
      window.removeEventListener('approvalsUpdated', fetchMyCount);
      clearInterval(interval);
    };
  }, [isStaffOrAdmin, currentUser?.id]);

  // Poll calendar alerts count (expired/expiring within 30 days) and listen for updates
  useEffect(() => {
    const fetchCalendarCount = async () => {
      try {
        const [employees, pendingApprovals] = await Promise.all([
          api.employee.getAll({ status: 'Active' }),
          api.approvals.getPending()
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const millisecondsPerDay = 1000 * 60 * 60 * 24;

        const inferAoType = (data: any): 'Detailed' | 'Designated' | '' => {
          const rawAoType = String(data.aoType || '').trim().toLowerCase();
          if (rawAoType === 'detailed') return 'Detailed';
          if (rawAoType === 'designated') return 'Designated';
          if (data.isDetailed === true) return 'Detailed';
          if (
            String(data.designatedPositionFunction || '').trim() ||
            String(data.designatedOrderFrom || '').trim() ||
            String(data.designatedOrderTo || '').trim()
          ) return 'Designated';
          return '';
        };

        let count = 0;
        employees.forEach((emp: any) => {
          // Action Taken: Check if a renewal update is pending approval
          const hasPendingRenewal = pendingApprovals.some(
            (r: any) => r.action === 'update_employee' && r.entityId === emp.id && r.status === 'pending'
          );
          if (hasPendingRenewal) return; // Action Taken -> Blue (not counted in warnings)

          const aoType = inferAoType(emp);
          const expDateStr = aoType === 'Designated' ? emp.designatedOrderTo : emp.appointmentTo;
          if (!expDateStr) return;

          const expDate = new Date(expDateStr);
          expDate.setHours(0, 0, 0, 0);

          const remainingDays = Math.ceil((expDate.getTime() - today.getTime()) / millisecondsPerDay);
          if (remainingDays <= 30) {
            count++;
          }
        });

        setCalendarCount(count);
      } catch (err) {
        console.error('Failed to fetch calendar counter:', err);
      }
    };

    fetchCalendarCount();
    window.addEventListener('approvalsUpdated', fetchCalendarCount);
    window.addEventListener('employeeUpdated', fetchCalendarCount);
    const interval = setInterval(fetchCalendarCount, 15000);
    return () => {
      window.removeEventListener('approvalsUpdated', fetchCalendarCount);
      window.removeEventListener('employeeUpdated', fetchCalendarCount);
      clearInterval(interval);
    };
  }, []);

  const lastCountRef = useRef(0);

  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;

      // Note 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Note 2 (slightly higher, delayed for pleasant ding-dong chime)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12); // A5
      gain2.gain.setValueAtTime(0.12, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.45);
    } catch (e) {
      console.warn('Notification audio play blocked or failed:', e);
    }
  };

  // Poll unread chat counts every 5 seconds to show badge next to "Chats" tab
  useEffect(() => {
    if (!currentUser?.id) return;

    // Track initial count to avoid playing sound on page load/mount
    let isInitialLoad = true;

    const fetchChatUnread = () => {
      api.chats.getUnreadCounts()
        .then((counts) => {
          const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
          if (total > lastCountRef.current && !isInitialLoad) {
            playNotificationSound();
          }
          isInitialLoad = false;
          lastCountRef.current = total;
          setChatUnreadCount(total);
        })
        .catch(() => {});
    };

    fetchChatUnread();
    const interval = setInterval(fetchChatUnread, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [currentUser?.id]);

  // Update window/tab title on new messages
  useEffect(() => {
    if (chatUnreadCount > 0) {
      document.title = `(${chatUnreadCount}) New Message - Employee Records Management`;
    } else {
      document.title = 'Employee Records Management';
    }
  }, [chatUnreadCount]);

  const isAdmin = userRole === 'superadmin' || userRole === 'admin' || userRole === 'developer';

  const mainItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: MdDashboard, iconColor: '#3b82f6' },
    {
      path: '#calendar-menu',
      label: 'Calendar',
      icon: MdCalendarToday,
      iconColor: '#ec4899',
      badge: calendarCount,
      subItems: [
        { path: '/calendar', label: 'Expirations Calendar', badge: calendarCount },
        { path: '/calendar-activities', label: 'Calendar of Activities' }
      ],
      isOpen: isCalendarOpen,
      onToggle: () => {
        if (isCollapsed && onExpandSidebar) {
          onExpandSidebar();
          setIsCalendarOpen(true);
        } else {
          setIsCalendarOpen(!isCalendarOpen);
        }
      }
    },
    {
      path: '#reports-menu',
      label: 'Generated Reports',
      icon: MdInsertChart,
      iconColor: '#10b981',
      subItems: [
        { path: '/reports', label: 'Administrative Order' }
      ],
      isOpen: isReportsOpen,
      onToggle: () => {
        if (isCollapsed && onExpandSidebar) {
          onExpandSidebar();
          setIsReportsOpen(true);
        } else {
          setIsReportsOpen(!isReportsOpen);
        }
      }
    },
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
  mainItems.push({ path: '/chats', label: 'Chats', icon: MdChat, iconColor: '#8b5cf6', badge: chatUnreadCount });

  const adminItems: NavItem[] = [
    { path: '/users', label: 'Users', icon: MdPeople, iconColor: '#8b5cf6', requiredRoles: ['superadmin', 'admin', 'developer'] },
    { path: '/file201', label: '201 File', icon: MdFolder, iconColor: '#3b82f6', requiredRoles: ['superadmin', 'admin', 'developer'] },
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
      icon: MdAssignmentTurnedIn,
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
                const hasChildren = item.subItems && item.subItems.length > 0;

                if (hasChildren) {
                  const subItemsCount = item.subItems!.reduce((acc, sub) => acc + (sub.badge || 0), 0);

                  return (
                    <div key={item.path} className="sidebar__nav-group-container">
                      <button
                        type="button"
                        onClick={item.onToggle}
                        className={`sidebar__nav-item sidebar__nav-item--parent ${item.isOpen ? 'sidebar__nav-item--expanded' : ''}`}
                        title={isCollapsed ? item.label : undefined}
                        style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
                      >
                        <span style={{ position: 'relative', display: 'inline-flex' }}>
                          <IconComponent
                            className="sidebar__nav-icon"
                            style={{ color: item.iconColor }}
                          />
                          {isCollapsed && subItemsCount > 0 && (
                            <span className="sidebar__nav-badge">{subItemsCount > 99 ? '99+' : subItemsCount}</span>
                          )}
                        </span>
                        {!isCollapsed && <span className="sidebar__nav-label">{item.label}</span>}

                        {!isCollapsed && (
                          <span className="sidebar__nav-arrow" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center' }}>
                            {item.isOpen ? <MdExpandMore size={18} /> : <MdChevronRight size={18} />}
                          </span>
                        )}

                        {!isCollapsed && subItemsCount > 0 && !item.isOpen && (
                          <span className="sidebar__nav-badge-label" style={{ marginLeft: '8px' }}>
                            {subItemsCount > 99 ? '99+' : subItemsCount}
                          </span>
                        )}
                      </button>

                      {item.isOpen && !isCollapsed && (
                        <div className="sidebar__sub-items">
                          {item.subItems!.map((sub) => (
                            <NavLink
                              key={sub.path}
                              to={sub.path}
                              className={({ isActive }) =>
                                `sidebar__sub-item ${isActive ? 'sidebar__sub-item--active' : ''}`
                              }
                            >
                              <span className="sidebar__sub-item-dot" />
                              <span className="sidebar__sub-item-label">{sub.label}</span>
                              {sub.badge != null && sub.badge > 0 && (
                                <span className="sidebar__sub-item-badge">{sub.badge}</span>
                              )}
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''} ${item.path === '/chats' && item.badge != null && item.badge > 0 ? 'sidebar__nav-item--attention' : ''}`
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
                            <span className={`sidebar__nav-badge ${item.path === '/chats' ? 'sidebar__nav-badge--pulse' : ''}`}>{item.badge > 99 ? '99+' : item.badge}</span>
                          )}
                        </span>
                        {!isCollapsed && <span className="sidebar__nav-label">{item.label}</span>}
                        {!isCollapsed && item.badge != null && item.badge > 0 && (
                          <span className={`sidebar__nav-badge-label ${item.path === '/chats' ? 'sidebar__nav-badge-label--pulse' : ''}`}>{item.badge > 99 ? '99+' : item.badge}</span>
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
