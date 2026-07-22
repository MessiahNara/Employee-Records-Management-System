import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdChevronLeft,
  MdChevronRight,
  MdAdd,
  MdDelete,
  MdCalendarToday,
  MdPeople,
  MdClose,
  MdCheckCircle,
  MdRadioButtonUnchecked,
  MdList,
  MdWarning,
  MdError,
  MdInfo
} from 'react-icons/md';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import './Calendar.css';

interface EmployeeAlert {
  id: string;
  name: string;
  position: string;
  office: string;
  aoType: string;
  expDate: string;
  color: 'red' | 'orange' | 'yellow' | 'blue';
  urgencyLabel: string;
  remainingDays: number;
}

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  date?: string;
  createdAt: string;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function Calendar() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [employees, setEmployees] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Todo list states
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoDate, setNewTodoDate] = useState('');

  // Selected date popup modal state
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [selectedRawDate, setSelectedRawDate] = useState<string | null>(null);
  const [selectedDateEmployees, setSelectedDateEmployees] = useState<EmployeeAlert[]>([]);
  const [modalTodoText, setModalTodoText] = useState('');

  // Counter card click filter modal states
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<'red' | 'orange' | 'yellow' | 'blue' | null>(null);
  const [selectedFilterCategoryTitle, setSelectedFilterCategoryTitle] = useState<string>('');
  const [filterCategoryEmployees, setFilterCategoryEmployees] = useState<EmployeeAlert[]>([]);

  // Load data
  // Load data and poll for updates
  useEffect(() => {
    let isInitialLoad = true;
    const fetchData = async () => {
      try {
        if (isInitialLoad) {
          setIsLoading(true);
        }
        const [empData, approvalData] = await Promise.all([
          api.employee.getAll({ status: 'Active' }),
          api.approvals.getPending()
        ]);
        setEmployees(empData);
        setPendingApprovals(approvalData);
      } catch (err) {
        console.error('Failed to load data for calendar:', err);
        if (isInitialLoad) {
          showToast('Error loading calendar data. Please refresh.', 'error');
        }
      } finally {
        if (isInitialLoad) {
          setIsLoading(false);
          isInitialLoad = false;
        }
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);

    // Load todos from localStorage
    const savedTodos = localStorage.getItem('hrmdo_calendar_todos');
    if (savedTodos) {
      try {
        setTodos(JSON.parse(savedTodos));
      } catch {
        localStorage.removeItem('hrmdo_calendar_todos');
      }
    }

    return () => clearInterval(interval);
  }, [showToast]);

  // Save todos to localStorage when they change
  const saveTodos = (newTodos: TodoItem[]) => {
    setTodos(newTodos);
    localStorage.setItem('hrmdo_calendar_todos', JSON.stringify(newTodos));
  };

  // Date helper
  const formatDateKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const parseLocalDate = (dateStr: string): Date => {
    try {
      if (dateStr && dateStr.length >= 10 && dateStr.includes('-')) {
        const parts = dateStr.substring(0, 10).split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const parsed = new Date(y, m, d);
        if (!isNaN(parsed.getTime())) return parsed;
      }
      return new Date(dateStr);
    } catch {
      return new Date(dateStr);
    }
  };

  const parseDateKey = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const d = parseLocalDate(dateStr);
      if (isNaN(d.getTime())) return '';
      return formatDateKey(d);
    } catch {
      return '';
    }
  };

  // Map employee alerts dynamically
  const employeeAlerts = useMemo<EmployeeAlert[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const millisecondsPerDay = 1000 * 60 * 60 * 24;

    const inferAoType = (data: any): 'Detailed' | 'Designated' | '' => {
      const rawAoType = String(data.aoType || '').trim().toLowerCase();
      if (rawAoType === 'detailed') return 'Detailed';
      if (rawAoType === 'designated') return 'Designated';
      if (data.isDetailed === true) return 'Detailed';
      if (
        String(data.designatedPositionFunction || '').trim() ||
        String(data.designatedOrderFrom || '').trim() ||
        String(data.designatedOrderTo || '').trim()
      ) return 'Designated';
      return '';
    };

    const alertsList: EmployeeAlert[] = [];

    employees.forEach((emp) => {
      const aoType = inferAoType(emp);

      const processAlert = (expDateStr: string | undefined, alertAoType: string) => {
        if (!expDateStr) return;

        const expDate = parseLocalDate(expDateStr);
        if (isNaN(expDate.getTime())) return;

        const remainingDays = Math.ceil((expDate.getTime() - today.getTime()) / millisecondsPerDay);

        const hasPendingRenewal = pendingApprovals.some(
          (r: any) => r.action === 'update_employee' && r.entityId === emp.id && r.status === 'pending'
        );

        let color: 'red' | 'orange' | 'yellow' | 'blue';
        let urgencyLabel = '';

        if (hasPendingRenewal) {
          color = 'blue';
          urgencyLabel = 'Action Taken (Renewal Pending)';
        } else if (remainingDays < 0) {
          color = 'red';
          urgencyLabel = `Expired (${Math.abs(remainingDays)} days ago)`;
        } else if (remainingDays <= 7) {
          color = 'orange';
          urgencyLabel = `Urgent (${remainingDays} days left)`;
        } else if (remainingDays <= 30) {
          color = 'yellow';
          urgencyLabel = `Warning (${remainingDays} days left)`;
        } else {
          return;
        }

        alertsList.push({
          id: emp.id,
          name: `${emp.lastName}, ${emp.firstName} ${emp.middleName || ''}`.trim(),
          position: emp.positionFunction || 'Employee',
          office: emp.officeHospitalName || emp.motherUnit || 'N/A',
          aoType: alertAoType,
          expDate: parseDateKey(expDateStr),
          color,
          urgencyLabel,
          remainingDays
        });
      };

      // 1. Process regular appointment expiration
      processAlert(emp.appointmentTo, 'Appointment');

      // 2. Process detailed/designated AO expiration
      if (aoType === 'Detailed') {
        processAlert(emp.detailedOrderTo, 'Detailed');
      } else if (aoType === 'Designated') {
        processAlert(emp.designatedOrderTo, 'Designated');
      }
    });

    return alertsList;
  }, [employees, pendingApprovals]);

  // Filter critical/expired alerts
  const criticalAlerts = useMemo(() => {
    return employeeAlerts.filter(alert => alert.color === 'red');
  }, [employeeAlerts]);

  // Group alerts by formatted expiration date
  const alertsByDate = useMemo(() => {
    const map: Record<string, EmployeeAlert[]> = {};
    employeeAlerts.forEach((alert) => {
      if (!map[alert.expDate]) {
        map[alert.expDate] = [];
      }
      map[alert.expDate].push(alert);
    });
    return map;
  }, [employeeAlerts]);

  // General counters
  const counters = useMemo(() => {
    let red = 0, orange = 0, yellow = 0, blue = 0;
    employeeAlerts.forEach(alert => {
      if (alert.color === 'red') red++;
      else if (alert.color === 'orange') orange++;
      else if (alert.color === 'yellow') yellow++;
      else if (alert.color === 'blue') blue++;
    });
    return { red, orange, yellow, blue };
  }, [employeeAlerts]);

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  // Calendar grid construction
  const calendarCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const cells: { date: Date; isCurrentMonth: boolean; key: string }[] = [];

    // Prev month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthTotalDays - i);
      cells.push({
        date,
        isCurrentMonth: false,
        key: formatDateKey(date)
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const date = new Date(year, month, i);
      cells.push({
        date,
        isCurrentMonth: true,
        key: formatDateKey(date)
      });
    }

    // Next month padding days to complete grid multiple of 7
    const remainingCells = 42 - cells.length; // 6 rows of 7
    for (let i = 1; i <= remainingCells; i++) {
      const date = new Date(year, month + 1, i);
      cells.push({
        date,
        isCurrentMonth: false,
        key: formatDateKey(date)
      });
    }

    return cells;
  }, [currentDate]);

  // Handle date cell click
  const handleDateClick = (dateKey: string) => {
    const alerts = alertsByDate[dateKey] || [];
    const formatted = new Date(dateKey).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    setSelectedDateStr(formatted);
    setSelectedRawDate(dateKey);
    setSelectedDateEmployees(alerts);
  };

  // Get todos for selected date
  const selectedDateTodos = useMemo(() => {
    if (!selectedRawDate) return [];
    return todos.filter(t => t.date === selectedRawDate);
  }, [todos, selectedRawDate]);

  // Format todo date key for display
  const formatTodoDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      const date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Add todo from sidebar
  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;

    const todo: TodoItem = {
      id: `todo_${Date.now()}`,
      text: newTodoText.trim(),
      completed: false,
      date: newTodoDate || undefined,
      createdAt: new Date().toLocaleDateString()
    };

    saveTodos([todo, ...todos]);
    setNewTodoText('');
    setNewTodoDate('');
    showToast('Todo item added successfully', 'success');
  };

  // Add todo from modal (specific date)
  const handleAddModalTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTodoText.trim() || !selectedRawDate) return;

    const todo: TodoItem = {
      id: `todo_${Date.now()}`,
      text: modalTodoText.trim(),
      completed: false,
      date: selectedRawDate,
      createdAt: new Date().toLocaleDateString()
    };

    saveTodos([todo, ...todos]);
    setModalTodoText('');
    showToast('Reminder added for this date', 'success');
  };

  // Toggle todo
  const handleToggleTodo = (id: string) => {
    const updated = todos.map(todo => {
      if (todo.id === id) {
        return { ...todo, completed: !todo.completed };
      }
      return todo;
    });
    saveTodos(updated);
  };

  // Delete todo
  const handleDeleteTodo = (id: string) => {
    const updated = todos.filter(todo => todo.id !== id);
    saveTodos(updated);
    showToast('Todo item deleted', 'info');
  };

  const closeModal = () => {
    setSelectedDateStr(null);
    setSelectedRawDate(null);
    setModalTodoText('');
  };

  return (
    <div className="calendar-page">
      {/* Upper header */}
      <div className="calendar-page__header">
        <div>
          <h1 className="calendar-page__title">Expirations Calendar</h1>
          <p className="calendar-page__subtitle">Track appointment and administrative order (AO) expiration states</p>
        </div>
      </div>

      {/* Counter summary cards */}
      <div className="calendar-page__counters">
        <div
          className={`calendar-counter-card calendar-counter-card--red ${selectedFilterCategory === 'red' ? 'calendar-counter-card--active' : ''}`}
          onClick={() => {
            const list = employeeAlerts.filter(a => a.color === 'red');
            setSelectedFilterCategory('red');
            setSelectedFilterCategoryTitle('Critical Expired Employees');
            setFilterCategoryEmployees(list);
          }}
          title="Click to view all critical expired employees"
          style={{ cursor: 'pointer' }}
        >
          <div className="calendar-counter-card__icon calendar-counter-card__icon--red">
            <MdError />
          </div>
          <div className="calendar-counter-card__content">
            <div className="calendar-counter-card__label">Critical (Expired)</div>
            <div className="calendar-counter-card__value">{counters.red}</div>
          </div>
        </div>

        <div
          className={`calendar-counter-card calendar-counter-card--orange ${selectedFilterCategory === 'orange' ? 'calendar-counter-card--active' : ''}`}
          onClick={() => {
            const list = employeeAlerts.filter(a => a.color === 'orange');
            setSelectedFilterCategory('orange');
            setSelectedFilterCategoryTitle('Urgent Expiring Employees (≤ 7 Days)');
            setFilterCategoryEmployees(list);
          }}
          title="Click to view all urgent expiring employees"
          style={{ cursor: 'pointer' }}
        >
          <div className="calendar-counter-card__icon calendar-counter-card__icon--orange">
            <MdWarning />
          </div>
          <div className="calendar-counter-card__content">
            <div className="calendar-counter-card__label">Urgent (≤ 7 Days)</div>
            <div className="calendar-counter-card__value">{counters.orange}</div>
          </div>
        </div>

        <div
          className={`calendar-counter-card calendar-counter-card--yellow ${selectedFilterCategory === 'yellow' ? 'calendar-counter-card--active' : ''}`}
          onClick={() => {
            const list = employeeAlerts.filter(a => a.color === 'yellow');
            setSelectedFilterCategory('yellow');
            setSelectedFilterCategoryTitle('Warning Expiring Employees (≤ 30 Days)');
            setFilterCategoryEmployees(list);
          }}
          title="Click to view all warning expiring employees"
          style={{ cursor: 'pointer' }}
        >
          <div className="calendar-counter-card__icon calendar-counter-card__icon--yellow">
            <MdInfo />
          </div>
          <div className="calendar-counter-card__content">
            <div className="calendar-counter-card__label">Warning (≤ 30 Days)</div>
            <div className="calendar-counter-card__value">{counters.yellow}</div>
          </div>
        </div>

        <div
          className={`calendar-counter-card calendar-counter-card--blue ${selectedFilterCategory === 'blue' ? 'calendar-counter-card--active' : ''}`}
          onClick={() => {
            const list = employeeAlerts.filter(a => a.color === 'blue');
            setSelectedFilterCategory('blue');
            setSelectedFilterCategoryTitle('Pending Renewal Employees');
            setFilterCategoryEmployees(list);
          }}
          title="Click to view all pending renewal employees"
          style={{ cursor: 'pointer' }}
        >
          <div className="calendar-counter-card__icon calendar-counter-card__icon--blue">
            <MdCheckCircle />
          </div>
          <div className="calendar-counter-card__content">
            <div className="calendar-counter-card__label">Action Taken (Pending)</div>
            <div className="calendar-counter-card__value">{counters.blue}</div>
          </div>
        </div>
      </div>

      {/* Main split layout */}
      <div className="calendar-page__split">

        {/* Left Side: Calendar Card */}
        <Card className="calendar-card">
          <div className="calendar-card__header">
            <div className="calendar-card__month-title">
              <MdCalendarToday className="calendar-card__title-icon" />
              <span>Calendar</span>
            </div>

            {/* Month & Year Select Dropdowns */}
            <div className="calendar-card__selects">
              <select
                className="calendar-card__select"
                value={currentDate.getMonth()}
                onChange={(e) => {
                  const m = parseInt(e.target.value, 10);
                  setCurrentDate(new Date(currentDate.getFullYear(), m, 1));
                }}
              >
                {MONTHS.map((monthName, idx) => (
                  <option key={monthName} value={idx}>{monthName}</option>
                ))}
              </select>

              <select
                className="calendar-card__select"
                value={currentDate.getFullYear()}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  setCurrentDate(new Date(y, currentDate.getMonth(), 1));
                }}
              >
                {Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - 10 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="calendar-card__nav">
              <Button variant="secondary" size="sm" onClick={prevMonth} className="calendar-card__nav-btn">
                <MdChevronLeft size={20} />
              </Button>
              <Button variant="secondary" size="sm" onClick={nextMonth} className="calendar-card__nav-btn">
                <MdChevronRight size={20} />
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="calendar-grid">
            {/* Weekdays header */}
            {DAYS_OF_WEEK.map((day) => (
              <div key={day} className="calendar-grid__weekday">
                {day}
              </div>
            ))}

            {/* Days grid */}
            {isLoading ? (
              <div className="calendar-grid__loading">
                <div className="calendar-grid__spinner"></div>
                <p>Loading Calendar Events...</p>
              </div>
            ) : (
              calendarCells.map(({ date, isCurrentMonth, key }) => {
                const dayAlerts = alertsByDate[key] || [];
                const dayTodos = todos.filter(t => t.date === key && !t.completed);
                const isToday = key === formatDateKey(new Date());

                return (
                  <div
                    key={key}
                    onClick={() => handleDateClick(key)}
                    className={`calendar-day 
                      ${isCurrentMonth ? 'calendar-day--current' : 'calendar-day--padding'}
                      ${isToday ? 'calendar-day--today' : ''}
                      ${(dayAlerts.length > 0 || dayTodos.length > 0) ? 'calendar-day--has-events' : ''}
                    `}
                  >
                    <span className="calendar-day__number">{date.getDate()}</span>

                    {/* Urgency color dots and custom reminders */}
                    {(dayAlerts.length > 0 || dayTodos.length > 0) && (
                      <div className="calendar-day__events">
                        {dayAlerts.slice(0, 3).map((alert, index) => (
                          <span
                            key={index}
                            className={`calendar-day__dot calendar-day__dot--${alert.color}`}
                            title={`${alert.name}: ${alert.urgencyLabel}`}
                          />
                        ))}
                        {dayTodos.length > 0 && (
                          <span
                            className="calendar-day__dot calendar-day__dot--purple"
                            title={`${dayTodos.length} custom reminder(s)`}
                          />
                        )}
                        {(dayAlerts.length + (dayTodos.length > 0 ? 1 : 0)) > 3 && (
                          <span className="calendar-day__more-count">
                            +{dayAlerts.length + (dayTodos.length > 0 ? 1 : 0) - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Calendar Legend */}
          <div className="calendar-legend">
            <span className="calendar-legend__item"><span className="calendar-legend__color calendar-legend__color--red"></span> Critical (Expired)</span>
            <span className="calendar-legend__item"><span className="calendar-legend__color calendar-legend__color--orange"></span> Urgent (≤ 7 Days)</span>
            <span className="calendar-legend__item"><span className="calendar-legend__color calendar-legend__color--yellow"></span> Warning (≤ 30 Days)</span>
            <span className="calendar-legend__item"><span className="calendar-legend__color calendar-legend__color--blue"></span> Action Taken (Pending)</span>
            <span className="calendar-legend__item"><span className="calendar-legend__color calendar-legend__color--purple"></span> Reminders</span>
          </div>
        </Card>

        {/* Right Side: Todo List Card */}
        <Card className="todo-card">
          <div className="todo-card__header">
            <h3 className="todo-card__title">
              <MdList className="todo-card__title-icon" />
              <span>Calendar Tasks / Reminders</span>
            </h3>
            <span className="todo-card__badge">{todos.filter(t => !t.completed).length} pending</span>
          </div>

          <form onSubmit={handleAddTodo} className="todo-form">
            <input
              type="text"
              className="todo-form__input"
              placeholder="Add reminder task..."
              value={newTodoText}
              onChange={(e) => setNewTodoText(e.target.value)}
            />
            <div className="todo-form__row">
              <input
                type="date"
                className="todo-form__date-input"
                value={newTodoDate}
                onChange={(e) => setNewTodoDate(e.target.value)}
              />
              <Button type="submit" variant="primary" className="todo-form__btn">
                <MdAdd size={18} style={{ marginRight: '4px' }} /> Add Reminder
              </Button>
            </div>
          </form>

          {/* Todo List */}
          <div className="todo-list">
            {todos.length === 0 ? (
              <div className="todo-list__empty">
                <MdCheckCircle className="todo-list__empty-icon" />
                <p>No reminders added. Enjoy a clean schedule!</p>
              </div>
            ) : (
              todos.map((todo) => (
                <div key={todo.id} className={`todo-item ${todo.completed ? 'todo-item--completed' : ''}`}>
                  <button
                    type="button"
                    onClick={() => handleToggleTodo(todo.id)}
                    className="todo-item__toggle"
                  >
                    {todo.completed ? (
                      <MdCheckCircle className="todo-item__toggle-icon todo-item__toggle-icon--checked" />
                    ) : (
                      <MdRadioButtonUnchecked className="todo-item__toggle-icon" />
                    )}
                  </button>

                  <div className="todo-item__content" style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                    <span className="todo-item__text">{todo.text}</span>
                    {todo.date && (
                      <span className="todo-item__date-badge" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c084fc', alignSelf: 'flex-start' }}>
                        📅 {formatTodoDate(todo.date)}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteTodo(todo.id)}
                    className="todo-item__delete"
                    title="Delete Reminder"
                  >
                    <MdDelete size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Date Expiration Details Dialog */}
      {selectedDateStr && (
        <div className="calendar-modal-overlay" onClick={closeModal}>
          <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-modal__header">
              <div>
                <h3 className="calendar-modal__title">Details for Date</h3>
                <p className="calendar-modal__subtitle">{selectedDateStr}</p>
              </div>
              <button className="calendar-modal__close" onClick={closeModal}>
                <MdClose size={20} />
              </button>
            </div>

            <div className="calendar-modal__body">
              {/* Expiring Employees List */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  ⚠️ Expiring Employees / Orders ({selectedDateEmployees.length})
                </h4>
                {selectedDateEmployees.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                    No employee expirations on this day.
                  </p>
                ) : (
                  <div className="expiring-list">
                    {selectedDateEmployees.map((emp) => (
                      <div
                        key={`${emp.id}-${emp.aoType}`}
                        className={`expiring-item expiring-item--border-${emp.color}`}
                        onClick={() => {
                          closeModal();
                          navigate(`/employees/${emp.id}`);
                        }}
                        title="Click to go directly to employee record"
                      >
                        <div className="expiring-item__info">
                          <div className="expiring-item__name">
                            {emp.name}
                            <span className={`expiring-badge expiring-badge--${emp.color}`}>
                              {emp.color === 'red' && '🔴 Expired'}
                              {emp.color === 'orange' && '🟠 Urgent'}
                              {emp.color === 'yellow' && '🟡 Warning'}
                              {emp.color === 'blue' && '🔵 Pending Renewal'}
                            </span>
                          </div>
                          <div className="expiring-item__meta">{emp.position} • {emp.office}</div>
                          <div className="expiring-item__details">
                            Type: <strong>{emp.aoType} Order</strong> • Expiration: <strong>{emp.expDate}</strong>
                          </div>
                        </div>
                        <div className="expiring-item__action-hint">
                          Profile &rarr;
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Custom Reminders List */}
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  📌 Custom Reminders ({selectedDateTodos.length})
                </h4>
                {selectedDateTodos.length === 0 ? (
                  <p style={{ margin: '0 0 1rem 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                    No custom reminders set for this day.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedDateTodos.map((todo) => (
                      <div
                        key={todo.id}
                        className={`todo-item ${todo.completed ? 'todo-item--completed' : ''}`}
                        style={{ borderLeft: '4px solid #a855f7', padding: 'var(--spacing-sm) var(--spacing-md)' }}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleTodo(todo.id)}
                          className="todo-item__toggle"
                        >
                          {todo.completed ? (
                            <MdCheckCircle className="todo-item__toggle-icon todo-item__toggle-icon--checked" />
                          ) : (
                            <MdRadioButtonUnchecked className="todo-item__toggle-icon" />
                          )}
                        </button>
                        <span className="todo-item__text" style={{ flex: 1 }}>{todo.text}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteTodo(todo.id)}
                          className="todo-item__delete"
                          title="Delete Reminder"
                        >
                          <MdDelete size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Add Reminder for this specific date */}
              <form onSubmit={handleAddModalTodo} style={{ marginTop: '1.25rem', display: 'flex', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                <input
                  type="text"
                  placeholder="Quick add reminder for this day..."
                  value={modalTodoText}
                  onChange={(e) => setModalTodoText(e.target.value)}
                  className="todo-form__input"
                  style={{ flex: 1 }}
                />
                <Button type="submit" variant="primary" style={{ backgroundColor: '#a855f7', borderColor: '#a855f7', padding: '0 12px' }}>
                  <MdAdd size={20} style={{ marginRight: '4px' }} /> Add
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Filter Category Modal (Triggered by clicking counter summary cards) */}
      <Modal
        isOpen={selectedFilterCategory !== null}
        onClose={() => {
          setSelectedFilterCategory(null);
          setFilterCategoryEmployees([]);
        }}
        title={selectedFilterCategoryTitle}
        size="lg"
      >
        <div style={{ padding: '0.5rem 0' }}>
          {filterCategoryEmployees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>No Employees Found</p>
              <p style={{ fontSize: '0.875rem' }}>There are currently no employees in this expiration category.</p>
            </div>
          ) : (
            <div className="expiring-list">
              {filterCategoryEmployees.map((emp) => (
                <div
                  key={`${emp.id}-${emp.aoType}-${emp.expDate}`}
                  className={`expiring-item expiring-item--border-${emp.color}`}
                  onClick={() => {
                    setSelectedFilterCategory(null);
                    navigate(`/employees/${emp.id}`);
                  }}
                  title="Click to go directly to employee record"
                >
                  <div className="expiring-item__info">
                    <div className="expiring-item__name">
                      {emp.name}
                      <span className={`expiring-badge expiring-badge--${emp.color}`}>
                        {emp.color === 'red' && '🔴 Expired'}
                        {emp.color === 'orange' && '🟠 Urgent'}
                        {emp.color === 'yellow' && '🟡 Warning'}
                        {emp.color === 'blue' && '🔵 Pending Renewal'}
                      </span>
                    </div>
                    <div className="expiring-item__meta">{emp.position} • {emp.office}</div>
                    <div className="expiring-item__details">
                      Type: <strong>{emp.aoType} Order</strong> • Expiration: <strong>{emp.expDate}</strong>
                      {emp.remainingDays < 0
                        ? ` (${Math.abs(emp.remainingDays)} days ago)`
                        : ` (${emp.remainingDays} days remaining)`}
                    </div>
                  </div>
                  <div className="expiring-item__action-hint">
                    View Profile &rarr;
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
