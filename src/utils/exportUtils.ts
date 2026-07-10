import * as XLSX from 'xlsx';
import { Employee } from '../types/employee';
import { ExportOptions, TemplateColumn } from '../types/importExport';

// Export utilities for employees and audit logs

/**
 * Export employees to Excel or CSV file
 * @param employees - Array of employees to export
 * @param options - Export options (format, filename, etc.)
 */
export function exportEmployeesToFile(employees: Employee[], options: ExportOptions): void {
  // Filter employees if needed
  let dataToExport = employees;
  if (options.includeInactive === false) {
    dataToExport = employees.filter((e) => e.status === 'Active');
  }

  // Map to export format
  const exportData = dataToExport.map((employee) => mapEmployeeToExportRow(employee));

  // Create workbook and worksheet
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');

  // Set column widths for better readability
  const columnWidths = [
    { wch: 15 }, // Employee ID
    { wch: 15 }, // Last Name
    { wch: 15 }, // First Name
    { wch: 15 }, // Middle Name
    { wch: 15 }, // Date of Birth
    { wch: 10 }, // Gender
    { wch: 25 }, // Office/Hospital Name
    { wch: 18 }, // Appointment Status
    { wch: 10 }, // Status
    { wch: 25 }, // Position/Function
    { wch: 18 }, // Date of Employment
    { wch: 18 }, // Date of Separation
    { wch: 30 }, // Reason for Separation
  ];
  worksheet['!cols'] = columnWidths;

  // Apply styling for XLSX format
  if (options.format === 'xlsx') {
    // Get the range of the worksheet
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    
    // Style header row (row 1)
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      const cell = worksheet[cellAddress];
      
      if (cell) {
        cell.s = {
          fill: {
            fgColor: { rgb: '4472C4' }, // Blue background
          },
          font: {
            bold: true,
            color: { rgb: 'FFFFFF' }, // White text
            sz: 12,
          },
          alignment: {
            horizontal: 'center',
            vertical: 'center',
            wrapText: true,
          },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
          },
        };
      }
    }

    // Style data rows with alternating colors
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const isEvenRow = (row - 1) % 2 === 0;
      const rowData = exportData[row - 1];
      const isActive = rowData?.Status === 'Active';
      
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[cellAddress];
        
        if (cell) {
          // Determine background color
          let bgColor = 'FFFFFF'; // White default
          if (isActive) {
            bgColor = isEvenRow ? 'E2EFDA' : 'F2F9F0'; // Light green shades for Active
          } else {
            bgColor = isEvenRow ? 'FFF2CC' : 'FFF9E6'; // Light orange shades for Inactive
          }
          
          cell.s = {
            fill: {
              fgColor: { rgb: bgColor },
            },
            font: {
              sz: 11,
            },
            alignment: {
              horizontal: 'left',
              vertical: 'center',
              wrapText: true,
            },
            border: {
              top: { style: 'thin', color: { rgb: 'D0D0D0' } },
              bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
              left: { style: 'thin', color: { rgb: 'D0D0D0' } },
              right: { style: 'thin', color: { rgb: 'D0D0D0' } },
            },
          };
        }
      }
    }

    // Set row heights
    const rowHeights = [{ hpt: 30 }]; // Header row
    for (let i = 1; i <= exportData.length; i++) {
      rowHeights.push({ hpt: 25 }); // Data rows
    }
    worksheet['!rows'] = rowHeights;

    // Freeze the header row
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  }

  // Trigger download
  const filename = `${options.filename}.${options.format}`;
  if (options.format === 'xlsx') {
    XLSX.writeFile(workbook, filename);
  } else if (options.format === 'csv') {
    XLSX.writeFile(workbook, filename, { bookType: 'csv' });
  }
}

/**
 * Generate and download an import template file
 * @param format - File format ('xlsx' or 'csv')
 */
