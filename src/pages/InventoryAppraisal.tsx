import { useState, useEffect, useMemo } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SearchBar from '../components/ui/SearchBar';
import Table, { Column } from '../components/ui/Table';
import CreateRecordSeriesModal, { RecordSeriesFormData } from '../components/CreateRecordSeriesModal';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import { MdAdd, MdDelete, MdEdit, MdAssignment, MdCheckCircle, MdHourglassTop, MdArchive } from 'react-icons/md';
import './InventoryAppraisal.css';

export interface InventoryRecord {
  id: string;
  seriesTitle: string;
  classificationCategory: string;
  scopeDescription?: string;
  inclusiveDates: string;
  volume: string;
  medium: string;
  restrictions?: string;
  locationOfRecords: string;
  frequencyOfUse: string;
  duplication: string;
  appraisalCategory: string;
  utilityValue: string;
  activeDeskYrs: number;
  storageYrs: number;
  totalRetention: number;
  dispositionProvision: string;
  disposalStatus: 'Safe for Disposal' | 'Under Retention' | 'Permanent';
  createdAt: string;
  updatedAt: string;
}

function InventoryAppraisal() {
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordSeriesFormData | null>(null);

  const { showToast } = useToast();

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const data = await api.inventory.getAll();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to fetch inventory records:', err);
      showToast('Failed to load inventory records.', 'error');
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleCreateNew = () => {
    setEditingRecord(null);
    setIsModalOpen(true);
  };

  const handleEdit = (record: InventoryRecord) => {
    setEditingRecord({
      ...record,
      scopeDescription: record.scopeDescription || '',
      restrictions: record.restrictions || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (record: InventoryRecord) => {
    if (!window.confirm(`Are you sure you want to delete "${record.seriesTitle}"?`)) {
      return;
    }
    try {
      await api.inventory.delete(record.id);
      showToast('Record series entry deleted successfully.', 'success');
      fetchRecords();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete record.', 'error');
    }
  };

  const handleSaveRecord = async (data: RecordSeriesFormData) => {
    if (editingRecord?.id) {
      await api.inventory.update(editingRecord.id, data);
      showToast('Record series updated successfully!', 'success');
    } else {
      await api.inventory.create(data);
      showToast('New record series entry created successfully!', 'success');
    }
    fetchRecords();
  };

  // Metrics
  const metrics = useMemo(() => {
    const total = records.length;
    const safeForDisposal = records.filter(r => r.disposalStatus === 'Safe for Disposal').length;
    const underRetention = records.filter(r => r.disposalStatus === 'Under Retention').length;
    const permanent = records.filter(r => r.disposalStatus === 'Permanent').length;
    return { total, safeForDisposal, underRetention, permanent };
  }, [records]);

  // Filtering
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        r.seriesTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.locationOfRecords.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.dispositionProvision.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = categoryFilter === 'ALL' || r.classificationCategory === categoryFilter;
      const matchesStatus = statusFilter === 'ALL' || r.disposalStatus === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [records, searchQuery, categoryFilter, statusFilter]);

  const columns: Column<InventoryRecord>[] = [
    {
      key: 'id',
      header: 'ID / Code',
      width: '110px',
      render: (r) => <strong style={{ color: 'var(--color-primary)' }}>{r.id}</strong>,
    },
    {
      key: 'seriesTitle',
      header: 'Record Series Title & Scope',
      width: '280px',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.seriesTitle}</div>
          {r.scopeDescription && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {r.scopeDescription}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'classificationCategory',
      header: 'Category',
      width: '140px',
      render: (r) => (
        <span style={{ fontSize: '0.82rem', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-tertiary)' }}>
          {r.classificationCategory}
        </span>
      ),
    },
    {
      key: 'inclusiveDates',
      header: 'Inclusive Dates & Volume',
      width: '160px',
      render: (r) => (
        <div style={{ fontSize: '0.85rem' }}>
          <div>📅 {r.inclusiveDates}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>📦 {r.volume}</div>
        </div>
      ),
    },
    {
      key: 'locationOfRecords',
      header: 'Location & Medium',
      width: '160px',
      render: (r) => (
        <div style={{ fontSize: '0.85rem' }}>
          <div>📍 {r.locationOfRecords}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>📄 {r.medium}</div>
        </div>
      ),
    },
    {
      key: 'totalRetention',
      header: 'Retention Yrs',
      width: '130px',
      render: (r) => (
        <div style={{ fontSize: '0.85rem' }}>
          <strong>{r.totalRetention} yrs</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Desk: {r.activeDeskYrs}y | Store: {r.storageYrs}y
          </div>
        </div>
      ),
    },
    {
      key: 'disposalStatus',
      header: 'Disposal Evaluation',
      width: '160px',
      render: (r) => {
        if (r.disposalStatus === 'Safe for Disposal') {
          return <span className="inventory-badge inventory-badge--safe">🟢 Safe for Disposal</span>;
        }
        if (r.disposalStatus === 'Permanent') {
          return <span className="inventory-badge inventory-badge--permanent">🔵 Permanent Record</span>;
        }
        return <span className="inventory-badge inventory-badge--retention">⏳ Under Retention</span>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '100px',
      render: (r) => (
        <div className="inventory-page__action-btns">
          <button
            className="inventory-page__action-btn"
            onClick={(e) => { e.stopPropagation(); handleEdit(r); }}
            title="Edit record series"
          >
            <MdEdit />
          </button>
          <button
            className="inventory-page__action-btn"
            onClick={(e) => { e.stopPropagation(); handleDelete(r); }}
            title="Delete record series"
            style={{ color: '#ef4444' }}
          >
            <MdDelete />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="inventory-page">
      {/* Header & Add Button */}
      <div className="inventory-page__header">
        <div>
          <h1 className="inventory-page__title">Inventory & Records Appraisal</h1>
          <p className="inventory-page__subtitle">
            Manage record series inventory, retention schedules, and evaluate records safe for disposal.
          </p>
        </div>

        <Button variant="primary" onClick={handleCreateNew}>
          <MdAdd style={{ marginRight: '0.35rem', fontSize: '1.2rem' }} /> Create New Records Series Entry
        </Button>
      </div>

      {/* KPI Metrics */}
      <div className="inventory-page__kpi-grid">
        <Card hoverable className="inventory-kpi-card inventory-kpi-card--blue">
          <div className="inventory-kpi-card__inner">
            <div className="inventory-kpi-card__icon-wrapper inventory-kpi-card__icon-wrapper--blue">
              <MdAssignment />
            </div>
            <div className="inventory-kpi-card__info">
              <span className="inventory-kpi-card__label">Total Series Entries</span>
              <span className="inventory-kpi-card__value">{metrics.total}</span>
            </div>
          </div>
        </Card>

        <Card hoverable className="inventory-kpi-card inventory-kpi-card--green">
          <div className="inventory-kpi-card__inner">
            <div className="inventory-kpi-card__icon-wrapper inventory-kpi-card__icon-wrapper--green">
              <MdCheckCircle />
            </div>
            <div className="inventory-kpi-card__info">
              <span className="inventory-kpi-card__label">Safe for Disposal</span>
              <span className="inventory-kpi-card__value inventory-kpi-card__value--green">{metrics.safeForDisposal}</span>
            </div>
          </div>
        </Card>

        <Card hoverable className="inventory-kpi-card inventory-kpi-card--amber">
          <div className="inventory-kpi-card__inner">
            <div className="inventory-kpi-card__icon-wrapper inventory-kpi-card__icon-wrapper--amber">
              <MdHourglassTop />
            </div>
            <div className="inventory-kpi-card__info">
              <span className="inventory-kpi-card__label">Under Retention</span>
              <span className="inventory-kpi-card__value inventory-kpi-card__value--amber">{metrics.underRetention}</span>
            </div>
          </div>
        </Card>

        <Card hoverable className="inventory-kpi-card inventory-kpi-card--indigo">
          <div className="inventory-kpi-card__inner">
            <div className="inventory-kpi-card__icon-wrapper inventory-kpi-card__icon-wrapper--indigo">
              <MdArchive />
            </div>
            <div className="inventory-kpi-card__info">
              <span className="inventory-kpi-card__label">Permanent Records</span>
              <span className="inventory-kpi-card__value inventory-kpi-card__value--indigo">{metrics.permanent}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <Card>
        <div className="inventory-page__controls">
          <div className="inventory-page__search">
            <SearchBar
              placeholder="Search by series title, ID, location, disposition provision..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery('')}
              fullWidth
            />
          </div>

          <div className="inventory-page__filters">
            <select
              className="inventory-page__select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              <option value="ADMINISTRATIVE">ADMINISTRATIVE</option>
              <option value="CSC GENERATED RECORDS">CSC GENERATED RECORDS</option>
              <option value="EMPLOYEE WELFARE, WELLNESS AND REWARDS">EMPLOYEE WELFARE, WELLNESS AND REWARDS</option>
              <option value="LEAVE RECORDS">LEAVE RECORDS</option>
              <option value="LOGBOOK">LOGBOOK</option>
              <option value="ORDERS">ORDERS</option>
              <option value="PAYROLL DRAFT ATTACHMENTS">PAYROLL DRAFT ATTACHMENTS</option>
              <option value="QUALITY MANAGEMENT SYSTEM">QUALITY MANAGEMENT SYSTEM</option>
              <option value="RECRUITMENT AND PLACEMENT">RECRUITMENT AND PLACEMENT</option>
              <option value="TRAINING AND EMPLOYEE DEVELOPMENT">TRAINING AND EMPLOYEE DEVELOPMENT</option>
              <option value="FINANCE">FINANCE</option>
              <option value="LEGAL">LEGAL</option>
              <option value="ARCHIVAL">ARCHIVAL</option>
              <option value="ISO GENERATED RECORDS">ISO GENERATED RECORDS</option>
              <option value="ISO DOCUMENTS">ISO DOCUMENTS</option>
            </select>

            <select
              className="inventory-page__select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Disposal Statuses</option>
              <option value="Safe for Disposal">🟢 Safe for Disposal</option>
              <option value="Under Retention">⏳ Under Retention</option>
              <option value="Permanent">🔵 Permanent Record</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table Data View */}
      <Card>
        <Table
          columns={columns}
          data={filteredRecords}
          keyExtractor={(r) => r.id}
          loading={isLoading}
          emptyMessage="No record series entries matching your filters."
        />
      </Card>

      {/* Create / Edit Record Series Modal */}
      <CreateRecordSeriesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveRecord}
        initialData={editingRecord}
      />
    </div>
  );
}

export default InventoryAppraisal;
