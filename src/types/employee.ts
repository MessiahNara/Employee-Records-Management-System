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
  aoNumber?: string;
  aoYear?: string;
  aoType?: 'Detailed' | 'Designated';
  status: EmployeeStatus;
  positionFunction: string;
  dateOfEmployment: string;
  dateOfSeparation?: string;
  reasonForSeparation?: string;
  motherUnit?: string;
  detailedTo?: string;
  detailedDivision?: string;
  designatedPositionFunction?: string;
  designatedOrderFrom?: string;
  designatedOrderTo?: string;
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
  aoNumber: string;
  aoYear: string;
  aoType: 'Detailed' | 'Designated' | '';
  status: EmployeeStatus;
  positionFunction: string;
  dateOfEmployment: string;
  dateOfSeparation: string;
  reasonForSeparation: string;
  motherUnit: string;
  detailedTo: string;
  detailedDivision: string;
  designatedPositionFunction: string;
  designatedOrderFrom: string;
  designatedOrderTo: string;
  fileboxLocation: string;
  file201Status: string;
}
