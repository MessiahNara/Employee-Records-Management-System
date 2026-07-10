import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Table, { Column } from '../components/ui/Table';
import SearchBar from '../components/ui/SearchBar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import PermissionBanner from '../components/PermissionBanner';
import ImportModal from '../components/ImportModal';
import ExportButton from '../components/ExportButton';
import BackupButton from '../components/BackupButton';
import DownloadTemplateButton from '../components/DownloadTemplateButton';
import PasswordConfirmModal from '../components/ui/PasswordConfirmModal';
import BulkDownloadModal from '../components/BulkDownloadModal';
import { Employee, EmployeeFormData, AppointmentStatus, EmployeeStatus } from '../types/employee';
import { ImportedEmployee } from '../types/importExport';
import { generateImportTemplate } from '../utils/exportUtils';
import { getAuthState } from '../utils/mockAuth';
import { useToast } from '../contexts/ToastContext';
import { formatDateDDMMYYYY, convertToDateInputFormat } from '../utils/dateUtils';
import { MdEdit, MdDelete, MdFileUpload, MdPeople, MdCheckCircle, MdPause, MdDescription, MdStorage, MdQrCode, MdLock } from 'react-icons/md';
import api from '../services/api';
import { bulkDownloadCodes } from '../utils/bulkDownloadCodes';
import './Dashboard.css';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function Dashboard() {
  const navigate = useNavigate();
  const { showToast, showWelcomeToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilterType, setSearchFilterType] = useState<'all' | 'first_name' | 'middle_name' | 'last_name'>('all');
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState(false);
  const [isUpdateEmployeeModalOpen, setIsUpdateEmployeeModalOpen] = useState(false);
  const [isUpdateConfirmModalOpen, setIsUpdateConfirmModalOpen] = useState(false);
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportSyncConfirmModalOpen, setIsImportSyncConfirmModalOpen] = useState(false);
  const [isBulkDownloadModalOpen, setIsBulkDownloadModalOpen] = useState(false);
  const [isBulkDownloadLoading, setIsBulkDownloadLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [pendingUpdatePayload, setPendingUpdatePayload] = useState<{ employeeId: string; changedFields: any } | null>(null);
  const [pendingImportEmployees, setPendingImportEmployees] = useState<ImportedEmployee[] | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [originalEmployeeData, setOriginalEmployeeData] = useState<EmployeeFormData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]); // For KPI cards - always shows all data
  const [isLoading, setIsLoading] = useState(false);
  const [showAllEmployees, setShowAllEmployees] = useState(false);
  const [formData, setFormData] = useState<EmployeeFormData>({
    id: '',
    lastName: '',
    firstName: '',
    middleName: '',
    dateOfBirth: '',
    gender: '',
    officeHospitalName: '',
    appointmentStatus: '',
    appointmentFrom: '',
    appointmentTo: '',
    status: 'Active',
    positionFunction: '',
    dateOfEmployment: '',
    dateOfSeparation: '',
    reasonForSeparation: '',
    isDetailed: false,
    motherUnit: '',
    detailedTo: '',
    detailedDivision: '',
    detailedFunction: '',
    detailedDate: '',
    fileboxLocation: '',
    file201Status: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof EmployeeFormData, string>>>({});

  // Get current user permissions
  const currentUser = getAuthState();
  const userRole = currentUser?.role || '';

  // Dynamic dropdown options loaded from system settings
  const [dropdownOptions, setDropdownOptions] = useState<{
    appointmentStatuses: string[];
    officeNames: string[];
    positions: string[];
  }>({ appointmentStatuses: [], officeNames: [], positions: [] });

  useEffect(() => {
    api.systemSettings.get().then((s) => {
      setDropdownOptions({
        appointmentStatuses: s.appointmentStatuses ?? [],
        officeNames: s.officeNames ?? [],
        positions: s.positions ?? [],
      });
    }).catch(() => {});
  }, []);
  
  // For superadmin and admin, they have all permissions
  // For superadmin, they have all permissions
  // For admin and staff, use their individual permissions from the database
  const getCurrentUserPermissions = () => {
    if (userRole === 'superadmin' || userRole === 'developer') {
      return { create: true, read: true, update: true, delete: true };
    }
    
    // For admin and staff, get permissions from the logged-in user's data
    if ((userRole === 'admin' || userRole === 'staff') && currentUser?.permissions) {
      return currentUser.permissions;
    }
    
    // Default: read-only
    return { create: false, read: true, update: false, delete: false };
  };

  const userPermissions = getCurrentUserPermissions();
  const canCreate = userPermissions.create;
  const canUpdate = userPermissions.update;
  const canDelete = userPermissions.delete;
  const canRead = userPermissions.read;

  // Show welcome toast on first load after login
  useEffect(() => {
    const justLoggedIn = sessionStorage.getItem('justLoggedIn');
    if (justLoggedIn === 'true' && currentUser) {
      // Clear the flag
      sessionStorage.removeItem('justLoggedIn');
      
      // Show welcome toast
      showWelcomeToast(currentUser.firstName, currentUser.lastName);
    }
  }, [currentUser, showWelcomeToast]);

  // Persist showAllEmployees state to localStorage
  useEffect(() => {
    localStorage.setItem('showAllEmployees', showAllEmployees.toString());
  }, [showAllEmployees]);

  // Fetch all employees for KPI cards on initial load
  useEffect(() => {
    fetchAllEmployeesForKPI();
  }, []);

  // Fetch all employees for KPI cards (no filters)
  const fetchAllEmployeesForKPI = async () => {
    try {
      const data = await api.employee.getAll({}); // No filters - get all employees
      setAllEmployees(data);
    } catch (error) {
      console.error('Error fetching all employees for KPI:', error);
      // Don't show error toast for KPI fetch to avoid confusion
    }
  };

  // Debounced search effect
  useEffect(() => {
    // Only fetch if there's a search query OR showAllEmployees is true
    if (searchQuery.trim() || showAllEmployees) {
      const timeoutId = setTimeout(() => {
        fetchEmployees();
      }, 300); // 300ms debounce

      return () => clearTimeout(timeoutId);
    } else {
      // Clear employees when search is empty and not showing all
      setEmployees([]);
      setIsLoading(false);
    }
  }, [searchQuery, searchFilterType, statusFilter, showAllEmployees]);

  const fetchEmployees = async () => {
    try {
      setIsLoading(true);
      const filters: any = {};
      
      // Add status filter
      if (statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      
      // Add search filter
      if (searchQuery.trim()) {
        filters.search = searchQuery.trim();
        filters.filter_type = searchFilterType;
      }
      
      const data = await api.employee.getAll(filters);
      setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      showToast('Failed to load employees. Please check if the backend server is running.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter employees based on search and filters (now handled by backend)
  const filteredEmployees = useMemo(() => {
    // Since filtering is now done on the backend, just return employees
    // But keep position and office filtering on frontend for now
    return employees.filter((employee) => {
      if (searchQuery.trim()) {
        // Additional frontend filtering for position and office
        const matchesPosition = employee.positionFunction.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesOffice = employee.officeHospitalName.toLowerCase().includes(searchQuery.toLowerCase());
        
        // If searching globally, also check position and office
        if (searchFilterType === 'all' && (matchesPosition || matchesOffice)) {
          return true;
        }
      }
      
      return true;
    });
  }, [searchQuery, searchFilterType, employees]);

  // Paginate employees
  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredEmployees.slice(startIndex, endIndex);
  }, [filteredEmployees, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);

  // Get badge variant based on status
  const getStatusVariant = (status: EmployeeStatus) => {
    return status === 'Active' ? 'success' : 'danger';
  };

  // Checkbox selection handlers
  const handleSelectAll = () => {
    if (selectedEmployeeIds.size === filteredEmployees.length) {
      // Deselect all
      setSelectedEmployeeIds(new Set());
    } else {
      // Select all employees across all pages
      const allIds = new Set(filteredEmployees.map(emp => emp.id));
      setSelectedEmployeeIds(allIds);
    }
  };

  const handleSelectEmployee = (employeeId: string) => {
    const newSelected = new Set(selectedEmployeeIds);
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId);
    } else {
      newSelected.add(employeeId);
    }
    setSelectedEmployeeIds(newSelected);
  };

  const isAllSelected = filteredEmployees.length > 0 && selectedEmployeeIds.size === filteredEmployees.length;
  const isSomeSelected = selectedEmployeeIds.size > 0 && selectedEmployeeIds.size < filteredEmployees.length;

  // Get selected employees info for bulk delete
  const selectedEmployees = employees.filter(emp => selectedEmployeeIds.has(emp.id));

  // Table columns
  const columns: Column<Employee>[] = [
    {
      key: 'checkbox',
      header: (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={isAllSelected}
            ref={(input) => {
              if (input) {
                input.indeterminate = isSomeSelected;
              }
            }}
            onChange={handleSelectAll}
            className="dashboard__checkbox"
            aria-label="Select all employees"
          />
        </div>
      ),
      width: '5%',
      render: (employee) => (
        <div 
          className="dashboard__checkbox-cell"
          onClick={(e) => {
            e.stopPropagation();
            handleSelectEmployee(employee.id);
          }}
        >
          <input
            type="checkbox"
            checked={selectedEmployeeIds.has(employee.id)}
            onChange={() => {}}
            className="dashboard__checkbox"
            aria-label={`Select ${employee.lastName}, ${employee.firstName}`}
          />
        </div>
      ),
    },
    {
      key: 'lastName',
      header: 'Last Name',
      render: (employee) => employee.lastName,
    },
    {
      key: 'firstName',
      header: 'First Name',
      render: (employee) => employee.firstName,
    },
    {
      key: 'middleName',
      header: 'Middle Name',
      render: (employee) => (
        <span className="dashboard__middle-name">
          {employee.middleName || '—'}
        </span>
      ),
    },
    {
      key: 'dateOfBirth',
      header: 'Date of Birth',
      render: (employee) => formatDateDDMMYYYY(employee.dateOfBirth),
    },
    {
      key: 'positionFunction',
      header: 'Position',
      render: (employee) => employee.positionFunction,
    },
    {
      key: 'status',
      header: 'Status',
      width: '80px',
      render: (employee) => (
        <Badge variant={getStatusVariant(employee.status)} size="sm">
          {employee.status}
        </Badge>
      ),
    },
    {
      key: 'appointmentStatus',
      header: 'Appointment',
      render: (employee) => employee.appointmentStatus,
    },
    {
      key: 'dateOfEmployment',
      header: 'Date Employed',
      render: (employee) => formatDateDDMMYYYY(employee.dateOfEmployment),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '170px',
      render: (employee) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          {canUpdate && (
            <Button
              variant="success"
              size="sm"
              style={{ minWidth: '80px' }}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenUpdateEmployeeModal(employee);
              }}
            >
              <MdEdit /> Update
            </Button>
          )}
          {canDelete && (
            <Button
              variant="danger"
              size="sm"
              style={{ minWidth: '80px' }}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenDeleteConfirmModal(employee);
              }}
            >
              <MdDelete /> Delete
            </Button>
          )}
          {!canUpdate && !canDelete && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>—</span>
          )}
        </div>
      ),
    },
  ];

  const handleRowClick = (employee: Employee) => {
    navigate(`/employees/${employee.id}`);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (size: number) => {
    setItemsPerPage(size);
    setCurrentPage(1);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleOpenAddEmployeeModal = () => {
    setIsAddEmployeeModalOpen(true);
    setFormData({
      id: '',
      lastName: '',
      firstName: '',
      middleName: '',
      dateOfBirth: '',
      gender: '',
      officeHospitalName: '',
      appointmentStatus: '',
      appointmentFrom: '',
      appointmentTo: '',
      status: 'Active',
      positionFunction: '',
      dateOfEmployment: '',
      dateOfSeparation: '',
      reasonForSeparation: '',
      isDetailed: false,
      motherUnit: '',
      detailedTo: '',
      detailedDivision: '',
      detailedFunction: '',
      detailedDate: '',
      fileboxLocation: '',
      file201Status: '',
    });
    setFormErrors({});
  };

  const handleCloseAddEmployeeModal = useCallback(() => {
    setIsAddEmployeeModalOpen(false);
  }, []);

  const handleOpenUpdateEmployeeModal = (employee: Employee) => {
    setSelectedEmployee(employee);
    const employeeFormData: EmployeeFormData = {
      id: employee.id,
      lastName: employee.lastName,
      firstName: employee.firstName,
      middleName: employee.middleName,
      dateOfBirth: convertToDateInputFormat(employee.dateOfBirth),
      gender: employee.gender,
      officeHospitalName: employee.officeHospitalName,
      appointmentStatus: employee.appointmentStatus,
      appointmentFrom: convertToDateInputFormat(employee.appointmentFrom),
      appointmentTo: convertToDateInputFormat(employee.appointmentTo),
      status: employee.status,
      positionFunction: employee.positionFunction,
      dateOfEmployment: convertToDateInputFormat(employee.dateOfEmployment),
      dateOfSeparation: convertToDateInputFormat(employee.dateOfSeparation),
      reasonForSeparation: employee.reasonForSeparation || '',
      isDetailed: employee.isDetailed ?? false,
      motherUnit: (employee as any).motherUnit || '',
      detailedTo: (employee as any).detailedTo || '',
      detailedDivision: (employee as any).detailedDivision || '',
      detailedFunction: (employee as any).detailedFunction || '',
      detailedDate: convertToDateInputFormat((employee as any).detailedDate),
      fileboxLocation: (employee as any).fileboxLocation || '',
      file201Status: (employee as any).file201Status || '',
    };
    setFormData(employeeFormData);
    setOriginalEmployeeData(employeeFormData); // Store original data for comparison
    setFormErrors({});
    setIsUpdateEmployeeModalOpen(true);
  };

  const handleCloseUpdateEmployeeModal = useCallback(() => {
    setIsUpdateEmployeeModalOpen(false);
    setSelectedEmployee(null);
    setOriginalEmployeeData(null);
  }, []);

  const handleCloseBulkDownloadModal = useCallback(() => {
    setIsBulkDownloadModalOpen(false);
  }, []);

  const handleFormChange = (field: keyof EmployeeFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (isUpdate: boolean = false): boolean => {
    const errors: Partial<Record<keyof EmployeeFormData, string>> = {};

    // For updates, only validate fields that are being changed
    if (isUpdate) {
      // Only validate non-empty fields
      if (formData.lastName.trim() === '') errors.lastName = 'Last name cannot be empty';
      if (formData.firstName.trim() === '') errors.firstName = 'First name cannot be empty';
      if (formData.officeHospitalName.trim() === '') errors.officeHospitalName = 'Office/Hospital name cannot be empty';
      if (formData.positionFunction.trim() === '') errors.positionFunction = 'Position/Function cannot be empty';
      
      // Validate status-dependent fields
      if (formData.status === 'Inactive') {
        if (!formData.dateOfSeparation) errors.dateOfSeparation = 'Date of separation is required for inactive employees';
        if (!formData.reasonForSeparation.trim()) errors.reasonForSeparation = 'Reason for separation is required for inactive employees';
      }
    } else {
      // For create, all required fields must be filled
      if (!formData.id.trim()) errors.id = 'Employee ID is required';
      if (!formData.lastName.trim()) errors.lastName = 'Last name is required';
      if (!formData.firstName.trim()) errors.firstName = 'First name is required';
      if (!formData.gender) errors.gender = 'Gender is required';
      if (!formData.officeHospitalName.trim()) errors.officeHospitalName = 'Office/Hospital name is required';
      if (!formData.appointmentStatus) errors.appointmentStatus = 'Appointment status is required';
      if (!formData.positionFunction.trim()) errors.positionFunction = 'Position/Function is required';
      if (formData.appointmentFrom && formData.appointmentTo && formData.appointmentTo < formData.appointmentFrom) {
        errors.appointmentTo = 'Appointment to must be on or after appointment from';
      }

      if (formData.status === 'Inactive') {
        if (!formData.dateOfSeparation) errors.dateOfSeparation = 'Date of separation is required';
        if (!formData.reasonForSeparation.trim()) errors.reasonForSeparation = 'Reason for separation is required';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEmployee = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      const employeeData = {
        id: formData.id,
        lastName: formData.lastName,
        firstName: formData.firstName,
        middleName: formData.middleName || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        gender: formData.gender,
        officeName: formData.officeHospitalName,
        appointmentStatus: formData.appointmentStatus,
        appointmentFrom: formData.appointmentFrom || undefined,
        appointmentTo: formData.appointmentTo || undefined,
        status: formData.status,
        position: formData.positionFunction,
        dateOfEmployment: formData.dateOfEmployment,
        dateOfSeparation: formData.dateOfSeparation || undefined,
        reasonOfSeparation: formData.reasonForSeparation || undefined,
        isDetailed: formData.isDetailed,
        motherUnit: formData.isDetailed ? formData.motherUnit || undefined : undefined,
        detailedTo: formData.isDetailed ? formData.detailedTo || undefined : undefined,
        detailedDivision: formData.isDetailed ? formData.detailedDivision || undefined : undefined,
        detailedFunction: formData.isDetailed ? formData.detailedFunction || undefined : undefined,
        detailedDate: formData.isDetailed ? formData.detailedDate || undefined : undefined,
        fileboxLocation: formData.fileboxLocation || undefined,
      };

      // Pass user info for audit logging
      await api.employee.create(
        employeeData,
        currentUser?.id,
        `${currentUser?.lastName}, ${currentUser?.firstName}`
      );
      
      showToast('Employee added successfully!', 'success');
      handleCloseAddEmployeeModal();
      fetchEmployees();
      fetchAllEmployeesForKPI(); // Refresh KPI data
    } catch (error) {
      console.error('Error saving employee:', error);
      showToast('Failed to save employee. Please try again.', 'error');
    }
  };

  const handleUpdateEmployee = async () => {
    if (!validateForm(true) || !selectedEmployee || !originalEmployeeData) {
      return;
    }

    try {
      // Detect changed fields by comparing with original data
      const changedFields: any = {};
      const fieldMapping: Record<keyof EmployeeFormData, string> = {
        id: 'id',
        lastName: 'lastName',
        firstName: 'firstName',
        middleName: 'middleName',
        dateOfBirth: 'dateOfBirth',
        gender: 'gender',
        officeHospitalName: 'officeName',
        appointmentStatus: 'appointmentStatus',
        appointmentFrom: 'appointmentFrom',
        appointmentTo: 'appointmentTo',
        status: 'status',
        positionFunction: 'position',
        dateOfEmployment: 'dateOfEmployment',
        dateOfSeparation: 'dateOfSeparation',
        reasonForSeparation: 'reasonOfSeparation',
        isDetailed: 'isDetailed',
        motherUnit: 'motherUnit',
        detailedTo: 'detailedTo',
        detailedDivision: 'detailedDivision',
        detailedFunction: 'detailedFunction',
        detailedDate: 'detailedDate',
        fileboxLocation: 'fileboxLocation',
        file201Status: 'file201Status',
      };

      // Compare each field with original data
      (Object.keys(formData) as Array<keyof EmployeeFormData>).forEach((key) => {
        const currentValue = formData[key];
        const originalValue = originalEmployeeData[key];
        
        // Check if value has changed
        if (currentValue !== originalValue) {
          const backendField = fieldMapping[key];
          const fromValue = originalValue === '' || originalValue === undefined ? undefined : originalValue;
          const toValue = currentValue === '' || currentValue === undefined ? undefined : currentValue;
          changedFields[backendField] = { from: fromValue, to: toValue };
        }
      });

      // Check if any fields were changed
      if (Object.keys(changedFields).length === 0) {
        showToast('No changes detected. Please modify at least one field to update.', 'info');
        return;
      }

      setPendingUpdatePayload({ employeeId: selectedEmployee.id, changedFields });

      // All roles — submit to approval queue, no direct execution
      try {
        const empName = `${selectedEmployee.lastName}, ${selectedEmployee.firstName}`;
        await api.approvals.submit({
          requestedBy: currentUser?.id || '',
          requestedByName: `${currentUser?.lastName}, ${currentUser?.firstName}`,
          action: 'update_employee',
          entityType: 'employee',
          entityId: selectedEmployee.id,
          entityName: empName,
          payload: changedFields,
        });
        handleCloseUpdateEmployeeModal();
        showToast('✅ Update request submitted. Go to Approvals to review and execute.', 'info');
      } catch (err: any) {
        showToast(err.message || 'Failed to submit approval request.', 'error');
      }
    } catch (error) {
      console.error('Error updating employee:', error);
      showToast('Failed to update employee. Please try again.', 'error');
    }
  };

  const handleCloseUpdateConfirmModal = () => {
    setIsUpdateConfirmModalOpen(false);
    setPendingUpdatePayload(null);
  };

  const handleConfirmUpdateEmployee = async (authorizingUser: any) => {
    if (!pendingUpdatePayload) {
      return;
    }

    try {
      await api.employee.partialUpdate(
        pendingUpdatePayload.employeeId,
        pendingUpdatePayload.changedFields,
        currentUser?.id,
        `${currentUser?.lastName}, ${currentUser?.firstName}`,
        authorizingUser?.approvalToken
      );

      showToast(
        `Employee updated successfully! (${Object.keys(pendingUpdatePayload.changedFields).length} field(s) changed). Authorized by: ${authorizingUser.lastName}, ${authorizingUser.firstName}`,
        'success'
      );
      handleCloseUpdateConfirmModal();
      handleCloseUpdateEmployeeModal();
      fetchEmployees();
      fetchAllEmployeesForKPI();
    } catch (error: any) {
      console.error('Error updating employee:', error);
      throw new Error(error.message || 'Failed to update employee');
    }
  };

  const handleOpenDeleteConfirmModal = async (employee: Employee) => {
    setSelectedEmployee(employee);
    const empName = `${employee.lastName}, ${employee.firstName}`;
    try {
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName}, ${currentUser?.firstName}`,
        action: 'delete_employee',
        entityType: 'employee',
        entityId: employee.id,
        entityName: empName,
        payload: { id: employee.id, employeeName: empName },
      });
      showToast('✅ Delete request submitted. Go to Approvals to review and execute.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit approval request.', 'error');
    }
  };

  const handleCloseDeleteConfirmModal = () => {
    setIsDeleteConfirmModalOpen(false);
    setSelectedEmployee(null);
  };

  const handleDeleteEmployee = async (authorizingUser: any) => {
    if (!selectedEmployee) return;

    try {
      // Proceed with deletion
      // Pass the current user's info for audit logging
      await api.employee.delete(
        selectedEmployee.id,
        currentUser?.id,
        `${currentUser?.lastName}, ${currentUser?.firstName}`,
        authorizingUser.id,
        `${authorizingUser.lastName}, ${authorizingUser.firstName}`,
        authorizingUser?.approvalToken
      );
      
      showToast(`Employee deleted successfully! Authorized by: ${authorizingUser.lastName}, ${authorizingUser.firstName}`, 'success');
      handleCloseDeleteConfirmModal();
      fetchEmployees();
      fetchAllEmployeesForKPI(); // Refresh KPI data
    } catch (error: any) {
      console.error('Error deleting employee:', error);
      throw new Error(error.message || 'Failed to delete employee');
    }
  };

  const handleOpenBulkDeleteModal = async () => {
    if (selectedEmployeeIds.size === 0) {
      showToast('Please select at least one employee to delete.', 'warning');
      return;
    }

    const idsArray = Array.from(selectedEmployeeIds);
    const empNames = allEmployees
      .filter(e => idsArray.includes(e.id))
      .map(e => ({ firstName: e.firstName, lastName: e.lastName }));

    try {
      await api.approvals.submit({
        requestedBy: currentUser?.id || '',
        requestedByName: `${currentUser?.lastName}, ${currentUser?.firstName}`,
        action: 'bulk_delete_employee',
        entityType: 'employee',
        entityId: 'bulk',
        entityName: `${idsArray.length} employees`,
        payload: { ids: idsArray, employeeNames: empNames },
      });
      showToast('✅ Bulk delete request submitted. Go to Approvals to review and execute.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to submit approval request.', 'error');
    }
  };

  const handleCloseBulkDeleteModal = () => {
    setIsBulkDeleteModalOpen(false);
  };

  const handleBulkDelete = async (authorizingUser: any) => {
    if (selectedEmployeeIds.size === 0) return;

    try {
      // Get employee names for audit log
      const employeeNames = selectedEmployees.map(emp => ({
        firstName: emp.firstName,
        lastName: emp.lastName
      }));

      // Perform bulk delete
      const idsArray = Array.from(selectedEmployeeIds);
      await api.employee.bulkDelete(
        idsArray,
        currentUser?.id,
        `${currentUser?.lastName}, ${currentUser?.firstName}`,
        employeeNames,
        authorizingUser.id,
        `${authorizingUser.lastName}, ${authorizingUser.firstName}`,
        authorizingUser?.approvalToken
      );
      
      showToast(`Successfully deleted ${idsArray.length} employee(s)! Authorized by: ${authorizingUser.lastName}, ${authorizingUser.firstName}`, 'success');
      
      // Clear selection and refresh
      setSelectedEmployeeIds(new Set());
      handleCloseBulkDeleteModal();
      fetchEmployees();
      fetchAllEmployeesForKPI(); // Refresh KPI data
    } catch (error: any) {
      console.error('Error deleting employees:', error);
      throw new Error(error.message || 'Failed to delete employees');
    }
  };

  const handleDownloadTemplate = (format: 'xlsx' | 'csv') => {
    generateImportTemplate(format);
  };

  const handleBulkDownload = async (employeeIds: string[], type: 'barcode' | 'qrcode') => {
    try {
      setIsBulkDownloadLoading(true);
      
      // Get selected employees
      const selectedEmployees = allEmployees.filter(emp => employeeIds.includes(emp.id));
      
      // Generate and download ZIP
      await bulkDownloadCodes(selectedEmployees, type);
      
      showToast(`Successfully downloaded ${type === 'barcode' ? 'barcode(s)' : 'QR code(s)'}!`, 'success');
      setIsBulkDownloadModalOpen(false);
    } catch (error: any) {
      console.error('Error downloading codes:', error);
      const errorMessage = error?.message || 'Failed to download codes. Please try again.';
      showToast(errorMessage, 'error');
    } finally {
      setIsBulkDownloadLoading(false);
    }
  };

  const runLegacyImport = async (importedEmployees: ImportedEmployee[]) => {
    try {
      const successfulEmployees: Array<{ firstName: string; lastName: string }> = [];
      let failCount = 0;
      const errors: string[] = [];
      const skippedDuplicates: string[] = [];

      // Get existing employee IDs for duplicate checking
      const existingIds = new Set(employees.map(emp => emp.id));

      // Import each employee via API (without user info to prevent individual audit logs)
      for (const emp of importedEmployees) {
        try {
          // Check if Employee ID is provided
          if (emp.id && emp.id.trim() !== '') {
            // If ID is provided, check for duplicates
            if (existingIds.has(emp.id)) {
              skippedDuplicates.push(`${emp.lastName}, ${emp.firstName} (ID: ${emp.id})`);
              failCount++;
              continue; // Skip this record
            }
          }

          await api.employee.create(
            {
              id: emp.id && emp.id.trim() !== '' ? emp.id : undefined, // Include ID if provided
              lastName: emp.lastName,
              firstName: emp.firstName,
              middleName: emp.middleName,
              dateOfBirth: emp.dateOfBirth || undefined,
              gender: emp.gender,
              officeName: emp.officeHospitalName, // Map to backend field
              position: emp.positionFunction, // Map to backend field
              appointmentStatus: emp.appointmentStatus,
              appointmentFrom: emp.appointmentFrom || undefined,
              appointmentTo: emp.appointmentTo || undefined,
              status: emp.status,
              dateOfEmployment: emp.dateOfEmployment || undefined,
              dateOfSeparation: emp.dateOfSeparation || null,
              reasonForSeparation: emp.reasonForSeparation || null,
            }
            // Don't pass userId and userName to prevent individual audit logs during import
          );
          
          // Track successful imports for audit log
          successfulEmployees.push({
            firstName: emp.firstName,
            lastName: emp.lastName,
          });
        } catch (err: any) {
          failCount++;
          const errorMsg = err.message || 'Unknown error';
          // Check if it's a duplicate ID error from backend
          if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
            errors.push(`${emp.lastName}, ${emp.firstName}: Duplicate Employee ID`);
          } else {
            errors.push(`${emp.lastName}, ${emp.firstName}: ${errorMsg}`);
          }
        }
      }

      // Create bulk import audit log if any employees were successfully imported
      if (successfulEmployees.length > 0) {
        try {
          await api.audit.createBulkImport(
            currentUser?.id || 'system',
            `${currentUser?.lastName}, ${currentUser?.firstName}`,
            successfulEmployees
          );
        } catch (auditError) {
          console.error('Failed to create bulk import audit log:', auditError);
        }
      }

      // Refresh employee list
      setShowAllEmployees(true);
      await fetchEmployees();
      await fetchAllEmployeesForKPI(); // Refresh KPI data

      // Show result message
      if (failCount === 0) {
        showToast(`Successfully imported ${successfulEmployees.length} employee(s)!`, 'success');
      } else {
        let message = `Import completed: ${successfulEmployees.length} succeeded, ${failCount} failed.`;
        
        // Add duplicate information if any
        if (skippedDuplicates.length > 0) {
          message += `\n\nSkipped duplicates (${skippedDuplicates.length}): ${skippedDuplicates.slice(0, 2).join(', ')}${skippedDuplicates.length > 2 ? ` and ${skippedDuplicates.length - 2} more` : ''}`;
        }
        
        // Add other errors if any
        const otherErrors = errors.filter(e => !e.includes('Duplicate'));
        if (otherErrors.length > 0) {
          const errorMsg = otherErrors.slice(0, 2).join(', ');
          const moreErrors = otherErrors.length > 2 ? ` and ${otherErrors.length - 2} more` : '';
          message += `\n\nOther errors: ${errorMsg}${moreErrors}`;
        }
        
        showToast(message, 'warning');
      }

      setIsImportModalOpen(false);
    } catch (err: any) {
      console.error('Import error:', err);
      showToast(`Failed to import employees: ${err.message}`, 'error');
    }
  };

  const handleConfirmImport = async (
    importedEmployees: ImportedEmployee[],
    options?: { syncWithBackend?: boolean }
  ) => {
    const shouldSync = options?.syncWithBackend !== false;

    if (!shouldSync) {
      await runLegacyImport(importedEmployees);
      return;
    }

    const missingIdRecord = importedEmployees.find((emp) => !emp.id || !emp.id.trim());
    if (missingIdRecord) {
      showToast(
        'Sync mode requires Employee ID on every row. Please complete missing IDs or disable sync mode.',
        'warning'
      );
      return;
    }

    setPendingImportEmployees(importedEmployees);
    setIsImportSyncConfirmModalOpen(true);
  };

  const handleConfirmImportSync = async (authorizingUser: any) => {
    if (!pendingImportEmployees || pendingImportEmployees.length === 0) {
      setIsImportSyncConfirmModalOpen(false);
      return;
    }

    try {
      const result = await api.employee.syncImport(
        pendingImportEmployees.map((emp) => ({
          id: emp.id,
          lastName: emp.lastName,
          firstName: emp.firstName,
          middleName: emp.middleName,
          dateOfBirth: emp.dateOfBirth || null,
          gender: emp.gender,
          officeHospitalName: emp.officeHospitalName,
          appointmentStatus: emp.appointmentStatus,
          appointmentFrom: emp.appointmentFrom || null,
          appointmentTo: emp.appointmentTo || null,
          status: emp.status,
          positionFunction: emp.positionFunction,
          dateOfEmployment: emp.dateOfEmployment || null,
          dateOfSeparation: emp.dateOfSeparation || null,
          reasonForSeparation: emp.reasonForSeparation || null,
        })),
        currentUser?.id,
        `${currentUser?.lastName || ''}, ${currentUser?.firstName || ''}`.trim(),
        authorizingUser?.id,
        `${authorizingUser?.lastName || ''}, ${authorizingUser?.firstName || ''}`.trim(),
        authorizingUser?.approvalToken
      );

      setShowAllEmployees(true);
      await fetchEmployees();
      await fetchAllEmployeesForKPI();

      showToast(
        `Sync complete: ${result.insertedCount} added, ${result.updatedCount} updated.`,
        'success'
      );

      setIsImportSyncConfirmModalOpen(false);
      setIsImportModalOpen(false);
      setPendingImportEmployees(null);
    } catch (error: any) {
      console.error('Sync import error:', error);
      showToast(error.message || 'Failed to sync imported employees', 'error');
    }
  };

  // Check if user has read permission
  if (!canRead) {
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
          You do not have permission to view employee records. 
          Please contact your administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div>
          <h1 className="dashboard__title">Employee Management</h1>
          <p className="dashboard__subtitle">
            Manage and track all employee records in the system ({allEmployees.length} employees)
          </p>
        </div>
        <div className="dashboard__header-actions">
          <DownloadTemplateButton onDownload={handleDownloadTemplate} variant="secondary" size="sm" />
          {canCreate && (
            <Button variant="secondary" size="sm" onClick={() => setIsImportModalOpen(true)}>
              <MdFileUpload /> Import
            </Button>
          )}
          <ExportButton employees={allEmployees} variant="secondary" size="sm" />
          <BackupButton employees={allEmployees} variant="secondary" size="sm" />
          <Button variant="secondary" size="sm" onClick={() => setIsBulkDownloadModalOpen(true)}>
            <MdQrCode /> Codes
          </Button>
          {canCreate && (
            <Button variant="primary" size="sm" onClick={handleOpenAddEmployeeModal}>
              + Add Employee
            </Button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="dashboard__kpi-grid">
        <Card hoverable>
          <div className="dashboard__kpi-card">
            <div className="dashboard__kpi-header">
              <MdPeople className="dashboard__kpi-icon" style={{ color: '#3b82f6' }} />
              <span className="dashboard__kpi-label">Total Employees</span>
            </div>
            <div className="dashboard__kpi-body">
              <div className="dashboard__kpi-value">{allEmployees.length}</div>
            </div>
          </div>
        </Card>

        <Card hoverable>
          <div className="dashboard__kpi-card">
            <div className="dashboard__kpi-header">
              <MdCheckCircle className="dashboard__kpi-icon" style={{ color: '#22c55e' }} />
              <span className="dashboard__kpi-label">Active Employees</span>
            </div>
            <div className="dashboard__kpi-body">
              <div className="dashboard__kpi-value">
                {allEmployees.filter(emp => emp.status === 'Active').length}
              </div>
            </div>
          </div>
        </Card>

        <Card hoverable>
          <div className="dashboard__kpi-card">
            <div className="dashboard__kpi-header">
              <MdPause className="dashboard__kpi-icon" style={{ color: '#f59e0b' }} />
              <span className="dashboard__kpi-label">Inactive Employees</span>
            </div>
            <div className="dashboard__kpi-body">
              <div className="dashboard__kpi-value">
                {allEmployees.filter(emp => emp.status === 'Inactive').length}
              </div>
            </div>
          </div>
        </Card>

        <Card hoverable>
          <div className="dashboard__kpi-card">
            <div className="dashboard__kpi-header">
              <MdDescription className="dashboard__kpi-icon" style={{ color: '#8b5cf6' }} />
              <span className="dashboard__kpi-label">Total Documents</span>
            </div>
            <div className="dashboard__kpi-body">
              <div className="dashboard__kpi-value">
                {allEmployees.reduce((sum, emp) => sum + ((emp as any).documents?.length || 0), 0)}
              </div>
            </div>
          </div>
        </Card>

        <Card hoverable>
          <div className="dashboard__kpi-card">
            <div className="dashboard__kpi-header">
              <MdStorage className="dashboard__kpi-icon" style={{ color: '#ec4899' }} />
              <span className="dashboard__kpi-label">Storage Used</span>
            </div>
            <div className="dashboard__kpi-body">
              <div className="dashboard__kpi-value">
                {(allEmployees.reduce((sum, emp) => {
                  const docs = (emp as any).documents || [];
                  return sum + docs.reduce((docSum: number, doc: any) => docSum + (doc.fileSize || 0), 0);
                }, 0) / (1024 * 1024)).toFixed(1)} MB
              </div>
            </div>
          </div>
        </Card>
      </div>

      <PermissionBanner />

      <Card>
        {/* Bulk Actions Bar */}
        {canDelete && selectedEmployeeIds.size > 0 && (
          <div className="dashboard__bulk-actions">
            <div className="dashboard__bulk-info">
              <span className="dashboard__bulk-count">{selectedEmployeeIds.size} selected</span>
              <button
                className="dashboard__bulk-clear"
                onClick={() => setSelectedEmployeeIds(new Set())}
              >
                Clear selection
              </button>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={handleOpenBulkDeleteModal}
            >
              <MdDelete style={{ marginRight: '0.25rem' }} /> Delete Selected ({selectedEmployeeIds.size})
            </Button>
          </div>
        )}

        <div className="dashboard__filters">
          <div className="dashboard__search-container">
            <SearchBar
              placeholder={`Search by ${searchFilterType === 'all' ? 'name' : searchFilterType.replace('_', ' ')}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={handleClearSearch}
              fullWidth
            />
            
            <div className="dashboard__search-filters">
              <label className="dashboard__radio-label">
                <input
                  type="radio"
                  name="searchFilter"
                  value="all"
                  checked={searchFilterType === 'all'}
                  onChange={(e) => setSearchFilterType(e.target.value as any)}
                  className="dashboard__radio-input"
                />
                <span className="dashboard__radio-text">All Fields</span>
              </label>
              
              <label className="dashboard__radio-label">
                <input
                  type="radio"
                  name="searchFilter"
                  value="last_name"
                  checked={searchFilterType === 'last_name'}
                  onChange={(e) => setSearchFilterType(e.target.value as any)}
                  className="dashboard__radio-input"
                />
                <span className="dashboard__radio-text">Last Name</span>
              </label>

              <label className="dashboard__radio-label">
                <input
                  type="radio"
                  name="searchFilter"
                  value="first_name"
                  checked={searchFilterType === 'first_name'}
                  onChange={(e) => setSearchFilterType(e.target.value as any)}
                  className="dashboard__radio-input"
                />
                <span className="dashboard__radio-text">First Name</span>
              </label>
              
              <label className="dashboard__radio-label">
                <input
                  type="radio"
                  name="searchFilter"
                  value="middle_name"
                  checked={searchFilterType === 'middle_name'}
                  onChange={(e) => setSearchFilterType(e.target.value as any)}
                  className="dashboard__radio-input"
                />
                <span className="dashboard__radio-text">Middle Name</span>
              </label>
              
              
              <div className="dashboard__status-filter">
                <label htmlFor="status-filter" className="dashboard__filter-label">
                  Status:
                </label>
                <select
                  id="status-filter"
                  className="dashboard__filter-select"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as EmployeeStatus | 'all');
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="dashboard__toggle-container">
                <label className="dashboard__toggle-label">
                  <input
                    type="checkbox"
                    checked={showAllEmployees}
                    onChange={(e) => setShowAllEmployees(e.target.checked)}
                    className="dashboard__toggle-input"
                  />
                  <span className="dashboard__toggle-text">Show All Employees</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Empty State - No Search */}
        {!searchQuery.trim() && !showAllEmployees && !isLoading && (
          <div className="dashboard__empty-state">
            <MdPeople className="dashboard__empty-icon" />
            <h3 className="dashboard__empty-title">Search employees to display results</h3>
            <p className="dashboard__empty-text">
              Use the search bar above to find employees by name, or toggle "Show All Employees" to view the complete list
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="dashboard__loading-state">
            <div className="dashboard__spinner"></div>
            <p className="dashboard__loading-text">Searching employees...</p>
          </div>
        )}

        {/* No Results State */}
        {!isLoading && (searchQuery.trim() || showAllEmployees) && filteredEmployees.length === 0 && (
          <div className="dashboard__empty-state">
            <MdPeople className="dashboard__empty-icon" />
            <h3 className="dashboard__empty-title">No employees found</h3>
            <p className="dashboard__empty-text">
              Try adjusting your search criteria or filters
            </p>
          </div>
        )}

        {/* Results Table */}
        {!isLoading && (searchQuery.trim() || showAllEmployees) && filteredEmployees.length > 0 && (
          <>
            <div className="dashboard__table-scroll">
              <Table
                columns={columns}
                data={paginatedEmployees}
                keyExtractor={(employee) => employee.id}
                onRowClick={handleRowClick}
                emptyMessage="No employees found"
              />
            </div>

            <div className="dashboard__pagination">
              <div className="dashboard__page-size">
                <span className="dashboard__page-size-label">Rows per page:</span>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    className={`dashboard__page-size-btn${itemsPerPage === size ? ' dashboard__page-size-btn--active' : ''}`}
                    onClick={() => handleItemsPerPageChange(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="dashboard__pagination-controls">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                  >
                    First
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="dashboard__pagination-info">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    Last
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddEmployeeModalOpen}
        onClose={handleCloseAddEmployeeModal}
        title="Add New Employee"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseAddEmployeeModal}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveEmployee}>
              Save Employee
            </Button>
          </>
        }
      >
        <div className="dashboard__employee-form">
          <Input
            id="employee-id"
            label="Employee ID *"
            placeholder="Enter employee ID (e.g., EMP-001)"
            value={formData.id}
            onChange={(e) => handleFormChange('id', e.target.value)}
            error={formErrors.id}
            fullWidth
          />

          <div className="dashboard__form-row">
            <Input
              id="last-name"
              label="Last Name"
              placeholder="Enter last name"
              value={formData.lastName}
              onChange={(e) => handleFormChange('lastName', e.target.value)}
              error={formErrors.lastName}
              fullWidth
            />
            <Input
              id="first-name"
              label="First Name"
              placeholder="Enter first name"
              value={formData.firstName}
              onChange={(e) => handleFormChange('firstName', e.target.value)}
              error={formErrors.firstName}
              fullWidth
            />
          </div>

          <Input
            id="middle-name"
            label="Middle Name"
            placeholder="Enter middle name (optional)"
            value={formData.middleName}
            onChange={(e) => handleFormChange('middleName', e.target.value)}
            fullWidth
          />

          <Input
            id="date-of-birth"
            label="Date of Birth"
            type="date"
            placeholder="Select date of birth (optional)"
            value={formData.dateOfBirth}
            onChange={(e) => handleFormChange('dateOfBirth', e.target.value)}
            fullWidth
          />

          <div className="dashboard__form-field">
            <label htmlFor="gender" className="dashboard__form-label">
              Gender <span className="dashboard__required">*</span>
            </label>
            <select
              id="gender"
              className="dashboard__form-select"
              value={formData.gender}
              onChange={(e) => handleFormChange('gender', e.target.value)}
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            {formErrors.gender && <span className="dashboard__error">{formErrors.gender}</span>}
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="office-hospital-name" className="dashboard__form-label">
              Office / Hospital Name <span className="dashboard__required">*</span>
            </label>
            {dropdownOptions.officeNames.length > 0 ? (
              <select
                id="office-hospital-name"
                className="dashboard__form-select"
                value={formData.officeHospitalName}
                onChange={(e) => handleFormChange('officeHospitalName', e.target.value)}
              >
                <option value="">Select office or hospital name</option>
                {dropdownOptions.officeNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : (
              <input
                id="office-hospital-name"
                className="dashboard__form-input"
                type="text"
                placeholder="Enter office or hospital name"
                value={formData.officeHospitalName}
                onChange={(e) => handleFormChange('officeHospitalName', e.target.value)}
              />
            )}
            {formErrors.officeHospitalName && <span className="dashboard__error">{formErrors.officeHospitalName}</span>}
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="appointmentStatus" className="dashboard__form-label">
              Appointment Status <span className="dashboard__required">*</span>
            </label>
            <select
              id="appointmentStatus"
              className="dashboard__form-select"
              value={formData.appointmentStatus}
              onChange={(e) => handleFormChange('appointmentStatus', e.target.value as AppointmentStatus)}
            >
              <option value="">Select appointment status</option>
              {dropdownOptions.appointmentStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {formErrors.appointmentStatus && <span className="dashboard__error">{formErrors.appointmentStatus}</span>}
          </div>

          {/* Detailed section — shown for all appointment statuses */}
          <div className="dashboard__form-field">
            <label className="dashboard__form-label">Detailed to Another Office?</label>
            <div className="dashboard__radio-group">
              <label className="dashboard__radio-label">
                <input
                  type="radio"
                  name="isDetailed"
                  value="no"
                  checked={!formData.isDetailed}
                  onChange={() => setFormData(prev => ({ ...prev, isDetailed: false, motherUnit: '', detailedTo: '', detailedDivision: '', detailedFunction: '', detailedDate: '' }))}
                />
                <span>No</span>
              </label>
              <label className="dashboard__radio-label">
                <input
                  type="radio"
                  name="isDetailed"
                  value="yes"
                  checked={formData.isDetailed}
                  onChange={() => setFormData(prev => ({ ...prev, isDetailed: true }))}
                />
                <span>Yes</span>
              </label>
            </div>
          </div>

          {formData.isDetailed && (
            <>
              <div className="dashboard__form-field">
                <label htmlFor="motherUnit" className="dashboard__form-label">
                  Mother Unit
                </label>
                {dropdownOptions.officeNames.length > 0 ? (
                  <select
                    id="motherUnit"
                    className="dashboard__form-select"
                    value={formData.motherUnit}
                    onChange={(e) => handleFormChange('motherUnit', e.target.value)}
                  >
                    <option value="">Select mother unit</option>
                    {dropdownOptions.officeNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="motherUnit"
                    className="dashboard__form-input"
                    type="text"
                    placeholder="Enter mother unit"
                    value={formData.motherUnit}
                    onChange={(e) => handleFormChange('motherUnit', e.target.value)}
                  />
                )}
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="detailedTo" className="dashboard__form-label">
                  Re-Assignment Office
                </label>
                {dropdownOptions.officeNames.length > 0 ? (
                  <select
                    id="detailedTo"
                    className="dashboard__form-select"
                    value={formData.detailedTo}
                    onChange={(e) => handleFormChange('detailedTo', e.target.value)}
                  >
                    <option value="">Select re-assignment office</option>
                    {dropdownOptions.officeNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="detailedTo"
                    className="dashboard__form-input"
                    type="text"
                    placeholder="Enter re-assignment office"
                    value={formData.detailedTo}
                    onChange={(e) => handleFormChange('detailedTo', e.target.value)}
                  />
                )}
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="detailedDivision" className="dashboard__form-label">
                  Division
                </label>
                <input
                  id="detailedDivision"
                  className="dashboard__form-input"
                  type="text"
                  placeholder="Enter division"
                  value={formData.detailedDivision}
                  onChange={(e) => handleFormChange('detailedDivision', e.target.value)}
                />
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="detailedFunction" className="dashboard__form-label">
                  Function / Designation
                </label>
                <input
                  id="detailedFunction"
                  className="dashboard__form-input"
                  type="text"
                  placeholder="Enter function or designation"
                  value={formData.detailedFunction}
                  onChange={(e) => handleFormChange('detailedFunction', e.target.value)}
                />
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="detailedDate" className="dashboard__form-label">
                  Date of Re-Assignment
                </label>
                <input
                  id="detailedDate"
                  className="dashboard__form-input"
                  type="date"
                  value={formData.detailedDate}
                  onChange={(e) => handleFormChange('detailedDate', e.target.value)}
                />
              </div>
            </>
          )}

          <div className="dashboard__form-field">
            <label htmlFor="status" className="dashboard__form-label">
              Status <span className="dashboard__required">*</span>
            </label>
            <select
              id="status"
              className="dashboard__form-select"
              value={formData.status}
              onChange={(e) => handleFormChange('status', e.target.value as EmployeeStatus)}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="position-function" className="dashboard__form-label">
              Position / Function <span className="dashboard__required">*</span>
            </label>
            {dropdownOptions.positions.length > 0 ? (
              <select
                id="position-function"
                className="dashboard__form-select"
                value={formData.positionFunction}
                onChange={(e) => handleFormChange('positionFunction', e.target.value)}
              >
                <option value="">Select position or function</option>
                {dropdownOptions.positions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <input
                id="position-function"
                className="dashboard__form-input"
                type="text"
                placeholder="Enter position or function"
                value={formData.positionFunction}
                onChange={(e) => handleFormChange('positionFunction', e.target.value)}
              />
            )}
            {formErrors.positionFunction && <span className="dashboard__error">{formErrors.positionFunction}</span>}
          </div>

          <Input
            id="date-of-employment"
            label="Date of Employment"
            type="date"
            value={formData.dateOfEmployment}
            onChange={(e) => handleFormChange('dateOfEmployment', e.target.value)}
            error={formErrors.dateOfEmployment}
            fullWidth
          />

          <Input
            id="filebox-location"
            label="201 File Location"
            type="text"
            placeholder="Enter 201 file location"
            value={formData.fileboxLocation}
            onChange={(e) => handleFormChange('fileboxLocation', e.target.value)}
            fullWidth
          />

          <div className="dashboard__form-row">
            <Input
              id="appointment-from"
              label="Appointment From"
              type="date"
              value={formData.appointmentFrom}
              onChange={(e) => handleFormChange('appointmentFrom', e.target.value)}
              error={formErrors.appointmentFrom}
              fullWidth
            />
            <Input
              id="appointment-to"
              label="Appointment To"
              type="date"
              value={formData.appointmentTo}
              onChange={(e) => handleFormChange('appointmentTo', e.target.value)}
              error={formErrors.appointmentTo}
              fullWidth
            />
          </div>

          {formData.status === 'Inactive' && (
            <>
              <Input
                id="date-of-separation"
                label="Date of Separation"
                type="date"
                value={formData.dateOfSeparation}
                onChange={(e) => handleFormChange('dateOfSeparation', e.target.value)}
                error={formErrors.dateOfSeparation}
                fullWidth
              />

              <div className="dashboard__form-field">
                <label htmlFor="reasonForSeparation" className="dashboard__form-label">
                  Reason for Separation <span className="dashboard__required">*</span>
                </label>
                <textarea
                  id="reasonForSeparation"
                  className="dashboard__form-textarea"
                  placeholder="Enter reason for separation"
                  value={formData.reasonForSeparation}
                  onChange={(e) => handleFormChange('reasonForSeparation', e.target.value)}
                  rows={3}
                />
                {formErrors.reasonForSeparation && (
                  <span className="dashboard__error">{formErrors.reasonForSeparation}</span>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Update Employee Modal */}
      <Modal
        isOpen={isUpdateEmployeeModalOpen}
        onClose={handleCloseUpdateEmployeeModal}
        title="Update Employee"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseUpdateEmployeeModal}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleUpdateEmployee}>
              Update Employee
            </Button>
          </>
        }
      >
        <div className="dashboard__employee-form">
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

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
              Current Employee ID
            </label>
            <div style={{ 
              padding: '0.75rem', 
              backgroundColor: 'var(--bg-secondary)', 
              borderRadius: 'var(--border-radius)',
              fontSize: '0.875rem',
              color: 'var(--text-secondary)',
              fontFamily: 'monospace'
            }}>
              {selectedEmployee?.id}
            </div>
          </div>

          <div className="dashboard__id-update-section" style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Update Employee ID (Optional)
            </h4>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              ⚠️ Changing the Employee ID will update all references including documents and audit logs. Use with caution.
            </p>
            
            <Input
              id="edit-employee-id"
              label="New Employee ID"
              placeholder="Enter new employee ID (e.g., EMP-002)"
              value={formData.id}
              onChange={(e) => handleFormChange('id', e.target.value)}
              fullWidth
            />
          </div>

          <div className="dashboard__form-row">
            <Input
              id="edit-last-name"
              label="Last Name"
              placeholder="Enter last name"
              value={formData.lastName}
              onChange={(e) => handleFormChange('lastName', e.target.value)}
              error={formErrors.lastName}
              fullWidth
            />
            <Input
              id="edit-first-name"
              label="First Name"
              placeholder="Enter first name"
              value={formData.firstName}
              onChange={(e) => handleFormChange('firstName', e.target.value)}
              error={formErrors.firstName}
              fullWidth
            />
          </div>

          <Input
            id="edit-middle-name"
            label="Middle Name"
            placeholder="Enter middle name (optional)"
            value={formData.middleName}
            onChange={(e) => handleFormChange('middleName', e.target.value)}
            fullWidth
          />

          <Input
            id="edit-date-of-birth"
            label="Date of Birth"
            type="date"
            placeholder="Select date of birth (optional)"
            value={formData.dateOfBirth}
            onChange={(e) => handleFormChange('dateOfBirth', e.target.value)}
            fullWidth
          />

          <div className="dashboard__form-field">
            <label htmlFor="update-gender" className="dashboard__form-label">
              Gender
            </label>
            <select
              id="update-gender"
              className="dashboard__form-select"
              value={formData.gender}
              onChange={(e) => handleFormChange('gender', e.target.value)}
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
            {formErrors.gender && <span className="dashboard__error">{formErrors.gender}</span>}
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="edit-office-hospital-name" className="dashboard__form-label">
              Office / Hospital Name
            </label>
            {dropdownOptions.officeNames.length > 0 ? (
              <select
                id="edit-office-hospital-name"
                className="dashboard__form-select"
                value={formData.officeHospitalName}
                onChange={(e) => handleFormChange('officeHospitalName', e.target.value)}
              >
                <option value="">Select office or hospital name</option>
                {dropdownOptions.officeNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : (
              <input
                id="edit-office-hospital-name"
                className="dashboard__form-input"
                type="text"
                placeholder="Enter office or hospital name"
                value={formData.officeHospitalName}
                onChange={(e) => handleFormChange('officeHospitalName', e.target.value)}
              />
            )}
            {formErrors.officeHospitalName && <span className="dashboard__error">{formErrors.officeHospitalName}</span>}
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="update-appointmentStatus" className="dashboard__form-label">
              Appointment Status
            </label>
            <select
              id="update-appointmentStatus"
              className="dashboard__form-select"
              value={formData.appointmentStatus}
              onChange={(e) => handleFormChange('appointmentStatus', e.target.value as AppointmentStatus)}
            >
              <option value="">Select appointment status</option>
              {dropdownOptions.appointmentStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {formErrors.appointmentStatus && <span className="dashboard__error">{formErrors.appointmentStatus}</span>}
          </div>

          {/* Detailed section — only shown when Permanent is selected */}
          {/* Detailed section — shown for all appointment statuses */}
          <div className="dashboard__form-field">
            <label className="dashboard__form-label">Detailed to Another Office?</label>
            <div className="dashboard__radio-group">
              <label className="dashboard__radio-label">
                <input
                  type="radio"
                  name="isDetailedUpdate"
                  value="no"
                  checked={!formData.isDetailed}
                  onChange={() => setFormData(prev => ({ ...prev, isDetailed: false, motherUnit: '', detailedTo: '', detailedDivision: '', detailedFunction: '', detailedDate: '' }))}
                />
                <span>No</span>
              </label>
              <label className="dashboard__radio-label">
                <input
                  type="radio"
                  name="isDetailedUpdate"
                  value="yes"
                  checked={formData.isDetailed}
                  onChange={() => setFormData(prev => ({ ...prev, isDetailed: true }))}
                />
                <span>Yes</span>
              </label>
            </div>
          </div>

          {formData.isDetailed && (
            <>
              <div className="dashboard__form-field">
                <label htmlFor="edit-motherUnit" className="dashboard__form-label">
                  Mother Unit
                </label>
                {dropdownOptions.officeNames.length > 0 ? (
                  <select
                    id="edit-motherUnit"
                    className="dashboard__form-select"
                    value={formData.motherUnit}
                    onChange={(e) => handleFormChange('motherUnit', e.target.value)}
                  >
                    <option value="">Select mother unit</option>
                    {dropdownOptions.officeNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="edit-motherUnit"
                    className="dashboard__form-input"
                    type="text"
                    placeholder="Enter mother unit"
                    value={formData.motherUnit}
                    onChange={(e) => handleFormChange('motherUnit', e.target.value)}
                  />
                )}
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="edit-detailedTo" className="dashboard__form-label">
                  Re-Assignment Office
                </label>
                {dropdownOptions.officeNames.length > 0 ? (
                  <select
                    id="edit-detailedTo"
                    className="dashboard__form-select"
                    value={formData.detailedTo}
                    onChange={(e) => handleFormChange('detailedTo', e.target.value)}
                  >
                    <option value="">Select re-assignment office</option>
                    {dropdownOptions.officeNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="edit-detailedTo"
                    className="dashboard__form-input"
                    type="text"
                    placeholder="Enter re-assignment office"
                    value={formData.detailedTo}
                    onChange={(e) => handleFormChange('detailedTo', e.target.value)}
                  />
                )}
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="edit-detailedDivision" className="dashboard__form-label">
                  Division
                </label>
                <input
                  id="edit-detailedDivision"
                  className="dashboard__form-input"
                  type="text"
                  placeholder="Enter division"
                  value={formData.detailedDivision}
                  onChange={(e) => handleFormChange('detailedDivision', e.target.value)}
                />
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="edit-detailedFunction" className="dashboard__form-label">
                  Function / Designation
                </label>
                <input
                  id="edit-detailedFunction"
                  className="dashboard__form-input"
                  type="text"
                  placeholder="Enter function or designation"
                  value={formData.detailedFunction}
                  onChange={(e) => handleFormChange('detailedFunction', e.target.value)}
                />
              </div>

              <div className="dashboard__form-field">
                <label htmlFor="edit-detailedDate" className="dashboard__form-label">
                  Date of Re-Assignment
                </label>
                <input
                  id="edit-detailedDate"
                  className="dashboard__form-input"
                  type="date"
                  value={formData.detailedDate}
                  onChange={(e) => handleFormChange('detailedDate', e.target.value)}
                />
              </div>
            </>
          )}

          <div className="dashboard__form-field">
            <label htmlFor="update-status" className="dashboard__form-label">
              Status
            </label>
            <select
              id="update-status"
              className="dashboard__form-select"
              value={formData.status}
              onChange={(e) => handleFormChange('status', e.target.value as EmployeeStatus)}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <div className="dashboard__form-field">
            <label htmlFor="edit-position-function" className="dashboard__form-label">
              Position / Function
            </label>
            {dropdownOptions.positions.length > 0 ? (
              <select
                id="edit-position-function"
                className="dashboard__form-select"
                value={formData.positionFunction}
                onChange={(e) => handleFormChange('positionFunction', e.target.value)}
              >
                <option value="">Select position or function</option>
                {dropdownOptions.positions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <input
                id="edit-position-function"
                className="dashboard__form-input"
                type="text"
                placeholder="Enter position or function"
                value={formData.positionFunction}
                onChange={(e) => handleFormChange('positionFunction', e.target.value)}
              />
            )}
            {formErrors.positionFunction && <span className="dashboard__error">{formErrors.positionFunction}</span>}
          </div>

          <Input
            id="edit-date-of-employment"
            label="Date of Employment"
            type="date"
            value={formData.dateOfEmployment}
            onChange={(e) => handleFormChange('dateOfEmployment', e.target.value)}
            error={formErrors.dateOfEmployment}
            fullWidth
          />

          <Input
            id="edit-filebox-location"
            label="201 File Location"
            type="text"
            placeholder="Enter 201 file location"
            value={formData.fileboxLocation}
            onChange={(e) => handleFormChange('fileboxLocation', e.target.value)}
            fullWidth
          />

          <Input
            id="edit-file201-status"
            label="201 File Status"
            type="text"
            placeholder="Enter 201 file status"
            value={formData.file201Status}
            onChange={(e) => handleFormChange('file201Status', e.target.value)}
            fullWidth
          />

          <div className="dashboard__form-row">
            <Input
              id="edit-appointment-from"
              label="Appointment From"
              type="date"
              value={formData.appointmentFrom}
              onChange={(e) => handleFormChange('appointmentFrom', e.target.value)}
              error={formErrors.appointmentFrom}
              fullWidth
            />
            <Input
              id="edit-appointment-to"
              label="Appointment To"
              type="date"
              value={formData.appointmentTo}
              onChange={(e) => handleFormChange('appointmentTo', e.target.value)}
              error={formErrors.appointmentTo}
              fullWidth
            />
          </div>

          {formData.status === 'Inactive' && (
            <>
              <Input
                id="edit-date-of-separation"
                label="Date of Separation"
                type="date"
                value={formData.dateOfSeparation}
                onChange={(e) => handleFormChange('dateOfSeparation', e.target.value)}
                error={formErrors.dateOfSeparation}
                fullWidth
              />

              <div className="dashboard__form-field">
                <label htmlFor="update-reasonForSeparation" className="dashboard__form-label">
                  Reason for Separation
                </label>
                <textarea
                  id="update-reasonForSeparation"
                  className="dashboard__form-textarea"
                  placeholder="Enter reason for separation"
                  value={formData.reasonForSeparation}
                  onChange={(e) => handleFormChange('reasonForSeparation', e.target.value)}
                  rows={3}
                />
                {formErrors.reasonForSeparation && (
                  <span className="dashboard__error">{formErrors.reasonForSeparation}</span>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onConfirmImport={handleConfirmImport}
      />

      <PasswordConfirmModal
        isOpen={isImportSyncConfirmModalOpen}
        onClose={() => {
          setIsImportSyncConfirmModalOpen(false);
          setPendingImportEmployees(null);
        }}
        onConfirm={handleConfirmImportSync}
        title="Sync Import - Super Admin Authorization Required"
        message={`This will sync backend data to the imported file and delete backend employees not in the file.\n\nRecords to sync: ${pendingImportEmployees?.length || 0}`}
        currentUserId={currentUser?.id}
      />

      {/* Password Confirmation Modal for Delete */}
      {/* Bulk Download Modal */}
      <BulkDownloadModal
        isOpen={isBulkDownloadModalOpen}
        onClose={handleCloseBulkDownloadModal}
        employees={allEmployees}
        onDownload={handleBulkDownload}
        isLoading={isBulkDownloadLoading}
      />
    </div>
  );
}

export default Dashboard;
