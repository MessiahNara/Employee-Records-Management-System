import React, { useState, useEffect, useMemo } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SearchBar from '../components/ui/SearchBar';
import Table, { Column } from '../components/ui/Table';
import Modal from '../components/ui/Modal';
import CreateRecordSeriesModal, { RecordSeriesFormData } from '../components/CreateRecordSeriesModal';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import { MdAdd, MdDelete, MdDeleteOutline, MdEdit, MdAssignment, MdCheckCircle, MdHourglassTop, MdArchive, MdWarning, MdHistory, MdInventory, MdDeleteSweep, MdPrint, MdFileDownload, MdInfoOutline } from 'react-icons/md';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { getAuthState, saveAuthState } from '../utils/mockAuth';
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
  retentionStage?: 'Active' | 'Storage' | 'Disposed';
  storageStartDate?: string;
  createdAt: string;
  updatedAt: string;
}

export function formatDynamicDates(datesStr: string): string {
  if (!datesStr) return '-';
  const currYr = new Date().getFullYear();
  const replaced = datesStr.replace(/Present/gi, String(currYr)).trim();
  const match = replaced.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (match && match[1] === match[2]) {
    return match[1];
  }
  return replaced;
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

export function getOngoingActiveDeskInfo(datesStr: string, activeDeskYrs: number, retentionStage?: string) {
  if (retentionStage === 'Storage' || retentionStage === 'Disposed') return null;
  if (!datesStr || !activeDeskYrs || activeDeskYrs <= 0) return null;

  const currentYear = new Date().getFullYear();
  const matches = datesStr.match(/\b\d{4}\b/g);
  if (!matches || matches.length === 0) return null;

  const years = matches.map(Number);
  const startYear = years[0];
  const elapsedYears = currentYear - startYear;

  if (elapsedYears >= activeDeskYrs) {
    return {
      startYear,
      currentYear,
      elapsedYears,
      activeDeskYrs,
      isDeskPeriodReached: true,
    };
  }

  return null;
}

export function getOngoingDisposalInfo(datesStr: string, totalRetention: number, retentionStage?: string, frequencyOfUse?: string) {
  // Disposal evaluation ONLY applies if the record is currently in Storage!
  const isStorage = retentionStage === 'Storage' || frequencyOfUse === 'Inactive';
  if (!isStorage) return null;

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

export function computeDisposalPeriodChange(datesStr: string): string {
  if (!datesStr) return 'Disposed';

  const matches = datesStr.match(/\b\d{4}\b/g);
  if (!matches || matches.length === 0) return `${datesStr} → Disposed`;

  const years = matches.map(Number);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  if (datesStr.toLowerCase().includes('present')) {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    return `${datesStr} → ${nextYear} - Present`;
  }

  if (years.length === 1 || minYear === maxYear) {
    return `${minYear} → Disposed`;
  }

  const newMinYear = minYear + 1;
  if (newMinYear <= maxYear) {
    return `${minYear} - ${maxYear} → ${newMinYear} - ${maxYear}`;
  }

  return `${datesStr} → Disposed`;
}

export function computeStoragePeriodChange(datesStr: string): string {
  if (!datesStr) return 'Active → Storage';
  return `${datesStr} (Active) → Storage`;
}

export function cleanSeriesTitle(title?: string): string {
  if (!title) return '';
  return title.replace(/\s*\(\s*\d{4}(?:\s*-\s*\d{4})?\s*\)$/i, '').trim();
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
  const [showNapFormPreview, setShowNapFormPreview] = useState(false);
  const [previewViewMode, setPreviewViewMode] = useState<'excel' | 'form'>('excel');
  const [napFormHeader, setNapFormHeader] = useState({
    personInCharge: '',
    sectionUnit: '',
    telephoneNo: '',
    emailAddress: '',
    preparedBy: '',
    assistedBy: '',
    approvedBy: '',
  });
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [disposalLogs, setDisposalLogs] = useState<any[]>([]);
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // ── Inventory Storage & Disposal Request state ───────────────────────
  const [inventoryRequests, setInventoryRequests] = useState<any[]>([]);
  const [selectedRequestDetails, setSelectedRequestDetails] = useState<any | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState<'Storage' | 'Disposal'>('Storage');
  const [targetRequestRecords, setTargetRequestRecords] = useState<InventoryRecord[]>([]);
  const [requestReason, setRequestReason] = useState('');
  const [requestFile, setRequestFile] = useState<File | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // ── 3-Tab Storage Management Modal state ──────────────────────────────
  const [showStorageManagementModal, setShowStorageManagementModal] = useState(false);
  const [storageModalTab, setStorageModalTab] = useState<'confirmation' | 'requests' | 'history'>('confirmation');
  const [stagedStorageRecords, setStagedStorageRecords] = useState<InventoryRecord[]>(() => {
    try {
      const saved = localStorage.getItem('staged_storage_records');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [stagedSelectedIds, setStagedSelectedIds] = useState<string[]>([]);
  const [storageReason, setStorageReason] = useState('');
  const [storageFile, setStorageFile] = useState<File | null>(null);
  const [isSendingStorageRequest, setIsSendingStorageRequest] = useState(false);

  // ── 3-Tab Disposal Management Modal state ──────────────────────────────
  const [showDisposalManagementModal, setShowDisposalManagementModal] = useState(false);
  const [disposalModalTab, setDisposalModalTab] = useState<'confirmation' | 'requests' | 'history'>('confirmation');
  const [stagedDisposalRecords, setStagedDisposalRecords] = useState<InventoryRecord[]>(() => {
    try {
      const saved = localStorage.getItem('staged_disposal_records');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [stagedDisposalSelectedIds, setStagedDisposalSelectedIds] = useState<string[]>([]);
  const [disposalReason, setDisposalReason] = useState('');
  const [disposalFile, setDisposalFile] = useState<File | null>(null);
  const [isSendingDisposalRequest, setIsSendingDisposalRequest] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('staged_storage_records', JSON.stringify(stagedStorageRecords));
    } catch (e) {
      console.error('Failed to persist staged storage records', e);
    }
  }, [stagedStorageRecords]);

  useEffect(() => {
    try {
      localStorage.setItem('staged_disposal_records', JSON.stringify(stagedDisposalRecords));
    } catch (e) {
      console.error('Failed to persist staged disposal records', e);
    }
  }, [stagedDisposalRecords]);

  // Send request pop-out modal states
  const [showSendStoragePopout, setShowSendStoragePopout] = useState(false);
  const [showSendDisposalPopout, setShowSendDisposalPopout] = useState(false);

  // Admin Confirmation Modal state
  const [showPendingRequestsModal, setShowPendingRequestsModal] = useState(false);
  const [adminDecisionReason, setAdminDecisionReason] = useState('');
  const [isProcessingAdminDecision, setIsProcessingAdminDecision] = useState(false);

  const { showToast } = useToast();

  const [currentUser, setCurrentUser] = useState(getAuthState());

  useEffect(() => {
    const handleAuthUpdate = () => {
      setCurrentUser(getAuthState());
    };
    window.addEventListener('profilePictureUpdated', handleAuthUpdate);
    window.addEventListener('authUpdated', handleAuthUpdate);

    const auth = getAuthState();
    if (auth?.id) {
      api.user.getById(auth.id).then((freshUser) => {
        if (freshUser && freshUser.permissions) {
          const updatedAuth = { ...auth, permissions: freshUser.permissions };
          saveAuthState(updatedAuth, localStorage.getItem('authUser') !== null);
          setCurrentUser(updatedAuth);
        }
      }).catch((err) => console.warn('Sync permissions error:', err));
    }

    return () => {
      window.removeEventListener('profilePictureUpdated', handleAuthUpdate);
      window.removeEventListener('authUpdated', handleAuthUpdate);
    };
  }, []);

  const [systemDivisions, setSystemDivisions] = useState<string[]>([
    'Employee Relations',
    'Administrative Division',
    'Finance & Accounting',
    'Human Resource Development',
    'Medical & Nursing Services'
  ]);

  useEffect(() => {
    api.systemSettings.get().then(res => {
      if (res?.divisions && Array.isArray(res.divisions) && res.divisions.length > 0) {
        setSystemDivisions(res.divisions);
      }
    }).catch(err => console.warn('Could not load system divisions:', err));
  }, []);

  const userPermissions = useMemo(() => {
    let p = currentUser?.permissions;
    if (typeof p === 'string') {
      try { p = JSON.parse(p); } catch { p = null; }
    }
    return p;
  }, [currentUser]);

  const allowedDivisions = useMemo(() => {
    if (!currentUser) return ['ALL'];
    const divs = userPermissions?.allowedDivisions;
    if (divs && Array.isArray(divs) && divs.length > 0 && !divs.includes('ALL')) {
      return divs;
    }
    return ['ALL'];
  }, [currentUser, userPermissions]);

  const hasFullDivisionAccess = allowedDivisions.includes('ALL');

  // Filter raw records based on user's authorized division scope
  const authorizedRecords = useMemo(() => {
    if (hasFullDivisionAccess) return records;
    return records.filter((r) => {
      const recDiv = (r.division || 'General').trim().toLowerCase();
      return allowedDivisions.some((d: string) => d.trim().toLowerCase() === recDiv);
    });
  }, [records, allowedDivisions, hasFullDivisionAccess]);

  // Set default division tab if user has a single allowed division
  useEffect(() => {
    if (!hasFullDivisionAccess && allowedDivisions.length > 0) {
      setDivisionTab(allowedDivisions[0]);
    }
  }, [allowedDivisions, hasFullDivisionAccess]);

  // Dynamic division tabs options from records & system settings
  const divisionTabs = useMemo(() => {
    const presentDivs = authorizedRecords.map((r) => r.division).filter(Boolean) as string[];
    const allKnownDivs = Array.from(new Set([...systemDivisions, ...presentDivs])).sort((a, b) => a.localeCompare(b));
    if (!hasFullDivisionAccess) {
      const merged = Array.from(new Set([...allowedDivisions, ...allKnownDivs.filter(d => allowedDivisions.some(ad => ad.trim().toLowerCase() === d.trim().toLowerCase()))])).sort((a, b) => a.localeCompare(b));
      return merged;
    }
    return ['ALL', ...allKnownDivs];
  }, [authorizedRecords, allowedDivisions, hasFullDivisionAccess, systemDivisions]);

  const [showActiveDeskModal, setShowActiveDeskModal] = useState(false);
  const [singleStorageRecord, setSingleStorageRecord] = useState<InventoryRecord | null>(null);
  const [showAnnualNoticeModal, setShowAnnualNoticeModal] = useState(false);
  const [showStorageHistoryModal, setShowStorageHistoryModal] = useState(false);
  const [showDisposalHistoryModal, setShowDisposalHistoryModal] = useState(false);
  const [storageSearchQuery, setStorageSearchQuery] = useState('');
  const [historyDivisionFilter, setHistoryDivisionFilter] = useState('ALL');
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('ALL');
  const [storageDivisionFilter, setStorageDivisionFilter] = useState('ALL');
  const [storageCategoryFilter, setStorageCategoryFilter] = useState('ALL');

  const storageLogs = useMemo(() => {
    return disposalLogs.filter(l => String(l.disposedYears).includes('Storage'));
  }, [disposalLogs]);

  const disposalOnlyLogs = useMemo(() => {
    return disposalLogs.filter(l => !String(l.disposedYears).includes('Storage'));
  }, [disposalLogs]);

  const scopeFilteredRecords = useMemo(() => {
    if (divisionTab === 'ALL') return authorizedRecords;
    return authorizedRecords.filter((r) => (r.division || '').trim().toLowerCase() === divisionTab.trim().toLowerCase());
  }, [authorizedRecords, divisionTab]);

  const analytics = useMemo(() => {
    const total = scopeFilteredRecords.length;
    const permanent = scopeFilteredRecords.filter(r => r.appraisalCategory === 'Permanent').length;
    
    // Medium breakdown
    const mediumCounts = { Paper: 0, Digital: 0, 'Mixed Media': 0 };
    scopeFilteredRecords.forEach(r => {
      if (r.medium === 'Paper') mediumCounts.Paper++;
      else if (r.medium === 'Digital') mediumCounts.Digital++;
      else if (r.medium === 'Mixed Media') mediumCounts['Mixed Media']++;
    });

    // Frequency breakdown
    const frequencyCounts = { Active: 0, Inactive: 0, 'As the need arises': 0 };
    scopeFilteredRecords.forEach(r => {
      if (r.frequencyOfUse === 'Active') frequencyCounts.Active++;
      else if (r.frequencyOfUse === 'Inactive') frequencyCounts.Inactive++;
      else if (r.frequencyOfUse === 'As the need arises') frequencyCounts['As the need arises']++;
    });

    // Utility breakdown
    const utilityCounts: Record<string, number> = { Adm: 0, Fiscal: 0, Legal: 0, Arc: 0, 'Mixed Utility': 0 };
    scopeFilteredRecords.forEach(r => {
      const u = (r.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim();
      if (utilityCounts[u] !== undefined) utilityCounts[u]++;
    });

    // Division breakdown
    const divCounts: Record<string, number> = {};
    scopeFilteredRecords.forEach(r => {
      const d = r.division || 'General';
      divCounts[d] = (divCounts[d] || 0) + 1;
    });
    const divisionStats = Object.keys(divCounts).map(d => ({
      name: d,
      count: divCounts[d],
      percentage: total > 0 ? Math.round((divCounts[d] / total) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    return { total, permanent, mediumCounts, frequencyCounts, utilityCounts, divisionStats };
  }, [scopeFilteredRecords]);

  const activeDeskEligibleRecords = useMemo(() => {
    return scopeFilteredRecords.filter(r => getOngoingActiveDeskInfo(r.inclusiveDates, Number(r.activeDeskYrs), r.retentionStage) !== null);
  }, [scopeFilteredRecords]);

  const disposalEligibleRecords = useMemo(() => {
    return scopeFilteredRecords.filter(r => getOngoingDisposalInfo(r.inclusiveDates, Number(r.totalRetention), r.retentionStage, r.frequencyOfUse) !== null);
  }, [scopeFilteredRecords]);

  useEffect(() => {
    if (records.length > 0) {
      const currentYear = new Date().getFullYear();
      const hasSeenNotice = sessionStorage.getItem(`annual_retention_notice_${currentYear}`);
      if (!hasSeenNotice && (activeDeskEligibleRecords.length > 0 || disposalEligibleRecords.length > 0)) {
        setShowAnnualNoticeModal(true);
      }
    }
  }, [records, activeDeskEligibleRecords.length, disposalEligibleRecords.length]);

  const handleMoveToStorage = (record: InventoryRecord) => {
    setStagedStorageRecords((prev) => {
      if (prev.some((r) => r.id === record.id)) return prev;
      return [...prev, record];
    });
    showToast(`"${record.seriesTitle}" staged in Storage Management under Confirmation of Storage tab.`, 'info');
  };

  const handleSendStorageConfirmation = async () => {
    if (!storageReason.trim()) {
      showToast('Please enter a reason for storage confirmation.', 'error');
      return;
    }
    if (stagedSelectedIds.length === 0) {
      showToast('Please select at least one record to send for storage confirmation.', 'error');
      return;
    }

    setIsSendingStorageRequest(true);
    try {
      let attachmentUrl = undefined;
      let attachmentName = undefined;

      if (storageFile) {
        try {
          const fileRes = await api.inventory.uploadAttachment(storageFile);
          attachmentUrl = fileRes.attachmentUrl;
          attachmentName = fileRes.attachmentName;
        } catch (uploadErr: any) {
          showToast(`File upload warning: ${uploadErr.message}. Submitting without attachment.`, 'info');
        }
      }

      const selectedStorageSummary = stagedStorageRecords
        .filter((r) => stagedSelectedIds.includes(r.id))
        .map((r) => ({
          id: r.id,
          seriesTitle: r.seriesTitle,
          division: r.division || 'General',
          classificationCategory: r.classificationCategory || 'General',
          inclusiveDates: r.inclusiveDates,
        }));

      await api.inventory.createRequest({
        requestType: 'Storage',
        recordIds: stagedSelectedIds,
        recordsSummary: selectedStorageSummary,
        reason: storageReason,
        attachmentUrl,
        attachmentName,
      });

      showToast('Storage confirmation request sent successfully!', 'success');
      setStagedStorageRecords((prev) => prev.filter((r) => !stagedSelectedIds.includes(r.id)));
      setStagedSelectedIds([]);
      setStorageReason('');
      setStorageFile(null);
      setShowSendStoragePopout(false);
      setStorageModalTab('requests');
      fetchInventoryRequests();
    } catch (err: any) {
      showToast(err.message || 'Failed to send storage request.', 'error');
    } finally {
      setIsSendingStorageRequest(false);
    }
  };

  const handleKeepInActiveDesk = async (record: InventoryRecord) => {
    try {
      await api.inventory.update(record.id, {
        ...record,
        retentionStage: 'Active',
      });
      showToast(`Record "${record.seriesTitle}" retained in Active Desk.`, 'info');
      fetchRecords();
    } catch (err: any) {
      showToast(err.message || 'Failed to update record stage.', 'error');
    }
  };

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

  const fetchInventoryRequests = async () => {
    try {
      const data = await api.inventory.getRequests();
      setInventoryRequests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to fetch inventory requests:', err);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchDisposalHistory();
    fetchInventoryRequests();
  }, []);

  const pendingRequests = useMemo(() => {
    return inventoryRequests.filter((r) => r.status === 'pending');
  }, [inventoryRequests]);

  const pendingStorageRequests = useMemo(() => {
    return inventoryRequests.filter((r) => r.status === 'pending' && r.requestType === 'Storage');
  }, [inventoryRequests]);

  const pendingDisposalRequests = useMemo(() => {
    return inventoryRequests.filter((r) => r.status === 'pending' && r.requestType === 'Disposal');
  }, [inventoryRequests]);

  const openStorageRequestModal = (recs: InventoryRecord[]) => {
    setStagedStorageRecords((prev) => {
      const newRecs = recs.filter((r) => !prev.some((p) => p.id === r.id));
      return [...prev, ...newRecs];
    });
    setStorageModalTab('confirmation');
    setShowStorageManagementModal(true);
  };

  const openDisposalRequestModal = (recs: InventoryRecord[]) => {
    recs.forEach((record) => {
      setStagedDisposalRecords((prev) => {
        if (prev.some((r) => r.id === record.id)) return prev;
        return [...prev, record];
      });
    });
    showToast(`${recs.length} record(s) staged in Disposal Management under Confirmation of Disposal tab.`, 'info');
  };

  const handleSendDisposalConfirmation = async () => {
    if (!disposalReason.trim()) {
      showToast('Please enter a reason for disposal confirmation.', 'error');
      return;
    }
    if (stagedDisposalSelectedIds.length === 0) {
      showToast('Please select at least one record to send for disposal confirmation.', 'error');
      return;
    }

    setIsSendingDisposalRequest(true);
    try {
      let attachmentUrl = undefined;
      let attachmentName = undefined;

      if (disposalFile) {
        try {
          const fileRes = await api.inventory.uploadAttachment(disposalFile);
          attachmentUrl = fileRes.attachmentUrl;
          attachmentName = fileRes.attachmentName;
        } catch (uploadErr: any) {
          showToast(`File upload warning: ${uploadErr.message}. Submitting without attachment.`, 'info');
        }
      }

      const selectedDisposalSummary = stagedDisposalRecords
        .filter((r) => stagedDisposalSelectedIds.includes(r.id))
        .map((r) => ({
          id: r.id,
          seriesTitle: r.seriesTitle,
          division: r.division || 'General',
          classificationCategory: r.classificationCategory || 'General',
          inclusiveDates: r.inclusiveDates,
        }));

      await api.inventory.createRequest({
        requestType: 'Disposal',
        recordIds: stagedDisposalSelectedIds,
        recordsSummary: selectedDisposalSummary,
        reason: disposalReason,
        attachmentUrl,
        attachmentName,
      });

      showToast('Disposal confirmation request sent successfully!', 'success');
      setStagedDisposalRecords((prev) => prev.filter((r) => !stagedDisposalSelectedIds.includes(r.id)));
      setStagedDisposalSelectedIds([]);
      setDisposalReason('');
      setDisposalFile(null);
      setShowSendDisposalPopout(false);
      setDisposalModalTab('requests');
      fetchInventoryRequests();
    } catch (err: any) {
      showToast(err.message || 'Failed to send disposal request.', 'error');
    } finally {
      setIsSendingDisposalRequest(false);
    }
  };

  const handleSubmitInventoryRequest = async () => {
    if (!requestReason.trim()) {
      showToast('Please enter a reason for storage/disposal.', 'error');
      return;
    }
    if (targetRequestRecords.length === 0) {
      showToast('No record series selected for request.', 'error');
      return;
    }

    setIsSubmittingRequest(true);
    try {
      let attachmentUrl = undefined;
      let attachmentName = undefined;

      if (requestFile) {
        try {
          const fileRes = await api.inventory.uploadAttachment(requestFile);
          attachmentUrl = fileRes.attachmentUrl;
          attachmentName = fileRes.attachmentName;
        } catch (uploadErr: any) {
          showToast(`File upload warning: ${uploadErr.message}. Submitting without attachment.`, 'info');
        }
      }

      const selectedRequestSummary = targetRequestRecords.map((r) => ({
        id: r.id,
        seriesTitle: r.seriesTitle,
        division: r.division || 'General',
        classificationCategory: r.classificationCategory || 'General',
        inclusiveDates: r.inclusiveDates,
      }));

      await api.inventory.createRequest({
        requestType,
        recordIds: targetRequestRecords.map((r) => r.id),
        recordsSummary: selectedRequestSummary,
        reason: requestReason,
        attachmentUrl,
        attachmentName,
      });

      showToast(`Request for ${requestType} submitted successfully! Awaiting Admin confirmation.`, 'success');
      setShowRequestModal(false);
      setRequestReason('');
      setRequestFile(null);
      setTargetRequestRecords([]);
      fetchInventoryRequests();
    } catch (err: any) {
      showToast(err.message || `Failed to submit ${requestType} request.`, 'error');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleAdminConfirmRequest = async (requestId: string) => {
    setIsProcessingAdminDecision(true);
    try {
      await api.inventory.confirmRequest(requestId, adminDecisionReason);
      showToast('Request confirmed! Inventory records updated and logged to history.', 'success');
      setAdminDecisionReason('');
      fetchRecords();
      fetchDisposalHistory();
      fetchInventoryRequests();
    } catch (err: any) {
      showToast(err.message || 'Failed to confirm request.', 'error');
    } finally {
      setIsProcessingAdminDecision(false);
    }
  };

  const handleAdminRejectRequest = async (requestId: string) => {
    if (!adminDecisionReason.trim()) {
      showToast('Please provide a reason for rejecting the request.', 'error');
      return;
    }
    setIsProcessingAdminDecision(true);
    try {
      await api.inventory.rejectRequest(requestId, adminDecisionReason);
      showToast('Request rejected.', 'info');
      setAdminDecisionReason('');
      fetchInventoryRequests();
    } catch (err: any) {
      showToast(err.message || 'Failed to reject request.', 'error');
    } finally {
      setIsProcessingAdminDecision(false);
    }
  };

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
    const targetStage = data.retentionStage;

    if (editingRecord?.id) {
      const oldStage = editingRecord.retentionStage || 'Active';

      if ((targetStage === 'Storage' || targetStage === 'Disposed') && targetStage !== oldStage) {
        // Keep old stage in DB for now and trigger request modal
        const payloadWithoutStageChange = { ...data, retentionStage: oldStage };
        await api.inventory.update(editingRecord.id, payloadWithoutStageChange);

        const recordToRequest = { ...editingRecord, ...payloadWithoutStageChange };
        if (targetStage === 'Storage') {
          openStorageRequestModal([recordToRequest]);
        } else {
          openDisposalRequestModal([recordToRequest]);
        }
        showToast(`Record updated. Changing stage to ${targetStage} requires Admin confirmation. Request modal opened!`, 'info');
        fetchRecords();
        return;
      }

      await api.inventory.update(editingRecord.id, data);
      showToast('Record series updated successfully!', 'success');
    } else {
      if (targetStage === 'Storage' || targetStage === 'Disposed') {
        const newRecord = await api.inventory.create({ ...data, retentionStage: 'Active' });
        showToast(`Record created. Stage change to ${targetStage} requires Admin confirmation. Request modal opened!`, 'info');
        if (targetStage === 'Storage') {
          openStorageRequestModal([newRecord]);
        } else {
          openDisposalRequestModal([newRecord]);
        }
        fetchRecords();
        return;
      }

      await api.inventory.create(data);
      showToast('New record series entry created successfully!', 'success');
    }
    fetchRecords();
  };

  // Dynamic active division records based on selected division tab
  const activeDivisionRecords = useMemo(() => {
    if (divisionTab === 'ALL') return authorizedRecords;
    return authorizedRecords.filter(r => (r.division || 'General').trim().toLowerCase() === divisionTab.trim().toLowerCase());
  }, [authorizedRecords, divisionTab]);

  // ── Helper to group records by Division, Category & Sub-Category ──────────
  interface NapRowItem {
    type: 'category' | 'subCategory' | 'record';
    title: string;
    record?: InventoryRecord;
    isUncategorized?: boolean;
  }

  const getGroupedNapItems = (list: InventoryRecord[]): NapRowItem[] => {
    const items: NapRowItem[] = [];
    // Category -> SubCategory -> Array of records
    const catMap = new Map<string, Map<string, InventoryRecord[]>>();

    list.forEach(r => {
      const cat = (r.classificationCategory || r.appraisalCategory || 'GENERAL').toUpperCase().trim();
      const sub = (r.subCategory || '').trim();

      if (!catMap.has(cat)) {
        catMap.set(cat, new Map());
      }
      const subMap = catMap.get(cat)!;
      if (!subMap.has(sub)) {
        subMap.set(sub, []);
      }
      subMap.get(sub)!.push(r);
    });

    const sortedCatKeys = Array.from(catMap.keys()).sort((a, b) => a.localeCompare(b));

    sortedCatKeys.forEach((catName) => {
      if (catName && catName !== 'GENERAL') {
        items.push({
          type: 'category',
          title: catName
        });
      }

      const subMap = catMap.get(catName)!;
      const sortedSubKeys = Array.from(subMap.keys()).sort((a, b) => a.localeCompare(b));

      sortedSubKeys.forEach((subName) => {
        if (subName) {
          items.push({
            type: 'subCategory',
            title: subName
          });
        }

        const recordsList = subMap.get(subName)!;
        recordsList.sort((a, b) => (a.seriesTitle || '').localeCompare(b.seriesTitle || ''));

        recordsList.forEach(r => {
          items.push({
            type: 'record',
            title: r.seriesTitle,
            record: r,
            isUncategorized: catName === 'GENERAL'
          });
        });
      });
    });

    if (items.length === 0 && list.length > 0) {
      const sortedList = [...list].sort((a, b) => (a.seriesTitle || '').localeCompare(b.seriesTitle || ''));
      sortedList.forEach(r => {
        items.push({ type: 'record', title: r.seriesTitle, record: r, isUncategorized: true });
      });
    }

    return items;
  };

  // ── Shared NAP Form 1 row builder ───────────────────────────────────────────
  const buildNapRows = (list: InventoryRecord[], _startNum: number, minRows: number = 15): string => {
    const items = getGroupedNapItems(list);
    const rows: string[] = [];

    items.forEach((item) => {
      if (item.type === 'category') {
        rows.push(`
          <tr style="height:24px; background:#fff;">
            <td colspan="14" style="border:1px solid #000; padding:4px 6px; font-weight:bold; font-size:9.5pt; font-family:Arial, sans-serif; text-transform:uppercase; text-align:left;">
              ${item.title}
            </td>
          </tr>
        `);
      } else if (item.type === 'subCategory') {
        rows.push(`
          <tr style="height:24px; background:#fff;">
            <td colspan="14" style="border:1px solid #000; padding:4px 6px 4px 20px; font-weight:bold; font-size:9pt; font-family:Arial, sans-serif; text-align:left;">
              ${item.title}
            </td>
          </tr>
        `);
      } else if (item.type === 'record' && item.record) {
        const r = item.record;
        const perm = r.appraisalCategory === 'Permanent';
        const util = (r.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim();

        rows.push(`
          <tr style="height:24px; background:#fff;">
            <td style="border:1px solid #000; padding:3px 6px 3px ${item.isUncategorized ? '6px' : '36px'}; font-size:9pt; vertical-align:top; font-family:Arial, sans-serif; word-break:break-word;">
              <div style="font-weight:normal; color:#000;">${r.seriesTitle || ''}</div>
              ${r.scopeDescription ? `<div style="font-size:7.5pt; color:#555; margin-top:1px;">${r.scopeDescription}</div>` : ''}
            </td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top; white-space:nowrap;">${formatDynamicDates(r.inclusiveDates)}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.volume || ''}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.medium || ''}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.restrictions && r.restrictions.toLowerCase() !== 'none' ? r.restrictions : ''}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.locationOfRecords || ''}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.frequencyOfUse || ''}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.duplication || ''}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.appraisalCategory || ''}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${util}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : r.activeDeskYrs}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : r.storageYrs}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : r.totalRetention}</td>
            <td style="border:1px solid #000; padding:3px 5px; font-size:9pt; vertical-align:top; word-break:break-word;">${r.dispositionProvision || ''}</td>
          </tr>
        `);
      }
    });

    const remaining = Math.max(0, minRows - items.length);
    for (let k = 0; k < remaining; k++) {
      rows.push(`
        <tr style="height:24px; background:#fff;">
          <td style="border:1px solid #000;padding:3px 5px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 4px;">&nbsp;</td>
          <td style="border:1px solid #000;padding:3px 5px;">&nbsp;</td>
        </tr>
      `);
    }

    return rows.join('');
  };

  const buildNapForm1Html = (
    list: InventoryRecord[],
    divisionLabel?: string,
    header?: { personInCharge?: string; telephoneNo?: string; emailAddress?: string; preparedBy?: string; assistedBy?: string; approvedBy?: string }
  ): string => {
    const ROWS_PER_PAGE = 15;
    const items = getGroupedNapItems(list);
    const pageCount = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE));
    const datePrepared = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const deptLabel = 'Human Resource Management and Development Office (HRMDO)';
    const sectionLabel = divisionLabel && divisionLabel !== 'ALL' ? divisionLabel : '';

    return Array.from({ length: pageCount }, (_, pi) => {
      const sliceItems = items.slice(pi * ROWS_PER_PAGE, (pi + 1) * ROWS_PER_PAGE);
      const isLast = pi === pageCount - 1;
      const pb = !isLast ? 'page-break-after:always;margin-bottom:20px;' : '';
      return `
        <div style="${pb} font-family: Arial, sans-serif; font-size: 8pt; color: #000; background: #fff; padding: 12px;">
          <!-- Small Top Identifier Tag -->
          <div style="font-size: 6.5pt; color: #333; margin-bottom: 4px; font-family: Arial, sans-serif; line-height: 1.2;">
            <div>NAP Records Inventory and Appraisal Form</div>
            <div>2024</div>
          </div>

          <!-- Official Top Header Grid Box matching reference image -->
          <table style="width: 100%; min-width: 1050px; border-collapse: collapse; border: 1.5px solid #000; font-size: 8pt; table-layout: fixed; font-family: Arial, sans-serif;">
            <tr>
              <td rowSpan="3" style="border: 1px solid #000; width: 33%; text-align: center; vertical-align: middle; padding: 10px 8px; background: #fff;">
                <div style="font-size: 9.5pt; font-weight: bold; letter-spacing: 0.2px;">NATIONAL ARCHIVES OF THE PHILIPPINES</div>
                <div style="font-size: 8.5pt; font-style: italic; margin-top: 1px;">Pambansang Sinupan ng Pilipinas</div>
                <div style="font-size: 10pt; font-weight: bold; margin-top: 14px; letter-spacing: 0.4px;">RECORDS INVENTORY AND APPRAISAL</div>
              </td>
              <td style="border: 1px solid #000; padding: 4px 6px; vertical-align: top; width: 33%;">
                <div style="font-weight: bold; font-size: 7.5pt;">1. NAME OF OFFICE:</div>
                <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 4px;">PROVINCIAL GOVERNMENT OF PANGASINAN</div>
              </td>
              <td style="border: 1px solid #000; padding: 4px 6px; vertical-align: top; width: 22%;">
                <div style="font-weight: bold; font-size: 7.5pt;">2. DEPARTMENT/DIVISION:</div>
                <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px;">${deptLabel}</div>
              </td>
              <td style="border: 1px solid #000; padding: 4px 6px; vertical-align: top; width: 12%;">
                <div style="font-weight: bold; font-size: 7.5pt;">4. TELEPHONE NO.:</div>
                <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px;">${header?.telephoneNo || ''}</div>
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 4px 6px; vertical-align: top;">
                <div style="font-weight: bold; font-size: 7.5pt;">6. ADDRESS:</div>
                <div style="text-align: center; font-size: 8pt; margin-top: 2px;">Provincial Capitol Complex Lingayen, Pangasinan</div>
              </td>
              <td style="border: 1px solid #000; padding: 4px 6px; vertical-align: top;">
                <div style="font-weight: bold; font-size: 7.5pt;">3. SECTION/UNIT:</div>
                <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px;">${sectionLabel}</div>
              </td>
              <td style="border: 1px solid #000; padding: 4px 6px; vertical-align: top;">
                <div style="font-weight: bold; font-size: 7.5pt;">5. EMAIL ADDRESS.:</div>
                <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px;">${header?.emailAddress || ''}</div>
              </td>
            </tr>
            <tr>
              <td colSpan="2" style="border: 1px solid #000; padding: 4px 6px; vertical-align: top;">
                <div style="font-weight: bold; font-size: 7.5pt;">7. PERSON-IN-CHARGE OF FILES:</div>
                <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px;">${header?.personInCharge || ''}</div>
              </td>
              <td style="border: 1px solid #000; padding: 4px 6px; vertical-align: top;">
                <div style="font-weight: bold; font-size: 7.5pt;">8. DATE PREPARED:</div>
                <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px;">${datePrepared}</div>
              </td>
            </tr>
          </table>

          <!-- Official Table Column Headers matching NAP Form 1 (Cols 9 to 20) -->
          <table style="width: 100%; min-width: 1050px; border-collapse: collapse; border: 1.5px solid #000; border-top: none; font-size: 7.5pt; table-layout: fixed; font-family: Arial, sans-serif; margin-top: -1px;">
            <thead>
              <tr style="background: #fff; height: 26px;">
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; width: 25%; font-weight: bold; text-align: center; vertical-align: middle;">
                  9. RECORDS SERIES TITLE AND DESCRIPTION
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; width: 8.5%; font-weight: bold; text-align: center; vertical-align: middle;">
                  10. PERIOD COVERED / INCLUSIVE DATES
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; width: 5%; font-weight: bold; text-align: center; vertical-align: middle;">
                  11. VOLUME
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; width: 5%; font-weight: bold; text-align: center; vertical-align: middle;">
                  12. RECORDS MEDIUM
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; width: 5.5%; font-weight: bold; text-align: center; vertical-align: middle;">
                  13. RESTRICTION/S
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; width: 7.5%; font-weight: bold; text-align: center; vertical-align: middle;">
                  14. LOCATION OF RECORDS
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; width: 5.5%; font-weight: bold; text-align: center; vertical-align: middle;">
                  15. FREQUENCY OF USE
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; width: 5.5%; font-weight: bold; text-align: center; vertical-align: middle;">
                  16. DUPLICATION
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; width: 4.5%; font-weight: bold; text-align: center; vertical-align: middle;">
                  17. TIME VALUE (T/P)
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; width: 5%; font-weight: bold; text-align: center; vertical-align: middle;">
                  18. UTILITY VALUE Adm/F/L/Arc
                </th>
                <th colSpan="3" style="border: 1px solid #000; padding: 2px; font-weight: bold; text-align: center; vertical-align: middle;">
                  19. RETENTION PERIOD
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; width: 17.5%; font-weight: bold; text-align: center; vertical-align: middle;">
                  20. DISPOSITION PROVISION
                </th>
              </tr>
              <tr style="background: #fff; height: 18px;">
                <th style="border: 1px solid #000; padding: 2px; width: 3.5%; font-weight: bold; text-align: center;">Active</th>
                <th style="border: 1px solid #000; padding: 2px; width: 3.5%; font-weight: bold; text-align: center;">Storage</th>
                <th style="border: 1px solid #000; padding: 2px; width: 3.5%; font-weight: bold; text-align: center;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${sliceItems.map((item) => {
        if (item.type === 'category') return `<tr style="height:24px; background:#fff;"><td colspan="14" style="border:1px solid #000; padding:4px 6px; font-weight:bold; font-size:9.5pt; font-family:Arial, sans-serif; text-transform:uppercase; text-align:left;">${item.title}</td></tr>`;
        if (item.type === 'subCategory') return `<tr style="height:24px; background:#fff;"><td colspan="14" style="border:1px solid #000; padding:4px 6px 4px 20px; font-weight:bold; font-size:9pt; font-family:Arial, sans-serif; text-align:left;">${item.title}</td></tr>`;
        const r = item.record!;
        const perm = r.appraisalCategory === 'Permanent';
        const util = (r.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim();
        return `<tr style="height:24px; background:#fff;">
                  <td style="border:1px solid #000; padding:3px 6px 3px ${item.isUncategorized ? '6px' : '36px'}; font-size:9pt; vertical-align:top; font-family:Arial, sans-serif; word-break:break-word;">
                    <div style="font-weight:normal; color:#000;">${r.seriesTitle || ''}</div>
                    ${r.scopeDescription ? `<div style="font-size:7.5pt; color:#555; margin-top:1px;">${r.scopeDescription}</div>` : ''}
                  </td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top; white-space:nowrap;">${formatDynamicDates(r.inclusiveDates)}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.volume || ''}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.medium || ''}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.restrictions && r.restrictions.toLowerCase() !== 'none' ? r.restrictions : ''}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.locationOfRecords || ''}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.frequencyOfUse || ''}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.duplication || ''}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.appraisalCategory || ''}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${util}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : r.activeDeskYrs}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : r.storageYrs}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : r.totalRetention}</td>
                  <td style="border:1px solid #000; padding:3px 5px; font-size:9pt; vertical-align:top; word-break:break-word;">${r.dispositionProvision || ''}</td>
                </tr>`;
      }).join('')}
            </tbody>
          </table>

          <!-- Official Legend Block matching reference image -->
          <div style="border: 1px solid #000; border-top: none; padding: 4px 6px; font-size: 7.5pt; font-family: Arial, sans-serif; background: #fff; min-width: 1050px; box-sizing: border-box;">
            <div style="font-weight: bold; text-decoration: underline;">LEGEND:</div>
            <div style="display: flex; gap: 40px; margin-top: 2px;">
              <div><strong>TIME VALUE:</strong> T &nbsp; - &nbsp; Temporary &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; P &nbsp; - &nbsp; Permanent</div>
              <div><strong>UTILITY VALUE:</strong> Adm &nbsp; - &nbsp; Administrative &nbsp;&nbsp;&nbsp;&nbsp; F &nbsp; - &nbsp; Fiscal &nbsp;&nbsp;&nbsp;&nbsp; L &nbsp; - &nbsp; Legal &nbsp;&nbsp;&nbsp;&nbsp; Arc &nbsp; - &nbsp; Archival</div>
            </div>
          </div>

          <!-- Official Signature Block matching reference image -->
          <table style="width: 100%; min-width: 1050px; border-collapse: collapse; border: 1.5px solid #000; border-top: none; font-size: 8pt; table-layout: fixed; font-family: Arial, sans-serif; background: #fff;">
            <tr style="height: 55px; vertical-align: bottom;">
              <td style="border-right: 1px solid #000; padding: 6px; width: 33%;">
                <div style="font-weight: bold; font-size: 7.5pt; margin-bottom: 8px;">PREPARED BY:</div>
                <div style="text-align: center; font-weight: bold; font-size: 10pt; min-height: 18px;">${header?.preparedBy || ''}</div>
                <div style="border-bottom: 1px solid #000; width: 85%; margin: 2px auto 0 auto;"></div>
                <div style="text-align: center; font-size: 7.5pt; margin-top: 2px; font-style: italic;">Name and Position</div>
              </td>
              <td style="border-right: 1px solid #000; padding: 6px; width: 33%;">
                <div style="font-weight: bold; font-size: 7.5pt; margin-bottom: 8px;">ASSISTED BY:</div>
                <div style="text-align: center; font-weight: bold; font-size: 10pt; min-height: 18px;">${header?.assistedBy || ''}</div>
                <div style="border-bottom: 1px solid #000; width: 85%; margin: 2px auto 0 auto;"></div>
                <div style="text-align: center; font-size: 7.5pt; margin-top: 2px; font-style: italic;">NAP Records Management Analyst</div>
              </td>
              <td style="padding: 6px; width: 34%;">
                <div style="font-weight: bold; font-size: 7.5pt; margin-bottom: 8px;">APPROVED BY:</div>
                <div style="text-align: center; font-weight: bold; font-size: 10pt; min-height: 18px;">${header?.approvedBy || ''}</div>
                <div style="border-bottom: 1px solid #000; width: 85%; margin: 2px auto 0 auto;"></div>
                <div style="text-align: center; font-size: 7.5pt; margin-top: 2px; font-style: italic;">Chief of the Division/Department</div>
              </td>
            </tr>
          </table>

          <!-- Dynamic Page Footer matching reference image -->
          <div style="display: flex; justify-content: space-between; font-size: 7.5pt; color: #444; margin-top: 4px; font-family: Arial, sans-serif;">
            <div>NAP Records Inventory and Appraisal Form 2024</div>
            <div>Page ${pi + 1} of ${pageCount} Pages</div>
          </div>
        </div>
      `;
    }).join('');
  };

  const buildNapForm1ExcelHtml = (
    list: InventoryRecord[],
    divisionLabel?: string,
    header?: { personInCharge?: string; telephoneNo?: string; emailAddress?: string; preparedBy?: string; assistedBy?: string; approvedBy?: string }
  ): string => {
    const items = getGroupedNapItems(list);
    const datePrepared = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const deptLabel = 'Human Resource Management and Development Office (HRMDO)';
    const sectionLabel = divisionLabel && divisionLabel !== 'ALL' ? divisionLabel : '';

    return `
      <div style="font-family: Arial, sans-serif; font-size: 9pt; color: #000; background: #fff; border: 1px solid #d4d4d4; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border-radius: 6px; overflow: hidden;">
        <!-- Excel Sheet Top Header Bar -->
        <div style="background: #f8f9fa; border-bottom: 1px solid #d4d4d4; padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; font-size: 8.5pt; color: #333;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: #107c41; color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 8pt; letter-spacing: 0.5px;">XLSX</span>
            <strong>NAP FORM 1 (FORMAT).xlsx</strong> &nbsp;—&nbsp; <span style="color: #666;">Sheet1 (Worksheet Grid)</span>
          </div>
          <div style="color: #666; font-size: 8pt; display: flex; align-items: center; gap: 14px;">
            <span>✓ Gridlines</span>
            <span>✓ Merged A:C Columns</span>
            <span>✓ Auto Height</span>
          </div>
        </div>

        <div style="overflow-x: auto;">
          <table style="width: 100%; min-width: 1200px; border-collapse: collapse; table-layout: fixed; font-family: Arial, sans-serif; font-size: 9pt; background: #fff;">
            <thead>
              <tr style="background: #f3f3f3; color: #555; font-size: 8pt; text-align: center; height: 22px;">
                <th style="width: 32px; border: 1px solid #d4d4d4; font-weight: bold; background: #e8e8e8;"></th>
                <th style="width: 8.5%; border: 1px solid #d4d4d4; font-weight: bold;">A</th>
                <th style="width: 8.5%; border: 1px solid #d4d4d4; font-weight: bold;">B</th>
                <th style="width: 8.5%; border: 1px solid #d4d4d4; font-weight: bold;">C</th>
                <th style="width: 10%; border: 1px solid #d4d4d4; font-weight: bold;">D</th>
                <th style="width: 4.5%; border: 1px solid #d4d4d4; font-weight: bold;">E</th>
                <th style="width: 5%; border: 1px solid #d4d4d4; font-weight: bold;">F</th>
                <th style="width: 6%; border: 1px solid #d4d4d4; font-weight: bold;">G</th>
                <th style="width: 7.5%; border: 1px solid #d4d4d4; font-weight: bold;">H</th>
                <th style="width: 5.5%; border: 1px solid #d4d4d4; font-weight: bold;">I</th>
                <th style="width: 5.5%; border: 1px solid #d4d4d4; font-weight: bold;">J</th>
                <th style="width: 4.5%; border: 1px solid #d4d4d4; font-weight: bold;">K</th>
                <th style="width: 6.5%; border: 1px solid #d4d4d4; font-weight: bold;">L</th>
                <th style="width: 3.5%; border: 1px solid #d4d4d4; font-weight: bold;">M</th>
                <th style="width: 3.5%; border: 1px solid #d4d4d4; font-weight: bold;">N</th>
                <th style="width: 3.5%; border: 1px solid #d4d4d4; font-weight: bold;">O</th>
                <th style="width: 14%; border: 1px solid #d4d4d4; font-weight: bold;">P</th>
              </tr>
            </thead>
            <tbody>
              <!-- Row 1 to 3: Header Grid Box -->
              <tr>
                <td style="background: #f3f3f3; color: #555; font-size: 7.5pt; text-align: center; border: 1px solid #d4d4d4; font-weight: bold;">1</td>
                <td colSpan="3" rowSpan="3" style="border: 1.5px solid #000; text-align: center; vertical-align: middle; padding: 6px 8px; background: #fff;">
                  <div style="font-size: 9.5pt; font-weight: bold; line-height: 1.2;">NATIONAL ARCHIVES OF THE PHILIPPINES</div>
                  <div style="font-size: 8.5pt; font-style: italic; margin-top: 2px;">Pambansang Sinupan ng Pilipinas</div>
                  <div style="font-size: 10pt; font-weight: bold; margin-top: 10px; line-height: 1.2;">RECORDS INVENTORY AND APPRAISAL</div>
                </td>
                <td colSpan="6" style="border: 1.5px solid #000; padding: 5px 8px; vertical-align: top;">
                  <div style="font-weight: bold; font-size: 7pt; color: #000;">1. NAME OF OFFICE:</div>
                  <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px; line-height: 1.2;">PROVINCIAL GOVERNMENT OF PANGASINAN</div>
                </td>
                <td colSpan="4" style="border: 1.5px solid #000; padding: 5px 8px; vertical-align: top;">
                  <div style="font-weight: bold; font-size: 7pt; color: #000;">2. DEPARTMENT/DIVISION:</div>
                  <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px; line-height: 1.2;">${deptLabel}</div>
                </td>
                <td colSpan="3" style="border: 1.5px solid #000; padding: 5px 8px; vertical-align: top;">
                  <div style="font-weight: bold; font-size: 7pt; color: #000;">4. TELEPHONE NO.:</div>
                  <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px; line-height: 1.2;">${header?.telephoneNo || ''}</div>
                </td>
              </tr>
              <tr>
                <td style="background: #f3f3f3; color: #555; font-size: 7.5pt; text-align: center; border: 1px solid #d4d4d4; font-weight: bold;">2</td>
                <td colSpan="6" style="border: 1.5px solid #000; padding: 5px 8px; vertical-align: top;">
                  <div style="font-weight: bold; font-size: 7pt; color: #000;">6. ADDRESS:</div>
                  <div style="text-align: center; font-size: 8pt; margin-top: 2px; line-height: 1.2;">Provincial Capitol Complex Lingayen, Pangasinan</div>
                </td>
                <td colSpan="4" style="border: 1.5px solid #000; padding: 5px 8px; vertical-align: top;">
                  <div style="font-weight: bold; font-size: 7pt; color: #000;">3. SECTION/UNIT:</div>
                  <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px; line-height: 1.2;">${sectionLabel}</div>
                </td>
                <td colSpan="3" style="border: 1.5px solid #000; padding: 5px 8px; vertical-align: top;">
                  <div style="font-weight: bold; font-size: 7pt; color: #000;">5. EMAIL ADDRESS.:</div>
                  <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px; line-height: 1.2;">${header?.emailAddress || ''}</div>
                </td>
              </tr>
              <tr>
                <td style="background: #f3f3f3; color: #555; font-size: 7.5pt; text-align: center; border: 1px solid #d4d4d4; font-weight: bold;">3</td>
                <td colSpan="10" style="border: 1.5px solid #000; padding: 5px 8px; vertical-align: top;">
                  <div style="font-weight: bold; font-size: 7pt; color: #000;">7. PERSON-IN-CHARGE OF FILES:</div>
                  <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px; line-height: 1.2;">${header?.personInCharge || ''}</div>
                </td>
                <td colSpan="3" style="border: 1.5px solid #000; padding: 5px 8px; vertical-align: top;">
                  <div style="font-weight: bold; font-size: 7pt; color: #000;">8. DATE PREPARED:</div>
                  <div style="text-align: center; font-weight: bold; font-size: 8.5pt; margin-top: 2px; line-height: 1.2;">${datePrepared}</div>
                </td>
              </tr>

              <!-- Table Headers (Rows 9-11 in Excel) -->
              <tr style="height: 28px;">
                <td style="background: #f3f3f3; color: #555; font-size: 7.5pt; text-align: center; border: 1px solid #d4d4d4; font-weight: bold;">9</td>
                <th colSpan="3" rowSpan="2" style="border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.2;">
                  9. RECORDS SERIES TITLE AND DESCRIPTION
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.2;">
                  10. PERIOD COVERED / INCLUSIVE DATES
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.2;">
                  11. VOLUME
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.2;">
                  12. RECORDS MEDIUM
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.2;">
                  13. RESTRICTION/S
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.2;">
                  14. LOCATION OF RECORDS
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.2;">
                  15. FREQUENCY OF USE
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.2;">
                  16. DUPLICATION
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.2;">
                  17. TIME VALUE (T/P)
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.2;">
                  18. UTILITY VALUE
                  <div style="font-weight: normal; font-size: 6.5pt; margin-top: 2px;">Adm/F/L/Arc</div>
                </th>
                <th colSpan="3" style="border: 1px solid #000; padding: 2px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt;">
                  19. RETENTION PERIOD
                </th>
                <th rowSpan="2" style="border: 1px solid #000; padding: 4px; font-weight: bold; text-align: center; vertical-align: middle; font-size: 7.5pt; line-height: 1.2;">
                  20. DISPOSITION PROVISION
                </th>
              </tr>
              <tr style="height: 18px;">
                <td style="background: #f3f3f3; color: #555; font-size: 7.5pt; text-align: center; border: 1px solid #d4d4d4; font-weight: bold;">10</td>
                <th style="border: 1px solid #000; padding: 2px; font-weight: bold; text-align: center; font-size: 7pt;">Active</th>
                <th style="border: 1px solid #000; padding: 2px; font-weight: bold; text-align: center; font-size: 7pt;">Storage</th>
                <th style="border: 1px solid #000; padding: 2px; font-weight: bold; text-align: center; font-size: 7pt;">Total</th>
              </tr>

              <!-- Data Rows starting at Row 12 in Excel -->
              ${items.map((item, index) => {
      const excelRowNum = 12 + index;
      if (item.type === 'category') {
        return `
                    <tr style="height: 24px;">
                      <td style="background: #f3f3f3; color: #555; font-size: 7.5pt; text-align: center; border: 1px solid #d4d4d4; font-weight: bold;">${excelRowNum}</td>
                      <td colSpan="16" style="border: 1px solid #000; padding: 4px 6px; font-weight: bold; font-size: 9.5pt; text-transform: uppercase;">
                        ${item.title}
                      </td>
                    </tr>
                  `;
      }
      if (item.type === 'subCategory') {
        return `
                    <tr style="height: 24px;">
                      <td style="background: #f3f3f3; color: #555; font-size: 7.5pt; text-align: center; border: 1px solid #d4d4d4; font-weight: bold;">${excelRowNum}</td>
                      <td colSpan="16" style="border: 1px solid #000; padding: 4px 6px 4px 20px; font-weight: bold; font-size: 9pt;">
                        ${item.title}
                      </td>
                    </tr>
                  `;
      }
      const r = item.record!;
      const perm = r.appraisalCategory === 'Permanent';
      const util = (r.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim();
      return `
                  <tr style="height: 24px;">
                    <td style="background: #f3f3f3; color: #555; font-size: 7.5pt; text-align: center; border: 1px solid #d4d4d4; font-weight: bold;">${excelRowNum}</td>
                    <td colSpan="3" style="border: 1px solid #000; padding: 3px 6px 3px ${item.isUncategorized ? '6px' : '36px'}; font-size: 9pt; vertical-align: top; word-break: break-word;">
                      <div style="font-weight: normal; color: #000;">${r.seriesTitle || ''}</div>
                      ${r.scopeDescription ? `<div style="font-size: 7.5pt; color: #555; margin-top: 1px;">${r.scopeDescription}</div>` : ''}
                    </td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top; white-space: nowrap;">${formatDynamicDates(r.inclusiveDates)}</td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top;">${r.volume || ''}</td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top;">${r.medium || ''}</td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top;">${r.restrictions && r.restrictions.toLowerCase() !== 'none' ? r.restrictions : ''}</td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top;">${r.locationOfRecords || ''}</td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top;">${r.frequencyOfUse || ''}</td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top;">${r.duplication || ''}</td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top;">${r.appraisalCategory || ''}</td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top;">${util}</td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top;">${perm ? '-' : r.activeDeskYrs}</td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top;">${perm ? '-' : r.storageYrs}</td>
                    <td style="border: 1px solid #000; padding: 3px 4px; font-size: 9pt; text-align: center; vertical-align: top;">${perm ? '-' : r.totalRetention}</td>
                    <td style="border: 1px solid #000; padding: 3px 5px; font-size: 9pt; vertical-align: top; word-break: break-word;">${r.dispositionProvision || ''}</td>
                  </tr>
                `;
    }).join('')}
            </tbody>
          </table>

          <!-- Official Signature Block matching Excel Format -->
          <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; border-top: none; font-size: 8pt; table-layout: fixed; font-family: Arial, sans-serif; background: #fff;">
            <tr style="height: 55px; vertical-align: bottom;">
              <td style="border-right: 1px solid #000; padding: 6px; width: 33%;">
                <div style="font-weight: bold; font-size: 7.5pt; margin-bottom: 8px;">PREPARED BY:</div>
                <div style="text-align: center; font-weight: bold; font-size: 10pt; min-height: 18px;">${header?.preparedBy || ''}</div>
                <div style="border-bottom: 1px solid #000; width: 85%; margin: 2px auto 0 auto;"></div>
                <div style="text-align: center; font-size: 7.5pt; margin-top: 2px; font-style: italic;">Name and Position</div>
              </td>
              <td style="border-right: 1px solid #000; padding: 6px; width: 33%;">
                <div style="font-weight: bold; font-size: 7.5pt; margin-bottom: 8px;">ASSISTED BY:</div>
                <div style="text-align: center; font-weight: bold; font-size: 10pt; min-height: 18px;">${header?.assistedBy || ''}</div>
                <div style="border-bottom: 1px solid #000; width: 85%; margin: 2px auto 0 auto;"></div>
                <div style="text-align: center; font-size: 7.5pt; margin-top: 2px; font-style: italic;">NAP Records Management Analyst</div>
              </td>
              <td style="padding: 6px; width: 34%;">
                <div style="font-weight: bold; font-size: 7.5pt; margin-bottom: 8px;">APPROVED BY:</div>
                <div style="text-align: center; font-weight: bold; font-size: 10pt; min-height: 18px;">${header?.approvedBy || ''}</div>
                <div style="border-bottom: 1px solid #000; width: 85%; margin: 2px auto 0 auto;"></div>
                <div style="text-align: center; font-size: 7.5pt; margin-top: 2px; font-style: italic;">Chief of the Division/Department</div>
              </td>
            </tr>
          </table>

          <!-- Dynamic Page Footer matching reference image -->
          <div style="display: flex; justify-content: space-between; font-size: 7.5pt; color: #444; padding: 6px 12px; background: #fff; font-family: Arial, sans-serif;">
            <div>NAP Records Inventory and Appraisal Form 2024</div>
            <div>Page 1 of 1 Pages</div>
          </div>
        </div>
      </div>
    `;
  };

  const handlePrintNapForm1 = (printRecords?: InventoryRecord[], divisionLabel?: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Pop-up blocked. Please allow pop-ups to print the report.', 'error');
      return;
    }
    const list = printRecords ?? activeDivisionRecords;
    const label = divisionLabel ?? (divisionTab === 'ALL' ? undefined : divisionTab);
    const contentHtml = previewViewMode === 'excel'
      ? buildNapForm1ExcelHtml(list, label, napFormHeader)
      : buildNapForm1Html(list, label, napFormHeader);

    const html = `<html><head><title>NAP FORM 1${label ? ` - ${label}` : ''}</title><style>
      @media print {
        @page { size: 8.5in 13in landscape; margin: 0.35in; }
        body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
      body { font-family: Arial, sans-serif; color: #000; margin: 12px; padding: 0; }
    </style></head><body>${contentHtml}
    <script>window.print();window.onafterprint=function(){window.close();};setTimeout(function(){window.close();},15000);<\/script>
    </body></html>`;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };
  // ── NAP Form 1 per-division XLSX export (preserves 100% official template styles & borders) ──
  const handleExportNapForm1 = async () => {
    try {
      showToast('Preparing NAP Form 1 Excel export...', 'info');
      let templateBuffer: ArrayBuffer | null = null;
      // Check Electron IPC first if running inside desktop app
      if ((window as any).electronAPI && typeof (window as any).electronAPI.getTemplateFile === 'function') {
        try {
          templateBuffer = await (window as any).electronAPI.getTemplateFile();
        } catch (e) {
          console.warn('Electron IPC template fetch failed, falling back to HTTP fetch:', e);
        }
      }

      if (!templateBuffer) {
        const t = Date.now();
        const urlsToTry = [
          `/api/nap-template?t=${t}`,
          `${encodeURI('/NAP FORM 1 (FORMAT).xlsx')}?t=${t}`,
          `/NAP%20FORM%201%20(FORMAT).xlsx?t=${t}`,
          `${encodeURI('/NAP FORM 1 (Sample Format).xlsx')}?t=${t}`,
          `/NAP%20FORM%201%20(Sample%20Format).xlsx?t=${t}`,
          `/nap_template.xlsx?t=${t}`,
          `/template.xlsx?t=${t}`
        ];
        for (const url of urlsToTry) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              templateBuffer = await res.arrayBuffer();
              break;
            }
          } catch {
            // ignore and retry next url
          }
        }
      }

      if (!templateBuffer) {
        throw new Error('Official NAP FORM 1 (FORMAT).xlsx template file could not be loaded.');
      }

      const datePrepared = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const dateStr = new Date().toISOString().slice(0, 10);

      const processZipSheet = async (list: InventoryRecord[], divName: string): Promise<Blob> => {
        const zip = await JSZip.loadAsync(templateBuffer!);
        const sheetPath = 'xl/worksheets/sheet1.xml';
        const xmlText = await zip.file(sheetPath)!.async('text');

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

        const deptLabel = (divName && divName !== 'ALL')
          ? `Human Resource Management and Development Office (HRMDO) - ${divName}`
          : 'Human Resource Management and Development Office (HRMDO)';
        const sectionLabel = napFormHeader.sectionUnit || (divName && divName !== 'ALL' ? divName : '');

        const colIndex = (col: string) => {
          let num = 0;
          for (let i = 0; i < col.length; i++) {
            num = num * 26 + (col.charCodeAt(i) - 64);
          }
          return num;
        };

        const sortRowCells = (rowNode: Element) => {
          const cells = Array.from(rowNode.getElementsByTagNameNS('*', 'c'));
          cells.sort((a, b) => {
            const rA = a.getAttribute('r') || '';
            const rB = b.getAttribute('r') || '';
            const cA = colIndex(rA.replace(/[0-9]/g, ''));
            const cB = colIndex(rB.replace(/[0-9]/g, ''));
            return cA - cB;
          });
          cells.forEach(c => rowNode.appendChild(c));
        };

        const findCellNode = (parent: Element | Document, cellRef: string): Element | null => {
          const cells = Array.from(parent.getElementsByTagNameNS('*', 'c'));
          return cells.find(c => c.getAttribute('r') === cellRef) || null;
        };

        // Capture template table cell border styles and row height from Row 20 (or Row 15) for all columns A..P
        const templateColStyles: { [colName: string]: string } = {};
        const dataTemplateRow = Array.from(xmlDoc.getElementsByTagNameNS('*', 'row')).find(r => r.getAttribute('r') === '20')
          || Array.from(xmlDoc.getElementsByTagNameNS('*', 'row')).find(r => r.getAttribute('r') === '15')
          || Array.from(xmlDoc.getElementsByTagNameNS('*', 'row')).find(r => r.getAttribute('r') === '33');

        const templateRowHeight = dataTemplateRow?.getAttribute('ht') || '20';

        if (dataTemplateRow) {
          const cells = Array.from(dataTemplateRow.getElementsByTagNameNS('*', 'c'));
          cells.forEach(c => {
            const rRef = c.getAttribute('r') || '';
            const colName = rRef.replace(/[0-9]/g, '');
            const sStyle = c.getAttribute('s');
            if (colName && sStyle) {
              templateColStyles[colName] = sStyle;
            }
          });
        }

        const setCellVal = (cellRef: string, val: string, isBold: boolean = false, fontSz: string = '9', explicitStyle?: string) => {
          const colName = cellRef.replace(/[0-9]/g, '');
          const rowNum = parseInt(cellRef.replace(/[^0-9]/g, ''), 10);

          let rowNode = xmlDoc.querySelector(`row[r="${rowNum}"]`);
          if (!rowNode) {
            const rows = Array.from(xmlDoc.getElementsByTagNameNS('*', 'row'));
            rowNode = rows.find(r => r.getAttribute('r') === String(rowNum)) || null;
          }

          if (!rowNode) {
            const sheetData = xmlDoc.getElementsByTagNameNS('*', 'sheetData')[0];
            if (!sheetData) return;
            rowNode = xmlDoc.createElementNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'row');
            rowNode.setAttribute('r', String(rowNum));
            rowNode.setAttribute('ht', templateRowHeight);
            rowNode.setAttribute('customHeight', '1');
            sheetData.appendChild(rowNode);
          }

          if (templateRowHeight && !rowNode.getAttribute('ht')) {
            rowNode.setAttribute('ht', templateRowHeight);
            rowNode.setAttribute('customHeight', '1');
          }

          let cellNode = findCellNode(rowNode, cellRef);
          if (!cellNode) {
            cellNode = xmlDoc.createElementNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'c');
            cellNode.setAttribute('r', cellRef);
            rowNode.appendChild(cellNode);
          }

          if (!cellNode.getAttribute('s')) {
            if (explicitStyle) {
              cellNode.setAttribute('s', explicitStyle);
            } else if (templateColStyles[colName]) {
              cellNode.setAttribute('s', templateColStyles[colName]);
            }
          }

          cellNode.removeAttribute('t');
          while (cellNode.firstChild) {
            cellNode.removeChild(cellNode.firstChild);
          }

          if (val !== undefined && val !== null && val !== '') {
            const strVal = String(val).trim();
            if (/^\d+$/.test(strVal)) {
              cellNode.setAttribute('t', 'n');
              const vNode = xmlDoc.createElementNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'v');
              vNode.textContent = strVal;
              cellNode.appendChild(vNode);
            } else {
              cellNode.setAttribute('t', 'inlineStr');
              const isNode = xmlDoc.createElementNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'is');
              const tNode = xmlDoc.createElementNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 't');
              tNode.setAttribute('xml:space', 'preserve');
              tNode.textContent = val;
              isNode.appendChild(tNode);
              cellNode.appendChild(isNode);
            }
          }

          sortRowCells(rowNode);
        };

        const clearCellVal = (cellRef: string) => {
          const rowNum = parseInt(cellRef.replace(/[^0-9]/g, ''), 10);
          const rowNode = Array.from(xmlDoc.getElementsByTagNameNS('*', 'row')).find(r => r.getAttribute('r') === String(rowNum));
          if (rowNode) {
            const cellNode = findCellNode(rowNode, cellRef);
            if (cellNode) {
              while (cellNode.firstChild) {
                cellNode.removeChild(cellNode.firstChild);
              }
              cellNode.removeAttribute('t');
            }
          }
        };

        // Set Top Header block (A1:C8 merged area)
        setCellVal('A1', 'NATIONAL ARCHIVES OF THE PHILIPPINES\nPambansang Sinupan ng Pilipinas\n\nRECORDS INVENTORY AND APPRAISAL', true, '10');

        // Header info
        setCellVal('J4', deptLabel, true, '8.5');
        setCellVal('J6', sectionLabel, true, '8.5');
        setCellVal('N4', napFormHeader.telephoneNo || '', true, '8.5');
        setCellVal('N6', napFormHeader.emailAddress || '', true, '8.5');
        setCellVal('J8', napFormHeader.personInCharge || '', true, '8.5');
        setCellVal('N8', datePrepared, true, '8.5');

        const items = getGroupedNapItems(list);

        let mergeCellsNode = xmlDoc.getElementsByTagNameNS('*', 'mergeCells')[0];
        if (!mergeCellsNode) {
          mergeCellsNode = xmlDoc.createElementNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'mergeCells');
          const pageMarginsNode = xmlDoc.getElementsByTagNameNS('*', 'pageMargins')[0];
          if (pageMarginsNode && pageMarginsNode.parentNode) {
            pageMarginsNode.parentNode.insertBefore(mergeCellsNode, pageMarginsNode);
          } else {
            xmlDoc.getElementsByTagNameNS('*', 'worksheet')[0]?.appendChild(mergeCellsNode);
          }
        }

        const extraRows = Math.max(0, items.length - 22);

        if (extraRows > 0) {
          if (mergeCellsNode) {
            const allMerges = Array.from(mergeCellsNode.getElementsByTagNameNS('*', 'mergeCell'));
            allMerges.forEach(mc => {
              const ref = (mc.getAttribute('ref') || '').trim();
              const match = ref.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
              if (match) {
                const startCol = match[1].toUpperCase();
                const startRow = parseInt(match[2], 10);
                const endCol = (match[3] || startCol).toUpperCase();
                const endRow = parseInt(match[4] || match[2], 10);

                if (startRow >= 34) {
                  const newRef = `${startCol}${startRow + extraRows}:${endCol}${endRow + extraRows}`;
                  mc.setAttribute('ref', newRef);
                }
              }
            });
          }

          const sheetData = xmlDoc.getElementsByTagNameNS('*', 'sheetData')[0];
          if (sheetData) {
            const rows = Array.from(sheetData.getElementsByTagNameNS('*', 'row'));
            const templateBottomRows = rows
              .filter(r => parseInt(r.getAttribute('r') || '0', 10) >= 34)
              .sort((a, b) => parseInt(b.getAttribute('r') || '0', 10) - parseInt(a.getAttribute('r') || '0', 10));

            templateBottomRows.forEach(row => {
              const rNum = parseInt(row.getAttribute('r') || '0', 10);
              const newRNum = rNum + extraRows;
              row.setAttribute('r', String(newRNum));

              const cells = Array.from(row.getElementsByTagNameNS('*', 'c'));
              cells.forEach(cell => {
                const oldRef = cell.getAttribute('r') || '';
                const colName = oldRef.replace(/[0-9]/g, '');
                cell.setAttribute('r', `${colName}${newRNum}`);
              });
            });
          }
        }

        const existingMerges = new Set<string>();
        if (mergeCellsNode) {
          const mcs = Array.from(mergeCellsNode.getElementsByTagNameNS('*', 'mergeCell'));
          mcs.forEach(mc => {
            const r = mc.getAttribute('ref');
            if (r) existingMerges.add(r.toUpperCase().trim());
          });
        }

        let categoryStyle = '';
        let subCategoryStyle = '';
        let entryStyle = '';

        // Dynamically find placeholders
        const allCells = Array.from(xmlDoc.getElementsByTagNameNS('*', 'c'));
        const sharedStrings: string[] = [];
        try {
          const zip = await JSZip.loadAsync(templateBuffer!);
          const ssXml = await zip.file('xl/sharedStrings.xml')?.async('text');
          if (ssXml) {
            const parser2 = new DOMParser();
            const ssDoc = parser2.parseFromString(ssXml, 'application/xml');
            const siNodes = Array.from(ssDoc.getElementsByTagNameNS('*', 'si'));
            for (const si of siNodes) {
              const tNode = si.getElementsByTagNameNS('*', 't')[0];
              sharedStrings.push(tNode ? tNode.textContent : '');
            }
          }
        } catch (e) {
           // ignore
        }

        allCells.forEach(c => {
          const tType = c.getAttribute('t');
          let val = '';
          if (tType === 's') {
             const vNode = c.getElementsByTagNameNS('*', 'v')[0];
             if (vNode && vNode.textContent) {
                const idx = parseInt(vNode.textContent, 10);
                if (sharedStrings[idx]) val = sharedStrings[idx]!;
             }
          } else if (tType === 'inlineStr') {
             const tNode = c.getElementsByTagNameNS('*', 't')[0];
             if (tNode) val = tNode.textContent || '';
          } else {
             const vNode = c.getElementsByTagNameNS('*', 'v')[0];
             if (vNode) val = vNode.textContent || '';
          }
          
          if (val) {
             const v = val.trim().toLowerCase();
             if (v === 'category' && !categoryStyle) categoryStyle = c.getAttribute('s') || '';
             else if (v === 'sub category' && !subCategoryStyle) subCategoryStyle = c.getAttribute('s') || '';
             else if (v === 'entry' && !entryStyle) entryStyle = c.getAttribute('s') || '';
          }
        });

        items.forEach((item, i) => {
          const rNum = 12 + i;

          if (rNum > 33) {
            ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'].forEach(col => {
              setCellVal(`${col}${rNum}`, '');
            });
          }

          if (mergeCellsNode) {
            const ref = `A${rNum}:C${rNum}`;
            if (!existingMerges.has(ref)) {
              const mc = xmlDoc.createElementNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'mergeCell');
              mc.setAttribute('ref', ref);
              mergeCellsNode.appendChild(mc);
              existingMerges.add(ref);
            }
          }

          if (item.type === 'category') {
            setCellVal(`A${rNum}`, item.title, true, '9.5', categoryStyle);
          } else if (item.type === 'subCategory') {
            setCellVal(`A${rNum}`, item.title, true, '9', subCategoryStyle);
          } else if (item.type === 'record' && item.record) {
            const r = item.record;
            const perm = r.appraisalCategory === 'Permanent';
            const util = (r.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim();

            setCellVal(`A${rNum}`, `${item.isUncategorized ? ' ' : ''}${r.seriesTitle || ''}`, false, '9', entryStyle);
            setCellVal(`D${rNum}`, formatDynamicDates(r.inclusiveDates), false, '9');
            setCellVal(`E${rNum}`, r.volume || '', false, '9');
            setCellVal(`F${rNum}`, r.medium || '', false, '9');
            setCellVal(`G${rNum}`, r.restrictions && r.restrictions.toLowerCase() !== 'none' ? r.restrictions : '', false, '9');
            setCellVal(`H${rNum}`, r.locationOfRecords || '', false, '9');
            setCellVal(`I${rNum}`, r.frequencyOfUse || '', false, '9');
            setCellVal(`J${rNum}`, r.duplication || '', false, '9');
            setCellVal(`K${rNum}`, r.appraisalCategory || '', false, '9');
            setCellVal(`L${rNum}`, util, false, '9');
            setCellVal(`M${rNum}`, perm ? '-' : String(r.activeDeskYrs), false, '9');
            setCellVal(`N${rNum}`, perm ? '-' : String(r.storageYrs), false, '9');
            setCellVal(`O${rNum}`, perm ? '-' : String(r.totalRetention), false, '9');
            setCellVal(`P${rNum}`, r.dispositionProvision || '', false, '9');
          }
        });

        clearCellVal(`P${43 + extraRows}`);
        clearCellVal(`P${44 + extraRows}`);

        // Populate signature block values on shifted signature row (41 + extraRows)
        const pVal = napFormHeader.preparedBy || '';
        const aVal = napFormHeader.assistedBy || '';
        const vVal = napFormHeader.approvedBy || '';
        const sigRow = 41 + extraRows;

        setCellVal(`C${sigRow}`, pVal, true, '10');
        setCellVal(`H${sigRow}`, aVal, true, '10');
        setCellVal(`L${sigRow}`, vVal, true, '10');
        setCellVal(`M${sigRow}`, vVal, true, '10');
        setCellVal(`N${sigRow}`, vVal, true, '10');

        const rowSig = xmlDoc.querySelector(`row[r="${sigRow}"]`) || xmlDoc;
        const cellHSig = findCellNode(rowSig, `H${sigRow}`);
        const centerStyle = cellHSig?.getAttribute('s');

        [`A${40 + extraRows}`, `A${sigRow}`, `B${40 + extraRows}`, `B${sigRow}`, `D${sigRow}`, `E${sigRow}`, `F${40 + extraRows}`, `F${sigRow}`, `G${sigRow}`, `I${sigRow}`, `J${sigRow}`, `K${40 + extraRows}`, `K${sigRow}`, `O${sigRow}`, `P${sigRow}`].forEach(ref => {
          clearCellVal(ref);
        });

        if (centerStyle) {
          [`C${sigRow}`, `H${sigRow}`, `L${sigRow}`, `M${sigRow}`, `N${sigRow}`].forEach(ref => {
            const node = findCellNode(rowSig, ref);
            if (node) node.setAttribute('s', centerStyle);
          });
        }

        const maxRow = 44 + extraRows;
        const dimensionNode = xmlDoc.getElementsByTagNameNS('*', 'dimension')[0];
        if (dimensionNode) {
          dimensionNode.setAttribute('ref', `A1:P${maxRow}`);
        }

        if (mergeCellsNode) {
          const seenMerges = new Set<string>();
          const allMerges = Array.from(mergeCellsNode.getElementsByTagNameNS('*', 'mergeCell'));
          allMerges.forEach(mc => {
            const ref = (mc.getAttribute('ref') || '').toUpperCase().trim();
            if (seenMerges.has(ref)) {
              mc.parentNode?.removeChild(mc);
            } else {
              seenMerges.add(ref);
            }
          });
          mergeCellsNode.setAttribute('count', String(seenMerges.size));

          const targetNode = xmlDoc.getElementsByTagNameNS('*', 'printOptions')[0]
            || xmlDoc.getElementsByTagNameNS('*', 'pageMargins')[0]
            || xmlDoc.getElementsByTagNameNS('*', 'pageSetup')[0]
            || xmlDoc.getElementsByTagNameNS('*', 'drawing')[0];

          if (targetNode && targetNode.parentNode && mergeCellsNode.nextSibling !== targetNode) {
            targetNode.parentNode.insertBefore(mergeCellsNode, targetNode);
          }
        }

        // Set Legal 8.5 x 13 in / Folio paperSize 5 in landscape
        let pageSetupNode = xmlDoc.getElementsByTagNameNS('*', 'pageSetup')[0];
        if (!pageSetupNode) {
          pageSetupNode = xmlDoc.createElementNS('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'pageSetup');
          const worksheetNode = xmlDoc.getElementsByTagNameNS('*', 'worksheet')[0];
          worksheetNode?.appendChild(pageSetupNode);
        }
        pageSetupNode.setAttribute('paperSize', '5');
        pageSetupNode.setAttribute('orientation', 'landscape');
        pageSetupNode.setAttribute('fitToWidth', '1');
        pageSetupNode.setAttribute('fitToHeight', '0');

        const sortSheetRows = () => {
          const sheetData = xmlDoc.getElementsByTagNameNS('*', 'sheetData')[0];
          if (!sheetData) return;
          const rows = Array.from(sheetData.getElementsByTagNameNS('*', 'row'));
          rows.sort((a, b) => {
            const rA = parseInt(a.getAttribute('r') || '0', 10);
            const rB = parseInt(b.getAttribute('r') || '0', 10);
            return rA - rB;
          });
          rows.forEach(r => sheetData.appendChild(r));
        };

        sortSheetRows();

        const serializer = new XMLSerializer();
        const newXmlText = serializer.serializeToString(xmlDoc);

        zip.file(sheetPath, newXmlText);
        return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      };

      if (divisionTab !== 'ALL') {
        const blob = await processZipSheet(activeDivisionRecords, divisionTab);
        const sName = divisionTab.replace(/[:\\/?*[\]]/g, '').slice(0, 31);
        saveAs(blob, `NAP-Form-1-${sName}-${dateStr}.xlsx`);
        showToast(`NAP Form 1 exported for ${divisionTab} using official template.`, 'success');
      } else {
        const blob = await processZipSheet(authorizedRecords, 'ALL');
        saveAs(blob, `NAP-Form-1-All-Divisions-${dateStr}.xlsx`);
        showToast(`NAP Form 1 exported for All Divisions using official template.`, 'success');
      }
    } catch (err: any) {
      console.error('JSZip Export Error:', err);
      showToast(`Export failed: ${err?.message || 'Template error'}`, 'error');
    }
  };







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
    const filtered = authorizedRecords.filter((r) => {
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
          matchesRetention = r.disposalStatus === 'Safe for Disposal' || getOngoingDisposalInfo(r.inclusiveDates, Number(r.totalRetention), r.retentionStage, r.frequencyOfUse) !== null;
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
  }, [authorizedRecords, searchQuery, divisionTab, categoryFilter, mediumFilter, retentionFilter, frequencyFilter, utilityFilter, locationFilter]);

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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginLeft: 'auto' }}>
          {hasFullDivisionAccess && (
            <Button
              variant={pendingRequests.length > 0 ? "primary" : "secondary"}
              onClick={() => {
                fetchInventoryRequests();
                setShowPendingRequestsModal(true);
              }}
              style={{ position: 'relative', fontWeight: pendingRequests.length > 0 ? 700 : 500 }}
            >
              <MdAssignment style={{ marginRight: '0.35rem', fontSize: '1.15rem', color: pendingRequests.length > 0 ? '#b45309' : '#2563eb' }} />
              Pending Requests ({pendingRequests.length})
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              fetchDisposalHistory();
              fetchInventoryRequests();
              setStorageModalTab(stagedStorageRecords.length > 0 ? 'confirmation' : (hasFullDivisionAccess && pendingRequests.length > 0 ? 'requests' : 'history'));
              setShowStorageManagementModal(true);
            }}
          >
            <MdInventory style={{ marginRight: '0.35rem', fontSize: '1.15rem', color: '#d97706' }} /> Storage Management ({storageLogs.length} History{stagedStorageRecords.length > 0 ? `, ${stagedStorageRecords.length} Staged` : ''})
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              fetchDisposalHistory();
              fetchInventoryRequests();
              setDisposalModalTab(stagedDisposalRecords.length > 0 ? 'confirmation' : (hasFullDivisionAccess && pendingDisposalRequests.length > 0 ? 'requests' : 'history'));
              setShowDisposalManagementModal(true);
            }}
          >
            <MdDeleteSweep style={{ marginRight: '0.35rem', fontSize: '1.15rem', color: '#dc2626' }} /> Disposal Management ({disposalOnlyLogs.length} History{stagedDisposalRecords.length > 0 ? `, ${stagedDisposalRecords.length} Staged` : ''})
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

        <Card
          hoverable
          className="inventory-kpi-card inventory-kpi-card--amber"
          onClick={() => setShowActiveDeskModal(true)}
          style={{ cursor: 'pointer' }}
          title="Click to open modal displaying all records eligible for storage evaluation"
        >
          <div className="inventory-kpi-card__inner">
            <div className="inventory-kpi-card__icon-wrapper inventory-kpi-card__icon-wrapper--amber">
              <MdHourglassTop />
            </div>
            <div className="inventory-kpi-card__info">
              <span className="inventory-kpi-card__label">Evaluate Storage</span>
              <span className="inventory-kpi-card__value inventory-kpi-card__value--amber">{activeDeskEligibleRecords.length}</span>
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
        {/* Division Breakdown (Only shown for users with full division access) */}
        {hasFullDivisionAccess && (
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
        )}

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
            ? authorizedRecords.length
            : authorizedRecords.filter(r => (r.division || 'General').trim().toLowerCase() === div.trim().toLowerCase()).length;
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Records Series Inventory Table</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>

            <Button variant="secondary" onClick={() => setShowNapFormPreview(true)}>
              <MdPrint style={{ marginRight: '0.35rem', fontSize: '1.05rem' }} /> View & Print NAP Form 1
            </Button>
          </div>
        </div>
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
                          const activeDeskInfo = getOngoingActiveDeskInfo(r.inclusiveDates, Number(r.activeDeskYrs), r.retentionStage);
                          const disposalInfo = getOngoingDisposalInfo(r.inclusiveDates, Number(r.totalRetention), r.retentionStage, r.frequencyOfUse);

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
                                <div style={{ fontWeight: 600, color: 'var(--color-primary)', lineHeight: 1.3 }}>{cleanSeriesTitle(r.seriesTitle)}</div>
                                {r.scopeDescription && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '3px', fontStyle: 'italic', lineHeight: 1.25 }}>
                                    {r.scopeDescription}
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <div>{formatDynamicDates(r.inclusiveDates)}</div>
                                {activeDeskInfo && (
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
                                      setSingleStorageRecord(r);
                                    }}
                                    title={`Active desk period of ${r.activeDeskYrs} years reached! Click to evaluate moving to storage.`}
                                  >
                                    <MdHourglassTop style={{ fontSize: '0.75rem' }} /> Move to Storage
                                  </button>
                                )}
                                {disposalInfo && (
                                  <button
                                    type="button"
                                    style={{
                                      marginTop: '0.25rem',
                                      fontSize: '0.68rem',
                                      padding: '0.15rem 0.45rem',
                                      borderRadius: '4px',
                                      border: '1px solid #dc2626',
                                      background: 'rgba(239, 68, 68, 0.12)',
                                      color: '#dc2626',
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
                                    title={`Retention period of ${disposalInfo.totalRetention} years reached in Storage! Click to evaluate disposal.`}
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
                  onClick={() => {
                    const rec = evaluatingRecord.record;
                    setEvaluatingRecord(null);
                    setViewingRecord(null);
                    if (isCustomSelected && customDisposedYears.length > 0) {
                      const yearRecords = customDisposedYears.map((yr) => ({
                        ...rec,
                        id: `${rec.id}-yr-${yr}`,
                        inclusiveDates: String(yr),
                        seriesTitle: `${rec.seriesTitle} (${yr})`,
                      }));
                      openDisposalRequestModal(yearRecords);
                    } else {
                      const startYear = evaluatingRecord.info.ongoingStartYear;
                      const yearRec = {
                        ...rec,
                        id: `${rec.id}-yr-${startYear}`,
                        inclusiveDates: String(startYear),
                        seriesTitle: `${rec.seriesTitle} (${startYear})`,
                      };
                      openDisposalRequestModal([yearRec]);
                    }
                    setCustomDisposedYears([]);
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
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '1rem', borderRadius: '8px', fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              <strong>Records Eligible for Evaluation & Disposal:</strong> The following record series have reached their designated retention schedule period. Click <strong>"Evaluate & Dispose ➔"</strong> to review expired years and update active periods.
            </div>

            {disposalEligibleRecords.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                No records currently eligible for disposal evaluation.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '400px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Item No.</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Record Series</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Division</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Category</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Inclusive Dates</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Total Retention</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disposalEligibleRecords.map((r, idx) => {
                      const ongoingInfo = getOngoingDisposalInfo(r.inclusiveDates, Number(r.totalRetention));
                      return (
                        <tr key={`eval-row-${r.id}-${idx}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                            {r.prdsGrds && r.itemNo ? (
                              <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)' }}>{r.prdsGrds}</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)' }}>{r.itemNo}</div>
                              </div>
                            ) : (
                              r.prdsGrds || r.itemNo || '-'
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{cleanSeriesTitle(r.seriesTitle)}</div>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-primary)' }}>{r.division || 'General'}</td>
                          <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary)' }}>{r.classificationCategory || '-'}</td>
                          <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap' }}>
                            <strong>{formatDynamicDates(r.inclusiveDates)}</strong>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: '#dc2626' }}>
                            {r.totalRetention ? `${r.totalRetention} Year(s)` : '-'}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                            <Button
                              variant="primary"
                              size="sm"
                              style={{ background: '#dc2626', borderColor: '#dc2626' }}
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
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 3-Tab Storage Management Modal (Confirmation of Storage, Requests, History) */}
      {showStorageManagementModal && (
        <Modal
          isOpen={showStorageManagementModal}
          onClose={() => setShowStorageManagementModal(false)}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <MdInventory style={{ color: '#d97706', fontSize: '1.4rem' }} />
              <span>Storage Management</span>
            </div>
          }
          size="xl"
        >
          <div style={{ padding: '0.25rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: '520px', justifyContent: 'space-between' }}>
            {/* Navigation Tabs Bar */}
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              borderBottom: '2px solid var(--border-color)',
              paddingBottom: '0.25rem',
            }}>
              <button
                type="button"
                onClick={() => setStorageModalTab('confirmation')}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: storageModalTab === 'confirmation' ? 700 : 500,
                  color: storageModalTab === 'confirmation' ? 'var(--color-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderBottom: storageModalTab === 'confirmation' ? '2.5px solid var(--color-primary)' : 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>Confirmation of Storage</span>
                {stagedStorageRecords.length > 0 && (
                  <span style={{
                    background: 'rgba(217, 119, 6, 0.15)',
                    color: '#d97706',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '99px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                  }}>
                    {stagedStorageRecords.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  fetchInventoryRequests();
                  setStorageModalTab('requests');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: storageModalTab === 'requests' ? 700 : 500,
                  color: storageModalTab === 'requests' ? 'var(--color-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderBottom: storageModalTab === 'requests' ? '2.5px solid var(--color-primary)' : 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>Requests</span>
                {pendingStorageRequests.length > 0 && (
                  <span style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#2563eb',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '99px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                  }}>
                    {pendingStorageRequests.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  fetchDisposalHistory();
                  setStorageModalTab('history');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: storageModalTab === 'history' ? 700 : 500,
                  color: storageModalTab === 'history' ? 'var(--color-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderBottom: storageModalTab === 'history' ? '2.5px solid var(--color-primary)' : 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>History ({storageLogs.length})</span>
              </button>
            </div>

            {/* TAB 1: Confirmation of Storage (Staging for request) */}
            {storageModalTab === 'confirmation' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: '420px' }}>
                {stagedStorageRecords.length === 0 ? (
                  <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '8px', margin: 'auto 0' }}>
                    No record series currently staged for storage. Click <strong>"Move to Storage"</strong> on any record series in the table to add it here.
                  </div>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      Select the records you want to submit for storage confirmation, provide the reason, and attach authorization proof.
                    </p>
                    <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', maxHeight: '250px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                            <th style={{ padding: '0.65rem 0.85rem', width: '40px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={stagedSelectedIds.length === stagedStorageRecords.length && stagedStorageRecords.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setStagedSelectedIds(stagedStorageRecords.map((r) => r.id));
                                  } else {
                                    setStagedSelectedIds([]);
                                  }
                                }}
                              />
                            </th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Date & Time</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Record Series</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Division</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Category</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Storage Year</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stagedStorageRecords.map((r) => {
                            return (
                              <tr key={`staged-${r.id}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={stagedSelectedIds.includes(r.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setStagedSelectedIds((prev) => [...prev, r.id]);
                                      } else {
                                        setStagedSelectedIds((prev) => prev.filter((id) => id !== r.id));
                                      }
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  {new Date(r.createdAt || Date.now()).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{cleanSeriesTitle(r.seriesTitle)}</div>
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {r.division || 'General'}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary)' }}>
                                  {r.classificationCategory || '-'}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 700, color: '#d97706' }}>
                                  {r.inclusiveDates}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setStagedStorageRecords((prev) => prev.filter((item) => item.id !== r.id));
                                      setStagedSelectedIds((prev) => prev.filter((id) => id !== r.id));
                                    }}
                                    style={{ color: '#dc2626' }}
                                  >
                                    Remove
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {stagedSelectedIds.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '0.75rem', transition: 'all 0.2s ease-in-out' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                            Reason for Storage Confirmation *
                          </label>
                          <textarea
                            style={{
                              width: '100%',
                              minHeight: '80px',
                              padding: '0.65rem 0.75rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-primary)',
                              fontSize: '0.875rem',
                              fontFamily: 'inherit',
                            }}
                            placeholder="Explain why these record entries are being transferred to storage..."
                            value={storageReason}
                            onChange={(e) => setStorageReason(e.target.value)}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                            Attach Proof Document / Authorization File (Optional)
                          </label>
                          <input
                            type="file"
                            onChange={(e) => setStorageFile(e.target.files?.[0] || null)}
                            style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}
                          />
                          {storageFile && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: '0.25rem', fontWeight: 600 }}>
                              Selected file: {storageFile.name} ({(storageFile.size / 1024).toFixed(1)} KB)
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.35rem' }}>
                          <Button
                            variant="primary"
                            disabled={isSendingStorageRequest}
                            loading={isSendingStorageRequest}
                            onClick={handleSendStorageConfirmation}
                          >
                            Send Request for Confirmation ({stagedSelectedIds.length})
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB 2: Requests Status Queue */}
            {storageModalTab === 'requests' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Submitted storage requests awaiting Admin confirmation or historical decision review.
                </p>

                {inventoryRequests.filter((r) => r.requestType === 'Storage').length === 0 ? (
                  <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    No storage requests found.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto' }}>
                    {inventoryRequests.filter((r) => r.requestType === 'Storage').map((req) => (
                      <div
                        key={`req-tab-${req.id}`}
                        onClick={() => setSelectedRequestDetails(req)}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          padding: '1rem',
                          background: 'var(--bg-secondary)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span
                              style={{
                                padding: '0.2rem 0.65rem',
                                borderRadius: '99px',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                background: req.status === 'approved' ? 'rgba(16, 185, 129, 0.15)' : req.status === 'rejected' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: req.status === 'approved' ? '#059669' : req.status === 'rejected' ? '#dc2626' : '#d97706',
                                border: req.status === 'approved' ? '1px solid rgba(16, 185, 129, 0.3)' : req.status === 'rejected' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                              }}
                            >
                              {req.status === 'approved' ? '✓ Approved' : req.status === 'rejected' ? '✕ Rejected' : '⏳ Pending Confirmation'}
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              Requested by {req.requesterName}
                            </span>
                          </div>

                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {new Date(req.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <div style={{ background: 'var(--bg-primary)', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                            Target Records ({req.recordsSummary?.length || 0})
                          </div>
                          <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {(req.recordsSummary || []).map((s: any) => s.seriesTitle).join(', ')}
                          </div>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          <strong>Reason provided:</strong> {req.reason}
                        </div>

                        {req.attachmentUrl && (
                          <div style={{ fontSize: '0.825rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                            📎 Attached Proof: <a href={req.attachmentUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'var(--color-primary)' }}>{req.attachmentName || 'View Attached Document'}</a>
                          </div>
                        )}

                        {/* Admin Decision actions if pending & user is Admin/Dev */}
                        {req.status === 'pending' && hasFullDivisionAccess && (
                          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                            <input
                              type="text"
                              placeholder="Admin decision remarks / reason..."
                              value={adminDecisionReason}
                              onChange={(e) => setAdminDecisionReason(e.target.value)}
                              style={{
                                padding: '0.45rem 0.75rem',
                                fontSize: '0.825rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={isProcessingAdminDecision}
                                onClick={() => handleAdminRejectRequest(req.id)}
                              >
                                Reject Request
                              </Button>
                              <Button
                                variant="success"
                                size="sm"
                                disabled={isProcessingAdminDecision}
                                onClick={() => handleAdminConfirmRequest(req.id)}
                              >
                                Confirm & Update Tab
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: History of Storage */}
            {storageModalTab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    History of all record series transitioned from Active Desk to Storage.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      value={storageDivisionFilter}
                      onChange={(e) => setStorageDivisionFilter(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}
                    >
                      <option value="ALL">All Divisions</option>
                      {Array.from(new Set(storageLogs.map(l => l.division || 'General'))).sort().map(d => <option key={`s-div-${d}`} value={d}>{d}</option>)}
                    </select>
                    <select
                      value={storageCategoryFilter}
                      onChange={(e) => setStorageCategoryFilter(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}
                    >
                      <option value="ALL">All Categories</option>
                      {Array.from(new Set(storageLogs.map(l => l.classificationCategory).filter(Boolean))).sort().map(c => <option key={`s-cat-${String(c)}`} value={String(c)}>{c}</option>)}
                    </select>
                    <div style={{ width: '220px' }}>
                      <SearchBar
                        value={storageSearchQuery}
                        onChange={(e) => setStorageSearchQuery(e.target.value)}
                        placeholder="Search logs..."
                      />
                    </div>
                  </div>
                </div>

                {(() => {
                  const filtered = storageLogs.filter((log) => {
                    if (storageDivisionFilter !== 'ALL' && (log.division || 'General') !== storageDivisionFilter) return false;
                    if (storageCategoryFilter !== 'ALL' && log.classificationCategory !== storageCategoryFilter) return false;
                    const q = storageSearchQuery.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      (log.seriesTitle && log.seriesTitle.toLowerCase().includes(q)) ||
                      (log.division && log.division.toLowerCase().includes(q)) ||
                      (log.classificationCategory && log.classificationCategory.toLowerCase().includes(q)) ||
                      (log.subCategory && log.subCategory.toLowerCase().includes(q)) ||
                      (log.disposedYears && log.disposedYears.toLowerCase().includes(q))
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                        No storage transition history logs found.
                      </div>
                    );
                  }

                  return (
                    <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', maxHeight: '380px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Date & Time</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Record Series</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Division</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Category</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Transition Status</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Stage Shift</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((log) => (
                            <tr key={`storage-log-${log.id}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 600 }}>
                                {new Date(log.disposedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem' }}>
                                <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{log.seriesTitle}</div>
                                {log.attachmentUrl && (
                                  <div style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>
                                    <a href={log.attachmentUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
                                      📎 {log.attachmentName || 'Proof Document'}
                                    </a>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                {log.division || 'General'}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary)' }}>
                                {log.classificationCategory || '-'}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(245, 158, 11, 0.12)', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.8rem' }}>
                                  <MdArchive style={{ fontSize: '0.9rem' }} /> Moved to Storage
                                </span>
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap', color: '#d97706', fontWeight: 700 }}>
                                Active Desk ➔ Storage
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setShowStorageManagementModal(false)}>
                Close Window
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 3-Tab Disposal Management Modal (Confirmation of Disposal, Requests, History) */}
      {showDisposalManagementModal && (
        <Modal
          isOpen={showDisposalManagementModal}
          onClose={() => setShowDisposalManagementModal(false)}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <MdDeleteSweep style={{ color: '#dc2626', fontSize: '1.4rem' }} />
              <span>Disposal Management</span>
            </div>
          }
          size="xl"
        >
          <div style={{ padding: '0.25rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: '480px' }}>
            {/* Navigation Tabs Bar */}
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              borderBottom: '2px solid var(--border-color)',
              paddingBottom: '0.25rem',
            }}>
              <button
                type="button"
                onClick={() => setDisposalModalTab('confirmation')}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: disposalModalTab === 'confirmation' ? 700 : 500,
                  color: disposalModalTab === 'confirmation' ? 'var(--color-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderBottom: disposalModalTab === 'confirmation' ? '2.5px solid var(--color-primary)' : 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>Confirmation of Disposal</span>
                {stagedDisposalRecords.length > 0 && (
                  <span style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#dc2626',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '99px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                  }}>
                    {stagedDisposalRecords.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  fetchInventoryRequests();
                  setDisposalModalTab('requests');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: disposalModalTab === 'requests' ? 700 : 500,
                  color: disposalModalTab === 'requests' ? 'var(--color-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderBottom: disposalModalTab === 'requests' ? '2.5px solid var(--color-primary)' : 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>Requests</span>
                {pendingDisposalRequests.length > 0 && (
                  <span style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#dc2626',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '99px',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                  }}>
                    {pendingDisposalRequests.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  fetchDisposalHistory();
                  setDisposalModalTab('history');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: disposalModalTab === 'history' ? 700 : 500,
                  color: disposalModalTab === 'history' ? 'var(--color-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  borderBottom: disposalModalTab === 'history' ? '2.5px solid var(--color-primary)' : 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>History ({disposalOnlyLogs.length})</span>
              </button>
            </div>

            {/* TAB 1: Confirmation of Disposal */}
            {disposalModalTab === 'confirmation' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: '420px' }}>
                {stagedDisposalRecords.length === 0 ? (
                  <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '8px', margin: 'auto 0' }}>
                    No record series currently staged for disposal evaluation. Click <strong>"Evaluate & Dispose"</strong> on any eligible record to add it here.
                  </div>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      Select the records you want to submit for disposal confirmation, provide the reason, and attach authorization proof.
                    </p>
                    <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', maxHeight: '250px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                            <th style={{ padding: '0.65rem 0.85rem', width: '40px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={stagedDisposalSelectedIds.length === stagedDisposalRecords.length && stagedDisposalRecords.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setStagedDisposalSelectedIds(stagedDisposalRecords.map((r) => r.id));
                                  } else {
                                    setStagedDisposalSelectedIds([]);
                                  }
                                }}
                              />
                            </th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Date & Time</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Record Series</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Division</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Category</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Disposed Year</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stagedDisposalRecords.map((r) => {
                            return (
                              <tr key={`staged-disp-${r.id}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={stagedDisposalSelectedIds.includes(r.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setStagedDisposalSelectedIds((prev) => [...prev, r.id]);
                                      } else {
                                        setStagedDisposalSelectedIds((prev) => prev.filter((id) => id !== r.id));
                                      }
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  {new Date(r.createdAt || Date.now()).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{cleanSeriesTitle(r.seriesTitle)}</div>
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {r.division || 'General'}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary)' }}>
                                  {r.classificationCategory || '-'}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>
                                  {r.inclusiveDates}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setStagedDisposalRecords((prev) => prev.filter((item) => item.id !== r.id));
                                      setStagedDisposalSelectedIds((prev) => prev.filter((id) => id !== r.id));
                                    }}
                                    style={{ color: '#dc2626' }}
                                  >
                                    Remove
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {stagedDisposalSelectedIds.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginTop: '0.75rem', transition: 'all 0.2s ease-in-out' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                            Reason for Disposal Confirmation *
                          </label>
                          <textarea
                            style={{
                              width: '100%',
                              minHeight: '80px',
                              padding: '0.65rem 0.75rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-primary)',
                              fontSize: '0.875rem',
                              fontFamily: 'inherit',
                            }}
                            placeholder="Explain why these record entries are recommended for disposal..."
                            value={disposalReason}
                            onChange={(e) => setDisposalReason(e.target.value)}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                            Attach Proof Document / Authorization File (Optional)
                          </label>
                          <input
                            type="file"
                            onChange={(e) => setDisposalFile(e.target.files?.[0] || null)}
                            style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}
                          />
                          {disposalFile && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: '0.25rem', fontWeight: 600 }}>
                              Selected file: {disposalFile.name} ({(disposalFile.size / 1024).toFixed(1)} KB)
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.35rem' }}>
                          <Button
                            variant="danger"
                            disabled={isSendingDisposalRequest}
                            loading={isSendingDisposalRequest}
                            onClick={handleSendDisposalConfirmation}
                          >
                            Send Request for Confirmation ({stagedDisposalSelectedIds.length})
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB 2: Requests Status Queue */}
            {disposalModalTab === 'requests' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: '420px' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Submitted disposal requests awaiting Admin confirmation or decision review.
                </p>

                {inventoryRequests.filter(r => r.requestType === 'Disposal').length === 0 ? (
                  <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    No disposal requests found.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto' }}>
                    {inventoryRequests.filter(r => r.requestType === 'Disposal').map((req) => (
                      <div
                        key={`req-disp-tab-${req.id}`}
                        onClick={() => setSelectedRequestDetails(req)}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          padding: '1rem',
                          background: 'var(--bg-secondary)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span
                              style={{
                                padding: '0.2rem 0.65rem',
                                borderRadius: '99px',
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                background: req.status === 'approved' ? 'rgba(16, 185, 129, 0.15)' : req.status === 'rejected' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: req.status === 'approved' ? '#059669' : req.status === 'rejected' ? '#dc2626' : '#b91c1c',
                                border: req.status === 'approved' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                              }}
                            >
                              {req.status === 'approved' ? '✓ Approved' : req.status === 'rejected' ? '✕ Rejected' : '⏳ Pending Confirmation'}
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              Requested by {req.requesterName}
                            </span>
                          </div>

                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {new Date(req.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <div style={{ background: 'var(--bg-primary)', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                            Target Records ({req.recordsSummary?.length || 0})
                          </div>
                          <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {(req.recordsSummary || []).map((s: any) => s.seriesTitle).join(', ')}
                          </div>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          <strong>Reason provided:</strong> {req.reason}
                        </div>

                        {req.attachmentUrl && (
                          <div style={{ fontSize: '0.825rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                            📎 Attached Proof: <a href={req.attachmentUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'var(--color-primary)' }}>{req.attachmentName || 'View Attached Document'}</a>
                          </div>
                        )}

                        {/* Admin Decision actions if pending & user is Admin/Dev */}
                        {req.status === 'pending' && hasFullDivisionAccess && (
                          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem', background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                            <input
                              type="text"
                              placeholder="Admin decision remarks / reason..."
                              value={adminDecisionReason}
                              onChange={(e) => setAdminDecisionReason(e.target.value)}
                              style={{
                                padding: '0.45rem 0.75rem',
                                fontSize: '0.825rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={isProcessingAdminDecision}
                                onClick={() => handleAdminRejectRequest(req.id)}
                              >
                                Reject Request
                              </Button>
                              <Button
                                variant="success"
                                size="sm"
                                disabled={isProcessingAdminDecision}
                                onClick={() => handleAdminConfirmRequest(req.id)}
                              >
                                Confirm & Update Tab
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: History of Disposal */}
            {disposalModalTab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: '420px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    History of all record series disposal evaluations and disposed year periods.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      value={historyDivisionFilter}
                      onChange={(e) => setHistoryDivisionFilter(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}
                    >
                      <option value="ALL">All Divisions</option>
                      {Array.from(new Set(disposalOnlyLogs.map(l => l.division || 'General'))).sort().map(d => <option key={`d-div-${d}`} value={d}>{d}</option>)}
                    </select>
                    <select
                      value={historyCategoryFilter}
                      onChange={(e) => setHistoryCategoryFilter(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}
                    >
                      <option value="ALL">All Categories</option>
                      {Array.from(new Set(disposalOnlyLogs.map(l => l.classificationCategory).filter(Boolean))).sort().map(c => <option key={`d-cat-${String(c)}`} value={String(c)}>{c}</option>)}
                    </select>
                    <div style={{ width: '220px' }}>
                      <SearchBar
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                        placeholder="Search logs..."
                      />
                    </div>
                  </div>
                </div>

                {(() => {
                  const expandedLogs: any[] = [];
                  disposalOnlyLogs.forEach((log) => {
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
                    if (historyDivisionFilter !== 'ALL' && (log.division || 'General') !== historyDivisionFilter) return false;
                    if (historyCategoryFilter !== 'ALL' && log.classificationCategory !== historyCategoryFilter) return false;
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
                    <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', maxHeight: '380px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Date & Time</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Record Series</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Division</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Category</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Disposed Year</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLogs.map((log) => (
                            <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 600 }}>
                                {new Date(log.disposedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem' }}>
                                <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{cleanSeriesTitle(log.seriesTitle)}</div>
                                {log.attachmentUrl && (
                                  <div style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>
                                    <a href={log.attachmentUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
                                      📎 {log.attachmentName || 'Proof Document'}
                                    </a>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                {log.division || 'General'}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary)' }}>
                                {log.classificationCategory || '-'}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.8rem' }}>
                                  <MdDeleteOutline style={{ fontSize: '0.95rem' }} /> {log.disposedYears}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setShowDisposalManagementModal(false)}>
                Close Window
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Annual Retention Auto-Notification Pop-Up Modal */}
      {showAnnualNoticeModal && (
        <Modal
          isOpen={showAnnualNoticeModal}
          onClose={() => {
            const currentYear = new Date().getFullYear();
            sessionStorage.setItem(`annual_retention_notice_${currentYear}`, 'true');
            setShowAnnualNoticeModal(false);
          }}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span>Annual System Retention Audit ({new Date().getFullYear()})</span>
              <span style={{
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                padding: '0.2rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.725rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#dc2626',
                  boxShadow: '0 0 0 3px rgba(220, 38, 38, 0.25)'
                }} />
                Action Required
              </span>
            </div>
          }
          size="lg"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '1rem' }}>ℹ️</span> Retention notices persist until evaluated or reviewed in Inventory.
              </div>

              <Button
                variant="secondary"
                style={{ fontWeight: 600, padding: '0.5rem 1.25rem' }}
                onClick={() => {
                  const currentYear = new Date().getFullYear();
                  sessionStorage.setItem(`annual_retention_notice_${currentYear}`, 'true');
                  setShowAnnualNoticeModal(false);
                }}
              >
                Dismiss Notice
              </Button>
            </div>
          }
        >
          <div style={{ padding: '0.25rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Urgent Warning Header Callout */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '1rem',
              background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.6) 0%, rgba(254, 226, 226, 0.6) 100%)',
              padding: '1.1rem 1.25rem',
              borderRadius: '12px',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              boxShadow: '0 2px 8px rgba(217, 119, 6, 0.08)'
            }}>
              <div style={{
                background: '#f59e0b',
                color: '#ffffff',
                padding: '0.65rem',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.3)'
              }}>
                <MdWarning style={{ fontSize: '1.65rem' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#92400e', letterSpacing: '-0.01em' }}>
                  Retention Schedule & Compliance Notice ({new Date().getFullYear()})
                </div>
                <div style={{ fontSize: '0.875rem', color: '#78350f', lineHeight: 1.55 }}>
                  Under <strong>NAP Form 1 / GRDS</strong> guidelines, several record series entries have completed their required active desk period or total retention lifecycle. <strong>Immediate action is required</strong> to transition or dispose of these records to maintain compliance and keep storage records up-to-date.
                </div>
              </div>
            </div>

            {/* Action Sections Container */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Card 1: Storage Transition */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.05) 0%, rgba(245, 158, 11, 0.02) 100%)',
                padding: '1.25rem',
                borderRadius: '12px',
                border: activeDeskEligibleRecords.length > 0 ? '1.5px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-color)',
                position: 'relative',
                boxShadow: activeDeskEligibleRecords.length > 0 ? '0 4px 12px rgba(245, 158, 11, 0.08)' : 'none'
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#b45309',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 800
                    }}>
                      <MdArchive style={{ fontSize: '1.1rem', color: '#d97706' }} />
                      1. Transfer to Storage
                    </div>
                    <span style={{
                      background: activeDeskEligibleRecords.length > 0 ? '#d97706' : '#9ca3af',
                      color: '#ffffff',
                      padding: '0.2rem 0.65rem',
                      borderRadius: '9999px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      boxShadow: activeDeskEligibleRecords.length > 0 ? '0 2px 4px rgba(217, 119, 6, 0.3)' : 'none'
                    }}>
                      {activeDeskEligibleRecords.length} Due
                    </span>
                  </div>

                  <div style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                    Pending Storage Transition
                  </div>
                  <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                    Active desk retention period is complete. These records must be moved from active office desks into secondary storage files.
                  </div>
                </div>

                {activeDeskEligibleRecords.length > 0 ? (
                  <Button
                    variant="primary"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                      borderColor: '#b45309',
                      fontWeight: 700,
                      padding: '0.65rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 3px 8px rgba(217, 119, 6, 0.25)'
                    }}
                    onClick={() => {
                      const currentYear = new Date().getFullYear();
                      sessionStorage.setItem(`annual_retention_notice_${currentYear}`, 'true');
                      setShowAnnualNoticeModal(false);
                      setShowActiveDeskModal(true);
                    }}
                  >
                    Evaluate Storage ({activeDeskEligibleRecords.length}) &rarr;
                  </Button>
                ) : (
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#10b981',
                    fontWeight: 700,
                    padding: '0.5rem',
                    textAlign: 'center',
                    background: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '8px'
                  }}>
                    ✓ All Active Desk Storage Up to Date
                  </div>
                )}
              </div>

              {/* Card 2: Disposal Evaluation */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.05) 0%, rgba(239, 68, 68, 0.02) 100%)',
                padding: '1.25rem',
                borderRadius: '12px',
                border: disposalEligibleRecords.length > 0 ? '1.5px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-color)',
                position: 'relative',
                boxShadow: disposalEligibleRecords.length > 0 ? '0 4px 12px rgba(239, 68, 68, 0.08)' : 'none'
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#b91c1c',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 800
                    }}>
                      <MdDeleteSweep style={{ fontSize: '1.1rem', color: '#dc2626' }} />
                      2. Formal Disposal
                    </div>
                    <span style={{
                      background: disposalEligibleRecords.length > 0 ? '#dc2626' : '#9ca3af',
                      color: '#ffffff',
                      padding: '0.2rem 0.65rem',
                      borderRadius: '9999px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      boxShadow: disposalEligibleRecords.length > 0 ? '0 2px 4px rgba(220, 38, 38, 0.3)' : 'none'
                    }}>
                      {disposalEligibleRecords.length} Eligible
                    </span>
                  </div>

                  <div style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                    Eligible for Disposal Evaluation
                  </div>
                  <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                    Total retention schedule has expired. Records are now eligible for formal appraisal, disposal authorization, or permanent archiving.
                  </div>
                </div>

                {disposalEligibleRecords.length > 0 ? (
                  <Button
                    variant="danger"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                      borderColor: '#991b1b',
                      fontWeight: 700,
                      padding: '0.65rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 3px 8px rgba(220, 38, 38, 0.25)'
                    }}
                    onClick={() => {
                      const currentYear = new Date().getFullYear();
                      sessionStorage.setItem(`annual_retention_notice_${currentYear}`, 'true');
                      setShowAnnualNoticeModal(false);
                      setShowEvaluateModal(true);
                    }}
                  >
                    Evaluate Disposal ({disposalEligibleRecords.length}) &rarr;
                  </Button>
                ) : (
                  <div style={{
                    fontSize: '0.8rem',
                    color: '#10b981',
                    fontWeight: 700,
                    padding: '0.5rem',
                    textAlign: 'center',
                    background: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: '8px'
                  }}>
                    ✓ All Disposal Schedules Up to Date
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Active Desk Retention Expiry Evaluation Modal */}
      {showActiveDeskModal && (
        <Modal
          isOpen={showActiveDeskModal}
          onClose={() => setShowActiveDeskModal(false)}
          title={`Evaluate Storage Records (${activeDeskEligibleRecords.length})`}
          size="xl"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '1rem', borderRadius: '8px', fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              <strong>Active Period Reached:</strong> The following record series have completed their designated active desk period. Transitioning a record to <strong>Storage</strong> sets its stage to Storage and starts the storage retention countdown toward disposal eligibility.
            </div>

            {activeDeskEligibleRecords.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                No records currently eligible for storage evaluation.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '400px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>Item No.</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>Record Series</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>Division</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>Category</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, textAlign: 'center' }}>Active Limit</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, textAlign: 'center' }}>Elapsed Yrs</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, textAlign: 'right' }}>Actions / Transition Choice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDeskEligibleRecords.map((record) => {
                      const info = getOngoingActiveDeskInfo(record.inclusiveDates, Number(record.activeDeskYrs), record.retentionStage);
                      return (
                        <tr key={record.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                            {record.prdsGrds && record.itemNo ? (
                              <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)' }}>{record.prdsGrds}</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)' }}>{record.itemNo}</div>
                              </div>
                            ) : (
                              record.prdsGrds || record.itemNo || '-'
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{cleanSeriesTitle(record.seriesTitle)}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatDynamicDates(record.inclusiveDates)}</div>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>{record.division || 'General'}</td>
                          <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary)' }}>{record.classificationCategory || '-'}</td>
                          <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 600 }}>{record.activeDeskYrs} yrs</td>
                          <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                            <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', padding: '0.2rem 0.55rem', borderRadius: '4px', fontWeight: 700 }}>
                              {info?.elapsedYears || record.activeDeskYrs} yrs
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              <Button
                                variant="primary"
                                style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem', background: '#d97706', borderColor: '#d97706' }}
                                onClick={() => handleMoveToStorage(record)}
                              >
                                Move to Storage ➔
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setShowActiveDeskModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Single Record Move to Storage Confirmation Modal */}
      {singleStorageRecord && (
        <Modal
          isOpen={!!singleStorageRecord}
          onClose={() => setSingleStorageRecord(null)}
          title="Move to Storage"
          size="md"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '1rem', borderRadius: '8px', fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              <strong>Confirm Storage Transition:</strong> You are about to move this record series from <strong>Active</strong> to <strong>Storage</strong> stage. This will start the storage retention countdown toward disposal eligibility.
            </div>

            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.7rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', width: '40%', background: 'var(--bg-secondary)' }}>Item No.</td>
                    <td style={{ padding: '0.7rem 1rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                      {singleStorageRecord.prdsGrds && singleStorageRecord.itemNo
                        ? `${singleStorageRecord.prdsGrds} — ${singleStorageRecord.itemNo}`
                        : singleStorageRecord.prdsGrds || singleStorageRecord.itemNo || '-'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.7rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>Record Series</td>
                    <td style={{ padding: '0.7rem 1rem', fontWeight: 600 }}>{cleanSeriesTitle(singleStorageRecord.seriesTitle)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.7rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>Division</td>
                    <td style={{ padding: '0.7rem 1rem' }}>{singleStorageRecord.division || 'General'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.7rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>Category</td>
                    <td style={{ padding: '0.7rem 1rem' }}>{singleStorageRecord.classificationCategory || '-'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.7rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>Inclusive Dates</td>
                    <td style={{ padding: '0.7rem 1rem' }}>{formatDynamicDates(singleStorageRecord.inclusiveDates)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.7rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>Active Desk Period</td>
                    <td style={{ padding: '0.7rem 1rem' }}>
                      <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', padding: '0.2rem 0.55rem', borderRadius: '4px', fontWeight: 700 }}>
                        {singleStorageRecord.activeDeskYrs} year(s) reached
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.7rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>New Stage</td>
                    <td style={{ padding: '0.7rem 1rem' }}>
                      <span style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', padding: '0.2rem 0.55rem', borderRadius: '4px', fontWeight: 700 }}>
                        Active → Storage
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
              <Button variant="secondary" onClick={() => setSingleStorageRecord(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                style={{ background: '#d97706', borderColor: '#d97706' }}
                onClick={() => {
                  handleMoveToStorage(singleStorageRecord);
                  setSingleStorageRecord(null);
                }}
              >
                <MdArchive style={{ marginRight: '0.3rem' }} /> Confirm Move to Storage
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* NAP Form 1 View Modal */}
      {showNapFormPreview && (
        <Modal
          isOpen={showNapFormPreview}
          onClose={() => setShowNapFormPreview(false)}
          title={`NAP FORM 1 — Inventory and Appraisal of Records ${divisionTab !== 'ALL' ? `(${divisionTab})` : ''}`}
          size="xl"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Showing <strong>{activeDivisionRecords.length}</strong> record series entries {divisionTab === 'ALL' ? '(All Divisions)' : `for ${divisionTab}`}.
              </p>

              {/* View Format Selector */}
              <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setPreviewViewMode('excel')}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: previewViewMode === 'excel' ? '#107c41' : 'transparent',
                    color: previewViewMode === 'excel' ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  📊 Excel Sheet View
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewMode('form')}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: previewViewMode === 'form' ? 'var(--color-primary)' : 'transparent',
                    color: previewViewMode === 'form' ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  📄 Printable Form View
                </button>
              </div>
            </div>

            {/* Real-Time Form Inputs Panel */}
            <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem 1.15rem', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>✏️ Real-Time Form Details & Signatures Editor</span>
                <span style={{ fontSize: '0.775rem', fontWeight: 500, color: 'var(--text-secondary)' }}>(Updates Preview, Print & Excel Export)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>7. Person-In-Charge of Files</label>
                  <input
                    type="text"
                    placeholder="e.g. Juan Dela Cruz"
                    value={napFormHeader.personInCharge}
                    onChange={(e) => setNapFormHeader(prev => ({ ...prev, personInCharge: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 700, borderRadius: '6px', border: '1.5px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>4. Telephone No.</label>
                  <input
                    type="text"
                    placeholder="e.g. (075) 522-1234"
                    value={napFormHeader.telephoneNo}
                    onChange={(e) => setNapFormHeader(prev => ({ ...prev, telephoneNo: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 700, borderRadius: '6px', border: '1.5px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>5. Email Address</label>
                  <input
                    type="text"
                    placeholder="e.g. hrmdo@pangasinan.gov.ph"
                    value={napFormHeader.emailAddress}
                    onChange={(e) => setNapFormHeader(prev => ({ ...prev, emailAddress: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 700, borderRadius: '6px', border: '1.5px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Prepared By (Name & Position)</label>
                  <input
                    type="text"
                    placeholder="e.g. Maria Santos / Admin Aide"
                    value={napFormHeader.preparedBy}
                    onChange={(e) => setNapFormHeader(prev => ({ ...prev, preparedBy: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 700, borderRadius: '6px', border: '1.5px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Assisted By</label>
                  <input
                    type="text"
                    placeholder="e.g. Pedro Reyes / Analyst"
                    value={napFormHeader.assistedBy}
                    onChange={(e) => setNapFormHeader(prev => ({ ...prev, assistedBy: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 700, borderRadius: '6px', border: '1.5px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.775rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Approved By</label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Ana Lim / Department Head"
                    value={napFormHeader.approvedBy}
                    onChange={(e) => setNapFormHeader(prev => ({ ...prev, approvedBy: e.target.value }))}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', fontWeight: 700, borderRadius: '6px', border: '1.5px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            </div>

            <div
              dangerouslySetInnerHTML={{
                __html: previewViewMode === 'excel'
                  ? buildNapForm1ExcelHtml(activeDivisionRecords, divisionTab === 'ALL' ? undefined : divisionTab, napFormHeader)
                  : buildNapForm1Html(activeDivisionRecords, divisionTab === 'ALL' ? undefined : divisionTab, napFormHeader)
              }}
              style={{ overflowX: 'auto', border: previewViewMode === 'excel' ? 'none' : '1.5px solid #000', borderRadius: '4px' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setShowNapFormPreview(false)}>
                Close
              </Button>

              <Button variant="primary" onClick={() => handlePrintNapForm1(activeDivisionRecords, divisionTab === 'ALL' ? undefined : divisionTab)}>
                <MdPrint style={{ marginRight: '0.35rem' }} /> Print NAP Form 1
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
            {/* Active Desk Retention Alert inside viewing modal */}
            {getOngoingActiveDeskInfo(viewingRecord.inclusiveDates, Number(viewingRecord.activeDeskYrs), viewingRecord.retentionStage) !== null && (
              <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', padding: '0.85rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                  ⚠️ Active desk period ({viewingRecord.activeDeskYrs} yrs) has been reached!
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button variant="primary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', background: '#d97706', borderColor: '#d97706' }} onClick={() => { const rec = viewingRecord; setViewingRecord(null); handleMoveToStorage(rec); }}>
                    Move to Storage ➔
                  </Button>
                </div>
              </div>
            )}

            {/* Top Info Header Summary */}
            <div style={{ padding: '0.25rem 0 0.75rem 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {viewingRecord.classificationCategory} {viewingRecord.subCategory ? `• ${viewingRecord.subCategory}` : ''}
                </div>
                <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {viewingRecord.seriesTitle}
                </h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Division: <strong style={{ color: 'var(--text-primary)' }}>{viewingRecord.division || 'General'}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{
                  padding: '0.25rem 0.65rem',
                  borderRadius: '99px',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  background: viewingRecord.retentionStage === 'Storage' ? 'rgba(245, 158, 11, 0.15)' : viewingRecord.retentionStage === 'Disposed' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  color: viewingRecord.retentionStage === 'Storage' ? '#d97706' : viewingRecord.retentionStage === 'Disposed' ? '#dc2626' : '#2563eb',
                  border: viewingRecord.retentionStage === 'Storage' ? '1px solid rgba(245, 158, 11, 0.3)' : viewingRecord.retentionStage === 'Disposed' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)'
                }}>
                  {viewingRecord.retentionStage || 'Active Stage'}
                </span>

                <span style={{
                  padding: '0.25rem 0.65rem',
                  borderRadius: '99px',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  background: viewingRecord.disposalStatus === 'Safe for Disposal' ? 'rgba(239, 68, 68, 0.15)' : viewingRecord.disposalStatus === 'Permanent' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(14, 165, 233, 0.15)',
                  color: viewingRecord.disposalStatus === 'Safe for Disposal' ? '#dc2626' : viewingRecord.disposalStatus === 'Permanent' ? '#4f46e5' : '#0284c7',
                  border: viewingRecord.disposalStatus === 'Safe for Disposal' ? '1px solid rgba(239, 68, 68, 0.3)' : viewingRecord.disposalStatus === 'Permanent' ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(14, 165, 233, 0.3)'
                }}>
                  {viewingRecord.disposalStatus}
                </span>
              </div>
            </div>

            {/* Clean Key-Value Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem 1.75rem', padding: '0.4rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>PRDS / GRDS</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary)' }}>{viewingRecord.prdsGrds || 'N/A'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Item No.</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-primary)' }}>{viewingRecord.itemNo || 'N/A'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Period Covered</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{formatDynamicDates(viewingRecord.inclusiveDates)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Volume</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{viewingRecord.volume}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Records Medium</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{viewingRecord.medium}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Restrictions</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{viewingRecord.restrictions || 'None'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Location of Records</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{viewingRecord.locationOfRecords}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Frequency of Use</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{viewingRecord.frequencyOfUse}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Duplication</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{viewingRecord.duplication}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Appraisal Category</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{viewingRecord.appraisalCategory}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Utility Value</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>{(viewingRecord.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Retention Schedule</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {viewingRecord.appraisalCategory === 'Permanent' ? 'Permanent' : `${viewingRecord.activeDeskYrs}y Active | ${viewingRecord.storageYrs}y Storage (${viewingRecord.totalRetention}y Total)`}
                </span>
              </div>
            </div>

            {/* Description & Disposition Provisions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingTop: '0.2rem' }}>
              <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description & Scope Notes</div>
                <div style={{ marginTop: '0.2rem', color: 'var(--text-primary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
                  {viewingRecord.scopeDescription || 'No detailed scope description provided.'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Disposition Provision</div>
                <div style={{ marginTop: '0.2rem', color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.5 }}>
                  {viewingRecord.dispositionProvision}
                </div>
              </div>
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
      {/* User Storage & Disposal Request Submission Modal */}
      {showRequestModal && (
        <Modal
          isOpen={showRequestModal}
          onClose={() => setShowRequestModal(false)}
          title={`Submit Request for ${requestType}`}
          size="md"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Selected Record Series ({targetRequestRecords.length})
              </div>
              <div style={{ marginTop: '0.35rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '140px', overflowY: 'auto' }}>
                {targetRequestRecords.map((r) => (
                  <div key={`req-rec-${r.id}`} style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{r.seriesTitle}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.division || 'General'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                Reason for {requestType} *
              </label>
              <textarea
                style={{
                  width: '100%',
                  minHeight: '90px',
                  padding: '0.65rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                }}
                placeholder={`Explain why these records should be moved to ${requestType}...`}
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                Attach Proof Document / Authorization File (Optional)
              </label>
              <input
                type="file"
                onChange={(e) => setRequestFile(e.target.files?.[0] || null)}
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                }}
              />
              {requestFile && (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-primary)', marginTop: '0.25rem', fontWeight: 600 }}>
                  Selected file: {requestFile.name} ({(requestFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setShowRequestModal(false)} disabled={isSubmittingRequest}>
                Cancel
              </Button>
              <Button
                variant={requestType === 'Disposal' ? 'danger' : 'primary'}
                onClick={handleSubmitInventoryRequest}
                loading={isSubmittingRequest}
              >
                Submit {requestType} Request
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Admin Confirmation Box / Pending Requests Modal */}
      {hasFullDivisionAccess && showPendingRequestsModal && (
        <Modal
          isOpen={showPendingRequestsModal}
          onClose={() => setShowPendingRequestsModal(false)}
          title={`Inventory Storage & Disposal Confirmation Queue (${pendingRequests.length} Pending)`}
          size="lg"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Review pending storage and disposal requests submitted by users. Confirming a request will update the records' stage and log to history.
            </p>

            {pendingRequests.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                No pending requests awaiting confirmation.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto' }}>
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '1rem',
                      background: 'var(--bg-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            padding: '0.2rem 0.65rem',
                            borderRadius: '99px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            background: req.requestType === 'Storage' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: req.requestType === 'Storage' ? '#d97706' : '#dc2626',
                            border: req.requestType === 'Storage' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                          }}
                        >
                          {req.requestType === 'Storage' ? '📦 Storage Request' : '🗑️ Disposal Request'}
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Requested by {req.requesterName}
                        </span>
                      </div>

                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {new Date(req.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ background: 'var(--bg-primary)', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                        Target Records ({req.recordsSummary?.length || 0})
                      </div>
                      <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {(req.recordsSummary || []).map((s: any) => s.seriesTitle).join(', ')}
                      </div>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      <strong>Reason provided:</strong> {req.reason}
                    </div>

                    {req.attachmentUrl && (
                      <div style={{ fontSize: '0.825rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                        📎 Attached Proof: <a href={req.attachmentUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'var(--color-primary)' }}>{req.attachmentName || 'View Attached Document'}</a>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <input
                        type="text"
                        placeholder="Admin confirmation or rejection remarks (optional)..."
                        value={adminDecisionReason}
                        onChange={(e) => setAdminDecisionReason(e.target.value)}
                        style={{
                          padding: '0.45rem 0.75rem',
                          fontSize: '0.825rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={isProcessingAdminDecision}
                          onClick={() => handleAdminRejectRequest(req.id)}
                        >
                          Reject Request
                        </Button>
                        <Button
                          variant="success"
                          size="sm"
                          disabled={isProcessingAdminDecision}
                          onClick={() => handleAdminConfirmRequest(req.id)}
                        >
                          Confirm & Update Tab
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Request Details Modal */}
      {selectedRequestDetails && (
        <Modal
          isOpen={!!selectedRequestDetails}
          onClose={() => setSelectedRequestDetails(null)}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <MdInfoOutline style={{ color: 'var(--color-primary)', fontSize: '1.4rem' }} />
              <span>{selectedRequestDetails.requestType} Request Details</span>
            </div>
          }
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>Request Reference</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)' }}>{selectedRequestDetails.id}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                  Requested by <strong>{selectedRequestDetails.requesterName}</strong>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '99px',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    background: selectedRequestDetails.status === 'approved' ? 'rgba(16, 185, 129, 0.15)' : selectedRequestDetails.status === 'rejected' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: selectedRequestDetails.status === 'approved' ? '#059669' : selectedRequestDetails.status === 'rejected' ? '#dc2626' : '#d97706',
                    border: selectedRequestDetails.status === 'approved' ? '1px solid rgba(16, 185, 129, 0.3)' : selectedRequestDetails.status === 'rejected' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                  }}
                >
                  {selectedRequestDetails.status === 'approved' ? '✓ Approved' : selectedRequestDetails.status === 'rejected' ? '✕ Rejected' : '⏳ Pending Confirmation'}
                </span>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                  Submitted on {new Date(selectedRequestDetails.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                Target Record Series ({selectedRequestDetails.recordsSummary?.length || selectedRequestDetails.recordIds?.length || 0})
              </div>
              <div style={{ borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Date & Time</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Record Series</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Division</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Category</th>
                      <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>
                        {selectedRequestDetails.requestType === 'Storage' ? 'Storage Year' : 'Disposed Year'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRequestDetails.recordsSummary || []).length > 0 ? (
                      selectedRequestDetails.recordsSummary.map((item: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.65rem 0.85rem', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {new Date(selectedRequestDetails.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                            {cleanSeriesTitle(item.seriesTitle)}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>
                            {item.division || 'General'}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>
                            {item.classificationCategory || item.category || records.find((rec) => rec.id === item.id || (item.id && item.id.startsWith(`${rec.id}-`)))?.classificationCategory || '-'}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center', fontWeight: 700, color: selectedRequestDetails.requestType === 'Storage' ? '#d97706' : '#dc2626' }}>
                            {item.inclusiveDates || 'N/A'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      (selectedRequestDetails.recordIds || []).map((id: string, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.65rem 0.85rem', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {new Date(selectedRequestDetails.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>Record Entry {id}</td>
                          <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600 }}>General</td>
                          <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>-</td>
                          <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center', fontWeight: 700, color: selectedRequestDetails.requestType === 'Storage' ? '#d97706' : '#dc2626' }}>N/A</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Reason Provided</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{selectedRequestDetails.reason}</div>
            </div>

            {selectedRequestDetails.attachmentUrl && (
              <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>Attached Authorization / Proof</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.15rem' }}>{selectedRequestDetails.attachmentName || 'Proof Document'}</div>
                </div>
                <a
                  href={selectedRequestDetails.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '6px',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    textDecoration: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                  }}
                >
                  View File ↗
                </a>
              </div>
            )}

            {selectedRequestDetails.adminReason && (
              <div style={{ background: selectedRequestDetails.status === 'approved' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)', padding: '0.85rem 1rem', borderRadius: '8px', border: selectedRequestDetails.status === 'approved' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: selectedRequestDetails.status === 'approved' ? '#059669' : '#dc2626', textTransform: 'uppercase' }}>
                  Admin Remarks
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                  {selectedRequestDetails.adminReason}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default InventoryAppraisal;