export function generateImportTemplate(format: 'xlsx' | 'csv' = 'xlsx'): void {
  const templateColumns: TemplateColumn[] = [
    { header: 'Employee ID', field: 'id', required: true, example: 'EMP-001' },
    { header: 'Last Name', field: 'lastName', required: true, example: 'Santos' },
    { header: 'First Name', field: 'firstName', required: true, example: 'Maria' },
    { header: 'Middle Name', field: 'middleName', required: false, example: 'Cruz' },
    { header: 'Date of Birth', field: 'dateOfBirth', required: true, example: '21/05/2000' },
    { header: 'Gender', field: 'gender', required: false, example: 'Female' },
    { header: 'Office / Hospital Name', field: 'officeHospitalName', required: true, example: 'City General Hospital' },
    { header: 'Appointment Status', field: 'appointmentStatus', required: true, example: 'Permanent' },
    { header: 'Status', field: 'status', required: true, example: 'Active' },
    { header: 'Position / Function', field: 'positionFunction', required: false, example: 'Senior Nurse' },
  ];

  // Create template data with headers and TWO example rows (Active and Inactive)
  const activeExample = templateColumns.reduce((obj, col) => {
    obj[col.header] = col.example || '';
    return obj;
  }, {} as Record<string, string>);

  const inactiveExample = {
    'Employee ID': 'EMP-002',
    'Last Name': 'Reyes',
    'First Name': 'Juan',
    'Middle Name': '',
    'Date of Birth': '15/08/1995',
    'Gender': 'Male',
    'Office / Hospital Name': 'Main Office Building',
    'Appointment Status': 'Casual',
    'Status': 'Inactive',
    'Position / Function': 'Administrative Assistant',
  };

  const templateData = [activeExample, inactiveExample];

  // Create workbook
  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Employee Template');

  // Set column widths for better readability
  const columnWidths = templateColumns.map((col) => ({
    wch: Math.max(col.header.length + 5, 18),
  }));
  worksheet['!cols'] = columnWidths;

  // Only apply styling for XLSX format (not CSV)
  if (format === 'xlsx') {
    // Get the range of the worksheet
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    
    // Style header row (row 1)
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      const cell = worksheet[cellAddress];
      
      if (cell) {
        cell.s = {
          fill: {
            fgColor: { rgb: '4472C4' }, // Blue background
          },
          font: {
            bold: true,
            color: { rgb: 'FFFFFF' }, // White text
            sz: 12,
          },
          alignment: {
            horizontal: 'center',
            vertical: 'center',
            wrapText: true,
          },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
          },
        };
      }
    }

    // Style Active employee row (row 2) - Light green
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 1, c: col });
      const cell = worksheet[cellAddress];
      
      if (cell) {
        cell.s = {
          fill: {
            fgColor: { rgb: 'E2EFDA' }, // Light green background
          },
          font: {
            sz: 11,
          },
          alignment: {
            horizontal: 'left',
            vertical: 'center',
            wrapText: true,
          },
          border: {
            top: { style: 'thin', color: { rgb: 'D0D0D0' } },
            bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
            left: { style: 'thin', color: { rgb: 'D0D0D0' } },
            right: { style: 'thin', color: { rgb: 'D0D0D0' } },
          },
        };
      }
    }

    // Style Inactive employee row (row 3) - Light orange
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col });
      const cell = worksheet[cellAddress];
      
      if (cell) {
        cell.s = {
          fill: {
            fgColor: { rgb: 'FFF2CC' }, // Light orange background
          },
          font: {
            sz: 11,
          },
          alignment: {
            horizontal: 'left',
            vertical: 'center',
            wrapText: true,
          },
          border: {
            top: { style: 'thin', color: { rgb: 'D0D0D0' } },
            bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
            left: { style: 'thin', color: { rgb: 'D0D0D0' } },
            right: { style: 'thin', color: { rgb: 'D0D0D0' } },
          },
        };
      }
    }

    // Set row heights
    worksheet['!rows'] = [
      { hpt: 30 }, // Header row height
      { hpt: 25 }, // Active example row height
      { hpt: 25 }, // Inactive example row height
    ];

    // Freeze the header row
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  }

  // Trigger download with appropriate format
  const filename = `employee-import-template.${format}`;
  if (format === 'csv') {
    XLSX.writeFile(workbook, filename, { bookType: 'csv' });
  } else {
    XLSX.writeFile(workbook, filename);
  }
}

/**
 * Format date to DD/MM/YYYY format
 * @param dateString - ISO date string
 * @returns Formatted date string in DD/MM/YYYY format
 */
function formatDateForExport(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    // Format as DD/MM/YYYY
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
}

