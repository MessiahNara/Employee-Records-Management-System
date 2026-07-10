import { useState, useCallback } from 'react';
import Button from './ui/Button';
import EmployeeSelectionModal from './EmployeeSelectionModal';
import { Employee } from '../types/employee';
import { generateBackup } from '../utils/backupUtils';
import './BackupButton.css';

interface BackupButtonProps {
  employees: Employee[];
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

function BackupButton({ employees, variant = 'secondary', size = 'md' }: BackupButtonProps) {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);

  const handleOpenModal = () => {
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
      const selectedEmployees = employees.filter((emp) =>
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
          disabled={isBackingUp || employees.length === 0}
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
        employees={employees}
        title="Select Employees for Backup"
        confirmButtonText="Create Backup"
        showDateFilter={true}
      />
    </>
  );
}

export default BackupButton;
