import { useState, useCallback, useEffect } from 'react';
import Button from './ui/Button';
import EmployeeSelectionModal from './EmployeeSelectionModal';
import { Employee } from '../types/employee';
import { generateBackup } from '../utils/backupUtils';
import api from '../services/api';
import './BackupButton.css';

interface BackupButtonProps {
  employees: Employee[];
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

function BackupButton({ employees, variant = 'secondary', size = 'md' }: BackupButtonProps) {
  const [activeEmployees, setActiveEmployees] = useState<Employee[]>(employees);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);

  useEffect(() => {
    if (employees && employees.length > 0) {
      setActiveEmployees(employees);
    }
  }, [employees]);

  const handleOpenModal = async () => {
    if (activeEmployees.length === 0) {
      setIsBackingUp(true);
      try {
        const data = await api.employee.getAll({});
        const fetched = Array.isArray(data) ? data : (data as any).data || [];
        setActiveEmployees(fetched);
      } catch (err) {
        console.error('Failed to load employees for backup:', err);
      } finally {
        setIsBackingUp(false);
      }
    }
    setShowSelectionModal(true);
  };

  const handleCloseModal = useCallback(() => {
    setShowSelectionModal(false);
  }, []);

  const handleConfirmBackup = async (selectedEmployeeIds: string[], fromDate?: string, toDate?: string) => {
    setShowSelectionModal(false);
    setIsBackingUp(true);
    setShowSuccess(false);

    try {
      // Filter employees by selected IDs
      const selectedEmployees = activeEmployees.filter((emp) =>
        selectedEmployeeIds.includes(emp.id)
      );

      await generateBackup(selectedEmployees, fromDate, toDate);

      // Show success message
      setIsBackingUp(false);
      setShowSuccess(true);

      // Hide success message after 3 seconds
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Backup failed:', error);
      setIsBackingUp(false);
      alert('Failed to create backup. Please try again.');
    }
  };

  return (
    <>
      <div className="backup-button">
        <Button
          variant={variant}
          size={size}
          onClick={handleOpenModal}
          disabled={isBackingUp}
        >
          {isBackingUp ? '⏳ Creating Backup...' : '💾 Backup'}
        </Button>

        {showSuccess && (
          <div className="backup-button__success">
            <span className="backup-button__success-icon">✓</span>
            Backup created successfully!
          </div>
        )}
      </div>

      <EmployeeSelectionModal
        isOpen={showSelectionModal}
        onClose={handleCloseModal}
        onConfirm={handleConfirmBackup}
        employees={activeEmployees}
        title="Select Employees for Backup"
        confirmButtonText="Create Backup"
        showDateFilter={true}
      />
    </>
  );
}

export default BackupButton;
