import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useIdleTimeout } from '../contexts/IdleTimeoutContext';
import { getAuthState, saveAuthState } from '../utils/mockAuth';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import PasswordConfirmModal from '../components/ui/PasswordConfirmModal';
import ProfilePictureUpload from '../components/ProfilePictureUpload';
import { MdPerson, MdSettings, MdLock } from 'react-icons/md';
import api from '../services/api';
import './Settings.css';

type SettingsTab = 'profile' | 'system';

interface UserProfile {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  profilePicture?: string;
}

interface ProfileFormData {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
}

function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const { idleTimeout, refreshIdleTimeout } = useIdleTimeout();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [originalProfile, setOriginalProfile] = useState<ProfileFormData | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedIdleTimeout, setSelectedIdleTimeout] = useState<number | null>(null);
  const [formData, setFormData] = useState<ProfileFormData>({
    id: '',
    firstName: '',
    lastName: '',
    username: '',
  });

  // Dropdown options state
  const [appointmentStatuses, setAppointmentStatuses] = useState<string[]>([]);
  const [officeNames, setOfficeNames] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [recordLocations, setRecordLocations] = useState<string[]>([]);
  const [dispositionProvisions, setDispositionProvisions] = useState<string[]>([]);
  const [itemNumbers, setItemNumbers] = useState<string[]>([]);
  const [prdsGrdsOptions, setPrdsGrdsOptions] = useState<string[]>([]);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [classificationCategories, setClassificationCategories] = useState<string[]>([]);
  const [subCategories, setSubCategories] = useState<string[]>([]);
  const [newAppointmentStatus, setNewAppointmentStatus] = useState('');
  const [newStatusNeedsDate, setNewStatusNeedsDate] = useState(false);
  const [newOfficeName, setNewOfficeName] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [newRecordLocation, setNewRecordLocation] = useState('');
  const [newDispositionProvision, setNewDispositionProvision] = useState('');
  const [newItemNumber, setNewItemNumber] = useState('');
  const [newPrdsGrds, setNewPrdsGrds] = useState('');
  const [newDivision, setNewDivision] = useState('');
  const [newClassificationCategory, setNewClassificationCategory] = useState('');
  const [newSubCategory, setNewSubCategory] = useState('');
  const [isSavingDropdowns, setIsSavingDropdowns] = useState(false);
  const [aoYears, setAoYears] = useState<string[]>([]);
  const [newAoYear, setNewAoYear] = useState('');
  const [reasonsForSeparation, setReasonsForSeparation] = useState<string[]>([]);
  const [newReasonForSeparation, setNewReasonForSeparation] = useState('');
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ProfileFormData, string>>>({});

  // Bulk profile picture upload state
  const bulkImageRef = useRef<HTMLInputElement>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ matched: string[]; unmatched: string[]; failed: string[] } | null>(null);

  // Server URL configuration state
  const [serverUrl, setServerUrl] = useState<string>('');
  const [isSavingServerUrl, setIsSavingServerUrl] = useState(false);
  const [serverUrlError, setServerUrlError] = useState<string>('');
  const isElectron = typeof window !== 'undefined' && typeof (window as any).electron !== 'undefined';
  const initialServerUrl = isElectron ? ((window as any).electron?.serverUrl || '') : '';

  // Get current user from auth state
  const currentUser = getAuthState();
  const isSuperAdmin = currentUser?.role === 'superadmin';
  const isDeveloper = currentUser?.role === 'developer';
  const isSuperAdminOrDeveloper = isSuperAdmin || isDeveloper;
  
  const roleDisplayNames: Record<string, string> = {
    'superadmin': 'Super Admin',
    'admin': 'Admin',
    'staff': 'Staff',
    'developer': 'Developer',
  };

  // Fetch user profile from backend
  useEffect(() => {
    fetchUserProfile();
    fetchDropdownOptions();
    // Initialize server URL from localStorage if available
    if (isElectron) {
      const savedServerUrl = localStorage.getItem('serverUrl') || initialServerUrl;
      setServerUrl(savedServerUrl);
    }
  }, []);

  // Initialize idle timeout from context
  useEffect(() => {
    setSelectedIdleTimeout(idleTimeout);
  }, [idleTimeout]);

  const fetchDropdownOptions = async () => {
    try {
      const settings = await api.systemSettings.get();
      setAppointmentStatuses(settings.appointmentStatuses ?? []);
      setOfficeNames(settings.officeNames ?? []);
      setPositions(settings.positions ?? []);
      setRecordLocations((settings as any).recordLocations ?? []);
      setDispositionProvisions((settings as any).dispositionProvisions ?? []);
      setItemNumbers((settings as any).itemNumbers ?? []);
      setPrdsGrdsOptions((settings as any).prdsGrds ?? []);
      setDivisions((settings as any).divisions ?? []);
      setClassificationCategories((settings as any).classificationCategories ?? []);
      setSubCategories((settings as any).subCategories ?? []);
      setAoYears(settings.aoYears ?? []);
      setReasonsForSeparation(settings.reasonsForSeparation ?? []);
    } catch {
      // non-fatal
    }
  };

  const addItem = (list: string[], setList: (v: string[]) => void, value: string, setInput: (v: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed || list.includes(trimmed)) return;
    setList([...list, trimmed]);
    setInput('');
  };

  const addAppointmentStatus = () => {
    const trimmed = newAppointmentStatus.trim();
    if (!trimmed) return;
    
    // Check if it already exists either with or without suffix
    const baseName = trimmed.endsWith('|date') ? trimmed.slice(0, -5) : trimmed;
    const exists = appointmentStatuses.some(status => {
      const name = status.endsWith('|date') ? status.slice(0, -5) : status;
      return name.toLowerCase() === baseName.toLowerCase();
    });
    
    if (exists) {
      showToast('This appointment status already exists.', 'warning');
      return;
    }
    
    const finalValue = newStatusNeedsDate ? `${trimmed}|date` : trimmed;
    setAppointmentStatuses([...appointmentStatuses, finalValue]);
    setNewAppointmentStatus('');
    setNewStatusNeedsDate(false);
  };

  const removeItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.filter((v) => v !== item));
  };

  const handleSaveDropdowns = async () => {
    if (!isDeveloper) return;
    setIsSavingDropdowns(true);
    try {
      await api.systemSettings.updateDropdownOptions(
        { appointmentStatuses, officeNames, positions, recordLocations, dispositionProvisions, itemNumbers, prdsGrds: prdsGrdsOptions, divisions, classificationCategories, subCategories, aoYears, reasonsForSeparation },
        currentUser?.role || ''
      );
      showToast('Dropdown options saved successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save dropdown options', 'error');
    } finally {
      setIsSavingDropdowns(false);
    }
  };

  const handleBulkImagesClick = () => {
    if (bulkImageRef.current) bulkImageRef.current.click();
  };

  const handleBulkImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (bulkImageRef.current) bulkImageRef.current.value = '';

    setBulkUploading(true);
    setBulkResults(null);

    const matched: string[] = [];
    const unmatched: string[] = [];
    const failed: string[] = [];

    try {
      const employees = await api.employee.getAll();
      const employeeIdSet = new Set<string>(employees.map((emp: any) => emp.id));

      const validImageFiles = files.filter((file) => {
        const name = file.name.toLowerCase();
        const ext = name.split('.').pop() || '';
        return ['jpg', 'jpeg', 'png'].includes(ext) && !['zip', 'rar'].includes(ext);
      });

      if (validImageFiles.length === 0) {
        showToast('Please select JPG or PNG image files only. ZIP and RAR archives are not allowed.', 'error');
        return;
      }

      for (const file of validImageFiles) {
        const name = file.name;
        const ext = name.split('.').pop()?.toLowerCase() || 'jpg';
        const employeeId = name.replace(/\.[^/.]+$/, '');

        if (!employeeIdSet.has(employeeId)) {
          unmatched.push(name);
          continue;
        }

        try {
          const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
          const imageFile = new File([file], name, { type: mimeType });
          await api.employee.uploadProfilePicture(employeeId, imageFile);
          matched.push(name);
        } catch {
          failed.push(name);
        }
      }

      setBulkResults({ matched, unmatched, failed });
      if (matched.length > 0) {
        showToast(`${matched.length} profile picture${matched.length > 1 ? 's' : ''} uploaded successfully!`, 'success');
      } else {
        showToast('No matching employees found for the selected image files.', 'warning');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to process image files', 'error');
    } finally {
      setBulkUploading(false);
    }
  };

  const fetchUserProfile = async () => {
    if (!currentUser?.id) {
      showToast('User not authenticated', 'error');
      return;
    }

    // If the stored session has an empty/invalid ID, recover by username
    if (!currentUser.id.trim()) {
      try {
        setIsLoading(true);
        const allUsers = await api.user.getAll();
        const userByUsername = allUsers.find((u: any) => u.username === currentUser.username);
        if (userByUsername) {
          const updatedAuthUser = { ...currentUser, id: userByUsername.id };
          const rememberMe = localStorage.getItem('authUser') !== null;
          saveAuthState(updatedAuthUser, rememberMe);
          await fetchUserProfile();
        } else {
          showToast('Could not recover profile. Please log out and log in again.', 'error');
        }
      } catch {
        showToast('Could not recover profile. Please log out and log in again.', 'error');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      setIsLoading(true);
      const userData = await api.user.getById(currentUser.id);
      setUserProfile(userData);
      
      const profileData = {
        id: userData.id,
        firstName: userData.firstName,
        lastName: userData.lastName,
        username: userData.username,
      };
      
      setFormData(profileData);
      setOriginalProfile(profileData);
    } catch (error: any) {
      console.error('Error fetching user profile:', error);
      
      // If user not found (or ID is stale), try to find user by username as fallback
      if (error.message?.includes('not found') || error.message?.includes('404') || error.message === 'Request failed') {
        try {
          const allUsers = await api.user.getAll();
          const userByUsername = allUsers.find((u: any) => u.username === currentUser.username);
          
          if (userByUsername) {
            // Update session with correct ID
            const updatedAuthUser = {
              ...currentUser,
              id: userByUsername.id,
            };
            const rememberMe = localStorage.getItem('authUser') !== null;
            saveAuthState(updatedAuthUser, rememberMe);
            
            // Retry fetching profile
            await fetchUserProfile();
            return;
          }
        } catch (fallbackError) {
          console.error('Fallback fetch failed:', fallbackError);
        }
      }
      
      showToast('Failed to load profile data. Please try logging out and logging in again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormChange = (field: keyof ProfileFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const validateProfileForm = (): boolean => {
    const errors: Partial<Record<keyof ProfileFormData, string>> = {};

    if (!formData.id.trim()) {
      errors.id = 'User ID is required';
    }
    if (!formData.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    if (!formData.username.trim()) {
      errors.username = 'Username is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveProfile = async () => {
    if (!validateProfileForm() || !userProfile || !originalProfile) {
      return;
    }

    // Detect changed fields
    const changedFields: any = {};
    (Object.keys(formData) as Array<keyof ProfileFormData>).forEach((key) => {
      if (formData[key] !== originalProfile[key]) {
        changedFields[key] = formData[key];
      }
    });

    // Check if any fields were changed
    if (Object.keys(changedFields).length === 0) {
      showToast('No changes detected', 'info');
      return;
    }

    // Open password confirmation modal
    setIsPasswordModalOpen(true);
  };

  const handleConfirmSaveProfile = async (authorizingUser: any) => {
    if (!userProfile || !originalProfile) {
      return;
    }

    try {
      setIsSaving(true);

      // Detect changed fields again
      const changedFields: any = {};
      (Object.keys(formData) as Array<keyof ProfileFormData>).forEach((key) => {
        if (formData[key] !== originalProfile[key]) {
          changedFields[key] = formData[key];
        }
      });

      // Use PATCH for partial update
      const updatedUser = await api.user.partialUpdate(
        userProfile.id,
        changedFields,
        currentUser?.id,
        authorizingUser?.approvalToken
      );
      
      // Update local state
      setUserProfile(updatedUser);
      const newProfileData = {
        id: updatedUser.id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        username: updatedUser.username,
      };
      setFormData(newProfileData);
      setOriginalProfile(newProfileData);

      // Update auth state in storage
      const updatedAuthUser = {
        ...currentUser,
        id: updatedUser.id, // Update ID in case it changed
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        username: updatedUser.username,
        name: `${updatedUser.lastName}, ${updatedUser.firstName}`,
        profilePicture: updatedUser.profilePicture, // Include profile picture
      };
      
      // Preserve the storage type (localStorage vs sessionStorage)
      const rememberMe = localStorage.getItem('authUser') !== null;
      saveAuthState(updatedAuthUser, rememberMe);

      showToast(`Profile updated successfully! (${Object.keys(changedFields).length} field(s) changed)\nAuthorized by: ${authorizingUser.lastName}, ${authorizingUser.firstName}`, 'success');
      setIsPasswordModalOpen(false);
    } catch (error: any) {
      console.error('Error updating profile:', error);
      throw new Error(error.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadProfilePicture = async (file: File) => {
    if (!userProfile) return;

    try {
      const result = await api.user.uploadProfilePicture(userProfile.id, file);
      
      // Update local state
      setUserProfile(prev => prev ? { ...prev, profilePicture: result.profilePicture } : null);
      
      // Update auth state
      const updatedAuthUser = {
        ...currentUser,
        profilePicture: result.profilePicture,
      };
      const rememberMe = localStorage.getItem('authUser') !== null;
      saveAuthState(updatedAuthUser, rememberMe);
      
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event('profilePictureUpdated'));
      
      showToast('Profile picture uploaded successfully!', 'success');
    } catch (error: any) {
      console.error('Error uploading profile picture:', error);
      throw new Error(error.message || 'Failed to upload profile picture');
    }
  };

  const handleRemoveProfilePicture = async () => {
    if (!userProfile) return;

    try {
      await api.user.removeProfilePicture(userProfile.id);
      
      // Update local state
      setUserProfile(prev => prev ? { ...prev, profilePicture: undefined } : null);
      
      // Update auth state
      const updatedAuthUser = {
        ...currentUser,
        profilePicture: undefined,
      };
      const rememberMe = localStorage.getItem('authUser') !== null;
      saveAuthState(updatedAuthUser, rememberMe);
      
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event('profilePictureUpdated'));
      
      showToast('Profile picture removed successfully!', 'success');
    } catch (error: any) {
      console.error('Error removing profile picture:', error);
      throw new Error(error.message || 'Failed to remove profile picture');
    }
  };

  const handleIdleTimeoutChange = async (value: string) => {
    if (!isSuperAdminOrDeveloper) {
      showToast('Only Super Admin or Developer can change this setting', 'error');
      return;
    }

    const timeoutValue = value === 'disabled' ? null : parseInt(value);
    setSelectedIdleTimeout(timeoutValue);

    try {
      // Update global system setting
      await api.systemSettings.update({ idleTimeout: timeoutValue }, currentUser?.role || '');
      
      // Refresh idle timeout in context
      await refreshIdleTimeout();

      const message = timeoutValue 
        ? `Global auto logout set to ${timeoutValue} minute${timeoutValue > 1 ? 's' : ''} of inactivity for all users`
        : 'Global auto logout disabled for all users';
      showToast(message, 'success');
    } catch (error: any) {
      console.error('Error updating idle timeout:', error);
      showToast(error.message || 'Failed to update auto logout setting', 'error');
      // Revert on error
      setSelectedIdleTimeout(idleTimeout);
    }
  };

  const validateServerUrl = (url: string): boolean => {
    if (!url.trim()) {
      setServerUrlError('');
      return true;
    }

    try {
      const urlObj = new URL(url.includes('://') ? url : `http://${url}`);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        setServerUrlError('Server URL must use HTTP or HTTPS protocol');
        return false;
      }
      setServerUrlError('');
      return true;
    } catch {
      setServerUrlError('Invalid server URL format');
      return false;
    }
  };

  const handleSaveServerUrl = async () => {
    if (!validateServerUrl(serverUrl)) {
      return;
    }

    setIsSavingServerUrl(true);
    try {
      // Save to localStorage for persistence
      if (serverUrl.trim()) {
        localStorage.setItem('serverUrl', serverUrl);
        showToast('Server URL saved successfully. Please restart the application for changes to take effect.', 'success');
      } else {
        localStorage.removeItem('serverUrl');
        showToast('Server URL cleared. Please restart the application to use the default server.', 'success');
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to save server URL', 'error');
    } finally {
      setIsSavingServerUrl(false);
    }
  };

  const handleResetServerUrl = () => {
    setServerUrl(initialServerUrl);
    localStorage.removeItem('serverUrl');
    setServerUrlError('');
    showToast('Server URL reset to default. Please restart the application for changes to take effect.', 'info');
  };

  return (
    <div className="settings">
      <div className="settings__header">
        <h1 className="settings__title">Settings</h1>
        <p className="settings__subtitle">Manage your account and system preferences</p>
      </div>

      <div className="settings__layout">
        {/* Main Content */}
        <div className="settings__content">
          <Card>
            <nav className="settings__nav">
              <button
                className={`settings__nav-item ${activeTab === 'profile' ? 'settings__nav-item--active' : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                <MdPerson className="settings__nav-icon" />
                <span className="settings__nav-label">Profile</span>
              </button>
              <button
                className={`settings__nav-item ${activeTab === 'system' ? 'settings__nav-item--active' : ''}`}
                onClick={() => setActiveTab('system')}
              >
                <MdSettings className="settings__nav-icon" />
                <span className="settings__nav-label">System</span>
              </button>
            </nav>
          </Card>

          {/* Profile Settings */}
          {activeTab === 'profile' && (
            <div className="settings__section">
              {isLoading ? (
                <Card>
                  <div style={{ padding: '2rem', textAlign: 'center' }}>
                    <p>Loading profile...</p>
                  </div>
                </Card>
              ) : (
                <>
                  <Card>
                    <div className="settings__card-header">
                      <h2 className="settings__card-title">Profile Picture</h2>
                      <p className="settings__card-description">
                        Upload a profile picture to personalize your account
                      </p>
                    </div>

                    <div className="settings__form">
                      <ProfilePictureUpload
                        currentPicture={userProfile?.profilePicture}
                        firstName={formData.firstName}
                        lastName={formData.lastName}
                        onUpload={handleUploadProfilePicture}
                        onRemove={handleRemoveProfilePicture}
                        disabled={isLoading || isSaving}
                      />
                    </div>
                  </Card>

                  <Card>
                    <div className="settings__card-header">
                      <h2 className="settings__card-title">Profile Information</h2>
                      <p className="settings__card-description">
                        Update your personal information and profile details
                      </p>
                    </div>

                    <div className="settings__form">
                      <div className="settings__avatar-section">
                        <div className="settings__avatar-large">
                          {userProfile?.profilePicture ? (
                            <img 
                              src={userProfile.profilePicture} 
                              alt="Profile" 
                              style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'cover',
                                borderRadius: '50%'
                              }}
                            />
                          ) : (
                            formData.firstName?.[0] || formData.lastName?.[0] || 'U'
                          )}
                        </div>
                        <div className="settings__avatar-info">
                          <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                            {formData.lastName}, {formData.firstName}
                          </p>
                          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            @{formData.username}
                          </p>
                        </div>
                      </div>

                      <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                          User ID
                        </h4>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                          ⚠️ Changing your User ID will update all references. Use with caution.
                        </p>
                        <Input
                          label="User ID"
                          placeholder="Enter user ID"
                          value={formData.id}
                          onChange={(e) => handleFormChange('id', e.target.value)}
                          error={formErrors.id}
                          fullWidth
                        />
                      </div>

                      <div className="settings__form-row">
                        <Input
                          label="First Name"
                          placeholder="Enter first name"
                          value={formData.firstName}
                          onChange={(e) => handleFormChange('firstName', e.target.value)}
                          error={formErrors.firstName}
                          fullWidth
                        />
                        <Input
                          label="Last Name"
                          placeholder="Enter last name"
                          value={formData.lastName}
                          onChange={(e) => handleFormChange('lastName', e.target.value)}
                          error={formErrors.lastName}
                          fullWidth
                        />
                      </div>

                      <Input
                        label="Username"
                        placeholder="Enter username"
                        value={formData.username}
                        onChange={(e) => handleFormChange('username', e.target.value)}
                        error={formErrors.username}
                        fullWidth
                      />

                      <div className="settings__form-field">
                        <label className="settings__form-label">Role</label>
                        <div className="settings__form-value">
                          <Badge variant="info">
                            {roleDisplayNames[userProfile?.role || ''] || userProfile?.role}
                          </Badge>
                        </div>
                      </div>

                      <div className="settings__form-actions">
                        <Button 
                          variant="primary" 
                          onClick={handleSaveProfile}
                          loading={isSaving}
                          disabled={isSaving}
                        >
                          {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <div className="settings__card-header">
                      <h2 className="settings__card-title">Account Information</h2>
                      <p className="settings__card-description">
                        System information and account details
                      </p>
                    </div>
                    <div className="settings__info-grid">
                      <div className="settings__info-item">
                        <span className="settings__info-label">Current User ID</span>
                        <span className="settings__info-value" style={{ fontFamily: 'monospace' }}>
                          {userProfile?.id || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* System Settings */}
          {activeTab === 'system' && (
            <div className="settings__section">
              <Card>
                <div className="settings__card-header">
                  <h2 className="settings__card-title">Appearance</h2>
                  <p className="settings__card-description">
                    Customize the look and feel of your dashboard
                  </p>
                </div>

                <div className="settings__form">
                  <div className="settings__toggle-item">
                    <div className="settings__toggle-info">
                      <div className="settings__toggle-label">Dark Mode</div>
                      <div className="settings__toggle-description">
                        Switch between light and dark theme
                      </div>
                    </div>
                    <label className="settings__toggle">
                      <input
                        type="checkbox"
                        checked={theme === 'dark'}
                        onChange={toggleTheme}
                      />
                      <span className="settings__toggle-slider"></span>
                    </label>
                  </div>

                  <div className="settings__theme-preview">
                    <div className="settings__theme-label">Current Theme:</div>
                    <Badge variant={theme === 'dark' ? 'default' : 'info'}>
                      {theme === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode'}
                    </Badge>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="settings__card-header">
                  <h2 className="settings__card-title">Security</h2>
                  <p className="settings__card-description">
                    Configure security and session management settings (Global - applies to all users)
                  </p>
                </div>

                <div className="settings__form">
                  {isSuperAdminOrDeveloper ? (
                    <>
                      <div className="settings__form-field">
                        <label htmlFor="idle-timeout" className="settings__form-label">
                          Global Auto Logout After Inactivity
                        </label>
                        <p className="settings__form-helper">
                          🔒 Super Admin Only: This setting applies to ALL users system-wide. Users will be automatically logged out after the specified period of inactivity.
                        </p>
                        <select
                          id="idle-timeout"
                          className="settings__form-select"
                          value={selectedIdleTimeout === null ? 'disabled' : selectedIdleTimeout.toString()}
                          onChange={(e) => handleIdleTimeoutChange(e.target.value)}
                          style={{ marginTop: '0.5rem' }}
                        >
                          <option value="disabled">Disabled</option>
                          <option value="1">1 minute</option>
                          <option value="5">5 minutes</option>
                          <option value="10">10 minutes</option>
                          <option value="15">15 minutes</option>
                          <option value="30">30 minutes</option>
                          <option value="60">60 minutes</option>
                        </select>
                      </div>

                      <div className="settings__info-box" style={{ 
                        marginTop: '1rem',
                        padding: '1rem',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: 'var(--border-radius)',
                        fontSize: '0.875rem'
                      }}>
                        <p style={{ marginBottom: '0.5rem', fontWeight: 500 }}>
                          ℹ️ Current Global Setting:
                        </p>
                        <p style={{ color: 'var(--text-secondary)' }}>
                          {selectedIdleTimeout === null 
                            ? 'Auto logout is disabled for all users. Users will remain logged in until they manually log out.'
                            : `All users will be automatically logged out after ${selectedIdleTimeout} minute${selectedIdleTimeout > 1 ? 's' : ''} of inactivity. No warning will be shown.`
                          }
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="settings__restricted-section">
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '1rem',
                        padding: '1.5rem',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: 'var(--border-radius)',
                        border: '1px solid var(--border-color)'
                      }}>
                        <MdLock style={{ fontSize: '2rem', color: 'var(--color-warning)' }} />
                        <div>
                          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                            Restricted Setting
                          </p>
                          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                            Auto logout settings are managed by the Super Administrator and apply to all users system-wide.
                          </p>
                          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            <strong>Current Setting:</strong> {selectedIdleTimeout === null 
                              ? 'Disabled'
                              : `${selectedIdleTimeout} minute${selectedIdleTimeout > 1 ? 's' : ''} of inactivity`
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Server Configuration - Electron/Client Build Only */}
              {isElectron && (
                <Card>
                  <div className="settings__card-header">
                    <h2 className="settings__card-title">Server Configuration</h2>
                    <p className="settings__card-description">
                      Configure the backend server address for this client application
                    </p>
                  </div>

                  <div className="settings__form">
                    <div className="settings__info-box" style={{ 
                      marginBottom: '1.5rem',
                      padding: '1rem',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: 'var(--border-radius)',
                      fontSize: '0.875rem',
                      border: '1px solid var(--border-color)'
                    }}>
                      <p style={{ fontWeight: 500, marginBottom: '0.5rem' }}>
                        ℹ️ Current Configuration:
                      </p>
                      <p style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {serverUrl || 'Using default server (localhost:5000)'}
                      </p>
                    </div>

                    <div style={{ 
                      marginBottom: '1.5rem',
                      padding: '1rem',
                      backgroundColor: '#e6f2ff',
                      borderRadius: 'var(--border-radius)',
                      border: '1px solid #b3d9ff',
                      fontSize: '0.875rem'
                    }}>
                      <p style={{ fontWeight: 500, marginBottom: '0.75rem', color: '#0066cc' }}>
                        🔗 How to Connect from Another Computer:
                      </p>
                      <ol style={{ paddingLeft: '1.25rem', color: '#333', lineHeight: 1.6 }}>
                        <li style={{ marginBottom: '0.5rem' }}>
                          Open the <strong>Server Application</strong> on the computer running the database server
                        </li>
                        <li style={{ marginBottom: '0.5rem' }}>
                          Press <strong>F12</strong> to open Developer Tools and look for the Console tab
                        </li>
                        <li style={{ marginBottom: '0.5rem' }}>
                          Look for the line that says <strong>"🌐 LAN access URLs:"</strong> followed by IP addresses
                        </li>
                        <li style={{ marginBottom: '0.5rem' }}>
                          Copy one of those IP addresses (e.g., <code style={{ fontFamily: 'monospace', backgroundColor: '#fff', padding: '0.125rem 0.25rem' }}>http://192.168.1.100:5000</code>)
                        </li>
                        <li>
                          Paste it in the <strong>Server URL</strong> field below, then click <strong>Save Server URL</strong>
                        </li>
                      </ol>
                    </div>

                    <div className="settings__form-field">
                      <label className="settings__form-label">Server URL</label>
                      <p className="settings__form-helper" style={{ marginBottom: '0.75rem' }}>
                        Enter the full URL of the backend server (e.g., http://192.168.1.100:5000 or https://server.example.com). Leave empty to use the default embedded server on localhost.
                      </p>
                      <input
                        type="text"
                        className={`settings__form-input ${serverUrlError ? 'settings__form-input--error' : ''}`}
                        placeholder="http://192.168.1.100:5000"
                        value={serverUrl}
                        onChange={(e) => {
                          setServerUrl(e.target.value);
                          if (serverUrlError) validateServerUrl(e.target.value);
                        }}
                        style={{ 
                          width: '100%',
                          padding: '0.75rem',
                          marginBottom: serverUrlError ? '0.25rem' : '1rem',
                          border: `1px solid ${serverUrlError ? '#e53e3e' : 'var(--border-color)'}`,
                          borderRadius: 'var(--border-radius)',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem'
                        }}
                      />
                      {serverUrlError && (
                        <p style={{ 
                          color: '#e53e3e', 
                          fontSize: '0.75rem',
                          marginBottom: '1rem'
                        }}>
                          {serverUrlError}
                        </p>
                      )}
                    </div>

                    <div className="settings__form-actions" style={{ display: 'flex', gap: '1rem' }}>
                      <Button 
                        variant="primary" 
                        onClick={handleSaveServerUrl}
                        loading={isSavingServerUrl}
                        disabled={isSavingServerUrl}
                      >
                        {isSavingServerUrl ? 'Saving...' : 'Save Server URL'}
                      </Button>
                      <Button 
                        variant="secondary"
                        onClick={handleResetServerUrl}
                        disabled={isSavingServerUrl}
                      >
                        Reset to Default
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              
              {isDeveloper && (
                <>
                  <Card>
                  <div className="settings__card-header">
                    <h2 className="settings__card-title">Dropdown Options</h2>
                    <p className="settings__card-description">
                      Manage the available choices for Appointment Status, Office / Hospital Name, and Position / Function fields.
                    </p>
                  </div>
                  <div className="settings__form">

                    {/* Appointment Status */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">Appointment Status</h3>
                      <div className="settings__dropdown-add" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="text"
                            className="settings__form-input"
                            placeholder="Add new status..."
                            value={newAppointmentStatus}
                            onChange={(e) => setNewAppointmentStatus(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAppointmentStatus())}
                            style={{ flex: 1 }}
                          />
                          <Button variant="secondary" size="sm" onClick={addAppointmentStatus}>
                            + Add
                          </Button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="checkbox"
                            id="status-needs-date"
                            checked={newStatusNeedsDate}
                            onChange={(e) => setNewStatusNeedsDate(e.target.checked)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                          <label htmlFor="status-needs-date" style={{ cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-primary)', userSelect: 'none' }}>
                            Requires Appointment Duration Date
                          </label>
                        </div>
                      </div>
                      <div className="settings__dropdown-tags">
                        {appointmentStatuses.map((item) => {
                          const isDurational = item.endsWith('|date');
                          const displayName = isDurational ? item.slice(0, -5) : item;
                          return (
                            <span key={item} className="settings__dropdown-tag" style={{ borderLeft: isDurational ? '4px solid var(--color-primary)' : undefined }}>
                              {displayName} {isDurational && <small style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>(requires date)</small>}
                              <button className="settings__dropdown-tag-remove" onClick={() => removeItem(appointmentStatuses, setAppointmentStatuses, item)}>×</button>
                            </span>
                          );
                        })}
                        {appointmentStatuses.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    {/* Office / Hospital Name */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">Office / Hospital Name</h3>
                      <div className="settings__dropdown-add">
                        <input
                          type="text"
                          className="settings__form-input"
                          placeholder="Add new office or hospital name..."
                          value={newOfficeName}
                          onChange={(e) => setNewOfficeName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(officeNames, setOfficeNames, newOfficeName, setNewOfficeName))}
                        />
                        <Button variant="secondary" size="sm" onClick={() => addItem(officeNames, setOfficeNames, newOfficeName, setNewOfficeName)}>
                          + Add
                        </Button>
                      </div>
                      <div className="settings__dropdown-tags">
                        {officeNames.map((item) => (
                          <span key={item} className="settings__dropdown-tag">
                            {item}
                            <button className="settings__dropdown-tag-remove" onClick={() => removeItem(officeNames, setOfficeNames, item)}>×</button>
                          </span>
                        ))}
                        {officeNames.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    {/* Position / Function */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">Position / Function</h3>
                      <div className="settings__dropdown-add">
                        <input
                          type="text"
                          className="settings__form-input"
                          placeholder="Add new position or function..."
                          value={newPosition}
                          onChange={(e) => setNewPosition(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(positions, setPositions, newPosition, setNewPosition))}
                        />
                        <Button variant="secondary" size="sm" onClick={() => addItem(positions, setPositions, newPosition, setNewPosition)}>
                          + Add
                        </Button>
                      </div>
                      <div className="settings__dropdown-tags">
                        {positions.map((item) => (
                          <span key={item} className="settings__dropdown-tag">
                            {item}
                            <button className="settings__dropdown-tag-remove" onClick={() => removeItem(positions, setPositions, item)}>×</button>
                          </span>
                        ))}
                        {positions.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    {/* Location of Records */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">Location of Records</h3>
                      <div className="settings__dropdown-add">
                        <input
                          type="text"
                          className="settings__form-input"
                          placeholder="Add new record location..."
                          value={newRecordLocation}
                          onChange={(e) => setNewRecordLocation(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(recordLocations, setRecordLocations, newRecordLocation, setNewRecordLocation))}
                        />
                        <Button variant="secondary" size="sm" onClick={() => addItem(recordLocations, setRecordLocations, newRecordLocation, setNewRecordLocation)}>
                          + Add
                        </Button>
                      </div>
                      <div className="settings__dropdown-tags">
                        {recordLocations.map((item) => (
                          <span key={item} className="settings__dropdown-tag">
                            {item}
                            <button className="settings__dropdown-tag-remove" onClick={() => removeItem(recordLocations, setRecordLocations, item)}>×</button>
                          </span>
                        ))}
                        {recordLocations.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    {/* Disposition Provisions */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">Disposition Provisions</h3>
                      <div className="settings__dropdown-add">
                        <input
                          type="text"
                          className="settings__form-input"
                          placeholder="Add new disposition instruction..."
                          value={newDispositionProvision}
                          onChange={(e) => setNewDispositionProvision(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(dispositionProvisions, setDispositionProvisions, newDispositionProvision, setNewDispositionProvision))}
                        />
                        <Button variant="secondary" size="sm" onClick={() => addItem(dispositionProvisions, setDispositionProvisions, newDispositionProvision, setNewDispositionProvision)}>
                          + Add
                        </Button>
                      </div>
                      <div className="settings__dropdown-tags">
                        {dispositionProvisions.map((item) => (
                          <span key={item} className="settings__dropdown-tag">
                            {item}
                            <button className="settings__dropdown-tag-remove" onClick={() => removeItem(dispositionProvisions, setDispositionProvisions, item)}>×</button>
                          </span>
                        ))}
                        {dispositionProvisions.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    {/* Item Numbers (ITEM NO.) */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">Item Numbers (ITEM NO.)</h3>
                      <div className="settings__dropdown-add">
                        <input
                          type="text"
                          className="settings__form-input"
                          placeholder="Add new Item No. option..."
                          value={newItemNumber}
                          onChange={(e) => setNewItemNumber(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(itemNumbers, setItemNumbers, newItemNumber, setNewItemNumber))}
                        />
                        <Button variant="secondary" size="sm" onClick={() => addItem(itemNumbers, setItemNumbers, newItemNumber, setNewItemNumber)}>
                          + Add
                        </Button>
                      </div>
                      <div className="settings__dropdown-tags">
                        {itemNumbers.map((item) => (
                          <span key={item} className="settings__dropdown-tag">
                            {item}
                            <button className="settings__dropdown-tag-remove" onClick={() => removeItem(itemNumbers, setItemNumbers, item)}>×</button>
                          </span>
                        ))}
                        {itemNumbers.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    {/* PRDS/GRDS */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">PRDS/GRDS</h3>
                      <div className="settings__dropdown-add">
                        <input
                          type="text"
                          className="settings__form-input"
                          placeholder="Add new PRDS/GRDS option..."
                          value={newPrdsGrds}
                          onChange={(e) => setNewPrdsGrds(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(prdsGrdsOptions, setPrdsGrdsOptions, newPrdsGrds, setNewPrdsGrds))}
                        />
                        <Button variant="secondary" size="sm" onClick={() => addItem(prdsGrdsOptions, setPrdsGrdsOptions, newPrdsGrds, setNewPrdsGrds)}>
                          + Add
                        </Button>
                      </div>
                      <div className="settings__dropdown-tags">
                        {prdsGrdsOptions.map((item) => (
                          <span key={item} className="settings__dropdown-tag">
                            {item}
                            <button className="settings__dropdown-tag-remove" onClick={() => removeItem(prdsGrdsOptions, setPrdsGrdsOptions, item)}>&times;</button>
                          </span>
                        ))}
                        {prdsGrdsOptions.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    {/* Divisions (DIVISION) */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">Divisions (DIVISION)</h3>
                      <div className="settings__dropdown-add">
                        <input
                          type="text"
                          className="settings__form-input"
                          placeholder="Add new division..."
                          value={newDivision}
                          onChange={(e) => setNewDivision(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(divisions, setDivisions, newDivision, setNewDivision))}
                        />
                        <Button variant="secondary" size="sm" onClick={() => addItem(divisions, setDivisions, newDivision, setNewDivision)}>
                          + Add
                        </Button>
                      </div>
                      <div className="settings__dropdown-tags">
                        {divisions.map((item) => (
                          <span key={item} className="settings__dropdown-tag">
                            {item}
                            <button className="settings__dropdown-tag-remove" onClick={() => removeItem(divisions, setDivisions, item)}>×</button>
                          </span>
                        ))}
                        {divisions.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    {/* Classification Categories (MAIN CATEGORY) */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">Classification Categories (MAIN CATEGORY)</h3>
                      <div className="settings__dropdown-add">
                        <input
                          type="text"
                          className="settings__form-input"
                          placeholder="Add new classification category..."
                          value={newClassificationCategory}
                          onChange={(e) => setNewClassificationCategory(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(classificationCategories, setClassificationCategories, newClassificationCategory, setNewClassificationCategory))}
                        />
                        <Button variant="secondary" size="sm" onClick={() => addItem(classificationCategories, setClassificationCategories, newClassificationCategory, setNewClassificationCategory)}>
                          + Add
                        </Button>
                      </div>
                      <div className="settings__dropdown-tags">
                        {classificationCategories.map((item) => (
                          <span key={item} className="settings__dropdown-tag">
                            {item}
                            <button className="settings__dropdown-tag-remove" onClick={() => removeItem(classificationCategories, setClassificationCategories, item)}>×</button>
                          </span>
                        ))}
                        {classificationCategories.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    {/* Sub Categories (SUB CATEGORY) */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">Sub Categories (SUB CATEGORY)</h3>
                      <div className="settings__dropdown-add">
                        <input
                          type="text"
                          className="settings__form-input"
                          placeholder="Add new sub category..."
                          value={newSubCategory}
                          onChange={(e) => setNewSubCategory(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(subCategories, setSubCategories, newSubCategory, setNewSubCategory))}
                        />
                        <Button variant="secondary" size="sm" onClick={() => addItem(subCategories, setSubCategories, newSubCategory, setNewSubCategory)}>
                          + Add
                        </Button>
                      </div>
                      <div className="settings__dropdown-tags">
                        {subCategories.map((item) => (
                          <span key={item} className="settings__dropdown-tag">
                            {item}
                            <button className="settings__dropdown-tag-remove" onClick={() => removeItem(subCategories, setSubCategories, item)}>×</button>
                          </span>
                        ))}
                        {subCategories.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    {/* Series Years */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">Series Years</h3>
                      <div className="settings__dropdown-add">
                        <input
                          type="text"
                          className="settings__form-input"
                          placeholder="Add new series year..."
                          value={newAoYear}
                          onChange={(e) => setNewAoYear(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(aoYears, setAoYears, newAoYear, setNewAoYear))}
                        />
                        <Button variant="secondary" size="sm" onClick={() => addItem(aoYears, setAoYears, newAoYear, setNewAoYear)}>
                          + Add
                        </Button>
                      </div>
                      <div className="settings__dropdown-tags">
                        {aoYears.map((item) => (
                          <span key={item} className="settings__dropdown-tag">
                            {item}
                            <button className="settings__dropdown-tag-remove" onClick={() => removeItem(aoYears, setAoYears, item)}>×</button>
                          </span>
                        ))}
                        {aoYears.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    {/* Reasons for Separation */}
                    <div className="settings__dropdown-section">
                      <h3 className="settings__dropdown-title">Reasons for Separation</h3>
                      <div className="settings__dropdown-add">
                        <input
                          type="text"
                          className="settings__form-input"
                          placeholder="Add new reason..."
                          value={newReasonForSeparation}
                          onChange={(e) => setNewReasonForSeparation(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addItem(reasonsForSeparation, setReasonsForSeparation, newReasonForSeparation, setNewReasonForSeparation))}
                        />
                        <Button variant="secondary" size="sm" onClick={() => addItem(reasonsForSeparation, setReasonsForSeparation, newReasonForSeparation, setNewReasonForSeparation)}>
                          + Add
                        </Button>
                      </div>
                      <div className="settings__dropdown-tags">
                        {reasonsForSeparation.map((item) => (
                          <span key={item} className="settings__dropdown-tag">
                            {item}
                            <button className="settings__dropdown-tag-remove" onClick={() => removeItem(reasonsForSeparation, setReasonsForSeparation, item)}>×</button>
                          </span>
                        ))}
                        {reasonsForSeparation.length === 0 && <span className="settings__dropdown-empty">No options yet</span>}
                      </div>
                    </div>

                    <div className="settings__form-actions">
                      <Button variant="primary" onClick={handleSaveDropdowns} disabled={isSavingDropdowns}>
                        {isSavingDropdowns ? 'Saving...' : 'Save Dropdown Options'}
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Bulk Profile Picture Upload */}
                <Card>

                  <div className="settings__card-header">
                    <h2 className="settings__card-title">Bulk Profile Picture Upload</h2>
                    <p className="settings__card-description">
                      Upload JPG or PNG image files directly. Name each image after the employee ID (e.g. EMP001.jpg). ZIP and RAR archives are not allowed.
                    </p>
                  </div>
                  <div className="settings__form">
                    <input
                      ref={bulkImageRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleBulkImagesUpload}
                    />
                    <Button
                      variant="primary"
                      onClick={handleBulkImagesClick}
                      disabled={bulkUploading}
                    >
                      {bulkUploading ? 'Uploading Photos...' : 'Upload Photos'}
                    </Button>

                    {bulkResults && (
                      <div style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
                        {bulkResults.matched.length > 0 && (
                          <div style={{ marginBottom: '0.75rem' }}>
                            <p style={{ fontWeight: 600, color: 'var(--color-success, #38a169)', marginBottom: '0.25rem' }}>
                              {'Matched & Uploaded (' + bulkResults.matched.length + ')'}
                            </p>
                            <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)' }}>
                              {bulkResults.matched.map(n => <li key={n}>{n}</li>)}
                            </ul>
                          </div>
                        )}
                        {bulkResults.unmatched.length > 0 && (
                          <div style={{ marginBottom: '0.75rem' }}>
                            <p style={{ fontWeight: 600, color: 'var(--color-warning, #d69e2e)', marginBottom: '0.25rem' }}>
                              {'No Matching Employee (' + bulkResults.unmatched.length + ')'}
                            </p>
                            <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)' }}>
                              {bulkResults.unmatched.map(n => <li key={n}>{n}</li>)}
                            </ul>
                          </div>
                        )}
                        {bulkResults.failed.length > 0 && (
                          <div>
                            <p style={{ fontWeight: 600, color: 'var(--color-danger, #e53e3e)', marginBottom: '0.25rem' }}>
                              {'Upload Failed (' + bulkResults.failed.length + ')'}
                            </p>
                            <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)' }}>
                              {bulkResults.failed.map(n => <li key={n}>{n}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
                </>
              )}

            </div>
          )}
        </div>
      </div>

      {/* Password Confirmation Modal */}
      <PasswordConfirmModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onConfirm={handleConfirmSaveProfile}
        title="Confirm Profile Changes"
        message="Profile changes require Super Admin authorization. Please enter Super Admin credentials to continue."
        currentUserId={currentUser?.id || ''}
      />
    </div>
  );
}

export default Settings;
