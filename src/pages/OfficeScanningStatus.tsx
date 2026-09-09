import React from 'react';
import OfficeHospitalScanningMatrix from '../components/OfficeHospitalScanningMatrix';
import { MdBusiness } from 'react-icons/md';
import './ScanningStatus.css';

export default function OfficeScanningStatus() {
  return (
    <div className="scanning-status">
      {/* Header */}
      <div className="scanning-status__header">
        <div className="scanning-status__title-group">
          <div className="scanning-status__title-icon-wrapper">
            <MdBusiness className="scanning-status__title-icon" />
          </div>
          <div>
            <h1 className="scanning-status__title">Office and Hospital Status</h1>
            <p className="scanning-status__subtitle">
              Digitized 201 file scanning progress matrix across provincial offices, departments, and hospitals (Active personnel only).
            </p>
          </div>
        </div>
      </div>

      {/* Main Matrix Table Component */}
      <OfficeHospitalScanningMatrix />
    </div>
  );
}