/**
 * Map an Employee object to export row format
 * @param employee - Employee to map
 * @returns Object with column headers as keys
 */
export function mapEmployeeToExportRow(employee: Employee): Record<string, string> {
  return {
    'Employee ID': employee.id, // First column
    'Last Name': employee.lastName,
    'First Name': employee.firstName,
    'Middle Name': employee.middleName,
    'Date of Birth': formatDateForExport(employee.dateOfBirth),
    Gender: employee.gender,
    'Office/Hospital Name': employee.officeHospitalName,
    'Appointment Status': employee.appointmentStatus,
    'Appointment From': formatDateForExport(employee.appointmentFrom),
    'Appointment To': formatDateForExport(employee.appointmentTo),
    Status: employee.status,
    'Position/Function': employee.positionFunction,
    'Date of Employment': formatDateForExport(employee.dateOfEmployment),
    'Date of Separation': formatDateForExport(employee.dateOfSeparation),
    'Reason for Separation': employee.reasonForSeparation || '',
  };
}

/**
 * Export audit logs to Excel or CSV file
 * @param logs - Array of audit logs to export
 * @param options - Export options (format, filename)
 */
export function exportAuditLogsToFile(
  logs: any[],
  options: { format: 'xlsx' | 'csv'; filename: string }
): void {
  // Map audit logs to export format
  const exportData = logs.map((log) => {
    let description = log.description;
    
    // If log has employee metadata (bulk import/delete), append the employee list
    if (log.metadata?.employees && log.metadata.employees.length > 0) {
      const employeeNames = log.metadata.employees
        .map((emp: any) => `${emp.first_name} ${emp.last_name}`)
        .join(', ');
      description = `${description} (${employeeNames})`;
    }
    
    return {
      'Date & Time': new Date(log.timestamp).toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      'Action': log.actionType.replace('_', ' ').toUpperCase(),
      'Description': description,
      'User': log.userName,
      'Role': log.userRole,
      'Entity Type': log.entityType,
    };
  });

  // Create workbook and worksheet
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Audit Logs');

  // Set column widths for better readability
  const columnWidths = [
    { wch: 20 }, // Date & Time
    { wch: 15 }, // Action
    { wch: 50 }, // Description
    { wch: 20 }, // User
    { wch: 15 }, // Role
    { wch: 15 }, // Entity Type
  ];
  worksheet['!cols'] = columnWidths;

  // Apply styling for XLSX format
  if (options.format === 'xlsx') {
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    
    // Style header row (row 1)
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      const cell = worksheet[cellAddress];
      
      if (cell) {
        cell.s = {
          fill: {
            fgColor: { rgb: '4472C4' }, // Blue background
          },
          font: {
            bold: true,
            color: { rgb: 'FFFFFF' }, // White text
            sz: 12,
          },
          alignment: {
            horizontal: 'center',
            vertical: 'center',
            wrapText: true,
          },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
          },
        };
      }
    }

    // Style data rows with alternating colors
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const isEvenRow = (row - 1) % 2 === 0;
      
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[cellAddress];
        
        if (cell) {
          cell.s = {
            fill: {
              fgColor: { rgb: isEvenRow ? 'F2F2F2' : 'FFFFFF' }, // Light gray alternating
            },
            font: {
              sz: 11,
            },
            alignment: {
              horizontal: 'left',
              vertical: 'center',
              wrapText: true,
            },
            border: {
              top: { style: 'thin', color: { rgb: 'D0D0D0' } },
              bottom: { style: 'thin', color: { rgb: 'D0D0D0' } },
              left: { style: 'thin', color: { rgb: 'D0D0D0' } },
              right: { style: 'thin', color: { rgb: 'D0D0D0' } },
            },
          };
        }
      }
    }

    // Set row heights
    const rowHeights = [{ hpt: 30 }]; // Header row
    for (let i = 1; i <= exportData.length; i++) {
      rowHeights.push({ hpt: 25 }); // Data rows
    }
    worksheet['!rows'] = rowHeights;

    // Freeze the header row
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  }

  // Trigger download
  const filename = `${options.filename}.${options.format}`;
  if (options.format === 'xlsx') {
    XLSX.writeFile(workbook, filename);
  } else if (options.format === 'csv') {
    XLSX.writeFile(workbook, filename, { bookType: 'csv' });
  }
}
