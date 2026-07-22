import React, { useState, useEffect, useMemo } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SearchBar from '../components/ui/SearchBar';
import Table, { Column } from '../components/ui/Table';
import Modal from '../components/ui/Modal';
import CreateRecordSeriesModal, { RecordSeriesFormData } from '../components/CreateRecordSeriesModal';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import { MdAdd, MdDelete, MdEdit, MdAssignment, MdCheckCircle, MdHourglassTop, MdArchive, MdWarning, MdHistory } from 'react-icons/md';
import './InventoryAppraisal.css';

export interface InventoryRecord {
  id: string;
  itemNo?: string;
  prdsGrds?: string;
  seriesTitle: string;
  division?: string;
  classificationCategory: string;
  subCategory?: string;
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

export function formatDynamicDates(datesStr: string): string {
  if (!datesStr) return '-';
  const currentYear = new Date().getFullYear();
  return datesStr.replace(/Present/gi, String(currentYear));
}

export function extractCoveredYears(datesStr: string): { years: number[]; isOngoing: boolean } {
  if (!datesStr) return { years: [], isOngoing: false };
  const currentYear = new Date().getFullYear();
  const lower = datesStr.toLowerCase();
  const isOngoing = lower.includes('present');

  const yearsSet = new Set<number>();
  const parts = datesStr.split(',');

  parts.forEach((part) => {
    const pStr = part.trim();
    const pMatches = (pStr.match(/\b\d{4}\b/g) || []).map(Number);
    if (pMatches.length >= 2) {
      const start = Math.min(pMatches[0], pMatches[1]);
      const end = Math.max(pMatches[0], pMatches[1]);
      for (let y = start; y <= end; y++) yearsSet.add(y);
    } else if (pMatches.length === 1) {
      if (pStr.toLowerCase().includes('present')) {
        for (let y = pMatches[0]; y <= currentYear; y++) yearsSet.add(y);
      } else {
        yearsSet.add(pMatches[0]);
      }
    }
  });

  return {
    years: Array.from(yearsSet).sort((a, b) => a - b),
    isOngoing,
  };
}

export function formatYearsListToDatesString(years: number[], isOngoing: boolean = false): string {
  if (years.length === 0) return isOngoing ? 'Present' : '';
  const sorted = Array.from(new Set(years)).sort((a, b) => a - b);
  const groups: number[][] = [];

  sorted.forEach((yr) => {
    if (groups.length === 0) {
      groups.push([yr]);
    } else {
      const lastGroup = groups[groups.length - 1];
      const lastYr = lastGroup[lastGroup.length - 1];
      if (yr === lastYr + 1) {
        lastGroup.push(yr);
      } else {
        groups.push([yr]);
      }
    }
  });

  const formattedParts = groups.map((grp) => {
    if (grp.length === 1) return `${grp[0]}`;
    return `${grp[0]} - ${grp[grp.length - 1]}`;
  });

  if (isOngoing && formattedParts.length > 0) {
    const lastPartIdx = formattedParts.length - 1;
    const lastGrp = groups[groups.length - 1];
    formattedParts[lastPartIdx] = `${lastGrp[0]} - Present`;
  }

  return formattedParts.join(', ');
}

export function getOngoingDisposalInfo(datesStr: string, totalRetention: number) {
  if (!datesStr || !totalRetention || totalRetention <= 0) return null;

  const currentYear = new Date().getFullYear();
  const lower = datesStr.toLowerCase();

  if (!lower.includes('present')) return null;

  const matches = datesStr.match(/\b\d{4}\b/g);
  if (!matches || matches.length === 0) return null;

  const ongoingStartYear = Number(matches[matches.length - 1]);
  if (!ongoingStartYear || isNaN(ongoingStartYear)) return null;

  const elapsedYears = currentYear - ongoingStartYear;
  if (elapsedYears < totalRetention) return null;

  // Advance ongoing start year by 1 year (e.g. 2024 - Present becomes 2025 - Present)
  const newStartYear = ongoingStartYear + 1;

  let newDatesStr = '';
  if (datesStr.includes(',')) {
    newDatesStr = datesStr.replace(new RegExp(`${ongoingStartYear}\\s*-\\s*Present`, 'i'), `${newStartYear} - Present`);
  } else {
    newDatesStr = `${newStartYear} - Present`;
  }

  return {
    ongoingStartYear,
    currentYear,
    elapsedYears,
    totalRetention,
    newStartYear,
    newDatesStr,
    isRetentionReached: true,
  };
}

function InventoryAppraisal() {
  const [records, setRecords] = useState<InventoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [mediumFilter, setMediumFilter] = useState('ALL');
  const [retentionFilter, setRetentionFilter] = useState('ALL');
  const [frequencyFilter, setFrequencyFilter] = useState('ALL');
  const [utilityFilter, setUtilityFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [divisionTab, setDivisionTab] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showEvaluateModal, setShowEvaluateModal] = useState(false);
  const [evaluatingRecord, setEvaluatingRecord] = useState<{ record: InventoryRecord; info: any } | null>(null);
  const [customDisposedYears, setCustomDisposedYears] = useState<number[]>([]);
  const [editingRecord, setEditingRecord] = useState<InventoryRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<InventoryRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<InventoryRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [disposalLogs, setDisposalLogs] = useState<any[]>([]);
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  const { showToast } = useToast();

  // Dynamic division tabs options from records
  const divisionTabs = useMemo(() => {
    const presentDivs = records.map((r) => r.division).filter(Boolean) as string[];
    const uniqueDivs = Array.from(new Set(presentDivs)).sort((a, b) => a.localeCompare(b));
    return ['ALL', ...uniqueDivs];
  }, [records]);

  const disposalEligibleRecords = useMemo(() => {
    return records.filter(r => getOngoingDisposalInfo(r.inclusiveDates, Number(r.totalRetention)) !== null);
  }, [records]);

  const fetchRecords = async () => {
    try {
      setIsLoading(true);
      const data = await api.inventory.getAll();
      setRecords(Array.isArray(data) ? data : []);
      setSelectedIds([]);
    } catch (err: any) {
      console.error('Failed to fetch inventory records:', err);
      showToast('Failed to load inventory records.', 'error');
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDisposalHistory = async () => {
    try {
      const data = await api.inventory.getDisposalHistory();
      setDisposalLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to fetch disposal history:', err);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchDisposalHistory();
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
    setViewingRecord(null);
    setIsModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingRecord) return;
    setIsDeleting(true);
    try {
      await api.inventory.delete(deletingRecord.id);
      showToast('Record series entry deleted successfully.', 'success');
      setDeletingRecord(null);
      setViewingRecord(null);
      fetchRecords();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete record.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    try {
      await api.inventory.bulkDelete(selectedIds);
      showToast(`Successfully deleted ${selectedIds.length} record series entries.`, 'success');
      setShowBulkDeleteModal(false);
      setSelectedIds([]);
      fetchRecords();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete selected records.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('ALL');
    setMediumFilter('ALL');
    setRetentionFilter('ALL');
    setFrequencyFilter('ALL');
    setUtilityFilter('ALL');
    setLocationFilter('ALL');
  };

  const hasActiveFilters =
    searchQuery !== '' ||
    categoryFilter !== 'ALL' ||
    mediumFilter !== 'ALL' ||
    retentionFilter !== 'ALL' ||
    frequencyFilter !== 'ALL' ||
    utilityFilter !== 'ALL' ||
    locationFilter !== 'ALL';

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(records.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
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

  // Analytics Metrics Calculation
  const analytics = useMemo(() => {
    const total = records.length;
    const permanent = records.filter(r => r.appraisalCategory === 'Permanent').length;
    const temporary = records.filter(r => r.appraisalCategory === 'Temporary' || r.appraisalCategory?.includes('Temporary')).length;
    const safeForDisposal = records.filter(r => r.disposalStatus === 'Safe for Disposal').length;
    const evaluateDisposalCount = records.filter(
      r => r.disposalStatus === 'Safe for Disposal' || getOngoingDisposalInfo(r.inclusiveDates, Number(r.totalRetention)) !== null
    ).length;

    // Division breakdown
    const divisionStats: Record<string, number> = {};
    records.forEach(r => {
      const div = r.division || 'Unassigned';
      divisionStats[div] = (divisionStats[div] || 0) + 1;
    });

    const divisionStatsArray = Object.keys(divisionStats).map(div => ({
      name: div,
      count: divisionStats[div],
      percentage: total > 0 ? Math.round((divisionStats[div] / total) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    // Medium breakdown
    const mediumCounts = {
      Paper: records.filter(r => r.medium === 'Paper').length,
      Digital: records.filter(r => r.medium === 'Digital').length,
      'Mixed Media': records.filter(r => r.medium === 'Mixed Media').length,
    };

    // Frequency of Use breakdown
    const frequencyCounts = {
      Active: records.filter(r => r.frequencyOfUse === 'Active').length,
      Inactive: records.filter(r => r.frequencyOfUse === 'Inactive').length,
      'As the need arises': records.filter(r => r.frequencyOfUse === 'As the need arises').length,
    };

    // Utility Value breakdown
    const utilityCounts: Record<string, number> = {};
    records.forEach(r => {
      const raw = (r.utilityValue || 'Adm').replace(/\s*\(.*?\)/g, '').trim();
      utilityCounts[raw] = (utilityCounts[raw] || 0) + 1;
    });

    return {
      total,
      permanent,
      temporary,
      safeForDisposal,
      evaluateDisposalCount,
      divisionStats: divisionStatsArray,
      mediumCounts,
      frequencyCounts,
      utilityCounts,
    };
  }, [records]);

  const CATEGORY_ORDER = [
    'ADMINISTRATIVE',
    'CSC GENERATED RECORDS',
    'EMPLOYEE WELFARE, WELLNESS AND REWARDS',
    'LEAVE RECORDS',
    'LOGBOOK',
    'ORDERS',
    'PAYROLL DRAFT ATTACHMENTS',
    'QUALITY MANAGEMENT SYSTEM',
    'RECRUITMENT AND PLACEMENT',
    'TRAINING AND EMPLOYEE DEVELOPMENT',
    'FINANCE',
    'LEGAL',
    'ARCHIVAL',
    'ISO GENERATED RECORDS',
    'ISO DOCUMENTS',
  ];

  // Dynamic location options from records
  const locationOptions = useMemo(() => {
    const locs = records.map((r) => r.locationOfRecords).filter(Boolean);
    return Array.from(new Set(locs)).sort();
  }, [records]);

  // Group and sort records
  const groupedAndSortedRecords = useMemo(() => {
    const filtered = records.filter((r) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        query === '' ||
        r.seriesTitle.toLowerCase().includes(query) ||
        (r.itemNo && r.itemNo.toLowerCase().includes(query)) ||
        (r.prdsGrds && r.prdsGrds.toLowerCase().includes(query)) ||
        (r.scopeDescription && r.scopeDescription.toLowerCase().includes(query)) ||
        (r.volume && r.volume.toLowerCase().includes(query)) ||
        (r.locationOfRecords && r.locationOfRecords.toLowerCase().includes(query)) ||
        (r.dispositionProvision && r.dispositionProvision.toLowerCase().includes(query));

      const matchesDivision =
        divisionTab === 'ALL' ||
        (r.division || '').trim().toLowerCase() === divisionTab.trim().toLowerCase();
      const matchesCategory = categoryFilter === 'ALL' || r.classificationCategory === categoryFilter;

      const matchesMedium = mediumFilter === 'ALL' || r.medium === mediumFilter;

      let matchesRetention = true;
      if (retentionFilter !== 'ALL') {
        if (retentionFilter === 'Temporary') matchesRetention = r.appraisalCategory === 'Temporary' || r.appraisalCategory?.includes('Temporary');
        else if (retentionFilter === 'Permanent') matchesRetention = r.appraisalCategory === 'Permanent';
        else if (retentionFilter === 'Safe for Disposal' || retentionFilter === 'Evaluate Disposal') {
          matchesRetention = r.disposalStatus === 'Safe for Disposal' || getOngoingDisposalInfo(r.inclusiveDates, Number(r.totalRetention)) !== null;
        }
        else if (retentionFilter === 'Under Retention') matchesRetention = r.disposalStatus === 'Under Retention';
      }

      const matchesFrequency = frequencyFilter === 'ALL' || r.frequencyOfUse === frequencyFilter;

      const rawUtility = (r.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim();
      const matchesUtility = utilityFilter === 'ALL' || rawUtility === utilityFilter || (r.utilityValue || '').includes(utilityFilter);

      const matchesLocation = locationFilter === 'ALL' || r.locationOfRecords === locationFilter;

      return matchesSearch && matchesDivision && matchesCategory && matchesMedium && matchesRetention && matchesFrequency && matchesUtility && matchesLocation;
    });

    const categoryDivisionMap: Record<string, Record<string, Record<string, InventoryRecord[]>>> = {};

    filtered.forEach((r) => {
      const rawCat = (r.classificationCategory || '').trim().toUpperCase();
      const cat = rawCat || 'ADMINISTRATIVE';
      const div = (r.division || 'General').trim().toUpperCase();
      const sub = (r.subCategory || '').trim();

      if (!categoryDivisionMap[cat]) categoryDivisionMap[cat] = {};
      if (!categoryDivisionMap[cat][div]) categoryDivisionMap[cat][div] = {};
      if (!categoryDivisionMap[cat][div][sub]) categoryDivisionMap[cat][div][sub] = [];

      if (!categoryDivisionMap[cat][div][sub].some((existing) => existing.id === r.id)) {
        categoryDivisionMap[cat][div][sub].push(r);
      }
    });

    const presentCategories = Object.keys(categoryDivisionMap);
    const sortedCategories = presentCategories.sort((a, b) => a.localeCompare(b));

    const result: { category: string; subGroups: { subCategory: string; items: InventoryRecord[] }[] }[] = [];

    sortedCategories.forEach((cat) => {
      const divMap = categoryDivisionMap[cat];
      const sortedDivKeys = Object.keys(divMap).sort((a, b) => a.localeCompare(b));

      sortedDivKeys.forEach((div) => {
        const subMap = divMap[div];
        const subKeys = Object.keys(subMap).sort((a, b) => {
          if (!a) return -1;
          if (!b) return 1;
          return a.localeCompare(b);
        });

        const subGroups = subKeys.map((sub) => {
          const items = subMap[sub].sort((a, b) => a.seriesTitle.localeCompare(b.seriesTitle));
          return {
            subCategory: sub,
            items,
          };
        });

        if (subGroups.length > 0) {
          result.push({
            category: `${cat} — ${div}`,
            subGroups,
          });
        }
      });
    });

    return result;
  }, [records, searchQuery, divisionTab, categoryFilter, mediumFilter, retentionFilter, frequencyFilter, utilityFilter, locationFilter]);

  const formatDynamicDates = (str: string) => {
    if (!str) return str;
    const currYr = new Date().getFullYear();
    return str.replace(/Present/gi, String(currYr));
  };

  return (
    <div className="inventory-page">
      {/* Header & Buttons */}
      <div className="inventory-page__header">
        <div>
          <h1 className="inventory-page__title">Inventory & Records Appraisal</h1>
          <p className="inventory-page__subtitle">
            Manage record series inventory, retention schedules, and evaluate records safe for disposal.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Button
            variant="secondary"
            onClick={() => {
              fetchDisposalHistory();
              setShowHistoryModal(true);
            }}
          >
            <MdHistory style={{ marginRight: '0.35rem', fontSize: '1.15rem' }} /> History of Disposal ({disposalLogs.length})
          </Button>
          <Button variant="primary" onClick={handleCreateNew}>
            <MdAdd style={{ marginRight: '0.35rem', fontSize: '1.2rem' }} /> Create New Records Series Entry
          </Button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="inventory-page__kpi-grid">
        <Card hoverable className="inventory-kpi-card inventory-kpi-card--blue">
          <div className="inventory-kpi-card__inner">
            <div className="inventory-kpi-card__icon-wrapper inventory-kpi-card__icon-wrapper--blue">
              <MdAssignment />
            </div>
            <div className="inventory-kpi-card__info">
              <span className="inventory-kpi-card__label">Total Records Series</span>
              <span className="inventory-kpi-card__value">{analytics.total}</span>
            </div>
          </div>
        </Card>

        <Card hoverable className="inventory-kpi-card inventory-kpi-card--indigo">
          <div className="inventory-kpi-card__inner">
            <div className="inventory-kpi-card__icon-wrapper inventory-kpi-card__icon-wrapper--indigo">
              <MdArchive />
            </div>
            <div className="inventory-kpi-card__info">
              <span className="inventory-kpi-card__label">Permanent Retention</span>
              <span className="inventory-kpi-card__value inventory-kpi-card__value--indigo">{analytics.permanent}</span>
            </div>
          </div>
        </Card>

        <Card hoverable className="inventory-kpi-card inventory-kpi-card--amber">
          <div className="inventory-kpi-card__inner">
            <div className="inventory-kpi-card__icon-wrapper inventory-kpi-card__icon-wrapper--amber">
              <MdHourglassTop />
            </div>
            <div className="inventory-kpi-card__info">
              <span className="inventory-kpi-card__label">Temporary Records</span>
              <span className="inventory-kpi-card__value inventory-kpi-card__value--amber">{analytics.temporary}</span>
            </div>
          </div>
        </Card>

        <Card
          hoverable
          className="inventory-kpi-card inventory-kpi-card--red"
          onClick={() => setShowEvaluateModal(true)}
          style={{ cursor: 'pointer' }}
          title="Click to open modal displaying all records eligible for evaluation and disposal"
        >
          <div className="inventory-kpi-card__inner">
            <div className="inventory-kpi-card__icon-wrapper inventory-kpi-card__icon-wrapper--red">
              <MdWarning />
            </div>
            <div className="inventory-kpi-card__info">
              <span className="inventory-kpi-card__label">Evaluate Disposal</span>
              <span className="inventory-kpi-card__value inventory-kpi-card__value--red">{disposalEligibleRecords.length}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Analytics Dashboard Grid */}
      <div className="inventory-dashboard-grid">
        {/* Division Breakdown */}
        <Card className="dashboard-widget">
          <div>
            <h3 className="dashboard-widget__title">Records Series by Division</h3>
            <div className="dashboard-stat-list">
              {analytics.divisionStats.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No records available</div>
              ) : (
                analytics.divisionStats.slice(0, 4).map((stat, idx) => (
                  <div key={stat.name} className="dashboard-stat-item">
                    <div className="dashboard-stat-header">
                      <span>{stat.name}</span>
                      <span className="dashboard-stat-badge">{stat.count} ({stat.percentage}%)</span>
                    </div>
                    <div className="dashboard-progress-track">
                      <div
                        className={`dashboard-progress-fill ${idx % 3 === 0 ? 'dashboard-progress-fill--blue' : idx % 3 === 1 ? 'dashboard-progress-fill--indigo' : 'dashboard-progress-fill--purple'}`}
                        style={{ width: `${stat.percentage}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        {/* Medium & Frequency Breakdown (Dual Columns) */}
        <Card className="dashboard-widget">
          <div>
            <h3 className="dashboard-widget__title">Document Medium & Frequency of Use</h3>
            <div className="dashboard-dual-columns">
              {/* Left Column: Medium */}
              <div className="dashboard-column-group">
                <div className="dashboard-column-title">Document Medium</div>

                <div className="dashboard-stat-item">
                  <div className="dashboard-stat-header">
                    <span>Paper</span>
                    <span className="dashboard-stat-badge">{analytics.mediumCounts.Paper}</span>
                  </div>
                  <div className="dashboard-progress-track">
                    <div
                      className="dashboard-progress-fill dashboard-progress-fill--amber"
                      style={{ width: `${analytics.total > 0 ? Math.round((analytics.mediumCounts.Paper / analytics.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>

                <div className="dashboard-stat-item">
                  <div className="dashboard-stat-header">
                    <span>Digital</span>
                    <span className="dashboard-stat-badge">{analytics.mediumCounts.Digital}</span>
                  </div>
                  <div className="dashboard-progress-track">
                    <div
                      className="dashboard-progress-fill dashboard-progress-fill--blue"
                      style={{ width: `${analytics.total > 0 ? Math.round((analytics.mediumCounts.Digital / analytics.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>

                <div className="dashboard-stat-item">
                  <div className="dashboard-stat-header">
                    <span>Mixed</span>
                    <span className="dashboard-stat-badge">{analytics.mediumCounts['Mixed Media']}</span>
                  </div>
                  <div className="dashboard-progress-track">
                    <div
                      className="dashboard-progress-fill dashboard-progress-fill--purple"
                      style={{ width: `${analytics.total > 0 ? Math.round((analytics.mediumCounts['Mixed Media'] / analytics.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Frequency */}
              <div className="dashboard-column-group">
                <div className="dashboard-column-title">Frequency of Use</div>

                <div className="dashboard-stat-item">
                  <div className="dashboard-stat-header">
                    <span>Active</span>
                    <span className="dashboard-stat-badge">{analytics.frequencyCounts.Active}</span>
                  </div>
                  <div className="dashboard-progress-track">
                    <div
                      className="dashboard-progress-fill dashboard-progress-fill--emerald"
                      style={{ width: `${analytics.total > 0 ? Math.round((analytics.frequencyCounts.Active / analytics.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>

                <div className="dashboard-stat-item">
                  <div className="dashboard-stat-header">
                    <span>Inactive</span>
                    <span className="dashboard-stat-badge">{analytics.frequencyCounts.Inactive}</span>
                  </div>
                  <div className="dashboard-progress-track">
                    <div
                      className="dashboard-progress-fill dashboard-progress-fill--indigo"
                      style={{ width: `${analytics.total > 0 ? Math.round((analytics.frequencyCounts.Inactive / analytics.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>

                <div className="dashboard-stat-item">
                  <div className="dashboard-stat-header">
                    <span>As Needed</span>
                    <span className="dashboard-stat-badge">{analytics.frequencyCounts['As the need arises']}</span>
                  </div>
                  <div className="dashboard-progress-track">
                    <div
                      className="dashboard-progress-fill dashboard-progress-fill--amber"
                      style={{ width: `${analytics.total > 0 ? Math.round((analytics.frequencyCounts['As the need arises'] / analytics.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Utility Value Classification */}
        <Card className="dashboard-widget">
          <div>
            <h3 className="dashboard-widget__title">Utility Value Classification</h3>
            <div className="dashboard-stat-list">
              {['Adm', 'Fiscal', 'Legal', 'Arc', 'Mixed Utility'].map((key, idx) => {
                const count = analytics.utilityCounts[key] || 0;
                const pct = analytics.total > 0 ? Math.round((count / analytics.total) * 100) : 0;
                return (
                  <div key={key} className="dashboard-stat-item">
                    <div className="dashboard-stat-header">
                      <span>{key}</span>
                      <span className="dashboard-stat-badge">{count} ({pct}%)</span>
                    </div>
                    <div className="dashboard-progress-track">
                      <div
                        className={`dashboard-progress-fill ${idx % 3 === 0 ? 'dashboard-progress-fill--emerald' : idx % 3 === 1 ? 'dashboard-progress-fill--blue' : 'dashboard-progress-fill--indigo'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* Filter & Search Bar Card */}
      <Card>
        <div className="search-filter-card">
          {/* Header Row */}
          <div className="search-filter-card__header">
            <h3 className="search-filter-card__title">Search and Filter</h3>
            <span className="search-filter-card__badge">
              Total Records: {analytics.total}
            </span>
          </div>

          {/* Filter Boxes Grid */}
          <div className="search-filter-card__grid">
            {/* Box 1: Search */}
            <div className="search-filter-box">
              <label className="search-filter-box__label">Search</label>
              <input
                type="text"
                className="search-filter-box__input"
                placeholder="Search record series"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Box 2: Category */}
            <div className="search-filter-box">
              <label className="search-filter-box__label">Category</label>
              <select
                className="search-filter-box__select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                {CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Box 3: Medium */}
            <div className="search-filter-box">
              <label className="search-filter-box__label">Medium</label>
              <select
                className="search-filter-box__select"
                value={mediumFilter}
                onChange={(e) => setMediumFilter(e.target.value)}
              >
                <option value="ALL">All Media</option>
                <option value="Paper">Paper</option>
                <option value="Digital">Digital</option>
                <option value="Mixed Media">Mixed Media</option>
              </select>
            </div>

            {/* Box 4: Retention */}
            <div className="search-filter-box">
              <label className="search-filter-box__label">Retention</label>
              <select
                className="search-filter-box__select"
                value={retentionFilter}
                onChange={(e) => setRetentionFilter(e.target.value)}
              >
                <option value="ALL">All Types</option>
                <option value="Temporary">Temporary</option>
                <option value="Permanent">Permanent</option>
                <option value="Safe for Disposal">Safe for Disposal</option>
                <option value="Under Retention">Under Retention</option>
              </select>
            </div>

            {/* Box 5: Frequency */}
            <div className="search-filter-box">
              <label className="search-filter-box__label">Frequency</label>
              <select
                className="search-filter-box__select"
                value={frequencyFilter}
                onChange={(e) => setFrequencyFilter(e.target.value)}
              >
                <option value="ALL">All Frequencies</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="As Needed">As Needed</option>
              </select>
            </div>

            {/* Box 6: Utility */}
            <div className="search-filter-box">
              <label className="search-filter-box__label">Utility</label>
              <select
                className="search-filter-box__select"
                value={utilityFilter}
                onChange={(e) => setUtilityFilter(e.target.value)}
              >
                <option value="ALL">All Utility</option>
                <option value="Adm">Adm</option>
                <option value="Fiscal">Fiscal</option>
                <option value="Legal">Legal</option>
                <option value="Arc">Arc</option>
                <option value="Mixed Utility">Mixed Utility</option>
              </select>
            </div>

            {/* Box 7: Location */}
            <div className="search-filter-box">
              <label className="search-filter-box__label">Location</label>
              <select
                className="search-filter-box__select"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
              >
                <option value="ALL">All Locations</option>
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Reset Filters Action */}
          <div className="search-filter-card__actions">
            <button
              className="search-filter-card__reset-btn"
              onClick={handleResetFilters}
              disabled={!hasActiveFilters}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </Card>

      {/* Division Pill Tabs Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', margin: '0.5rem 0' }}>
        {divisionTabs.map((div) => {
          const isSelected = divisionTab === div;
          const count = div === 'ALL'
            ? records.length
            : records.filter(r => (r.division || 'Unassigned') === div || r.division === div).length;
          return (
            <button
              key={`div-tab-${div}`}
              type="button"
              onClick={() => setDivisionTab(div)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.95rem',
                borderRadius: '99px',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                border: isSelected ? '1.5px solid var(--color-primary, #3b82f6)' : '1px solid var(--border-color, #cbd5e1)',
                background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-primary, #ffffff)',
                color: isSelected ? 'var(--color-primary, #2563eb)' : 'var(--text-secondary, #475569)',
                boxShadow: isSelected ? '0 2px 8px rgba(59, 130, 246, 0.15)' : 'none',
              }}
            >
              {isSelected && <MdCheckCircle style={{ fontSize: '0.9rem', color: '#2563eb' }} />}
              <span>{div === 'ALL' ? 'All Divisions' : div}</span>
              <span style={{
                fontSize: '0.725rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '99px',
                background: isSelected ? '#2563eb' : 'var(--bg-tertiary, #f1f5f9)',
                color: isSelected ? '#ffffff' : 'var(--text-secondary, #64748b)',
                fontWeight: 700,
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Official Form Grid Table View */}
      <Card>
        <div className="official-table-wrapper">
          <table className="official-table">
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: selectedIds.length > 0 ? '160px' : '45px', textAlign: 'center', transition: 'width 0.2s ease', padding: '0.4rem 0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={records.length > 0 && selectedIds.length === records.length}
                      onChange={handleSelectAll}
                      title="Select All"
                    />
                    {selectedIds.length > 0 && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setShowBulkDeleteModal(true); }}
                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem', height: '28px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <MdDelete style={{ fontSize: '0.85rem' }} /> Delete ({selectedIds.length})
                      </Button>
                    )}
                  </div>
                </th>
                <th rowSpan={2} style={{ minWidth: '90px', textAlign: 'center' }}>ITEM NO.</th>
                <th rowSpan={2} style={{ minWidth: '220px' }}>9. Records Series Title and Description</th>
                <th rowSpan={2} style={{ minWidth: '120px' }}>10. Period Covered / Inclusive Dates</th>
                <th rowSpan={2} style={{ minWidth: '90px' }}>11. Volume</th>
                <th rowSpan={2} style={{ minWidth: '100px' }}>12. Records Medium</th>
                <th rowSpan={2} style={{ minWidth: '110px' }}>13. Restriction/s</th>
                <th rowSpan={2} style={{ minWidth: '130px' }}>14. Location of Records</th>
                <th rowSpan={2} style={{ minWidth: '120px' }}>15. Frequency of Use</th>
                <th rowSpan={2} style={{ minWidth: '100px' }}>16. Duplication</th>
                <th rowSpan={2} style={{ minWidth: '110px' }}>17. Time Value (T/P)</th>
                <th rowSpan={2} style={{ minWidth: '120px' }}>18. Utility Value (Adm/F/L/Arc)</th>
                <th colSpan={3} style={{ borderBottom: '1px solid var(--border-color)' }}>19. Retention Period</th>
                <th rowSpan={2} style={{ minWidth: '160px' }}>20. Disposition Provision</th>
              </tr>
              <tr>
                <th style={{ minWidth: '60px' }}>Active</th>
                <th style={{ minWidth: '60px' }}>Storage</th>
                <th style={{ minWidth: '60px' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {groupedAndSortedRecords.length === 0 ? (
                <tr>
                  <td colSpan={16} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    No record series entries matching your filters.
                  </td>
                </tr>
              ) : (
                groupedAndSortedRecords.map((group) => (
                  <React.Fragment key={`group-${group.category}`}>
                    {/* Category Header Row */}
                    <tr className="official-table__category-row">
                      <td colSpan={16}>
                        {group.category}
                      </td>
                    </tr>

                    {/* Sub Category Groups */}
                    {group.subGroups.map((subGrp, sIdx) => (
                      <React.Fragment key={`subgrp-${group.category}-${subGrp.subCategory}-${sIdx}`}>
                        {/* Sub Category Subheader Row (render if subCategory exists) */}
                        {subGrp.subCategory && (
                          <tr className="official-table__subcategory-row">
                            <td colSpan={16} style={{ paddingLeft: '1.5rem' }}>
                              {subGrp.subCategory}
                            </td>
                          </tr>
                        )}

                        {/* Items under this Sub Category */}
                        {subGrp.items.map((r, rIdx) => {
                          const isPermanent = r.appraisalCategory === 'Permanent';
                          const isSelected = selectedIds.includes(r.id);
                          const disposalInfo = getOngoingDisposalInfo(r.inclusiveDates, Number(r.totalRetention));

                          return (
                            <tr
                              key={`${group.category}-${subGrp.subCategory}-${r.id}-${rIdx}`}
                              onClick={() => setViewingRecord(r)}
                              style={{ cursor: 'pointer', backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.08)' : undefined }}
                            >
                              <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => handleToggleSelect(r.id, e as any)}
                                />
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {r.prdsGrds && r.itemNo ? (
                                  <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)' }}>{r.prdsGrds}</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)' }}>{r.itemNo}</div>
                                  </div>
                                ) : (
                                  r.prdsGrds || r.itemNo || '-'
                                )}
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: 'var(--color-primary)', lineHeight: 1.3 }}>{r.seriesTitle}</div>
                                {r.scopeDescription && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '3px', fontStyle: 'italic', lineHeight: 1.25 }}>
                                    {r.scopeDescription}
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <div>{formatDynamicDates(r.inclusiveDates)}</div>
                                {disposalInfo && (
                                  <button
                                    type="button"
                                    style={{
                                      marginTop: '0.25rem',
                                      fontSize: '0.68rem',
                                      padding: '0.15rem 0.45rem',
                                      borderRadius: '4px',
                                      border: '1px solid #d97706',
                                      background: 'rgba(245, 158, 11, 0.12)',
                                      color: '#b45309',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.2rem',
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEvaluatingRecord({ record: r, info: disposalInfo });
                                    }}
                                    title={`Retention period of ${disposalInfo.totalRetention} years reached! Click to evaluate disposal.`}
                                  >
                                    <MdWarning style={{ fontSize: '0.75rem' }} /> Evaluate Disposal
                                  </button>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>{r.volume}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`inventory-pill ${r.medium === 'Digital' ? 'inventory-pill--digital' : 'inventory-pill--paper'}`}>
                                  {r.medium}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center' }}>{r.restrictions && r.restrictions.toLowerCase() !== 'none' ? r.restrictions : ''}</td>
                              <td style={{ textAlign: 'center' }}>{r.locationOfRecords}</td>
                              <td style={{ textAlign: 'center' }}>{r.frequencyOfUse}</td>
                              <td style={{ textAlign: 'center' }}>{r.duplication}</td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`inventory-pill ${isPermanent ? 'inventory-pill--permanent' : 'inventory-pill--temporary'}`}>
                                  {r.appraisalCategory}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center' }}>{(r.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim()}</td>
                              <td style={{ textAlign: 'center' }}>
                                {isPermanent ? '' : r.activeDeskYrs}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {isPermanent ? '' : r.storageYrs}
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: isPermanent ? 400 : 700 }}>
                                {isPermanent ? '' : r.totalRetention}
                              </td>
                              <td>{r.dispositionProvision}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Evaluate Retention Disposal Prompt Modal */}
      {evaluatingRecord && (() => {
        const covered = extractCoveredYears(evaluatingRecord.record.inclusiveDates);
        const activeYearsRemaining = covered.years.filter(y => !customDisposedYears.includes(y));
        const computedCustomDates = customDisposedYears.length > 0
          ? formatYearsListToDatesString(activeYearsRemaining, covered.isOngoing)
          : evaluatingRecord.info.newDatesStr;

        const isCustomSelected = customDisposedYears.length > 0;

        return (
          <Modal
            isOpen={!!evaluatingRecord}
            onClose={() => {
              setEvaluatingRecord(null);
              setCustomDisposedYears([]);
            }}
            title="Retention Evaluation & Disposal"
            size="lg"
          >
            <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <p style={{ margin: 0, fontSize: '0.925rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                The record series <strong>{evaluatingRecord.record.seriesTitle}</strong> (Division: <strong>{evaluatingRecord.record.division || 'General'}</strong>) has reached its <strong>{evaluatingRecord.info.totalRetention}-year retention period</strong>.
              </p>

              <div style={{ background: 'var(--bg-secondary)', padding: '1.15rem', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Current Stored Period:</span>
                  <strong style={{ fontSize: '0.925rem' }}>{evaluatingRecord.record.inclusiveDates}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Currently Displayed:</span>
                  <strong style={{ fontSize: '0.925rem' }}>{formatDynamicDates(evaluatingRecord.record.inclusiveDates)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Retention Period Reached:</span>
                  <span style={{ color: '#d97706', fontWeight: 700, fontSize: '0.9rem' }}>{evaluatingRecord.info.totalRetention} Year(s)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem', marginTop: '0.35rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>New Inclusive Dates if Disposed:</span>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 800, fontSize: '1rem' }}>{computedCustomDates}</span>
                </div>
              </div>

              {/* Specific Year Disposal Selector */}
              {covered.years.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'var(--bg-primary)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    💡 Or Select Specific Year(s) to Dispose:
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Click a year below to mark it as disposed (e.g. disposing 2024 from <code>2023 - 2026</code> saves as <code>2023, 2025 - 2026</code>):
                  </span>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {covered.years.map((yr) => {
                      const isDisposed = customDisposedYears.includes(yr);
                      return (
                        <button
                          key={`yr-pill-${yr}`}
                          type="button"
                          style={{
                            fontSize: '0.8rem',
                            padding: '0.3rem 0.65rem',
                            borderRadius: '6px',
                            border: isDisposed ? '1.5px solid #ef4444' : '1px solid var(--border-color)',
                            background: isDisposed ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-tertiary)',
                            color: isDisposed ? '#dc2626' : 'var(--text-primary)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            textDecoration: isDisposed ? 'line-through' : 'none',
                            transition: 'all 0.2s ease',
                          }}
                          onClick={() => {
                            setCustomDisposedYears((prev) =>
                              prev.includes(yr) ? prev.filter((y) => y !== yr) : [...prev, yr]
                            );
                          }}
                        >
                          {isDisposed ? '🗑️ Disposed ' : '📅 '} {yr}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <p style={{ margin: 0, fontSize: '0.835rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                {isCustomSelected ? (
                  <>Disposing year(s) <strong>{customDisposedYears.sort().join(', ')}</strong> will update active inclusive dates to <strong>{computedCustomDates}</strong>.</>
                ) : (
                  <>Disposing 1 year of retention (expiring {evaluatingRecord.info.ongoingStartYear}) will advance the ongoing period to <strong>{evaluatingRecord.info.newDatesStr}</strong>.</>
                )}
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEvaluatingRecord(null);
                    setCustomDisposedYears([]);
                  }}
                  style={{ padding: '0.5rem 1rem' }}
                >
                  Do Not Dispose (Keep As Is)
                </Button>
                <Button
                  variant="primary"
                  style={{ padding: '0.5rem 1.15rem' }}
                  onClick={async () => {
                    try {
                      const disposedYearsStr = isCustomSelected
                        ? customDisposedYears.sort().join(', ')
                        : String(evaluatingRecord.info.ongoingStartYear);

                      await api.inventory.update(evaluatingRecord.record.id, {
                        ...evaluatingRecord.record,
                        inclusiveDates: computedCustomDates,
                      });

                      await api.inventory.logDisposal({
                        recordId: evaluatingRecord.record.id,
                        seriesTitle: evaluatingRecord.record.seriesTitle,
                        division: evaluatingRecord.record.division,
                        classificationCategory: evaluatingRecord.record.classificationCategory,
                        disposedYears: disposedYearsStr,
                        previousInclusiveDates: evaluatingRecord.record.inclusiveDates,
                        newInclusiveDates: computedCustomDates,
                        disposedBy: 'System Admin',
                      });

                      showToast(`Record updated! Disposed year(s) (${disposedYearsStr}). New period: ${computedCustomDates}`, 'success');
                      setEvaluatingRecord(null);
                      setCustomDisposedYears([]);
                      setViewingRecord(null);
                      fetchRecords();
                      fetchDisposalHistory();
                    } catch (err: any) {
                      showToast(err.message || 'Failed to update record period', 'error');
                    }
                  }}
                >
                  {isCustomSelected ? `Dispose Selected Year(s) & Save as ${computedCustomDates}` : `Dispose & Advance to ${evaluatingRecord.info.newDatesStr}`}
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Evaluate Disposal List Modal */}
      {showEvaluateModal && (
        <Modal
          isOpen={showEvaluateModal}
          onClose={() => setShowEvaluateModal(false)}
          title={`Evaluate Disposal Records (${disposalEligibleRecords.length})`}
          size="xl"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.85rem 1.15rem', borderRadius: '8px', fontSize: '0.875rem', color: '#065f46', lineHeight: 1.45 }}>
              📋 <strong>Records Eligible for Evaluation & Disposal:</strong> The records listed below have reached their retention schedule period or are authorized for disposal evaluation. Click <strong>"Evaluate & Dispose"</strong> on any entry to review expired years and update active periods.
            </div>

            {disposalEligibleRecords.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No records currently eligible for disposal evaluation.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Item No.</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Record Series & Scope</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Division</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Inclusive Dates</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Total Retention</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disposalEligibleRecords.map((r, idx) => {
                      const ongoingInfo = getOngoingDisposalInfo(r.inclusiveDates, Number(r.totalRetention));
                      return (
                        <tr key={`eval-row-${r.id}-${idx}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--color-primary)' }}>{r.itemNo || '-'}</td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.seriesTitle}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.classificationCategory} {r.subCategory ? `— ${r.subCategory}` : ''}</div>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-primary)' }}>{r.division || 'General'}</td>
                          <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>
                            <strong>{formatDynamicDates(r.inclusiveDates)}</strong>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: '#d97706' }}>
                            {r.totalRetention ? `${r.totalRetention} Year(s)` : '-'}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                setShowEvaluateModal(false);
                                setEvaluatingRecord({
                                  record: r,
                                  info: ongoingInfo || {
                                    ongoingStartYear: 2024,
                                    currentYear: new Date().getFullYear(),
                                    elapsedYears: Number(r.totalRetention || 1),
                                    totalRetention: Number(r.totalRetention || 1),
                                    newStartYear: 2025,
                                    newDatesStr: r.inclusiveDates,
                                    isRetentionReached: true,
                                  },
                                });
                              }}
                            >
                              Evaluate & Dispose
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setShowEvaluateModal(false)}>
                Close Window
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* History of Disposal Logs Modal */}
      {showHistoryModal && (
        <Modal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          title={`History of Disposal Logs`}
          size="xl"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Audit log trail of all record series disposal evaluations and disposed year periods.
              </p>
              <div style={{ width: '280px' }}>
                <SearchBar
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  placeholder="Search disposal logs..."
                />
              </div>
            </div>

            {(() => {
              // Expand multi-year logs so every row has strictly 1 disposed year
              const expandedLogs: any[] = [];
              disposalLogs.forEach((log) => {
                const yearsStr = String(log.disposedYears || '').trim();
                let yearList: number[] = [];

                if (yearsStr.includes('-')) {
                  const parts = yearsStr.split('-').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
                  if (parts.length === 2 && parts[0] <= parts[1]) {
                    for (let y = parts[0]; y <= parts[1]; y++) yearList.push(y);
                  }
                }
                if (yearList.length === 0) {
                  yearList = (yearsStr.match(/\b\d{4}\b/g) || []).map((n) => parseInt(n, 10));
                }

                if (yearList.length > 1) {
                  yearList.forEach((singleYear, idx) => {
                    expandedLogs.push({
                      ...log,
                      id: `${log.id}-${singleYear}-${idx}`,
                      disposedYears: String(singleYear),
                    });
                  });
                } else {
                  expandedLogs.push(log);
                }
              });

              const filteredLogs = expandedLogs.filter((log) => {
                const q = historySearchQuery.toLowerCase().trim();
                if (!q) return true;
                return (
                  (log.seriesTitle && log.seriesTitle.toLowerCase().includes(q)) ||
                  (log.division && log.division.toLowerCase().includes(q)) ||
                  (log.classificationCategory && log.classificationCategory.toLowerCase().includes(q)) ||
                  (log.subCategory && log.subCategory.toLowerCase().includes(q)) ||
                  (log.disposedYears && log.disposedYears.toLowerCase().includes(q))
                );
              });

              if (filteredLogs.length === 0) {
                return (
                  <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    No disposal history logs found.
                  </div>
                );
              }

              return (
                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', maxHeight: '420px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
                        <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Date Disposed</th>
                        <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Record Series</th>
                        <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Division</th>
                        <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Category</th>
                        <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Sub Category</th>
                        <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Disposed Year</th>
                        <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Period Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 600 }}>
                            {new Date(log.disposedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{log.seriesTitle}</div>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                            {log.division || 'General'}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary)' }}>
                            {log.classificationCategory || '-'}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary)' }}>
                            {log.subCategory || '-'}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                            <span style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#dc2626', padding: '0.2rem 0.55rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.8rem', display: 'inline-block' }}>
                              🗑️ {log.disposedYears}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>
                            <span style={{ textDecoration: 'line-through', color: 'var(--text-secondary)', marginRight: '0.35rem' }}>{log.previousInclusiveDates}</span>
                            <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>➔ {log.newInclusiveDates}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setShowHistoryModal(false)}>
                Close History
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* View Record Details Modal */}
      {viewingRecord && (
        <Modal
          isOpen={!!viewingRecord}
          onClose={() => setViewingRecord(null)}
          title={`Record Series Details: ${viewingRecord.seriesTitle}`}
          size="lg"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>PRDS / GRDS</span>
                <div style={{ fontWeight: 800, color: 'var(--color-primary)', marginTop: '0.25rem', fontSize: '0.95rem' }}>{viewingRecord.prdsGrds || 'N/A'}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Item No.</span>
                <div style={{ fontWeight: 800, color: 'var(--color-primary)', marginTop: '0.25rem', fontSize: '0.95rem' }}>{viewingRecord.itemNo || 'N/A'}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Division</span>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem', fontSize: '0.95rem' }}>{viewingRecord.division || 'N/A'}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Classification Category</span>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem', fontSize: '0.95rem' }}>{viewingRecord.classificationCategory || 'N/A'}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Sub Category</span>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem', fontSize: '0.95rem' }}>{viewingRecord.subCategory || 'N/A'}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Disposal Evaluation Status</span>
                <div style={{ marginTop: '0.25rem' }}>
                  <span className={`inventory-pill ${viewingRecord.disposalStatus === 'Safe for Disposal' ? 'inventory-pill--paper' : viewingRecord.disposalStatus === 'Permanent' ? 'inventory-pill--permanent' : 'inventory-pill--temporary'}`}>
                    {viewingRecord.disposalStatus}
                  </span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Period Covered</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{formatDynamicDates(viewingRecord.inclusiveDates)}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Volume</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{viewingRecord.volume}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Records Medium</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{viewingRecord.medium}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Restrictions</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{viewingRecord.restrictions || 'None'}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Location of Records</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{viewingRecord.locationOfRecords}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Frequency of Use</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{viewingRecord.frequencyOfUse}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Duplication</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{viewingRecord.duplication}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Appraisal Category</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{viewingRecord.appraisalCategory}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Utility Value</span>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>{(viewingRecord.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim()}</div>
              </div>

              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Retention Period</span>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                  {viewingRecord.appraisalCategory === 'Permanent' ? 'Permanent' : `${viewingRecord.activeDeskYrs} yrs active | ${viewingRecord.storageYrs} yrs storage | ${viewingRecord.totalRetention} yrs total`}
                </div>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Description & Scope Notes</span>
              <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {viewingRecord.scopeDescription || 'No detailed scope description provided.'}
              </p>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Disposition Provision</span>
              <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.5, fontWeight: 600 }}>
                {viewingRecord.dispositionProvision}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <Button variant="secondary" onClick={() => setViewingRecord(null)}>
                Close
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const rec = viewingRecord;
                  setViewingRecord(null);
                  setDeletingRecord(rec);
                }}
              >
                <MdDelete style={{ marginRight: '0.35rem' }} /> Delete Entry
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const rec = viewingRecord;
                  setViewingRecord(null);
                  handleEdit(rec);
                }}
              >
                <MdEdit style={{ marginRight: '0.35rem' }} /> Update Entry
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create / Edit Record Series Modal */}
      <CreateRecordSeriesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveRecord}
        initialData={editingRecord}
      />

      {/* Delete Confirmation Modal */}
      {deletingRecord && (
        <Modal
          isOpen={!!deletingRecord}
          onClose={() => !isDeleting && setDeletingRecord(null)}
          title="Confirm Delete Record Series"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#ef4444' }}>
              <MdWarning style={{ fontSize: '1.75rem', flexShrink: 0 }} />
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                Are you sure you want to delete this entry?
              </div>
            </div>

            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              You are about to delete <strong>"{deletingRecord.seriesTitle}"</strong>. This action cannot be undone and will permanently erase this record series entry from the system inventory.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button
                variant="secondary"
                onClick={() => setDeletingRecord(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmDelete}
                loading={isDeleting}
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <Modal
          isOpen={showBulkDeleteModal}
          onClose={() => !isDeleting && setShowBulkDeleteModal(false)}
          title="Confirm Bulk Delete Records"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#ef4444' }}>
              <MdWarning style={{ fontSize: '1.75rem', flexShrink: 0 }} />
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                Are you sure you want to delete {selectedIds.length} selected record series entries?
              </div>
            </div>

            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              This action cannot be undone and will permanently remove all selected record series entries from the system inventory.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button
                variant="secondary"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmBulkDelete}
                loading={isDeleting}
              >
                Confirm Bulk Delete ({selectedIds.length})
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default InventoryAppraisal;
