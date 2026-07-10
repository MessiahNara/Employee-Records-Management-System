import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Employee } from '../types/employee';
import api from '../services/api';
import './PublicEmployeeView.css';

function PublicEmployeeView() {
  const { id } = useParams<{ id: string }>();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (id) {
      fetchEmployee(id);
    }
  }, [id]);

  const fetchEmployee = async (employeeId: string) => {
    try {
      setIsLoading(true);
      const data = await api.employee.getById(employeeId);
      setEmployee(data);
      setNotFound(false);
    } catch (error) {
      console.error('Error fetching employee:', error);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="public-employee">
        <div className="public-employee__container">
          <div className="public-employee__card">
            <div className="public-employee__loading">
              <div className="public-employee__spinner"></div>
              <p>Loading employee information...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !employee) {
    return (
      <div className="public-employee">
        <div className="public-employee__container">
          <div className="public-employee__card">
            <div className="public-employee__not-found">
              <div className="public-employee__icon">❌</div>
              <h1>Employee Not Found</h1>
              <p>The employee you're looking for doesn't exist or has been removed.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Get initials for avatar
  const getInitials = () => {
    const first = employee.firstName?.charAt(0) || '';
    const last = employee.lastName?.charAt(0) || '';
    return `${first}${last}`.toUpperCase();
  };

  return (
    <div className="public-employee">
      <div className="public-employee__container">
        <div className="public-employee__card">
          {/* Header */}
          <div className="public-employee__header">
            <div className="public-employee__logo">
              <span className="public-employee__logo-icon">🏢</span>
              <span className="public-employee__logo-text">Employee Directory</span>
            </div>
          </div>

          {/* Avatar */}
          <div className="public-employee__avatar">
            {getInitials()}
          </div>

          {/* Employee Info */}
          <div className="public-employee__info">
            <h1 className="public-employee__name">
              {employee.firstName} {employee.middleName} {employee.lastName}
            </h1>
            
            <div className="public-employee__details">
              <div className="public-employee__detail-item">
                <span className="public-employee__detail-label">Employee ID</span>
                <span className="public-employee__detail-value">{employee.id || 'N/A'}</span>
              </div>

              <div className="public-employee__detail-item">
                <span className="public-employee__detail-label">Position</span>
                <span className="public-employee__detail-value">{employee.positionFunction || 'N/A'}</span>
              </div>

              <div className="public-employee__detail-item">
                <span className="public-employee__detail-label">Office/Hospital</span>
                <span className="public-employee__detail-value">{employee.officeHospitalName || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="public-employee__footer">
            <p>This is a public employee directory view</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PublicEmployeeView;
