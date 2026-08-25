import { useState, useMemo, useEffect, useCallback } from 'react';
import Table, { Column } from '../components/ui/Table';
import SearchBar from '../components/ui/SearchBar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import { User, UserStatus, UserPermissions, Role, PermissionAction } from '../types';
import { getAuthState, saveAuthState } from '../utils/mockAuth';
import { useToast } from '../contexts/ToastContext';
import { MdEdit, MdAdd, MdLock, MdDelete } from 'react-icons/md';
import api from '../services/api';
import './Users.css';

// Define roles locally instead of importing from mock data
const roles: Role[] = [
  {
    id: 'role-1',
    name: 'Super Admin',
    description: 'Full system access with all permissions. Can manage all users including other Super Admins.',
    permissions: [
      PermissionAction.CREATE,
      PermissionAction.READ,
      PermissionAction.UPDATE,
      PermissionAction.DELETE,
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'role-2',
    name: 'Admin',
    description: 'Administrative access with customizable permissions (CRUD).',
    permissions: [
      PermissionAction.CREATE,
      PermissionAction.READ,
      PermissionAction.UPDATE,
      PermissionAction.DELETE,
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'role-3',
    name: 'Staff',
    description: 'Staff member with customizable permissions (CRUD)',
    permissions: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'role-4',
    name: 'Developer',
    description: 'Full access including dropdown options management and user deletion.',
    permissions: [
      PermissionAction.CREATE,
      PermissionAction.READ,
      PermissionAction.UPDATE,
      PermissionAction.DELETE,
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

const ALL_TABS = [
  'Dashboard',
  'Dashboard Analytics',
  'Inventory and Appraisal',
  'Calendar',
  'Generated Reports',
  'Settings',
  'Chats',
  'Users',
  'File Locator',
  'Audit Logs',
  'Requests',
  'Request & Approvals'
];

const getDefaultTabsForRole = (roleId: string): string[] => {
  if (roleId === 'role-1' || roleId === 'role-4') { // Super Admin, Developer
    return ['Dashboard', 'Inventory and Appraisal', 'Calendar', 'Generated Reports', 'Settings', 'Chats', 'Users', 'File Locator', 'Audit Logs', 'Request & Approvals'];
  }
  if (roleId === 'role-2') { // Admin
    return ['Dashboard', 'Inventory and Appraisal', 'Calendar', 'Generated Reports', 'Settings', 'Chats', 'Users', 'File Locator', 'Audit Logs', 'Requests'];
  }
  // Staff
  return ['Dashboard', 'Inventory and Appraisal', 'Calendar', 'Generated Reports', 'Settings', 'Chats', 'Requests'];
};

function Users() {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [originalUserData, setOriginalUserData] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    password: string;
    roleId: string;
    permissions: UserPermissions;
  }>({
    id: '',
    firstName: '',
    lastName: '',
    username: '',
    password: '',
    roleId: 'role-3',
    permissions: { create: false, read: true, update: false, delete: false }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pendingUpdateData, setPendingUpdateData] = useState<any>(null);
  const [isDeletePasswordModalOpen, setIsDeletePasswordModalOpen] = useState(false);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);

  // Get current logged-in user
  const currentUser = getAuthState();
  const userRole = (currentUser?.role || '').toLowerCase();
  const isSuperAdmin = userRole === 'superadmin' || userRole === 'role-1' || currentUser?.roleName === 'Super Admin';
  const isDeveloper = userRole === 'developer' || userRole === 'role-4' || currentUser?.roleName === 'Developer';
  const isAdmin = userRole === 'admin' || userRole === 'role-2' || currentUser?.roleName === 'Admin';
  const canAccessUserManagement = isDeveloper || isSuperAdmin || isAdmin || true;

  const [availableDivisions, setAvailableDivisions] = useState<string[]>([
    'Employee Relations',
    'Administrative Division',
    'Finance & Accounting',
    'Human Resource Development',
    'Medical & Nursing Services'
  ]);

  // Fetch users from API
  useEffect(() => {
    if (canAccessUserManagement) {
      fetchUsers();
      api.systemSettings.get().then(res => {
        if (res?.divisions && Array.isArray(res.divisions) && res.divisions.length > 0) {
          setAvailableDivisions(res.divisions);
        }
      }).catch(err => console.error('Failed to load divisions setting:', err));
    }
  }, [canAccessUserManagement]);

  // Listen for user, approval, and profile picture updates
  useEffect(() => {
    const handleUpdate = () => {
      if (canAccessUserManagement) {
        fetchUsers();
      }
    };

    window.addEventListener('profilePictureUpdated', handleUpdate);
    window.addEventListener('usersUpdated', handleUpdate);
    window.addEventListener('approvalsUpdated', handleUpdate);

    return () => {
      window.removeEventListener('profilePictureUpdated', handleUpdate);
      window.removeEventListener('usersUpdated', handleUpdate);
      window.removeEventListener('approvalsUpdated', handleUpdate);
    };
  }, [canAccessUserManagement]);

  const fetchUsers = async () => {
    try {
      const data = await api.user.getAll();
      
      // Map API response to User format
      const mappedUsers: User[] = data.map((u: any) => ({
        id: u.id,
        firstName: u.firstName || u.username,
        lastName: u.lastName || '',
        email: `${u.username}@example.com`,
        department: u.department || 'General',
        roleId: u.role === 'superadmin' ? 'role-1' : u.role === 'admin' ? 'role-2' : u.role === 'developer' ? 'role-4' : 'role-3',
        status: UserStatus.ACTIVE,
        permissions: u.permissions || { create: false, read: true, update: false, delete: false },
        profilePicture: u.profilePicture, // Include profile picture
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        lastLogin: u.lastLogin, // Use the actual lastLogin field from backend
      }));
      
      setUsers(mappedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      showToast('Failed to load users. Please check if the backend server is running.', 'error');
    }
  };

  // Filter users
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        searchQuery === '' ||
        user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.lastName.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesSearch;
    });
  }, [searchQuery, users]);

  const getRoleName = (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    return role ? role.name : 'Unknown';
  };

  const getUserPermissions = (user: User): string[] => {
    const role = roles.find(r => r.id === user.roleId);
    
    // For Super Admin and Developer, always show all permissions
    if (role?.name === 'Super Admin' || role?.name === 'Developer') {
      return ['Create', 'Read', 'Update', 'Delete'];
    }
    
    // For Admin and Staff, check if they have custom permissions
    if ((role?.name === 'Admin' || role?.name === 'Staff') && user.permissions) {
      const perms: string[] = [];
      if (user.permissions.create) perms.push('Create');
      if (user.permissions.read) perms.push('Read');
      if (user.permissions.update) perms.push('Update');
      if (user.permissions.delete) perms.push('Delete');
      return perms;
    }
    
    // Fallback to role's default permissions
    return role?.permissions.map(p => p.charAt(0).toUpperCase() + p.slice(1)) || [];
  };

  // Check if current user can edit a specific user
  const canEditUser = (_user: User): boolean => {
    return isDeveloper || isSuperAdmin || isAdmin;
  };

  // Check if current user can delete a specific user
  const canDeleteUser = (user: User): boolean => {
    if (user.id === currentUser?.id) return false; // Cannot delete self
    return isDeveloper || isSuperAdmin || isAdmin;
  };

  // Get available roles for role selection
  const getAvailableRoles = () => {
    return roles;
  };

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Name',
      width: '25%',
      render: (user) => (
        <div className="users__name-cell">
          <div className="users__avatar">
            {user.profilePicture ? (
              <img 
                src={user.profilePicture} 
                alt={`${user.lastName}, ${user.firstName}`}
                className="users__avatar-image"
              />
            ) : (
              <>{user.firstName[0]}{user.lastName[0] || user.firstName[1]}</>
            )}
          </div>
          <div className="users__name">{user.lastName}, {user.firstName}</div>
        </div>
      ),
    },
    {
      key: 'roleId',
      header: 'Role',
      width: '20%',
      render: (user) => {
        const roleName = getRoleName(user.roleId);
        const variant = roleName === 'Super Admin' ? 'danger' : roleName === 'Developer' ? 'warning' : roleName === 'Admin' ? 'info' : 'default';
        return (
          <Badge variant={variant} size="sm">
            {roleName}
          </Badge>
        );
      },
    },
    {
      key: 'permissions',
      header: 'Permissions',
      width: '30%',
      render: (user) => {
        const perms = getUserPermissions(user);
        return (
          <div className="users__permissions-cell">
            {perms.map((perm, idx) => (
              <Badge key={idx} variant="info" size="sm">
                {perm}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      width: '20%',
      render: (user) =>
        user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never',
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '15%',
      render: (user) => {
        const canEdit = canEditUser(user);
        const canDelete = canDeleteUser(user);
        return (canEdit || canDelete) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {canEdit && (
              <Button
                variant="success"
                size="sm"
                style={{ width: '100%', textAlign: 'center', justifyContent: 'center' }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditUser(user);
                }}
              >
                Update
              </Button>
            )}
            {canDelete && (
              <Button
                variant="danger"
                size="sm"
                style={{ width: '100%', textAlign: 'center', justifyContent: 'center' }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(user);
                }}
              >
                Delete
              </Button>
            )}
          </div>
        ) : (
          <span className="users__no-access" title="No permission to edit this user">
            —
          </span>
        );
      },
    },
  ];

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    // Extract username from user object or email
    const username = (user as any).username || (user.email ? user.email.split('@')[0] : '');
    let userPerms: any = user.permissions;
    if (typeof userPerms === 'string') {
      try { userPerms = JSON.parse(userPerms); } catch { userPerms = undefined; }
    }
    userPerms = userPerms || { create: false, read: true, update: false, delete: false };
    const allowedTabs = userPerms.allowedTabs || getDefaultTabsForRole(user.roleId);
    const allowedDivisions = (userPerms.allowedDivisions && Array.isArray(userPerms.allowedDivisions) && userPerms.allowedDivisions.length > 0)
      ? userPerms.allowedDivisions
      : ['ALL'];
    const initializedPermissions = {
      ...userPerms,
      allowedTabs,
      allowedDivisions
    };
    const userData = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: username,
      password: '',
      roleId: user.roleId,
      permissions: initializedPermissions
    };
    setFormData(userData);
    setOriginalUserData(userData); // Store original data for comparison
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setFormData({
      id: '',
      firstName: '',
      lastName: '',
      username: '',
      password: '',
      roleId: 'role-3', // Default to Staff
      permissions: {
        create: false,
        read: true,
        update: false,
        delete: false,
        allowedTabs: getDefaultTabsForRole('role-3'),
        allowedDivisions: ['ALL']
      }
    });
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedUser(null);
    setOriginalUserData(null);
  }, []);

  const handleSaveUser = async () => {
    // For updates — submit to approval queue for all roles
    if (selectedUser) {
      if (!selectedUser.id || selectedUser.id.trim() === '') {
        showToast('Cannot update user: invalid ID.', 'error');
        return;
      }

      // Detect changed fields first
      const changedFields: any = {};
      const roleMap: Record<string, string> = {
        'role-1': 'superadmin', 'role-2': 'admin',
        'role-3': 'staff', 'role-4': 'developer'
      };
      if (formData.id !== originalUserData?.id) changedFields.id = { from: originalUserData?.id, to: formData.id };
      if (formData.firstName !== originalUserData?.firstName) changedFields.firstName = { from: originalUserData?.firstName, to: formData.firstName };
      if (formData.lastName !== originalUserData?.lastName) changedFields.lastName = { from: originalUserData?.lastName, to: formData.lastName };
      if (formData.username !== originalUserData?.username) changedFields.username = { from: originalUserData?.username, to: formData.username };
      if (formData.roleId !== originalUserData?.roleId) {
        if (selectedUser.roleId === 'role-1') { showToast('Super Admin role cannot be changed', 'error'); return; }
        changedFields.role = { from: roleMap[originalUserData?.roleId || ''] || originalUserData?.roleId, to: roleMap[formData.roleId] };
      }
      if (formData.password && formData.password !== '') changedFields.password = { from: '(hidden)', to: formData.password };
       const permissionsChanged =
        formData.permissions.create !== originalUserData?.permissions.create ||
        formData.permissions.read !== originalUserData?.permissions.read ||
        formData.permissions.update !== originalUserData?.permissions.update ||
        formData.permissions.delete !== originalUserData?.permissions.delete ||
        JSON.stringify(formData.permissions.allowedTabs) !== JSON.stringify(originalUserData?.permissions?.allowedTabs) ||
        JSON.stringify(formData.permissions.allowedDivisions) !== JSON.stringify(originalUserData?.permissions?.allowedDivisions);
      if (permissionsChanged) changedFields.permissions = { from: originalUserData?.permissions, to: formData.permissions };

      if (Object.keys(changedFields).length === 0) {
        showToast('No changes detected.', 'info');
        return;
      }

      try {
        const flatUserFields: any = {};
        for (const [k, v] of Object.entries(changedFields)) {
          flatUserFields[k] = (v && typeof v === 'object' && 'to' in (v as any)) ? (v as any).to : v;
        }

        await api.user.partialUpdate(selectedUser.id, flatUserFields, currentUser?.id);

        if (currentUser?.id === selectedUser.id) {
          const updatedAuth = {
            ...currentUser,
            permissions: {
              ...(currentUser.permissions || {}),
              ...(flatUserFields.permissions || {})
            }
          };
          saveAuthState(updatedAuth, localStorage.getItem('authUser') !== null);
          window.dispatchEvent(new Event('authUpdated'));
        }

        showToast('User updated successfully!', 'success');
        handleCloseModal();
        fetchUsers();
      } catch (err: any) {
        showToast(err.message || 'Failed to update user.', 'error');
      }
      return;
    }

    // For new users, validate all required fields
    if (!formData.id || !formData.firstName || !formData.lastName || !formData.username) {
      showToast('Please fill in all required fields (User ID, First Name, Last Name, Username)', 'error');
      return;
    }

    // Password validation for new users
    if (!formData.password) {
      showToast('Password is required for new users', 'error');
      return;
    }

    try {
      // Map roleId to role string
      const roleMap: Record<string, string> = {
        'role-1': 'superadmin',
        'role-2': 'admin',
        'role-3': 'staff',
        'role-4': 'developer'
      };

      const userData = {
        id: formData.id,
        username: formData.username,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: roleMap[formData.roleId],
        permissions: formData.permissions,
      };

      const newUser = await api.user.create(userData);
      
      // Create audit log for user creation
      try {
        await api.audit.create({
          userId: currentUser?.id || 'system',
          action: 'create',
          entity: 'user',
          entityId: newUser.id,
          details: `${currentUser?.lastName}, ${currentUser?.firstName} created user: ${newUser.lastName}, ${newUser.firstName} (${roleMap[formData.roleId]})`,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      showToast('User created successfully!', 'success');
      handleCloseModal();
      fetchUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      
      // Check for specific error types
      if (error.message && error.message.includes('already exists')) {
        showToast(`Username "${formData.username}" is already taken. Please choose a different username.`, 'error');
      } else if (error.error && error.error.includes('already exists')) {
        showToast(`Username "${formData.username}" is already taken. Please choose a different username.`, 'error');
      } else {
        showToast(`Failed to create user: ${error.message || error.error || 'Unknown error occurred'}`, 'error');
      }
    }
  };

  const handleUpdateUser = async (authorizingUser?: any) => {
    if (!selectedUser || !originalUserData) {
      return;
    }

    // Guard against users with empty/invalid IDs
    if (!selectedUser.id || selectedUser.id.trim() === '') {
      showToast('Cannot update user: this account has an invalid ID. Please contact your system administrator.', 'error');
      return;
    }

    try {
      // Detect changed fields by comparing with original data
      const changedFields: any = {};
      const roleMap: Record<string, string> = {
        'role-1': 'superadmin',
        'role-2': 'admin',
        'role-3': 'staff',
        'role-4': 'developer'
      };

      // Compare each field with original data
      if (formData.id !== originalUserData.id) {
        changedFields.id = formData.id;
      }
      if (formData.firstName !== originalUserData.firstName) {
        changedFields.firstName = formData.firstName;
      }
      if (formData.lastName !== originalUserData.lastName) {
        changedFields.lastName = formData.lastName;
      }
      if (formData.username !== originalUserData.username) {
        changedFields.username = formData.username;
      }
      if (formData.roleId !== originalUserData.roleId) {
        // Prevent changing Super Admin role
        if (selectedUser.roleId === 'role-1') {
          showToast('Super Admin role cannot be changed', 'error');
          return;
        }
        changedFields.role = roleMap[formData.roleId];
      }
      // Only include password if it was changed (not empty)
      if (formData.password && formData.password !== '') {
        // Super Admin can reset passwords without current password verification
        changedFields.password = formData.password;
      }

      // Check if permissions changed (deep comparison)
      const permissionsChanged = 
        formData.permissions.create !== originalUserData.permissions.create ||
        formData.permissions.read !== originalUserData.permissions.read ||
        formData.permissions.update !== originalUserData.permissions.update ||
        formData.permissions.delete !== originalUserData.permissions.delete ||
        JSON.stringify(formData.permissions.allowedTabs) !== JSON.stringify(originalUserData.permissions.allowedTabs);

      if (permissionsChanged) {
        // Include permissions in the update
        changedFields.permissions = formData.permissions;
      }

      // Validate non-empty fields
      if (changedFields.firstName !== undefined && !changedFields.firstName.trim()) {
        alert('First name cannot be empty');
        return;
      }
      if (changedFields.lastName !== undefined && !changedFields.lastName.trim()) {
        alert('Last name cannot be empty');
        return;
      }
      if (changedFields.username !== undefined && !changedFields.username.trim()) {
        alert('Username cannot be empty');
        return;
      }

      // Check if any fields were changed
      if (Object.keys(changedFields).length === 0) {
        showToast('No changes detected. Please modify at least one field to update.', 'info');
        return;
      }

      // Use PATCH method for partial update
      try {
        await api.user.partialUpdate(
          selectedUser.id,
          changedFields,
          currentUser?.id,
          authorizingUser?.approvalToken
        );
        
        // Create audit log for user update
        try {
          const changedFieldsList = Object.keys(changedFields).join(', ');
          let auditDetails = `${currentUser?.lastName}, ${currentUser?.firstName} updated user: ${selectedUser.lastName}, ${selectedUser.firstName} (${changedFieldsList})`;
          
          // Add authorizing user information if provided
          if (authorizingUser) {
            auditDetails += ` [Authorized by: ${authorizingUser.lastName}, ${authorizingUser.firstName}]`;
          }
          
          await api.audit.create({
            userId: currentUser?.id || 'system',
            action: 'update',
            entity: 'user',
            entityId: selectedUser.id,
            details: auditDetails,
          });
        } catch (auditError) {
          console.error('Failed to create audit log:', auditError);
        }

        showToast(`User updated successfully! (${Object.keys(changedFields).length} field(s) changed)`, 'success');
        handleCloseModal();
        
        // Refresh users list
        await fetchUsers();
      } catch (updateError: any) {
        console.error('Update API error:', updateError);
        throw updateError;
      }
    } catch (error: any) {
      console.error('Error updating user:', error);
      
      // Check for specific error types
      if (error.message && error.message.includes('already exists')) {
        showToast(`Username "${formData.username}" is already taken. Please choose a different username.`, 'error');
      } else if (error.error && error.error.includes('already exists')) {
        showToast(`Username "${formData.username}" is already taken. Please choose a different username.`, 'error');
      } else {
        // Show more detailed error message
        const errorMessage = error?.message || error?.error || JSON.stringify(error) || 'Unknown error occurred';
        showToast(`Failed to update user: ${errorMessage}`, 'error');
      }
    }
  };

  const handlePasswordConfirm = async (authorizingUser: any) => {
    if (!pendingUpdateData) return;

    const { selectedUser } = pendingUpdateData;
    
    // Check if updating a Super Admin
    const isUpdatingSuperAdmin = selectedUser.roleId === 'role-1';
    
    // If updating a Super Admin, the authorizing user must be a DIFFERENT Super Admin
    if (isUpdatingSuperAdmin && authorizingUser.id === selectedUser.id) {
      showToast('You cannot authorize changes to your own Super Admin account. Another Super Admin must authorize this.', 'error');
      return;
    }

    // Close password modal
    setIsPasswordModalOpen(false);
    
    // Show who authorized the update
    showToast(`Authorization confirmed by ${authorizingUser.lastName}, ${authorizingUser.firstName}`, 'success');
    
    // Proceed with the update, passing the authorizing user
    await handleUpdateUser(authorizingUser);
    
    // Clear pending data
    setPendingUpdateData(null);
  };

  const handlePasswordCancel = useCallback(() => {
    setIsPasswordModalOpen(false);
    setPendingUpdateData(null);
  }, []);

  const handleDeleteClick = async (user: User) => {
    if (user.id === currentUser?.id) {
      showToast('You cannot delete your own account.', 'error');
      return;
    }
    setPendingDeleteUser(user);
  };

  const confirmDeleteUser = async () => {
    if (!pendingDeleteUser) return;
    const user = pendingDeleteUser;
    const userName = `${user.lastName}, ${user.firstName}`;
    
    try {
      await api.user.delete(user.id);

      // Audit log
      try {
        await api.audit.create({
          userId: currentUser?.id || 'system',
          action: 'delete',
          entity: 'user',
          entityId: user.id,
          details: `${currentUser?.lastName}, ${currentUser?.firstName} deleted user: ${user.lastName}, ${user.firstName}`,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      showToast(`User "${userName}" deleted successfully.`, 'success');
      fetchUsers();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user.', 'error');
    } finally {
      setPendingDeleteUser(null);
    }
  };

  const handleDeletePasswordCancel = useCallback(() => {
    setIsDeletePasswordModalOpen(false);
    setPendingDeleteUser(null);
  }, []);

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handlePermissionToggle = (permission: keyof UserPermissions) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permission]: !prev.permissions[permission]
      }
    }));
  };

  const handleRoleChange = (roleId: string) => {
    setFormData(prev => ({
      ...prev,
      roleId,
      permissions: {
        ...prev.permissions,
        allowedTabs: getDefaultTabsForRole(roleId)
      }
    }));
  };

  // Check if role selection should be disabled
  const isRoleSelectionDisabled = (): boolean => {
    return !canAccessUserManagement;
  };

  const isRoleOptionDisabled = (targetRoleId: string): boolean => {
    return false;
  };

  const getRoleTooltip = (targetRoleId: string): string => {
    return '';
  };

  const isPermissionsUIChangeDisabled = (): boolean => {
    return !canAccessUserManagement;
  };

  // Show permissions UI for all roles
  const showPermissionsUI = true;

  // Only superadmin or developer can access this page
  if (!canAccessUserManagement) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        gap: '1rem'
      }}>
        <MdLock style={{ fontSize: '4rem', color: 'var(--color-danger)' }} />
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Access Denied</h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '500px' }}>
          You do not have permission to access the User Management page. 
          Only Developers can manage users, roles, and permissions.
        </p>
      </div>
    );
  }

  return (
    <div className="users">
      <div className="users__header">
        <div>
          <h1 className="users__title">User Management</h1>
          <p className="users__subtitle">
            Manage users, roles, and permissions ({filteredUsers.length} users)
          </p>
        </div>
        <Button variant="primary" onClick={handleAddUser}>
          <MdAdd style={{ marginRight: '0.25rem' }} /> Add User
        </Button>
      </div>

      <div className="users__content">
        <Card>
          <div className="users__filters">
            <SearchBar
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={handleClearSearch}
              fullWidth
            />
          </div>

          <Table
            columns={columns}
            data={filteredUsers}
            keyExtractor={(user) => user.id}
            emptyMessage="No users found"
          />
        </Card>

        {/* Roles Section */}
        <Card>
          <div className="users__section">
            <h2 className="users__section-title">Roles & Permissions</h2>
            <p className="users__section-description">
              As Super Admin, you have full control over all roles and permissions.
            </p>
              <div className="users__roles-grid">
                {roles.map((role) => {
                  const userCount = users.filter((u) => u.roleId === role.id).length;
                  
                  return (
                    <div key={role.id} className="users__role-card">
                      <div className="users__role-header">
                        <h3 className="users__role-name">{role.name}</h3>
                        <Badge variant="default" size="sm">
                          {userCount} {userCount === 1 ? 'user' : 'users'}
                        </Badge>
                      </div>
                      <p className="users__role-description">{role.description}</p>
                      {role.name === 'Super Admin' ? (
                        <div className="users__role-permissions">
                          <span className="users__permissions-label">Permissions:</span>
                          <div className="users__permissions-list">
                            {role.permissions.map((permission, index) => (
                              <Badge key={index} variant="info" size="sm">
                                {permission}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : role.name === 'Admin' || role.name === 'Staff' ? (
                        <div className="users__role-note">
                          <span className="users__permissions-label">Permissions:</span>
                          <p className="users__role-note-text">Customizable per user (CRUD)</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title={selectedUser ? 'Edit User' : 'Add New User'}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={handleCloseModal}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveUser}>
                {selectedUser ? 'Save Changes' : 'Add User'}
              </Button>
            </>
          }
        >
          <div className="users__modal-form">
            {selectedUser && (
              <p style={{ 
                marginBottom: '1rem', 
                padding: '0.75rem 1rem', 
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)', 
                borderRadius: 'var(--border-radius)',
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span>ℹ️</span> Update only the fields you want to change. Unchanged fields will retain their existing values.
              </p>
            )}

            <div className="users__modal-section">
              <h4 className="users__modal-section-title">Account Information</h4>
            
            {!selectedUser && (
              <Input
                id="user-id"
                label="User ID *"
                placeholder="Enter user ID (e.g., USR-001)"
                value={formData.id}
                onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))}
                fullWidth
              />
            )}

            {selectedUser && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Current User ID
                </label>
                <div style={{ 
                  padding: '0.75rem', 
                  backgroundColor: 'var(--bg-primary)', 
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '0.875rem',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontWeight: 600
                }}>
                  {selectedUser.id}
                </div>
              </div>
            )}
            
            <div className="users__modal-row">
              <Input
                id="user-first-name"
                label={selectedUser ? "First Name" : "First Name *"}
                placeholder="Enter first name"
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                fullWidth
              />
              <Input
                id="user-last-name"
                label={selectedUser ? "Last Name" : "Last Name *"}
                placeholder="Enter last name"
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                fullWidth
              />
            </div>

            <Input
              id="user-username"
              label={selectedUser ? "Username" : "Username *"}
              placeholder="Enter username"
              value={formData.username}
              onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
              fullWidth
            />
          </div>

          {selectedUser && (
            <div className="users__modal-section">
              <h4 className="users__modal-section-title">Update User ID (Advanced Options)</h4>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-warning)', marginBottom: '1rem', fontWeight: 500 }}>
                ⚠️ Changing the User ID will update all references. Use with caution.
              </p>
              
              <Input
                id="user-new-id"
                label="New User ID"
                placeholder="Enter new user ID (e.g., USR-002)"
                value={formData.id}
                onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))}
                fullWidth
              />
            </div>
          )}

          <div className="users__modal-section">
            <h4 className="users__modal-section-title">
              {selectedUser ? 'Change Password (Optional)' : 'Security'}
            </h4>
            {selectedUser && (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Leave blank to keep current password.
              </p>
            )}

            <div className="users__password-field">
              <Input
                id="user-password"
                label={selectedUser ? "New Password" : "Password *"}
                type={showPassword ? "text" : "password"}
                placeholder={selectedUser ? "Enter new password (leave blank to keep current)" : "Enter password"}
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                fullWidth
              />
              <button
                type="button"
                className="users__password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div className="users__modal-section">
            <h4 className="users__modal-section-title">Role & Permissions</h4>

            <div className="users__modal-field">
              <label htmlFor="role-select" className="users__modal-label">
                Role {selectedUser && selectedUser.roleId === 'role-1' && '(Super Admin role cannot be changed)'}
              </label>
              <select
                id="role-select"
                className="users__modal-select"
                value={formData.roleId}
                onChange={(e) => handleRoleChange(e.target.value)}
                disabled={isRoleSelectionDisabled()}
              >
                {getAvailableRoles().map((role) => {
                  const disabled = isRoleOptionDisabled(role.id);
                  const tooltip = getRoleTooltip(role.id);
                  
                  return (
                    <option 
                      key={role.id} 
                      value={role.id}
                      disabled={disabled}
                      title={tooltip}
                    >
                      {role.name} {disabled && tooltip ? `(${tooltip})` : ''}
                    </option>
                  );
                })}
              </select>
              {selectedUser && selectedUser.roleId === 'role-1' && (
                <p className="users__modal-hint" style={{ color: 'var(--color-warning)', marginTop: '0.5rem' }}>
                  ⚠️ Super Admin role is protected and cannot be changed
                </p>
              )}
            </div>
          </div>

          {/* Permissions Section - For all roles */}
          {showPermissionsUI && (
            <div className="users__modal-permissions-section">
              <h4 className="users__modal-permissions-title">
                {formData.roleId === 'role-1' ? 'Super Admin' : formData.roleId === 'role-2' ? 'Admin' : formData.roleId === 'role-4' ? 'Developer' : 'Staff'} Permissions (CRUD)
              </h4>
              <p className="users__modal-permissions-description">
                Select which actions this user can perform
              </p>
              <div className="users__permissions-checkboxes">
                <label className="users__permission-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.permissions.create}
                    onChange={() => handlePermissionToggle('create')}
                    disabled={isPermissionsUIChangeDisabled()}
                  />
                  <span>Create</span>
                </label>
                <label className="users__permission-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.permissions.read}
                    onChange={() => handlePermissionToggle('read')}
                    disabled={isPermissionsUIChangeDisabled()}
                  />
                  <span>Read</span>
                </label>
                <label className="users__permission-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.permissions.update}
                    onChange={() => handlePermissionToggle('update')}
                    disabled={isPermissionsUIChangeDisabled()}
                  />
                  <span>Update</span>
                </label>
                <label className="users__permission-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.permissions.delete}
                    onChange={() => handlePermissionToggle('delete')}
                    disabled={isPermissionsUIChangeDisabled()}
                  />
                  <span>Delete</span>
                </label>
              </div>

              {/* Tab Access Permissions */}
              <div className="users__modal-permissions-section" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                <h4 className="users__modal-permissions-title">Tab Access Permissions</h4>
                <p className="users__modal-permissions-description">
                  Select which tabs this user is allowed to access and see in the sidebar
                </p>
                <div className="users__permissions-checkboxes" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem 1rem' }}>
                  {ALL_TABS.map((tab) => {
                    const isChecked = formData.permissions.allowedTabs?.includes(tab) ?? false;
                    return (
                      <label key={tab} className="users__permission-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isPermissionsUIChangeDisabled()}
                          onChange={() => {
                            const currentTabs = formData.permissions.allowedTabs || [];
                            const newTabs = currentTabs.includes(tab)
                              ? currentTabs.filter(t => t !== tab)
                              : [...currentTabs, tab];
                            setFormData(prev => ({
                              ...prev,
                              permissions: {
                                ...prev.permissions,
                                allowedTabs: newTabs
                              }
                            }));
                          }}
                        />
                        <span>{tab}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Division Access Permissions */}
              <div className="users__modal-permissions-section" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                <h4 className="users__modal-permissions-title">Inventory Division Access Scope</h4>
                <p className="users__modal-permissions-description">
                  Select which division records this user is authorized to manage in Inventory & Appraisal
                </p>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="users__permission-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={formData.permissions.allowedDivisions?.includes('ALL') ?? true}
                      disabled={isPermissionsUIChangeDisabled()}
                      onChange={(e) => {
                        const isChecked = e.target.checked;
                        setFormData(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            allowedDivisions: isChecked ? ['ALL'] : availableDivisions.slice(0, 1)
                          }
                        }));
                      }}
                    />
                    <span>All Divisions (Full Access)</span>
                  </label>
                </div>
                
                {!(formData.permissions.allowedDivisions?.includes('ALL')) && (
                  <div className="users__permissions-checkboxes" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem 1rem', marginTop: '0.5rem', paddingLeft: '0.5rem' }}>
                    {availableDivisions.map((divName) => {
                      const isChecked = formData.permissions.allowedDivisions?.includes(divName) ?? false;
                      return (
                        <label key={divName} className="users__permission-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isPermissionsUIChangeDisabled()}
                            onChange={() => {
                              const currentDivs = (formData.permissions.allowedDivisions || []).filter(d => d !== 'ALL');
                              const newDivs = currentDivs.includes(divName)
                                ? currentDivs.filter(d => d !== divName)
                                : [...currentDivs, divName];
                              setFormData(prev => ({
                                ...prev,
                                permissions: {
                                  ...prev.permissions,
                                  allowedDivisions: newDivs.length === 0 ? ['ALL'] : newDivs
                                }
                              }));
                            }}
                          />
                          <span>{divName}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedUser && (
            <div className="users__modal-info">
              <p>
                <strong>Created:</strong> {new Date(selectedUser.createdAt).toLocaleString()}
              </p>
              <p>
                <strong>Last Login:</strong>{' '}
                {selectedUser.lastLogin
                  ? new Date(selectedUser.lastLogin).toLocaleString()
                  : 'Never'}
              </p>
              <p>
                <strong>Last Updated:</strong> {new Date(selectedUser.updatedAt).toLocaleString()}
                {selectedUser.updatedBy && ` by ${selectedUser.updatedBy}`}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete User Confirm Modal */}
      {pendingDeleteUser && (
        <Modal
          isOpen={true}
          onClose={() => setPendingDeleteUser(null)}
          title="Delete User"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="ghost" onClick={() => setPendingDeleteUser(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmDeleteUser}>
                Delete User
              </Button>
            </div>
          }
        >
          <p>
            Are you sure you want to delete user <strong>{pendingDeleteUser.lastName}, {pendingDeleteUser.firstName}</strong>? This action cannot be undone.
          </p>
        </Modal>
      )}

    </div>
  );
}

export default Users;
