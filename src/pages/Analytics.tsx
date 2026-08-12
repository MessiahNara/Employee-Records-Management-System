import React, { useState, useEffect } from 'react';
import { MdPeople, MdDomain, MdCheckCircle, MdAssignment } from 'react-icons/md';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import api from '../services/api';
import Card from '../components/ui/Card';
import './Analytics.css';
import './Dashboard.css'; // Import to use the exact same dashboard KPI styles

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#f43f5e', '#3b82f6'];
const GENDER_COLORS = ['#3b82f6', '#ec4899']; // Blue for Male, Pink for Female
const FILE_STATUS_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#64748b']; // Green=Available, Orange=Borrowed, Red=Overdue, Gray=Lost

function Analytics() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive'>('All');

  useEffect(() => {
    api.employee.getAll()
      .then(data => {
        setEmployees(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load employee data for analytics', err);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Analytics Data...</div>;
  }

  // Calculate stats
  const globalStatusCounts: Record<string, number> = {};
  
  // Calculate Global KPIs (unfiltered)
  employees.forEach(emp => {
    const status = (emp.status || 'inactive').toLowerCase();
    const normalizedStatus = status === 'active' ? 'Active' : 'Inactive';
    globalStatusCounts[normalizedStatus] = (globalStatusCounts[normalizedStatus] || 0) + 1;
  });

  const totalEmployees = employees.length;
  const activeCount = globalStatusCounts['Active'] || 0;
  const inactiveCount = globalStatusCounts['Inactive'] || 0;

  // Apply filter for charts
  const filteredEmployees = employees.filter(emp => {
    if (filterStatus === 'All') return true;
    const status = (emp.status || 'inactive').toLowerCase();
    return status === filterStatus.toLowerCase();
  });

  // Calculate Chart Data (filtered)
  const departmentCounts: Record<string, number> = {};
  const appointmentCounts: Record<string, number> = {};
  const genderCounts: Record<string, number> = {};
  const fileStatusCounts: Record<string, number> = {};
  const ageCounts: Record<string, number> = { '18-25': 0, '26-35': 0, '36-45': 0, '46-55': 0, '56+': 0, 'Unknown': 0 };
  const separationCounts: Record<string, number> = {};
  const hiringTimelineCounts: Record<string, number> = {};
  
  filteredEmployees.forEach(emp => {
    const dept = emp.department || emp.officeName || 'Unassigned';
    departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
    
    const appt = emp.appointmentStatus || 'Unknown';
    appointmentCounts[appt] = (appointmentCounts[appt] || 0) + 1;

    const gender = emp.gender || 'Unknown';
    genderCounts[gender] = (genderCounts[gender] || 0) + 1;

    const fileStatus = emp.file201Status || 'Available';
    fileStatusCounts[fileStatus] = (fileStatusCounts[fileStatus] || 0) + 1;

    // Calculate Age
    if (emp.dateOfBirth) {
      const birthYear = new Date(emp.dateOfBirth).getFullYear();
      const currentYear = new Date().getFullYear();
      const age = currentYear - birthYear;
      if (age >= 18 && age <= 25) ageCounts['18-25']++;
      else if (age >= 26 && age <= 35) ageCounts['26-35']++;
      else if (age >= 36 && age <= 45) ageCounts['36-45']++;
      else if (age >= 46 && age <= 55) ageCounts['46-55']++;
      else if (age >= 56) ageCounts['56+']++;
      else ageCounts['Unknown']++;
    } else {
      ageCounts['Unknown']++;
    }

    // New Hires per Year
    const hireDate = emp.dateOfEmployment || emp.appointmentFrom;
    if (hireDate) {
      const year = new Date(hireDate).getFullYear();
      if (year > 1950 && year <= new Date().getFullYear()) {
        hiringTimelineCounts[year] = (hiringTimelineCounts[year] || 0) + 1;
      }
    }

    // Separation Reasons (only for inactive)
    const status = (emp.status || 'inactive').toLowerCase();
    if (status !== 'active') {
      const reason = emp.reasonOfSeparation || 'Unspecified';
      separationCounts[reason] = (separationCounts[reason] || 0) + 1;
    }
  });

  // Calculate total departments from filtered data, or global? Let's use global for the top card
  const globalDepartmentCounts = new Set(employees.map(e => e.department || e.officeName || 'Unassigned'));
  const totalDepartments = globalDepartmentCounts.size;

  // Format data for Recharts (Show all departments)
  const barData = Object.entries(departmentCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Only show slices that have at least 1% to prevent label overlapping
  const pieData = Object.entries(appointmentCounts)
    .filter(([_, value]) => (value / totalEmployees) >= 0.01)
    .map(([name, value]) => ({ name, value }));

  const genderData = Object.entries(genderCounts)
    .filter(([name]) => name === 'Male' || name === 'Female')
    .map(([name, value]) => ({ name, value }));

  const fileStatusData = Object.entries(fileStatusCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const ageData = Object.entries(ageCounts)
    .filter(([name, value]) => value > 0) // only show brackets with data
    .map(([name, value]) => ({ name, value }));

  const separationData = Object.entries(separationCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const timelineEntries = Object.entries(hiringTimelineCounts)
    .map(([year, count]) => ({ year: parseInt(year), count }))
    .sort((a, b) => a.year - b.year);

  let hiringTimelineData: { year: string; count: number }[] = [];
  if (timelineEntries.length > 0) {
    const minYear = timelineEntries[0].year;
    const maxYear = new Date().getFullYear();
    
    // Fill in missing years with 0
    for (let y = minYear; y <= maxYear; y++) {
      const existing = timelineEntries.find(e => e.year === y);
      hiringTimelineData.push({
        year: y.toString(),
        count: existing ? existing.count : 0
      });
    }
  }

  return (
    <div className="analytics-container">
      <div className="dashboard__header" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="dashboard__header-content">
          <h1 className="dashboard__title">Dashboard Analytics</h1>
          <p className="dashboard__subtitle">Overview of employee statistics and organizational distribution.</p>
        </div>
        
        <div className="analytics-filters" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <label htmlFor="statusFilter" style={{ fontWeight: 600, color: '#475569' }}>Filter Charts:</label>
          <select 
            id="statusFilter"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#334155',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="All">All Employees</option>
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      <div className="analytics-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <Card hoverable>
          <div className="dashboard__kpi-card">
            <div className="dashboard__kpi-header">
              <div className="dashboard__kpi-icon-wrapper" style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)' }}>
                <MdPeople className="dashboard__kpi-icon" style={{ color: '#2563eb' }} />
              </div>
              <span className="dashboard__kpi-label">TOTAL EMPLOYEES</span>
            </div>
            <div className="dashboard__kpi-body">
              <div className="dashboard__kpi-value">{totalEmployees}</div>
            </div>
          </div>
        </Card>
        
        <Card hoverable>
          <div className="dashboard__kpi-card">
            <div className="dashboard__kpi-header">
              <div className="dashboard__kpi-icon-wrapper" style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)' }}>
                <MdDomain className="dashboard__kpi-icon" style={{ color: '#7c3aed' }} />
              </div>
              <span className="dashboard__kpi-label">ASSIGNED DEPARTMENTS</span>
            </div>
            <div className="dashboard__kpi-body">
              <div className="dashboard__kpi-value">{totalDepartments}</div>
            </div>
          </div>
        </Card>

        <Card hoverable>
          <div className="dashboard__kpi-card">
            <div className="dashboard__kpi-header">
              <div className="dashboard__kpi-icon-wrapper" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)' }}>
                <MdCheckCircle className="dashboard__kpi-icon" style={{ color: '#059669' }} />
              </div>
              <span className="dashboard__kpi-label">ACTIVE EMPLOYEES</span>
            </div>
            <div className="dashboard__kpi-body">
              <div className="dashboard__kpi-value">{activeCount}</div>
            </div>
          </div>
        </Card>

        <Card hoverable>
          <div className="dashboard__kpi-card">
            <div className="dashboard__kpi-header">
              <div className="dashboard__kpi-icon-wrapper" style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)' }}>
                <MdAssignment className="dashboard__kpi-icon" style={{ color: '#d97706' }} />
              </div>
              <span className="dashboard__kpi-label">INACTIVE EMPLOYEES</span>
            </div>
            <div className="dashboard__kpi-body">
              <div className="dashboard__kpi-value">{inactiveCount}</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="analytics-charts-grid">
        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3>Departments by Headcount</h3>
          <div className="chart-scroll-container" style={{ width: '100%', height: '500px', overflowY: 'auto', overflowX: 'hidden' }}>
            <div style={{ height: `${Math.max(400, barData.length * 40)}px`, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={250} 
                    tick={{ fontSize: 12 }} 
                    interval={0}
                  />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Employees" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <div style={{ flex: 1 }}>
            <h3>Appointment Status</h3>
            <div className="chart-container" style={{ height: '240px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    outerRadius={60}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }: any) => percent > 0.01 ? `${name} ${(percent * 100).toFixed(0)}%` : null}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1rem', textAlign: 'center' }}>Gender</h3>
              <div className="chart-container" style={{ height: '160px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                    <Pie data={genderData} cx="50%" cy="50%" innerRadius={20} outerRadius={35} dataKey="value" label>
                      {genderData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={GENDER_COLORS[index % GENDER_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1rem', textAlign: 'center' }}>201 File Status</h3>
              <div className="chart-container" style={{ height: '160px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                    <Pie data={fileStatusData} cx="50%" cy="50%" innerRadius={20} outerRadius={35} dataKey="value" label>
                      {fileStatusData.map((entry, index) => {
                        // Assign colors based on status name if possible
                        const name = entry.name.toLowerCase();
                        let color = FILE_STATUS_COLORS[0]; // Available
                        if (name.includes('borrow')) color = FILE_STATUS_COLORS[1];
                        if (name.includes('overdue')) color = FILE_STATUS_COLORS[2];
                        if (name.includes('lost')) color = FILE_STATUS_COLORS[3];
                        return <Cell key={`cell-${index}`} fill={color} />;
                      })}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="analytics-charts-grid" style={{ marginTop: '2rem' }}>
        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3>Age Demographics</h3>
          <div className="chart-container" style={{ flex: 1, minHeight: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Employees" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3>Reasons for Separation</h3>
          {separationData.length > 0 ? (
            <div className="chart-container" style={{ flex: 1, minHeight: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <Pie
                    data={separationData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#f43f5e"
                    dataKey="value"
                  >
                    {separationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              <p>No separation data available for the current filter.</p>
            </div>
          )}
        </div>
      </div>

      <div className="analytics-charts-grid" style={{ marginTop: '2rem' }}>
        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column', gridColumn: '1 / -1' }}>
          <h3>New Hires per Year (Timeline)</h3>
          <div className="chart-container" style={{ flex: 1, minHeight: '350px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hiringTimelineData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} name="New Hires" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;
