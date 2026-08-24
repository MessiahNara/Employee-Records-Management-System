import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SearchBar from '../components/ui/SearchBar';
import Table, { Column } from '../components/ui/Table';
import Modal from '../components/ui/Modal';
import CreateRecordSeriesModal, { RecordSeriesFormData } from '../components/CreateRecordSeriesModal';
import { useToast } from '../contexts/ToastContext';
import api, { getAbsoluteUrl } from '../services/api';
import { MdAdd, MdDelete, MdDeleteOutline, MdEdit, MdAssignment, MdCheckCircle, MdHourglassTop, MdArchive, MdWarning, MdHistory, MdInventory, MdDeleteSweep, MdPrint, MdFileDownload, MdInfoOutline } from 'react-icons/md';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { getAuthState, saveAuthState } from '../utils/mockAuth';
import './InventoryAppraisal.css';
import generateNapForm1Excel from '../utils/generateNapForm1Excel';
import generateAuthorityFormExcel from '../utils/generateAuthorityFormExcel';
import { generateDisposalWord } from '../utils/generateDisposalWord';

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
  stagedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NapRowItem {
  type: 'category' | 'subCategory' | 'record';
  title: string;
  record?: InventoryRecord;
  isUncategorized?: boolean;
}

export function formatDynamicDates(datesStr: string): string {
  if (!datesStr) return '-';
  const currYr = new Date().getFullYear();

  if (datesStr.trim().toLowerCase() === 'disposed') {
    return currYr === 2026 ? '2026' : `2026 - ${currYr}`;
  }

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

const exportStagedRecordsToCSV = (records: any[], type: 'Storage' | 'Disposal') => {
  const headers = ['Date & Time', 'Item No.', 'Record Series', 'Division', 'Category', 'Year'];
  const rows = records.map(r => [
    new Date(r.stagedAt || r.createdAt || Date.now()).toLocaleString(),
    (r.prdsGrds || '') + ' ' + (r.itemNo || ''),
    r.seriesTitle,
    r.division || 'General',
    r.classificationCategory || '-',
    r.inclusiveDates || 'N/A'
  ].map(field => `"${(field || '').toString().replace(/"/g, '""')}"`).join(','));

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${type}_Confirmation_Queue_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const handleExportAuthorityForm = async (records: any[], type: 'Storage' | 'Disposal', prepName: string, prepPos: string) => {
  try {
    const buffer = await generateAuthorityFormExcel(records, type, prepName, prepPos);
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Request_Authority_${type}_${new Date().toISOString().split('T')[0]}.xlsx`);
  } catch (err) {
    console.error('Error generating authority form excel:', err);
    alert('Failed to generate the Excel form.');
  }
};

const generatePreviewHtml = (records: any[], type: 'Storage' | 'Disposal', prepName: string, prepPos: string) => {
  const title = type === 'Storage' ? 'REQUEST FOR AUTHORITY TO STORAGE OF RECORD FORM' : 'REQUEST FOR AUTHORITY TO DISPOSE OF RECORD FORM';

  const processedRecords = records.map(r => {
    let docYear = (r.inclusiveDates || '').replace(/Present/gi, String(new Date().getFullYear())).trim();
    if (!docYear) docYear = new Date(r.createdAt || Date.now()).getFullYear().toString();

    const retentionYrs = Number(r.totalRetention) || 0;
    let retentionStr = '';
    if (retentionYrs > 0) {
      const matches = docYear.match(/\b\d{4}\b/g);
      if (matches && matches.length > 0) {
        const lastYear = parseInt(matches[matches.length - 1], 10);
        retentionStr = `${lastYear + retentionYrs} (${retentionYrs} yrs)`;
      } else {
        retentionStr = `${retentionYrs} yrs`;
      }
    } else {
      retentionStr = `${retentionYrs} yrs`;
    }

    return {
      ...r,
      docYear,
      retentionStr,
      groupKey: (r.subCategory || r.classificationCategory || '').trim(),
      cleanSeriesTitle: (r.seriesTitle || '').replace(/\s*\(\d{4}\)$/, '')
    };
  });

  const prdsGroups = new Map<string, any[]>();
  for (const r of processedRecords) {
    const prds = (r.prdsGrds || '').trim();
    if (!prdsGroups.has(prds)) prdsGroups.set(prds, []);
    prdsGroups.get(prds)!.push(r);
  }

  const sortedPrds = Array.from(prdsGroups.keys()).sort();

  let tbodyHtml = '';
  let rowCount = 0;

  for (const prds of sortedPrds) {
    const prdsRecords = prdsGroups.get(prds)!;

    if (prds) {
      tbodyHtml += `
        <tr>
          <td style="text-align: center;">${prds}</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      `;
      rowCount++;
    }

    prdsRecords.sort((a, b) => {
      const numA = parseInt(a.itemNo || '0', 10) || 0;
      const numB = parseInt(b.itemNo || '0', 10) || 0;
      if (numA !== numB) return numA - numB;

      const itemA = (a.itemNo || '').localeCompare(b.itemNo || '');
      if (itemA !== 0) return itemA;
      return a.groupKey.localeCompare(b.groupKey);
    });

    const itemGroups = new Map<string, any[]>();
    for (const r of prdsRecords) {
      const itemKey = `${r.itemNo || ''}::${r.groupKey}`;
      if (!itemGroups.has(itemKey)) itemGroups.set(itemKey, []);
      itemGroups.get(itemKey)!.push(r);
    }

    for (const [itemKey, items] of itemGroups.entries()) {
      const firstItem = items[0];
      const itemNo = (firstItem.itemNo || '').trim();
      const groupKey = firstItem.groupKey;

      if (groupKey) {
        tbodyHtml += `
          <tr>
            <td style="text-align: center; font-weight: bold;">${itemNo}</td>
            <td style="font-weight: bold; padding-left: 15px;">${groupKey}</td>
            <td></td>
            <td></td>
          </tr>
        `;
        rowCount++;

        for (const item of items) {
          tbodyHtml += `
            <tr>
              <td></td>
              <td style="padding-left: 30px; font-weight: bold;">${item.cleanSeriesTitle}</td>
              <td style="text-align: center; font-weight: bold;">${item.docYear}</td>
              <td style="text-align: center; font-weight: bold;">${item.retentionStr}</td>
            </tr>
          `;
          rowCount++;
        }
      } else {
        for (const item of items) {
          tbodyHtml += `
            <tr>
              <td style="text-align: center; font-weight: bold;">${item.itemNo || ''}</td>
              <td style="padding-left: 15px; font-weight: bold;">${item.cleanSeriesTitle}</td>
              <td style="text-align: center; font-weight: bold;">${item.docYear}</td>
              <td style="text-align: center; font-weight: bold;">${item.retentionStr}</td>
            </tr>
          `;
          rowCount++;
        }
      }
    }
  }

  tbodyHtml += `
    <tr>
      <td></td>
      <td style="text-align: center;">***Nothing Follows***</td>
      <td></td>
      <td></td>
    </tr>
  `;

  return `
    <html>
      <head>
        <title>Print Request Form</title>
        <style>
          @page { size: letter portrait; margin: 0.6in; }
          body { font-family: "Times New Roman", Times, serif; font-size: 11pt; padding: 20px; margin: 0; background: white; }
          .header-text { text-align: center; font-weight: bold; font-size: 11pt; padding: 2px; }
          .header-text.large { font-size: 12pt; }
          .header-box.title { font-size: 12pt; padding: 10px; text-align: center; font-weight: bold; margin-top: 15px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid black; padding: 8px; text-align: left; }
          th { text-align: center; font-weight: bold; }
          .signatures { display: flex; justify-content: space-between; margin-top: 40px; padding: 0 40px; }
          .signature-block { width: 250px; }
          .signature-line { border-bottom: 1px solid black; margin-top: 40px; }
          .signature-label { margin-top: 5px; font-size: 10pt; }
        </style>
      </head>
      <body>
        <div class="header-text large">Provincial Government of Pangasinan</div>
        <div class="header-text">Lingayen, Pangasinan</div>
        <div class="header-box title">${title}</div>
        
        <table>
          <thead>
            <tr>
              <th style="width: 15%;">GRDS/RDS<br/>ITEM NO.</th>
              <th style="width: 45%;">RECORD SERIES TITLE AND DESCRIPTION</th>
              <th style="width: 15%;">Document<br/>Year</th>
              <th style="width: 25%;">Retention<br/>Period</th>
            </tr>
          </thead>
          <tbody>
            ${records.length > 0 ? tbodyHtml : `<tr><td colspan="4" style="text-align:center; height: 100px;">No records staged.</td></tr>`}
          </tbody>
        </table>
        
        <div class="signatures">
          <div class="signature-block" style="margin-right: 50px;">
            <div class="signature-label">Prepared by:</div>
            <div class="signature-line" style="text-align: center; font-weight: bold; font-size: 11pt; padding-top: 15px; border-bottom: 1px solid black;">
              ${prepName || '&nbsp;'}
            </div>
            <div style="text-align: center; font-size: 10pt; margin-top: 2px;">
              ${prepPos || '&nbsp;'}
            </div>
          </div>
          <div class="signature-block">
            <div class="signature-label">Checked and reviewed by:</div>
            <div class="signature-line" style="text-align: center; font-weight: bold; font-size: 11pt; padding-top: 15px; border-bottom: 1px solid black;">
              &nbsp;
            </div>
            <div style="text-align: center; font-size: 10pt; margin-top: 2px;">
              &nbsp;
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

export function getOngoingActiveDeskInfo(datesStr: string, activeDeskYrs: number, retentionStage?: string) {
  const stage = (retentionStage || '').trim().toLowerCase();
  if (stage === 'disposed' || stage === 'storage') return null;
  if (!datesStr || !activeDeskYrs || activeDeskYrs <= 0) return null;

  const currentYear = new Date().getFullYear();
  const covered = extractCoveredYears(datesStr);
  if (covered.years.length === 0) return null;

  const eligibleYears = covered.years.filter(yr => (currentYear - yr) >= activeDeskYrs);
  if (eligibleYears.length === 0) return null;

  const startYear = Math.min(...eligibleYears);
  const elapsedYears = currentYear - startYear;

  return {
    startYear,
    currentYear,
    elapsedYears,
    activeDeskYrs,
    isDeskPeriodReached: true,
    eligibleYears,
  };
}

export function getOngoingDisposalInfo(datesStr: any, totalRetention: any, retentionStage?: any, frequencyOfUse?: any, storageYrs?: any) {
  const stage = String(retentionStage || '').trim().toLowerCase();
  if (stage === 'disposed') return null;

  const safeDatesStr = String(datesStr || '');
  const safeTotalRetention = Number(totalRetention) || 0;
  if (!safeDatesStr || safeTotalRetention <= 0) return null;

  const currentYear = new Date().getFullYear();

  const covered = extractCoveredYears(safeDatesStr);
  const eligibleYears = covered.years.filter(yr => (currentYear - yr) >= safeTotalRetention);

  if (eligibleYears.length === 0) return null;

  const activeYearsRemaining = covered.years.filter(yr => !eligibleYears.includes(yr));
  const newDatesStr = formatYearsListToDatesString(activeYearsRemaining, covered.isOngoing) || currentYear.toString();

  return {
    ongoingStartYear: eligibleYears[0],
    currentYear,
    elapsedYears: currentYear - eligibleYears[0],
    totalRetention: safeTotalRetention,
    newStartYear: eligibleYears[0],
    newDatesStr,
    isRetentionReached: true,
    eligibleYears,
  };
}

export function computeDisposalPeriodChange(datesStr: string): string {
  const currentYear = new Date().getFullYear().toString();
  if (!datesStr) return currentYear;

  const matches = datesStr.match(/\b\d{4}\b/g);
  if (!matches || matches.length === 0) return `${datesStr} → ${currentYear}`;

  const years = matches.map(Number);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  if (datesStr.toLowerCase().includes('present')) {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    return `${datesStr} → ${nextYear} - Present`;
  }

  if (years.length === 1 || minYear === maxYear) {
    return `${minYear} → ${new Date().getFullYear().toString()}`;
  }

  const newMinYear = minYear + 1;
  if (newMinYear <= maxYear) {
    return `${minYear} - ${maxYear} → ${newMinYear} - ${maxYear}`;
  }

  return `${datesStr} → ${new Date().getFullYear().toString()}`;
}

export function computeStoragePeriodChange(datesStr: string): string {
  if (!datesStr) return 'Active → Storage';
  return `${datesStr} (Active) → Storage`;
}

export function cleanSeriesTitle(title?: string): string {
  if (!title) return '';
  return title.replace(/\s*\(\s*\d{4}(?:\s*-\s*\d{4})?\s*\)$/i, '').trim();
}

const generateNapForm3PreviewHtml = (records: any[], telephone: string, volume: string) => {
  let tbodyHtml = '';
  records.forEach(r => {
    let itemNoStyle = 'text-align: center; border: 1px solid black; padding: 5px;';
    let seriesTitleStyle = 'border: 1px solid black; padding: 5px;';

    if (r.isHeader) {
      itemNoStyle += ' font-weight: bold;';
    } else if (r.isCategory) {
      itemNoStyle += ' font-weight: bold;';
      seriesTitleStyle += ' font-weight: bold; padding-left: 10px;';
    } else if (r.isItem && r.seriesTitle.trim().startsWith('-')) {
      seriesTitleStyle += ' padding-left: 20px;';
    }

    const safeTitle = (r.seriesTitle || '').replace(/      /g, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;');
    const displayVal = r.isHeader ? r.prds : r.itemNo;
    const itemNoDisplay = r.isHeader && displayVal ? displayVal.replace(' ', '<br/>') : `<strong>${displayVal || ''}</strong>`;

    tbodyHtml += `
      <tr>
        <td style="${itemNoStyle}">${itemNoDisplay || ''}</td>
        <td style="border: 1px solid black; padding: 5px;"><strong>${safeTitle}</strong></td>
        <td style="text-align: center; border: 1px solid black; padding: 5px;"><strong>${r.period || ''}</strong></td>
        <td style="text-align: center; border: 1px solid black; padding: 5px;"><strong>${r.retention || ''}</strong></td>
      </tr>
    `;
  });

  return `
    <html>
      <head>
        <title>NAP Form 3 Preview</title>
        <style>
          @page { size: 8.5in 13in; margin: 0.5in; }
          body { font-family: "Arial", sans-serif; font-size: 10pt; padding: 0; margin: 0; background: white; }
          table { width: 100%; border-collapse: collapse; }
          .header-table td { border: 1px solid black; padding: 5px; vertical-align: top; }
          .header-title { font-family: "Times New Roman", serif; font-weight: bold; text-align: center; font-size: 11pt; margin-bottom: 5px; }
          .header-sub { font-family: "Times New Roman", serif; text-align: center; font-style: italic; font-size: 10pt; margin-bottom: 15px; }
          .records-table th { border: 1px solid black; padding: 5px; text-align: center; font-weight: bold; font-size: 9pt; }
        </style>
      </head>
      <body>
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 9pt;">
          <div>Form No. 3<br/>Revised 2012</div>
          <div>Accomplish in 3 copies</div>
        </div>
        
        <table class="header-table">
          <tr>
            <td style="width: 50%; text-align: center;">
              <div class="header-title">NATIONAL ARCHIVES OF THE PHILIPPINES</div>
              <div class="header-sub">Pambansang Sinupan ng Pilipinas</div>
              <div class="header-title" style="margin-top: 20px;">REQUEST FOR AUTHORITY TO DISPOSE<br/>OF RECORDS</div>
            </td>
            <td style="width: 50%;">
              <div style="font-size: 10pt;"><strong>AGENCY NAME:</strong></div>
              <div style="font-weight: bold; font-size: 11pt;">PROVINCIAL GOVERNMENT OF PANGASINAN</div>
              <div style="font-size: 10pt;">Human, Resource Management and Development Office</div>
              <div style="border-top: 1px solid black; margin-top: 5px; padding-top: 5px; font-size: 10pt;"><strong>ADDRESS:</strong></div>
              <div style="text-align: center; font-size: 10pt;">1st Floor, Palaris Building, Capitol Compound,<br/>Lingayen, Pangasinan</div>
            </td>
          </tr>
          <tr>
            <td>
              <strong>DATE:</strong><br/>
              <span style="font-size: 11pt;">&nbsp;</span>
            </td>
            <td>
              <strong>TELEPHONE NUMBER:</strong><br/>
              ${telephone || ''}
            </td>
          </tr>
        </table>
        
        <table class="records-table" style="margin-top: -1px;">
          <thead>
            <tr>
              <th style="width: 15%;">GRDS/RDS<br/>ITEM NO.</th>
              <th style="width: 45%;">RECORDS SERIES TITLE AND DESCRIPTION</th>
              <th style="width: 15%;">PERIOD<br/>COVERED</th>
              <th style="width: 25%;">RETENTION PERIOD<br/>AND PROVISION/S<br/>COMPLIED (if any)</th>
            </tr>
          </thead>
          <tbody>
            ${tbodyHtml}
            <tr>
              <td style="border: 1px solid black; padding: 5px;"></td>
              <td style="text-align: center; border: 1px solid black; padding: 5px;">***Nothing Follows***</td>
              <td style="border: 1px solid black; padding: 5px;"></td>
              <td style="border: 1px solid black; padding: 5px;"></td>
            </tr>
          </tbody>
        </table>
        
        <table class="header-table" style="margin-top: -1px;">
          <tr>
            <td style="width: 60%;"><strong>LOCATION OF RECORDS:</strong><br/><br/><strong>HRMDO Records Room</strong></td>
            <td style="width: 40%;"><strong>VOLUME IN CUBIC METER:</strong><br/><br/><div style="text-align: center; font-weight: bold;">${volume || ''}</div></td>
          </tr>
          <tr>
            <td style="height: 60px;"><strong>PREPARED BY:</strong> (Name & Signature)<br/><br/><br/><div style="text-align: center; font-weight: bold;">MERLYN Y. ADAN</div></td>
            <td><strong>POSITION:</strong><br/><br/><br/><strong>Supervising Administrative Officer</strong></td>
          </tr>
          <tr>
            <td colspan="2" style="height: 100px;">
              <div style="font-size: 9pt;"><strong>CERTIFIED AND APPROVED BY:</strong></div>
              <div style="text-align: center; font-size: 9pt; margin-top: 5px;">This is to certify that the above mentioned records are no longer needed and<br/>not involved nor connected in any administrative or judicial cases.</div>
              <div style="text-align: right; margin-top: 40px; padding-right: 50px;">
                <div style="font-weight: bold; font-size: 11pt;">JANETTE C. ASIS</div>
                <div style="font-weight: bold;">Prov'l. Gov't. Department Head-HRMD Officer</div>
              </div>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

function InventoryAppraisal() {
  const processDisposalRecordsForExport = (selectedLogs: any[], allRecords: any[]) => {
    const enriched = selectedLogs.map(l => {
      const matchedRecord = allRecords.find((r: any) => r.id === l.recordId || r.id === l.id);
      const prdsGrds = (l.prdsGrds || matchedRecord?.prdsGrds || '').trim();
      const itemNo = (l.itemNo || matchedRecord?.itemNo || '').trim();
      const category = (matchedRecord?.subCategory || matchedRecord?.classificationCategory || '').trim();
      let title = (l.seriesTitle || matchedRecord?.seriesTitle || '').trim();

      if (category) {
        title = title.replace(/^-\s*/, '');
        title = `- ${title}`;
      }
      const period = (l.inclusiveDates || l.disposedYears || '').trim();
      const ret = parseInt(l.totalRetention || matchedRecord?.totalRetention || '0');
      const retention = ret > 1 ? `${ret} years` : ret === 1 ? `1 year` : '';

      return { prdsGrds, itemNo, category, title, period, retention };
    });

    const mergedItems = new Map<string, any>();
    enriched.forEach(item => {
      const key = `${item.prdsGrds}|${item.itemNo}|${item.category}|${item.title}|${item.retention}`;
      if (!mergedItems.has(key)) {
        mergedItems.set(key, { ...item, periods: new Set<string>(item.period ? [item.period] : []) });
      } else {
        if (item.period) mergedItems.get(key).periods.add(item.period);
      }
    });

    const finalEnriched = Array.from(mergedItems.values()).map(item => ({
      ...item,
      period: Array.from(item.periods).sort().join(', ')
    }));

    const prdsGroups = new Map<string, any[]>();
    finalEnriched.forEach(r => {
      if (!prdsGroups.has(r.prdsGrds)) prdsGroups.set(r.prdsGrds, []);
      prdsGroups.get(r.prdsGrds)!.push(r);
    });

    const sortedPrds = Array.from(prdsGroups.keys()).sort();
    const exportRows: any[] = [];

    for (const prds of sortedPrds) {
      if (prds) {
        exportRows.push({
          prds: prds,
          itemNo: '',
          seriesTitle: '',
          period: '',
          retention: '',
          isHeader: true
        });
      }

      const prdsRecords = prdsGroups.get(prds)!;
      prdsRecords.sort((a, b) => {
        const numA = parseInt(a.itemNo || '0', 10) || 0;
        const numB = parseInt(b.itemNo || '0', 10) || 0;
        if (numA !== numB) return numA - numB;
        const itemA = (a.itemNo || '').localeCompare(b.itemNo || '');
        if (itemA !== 0) return itemA;
        return a.category.localeCompare(b.category);
      });

      const itemGroups = new Map<string, any[]>();
      for (const r of prdsRecords) {
        const itemKey = `${r.itemNo}::${r.category}`;
        if (!itemGroups.has(itemKey)) itemGroups.set(itemKey, []);
        itemGroups.get(itemKey)!.push(r);
      }

      for (const [itemKey, items] of itemGroups.entries()) {
        const firstItem = items[0];
        const itemNo = firstItem.itemNo;
        const category = firstItem.category;

        if (category) {
          exportRows.push({
            prds: '',
            itemNo: itemNo,
            seriesTitle: category,
            period: '',
            retention: '',
            isCategory: true
          });

          for (const item of items) {
            exportRows.push({
              prds: '',
              itemNo: '',
              seriesTitle: item.title,
              period: item.period,
              retention: item.retention,
              isItem: true
            });
          }
        } else {
          for (const item of items) {
            exportRows.push({
              prds: '',
              itemNo: item.itemNo,
              seriesTitle: item.title.replace(/^-\s*/, ''),
              period: item.period,
              retention: item.retention,
              isItem: true
            });
          }
        }
      }
    }

    return exportRows;
  };

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
  const [customStorageYears, setCustomStorageYears] = useState<number[]>([]);
  const [editingRecord, setEditingRecord] = useState<InventoryRecord | null>(null);

  // PDF viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');
  const [isViewerMaximized, setIsViewerMaximized] = useState(false);

  const handleNativeFileAction = async (e: React.MouseEvent<HTMLAnchorElement>, url?: string, filename?: string) => {
    e.preventDefault();
    if (!url) return;
    const lower = url.toLowerCase();

    // Natively save Excel, CSV, and Word documents via IPC to prevent browser launch
    if (lower.match(/\.(xlsx|xls|csv|docx|doc)$/)) {
      if ((window as any).electron?.saveFileNatively) {
        await (window as any).electron.saveFileNatively(url, filename || 'document');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'document';
        a.click();
      }
      return;
    }

    // For PDF, open the inline React Modal viewer
    const absoluteUrl = getAbsoluteUrl(url) || url;
    const encodedUrl = encodeURI(absoluteUrl);
    setViewerSrc(`${encodedUrl}#toolbar=0&navpanes=0`);
    setViewerTitle(filename || 'Document Viewer');
    setIsViewerMaximized(false);
    setViewerOpen(true);
  };
  const [viewingRecord, setViewingRecord] = useState<InventoryRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<InventoryRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showNapFormPreview, setShowNapFormPreview] = useState(false);
  const [preparedByName, setPreparedByName] = useState('');
  const [preparedByPosition, setPreparedByPosition] = useState('');
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
  const [rawDisposalLogs, setDisposalLogs] = useState<any[]>([]);
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // ── Inventory Storage & Disposal Request state ───────────────────────
  const [rawInventoryRequests, setInventoryRequests] = useState<any[]>([]);
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
  const [storageRequestFilter, setStorageRequestFilter] = useState<'All' | 'Pending'>('All');

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
  const [disposalRequestFilter, setDisposalRequestFilter] = useState<'All' | 'Pending'>('All');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'Pending' | 'Completed' | 'Decline'>('Pending');
  const [historySelectedIds, setHistorySelectedIds] = useState<string[]>([]);
  const [isUpdatingHistoryStatus, setIsUpdatingHistoryStatus] = useState(false);

  // ── Preview Modal state ──────────────────────────────────────────────
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewType, setPreviewType] = useState<'Storage' | 'Disposal'>('Storage');
  const [showDisposalExportPreview, setShowDisposalExportPreview] = useState(false);
  const [disposalVolumeInput, setDisposalVolumeInput] = useState('');
  const [disposalTelephoneInput, setDisposalTelephoneInput] = useState('(075) 656-3796');

  const handlePrintIframe = () => {
    const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.print();
    }
  };

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

  // Reset selected history checkboxes when switching sub-tabs, filter statuses, or closing modals
  useEffect(() => {
    setHistorySelectedIds([]);
  }, [historyStatusFilter, disposalModalTab, showDisposalManagementModal]);

  useEffect(() => {
    setStorageHistorySelectedIds([]);
  }, [storageModalTab, showStorageManagementModal]);

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
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin' || currentUser?.role?.toLowerCase() === 'superadmin' || currentUser?.role?.toLowerCase() === 'developer';
  const canDeleteHistory = isAdmin && hasFullDivisionAccess;

  const isDivisionAllowed = useCallback((div: string | undefined) => {
    if (hasFullDivisionAccess) return true;
    if (!div) return false;
    return allowedDivisions.some((d: string) => d.trim().toLowerCase() === div.trim().toLowerCase());
  }, [hasFullDivisionAccess, allowedDivisions]);

  const inventoryRequests = useMemo(() => {
    if (hasFullDivisionAccess) return rawInventoryRequests;
    return rawInventoryRequests.filter((req: any) => {
      if (req.recordsSummary && Array.isArray(req.recordsSummary)) {
        return req.recordsSummary.some((rs: any) => isDivisionAllowed(rs.division));
      }
      return false;
    });
  }, [rawInventoryRequests, hasFullDivisionAccess, isDivisionAllowed]);

  const disposalLogs = useMemo(() => {
    if (hasFullDivisionAccess) return rawDisposalLogs;
    return rawDisposalLogs.filter((log: any) => isDivisionAllowed(log.division));
  }, [rawDisposalLogs, hasFullDivisionAccess, isDivisionAllowed]);

  // Filter raw records based on user's authorized division scope (excluding fully disposed records)
  const authorizedRecords = useMemo(() => {
    const activeRecords = records.filter((r) => {
      if (r.retentionStage === 'Disposed') return false;
      const cleanDates = String(r.inclusiveDates || '').trim().toLowerCase();
      if (cleanDates === 'disposed' || cleanDates === '') return false;
      return true;
    });

    if (hasFullDivisionAccess) return activeRecords;
    return activeRecords.filter((r) => {
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
  const [storageSearchQuery, setStorageSearchQuery] = useState('');
  const [historyDivisionFilter, setHistoryDivisionFilter] = useState('ALL');
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('ALL');
  const [storageDivisionFilter, setStorageDivisionFilter] = useState('ALL');
  const [storageCategoryFilter, setStorageCategoryFilter] = useState('ALL');
  const [storageHistorySelectedIds, setStorageHistorySelectedIds] = useState<string[]>([]);
  const [showBulkDeleteHistoryModal, setShowBulkDeleteHistoryModal] = useState(false);
  const [historyDeleteTarget, setHistoryDeleteTarget] = useState<'storage' | 'disposal'>('storage');
  const [isDeletingHistoryLogs, setIsDeletingHistoryLogs] = useState(false);


  const storageLogs = useMemo(() => {
    return disposalLogs.filter(l => String(l.disposedYears).includes('Storage'));
  }, [disposalLogs]);

  const disposalOnlyLogs = useMemo(() => {
    return disposalLogs.filter(l => !String(l.disposedYears).includes('Storage'));
  }, [disposalLogs]);

  const scopeFilteredRecords = useMemo(() => {
    if (divisionTab === 'ALL') return authorizedRecords;
    return authorizedRecords.filter((r) => (r.division || 'General').trim().toLowerCase() === divisionTab.trim().toLowerCase());
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
    const divsToInit = hasFullDivisionAccess ? systemDivisions : allowedDivisions;
    divsToInit.forEach(d => { if (d !== 'ALL') divCounts[d] = 0; });
    scopeFilteredRecords.forEach(r => {
      const d = r.division || 'General';
      if (d !== 'General' && divCounts[d] === undefined) divCounts[d] = 0;
      divCounts[d] = (divCounts[d] || 0) + 1;
    });
    const divisionStats = Object.keys(divCounts).map(d => ({
      name: d,
      count: divCounts[d],
      percentage: total > 0 ? Math.round((divCounts[d] / total) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    return { total, permanent, mediumCounts, frequencyCounts, utilityCounts, divisionStats };
  }, [scopeFilteredRecords, systemDivisions, hasFullDivisionAccess, allowedDivisions]);

  const disposalAnalytics = useMemo(() => {
    // Only count completed disposals
    const completedDisposals = disposalOnlyLogs.filter(log => log.status === 'Completed');
    const totalDisposed = completedDisposals.length;
    const divCounts: Record<string, number> = {};
    const divsToInit = hasFullDivisionAccess ? systemDivisions : allowedDivisions;
    divsToInit.forEach(d => { if (d !== 'ALL') divCounts[d] = 0; });
    
    completedDisposals.forEach(log => {
      const d = log.division || 'General';
      if (d !== 'General' && divCounts[d] === undefined) divCounts[d] = 0;
      divCounts[d] = (divCounts[d] || 0) + 1;
    });
    
    const divisionStats = Object.keys(divCounts).map(d => ({
      name: d,
      count: divCounts[d],
      percentage: totalDisposed > 0 ? Math.round((divCounts[d] / totalDisposed) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    return { total: totalDisposed, divisionStats };
  }, [disposalOnlyLogs, systemDivisions]);

  const activeDeskEligibleRecords = useMemo(() => {
    return scopeFilteredRecords.filter(r => {
      if (r.appraisalCategory === 'Permanent') return false;
      if (Number(r.storageYrs) <= 0) return false;
      const activeDeskInfoRaw = getOngoingActiveDeskInfo(r.inclusiveDates, Number(r.activeDeskYrs), r.retentionStage);
      if (!activeDeskInfoRaw) return false;
      const covered = extractCoveredYears(r.inclusiveDates);
      const eligibleYrs = covered.years.filter(yr => (new Date().getFullYear() - yr) >= Number(r.activeDeskYrs));
      const hasUnstored = eligibleYrs.some(yr => {
        return !storageLogs.some(log => (log.recordId === r.id || log.id === r.id) && String(log.disposedYears || log.inclusiveDates || '').includes(yr.toString()));
      });
      return hasUnstored;
    });
  }, [scopeFilteredRecords, storageLogs]);

  const disposalEligibleRecords = useMemo(() => {
    return scopeFilteredRecords.filter(r => {
      if (r.appraisalCategory === 'Permanent') return false;
      const disposalInfoRaw = getOngoingDisposalInfo(r.inclusiveDates, Number(r.totalRetention), r.retentionStage, r.frequencyOfUse, Number(r.storageYrs));
      return disposalInfoRaw !== null;
    });
  }, [scopeFilteredRecords]);

  useEffect(() => {
    if (records.length > 0) {
      const currentYear = new Date().getFullYear();
      const hasSeenNotice = localStorage.getItem(`annual_retention_notice_${currentYear}`);
      if (!hasSeenNotice && (activeDeskEligibleRecords.length > 0 || disposalEligibleRecords.length > 0)) {
        setShowAnnualNoticeModal(true);
      }
    }
  }, [records, activeDeskEligibleRecords.length, disposalEligibleRecords.length]);

  const handleMoveToStorage = (record: InventoryRecord) => {
    setStagedStorageRecords((prev) => {
      if (prev.some((r) => r.id === record.id)) return prev;
      return [...prev, { ...record, stagedAt: new Date().toISOString() }];
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
      const newRecs = recs
        .filter((r) => !prev.some((p) => p.id === r.id))
        .map((r) => ({ ...r, stagedAt: r.stagedAt || new Date().toISOString() }));
      return [...prev, ...newRecs];
    });
    showToast(`${recs.length} record(s) staged in Storage Management under Confirmation of Storage tab.`, 'info');
  };

  const openDisposalRequestModal = (recs: InventoryRecord[]) => {
    setStagedDisposalRecords((prev) => {
      const newRecs = recs
        .filter((r) => !prev.some((p) => p.id === r.id))
        .map((r) => ({ ...r, stagedAt: r.stagedAt || new Date().toISOString() }));
      return [...prev, ...newRecs];
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
          prdsGrds: r.prdsGrds,
          itemNo: r.itemNo,
          totalRetention: r.totalRetention,
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
        prdsGrds: r.prdsGrds,
        itemNo: r.itemNo,
        totalRetention: r.totalRetention,
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

  const handleDeleteHistoryLog = async (logId: string) => {
    if (!canDeleteHistory) {
      showToast('Unauthorized: Only administrators with access to all divisions can delete history logs.', 'error');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this history log? The original record will be reverted.')) {
      return;
    }
    try {
      await api.inventory.deleteDisposalHistory(logId);
      showToast('History log deleted and record reverted successfully!', 'success');
      fetchRecords();
      fetchDisposalHistory();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete history log.', 'error');
    }
  };

  const confirmBulkDeleteHistory = async () => {
    if (!canDeleteHistory) {
      showToast('Unauthorized: Only administrators with access to all divisions can delete history logs.', 'error');
      return;
    }
    const targetIds = historyDeleteTarget === 'storage' ? storageHistorySelectedIds : historySelectedIds;
    if (targetIds.length === 0) return;
    setIsDeletingHistoryLogs(true);
    try {
      await api.inventory.bulkDeleteDisposalHistory(targetIds);
      showToast(`Successfully deleted ${targetIds.length} history logs and reverted records.`, 'success');
      if (historyDeleteTarget === 'storage') {
        setStorageHistorySelectedIds([]);
      } else {
        setHistorySelectedIds([]);
      }
      setShowBulkDeleteHistoryModal(false);
      fetchRecords();
      fetchDisposalHistory();
    } catch (err: any) {
      showToast(err.message || 'Failed to bulk delete history logs.', 'error');
    } finally {
      setIsDeletingHistoryLogs(false);
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
      await api.approvals.submit({
        requestedBy: currentUser?.id || 'system',
        requestedByName: currentUser ? `${currentUser.lastName}, ${currentUser.firstName}` : 'System User',
        action: 'delete_inventory_record',
        entityType: 'inventory',
        entityId: deletingRecord.id,
        entityName: deletingRecord.seriesTitle,
        payload: {
          id: deletingRecord.id,
          seriesTitle: deletingRecord.seriesTitle,
        }
      });
      showToast('Deletion request submitted successfully! Awaiting Admin approval in Requests & Approvals tab.', 'success');
      setDeletingRecord(null);
      setViewingRecord(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to submit deletion request.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    try {
      await api.approvals.submit({
        requestedBy: currentUser?.id || 'system',
        requestedByName: currentUser ? `${currentUser.lastName}, ${currentUser.firstName}` : 'System User',
        action: 'bulk_delete_inventory_records',
        entityType: 'inventory',
        entityId: 'bulk',
        entityName: 'Multiple Inventory Records',
        payload: {
          ids: selectedIds,
          count: selectedIds.length
        }
      });
      showToast(`Successfully submitted bulk deletion request for ${selectedIds.length} records.`, 'success');
      setShowBulkDeleteModal(false);
      setSelectedIds([]);
    } catch (err: any) {
      showToast(err.message || 'Failed to submit bulk deletion request.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateHistoryStatus = async (newStatus: 'Completed' | 'Decline') => {
    if (historySelectedIds.length === 0) return;
    setIsUpdatingHistoryStatus(true);
    try {
      await api.inventory.updateDisposalHistoryStatus(historySelectedIds, newStatus);
      showToast(`Successfully marked ${historySelectedIds.length} logs as ${newStatus}.`, 'success');
      setHistorySelectedIds([]);
      // Refresh the logs.
      const freshLogs = await api.inventory.getDisposalHistory();
      setDisposalLogs(freshLogs);
      fetchRecords(); // refresh records to see inclusiveDates updates
    } catch (err: any) {
      showToast(err.message || 'Failed to update disposal history status.', 'error');
    } finally {
      setIsUpdatingHistoryStatus(false);
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
        setIsModalOpen(false);
        fetchRecords();
        return;
      }

      await api.inventory.update(editingRecord.id, data);
      showToast('Record series updated successfully!', 'success');
      setIsModalOpen(false);
    } else {
      if (targetStage === 'Storage' || targetStage === 'Disposed') {
        const newRecord = await api.inventory.create({ ...data, retentionStage: 'Active' });
        showToast(`Record created. Stage change to ${targetStage} requires Admin confirmation. Request modal opened!`, 'info');
        if (targetStage === 'Storage') {
          openStorageRequestModal([newRecord]);
        } else {
          openDisposalRequestModal([newRecord]);
        }
        setIsModalOpen(false);
        fetchRecords();
        return;
      }

      await api.inventory.create(data);
      showToast('New record series entry created successfully!', 'success');
      setIsModalOpen(false);
    }
    fetchRecords();
  };

  // Dynamic active division records based on selected division tab
  const activeDivisionRecords = useMemo(() => {
    if (divisionTab === 'ALL') return authorizedRecords;
    return authorizedRecords.filter(r => (r.division || 'General').trim().toLowerCase() === divisionTab.trim().toLowerCase());
  }, [authorizedRecords, divisionTab]);

  // ── Helper to group records by Division, Category & Sub-Category ──────────

  const getGroupedNapItems = (list: InventoryRecord[]): NapRowItem[] => {
    const items: NapRowItem[] = [];
    // (Division::Category) -> SubCategory -> Array of records
    const catMap = new Map<string, Map<string, InventoryRecord[]>>();

    list.forEach(r => {
      const div = (r.division || 'General').toUpperCase().trim();
      const cat = (r.classificationCategory || 'GENERAL').toUpperCase().trim();
      const sub = (r.subCategory || '').trim();

      const catKey = `${cat}::${div}`;

      if (!catMap.has(catKey)) {
        catMap.set(catKey, new Map());
      }
      const subMap = catMap.get(catKey)!;
      if (!subMap.has(sub)) {
        subMap.set(sub, []);
      }
      subMap.get(sub)!.push(r);
    });

    const sortedCatKeys = Array.from(catMap.keys()).sort((a, b) => {
      const isAGen = a.startsWith('GENERAL::');
      const isBGen = b.startsWith('GENERAL::');
      if (isAGen && !isBGen) return 1;
      if (!isAGen && isBGen) return -1;
      return a.localeCompare(b);
    });

    let hasInsertedBlank = false;
    sortedCatKeys.forEach((catKey) => {
      const [catName, div] = catKey.split('::');
      const isGeneral = catName === 'GENERAL';

      if (isGeneral && items.length > 0 && !hasInsertedBlank) {
        hasInsertedBlank = true;
        items.push({
          type: 'record',
          title: '',
          record: { inclusiveDates: '' } as any,
          isUncategorized: true
        });
      }

      if (catName && catName !== 'GENERAL') {
        items.push({
          type: 'category',
          title: catName // The title will just be the category name, but they will be separated by division
        });
      }

      const subMap = catMap.get(catKey)!;
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
        const safe = (v: any) => (v === undefined || v === null || v === '' || String(v).trim().toLowerCase() === 'undefined' ? '-' : v);
        const util = safe((r.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim());

        rows.push(`
          <tr style="height:24px; background:#fff;">
            <td style="border:1px solid #000; padding:3px 6px 3px ${item.isUncategorized ? '6px' : '36px'}; font-size:9pt; vertical-align:top; font-family:Arial, sans-serif; word-break:break-word;">
              <div style="font-weight:normal; color:#000;">${safe(r.seriesTitle) !== '-' ? r.seriesTitle : ''}</div>
              ${r.scopeDescription && r.scopeDescription !== 'undefined' ? `<div style="font-size:7.5pt; color:#555; margin-top:1px;">${r.scopeDescription}</div>` : ''}
            </td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top; white-space:nowrap;">${safe(r.inclusiveDates) === '-' ? '-' : formatDynamicDates(r.inclusiveDates)}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.volume)}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.medium)}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.restrictions && r.restrictions.toLowerCase() !== 'none' && r.restrictions !== 'undefined' ? r.restrictions : '-'}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.locationOfRecords)}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.frequencyOfUse)}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.duplication)}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.appraisalCategory)}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${util}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : safe(r.activeDeskYrs)}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : safe(r.storageYrs)}</td>
            <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : safe(r.totalRetention)}</td>
            <td style="border:1px solid #000; padding:3px 5px; font-size:9pt; vertical-align:top; word-break:break-word;">${safe(r.dispositionProvision)}</td>
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
      const styleBlock = pi === 0 ? `
        <style>
          @media print {
            @page { margin: 0.6in 0.5in 1.0in 0.6in !important; }
          }
        </style>
      ` : '';
      return `
        ${styleBlock}
        <div style="${pb} font-family: Arial, sans-serif; font-size: 8pt; color: #000; background: #fff; padding: 12px;">
          <!-- Removed Small Top Identifier Tag -->

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
        const safe = (v: any) => (v === undefined || v === null || v === '' || String(v).trim().toLowerCase() === 'undefined' ? '-' : v);
        const util = safe((r.utilityValue || '').replace(/\s*\(.*?\)/g, '').trim());
        return `<tr style="height:24px; background:#fff;">
                  <td style="border:1px solid #000; padding:3px 6px 3px ${item.isUncategorized ? '6px' : '36px'}; font-size:9pt; vertical-align:top; font-family:Arial, sans-serif; word-break:break-word;">
                    <div style="font-weight:normal; color:#000;">${safe(r.seriesTitle) !== '-' ? r.seriesTitle : ''}</div>
                    ${r.scopeDescription && r.scopeDescription !== 'undefined' ? `<div style="font-size:7.5pt; color:#555; margin-top:1px;">${r.scopeDescription}</div>` : ''}
                  </td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top; white-space:nowrap;">${safe(r.inclusiveDates) === '-' ? '-' : formatDynamicDates(r.inclusiveDates)}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.volume)}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.medium)}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${r.restrictions && r.restrictions.toLowerCase() !== 'none' && r.restrictions !== 'undefined' ? r.restrictions : '-'}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.locationOfRecords)}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.frequencyOfUse)}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.duplication)}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${safe(r.appraisalCategory)}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${util}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : safe(r.activeDeskYrs)}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : safe(r.storageYrs)}</td>
                  <td style="border:1px solid #000; padding:3px 4px; font-size:9pt; text-align:center; vertical-align:top;">${perm ? '-' : safe(r.totalRetention)}</td>
                  <td style="border:1px solid #000; padding:3px 5px; font-size:9pt; vertical-align:top; word-break:break-word;">${safe(r.dispositionProvision)}</td>
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
      const dateStr = new Date().toISOString().slice(0, 10);

      const processZipSheet = async (list: InventoryRecord[], divName: string): Promise<Blob> => {
        const items = getGroupedNapItems(list);
        const buffer = await generateNapForm1Excel(items, divName, napFormHeader);
        return new Blob([buffer as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
        (r.division || 'General').trim().toLowerCase() === divisionTab.trim().toLowerCase();
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
            <button
              className={`capsule-action-btn ${pendingRequests.length > 0 ? 'capsule-action-btn--primary' : 'capsule-action-btn--secondary'}`}
              onClick={() => {
                fetchInventoryRequests();
                setShowPendingRequestsModal(true);
              }}
            >
              <div className="capsule-action-btn__icon">
                <MdAssignment style={{ color: pendingRequests.length > 0 ? '#fff' : '#2563eb' }} />
              </div>
              <span>Pending Requests {pendingRequests.length > 0 && <span className="capsule-action-btn__badge">{pendingRequests.length}</span>}</span>
            </button>
          )}
          <button
            className="capsule-action-btn capsule-action-btn--secondary"
            onClick={() => {
              fetchDisposalHistory();
              fetchInventoryRequests();
              setStorageModalTab(stagedStorageRecords.length > 0 ? 'confirmation' : (hasFullDivisionAccess && pendingRequests.length > 0 ? 'requests' : 'history'));
              setShowStorageManagementModal(true);
            }}
          >
            <div className="capsule-action-btn__icon">
              <MdInventory style={{ color: '#d97706' }} />
            </div>
            <span>Storage ({storageLogs.length} History) {stagedStorageRecords.length > 0 && <span className="capsule-action-btn__badge" style={{ backgroundColor: '#d97706' }}>{stagedStorageRecords.length} Staged</span>}</span>
          </button>
          <button
            className="capsule-action-btn capsule-action-btn--secondary"
            onClick={() => {
              fetchDisposalHistory();
              fetchInventoryRequests();
              setDisposalModalTab(stagedDisposalRecords.length > 0 ? 'confirmation' : (hasFullDivisionAccess && pendingDisposalRequests.length > 0 ? 'requests' : 'history'));
              setShowDisposalManagementModal(true);
            }}
          >
            <div className="capsule-action-btn__icon">
              <MdDeleteSweep style={{ color: '#dc2626' }} />
            </div>
            <span>Disposal ({disposalOnlyLogs.length} History) {stagedDisposalRecords.length > 0 && <span className="capsule-action-btn__badge" style={{ backgroundColor: '#dc2626' }}>{stagedDisposalRecords.length} Staged</span>}</span>
          </button>
          <button className="capsule-action-btn capsule-action-btn--primary" onClick={handleCreateNew}>
            <div className="capsule-action-btn__icon">
              <MdAdd style={{ color: '#fff' }} />
            </div>
            <span>Create New Records Series Entry</span>
          </button>
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

        {!hasFullDivisionAccess && (
          <Card
            hoverable
            className="inventory-kpi-card inventory-kpi-card--emerald"
            onClick={() => {
              fetchDisposalHistory();
              setDisposalModalTab('history');
              setShowDisposalManagementModal(true);
            }}
            style={{ cursor: 'pointer' }}
            title="Click to open your disposal history"
          >
            <div className="inventory-kpi-card__inner">
              <div className="inventory-kpi-card__icon-wrapper inventory-kpi-card__icon-wrapper--emerald">
                <MdDeleteSweep />
              </div>
              <div className="inventory-kpi-card__info">
                <span className="inventory-kpi-card__label">Total Disposed Items</span>
                <span className="inventory-kpi-card__value inventory-kpi-card__value--emerald">{disposalAnalytics.total}</span>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Analytics Dashboard Grid */}
      <div className="inventory-dashboard-grid">
        {/* Division Breakdown */}
        {hasFullDivisionAccess && (
          <Card className="dashboard-widget">
            <div>
              <h3 className="dashboard-widget__title">Records Series by Division</h3>
              <div className="dashboard-stat-list">
                {analytics.divisionStats.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No records available</div>
                ) : (
                  analytics.divisionStats.map((stat, idx) => (
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

        {hasFullDivisionAccess && (
          <Card className="dashboard-widget">
            <div>
              <h3 className="dashboard-widget__title">Disposed Series by Division</h3>
              <div className="dashboard-stat-list">
                {disposalAnalytics.divisionStats.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No disposed items available</div>
                ) : (
                  disposalAnalytics.divisionStats.map((stat, idx) => (
                    <div key={stat.name} className="dashboard-stat-item">
                      <div className="dashboard-stat-header">
                        <span>{stat.name}</span>
                        <span className="dashboard-stat-badge" style={{ background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}>{stat.count} ({stat.percentage}%)</span>
                      </div>
                      <div className="dashboard-progress-track">
                        <div
                          className={`dashboard-progress-fill`}
                          style={{ width: `${stat.percentage}%`, background: idx % 3 === 0 ? '#dc2626' : idx % 3 === 1 ? '#ea580c' : '#d97706' }}
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

                          let activeDeskInfo = null;
                          if (!isPermanent && Number(r.storageYrs) > 0) {
                            const activeDeskInfoRaw = getOngoingActiveDeskInfo(r.inclusiveDates, Number(r.activeDeskYrs), r.retentionStage);
                            if (activeDeskInfoRaw) {
                              const covered = extractCoveredYears(r.inclusiveDates);
                              const eligibleYrs = covered.years.filter(yr => (new Date().getFullYear() - yr) >= Number(r.activeDeskYrs));
                              const hasUnstored = eligibleYrs.some(yr => {
                                return !storageLogs.some(log => (log.recordId === r.id || log.id === r.id) && String(log.disposedYears || log.inclusiveDates || '').includes(yr.toString()));
                              });
                              if (hasUnstored) activeDeskInfo = activeDeskInfoRaw;
                            }
                          }

                          const disposalInfo = !isPermanent
                            ? getOngoingDisposalInfo(r.inclusiveDates, Number(r.totalRetention), r.retentionStage, r.frequencyOfUse, Number(r.storageYrs))
                            : null;

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
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'center', marginTop: '0.35rem' }}>
                                  {activeDeskInfo && (
                                    <button
                                      type="button"
                                      style={{
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
                                      <MdHourglassTop style={{ fontSize: '0.75rem' }} /> Evaluate Storage
                                    </button>
                                  )}
                                  {disposalInfo && (
                                    <button
                                      type="button"
                                      style={{
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
                                      title={`Retention period of ${disposalInfo.totalRetention} years reached! Click to evaluate disposal.`}
                                    >
                                      <MdWarning style={{ fontSize: '0.75rem' }} /> Evaluate & Dispose
                                    </button>
                                  )}
                                </div>
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
          ? (formatYearsListToDatesString(activeYearsRemaining, covered.isOngoing) || new Date().getFullYear().toString())
          : evaluatingRecord.info.newDatesStr;

        const isCustomSelected = customDisposedYears.length > 0;

        const currentYear = new Date().getFullYear();
        const reqYears = evaluatingRecord.record.totalRetention || 0;
        const eligibleDisposalYears = covered.years.filter(yr => (currentYear - yr) >= reqYears);

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
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '1rem', borderRadius: '8px', fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                <strong>Confirm Disposal Transition:</strong> You are about to permanently dispose of this record series. This action will mark the selected years as disposed.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem 1rem', background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Item No.</div>
                  <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                    {evaluatingRecord.record.prdsGrds && evaluatingRecord.record.itemNo
                      ? `${evaluatingRecord.record.prdsGrds} — ${evaluatingRecord.record.itemNo}`
                      : evaluatingRecord.record.prdsGrds || evaluatingRecord.record.itemNo || '-'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Record Series</div>
                  <div style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: '1.2rem' }}>{cleanSeriesTitle(evaluatingRecord.record.seriesTitle)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Division</div>
                  <div style={{ fontWeight: 500 }}>{evaluatingRecord.record.division || 'General'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Category</div>
                  <div style={{ fontWeight: 500 }}>{evaluatingRecord.record.classificationCategory || '-'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem 1rem', background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Current Stored Period</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{evaluatingRecord.record.inclusiveDates}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Currently Displayed</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatDynamicDates(evaluatingRecord.record.inclusiveDates)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Total Retention Reached</div>
                  <div style={{ fontWeight: 700, color: '#dc2626' }}>{evaluatingRecord.info.totalRetention} Year(s)</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>New Inclusive Dates if Disposed</div>
                  <div style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: '1.2rem' }}>{computedCustomDates}</div>
                </div>
              </div>

              {/* Specific Year Disposal Selector */}
              {eligibleDisposalYears.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'var(--bg-primary)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    💡 Or Select Specific Year(s) to Dispose:
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Click a year below to mark it as disposed (e.g. disposing 2024 from <code>2023 - 2026</code> saves as <code>2023, 2025 - 2026</code>):
                  </span>

                  {Number(evaluatingRecord.record.storageYrs) > 0 && eligibleDisposalYears.some(yr => !storageLogs.some(log => (log.recordId === evaluatingRecord.record.id || log.id === evaluatingRecord.record.id) && String(log.disposedYears || log.inclusiveDates || '').includes(yr.toString()))) && (
                    <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.4)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.75rem', color: '#b45309', fontWeight: 600, display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                      <MdWarning style={{ fontSize: '1.2rem', flexShrink: 0 }} />
                      <div>
                        <strong>Warning:</strong> Some eligible years below (highlighted in orange) have not been formally confirmed in Storage. Disposing them now will skip their required {evaluatingRecord.record.storageYrs}-year storage phase.
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {eligibleDisposalYears.map((yr) => {
                      const isDisposed = customDisposedYears.includes(yr);
                      const isDeclined = disposalOnlyLogs.some(log =>
                        (log.recordId === evaluatingRecord.record.id || log.id === evaluatingRecord.record.id) &&
                        log.status === 'Decline' &&
                        String(log.disposedYears || '').includes(yr.toString())
                      );
                      const isStored = storageLogs.some(log =>
                        (log.recordId === evaluatingRecord.record.id || log.id === evaluatingRecord.record.id) &&
                        String(log.disposedYears || log.inclusiveDates || '').includes(yr.toString())
                      );

                      return (
                        <div key={`yr-pill-container-${yr}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                          <button
                            type="button"
                            title={isStored ? "Confirmed in Storage" : "Warning: Not found in Storage History"}
                            style={{
                              fontSize: '0.85rem',
                              padding: '0.45rem 0.85rem',
                              borderRadius: '6px',
                              border: isDisposed ? '1px solid #ef4444' : (isDeclined ? '1px dashed #f59e0b' : (isStored ? '1px solid #10b981' : '1px solid #f59e0b')),
                              background: isDisposed ? 'rgba(239, 68, 68, 0.12)' : (isDeclined ? 'rgba(245, 158, 11, 0.1)' : (isStored ? 'rgba(16, 185, 129, 0.05)' : 'rgba(245, 158, 11, 0.05)')),
                              color: isDisposed ? '#dc2626' : (isDeclined ? '#d97706' : (isStored ? '#059669' : '#d97706')),
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              textDecoration: isDisposed ? 'line-through' : 'none',
                              boxShadow: isDisposed ? '0 2px 4px rgba(239, 68, 68, 0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                              transition: 'all 0.2s ease',
                            }}
                            onClick={() => {
                              setCustomDisposedYears((prev) =>
                                prev.includes(yr) ? prev.filter((y) => y !== yr) : [...prev, yr]
                              );
                            }}
                          >
                            {isDisposed ? '🗑️ Disposed ' : (isDeclined ? '⛔ Declined ' : (isStored ? '📦 ' : '⚠️ '))} {yr} ({currentYear - yr} yrs)
                          </button>
                          <span style={{ fontSize: '0.65rem', color: isStored ? '#059669' : '#d97706', fontWeight: 700 }}>
                            {isStored ? 'In Storage' : 'Not in Storage'}
                          </span>
                        </div>
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
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  style={{ padding: '0.5rem 1.15rem', background: '#dc2626', borderColor: '#dc2626' }}
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
                      if (evaluatingRecord.info.eligibleYears && evaluatingRecord.info.eligibleYears.length > 0) {
                        const yearRecords = evaluatingRecord.info.eligibleYears.map((yr: number) => ({
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
                    }
                    setCustomDisposedYears([]);
                  }}
                >
                  {isCustomSelected
                    ? `Dispose Selected Year(s) & Save as ${computedCustomDates}`
                    : `Dispose & Advance to ${evaluatingRecord.info.newDatesStr}`}
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
                <span>Requests ({inventoryRequests.filter(r => r.requestType === 'Storage').length})</span>
                {pendingStorageRequests.length > 0 && (
                  <span style={{
                    background: 'rgba(217, 119, 6, 0.15)',
                    color: '#d97706',
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Select the records you want to submit for storage confirmation, provide the reason, and attach authorization proof.
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button variant="secondary" size="sm" onClick={() => { setPreviewType('Storage'); setShowPreviewModal(true); }} style={{ display: 'flex', alignItems: 'center' }}>
                          <MdPrint style={{ marginRight: '6px', fontSize: '1.1rem' }} /> View & Print Request Form
                        </Button>
                      </div>
                    </div>
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
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Item No.</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Record Series</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Division</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Category</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Period Covered</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Total Retention</th>
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
                                  {new Date(r.stagedAt || r.createdAt || Date.now()).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>
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
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {(() => {
                                    const baseYear = parseInt(r.inclusiveDates || '0');
                                    const ret = parseInt(String(r.totalRetention || '0'));
                                    const expiryYear = baseYear && ret ? baseYear + ret : null;
                                    return expiryYear ? `${expiryYear} (${ret} yrs)` : `${r.totalRetention || '-'} yrs`;
                                  })()}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '75%' }}>
                    Track the status of your submitted storage requests, including pending, approved, and rejected.
                  </p>
                  <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <button
                      type="button"
                      onClick={() => setStorageRequestFilter('All')}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', fontWeight: storageRequestFilter === 'All' ? 700 : 500, background: storageRequestFilter === 'All' ? 'var(--bg-primary)' : 'transparent', color: storageRequestFilter === 'All' ? 'var(--color-primary)' : 'var(--text-secondary)', borderRadius: '6px', border: storageRequestFilter === 'All' ? '1px solid var(--border-color)' : '1px solid transparent', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: storageRequestFilter === 'All' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none' }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setStorageRequestFilter('Pending')}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', fontWeight: storageRequestFilter === 'Pending' ? 700 : 500, background: storageRequestFilter === 'Pending' ? 'var(--bg-primary)' : 'transparent', color: storageRequestFilter === 'Pending' ? 'var(--color-primary)' : 'var(--text-secondary)', borderRadius: '6px', border: storageRequestFilter === 'Pending' ? '1px solid var(--border-color)' : '1px solid transparent', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: storageRequestFilter === 'Pending' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none' }}
                    >
                      Pending
                    </button>
                  </div>
                </div>

                {inventoryRequests.filter((r) => r.requestType === 'Storage' && (storageRequestFilter === 'All' || r.status === 'pending')).length === 0 ? (
                  <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    No storage requests found.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto' }}>
                    {inventoryRequests.filter((r) => r.requestType === 'Storage' && (storageRequestFilter === 'All' || r.status === 'pending')).map((req) => (
                      <div
                        key={`req-tab-${req.id}`}
                        onClick={() => setSelectedRequestDetails(req)}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: '10px',
                          padding: '1.25rem',
                          background: 'var(--bg-primary)',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
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
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span>Requested by {req.requesterName}</span>
                              {req.status === 'approved' && req.approvedByName && (
                                <>
                                  <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>•</span>
                                  <span>Approved by {req.approvedByName}</span>
                                </>
                              )}
                              {req.status === 'rejected' && req.approvedByName && (
                                <>
                                  <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>•</span>
                                  <span>Rejected by {req.approvedByName}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            {new Date(req.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                            Target Records ({req.recordsSummary?.length || 0})
                          </div>
                          <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {(req.recordsSummary || []).map((s: any) => `${s.prdsGrds || s.itemNo ? `[${s.prdsGrds ? s.prdsGrds + ' ' : ''}${s.itemNo || ''}] `.trim() + ' ' : ''}${s.seriesTitle}`).join(', ')}
                          </div>
                          {(req.recordsSummary || []).some((s: any) => s.totalRetention) && (
                            <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {(req.recordsSummary || []).filter((s: any) => s.totalRetention).map((s: any, idx: number) => {
                                const baseYear = parseInt(s.inclusiveDates || '0');
                                const ret = parseInt(s.totalRetention || '0');
                                const expiryYear = baseYear && ret ? baseYear + ret : null;
                                return (
                                  <span key={`ret-s-${idx}`} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.1)', color: '#b45309', fontWeight: 600 }}>
                                    {s.seriesTitle}: {expiryYear ? `${expiryYear} (${ret} yrs)` : `${ret} yrs`}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          <strong>Reason provided:</strong> {req.reason}
                        </div>

                        {req.attachmentUrl && (
                          <div style={{ fontSize: '0.825rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                            📎 Attached Proof: <a
                              href={req.attachmentUrl}
                              onClick={(e) => handleNativeFileAction(e, req.attachmentUrl, req.attachmentName)}
                              rel="noopener noreferrer"
                              style={{ textDecoration: 'underline', color: 'var(--color-primary)' }}
                            >
                              {req.attachmentName || 'View Attached Document'}
                            </a>
                          </div>
                        )}

                        {/* Admin Decision actions if pending & user is Admin/Dev */}
                        {req.status === 'pending' && hasFullDivisionAccess && (
                          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Admin Decision</div>
                            <input
                              type="text"
                              placeholder="Optional remarks or reason for decision..."
                              value={adminDecisionReason}
                              onChange={(e) => setAdminDecisionReason(e.target.value)}
                              style={{
                                padding: '0.55rem 0.75rem',
                                fontSize: '0.85rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                                outline: 'none',
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={isProcessingAdminDecision}
                                onClick={() => handleAdminRejectRequest(req.id)}
                              >
                                ✕ Reject Request
                              </Button>
                              <Button
                                variant="success"
                                size="sm"
                                disabled={isProcessingAdminDecision}
                                onClick={() => handleAdminConfirmRequest(req.id)}
                              >
                                ✓ Accept Request
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    History of all record series transitioned from Active Desk to Storage.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ width: '250px' }}>
                      <SearchBar
                        value={storageSearchQuery}
                        onChange={(e) => setStorageSearchQuery(e.target.value)}
                        placeholder="Search logs..."
                      />
                    </div>
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
                    </div>
                  </div>
                </div>

                {(() => {
                  const expandedLogs: any[] = [];
                  storageLogs.forEach((log) => {
                    const cleanYearsStr = String(log.disposedYears || '').replace(/Moved to Storage:\s*/i, '').trim();
                    let yearList: number[] = [];

                    if (cleanYearsStr.includes('-')) {
                      const parts = cleanYearsStr.split('-').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
                      if (parts.length === 2 && parts[0] <= parts[1]) {
                        for (let y = parts[0]; y <= parts[1]; y++) yearList.push(y);
                      }
                    }
                    if (yearList.length === 0) {
                      yearList = (cleanYearsStr.match(/\b\d{4}\b/g) || []).map((n) => parseInt(n, 10));
                    }

                    if (yearList.length > 1) {
                      yearList.forEach((singleYear, idx) => {
                        expandedLogs.push({
                          ...log,
                          id: `${log.id}-${singleYear}-${idx}`,
                          originalId: log.id,
                          targetYear: singleYear,
                          disposedYears: String(singleYear),
                        });
                      });
                    } else {
                      expandedLogs.push({
                        ...log,
                        id: log.id,
                        originalId: log.id,
                        targetYear: yearList[0],
                        disposedYears: yearList[0] ? String(yearList[0]) : (cleanYearsStr || log.disposedYears),
                      });
                    }
                  });

                  const filtered = expandedLogs.filter((log) => {
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
                            <th style={{ padding: '0.65rem 0.85rem', width: 'auto', whiteSpace: 'nowrap', textAlign: 'center' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}>
                                <input
                                  type="checkbox"
                                  checked={storageHistorySelectedIds.length > 0 && storageHistorySelectedIds.length === filtered.length}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setStorageHistorySelectedIds(filtered.map(l => l.id));
                                    } else {
                                      setStorageHistorySelectedIds([]);
                                    }
                                  }}
                                />
                                {canDeleteHistory && storageHistorySelectedIds.length > 0 && (
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem', height: 'auto', whiteSpace: 'nowrap' }}
                                    onClick={() => {
                                      setHistoryDeleteTarget('storage');
                                      setShowBulkDeleteHistoryModal(true);
                                    }}
                                  >
                                    <MdDeleteSweep style={{ fontSize: '1rem', marginRight: '0.2rem' }} /> Delete ({storageHistorySelectedIds.length})
                                  </Button>
                                )}
                              </div>
                            </th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Date & Time</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Item No.</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Record Series</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Division</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Category</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Period Covered</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Total Retention</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Transition Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((log) => (
                            <tr key={`storage-log-${log.id}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={storageHistorySelectedIds.includes(log.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setStorageHistorySelectedIds(prev => [...prev, log.id]);
                                    } else {
                                      setStorageHistorySelectedIds(prev => prev.filter(id => id !== log.id));
                                    }
                                  }}
                                />
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 600 }}>
                                {new Date(log.disposedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>
                                {log.prdsGrds && log.itemNo ? (
                                  <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)' }}>{log.prdsGrds}</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)' }}>{log.itemNo}</div>
                                  </div>
                                ) : (
                                  log.prdsGrds || log.itemNo || '-'
                                )}
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
                              <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 700, color: '#d97706' }}>
                                {log.inclusiveDates || log.disposedYears || '-'}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {(() => {
                                  const baseYear = parseInt(log.inclusiveDates || log.disposedYears || '0');
                                  const matchedRecord = records.find((r: any) => r.id === log.recordId || r.id === log.id);
                                  const ret = parseInt(log.totalRetention || matchedRecord?.totalRetention || '0');
                                  const expiryYear = baseYear && ret ? baseYear + ret : null;
                                  return expiryYear ? `${expiryYear} (${ret} yrs)` : ret ? `${ret} yrs` : '-';
                                })()}
                              </td>
                              <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(245, 158, 11, 0.12)', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 700, fontSize: '0.8rem' }}>
                                  <MdArchive style={{ fontSize: '0.9rem' }} /> Moved to Storage
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
                <span>Requests ({inventoryRequests.filter(r => r.requestType === 'Disposal').length})</span>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        Select the records you want to submit for disposal confirmation, provide the reason, and attach authorization proof.
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button variant="secondary" size="sm" onClick={() => { setPreviewType('Disposal'); setShowPreviewModal(true); }} style={{ display: 'flex', alignItems: 'center' }}>
                          <MdPrint style={{ marginRight: '6px', fontSize: '1.1rem' }} /> View & Print Request Form
                        </Button>
                      </div>
                    </div>
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
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Item No.</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Record Series</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Division</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700 }}>Category</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Period Covered</th>
                            <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center' }}>Total Retention</th>
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
                                  {new Date(r.stagedAt || r.createdAt || Date.now()).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>
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
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {(() => {
                                    const baseYear = parseInt(r.inclusiveDates || '0');
                                    const ret = parseInt(String(r.totalRetention || '0'));
                                    const expiryYear = baseYear && ret ? baseYear + ret : null;
                                    return expiryYear ? `${expiryYear} (${ret} yrs)` : `${r.totalRetention || '-'} yrs`;
                                  })()}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '75%' }}>
                    Track the status of your submitted disposal requests, including pending, approved, and rejected.
                  </p>
                  <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <button
                      type="button"
                      onClick={() => setDisposalRequestFilter('All')}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', fontWeight: disposalRequestFilter === 'All' ? 700 : 500, background: disposalRequestFilter === 'All' ? 'var(--bg-primary)' : 'transparent', color: disposalRequestFilter === 'All' ? 'var(--color-primary)' : 'var(--text-secondary)', borderRadius: '6px', border: disposalRequestFilter === 'All' ? '1px solid var(--border-color)' : '1px solid transparent', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: disposalRequestFilter === 'All' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none' }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisposalRequestFilter('Pending')}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', fontWeight: disposalRequestFilter === 'Pending' ? 700 : 500, background: disposalRequestFilter === 'Pending' ? 'var(--bg-primary)' : 'transparent', color: disposalRequestFilter === 'Pending' ? 'var(--color-primary)' : 'var(--text-secondary)', borderRadius: '6px', border: disposalRequestFilter === 'Pending' ? '1px solid var(--border-color)' : '1px solid transparent', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: disposalRequestFilter === 'Pending' ? '0 2px 5px rgba(0,0,0,0.05)' : 'none' }}
                    >
                      Pending
                    </button>
                  </div>
                </div>

                {inventoryRequests.filter(r => r.requestType === 'Disposal' && (disposalRequestFilter === 'All' || r.status === 'pending')).length === 0 ? (
                  <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    No disposal requests found.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto' }}>
                    {inventoryRequests.filter(r => r.requestType === 'Disposal' && (disposalRequestFilter === 'All' || r.status === 'pending')).map((req) => (
                      <div
                        key={`req-disp-tab-${req.id}`}
                        onClick={() => setSelectedRequestDetails(req)}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: '10px',
                          padding: '1.25rem',
                          background: 'var(--bg-primary)',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.85rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
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

                        <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                            Target Records ({req.recordsSummary?.length || 0})
                          </div>
                          <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {(req.recordsSummary || []).map((s: any) => `${s.prdsGrds || s.itemNo ? `[${s.prdsGrds ? s.prdsGrds + ' ' : ''}${s.itemNo || ''}] `.trim() + ' ' : ''}${s.seriesTitle}`).join(', ')}
                          </div>
                          {(req.recordsSummary || []).some((s: any) => s.totalRetention) && (
                            <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {(req.recordsSummary || []).filter((s: any) => s.totalRetention).map((s: any, idx: number) => {
                                const baseYear = parseInt(s.inclusiveDates || '0');
                                const ret = parseInt(s.totalRetention || '0');
                                const expiryYear = baseYear && ret ? baseYear + ret : null;
                                return (
                                  <span key={`ret-d-${idx}`} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c', fontWeight: 600 }}>
                                    {s.seriesTitle}: {expiryYear ? `${expiryYear} (${ret} yrs)` : `${ret} yrs`}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          <strong>Reason provided:</strong> {req.reason}
                        </div>

                        {req.attachmentUrl && (
                          <div style={{ fontSize: '0.825rem', color: 'var(--color-primary)', fontWeight: 600, marginTop: '0.5rem' }}>
                            📎 Attached Proof: <a
                              href={req.attachmentUrl}
                              onClick={(e) => handleNativeFileAction(e, req.attachmentUrl, req.attachmentName)}
                              rel="noopener noreferrer"
                              style={{ textDecoration: 'underline', color: 'var(--color-primary)' }}
                            >
                              {req.attachmentName || 'View Attached Document'}
                            </a>
                          </div>
                        )}

                        {/* Admin Decision actions if pending & user is Admin/Dev */}
                        {req.status === 'pending' && hasFullDivisionAccess && (
                          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Admin Decision</div>
                            <input
                              type="text"
                              placeholder="Optional remarks or reason for decision..."
                              value={adminDecisionReason}
                              onChange={(e) => setAdminDecisionReason(e.target.value)}
                              style={{
                                padding: '0.55rem 0.75rem',
                                fontSize: '0.85rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                                outline: 'none',
                              }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={isProcessingAdminDecision}
                                onClick={() => handleAdminRejectRequest(req.id)}
                              >
                                ✕ Reject Request
                              </Button>
                              <Button
                                variant="success"
                                size="sm"
                                disabled={isProcessingAdminDecision}
                                onClick={() => handleAdminConfirmRequest(req.id)}
                              >
                                ✓ Accept Request
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      History of all record series disposal evaluations and disposed year periods.
                    </p>
                    <div style={{ display: 'flex', gap: '0.25rem', width: '280px', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      {(['Pending', 'Completed', 'Decline'] as const).map(status => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setHistoryStatusFilter(status)}
                          style={{
                            flex: 1,
                            padding: '0.35rem 0',
                            textAlign: 'center',
                            fontSize: '0.8rem',
                            fontWeight: historyStatusFilter === status ? 700 : 500,
                            background: historyStatusFilter === status ? 'var(--bg-primary)' : 'transparent',
                            color: historyStatusFilter === status ? 'var(--color-primary)' : 'var(--text-secondary)',
                            borderRadius: '6px',
                            border: historyStatusFilter === status ? '1px solid var(--border-color)' : '1px solid transparent',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: historyStatusFilter === status ? '0 2px 5px rgba(0,0,0,0.05)' : 'none'
                          }}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ width: '250px' }}>
                      <SearchBar
                        value={historySearchQuery}
                        onChange={(e) => setHistorySearchQuery(e.target.value)}
                        placeholder="Search logs..."
                      />
                    </div>
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
                    </div>
                  </div>
                </div>

                {(() => {
                  const filteredLogs = disposalOnlyLogs.filter((log) => {
                    // Default legacy logs without status to 'Completed'
                    const logStatus = log.status || 'Completed';
                    if (logStatus !== historyStatusFilter) return false;

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
                        No disposal history logs found for this status.
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {historyStatusFilter === 'Pending' && historySelectedIds.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowDisposalExportPreview(true)}
                          >
                            <MdPrint style={{ fontSize: '1rem', marginRight: '0.25rem' }} /> View & Print NAP Form 3
                          </Button>
                          {hasFullDivisionAccess && (
                            <>
                              <Button
                                variant="success"
                                size="sm"
                                loading={isUpdatingHistoryStatus}
                                onClick={() => handleUpdateHistoryStatus('Completed')}
                              >
                                Mark as Completed
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                loading={isUpdatingHistoryStatus}
                                onClick={() => handleUpdateHistoryStatus('Decline')}
                              >
                                Mark as Declined
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', maxHeight: '380px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
                              <th style={{ padding: '0.65rem 0.85rem', width: 'auto', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}>
                                  <input
                                    type="checkbox"
                                    checked={historySelectedIds.length > 0 && historySelectedIds.length === filteredLogs.length}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setHistorySelectedIds(filteredLogs.map(l => l.id));
                                      } else {
                                        setHistorySelectedIds([]);
                                      }
                                    }}
                                  />
                                  {canDeleteHistory && historySelectedIds.length > 0 && (
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem', height: 'auto', whiteSpace: 'nowrap' }}
                                      onClick={() => {
                                        setHistoryDeleteTarget('disposal');
                                        setShowBulkDeleteHistoryModal(true);
                                      }}
                                    >
                                      <MdDeleteSweep style={{ fontSize: '1rem', marginRight: '0.2rem' }} /> Delete ({historySelectedIds.length})
                                    </Button>
                                  )}
                                </div>
                              </th>
                              <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>Date & Time</th>
                              <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>Item No.</th>
                              <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, width: '20%' }}>Record Series</th>
                              <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, width: '25%' }}>Division</th>
                              <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, width: '15%' }}>Category</th>
                              <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>Period Covered</th>
                              <th style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>Total Retention</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredLogs.map((log) => (
                              <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={historySelectedIds.includes(log.id)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setHistorySelectedIds(prev => [...prev, log.id]);
                                      } else {
                                        setHistorySelectedIds(prev => prev.filter(id => id !== log.id));
                                      }
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 600 }}>
                                  {new Date(log.disposedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                                  {log.prdsGrds && log.itemNo ? (
                                    <div>
                                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)' }}>{log.prdsGrds}</div>
                                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-primary)' }}>{log.itemNo}</div>
                                    </div>
                                  ) : (
                                    log.prdsGrds || log.itemNo || '-'
                                  )}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem' }}>
                                  <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{cleanSeriesTitle(log.seriesTitle)}</div>
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                  {log.division || 'General'}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary)' }}>
                                  {log.classificationCategory || '-'}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>
                                  {log.inclusiveDates || log.disposedYears || '-'}
                                </td>
                                <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                  {(() => {
                                    const baseYear = parseInt(log.inclusiveDates || log.disposedYears || '0');
                                    const matchedRecord = records.find((r: any) => r.id === log.recordId || r.id === log.id);
                                    const ret = parseInt(log.totalRetention || matchedRecord?.totalRetention || '0');
                                    const expiryYear = baseYear && ret ? baseYear + ret : null;
                                    return expiryYear ? `${expiryYear} (${ret} yrs)` : ret ? `${ret} yrs` : '-';
                                  })()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
            localStorage.setItem(`annual_retention_notice_${currentYear}`, 'true');
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
                  localStorage.setItem(`annual_retention_notice_${currentYear}`, 'true');
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
                  Under <strong>NAP</strong> guidelines, several record series entries have completed their required active desk period or total retention lifecycle. <strong>Immediate action is required</strong> to transition or dispose of these records to maintain compliance and keep storage records up-to-date.
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
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>Inclusive Dates</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontWeight: 700, textAlign: 'center' }}>Active Limit</th>
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
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem' }}>{record.division || 'General'}</td>
                          <td style={{ padding: '0.75rem 0.85rem', color: 'var(--text-secondary)' }}>{record.classificationCategory || '-'}</td>
                          <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatDynamicDates(record.inclusiveDates)}
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 700, color: '#d97706' }}>
                            {record.activeDeskYrs} Year(s)
                          </td>
                          <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                              <Button
                                variant="primary"
                                style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem', background: '#d97706', borderColor: '#d97706' }}
                                onClick={() => setSingleStorageRecord(record)}
                              >
                                Evaluate & Move to Storage ➔
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
      {singleStorageRecord && (() => {
        const covered = extractCoveredYears(singleStorageRecord.inclusiveDates);
        const activeYearsRemaining = covered.years.filter(y => !customStorageYears.includes(y));
        const computedCustomDates = customStorageYears.length > 0
          ? formatYearsListToDatesString(activeYearsRemaining, covered.isOngoing)
          : 'N/A';
        const isCustomSelected = customStorageYears.length > 0;

        const currentYear = new Date().getFullYear();
        const activeDeskYrs = singleStorageRecord.activeDeskYrs || 0;
        const eligibleStorageYears = covered.years.filter(yr => (currentYear - yr) >= activeDeskYrs);

        return (
          <Modal
            isOpen={!!singleStorageRecord}
            onClose={() => {
              setSingleStorageRecord(null);
              setCustomStorageYears([]);
            }}
            title="Evaluate & Move to Storage"
            size="lg"
          >
            <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '1rem', borderRadius: '8px', fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                <strong>Confirm Storage Transition:</strong> You are about to move this record series from <strong>Active</strong> to <strong>Storage</strong> stage. This will start the storage retention countdown toward disposal eligibility.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem 1rem', background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Item No.</div>
                  <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                    {singleStorageRecord.prdsGrds && singleStorageRecord.itemNo
                      ? `${singleStorageRecord.prdsGrds} — ${singleStorageRecord.itemNo}`
                      : singleStorageRecord.prdsGrds || singleStorageRecord.itemNo || '-'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Record Series</div>
                  <div style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: '1.2rem' }}>{cleanSeriesTitle(singleStorageRecord.seriesTitle)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Division</div>
                  <div style={{ fontWeight: 500 }}>{singleStorageRecord.division || 'General'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Category</div>
                  <div style={{ fontWeight: 500 }}>{singleStorageRecord.classificationCategory || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Inclusive Dates</div>
                  <div style={{ fontWeight: 500 }}>{formatDynamicDates(singleStorageRecord.inclusiveDates)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Active Desk Period</div>
                  <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', padding: '0.2rem 0.55rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.8rem' }}>
                    {singleStorageRecord.activeDeskYrs} year(s) reached
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Total Retention</div>
                  <div style={{ fontWeight: 500 }}>{singleStorageRecord.totalRetention} year(s)</div>
                </div>
              </div>

              {/* Specific Year Storage Selector */}
              {eligibleStorageYears.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'var(--bg-primary)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    💡 Or Select Specific Year(s) to Storage:
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Click a year below to move it to Storage (e.g. moving 2024 from <code>2023 - 2026</code> leaves active dates as <code>2023, 2025 - 2026</code>):
                  </span>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {eligibleStorageYears.map((yr) => {
                      const isStored = storageLogs.some(log =>
                        (log.recordId === singleStorageRecord.id || log.id === singleStorageRecord.id) &&
                        String(log.disposedYears || log.inclusiveDates || '').includes(yr.toString())
                      );
                      const isStorageSelected = customStorageYears.includes(yr);

                      return (
                        <button
                          key={`yr-pill-storage-${yr}`}
                          type="button"
                          disabled={isStored}
                          title={isStored ? "Already Confirmed in Storage" : ""}
                          style={{
                            fontSize: '0.85rem',
                            padding: '0.45rem 0.85rem',
                            borderRadius: '6px',
                            border: isStored ? '1px solid #10b981' : (isStorageSelected ? '1px solid #d97706' : '1px solid var(--border-color)'),
                            background: isStored ? 'rgba(16, 185, 129, 0.05)' : (isStorageSelected ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-primary)'),
                            color: isStored ? '#059669' : (isStorageSelected ? '#b45309' : 'var(--text-primary)'),
                            fontWeight: 700,
                            cursor: isStored ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            boxShadow: isStorageSelected && !isStored ? '0 2px 4px rgba(245, 158, 11, 0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                            transition: 'all 0.2s ease',
                            opacity: isStored ? 0.8 : 1,
                          }}
                          onClick={() => {
                            if (!isStored) {
                              setCustomStorageYears((prev) =>
                                prev.includes(yr) ? prev.filter((y) => y !== yr) : [...prev, yr]
                              );
                            }
                          }}
                        >
                          {isStored ? '✅ ' : (isStorageSelected ? '📦 Storage ' : '📅 ')} {yr} ({currentYear - yr} yrs)
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isCustomSelected && (
                <p style={{ margin: 0, fontSize: '0.835rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  Moving year(s) <strong>{customStorageYears.sort().join(', ')}</strong> to Storage will update active inclusive dates to <strong>{computedCustomDates || 'None (Fully in Storage)'}</strong>.
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                <Button variant="secondary" onClick={() => {
                  setSingleStorageRecord(null);
                  setCustomStorageYears([]);
                }}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  style={{ background: '#d97706', borderColor: '#d97706' }}
                  onClick={() => {
                    const rec = singleStorageRecord;
                    setSingleStorageRecord(null);
                    setViewingRecord(null);

                    if (isCustomSelected) {
                      const yearRecords = customStorageYears.map((yr) => ({
                        ...rec,
                        id: `${rec.id}-yr-${yr}`,
                        inclusiveDates: String(yr),
                        seriesTitle: `${rec.seriesTitle} (${yr})`,
                      }));
                      openStorageRequestModal(yearRecords);
                    } else {
                      // If no custom years selected, send the whole record
                      openStorageRequestModal([rec]);
                    }
                    setCustomStorageYears([]);
                  }}
                >
                  <MdArchive style={{ marginRight: '0.3rem' }} /> {isCustomSelected ? 'Confirm Selected Years to Storage' : 'Confirm Move to Storage'}
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}




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
                __html: buildNapForm1ExcelHtml(activeDivisionRecords, divisionTab === 'ALL' ? undefined : divisionTab, napFormHeader)
              }}
              style={{ overflowX: 'auto', border: 'none', borderRadius: '4px' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button
                variant="primary"
                onClick={handleExportNapForm1}
                style={{ backgroundColor: '#107c41', borderColor: '#107c41' }}
              >
                <MdFileDownload style={{ marginRight: '0.35rem' }} /> Export to Excel
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
            {(() => {
              const activeDeskInfoRaw = getOngoingActiveDeskInfo(viewingRecord.inclusiveDates, Number(viewingRecord.activeDeskYrs), viewingRecord.retentionStage);
              let activeDeskInfo = null;
              if (activeDeskInfoRaw) {
                const covered = extractCoveredYears(viewingRecord.inclusiveDates);
                const eligibleYrs = covered.years.filter(yr => (new Date().getFullYear() - yr) >= Number(viewingRecord.activeDeskYrs));
                const hasUnstored = eligibleYrs.some(yr => {
                  return !storageLogs.some(log => (log.recordId === viewingRecord.id || log.id === viewingRecord.id) && String(log.disposedYears || log.inclusiveDates || '').includes(yr.toString()));
                });
                if (hasUnstored) activeDeskInfo = activeDeskInfoRaw;
              }

              if (activeDeskInfo !== null) {
                return (
                  <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', padding: '0.85rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      ⚠️ Active desk period ({viewingRecord.activeDeskYrs} yrs) has been reached!
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button variant="primary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', background: '#d97706', borderColor: '#d97706' }} onClick={() => { const rec = viewingRecord; setViewingRecord(null); setSingleStorageRecord(rec); }}>
                        Evaluate & Move to Storage ➔
                      </Button>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Disposal Alert inside viewing modal */}
            {(() => {
              const disposalInfo = getOngoingDisposalInfo(viewingRecord.inclusiveDates, Number(viewingRecord.totalRetention), viewingRecord.retentionStage, viewingRecord.frequencyOfUse, Number(viewingRecord.storageYrs));

              if (disposalInfo !== null) {
                return (
                  <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', padding: '0.85rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.85rem', color: '#dc2626', fontWeight: 600 }}>
                      ⚠️ Retention period ({disposalInfo.totalRetention} yrs) reached in Storage! Eligible for disposal.
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button variant="primary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', background: '#dc2626', borderColor: '#dc2626' }} onClick={() => { const rec = viewingRecord; setViewingRecord(null); setEvaluatingRecord({ record: rec, info: disposalInfo }); }}>
                        Evaluate & Dispose ➔
                      </Button>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

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

      {showPreviewModal && (
        <Modal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          title={`Preview ${previewType} Request Form`}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', background: 'var(--surface-color)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>Prepared by (Name)</label>
                <input
                  type="text"
                  value={preparedByName}
                  onChange={(e) => setPreparedByName(e.target.value)}
                  placeholder="e.g. Juan Dela Cruz"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 600 }}>Position</label>
                <input
                  type="text"
                  value={preparedByPosition}
                  onChange={(e) => setPreparedByPosition(e.target.value)}
                  placeholder="e.g. Administrative Officer II"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>

            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', height: '600px', background: '#e5e7eb' }}>
              <iframe
                id="preview-iframe"
                srcDoc={generatePreviewHtml(previewType === 'Storage' ? stagedStorageRecords : stagedDisposalRecords, previewType, preparedByName, preparedByPosition)}
                style={{ width: '100%', height: '100%', border: 'none', background: 'white' }}
                title="Form Preview"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button
                variant="primary"
                onClick={() => handleExportAuthorityForm(previewType === 'Storage' ? stagedStorageRecords : stagedDisposalRecords, previewType, preparedByName, preparedByPosition)}
                style={{ backgroundColor: '#107c41', borderColor: '#107c41', display: 'flex', alignItems: 'center' }}
              >
                <MdFileDownload style={{ marginRight: '6px', fontSize: '1.1rem' }} /> Export Request (Excel)
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
        allowedDivisions={allowedDivisions}
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
              You are about to delete <strong>"{deletingRecord.seriesTitle}"</strong>. This action will submit a deletion request to the Super Admin for approval in the Requests & Approvals tab.
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
              This action will submit a bulk deletion request to the Super Admin for approval in the Requests & Approvals tab.
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
          size="xl"
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    onClick={() => setSelectedRequestDetails(req)}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '1.25rem',
                      background: 'var(--bg-primary)',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
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
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span>Requested by {req.requesterName}</span>
                          {req.status === 'approved' && req.approvedByName && (
                            <>
                              <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>•</span>
                              <span>Approved by {req.approvedByName}</span>
                            </>
                          )}
                          {req.status === 'rejected' && req.approvedByName && (
                            <>
                              <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>•</span>
                              <span>Rejected by {req.approvedByName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {new Date(req.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
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
                        📎 Attached Proof: <a
                          href={req.attachmentUrl}
                          onClick={(e) => handleNativeFileAction(e, req.attachmentUrl, req.attachmentName)}
                          rel="noopener noreferrer"
                          style={{ textDecoration: 'underline', color: 'var(--color-primary)' }}
                        >
                          {req.attachmentName || 'View Attached Document'}
                        </a>
                      </div>
                    )}

                    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Admin Decision</div>
                      <input
                        type="text"
                        placeholder="Optional remarks or reason for decision..."
                        value={adminDecisionReason}
                        onChange={(e) => setAdminDecisionReason(e.target.value)}
                        style={{
                          padding: '0.55rem 0.75rem',
                          fontSize: '0.85rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                          outline: 'none',
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={isProcessingAdminDecision}
                          onClick={() => handleAdminRejectRequest(req.id)}
                        >
                          ✕ Reject Request
                        </Button>
                        <Button
                          variant="success"
                          size="sm"
                          disabled={isProcessingAdminDecision}
                          onClick={() => handleAdminConfirmRequest(req.id)}
                        >
                          ✓ Accept Request
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', padding: '1rem 0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', background: 'linear-gradient(145deg, var(--bg-secondary) 0%, var(--bg-primary) 100%)', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Request Reference</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--color-primary)', fontFamily: 'monospace' }}>{selectedRequestDetails.id}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span>Requested by <strong style={{ fontWeight: 800 }}>{selectedRequestDetails.requesterName}</strong></span>
                  {selectedRequestDetails.status === 'approved' && selectedRequestDetails.approvedByName && (
                    <>
                      <span style={{ color: 'var(--text-secondary)' }}>•</span>
                      <span>Approved by <strong style={{ fontWeight: 800 }}>{selectedRequestDetails.approvedByName}</strong></span>
                    </>
                  )}
                  {selectedRequestDetails.status === 'rejected' && selectedRequestDetails.approvedByName && (
                    <>
                      <span style={{ color: 'var(--text-secondary)' }}>•</span>
                      <span>Rejected by <strong style={{ fontWeight: 800 }}>{selectedRequestDetails.approvedByName}</strong></span>
                    </>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                <span
                  style={{
                    padding: '0.4rem 1rem',
                    borderRadius: '99px',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    background: selectedRequestDetails.status === 'approved' ? 'rgba(16, 185, 129, 0.15)' : selectedRequestDetails.status === 'rejected' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: selectedRequestDetails.status === 'approved' ? '#059669' : selectedRequestDetails.status === 'rejected' ? '#dc2626' : '#d97706',
                    border: selectedRequestDetails.status === 'approved' ? '1px solid rgba(16, 185, 129, 0.3)' : selectedRequestDetails.status === 'rejected' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
                  }}
                >
                  {selectedRequestDetails.status === 'approved' ? '✓ Approved' : selectedRequestDetails.status === 'rejected' ? '✕ Rejected' : '⏳ Pending Confirmation'}
                </span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Submitted on {new Date(selectedRequestDetails.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '4px', height: '14px', background: 'var(--color-primary)', borderRadius: '4px' }}></div>
                Target Record Series ({selectedRequestDetails.recordsSummary?.length || selectedRequestDetails.recordIds?.length || 0})
              </div>
              <div style={{ borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', background: 'var(--bg-primary)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.02em' }}>Date & Time</th>
                      <th style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.02em' }}>Item No.</th>
                      <th style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.02em' }}>Record Series</th>
                      <th style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.02em' }}>Division</th>
                      <th style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.02em' }}>Category</th>
                      <th style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.02em', textAlign: 'center' }}>
                        {selectedRequestDetails.requestType === 'Storage' ? 'Storage Year' : 'Period Covered'}
                      </th>
                      <th style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.02em', textAlign: 'center' }}>
                        Retention Year
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedRequestDetails.recordsSummary || []).length > 0 ? (
                      selectedRequestDetails.recordsSummary.map((item: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s ease', cursor: 'default' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {new Date(selectedRequestDetails.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 800, color: 'var(--color-primary)' }}>
                            {item.prdsGrds && item.itemNo ? (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(59, 130, 246, 0.05)', padding: '0.25rem 0.5rem', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)' }}>{item.prdsGrds}</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--color-primary)' }}>{item.itemNo}</div>
                              </div>
                            ) : (
                              item.prdsGrds || item.itemNo || '-'
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {cleanSeriesTitle(item.seriesTitle)}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {item.division || 'General'}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>
                            <span style={{ display: 'inline-block', background: 'var(--bg-secondary)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid var(--border-color)', lineHeight: '1.4', textAlign: 'center' }}>
                              {item.classificationCategory || item.category || records.find((rec) => rec.id === item.id || (item.id && item.id.startsWith(`${rec.id}-`)))?.classificationCategory || '-'}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 800, color: selectedRequestDetails.requestType === 'Storage' ? '#d97706' : '#dc2626' }}>
                            {item.inclusiveDates || 'N/A'}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {(() => {
                              const matchedRec = records.find((rec) => rec.id === item.id || (item.id && item.id.startsWith(`${rec.id}-`)) || rec.id === item.recordId);
                              const ret = parseInt(item.totalRetention || matchedRec?.totalRetention || '0');
                              return ret > 1 ? `${ret} years` : ret === 1 ? `1 year` : 'N/A';
                            })()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      (selectedRequestDetails.recordIds || []).map((id: string, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {new Date(selectedRequestDetails.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)' }}>-</td>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--color-primary)' }}>Record Entry {id}</td>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>General</td>
                          <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>-</td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700, color: selectedRequestDetails.requestType === 'Storage' ? '#d97706' : '#dc2626' }}>N/A</td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>N/A</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', borderLeft: '4px solid var(--color-primary)', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Reason Provided</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{selectedRequestDetails.reason}</div>
            </div>

            {selectedRequestDetails.attachmentUrl && (
              <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 10px rgba(59, 130, 246, 0.05)' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attached Authorization / Proof</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    📎 {selectedRequestDetails.attachmentName || 'Proof Document'}
                  </div>
                </div>
                <a
                  href={selectedRequestDetails.attachmentUrl}
                  onClick={(e) => handleNativeFileAction(e, selectedRequestDetails.attachmentUrl, selectedRequestDetails.attachmentName)}
                  rel="noopener noreferrer"
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    textDecoration: 'none',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  View File ↗
                </a>
              </div>
            )}

            {selectedRequestDetails.adminReason && (
              <div style={{ background: selectedRequestDetails.status === 'approved' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)', padding: '1.25rem 1.5rem', borderRadius: '12px', border: selectedRequestDetails.status === 'approved' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)', borderLeft: selectedRequestDetails.status === 'approved' ? '4px solid #10b981' : '4px solid #ef4444', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: selectedRequestDetails.status === 'approved' ? '#059669' : '#dc2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Admin Remarks
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginTop: '0.5rem', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                  {selectedRequestDetails.adminReason}
                </div>
              </div>
            )}
            {selectedRequestDetails.status === 'pending' && hasFullDivisionAccess && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', background: 'var(--bg-secondary)', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', borderLeft: '4px solid #d97706', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin Decision</div>
                <input
                  type="text"
                  placeholder="Optional remarks or reason for decision..."
                  value={adminDecisionReason}
                  onChange={(e) => setAdminDecisionReason(e.target.value)}
                  style={{
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                    outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <Button
                    variant="danger"
                    disabled={isProcessingAdminDecision}
                    onClick={async () => {
                      await handleAdminRejectRequest(selectedRequestDetails.id);
                      setSelectedRequestDetails(null);
                    }}
                  >
                    ✕ Reject Request
                  </Button>
                  <Button
                    variant="success"
                    disabled={isProcessingAdminDecision}
                    onClick={async () => {
                      await handleAdminConfirmRequest(selectedRequestDetails.id);
                      setSelectedRequestDetails(null);
                    }}
                  >
                    ✓ Accept Request
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {viewerOpen && (
        <Modal
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <span>{viewerTitle}</span>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  const urlToDownload = viewerSrc.split('#')[0];
                  if ((window as any).electron?.saveFileNatively) {
                    await (window as any).electron.saveFileNatively(urlToDownload, viewerTitle || 'document.pdf');
                  } else {
                    const a = document.createElement('a');
                    a.href = urlToDownload;
                    a.download = viewerTitle || 'document.pdf';
                    a.click();
                  }
                }}
              >
                <MdFileDownload style={{ marginRight: '0.4rem', fontSize: '1.1rem' }} /> Download PDF
              </Button>
            </div>
          }
          size="xl"
          isMaximized={isViewerMaximized}
        >
          <div style={{ height: isViewerMaximized ? 'calc(100vh - 120px)' : '70vh', width: '100%', position: 'relative' }}>
            <iframe
              src={viewerSrc}
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: '4px' }}
              title="Document Viewer"
            />
          </div>
        </Modal>
      )}
      {showDisposalExportPreview && (
        <Modal
          isOpen={showDisposalExportPreview}
          onClose={() => setShowDisposalExportPreview(false)}
          title="Preview Disposal Export"
          size="lg"
          footer={
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem', alignItems: 'center', width: '100%' }}>
              <Button variant="secondary" onClick={() => setShowDisposalExportPreview(false)}>Cancel</Button>
              <Button variant="primary" onClick={async () => {
                const selectedLogs = disposalOnlyLogs.filter(l => historySelectedIds.includes(l.id));
                const payload = processDisposalRecordsForExport(selectedLogs, records);
                try {
                  await generateDisposalWord(payload, disposalVolumeInput, disposalTelephoneInput);
                  showToast('Exported successfully to DOCX', 'success');
                  setShowDisposalExportPreview(false);
                } catch (err: any) {
                  console.error('DOCX Export Error:', err);
                  let msg = err?.message || 'Unknown error occurred during export.';

                  // Extract detailed docxtemplater errors if it's a Multi error
                  if (err.properties && err.properties.errors instanceof Array) {
                    const errorMessages = err.properties.errors.map((e: any) => e.properties?.explanation || e.message).join(', ');
                    msg = `Template Error: ${errorMessages}`;
                  }

                  showToast(`Export Failed: ${msg}`, 'error');
                }
              }}>
                <MdFileDownload style={{ fontSize: '1.1rem', marginRight: '0.4rem' }} /> Export to DOCX
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Volume in Cubic Meter:</label>
                <input
                  type="text"
                  placeholder="e.g. 52 Sacks"
                  value={disposalVolumeInput}
                  onChange={(e) => setDisposalVolumeInput(e.target.value)}
                  style={{
                    padding: '0.6rem 0.8rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    width: '100%'
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Telephone Number:</label>
                <input
                  type="text"
                  placeholder="e.g. (075) 656-3796"
                  value={disposalTelephoneInput}
                  onChange={(e) => setDisposalTelephoneInput(e.target.value)}
                  style={{
                    padding: '0.6rem 0.8rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    width: '100%'
                  }}
                />
              </div>
            </div>

            <div style={{ height: '70vh', width: '100%', position: 'relative' }}>
              <iframe
                src={`data:text/html;charset=utf-8,${encodeURIComponent(generateNapForm3PreviewHtml(
                  processDisposalRecordsForExport(disposalOnlyLogs.filter(l => historySelectedIds.includes(l.id)), records),
                  disposalTelephoneInput,
                  disposalVolumeInput
                ))}`}
                style={{ width: '100%', height: '100%', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'white' }}
                title="NAP Form 3 Preview"
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Delete History Modal */}
      {showBulkDeleteHistoryModal && (
        <Modal
          isOpen={showBulkDeleteHistoryModal}
          onClose={() => !isDeletingHistoryLogs && setShowBulkDeleteHistoryModal(false)}
          title="Confirm Bulk Delete History"
        >
          <div style={{ padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#ef4444' }}>
              <MdWarning style={{ fontSize: '1.75rem', flexShrink: 0 }} />
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                Are you sure you want to delete {historyDeleteTarget === 'storage' ? storageHistorySelectedIds.length : historySelectedIds.length} selected history logs?
              </div>
            </div>

            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              This action will revert the original records back to their previous stage. This action cannot be undone.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button
                variant="secondary"
                onClick={() => setShowBulkDeleteHistoryModal(false)}
                disabled={isDeletingHistoryLogs}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmBulkDeleteHistory}
                loading={isDeletingHistoryLogs}
              >
                Confirm Delete ({(historyDeleteTarget === 'storage' ? storageHistorySelectedIds : historySelectedIds).length})
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default InventoryAppraisal;
