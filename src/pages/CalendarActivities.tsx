import { useState, useEffect, useMemo } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { getAuthState } from '../utils/mockAuth';
import { useToast } from '../contexts/ToastContext';
import { MdCalendarToday, MdChevronLeft, MdChevronRight, MdEvent, MdAccessTime, MdLocationOn, MdAdd } from 'react-icons/md';
import './CalendarActivities.css';

interface Activity {
  id: string;
  title: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  timeFrom?: string; // YYYY-MM-DD
  timeTo?: string; // YYYY-MM-DD
  location: string;
  category: 'training' | 'holiday' | 'meeting' | 'social' | 'medical';
  description: string;
}

const ACTIVITIES: Activity[] = [
  {
    id: 'act1',
    title: 'HR Performance Evaluation Training',
    dateFrom: '2026-07-20',
    timeFrom: '09:00 AM',
    timeTo: '12:00 PM',
    location: 'Conference Hall A',
    category: 'training',
    description: 'Training seminar for supervisors and managers regarding performance evaluation procedures.'
  },
  {
    id: 'act2',
    title: 'National Holiday (Office Closed)',
    dateFrom: '2026-07-27',
    location: 'General Office',
    category: 'holiday',
    description: 'Observance of official national holiday. Normal office operations will resume the next day.'
  },
  {
    id: 'act3',
    title: 'Monthly HR & Administrative Meeting',
    dateFrom: '2026-07-10',
    timeFrom: '02:00 PM',
    timeTo: '04:00 PM',
    location: 'Executive Boardroom',
    category: 'meeting',
    description: 'Reviewing system operations, database backups, and monthly employee detail reports.'
  },
  {
    id: 'act4',
    title: 'New Employee Orientation Program',
    dateFrom: '2026-08-03',
    timeFrom: '08:30 AM',
    timeTo: '04:30 PM',
    location: 'Orientation Room 101',
    category: 'training',
    description: 'Welcoming new hires and introducing them to the Employee Records Management System.'
  },
  {
    id: 'act5',
    title: 'Quarterly Staff Appreciation Assembly',
    dateFrom: '2026-08-14',
    timeFrom: '03:00 PM',
    timeTo: '05:00 PM',
    location: 'Main Pavilion',
    category: 'social',
    description: 'Assembling all departments to recognize top performers and celebrate quarterly achievements.'
  }
];

