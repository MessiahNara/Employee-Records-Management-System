import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import SearchableDropdown from '../components/ui/SearchableDropdown';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import {
  MdFolderOpen, MdAdd, MdDelete, MdEdit, MdSearch,
  MdFolder, MdAssignment, MdBusiness, MdClass, MdCancel
} from 'react-icons/md';
import './File201.css';

interface EmployeeMini {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  officeName: string;
  position: string;
  file201Status: string;
}

interface YellowBox {
  id: string;
  boxLabel: string;
  office: string;
  type: string;
  color?: string;
  employees: EmployeeMini[];
}

function File201() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [boxes, setBoxes] = useState<YellowBox[]>([]);
  const [loading, setLoading] = useState(false);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [officeFilter, setOfficeFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, officeFilter, typeFilter]);

  // Box Modal & Selection State
  const [isBoxModalOpen, setIsBoxModalOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<YellowBox | null>(null);
  const [boxLabel, setBoxLabel] = useState('');
  const [office, setOffice] = useState('');
  const [boxType, setBoxType] = useState(''); // R1, R2, Non-Regular, etc.
  const [boxColor, setBoxColor] = useState('#facc15');

  // Bulk Box Selection & Delete state
  const [checkedBoxIds, setCheckedBoxIds] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const getBoxStyleVariables = (colorHex: string) => {
    const colorMap: Record<string, { light: string; border: string; lidStart: string; lidEnd: string; lidBorder: string; textHighlight: string }> = {
      '#facc15': { // Yellow
        light: '#fef08a',
        border: '#ca8a04',
        lidStart: '#d97706',
        lidEnd: '#b45309',
        lidBorder: '#78350f',
        textHighlight: '#ca8a04',
      },
      '#60a5fa': { // Blue
        light: '#93c5fd',
        border: '#2563eb',
        lidStart: '#3b82f6',
        lidEnd: '#1d4ed8',
        lidBorder: '#1e3a8a',
        textHighlight: '#2563eb',
      },
      '#4ade80': { // Green
        light: '#86efac',
        border: '#16a34a',
        lidStart: '#22c55e',
        lidEnd: '#15803d',
        lidBorder: '#14532d',
        textHighlight: '#16a34a',
      },
      '#f87171': { // Red
        light: '#fca5a5',
        border: '#dc2626',
        lidStart: '#ef4444',
        lidEnd: '#b91c1c',
        lidBorder: '#7f1d1d',
        textHighlight: '#dc2626',
      },
      '#c084fc': { // Purple
        light: '#d8b4fe',
        border: '#9333ea',
        lidStart: '#a855f7',
        lidEnd: '#7e22ce',
        lidBorder: '#581c87',
        textHighlight: '#9333ea',
      },
      '#fb923c': { // Orange
        light: '#fdba74',
        border: '#ea580c',
        lidStart: '#f97316',
        lidEnd: '#c2410c',
        lidBorder: '#7c2d12',
        textHighlight: '#ea580c',
      },
    };

    const config = colorMap[colorHex] || colorMap['#facc15'];
    return {
      '--box-color': colorHex,
      '--box-color-light': config.light,
      '--box-color-border': config.border,
      '--box-lid-start': config.lidStart,
      '--box-lid-end': config.lidEnd,
      '--box-lid-border': config.lidBorder,
      '--box-text-highlight': config.textHighlight,
    } as React.CSSProperties;
  };

  // Employee Assignment Modal State
  const [assigningBox, setAssigningBox] = useState<YellowBox | null>(null);
  const [allEmployees, setAllEmployees] = useState<EmployeeMini[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [suggestions, setSuggestions] = useState<EmployeeMini[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef<HTMLDivElement>(null);

  // Custom Removal Confirm State
  const [removeTarget, setRemoveTarget] = useState<{ boxId: string; employeeId: string; employeeName: string } | null>(null);
  const [deleteBoxTarget, setDeleteBoxTarget] = useState<YellowBox | null>(null);

  // Bulk selection state
  const [checkedEmployeeIds, setCheckedEmployeeIds] = useState<string[]>([]);
  const [isDraggingEmployee, setIsDraggingEmployee] = useState(false);
  const [addModalOfficeFilter, setAddModalOfficeFilter] = useState('All');

  useEffect(() => {
    setCheckedEmployeeIds([]);
    setAddModalOfficeFilter('All');
  }, [assigningBox]);

  // Drag over pagination timer
  const dragPageTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (dragPageTimerRef.current) {
        clearTimeout(dragPageTimerRef.current);
      }
    };
  }, []);

  // Load data
  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await api.yellowBoxes.getAll();
      const sorted = [...data].sort((a: any, b: any) =>
        (a.boxLabel || '').localeCompare(b.boxLabel || '', undefined, { numeric: true, sensitivity: 'base' })
      );
      setBoxes(sorted);
    } catch (err) {
      console.error(err);
      showToast('Failed to load boxes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle highlight pagination jump
  useEffect(() => {
    if (highlightId && boxes.length > 0) {
      const matchingBoxes = boxes.filter(box => {
        const matchSearch = box.boxLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
          box.office.toLowerCase().includes(searchTerm.toLowerCase()) ||
          box.employees.some(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchOffice = officeFilter === 'All' || box.office === officeFilter;
        const matchType = typeFilter === 'All' || box.type === typeFilter;
        return matchSearch && matchOffice && matchType;
      });

      const idx = matchingBoxes.findIndex(b => b.id === highlightId);
      if (idx !== -1) {
        const targetPage = Math.floor(idx / itemsPerPage) + 1;
        setCurrentPage(targetPage);
      }
    }
  }, [highlightId, boxes, searchTerm, officeFilter, typeFilter]);

  // Scroll to highlighted box
  useEffect(() => {
    if (highlightId) {
      const timer = setTimeout(() => {
        const element = document.querySelector('.yellow-box-container--highlighted');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [highlightId, currentPage]);

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch all employees when assigning
  useEffect(() => {
    if (assigningBox) {
      api.employee.getAll({ status: 'Active' })
        .then((data) => {
          // Filter out employees already in some box
          // We can also allow re-assigning them
          setAllEmployees(data);
        })
        .catch(() => showToast('Failed to load employee list.', 'error'));
    }
  }, [assigningBox]);

  // Autocomplete suggestions
  useEffect(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query && addModalOfficeFilter === 'All') {
      setSuggestions([]);
      return;
    }
    const filtered = allEmployees.filter(emp => {
      const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
      const matchSearch = !query || fullName.includes(query) || emp.id.toLowerCase().includes(query);
      const matchOffice = addModalOfficeFilter === 'All' || emp.officeName === addModalOfficeFilter;
      const alreadyInCurrent = assigningBox?.employees.some(e => e.id === emp.id);
      return matchSearch && matchOffice && !alreadyInCurrent;
    });
    setSuggestions(filtered.slice(0, 10));
  }, [employeeSearch, addModalOfficeFilter, allEmployees, assigningBox]);

  // Close autocomplete on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateOrUpdateBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boxLabel.trim() || !office.trim() || !boxType) {
      showToast('Please fill in all fields.', 'warning');
      return;
    }

    try {
      if (editingBox) {
        await api.yellowBoxes.update(editingBox.id, {
          boxLabel: boxLabel.trim(),
          office: office.trim().toUpperCase(),
          type: boxType,
          color: boxColor,
        });
        showToast('Box updated successfully.', 'success');
      } else {
        await api.yellowBoxes.create({
          boxLabel: boxLabel.trim(),
          office: office.trim().toUpperCase(),
          type: boxType,
          color: boxColor,
        });
        showToast('Box created successfully.', 'success');
      }
      setIsBoxModalOpen(false);
      setEditingBox(null);
      setBoxLabel('');
      setOffice('');
      setBoxType('R1');
      fetchData();
    } catch (err) {
      showToast('Operation failed.', 'error');
    }
  };

  const handleEditBoxClick = (box: YellowBox) => {
    setEditingBox(box);
    setBoxLabel(box.boxLabel);
    setOffice(box.office);
    setBoxType(box.type);
    setBoxColor(box.color || '#facc15');
    setIsBoxModalOpen(true);
  };

  const handleDeleteBox = async (id: string) => {
    try {
      await api.yellowBoxes.remove(id);
      showToast('Box deleted successfully.', 'success');
      setCheckedBoxIds(prev => prev.filter(boxId => boxId !== id));
      fetchData();
    } catch {
      showToast('Failed to delete Box.', 'error');
    }
  };

  const handleBulkDeleteBoxes = async () => {
    if (checkedBoxIds.length === 0) return;
    try {
      await Promise.all(checkedBoxIds.map(id => api.yellowBoxes.remove(id)));
      showToast(`Successfully deleted ${checkedBoxIds.length} box(es).`, 'success');
      setCheckedBoxIds([]);
      setIsBulkDeleteModalOpen(false);
      fetchData();
    } catch {
      showToast('Failed to delete selected boxes.', 'error');
    }
  };

  const handleAddEmployee = async (employeeId: string) => {
    if (!assigningBox) return;
    try {
      await api.yellowBoxes.addEmployee(assigningBox.id, employeeId);
      showToast('Employee added to box.', 'success');
      setEmployeeSearch('');
      setShowSuggestions(false);

      // Update local state
      const updatedBoxes = await api.yellowBoxes.getAll();
      setBoxes(updatedBoxes);
      const curBox = updatedBoxes.find((b: any) => b.id === assigningBox.id);
      if (curBox) setAssigningBox(curBox);
    } catch {
      showToast('Failed to add employee.', 'error');
    }
  };

  const handleRemoveEmployee = async (boxId: string, employeeId: string) => {
    try {
      if (employeeId.startsWith('[')) {
        const ids = JSON.parse(employeeId);
        await api.yellowBoxes.bulkRemoveEmployees(boxId, ids);
        showToast('Selected files removed from box.', 'success');
      } else {
        await api.yellowBoxes.removeEmployee(boxId, employeeId);
        showToast('Employee removed from box.', 'success');
      }

      // Update local state
      const updatedBoxes = await api.yellowBoxes.getAll();
      setBoxes(updatedBoxes);
      if (assigningBox && assigningBox.id === boxId) {
        const curBox = updatedBoxes.find((b: any) => b.id === boxId);
        if (curBox) setAssigningBox(curBox);
      }
      setRemoveTarget(null);
      setCheckedEmployeeIds([]);
    } catch {
      showToast('Failed to remove employee.', 'error');
    }
  };

  // Filter boxes
  const filteredBoxes = boxes.filter(box => {
    const matchSearch = box.boxLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
      box.office.toLowerCase().includes(searchTerm.toLowerCase()) ||
      box.employees.some(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchOffice = officeFilter === 'All' || box.office === officeFilter;
    const matchType = typeFilter === 'All' || box.type === typeFilter;

    return matchSearch && matchOffice && matchType;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredBoxes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedBoxes = filteredBoxes.slice(startIndex, startIndex + itemsPerPage);

  // Unique offices and classifications for filters
  const uniqueOffices = Array.from(new Set(boxes.map(b => b.office)));
  const uniqueTypes = Array.from(new Set(boxes.map(b => b.type)));
  const uniqueEmployeeOffices = Array.from(new Set(allEmployees.map(e => e.officeName).filter(Boolean))).sort();

  return (
    <div className="file201-page">
      <div className="file201-page__header-row">
        <div className="file201-page__header">
          <h2 className="file201-page__title">
            <MdFolderOpen className="file201-page__title-icon" />
            <span>File Locator</span>
          </h2>
          <p className="file201-page__subtitle">
            Manage physical 201 records folders stored in Boxes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {filteredBoxes.length > 0 && (
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0.45rem 0.85rem',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              userSelect: 'none',
              height: '36px',
              boxSizing: 'border-box'
            }}>
              <input
                type="checkbox"
                checked={paginatedBoxes.length > 0 && paginatedBoxes.every(b => checkedBoxIds.includes(b.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    const currentIds = paginatedBoxes.map(b => b.id);
                    setCheckedBoxIds(prev => Array.from(new Set([...prev, ...currentIds])));
                  } else {
                    const currentIds = paginatedBoxes.map(b => b.id);
                    setCheckedBoxIds(prev => prev.filter(id => !currentIds.includes(id)));
                  }
                }}
                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#3b82f6' }}
              />
              Select Page ({paginatedBoxes.length})
            </label>
          )}
          {checkedBoxIds.length > 0 && (
            <Button
              variant="danger"
              onClick={() => setIsBulkDeleteModalOpen(true)}
            >
              <MdDelete size={18} style={{ marginRight: '6px' }} />
              Delete Selected ({checkedBoxIds.length})
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => { setEditingBox(null); setBoxLabel(''); setOffice(''); setBoxType(''); setBoxColor('#facc15'); setIsBoxModalOpen(true); }}
          >
            <MdAdd size={20} style={{ marginRight: '8px' }} /> Create Box
          </Button>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <Card className="file201-toolbar">
        <div className="file201-toolbar__search">
          <MdSearch className="file201-toolbar__search-icon" />
          <input
            type="text"
            placeholder="Search boxes, offices, or employee names..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="file201-toolbar__filters">
          <div className="file201-filter-group" style={{ minWidth: '220px' }}>
            <label>Office/Hospital</label>
            <SearchableDropdown
              options={uniqueOffices}
              value={officeFilter}
              onChange={(val) => setOfficeFilter(val || 'All')}
              placeholder="All Offices/Hospitals"
            />
          </div>
          <div className="file201-filter-group">
            <label>Classification</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="All">All Classifications</option>
              {uniqueTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Grid of Boxes */}
      {filteredBoxes.length === 0 ? (
        <Card className="file201-card-empty">
          <MdFolderOpen size={64} style={{ color: 'var(--text-tertiary)', marginBottom: '16px', opacity: 0.5 }} />
          <h3>No Boxes Found</h3>
          <p>Create a box to start digitizing and sorting your physical 201 records.</p>
        </Card>
      ) : (
        <>
          <div className="file201-grid">
            {paginatedBoxes.map((box) => (
              <div
                key={box.id}
                className={`yellow-box-container ${highlightId === box.id ? 'yellow-box-container--highlighted' : ''}`}
                style={getBoxStyleVariables(box.color || '#facc15')}
              >
                {/* Physical Storage Box Lid */}
                <div className="yellow-box-lid">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={checkedBoxIds.includes(box.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (e.target.checked) {
                          setCheckedBoxIds(prev => [...prev, box.id]);
                        } else {
                          setCheckedBoxIds(prev => prev.filter(id => id !== box.id));
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title="Select box for bulk delete"
                      style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#3b82f6' }}
                    />
                    <div className="yellow-box-lid__title">201 RECORD HOLDER</div>
                  </div>
                  <div className="yellow-box-lid__actions">
                    <button className="yellow-box-action-btn" onClick={() => handleEditBoxClick(box)} title="Edit Box Info">
                      <MdEdit size={14} />
                    </button>
                    <button className="yellow-box-action-btn yellow-box-action-btn--delete" onClick={() => setDeleteBoxTarget(box)} title="Delete Box">
                      <MdDelete size={14} />
                    </button>
                  </div>
                </div>

                {/* Physical Storage Box Body */}
                <Card
                  className={`yellow-box-card ${isDraggingEmployee ? 'yellow-box-card--drag-active' : ''}`}
                  onClick={() => setAssigningBox(box)}
                  title="Click to manage files, or drag an employee here to assign"
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnter={(e) => e.currentTarget.classList.add('yellow-box-card--drag-over')}
                  onDragLeave={(e) => e.currentTarget.classList.remove('yellow-box-card--drag-over')}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('yellow-box-card--drag-over');
                    const employeeIdData = e.dataTransfer.getData('text/plain');
                    if (employeeIdData) {
                      try {
                        let ids: string[] = [];
                        try {
                          ids = JSON.parse(employeeIdData);
                          if (!Array.isArray(ids)) ids = [employeeIdData];
                        } catch {
                          ids = [employeeIdData];
                        }

                        if (ids.length > 0) {
                          await api.yellowBoxes.bulkAddEmployees(box.id, ids);
                          showToast(`Transferred ${ids.length} employee file(s) to Box ${box.boxLabel}`, 'success');
                          fetchData();
                          if (assigningBox) {
                            const updated = await api.yellowBoxes.getById(assigningBox.id);
                            setAssigningBox(updated);
                          }
                        }
                      } catch {
                        showToast('Failed to assign employee file(s).', 'error');
                      }
                    }
                  }}
                >
                  {/* Side Handle Cutout */}
                  <div className="yellow-box-card__handle" />

                  {/* White Paper Inventory Label */}
                  <div className="yellow-box-card__label">
                    <div className="yellow-box-card__label-title">{box.boxLabel}</div>
                    <div className="yellow-box-card__label-office">{box.office}</div>
                    <div className="yellow-box-card__label-type">{box.type}</div>
                  </div>

                  {/* Count sticker */}
                  <div className="yellow-box-card__counter">
                    <span>QTY: {box.employees.length}</span>
                  </div>
                </Card>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="file201-pagination">
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => {
                  if (currentPage > 1) {
                    dragPageTimerRef.current = setTimeout(() => {
                      setCurrentPage(p => Math.max(1, p - 1));
                    }, 800);
                  }
                }}
                onDragLeave={() => {
                  if (dragPageTimerRef.current) {
                    clearTimeout(dragPageTimerRef.current);
                    dragPageTimerRef.current = null;
                  }
                }}
                onDrop={() => {
                  if (dragPageTimerRef.current) {
                    clearTimeout(dragPageTimerRef.current);
                    dragPageTimerRef.current = null;
                  }
                }}
              >
                Previous
              </Button>
              <span className="file201-pagination__info">
                Page <strong>{currentPage}</strong> of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => {
                  if (currentPage < totalPages) {
                    dragPageTimerRef.current = setTimeout(() => {
                      setCurrentPage(p => Math.min(totalPages, p + 1));
                    }, 800);
                  }
                }}
                onDragLeave={() => {
                  if (dragPageTimerRef.current) {
                    clearTimeout(dragPageTimerRef.current);
                    dragPageTimerRef.current = null;
                  }
                }}
                onDrop={() => {
                  if (dragPageTimerRef.current) {
                    clearTimeout(dragPageTimerRef.current);
                    dragPageTimerRef.current = null;
                  }
                }}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Create / Edit Box Modal */}
      <Modal
        isOpen={isBoxModalOpen}
        onClose={() => setIsBoxModalOpen(false)}
        title={editingBox ? 'Update Box Details' : 'Create New Box'}
        size="sm"
      >
        <form onSubmit={handleCreateOrUpdateBox} className="file201-modal-form">
          <Input
            label="Box Label / Name (e.g. A-D, Box 1)"
            placeholder="Enter box label"
            value={boxLabel}
            onChange={(e) => setBoxLabel(e.target.value)}
            required
          />
          <Input
            label="Office Abbreviation (e.g. GSO, HR, COA)"
            placeholder="Enter office shortcut"
            value={office}
            onChange={(e) => setOffice(e.target.value)}
            required
          />

          <Input
            label="Classification / Type (e.g. Regular, Non-Regular, Co-terminus)"
            placeholder="Enter classification"
            value={boxType}
            onChange={(e) => setBoxType(e.target.value)}
            required
          />

          <div className="file201-form-group">
            <label className="file201-form-label">Box Cardboard Color</label>
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px', alignItems: 'center' }}>
              {[
                { hex: '#facc15', label: 'Yellow' },
                { hex: '#60a5fa', label: 'Blue' },
                { hex: '#4ade80', label: 'Green' },
                { hex: '#f87171', label: 'Red' },
                { hex: '#c084fc', label: 'Purple' },
                { hex: '#fb923c', label: 'Orange' },
              ].map(c => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  onClick={() => setBoxColor(c.hex)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: c.hex,
                    border: boxColor === c.hex ? '3px solid var(--text-primary)' : '2px solid var(--border-color)',
                    cursor: 'pointer',
                    boxShadow: boxColor === c.hex ? '0 0 8px rgba(0,0,0,0.2)' : 'none',
                    transition: 'all 0.2s',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="file201-form-actions">
            <Button variant="ghost" type="button" onClick={() => setIsBoxModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {editingBox ? 'Save Changes' : 'Create Box'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add / Manage Employees Modal */}
      <Modal
        isOpen={!!assigningBox}
        onClose={() => setAssigningBox(null)}
        title={`Manage Files in Box: ${assigningBox?.boxLabel} (${assigningBox?.office})`}
        size="lg"
      >
        {assigningBox && (
          <div className="assign-modal-content">
            <div className="assign-modal-search-container" ref={suggestionRef}>
              <label className="assign-modal-label">Search Employee to Add to Box</label>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div className="assign-modal-search-input-wrapper" style={{ flex: 1 }}>
                  <MdSearch className="assign-modal-search-input-icon" />
                  <input
                    type="text"
                    placeholder="Type name or Employee ID..."
                    value={employeeSearch}
                    onChange={(e) => { setEmployeeSearch(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)}
                  />
                </div>

                <div style={{ width: '220px' }}>
                  <SearchableDropdown
                    options={uniqueEmployeeOffices}
                    value={addModalOfficeFilter === 'All' ? '' : addModalOfficeFilter}
                    onChange={(val) => {
                      setAddModalOfficeFilter(val === '' ? 'All' : val);
                      setShowSuggestions(true);
                    }}
                    placeholder="All Offices"
                  />
                </div>
              </div>

              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="assign-suggestions-dropdown">
                  {suggestions.map((emp) => (
                    <div
                      key={emp.id}
                      className="assign-suggestion-item"
                      onClick={() => handleAddEmployee(emp.id)}
                      draggable={true}
                      onDragStart={(e) => {
                        setIsDraggingEmployee(true);
                        e.dataTransfer.setData('text/plain', emp.id);
                        setTimeout(() => {
                          setAssigningBox(null);
                        }, 0);
                      }}
                      onDragEnd={() => setIsDraggingEmployee(false)}
                      style={{ cursor: 'grab' }}
                    >
                      <div className="assign-suggestion-name">
                        {emp.lastName}, {emp.firstName} {emp.middleName ? `${emp.middleName.charAt(0)}.` : ''}
                      </div>
                      <div className="assign-suggestion-meta">
                        ID: {emp.id} • {emp.officeName} • {emp.position}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Current box list inside modal */}
            <div className="assign-current-files">
              <div className="file201-modal-section-header">
                <h4>Current Files in Box ({assigningBox.employees.length})</h4>
                {assigningBox.employees.length > 0 && (
                  <div className="file201-modal-section-actions">
                    <label className="file201-modal-select-all">
                      <input
                        type="checkbox"
                        className="assign-current-checkbox"
                        checked={checkedEmployeeIds.length === assigningBox.employees.length && assigningBox.employees.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCheckedEmployeeIds(assigningBox.employees.map(emp => emp.id));
                          } else {
                            setCheckedEmployeeIds([]);
                          }
                        }}
                      />
                      Select All
                    </label>
                    {checkedEmployeeIds.length > 0 && (
                      <Button
                        variant="danger"
                        className="file201-bulk-remove-btn"
                        onClick={() => {
                          setRemoveTarget({
                            boxId: assigningBox.id,
                            employeeId: JSON.stringify(checkedEmployeeIds),
                            employeeName: `${checkedEmployeeIds.length} selected employee records`
                          });
                        }}
                      >
                        Remove Selected ({checkedEmployeeIds.length})
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="assign-current-list">
                {assigningBox.employees.length === 0 ? (
                  <p className="assign-current-empty">No files assigned to this box yet.</p>
                ) : (
                  assigningBox.employees.map((emp) => (
                    <div
                      key={emp.id}
                      className="assign-current-item"
                      draggable={true}
                      onDragStart={(e) => {
                        setIsDraggingEmployee(true);
                        const dragIds = checkedEmployeeIds.includes(emp.id)
                          ? checkedEmployeeIds
                          : [emp.id];
                        e.dataTransfer.setData('text/plain', JSON.stringify(dragIds));
                        setTimeout(() => {
                          setAssigningBox(null);
                        }, 0);
                      }}
                      onDragEnd={() => setIsDraggingEmployee(false)}
                      style={{ cursor: 'grab', display: 'flex', alignItems: 'center', gap: '12px' }}
                    >
                      <input
                        type="checkbox"
                        className="assign-current-checkbox"
                        checked={checkedEmployeeIds.includes(emp.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCheckedEmployeeIds(prev => [...prev, emp.id]);
                          } else {
                            setCheckedEmployeeIds(prev => prev.filter(id => id !== emp.id));
                          }
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div className="assign-current-name">{emp.lastName}, {emp.firstName}</div>
                        <div className="assign-current-meta">{emp.position} • {emp.officeName}</div>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setRemoveTarget({ boxId: assigningBox.id, employeeId: emp.id, employeeName: `${emp.firstName} ${emp.lastName}` })}
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Remove Employee Confirmation Modal */}
      <Modal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Confirm Removal"
        size="sm"
      >
        <div className="file201-modal-form">
          <p style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--spacing-md) 0', lineHeight: 1.5 }}>
            Are you sure you want to remove <strong>{removeTarget?.employeeName}</strong>'s 201 file from this box?
          </p>
          <div className="file201-form-actions">
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => handleRemoveEmployee(removeTarget!.boxId, removeTarget!.employeeId)}>
              Remove File
            </Button>
          </div>
        </div>
      </Modal>

      {/* Remove Employee Confirmation Modal */}
      <Modal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Confirm Removal"
        size="sm"
      >
        <div className="file201-modal-form">
          <p style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--spacing-md) 0', lineHeight: 1.5 }}>
            Are you sure you want to remove <strong>{removeTarget?.employeeName}</strong>'s 201 file from this box?
          </p>
          <div className="file201-form-actions">
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => handleRemoveEmployee(removeTarget!.boxId, removeTarget!.employeeId)}>
              Remove File
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Box Confirmation Modal */}
      <Modal
        isOpen={!!deleteBoxTarget}
        onClose={() => setDeleteBoxTarget(null)}
        title="Delete Box"
        size="sm"
      >
        <div className="file201-modal-form">
          <p style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--spacing-md) 0', lineHeight: 1.5 }}>
            Are you sure you want to delete Box <strong>{deleteBoxTarget?.boxLabel}</strong>?
            <br /><br />
            <span style={{ color: 'var(--color-danger)', fontSize: '12px', fontWeight: 600 }}>
              * Any employee files inside this box will be unassigned, but they will not be deleted from the system.
            </span>
          </p>
          <div className="file201-form-actions">
            <Button variant="ghost" onClick={() => setDeleteBoxTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => {
              if (deleteBoxTarget) {
                handleDeleteBox(deleteBoxTarget.id);
                setDeleteBoxTarget(null);
              }
            }}>
              Delete Box
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Delete Box Confirmation Modal */}
      <Modal
        isOpen={isBulkDeleteModalOpen}
        onClose={() => setIsBulkDeleteModalOpen(false)}
        title="Bulk Delete Boxes"
        size="sm"
      >
        <div className="file201-modal-form">
          <p style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', margin: '0 0 var(--spacing-md) 0', lineHeight: 1.5 }}>
            Are you sure you want to delete <strong>{checkedBoxIds.length}</strong> selected box(es)?
            <br /><br />
            <span style={{ color: 'var(--color-danger)', fontSize: '12px', fontWeight: 600 }}>
              * Employee records inside these boxes will be unassigned from boxes, but their records will remain safely intact.
            </span>
          </p>
          <div className="file201-form-actions">
            <Button variant="ghost" onClick={() => setIsBulkDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleBulkDeleteBoxes}>
              Delete {checkedBoxIds.length} Box(es)
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default File201;
