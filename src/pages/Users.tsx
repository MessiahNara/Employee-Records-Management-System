import { useState, useMemo, useEffect, useCallback } from 'react';
import Table, { Column } from '../components/ui/Table';
import SearchBar from '../components/ui/SearchBar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import { User, UserStatus, UserPermissions, Role, PermissionAction } from '../types';
import { getAuthState } from '../utils/mockAuth';
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
  const userRole = currentUser?.role || '';
  const isSuperAdmin = userRole === 'superadmin';
  const isDeveloper = userRole === 'developer';
  const canAccessUserManagement = isSuperAdmin || isDeveloper;

  // Fetch users from API
  useEffect(() => {
    if (canAccessUserManagement) {
      fetchUsers();
    }
  }, [canAccessUserManagement]);

  // Listen for profile picture updates
  useEffect(() => {
    const handleProfileUpdate = () => {
      if (canAccessUserManagement) {
        fetchUsers(); // Refresh users list when profile picture changes
      }
    };

    window.addEventListener('profilePictureUpdated', handleProfileUpdate);

    return () => {
      window.removeEventListener('profilePictureUpdated', handleProfileUpdate);
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
    if (isDeveloper) return true; // Developer can edit everyone
    if (isSuperAdmin) return true; // Super Admin can edit everyone
    return false;
  };

  // Check if current user can delete a specific user (Developer only)
  const canDeleteUser = (user: User): boolean => {
    if (!isDeveloper) return false;
    return user.id !== currentUser?.id; // Cannot delete self
  };

  // Get available roles for role selection
  const getAvailableRoles = () => {
    if (isSuperAdmin || isDeveloper) {
      return roles;
    }
    return [];
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
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {canEdit && (
              <Button
                variant="success"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditUser(user);
                }}
              >
                <MdEdit style={{ marginRight: '0.25rem' }} /> Update
              </Button>
            )}
            {canDelete && (
              <Button
                variant="danger"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(user);
                }}
              >
                <MdDelete style={{ marginRight: '0.25rem' }} /> Delete
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
    // Extract username from email (temporary workaround)
    const username = user.email.split('@')[0];
    const userData = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: username,
      password: '',
      roleId: user.roleId,
      permissions: user.permissions || { create: false, read: true, update: false, delete: false }
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
      permissions: { create: false, read: true, update: false, delete: false }
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
      if (formData.password && formData.password !== '') changedFields.password = { from: '(hidden)', to: '(updated)' };
      const permissionsChanged =
        formData.permissions.create !== originalUserData?.permissions.create ||
        formData.permissions.read !== originalUserData?.permissions.read ||
        formData.permissions.update !== originalUserData?.permissions.update ||
        formData.permissions.delete !== originalUserData?.permissions.delete;
      if (permissionsChanged) changedFields.permissions = { from: originalUserData?.permissions, to: formData.permissions };

      if (Object.keys(changedFields).length === 0) {
        showToast('No changes detected.', 'info');
        return;
      }

      try {
        const userName = `${selectedUser.lastName}, ${selectedUser.firstName}`;
        await api.approvals.submit({
          requestedBy: currentUser?.id || '',
          requestedByName: `${currentUser?.lastName}, ${currentUser?.firstName}`,
          action: 'update_user',
          entityType: 'user',
          entityId: selectedUser.id,
          entityName: userName,
          payload: { userId: selectedUser.id, changedFields },
        });
        handleCloseModal();
        showToast('✅ Update request submitted. Go to Approvals to review and execute.', 'info');
      } catch (err: any) {
        showToast(err.message || 'Failed to submit approval request.', 'error');
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
        formData.permissions.delete !== originalUserData.permissions.delete;

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
    try {
      const userName = `${user.lastName}, ${user.firstName}`;
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName}, ${currentUser?.firstName}`,
        action: 'delete_user',
        entityType: 'user',
        entityId: user.id,
        entityName: userName,
        payload: { id: user.id, userName },
      });
      showToast('✅ Delete request submitted. Go to Approvals to review and execute.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit approval request.', 'error');
    }
  };

  const handleDeleteConfirm = async (authorizingUser: any) => {
    if (!pendingDeleteUser) return;
    setIsDeletePasswordModalOpen(false);

    try {
      await api.user.delete(pendingDeleteUser.id, authorizingUser?.approvalToken);

      // Audit log
      try {
        await api.audit.create({
          userId: currentUser?.id || 'system',
          action: 'delete',
          entity: 'user',
          entityId: pendingDeleteUser.id,
          details: `${currentUser?.lastName}, ${currentUser?.firstName} deleted user: ${pendingDeleteUser.lastName}, ${pendingDeleteUser.firstName} [Authorized by: ${authorizingUser.lastName}, ${authorizingUser.firstName}]`,
        });
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      showToast(`User "${pendingDeleteUser.lastName}, ${pendingDeleteUser.firstName}" deleted successfully.`, 'success');
      setPendingDeleteUser(null);
      fetchUsers();
    } catch (error: any) {
      showToast(`Failed to delete user: ${error.message || error.error || 'Unknown error'}`, 'error');
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
      // Reset permissions when changing role
      permissions: roleId === 'role-3' 
        ? { create: false, read: true, update: false, delete: false }
        : prev.permissions
    }));
  };

  // Check if role selection should be disabled
  const isRoleSelectionDisabled = (): boolean => {
    // If editing a Super Admin user, role selection is completely disabled
    if (selectedUser && selectedUser.roleId === 'role-1') {
      return true;
    }
    
    return false;
  };

  const getRoleTooltip = (): string => {
    // If editing a Super Admin user
    if (selectedUser && selectedUser.roleId === 'role-1') {
      return 'Super Admin role cannot be changed';
    }
    
    return '';
  };

  // Show permissions UI for Admin and Staff roles (not Super Admin)
  const showPermissionsUI = formData.roleId === 'role-2' || formData.roleId === 'role-3';

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
          Only Super Administrators and Developers can manage users.
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

        {/* Add/Edit User Modal */}
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
              marginBottom: '1.5rem', 
              padding: '0.75rem', 
              backgroundColor: 'var(--bg-secondary)', 
              borderRadius: 'var(--border-radius)',
              fontSize: '0.875rem',
              color: 'var(--text-secondary)'
            }}>
              ℹ️ Update only the fields you want to change. Unchanged fields will retain their existing values.
            </p>
          )}

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
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
                Current User ID
              </label>
              <div style={{ 
                padding: '0.75rem', 
                backgroundColor: 'var(--bg-secondary)', 
                borderRadius: 'var(--border-radius)',
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
                fontFamily: 'monospace'
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

          {selectedUser && (
            <>
              <div className="users__id-update-section">
                <h4 className="users__modal-section-title">Update User ID (Optional)</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
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

              <div className="users__password-section">
                <h4 className="users__modal-section-title">Change Password (Optional)</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Leave blank to keep current password. If changing password, current password is required.
                </p>
              </div>
            </>
          )}

          {selectedUser && (
            <div className="users__password-section">
              <div className="users__password-field">
                <Input
                  id="user-new-password"
                  label="New Password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter new password (leave blank to keep current)"
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
          )}

          {!selectedUser && (
            <div className="users__password-field">
              <Input
                id="user-password"
                label="Password *"
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
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
          )}

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
              disabled={selectedUser?.roleId === 'role-1'}
            >
              {getAvailableRoles().map((role) => {
                const disabled = isRoleSelectionDisabled();
                const tooltip = getRoleTooltip();
                
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

          {/* Permissions Section - For both Admin and Staff roles */}
          {showPermissionsUI && (
            <div className="users__modal-permissions-section">
              <h4 className="users__modal-permissions-title">
                {formData.roleId === 'role-2' ? 'Admin' : 'Staff'} Permissions (CRUD)
              </h4>
              <p className="users__modal-permissions-description">
                Select which actions this {formData.roleId === 'role-2' ? 'admin' : 'staff member'} can perform
              </p>
              <div className="users__permissions-checkboxes">
                <label className="users__permission-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.permissions.create}
                    onChange={() => handlePermissionToggle('create')}
                  />
                  <span>Create</span>
                </label>
                <label className="users__permission-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.permissions.read}
                    onChange={() => handlePermissionToggle('read')}
                  />
                  <span>Read</span>
                </label>
                <label className="users__permission-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.permissions.update}
                    onChange={() => handlePermissionToggle('update')}
                  />
                  <span>Update</span>
                </label>
                <label className="users__permission-checkbox">
                  <input
                    type="checkbox"
                    checked={formData.permissions.delete}
                    onChange={() => handlePermissionToggle('delete')}
                  />
                  <span>Delete</span>
                </label>
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

    </div>
  );
}

export default Users;