const TIME_OPTIONS = [
  '07:00 AM', '07:30 AM', '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM',
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
  '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM'
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CalendarActivities() {
  const { showToast } = useToast();
  const currentUser = getAuthState();
  const userRole = currentUser?.role || 'viewer';
  const isAdmin = userRole === 'superadmin' || userRole === 'admin' || userRole === 'developer';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Activities list state
  const [activities, setActivities] = useState<Activity[]>([]);

  // Add modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<'training' | 'holiday' | 'meeting' | 'social' | 'medical'>('training');
  const [formDateFrom, setFormDateFrom] = useState('');
  const [formDateTo, setFormDateTo] = useState('');
  const [formTimeFrom, setFormTimeFrom] = useState('');
  const [formTimeTo, setFormTimeTo] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formDescription, setFormDescription] = useState('');

  // Delete modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activityToDeleteId, setActivityToDeleteId] = useState<string | null>(null);

  // Load activities from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('hrmdo_calendar_activities');
    if (saved) {
      try {
        setActivities(JSON.parse(saved));
      } catch {
        setActivities(ACTIVITIES);
      }
    } else {
      setActivities(ACTIVITIES);
      localStorage.setItem('hrmdo_calendar_activities', JSON.stringify(ACTIVITIES));
    }
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Helper to format date keys
  const formatDateKey = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // Generate calendar days
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells = [];

    // Previous month padding days
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthDays - i);
      cells.push({ date, isCurrentMonth: false, key: formatDateKey(date) });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const date = new Date(year, month, i);
      cells.push({ date, isCurrentMonth: true, key: formatDateKey(date) });
    }

    // Next month padding days to complete grid multiple of 7
    const remainingCells = 42 - cells.length;
    for (let i = 1; i <= remainingCells; i++) {
      const date = new Date(year, month + 1, i);
      cells.push({ date, isCurrentMonth: false, key: formatDateKey(date) });
    }

    return cells;
  }, [currentDate]);

  // Group activities by date key (supporting date ranges)
  const activitiesByDate = useMemo(() => {
    const map: Record<string, Activity[]> = {};
    
    activities.forEach((act) => {
      const start = new Date(act.dateFrom + 'T00:00:00');
      const end = act.dateTo ? new Date(act.dateTo + 'T00:00:00') : start;
      
      const current = new Date(start);
      while (current <= end) {
        const yyyy = current.getFullYear();
        const mm = String(current.getMonth() + 1).padStart(2, '0');
        const dd = String(current.getDate()).padStart(2, '0');
        const dateKey = `${yyyy}-${mm}-${dd}`;
        
        if (!map[dateKey]) {
          map[dateKey] = [];
        }
        if (!map[dateKey].some(a => a.id === act.id)) {
          map[dateKey].push(act);
        }
        
        current.setDate(current.getDate() + 1);
      }
    });
    
    return map;
  }, [activities]);

  const handleOpenAddModal = () => {
    setFormTitle('');
    setFormCategory('training');
    setFormDateFrom(selectedDateKey);
    setFormDateTo('');
    setFormTimeFrom('');
    setFormTimeTo('');
    setFormLocation('');
    setFormDescription('');
    setIsAddModalOpen(true);
  };

  const handleSaveActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('Activity title is required.', 'error');
      return;
    }
    if (!formDateFrom) {
      showToast('Start date is required.', 'error');
      return;
    }
    if (formDateTo && formDateTo < formDateFrom) {
      showToast('End date cannot be before start date.', 'error');
      return;
    }

    const newActivity: Activity = {
      id: `act_${Date.now()}`,
      title: formTitle.trim(),
      dateFrom: formDateFrom,
      dateTo: formDateTo || undefined,
      timeFrom: formTimeFrom || undefined,
      timeTo: formTimeTo || undefined,
      location: formLocation.trim() || 'N/A',
      category: formCategory,
      description: formDescription.trim()
    };

    const updated = [newActivity, ...activities];
    setActivities(updated);
    localStorage.setItem('hrmdo_calendar_activities', JSON.stringify(updated));
    
    setIsAddModalOpen(false);
    setSelectedActivity(newActivity);
    showToast('Activity added successfully', 'success');
  };

  const handleDeleteActivity = (id: string) => {
    setActivityToDeleteId(id);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!activityToDeleteId) return;

    const updated = activities.filter((act) => act.id !== activityToDeleteId);
    setActivities(updated);
    localStorage.setItem('hrmdo_calendar_activities', JSON.stringify(updated));
    setSelectedActivity(null);
    setIsDeleteModalOpen(false);
    setActivityToDeleteId(null);
    showToast('Activity deleted successfully', 'success');
  };

  // Partition the 42 cells into 6 weeks (7 days each)
  const weeks = useMemo(() => {
    const list = [];
    for (let i = 0; i < calendarCells.length; i += 7) {
      list.push(calendarCells.slice(i, i + 7));
    }
    return list;
  }, [calendarCells]);

  return (
    <div className="activities-page">
      <div className="activities-page__header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 className="activities-page__title">Calendar of Activities</h1>
            <p className="activities-page__subtitle">View and monitor upcoming corporate events, training sessions, and holidays</p>
          </div>
          {isAdmin && (
            <Button variant="primary" onClick={handleOpenAddModal} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MdAdd size={20} />
              <span>Add Activity</span>
            </Button>
          )}
        </div>
      </div>

      <div className="activities-page__split">
        {/* Left Side: Calendar Grid */}
        <Card className="activities-card">
          <div className="activities-card__header">
            <div className="activities-card__month-title">
              <MdCalendarToday className="activities-card__title-icon" />
              <span>{MONTHS[month]} {year}</span>
            </div>
            <div className="activities-card__nav">
              <Button variant="secondary" size="sm" onClick={prevMonth}>
                <MdChevronLeft size={20} />
              </Button>
              <Button variant="secondary" size="sm" onClick={nextMonth}>
                <MdChevronRight size={20} />
              </Button>
            </div>
          </div>

          <div className="activities-grid-header">
            {DAYS_OF_WEEK.map((day) => (
              <div key={day} className="activities-grid__weekday">{day}</div>
            ))}
          </div>

          <div className="activities-weeks-container">
            {weeks.map((week, weekIndex) => {
              const weekDays = week.map(c => c.key);
              const weekEvents: Activity[] = [];
              const eventIds = new Set<string>();
              
              weekDays.forEach((dayKey) => {
                const dayActs = activitiesByDate[dayKey] || [];
                dayActs.forEach((act) => {
                  if (!eventIds.has(act.id)) {
                    eventIds.add(act.id);
                    weekEvents.push(act);
                  }
                });
              });

              // Sort events: longer span first, then start date
              weekEvents.sort((a, b) => {
                const aStart = a.dateFrom;
                const bStart = b.dateFrom;
                if (aStart !== bStart) return aStart.localeCompare(bStart);
                const aEnd = a.dateTo || a.dateFrom;
                const bEnd = b.dateTo || b.dateFrom;
                return bEnd.localeCompare(aEnd);
              });

              const tracks: { event: Activity; trackIndex: number; startCol: number; span: number }[] = [];
              weekEvents.forEach((act) => {
                let startCol = -1;
                let endCol = -1;
                for (let i = 0; i < 7; i++) {
                  const dayKey = weekDays[i];
                  const isEventOnDay = (activitiesByDate[dayKey] || []).some(a => a.id === act.id);
                  if (isEventOnDay) {
                    if (startCol === -1) startCol = i;
                    endCol = i;
                  }
                }

                if (startCol !== -1) {
                  const span = endCol - startCol + 1;
                  let trackIndex = 0;
                  while (true) {
                    const hasOverlap = tracks.some(t => 
                      t.trackIndex === trackIndex && 
                      !(startCol > (t.startCol + t.span - 1) || (startCol + span - 1) < t.startCol)
                    );
                    if (!hasOverlap) break;
                    trackIndex++;
                  }
                  tracks.push({ event: act, trackIndex, startCol, span });
                }
              });

              const maxTrack = tracks.reduce((max, t) => Math.max(max, t.trackIndex), -1);
              const weekHeight = Math.max(120, 38 + (maxTrack + 1) * 30);

              return (
                <div key={weekIndex} className="activities-week" style={{ height: `${weekHeight}px` }}>
                  {/* Days background grid */}
                  <div className="activities-week__days">
                    {week.map(({ date, isCurrentMonth, key }) => {
                      const isToday = key === formatDateKey(new Date());
                      const isSelected = key === selectedDateKey;
                      return (
                        <div
                          key={key}
                          className={`activities-day 
                            ${isCurrentMonth ? 'activities-day--current' : 'activities-day--padding'}
                            ${isToday ? 'activities-day--today' : ''}
                            ${isSelected ? 'activities-day--selected' : ''}
                          `}
                          onClick={() => {
                            setSelectedDateKey(key);
                            setSelectedActivity(null);
                          }}
                        >
                          <span className="activities-day__number">{date.getDate()}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Events continuous list (rendered absolute directly on the week container) */}
                  {tracks.map((track) => {
                    const leftPercent = (track.startCol / 7) * 100;
                    const widthPercent = (track.span / 7) * 100;
                    const topOffset = 34 + track.trackIndex * 28;

                    return (
                      <div
                        key={track.event.id}
                        className={`activities-event-bar activities-event-bar--${track.event.category}`}
                        style={{
                          left: `calc(${leftPercent}% + 4px)`,
                          width: `calc(${widthPercent}% - 8px)`,
                          top: `${topOffset}px`,
                          position: 'absolute'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDateKey(track.event.dateFrom);
                          setSelectedActivity(track.event);
                        }}
                        title={`${track.event.title} (${track.event.timeFrom || 'All Day'})`}
                      >
                        {track.event.timeFrom ? (
                          <>
                            <span className="activities-event-bar__time">{track.event.timeFrom}</span>
                            <span className="activities-event-bar__title">{track.event.title}</span>
                          </>
                        ) : (
                          <span className="activities-event-bar__title">{track.event.title}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="activities-legend">
            <span className="activities-legend__item"><span className="activities-legend__color activities-legend__color--training"></span> Training</span>
            <span className="activities-legend__item"><span className="activities-legend__color activities-legend__color--holiday"></span> Holidays</span>
            <span className="activities-legend__item"><span className="activities-legend__color activities-legend__color--meeting"></span> Meetings</span>
            <span className="activities-legend__item"><span className="activities-legend__color activities-legend__color--social"></span> Social Events</span>
            <span className="activities-legend__item"><span className="activities-legend__color activities-legend__color--medical"></span> Medical</span>
          </div>
        </Card>

        {/* Right Side: Event Details Panel */}
        <Card className="details-panel">
          <h3 className="details-panel__title">
            <MdEvent className="details-panel__title-icon" />
            <span>Activity Details</span>
          </h3>

          {selectedActivity ? (
            <div className="details-panel__content">
              <div className={`details-panel__category-badge details-panel__category-badge--${selectedActivity.category}`}>
                {selectedActivity.category.toUpperCase()}
              </div>
              <h4 className="details-panel__activity-title">{selectedActivity.title}</h4>
              
              <div className="details-panel__meta">
                <div className="details-panel__meta-item">
                  <MdCalendarToday className="details-panel__meta-icon" />
                  <span>
                    {new Date(selectedActivity.dateFrom + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    {selectedActivity.dateTo && ` - ${new Date(selectedActivity.dateTo + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
                  </span>
                </div>
                <div className="details-panel__meta-item">
                  <MdAccessTime className="details-panel__meta-icon" />
                  <span>
                    {selectedActivity.timeFrom && selectedActivity.timeTo 
                      ? `${selectedActivity.timeFrom} - ${selectedActivity.timeTo}`
                      : selectedActivity.timeFrom 
                        ? `Starts at ${selectedActivity.timeFrom}`
                        : 'All Day'}
                  </span>
                </div>
                <div className="details-panel__meta-item">
                  <MdLocationOn className="details-panel__meta-icon" />
                  <span>{selectedActivity.location}</span>
                </div>
              </div>

              <div className="details-panel__divider" />
              <p className="details-panel__description">{selectedActivity.description}</p>

              {isAdmin && (
                <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteActivity(selectedActivity.id)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <span>🗑️ Delete Activity</span>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="details-panel__empty">
              <MdEvent size={48} className="details-panel__empty-icon" />
              <p>Select a marked date on the calendar to view activity details.</p>
              {isAdmin && (
                <Button variant="secondary" size="sm" onClick={handleOpenAddModal} style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <MdAdd size={16} />
                  <span>Add Activity on Selected Date</span>
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Add Activity Modal (Admins only) */}
      {isAdmin && (
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Add New Activity"
          size="md"
        >
          <form onSubmit={handleSaveActivity} className="activity-form">
            <div className="activity-form__group">
              <label className="activity-form__label">Activity Title *</label>
              <input
                type="text"
                className="activity-form__input"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Staff Training Session"
                required
              />
            </div>

            <div className="activity-form__row">
              <div className="activity-form__group">
                <label className="activity-form__label">Date From *</label>
                <input
                  type="date"
                  className="activity-form__input"
                  value={formDateFrom}
                  onChange={(e) => setFormDateFrom(e.target.value)}
                  required
                />
              </div>

              <div className="activity-form__group">
                <label className="activity-form__label">Date To (Optional)</label>
                <input
                  type="date"
                  className="activity-form__input"
                  value={formDateTo}
                  onChange={(e) => setFormDateTo(e.target.value)}
                />
              </div>
            </div>

            <div className="activity-form__row">
              <div className="activity-form__group">
                <label className="activity-form__label">Category *</label>
                <select
                  className="activity-form__input"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as any)}
                >
                  <option value="training">Training</option>
                  <option value="holiday">Holiday</option>
                  <option value="meeting">Meeting</option>
                  <option value="social">Social Event</option>
                  <option value="medical">Medical</option>
                </select>
              </div>

              <div className="activity-form__group">
                <label className="activity-form__label">Location</label>
                <input
                  type="text"
                  className="activity-form__input"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="e.g. Conference Room A"
                />
              </div>
            </div>

            <div className="activity-form__row">
              <div className="activity-form__group">
                <label className="activity-form__label">Time From (Optional)</label>
                <select
                  className="activity-form__input"
                  value={formTimeFrom}
                  onChange={(e) => setFormTimeFrom(e.target.value)}
                >
                  <option value="">-- : -- (All Day)</option>
                  {TIME_OPTIONS.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>

              <div className="activity-form__group">
                <label className="activity-form__label">Time To (Optional)</label>
                <select
                  className="activity-form__input"
                  value={formTimeTo}
                  onChange={(e) => setFormTimeTo(e.target.value)}
                >
                  <option value="">-- : -- (All Day)</option>
                  {TIME_OPTIONS.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="activity-form__group">
              <label className="activity-form__label">Description</label>
              <textarea
                className="activity-form__textarea"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Details about the activity..."
                rows={4}
              />
            </div>

            <div className="activity-form__actions">
              <Button type="button" variant="secondary" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Activity
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal (Admins only) */}
      {isAdmin && isDeleteModalOpen && (
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Confirm Deletion"
          size="sm"
        >
          <div style={{ padding: '12px 0', textAlign: 'center' }}>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
              Are you sure you want to delete this activity? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
