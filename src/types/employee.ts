export type Gender = 'Male' | 'Female';
export type AppointmentStatus = 'Consultant' | 'Contract of Service' | 'Contractual' | 'Co-Terminous' | 'Casual' | 'Elective' | 'Job Order' | 'Permanent' | 'Probationary' | 'Temporary';
export type EmployeeStatus = 'Active' | 'Inactive';

export interface Employee {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  dateOfBirth?: string;
  gender: Gender;
  officeHospitalName: string;
  appointmentStatus: AppointmentStatus;
  appointmentFrom?: string;
  appointmentTo?: string;
  status: EmployeeStatus;
  positionFunction: string;
  dateOfEmployment: string;
  dateOfSeparation?: string;
  reasonForSeparation?: string;
  isDetailed?: boolean;
  motherUnit?: string;
  detailedTo?: string;
  detailedDivision?: string;
  detailedFunction?: string;
  detailedDate?: string;
  fileboxLocation?: string;
  file201Status?: string;
  profilePicture?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeFormData {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  dateOfBirth: string;
  gender: Gender | '';
  officeHospitalName: string;
  appointmentStatus: AppointmentStatus | '';
  appointmentFrom: string;
  appointmentTo: string;
  status: EmployeeStatus;
  positionFunction: string;
  dateOfEmployment: string;
  dateOfSeparation: string;
  reasonForSeparation: string;
  isDetailed: boolean;
  motherUnit: string;
  detailedTo: string;
  detailedDivision: string;
  detailedFunction: string;
  detailedDate: string;
  fileboxLocation: string;
  file201Status: string;
}
