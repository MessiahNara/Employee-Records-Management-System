import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createAuditLog, getEmployeeName } from '../utils/auditHelper';
import { checkAndAddDropdownOptions } from '../utils/dropdownOptionsHelper';
import { requireSuperadminApproval } from '../middleware/superadminApproval';
import { uploadDocumentFile } from '../middleware/upload';
import { getIO } from '../socket';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';

const router = Router();
const execFilePromise = util.promisify(execFile);

function findGhostscriptExecutable(): string {
  if (process.env.GHOSTSCRIPT_PATH && fs.existsSync(process.env.GHOSTSCRIPT_PATH)) {
    return process.env.GHOSTSCRIPT_PATH;
  }

  const bases = ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs'];
  for (const base of bases) {
    if (fs.existsSync(base)) {
      try {
        const dirs = fs.readdirSync(base).sort().reverse();
        for (const dir of dirs) {
          const bin64 = path.join(base, dir, 'bin', 'gswin64c.exe');
          if (fs.existsSync(bin64)) return bin64;
          const bin32 = path.join(base, dir, 'bin', 'gswin32c.exe');
          if (fs.existsSync(bin32)) return bin32;
        }
      } catch (_) {}
    }
  }

  const commonLocations = [
    'C:\\Program Files\\gs\\gs10.03.0\\bin\\gswin64c.exe',
    'C:\\Program Files\\gs\\gs10.02.1\\bin\\gswin64c.exe',
    'C:\\Program Files\\gs\\gs10.02.0\\bin\\gswin64c.exe',
    'C:\\Program Files\\gs\\gs10.01.2\\bin\\gswin64c.exe',
    'C:\\Program Files\\gs\\gs10.01.1\\bin\\gswin64c.exe',
    'C:\\Program Files\\gs\\gs10.00.0\\bin\\gswin64c.exe',
    'C:\\Program Files\\gs\\gs9.56.1\\bin\\gswin64c.exe',
    'C:\\Program Files\\gs\\gs9.55.0\\bin\\gswin64c.exe',
  ];

  for (const loc of commonLocations) {
    if (fs.existsSync(loc)) return loc;
  }

  return 'gswin64c.exe';
}

async function compressPDF(inputPath: string, level: string = 'recommended'): Promise<string | null> {
  if (!inputPath.toLowerCase().endsWith('.pdf')) return null;
  
  const outputPath = inputPath.replace(/\.pdf$/i, `_compressed_${Date.now()}.pdf`);
  const gsPath = findGhostscriptExecutable();
  
  let args: string[] = [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.4',
    '-dNOPAUSE',
    '-dQUIET',
    '-dBATCH',
  ];

  if (level === 'extreme') {
    args.push(
      '-dPDFSETTINGS=/screen',
      '-dColorImageDownsampleThreshold=1.0',
      '-dColorImageResolution=72',
      '-dGrayImageDownsampleThreshold=1.0',
      '-dGrayImageResolution=72',
      '-dMonoImageDownsampleThreshold=1.0',
      '-dMonoImageResolution=150'
    );
  } else if (level === 'less') {
    args.push(
      '-dPDFSETTINGS=/printer',
      '-dColorImageDownsampleThreshold=1.0',
      '-dColorImageResolution=200',
      '-dGrayImageDownsampleThreshold=1.0',
      '-dGrayImageResolution=200',
      '-dMonoImageDownsampleThreshold=1.0',
      '-dMonoImageResolution=300'
    );
  } else {
    // recommended default
    args.push(
      '-dPDFSETTINGS=/ebook',
      '-dColorImageDownsampleThreshold=1.0',
      '-dColorImageResolution=120',
      '-dGrayImageDownsampleThreshold=1.0',
      '-dGrayImageResolution=120',
      '-dMonoImageDownsampleThreshold=1.0',
      '-dMonoImageResolution=200'
    );
  }

  args.push(`-sOutputFile=${outputPath}`, inputPath);
  
  try {
    console.log(`[Ghostscript] Executing: "${gsPath}" with level ${level}`);
    await execFilePromise(gsPath, args);
    
    if (fs.existsSync(outputPath)) {
      const inputStats = fs.statSync(inputPath);
      const outputStats = fs.statSync(outputPath);
      
      console.log(`[Ghostscript] Input size: ${inputStats.size} bytes | Output size: ${outputStats.size} bytes`);
      
      if (outputStats.size < inputStats.size && outputStats.size > 0) {
        return outputPath;
      } else {
        console.log('[Ghostscript] Compression did not reduce file size. Retaining original.');
        try { fs.unlinkSync(outputPath); } catch (_) {}
        return null;
      }
    }
  } catch (err: any) {
    console.error('[Ghostscript] Error compressing PDF:', err?.message || err);
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch (_) {}
    }
  }
  return null;
}

const toNullableDate = (value: any): Date | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'string' && value.trim().toLowerCase() === 'until revoked') {
    return new Date('9999-12-31T00:00:00.000Z');
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Get all documents
router.get('/', async (req: Request, res: Response) => {
  try {
    const { employeeId, category, fromDate, toDate } = req.query;

    const where: any = {};
    if (employeeId) where.employeeId = employeeId as string;
    if (category) where.category = category as string;

    // Add date range filter if provided
    if (fromDate || toDate) {
      where.createdAt = {};
      
      if (fromDate) {
        // Parse DD/MM/YYYY format and set to start of day
        const [day, month, year] = (fromDate as string).split('/');
        const startDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        startDate.setHours(0, 0, 0, 0);
        where.createdAt.gte = startDate;
      }
      
      if (toDate) {
        // Parse DD/MM/YYYY format and set to end of day
        const [day, month, year] = (toDate as string).split('/');
        const endDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    const documents = await prisma.document.findMany({
      where,
      include: {
        employee: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Get document by ID

// Base provincial offices with their canonical abbreviations and defaults
const BASE_OFFICES: { abbr: string; name: string; type: 'Department' | 'Hospital'; aliases?: string[] }[] = [
  { abbr: 'Accounting', name: 'Provincial Accounting Office', type: 'Department' },
  { abbr: 'Agriculture', name: 'Provincial Agriculture Office', type: 'Department' },
  { abbr: 'Archives', name: 'Provincial Archives and Records Center', type: 'Department' },
  { abbr: 'Assessor', name: 'Provincial Assessment Office', type: 'Department' },
  { abbr: 'BAC', name: 'Bids and Awards Committee', type: 'Department' },
  { abbr: 'BM Staff', name: 'Office of the Board Members Staff', type: 'Department' },
  { abbr: 'Board Members', name: 'Office of the Sangguniang Panlalawigan Members', type: 'Department' },
  { abbr: 'Board Secretary', name: 'Office of the Provincial Board Secretary', type: 'Department' },
  { abbr: 'Budget', name: 'Provincial Budget Office', type: 'Department' },
  { abbr: 'Capitol Resort', name: 'Capitol Resort Hotel', type: 'Department', aliases: ['CRH'] },
  { abbr: 'CRHOD', name: 'Capitol Resort Hotel Operations Division', type: 'Department' },
  { abbr: 'COA', name: 'Commission on Audit', type: 'Department' },
  { abbr: 'CSC', name: 'Civil Service Commission', type: 'Department' },
  { abbr: 'Engineering', name: 'Provincial Engineering Office', type: 'Department' },
  {
    abbr: 'GSO',
    name: 'General Services Office',
    type: 'Department',
    aliases: [
      'General Services Office - BPSSD Security Services',
      'General Services Office - BPSSD Utility Services',
      'General Services Office - Narciso Ramos Sports & Civic Center',
    ],
  },
  { abbr: 'Housing', name: 'Provincial Human Settlements and Urban Development Authority', type: 'Department' },
  { abbr: 'HRMDO', name: 'Human Resource Management and Development Office', type: 'Department' },
  { abbr: 'IAD', name: 'Internal Audit Division', type: 'Department' },
  { abbr: 'Jail', name: 'Pangasinan Provincial Jail', type: 'Department' },
  { abbr: 'Legal', name: 'Provincial Legal Office', type: 'Department' },
  { abbr: 'Library', name: 'Pangasinan Provincial Library', type: 'Department' },
  { abbr: 'MISO', name: 'Management Information Service Office', type: 'Department' },
  { abbr: 'PDRRMO', name: 'Provincial Disaster Risk Reduction and Management Office', type: 'Department' },
  { abbr: 'PEDIPO', name: 'Provincial Economic Development and Investment Promotion Office', type: 'Department' },
  { abbr: 'PENRO', name: 'Provincial Government - Environment and Natural Resources Office', type: 'Department' },
  { abbr: 'PESO', name: 'Public Employment Services Office', type: 'Department' },
  {
    abbr: 'PGO',
    name: 'Provincial Governor\'s Office',
    type: 'Department',
    aliases: [
      'PGO Archive',
      'Special Events',
      'Task Force Kalikasan',
      'Health and Wellness',
      'Provincial Prosecutor Office',
    ],
  },
  { abbr: 'PHMSO', name: 'Provincial Hospital Management Services Office', type: 'Department' },
  { abbr: 'PHO', name: 'Provincial Health Office', type: 'Department' },
  { abbr: 'PIMRO', name: 'Pangasinan Information and Media Relations Office', type: 'Department' },
  { abbr: 'PPC', name: 'Pangasinan Polytechnic College', type: 'Department' },
  { abbr: 'PPCLDO', name: 'Provincial Population Cooperative and Livelihood Development Office', type: 'Department' },
  { abbr: 'PPDO', name: 'Provincial Planning and Development Office', type: 'Department' },
  { abbr: 'PSWDO', name: 'Provincial Social Welfare and Development Office', type: 'Department' },
  { abbr: 'PRC', name: 'Pangasinan Reformation Center', type: 'Department', aliases: ['Reformation'] },
  { abbr: 'TESDA', name: 'Technical Education and Skills Development Authority', type: 'Department' },
  { abbr: 'Tourism', name: 'Provincial Tourism and Cultural Affairs Office', type: 'Department' },
  { abbr: 'Treasury', name: 'Provincial Treasury Office', type: 'Department' },
  { abbr: 'Veterinary', name: 'Provincial Veterinary Office', type: 'Department' },
  { abbr: 'Vice Gov', name: 'Provincial Vice Governor\'s Office', type: 'Department' },
  { abbr: 'Alaminos', name: 'Western Pangasinan District Hospital', type: 'Hospital' },
  { abbr: 'Asingan', name: 'Asingan Community Hospital', type: 'Hospital' },
  { abbr: 'Bayambang', name: 'Bayambang District Hospital', type: 'Hospital' },
  { abbr: 'Bolinao', name: 'Bolinao Community Hospital', type: 'Hospital' },
  { abbr: 'Dasol', name: 'Dasol Community Hospital', type: 'Hospital' },
  { abbr: 'Lingayen', name: 'Lingayen District Hospital', type: 'Hospital' },
  { abbr: 'Manaoag', name: 'Manaoag Community Hospital', type: 'Hospital' },
  { abbr: 'Mangatarem', name: 'Mangatarem District Hospital', type: 'Hospital' },
  { abbr: 'Mapandan', name: 'Mapandan Community Hospital', type: 'Hospital' },
  { abbr: 'Pozorrubio', name: 'Pozorrubio Community Hospital', type: 'Hospital', aliases: ['Pozzorrubio'] },
  { abbr: 'PPH San Carlos', name: 'Pangasinan Provincial Hospital', type: 'Hospital' },
  { abbr: 'Tayug', name: 'Eastern Pangasinan District Hospital', type: 'Hospital' },
  { abbr: 'Umingan', name: 'Umingan Community Hospital', type: 'Hospital' },
  { abbr: 'Urdaneta', name: 'Urdaneta District Hospital', type: 'Hospital' },
];

function parseOfficeEntry(entry: string): { abbreviation: string; fullName: string } {
  if (entry.includes(' - ')) {
    const parts = entry.split(' - ');
    return {
      abbreviation: parts[0].trim(),
      fullName: parts.slice(1).join(' - ').trim(),
    };
  }
  return {
    abbreviation: '',
    fullName: entry.trim(),
  };
}

interface DynamicOfficeDef {
  abbr: string;
  name: string;
  type: 'Department' | 'Hospital';
  names: Set<string>;
  pattern?: RegExp;
}

function buildDynamicOfficeMap(settingsOfficeNames: string[] = []): {
  defs: DynamicOfficeDef[];
  matchOffice: (name: string) => string | null;
} {
  const map = new Map<string, DynamicOfficeDef>();

  // 1. Seed with BASE_OFFICES
  for (const base of BASE_OFFICES) {
    const def: DynamicOfficeDef = {
      abbr: base.abbr,
      name: base.name,
      names: new Set([base.name, base.abbr]),
      type: base.type,
      pattern: base.abbr === 'BM Staff' ? /^Office of BM /i : undefined,
    };
    if (base.aliases) {
      base.aliases.forEach((a) => def.names.add(a));
    }
    map.set(base.abbr.toLowerCase(), def);
  }

  // 2. Incorporate dynamic entries from Settings
  for (const entry of settingsOfficeNames) {
    const trimmed = (entry || '').trim();
    if (!trimmed) continue;

    const { abbreviation, fullName } = parseOfficeEntry(trimmed);

    // Only process if it has an acronym/abbreviation OR matches an existing base office
    if (abbreviation) {
      const key = abbreviation.toLowerCase();
      const isHospital =
        fullName.toLowerCase().includes('hospital') ||
        abbreviation.toLowerCase().includes('hospital');

      let def = map.get(key);
      if (!def) {
        // Brand new dynamic office or hospital added by user with acronym!
        def = {
          abbr: abbreviation,
          name: fullName,
          names: new Set<string>(),
          type: isHospital ? 'Hospital' : 'Department',
        };
        map.set(key, def);
      }
      def.names.add(fullName);
      def.names.add(trimmed);
      def.names.add(abbreviation);
    } else {
      // Entry has no acronym prefix. Check if it matches any base office name or alias
      for (const def of map.values()) {
        for (const existingName of def.names) {
          if (existingName.toLowerCase() === trimmed.toLowerCase()) {
            def.names.add(trimmed);
            break;
          }
        }
      }
    }
  }

  // Sort definitions: Departments first (alphabetical by abbr), then Hospitals (alphabetical by abbr)
  const defsList = Array.from(map.values()).sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'Department' ? -1 : 1;
    }
    return a.abbr.localeCompare(b.abbr);
  });

  // Matcher function
  const matchOffice = (officeName: string): string | null => {
    if (!officeName) return null;
    const clean = officeName.trim();
    const lower = clean.toLowerCase();

    // 1. Exact case-sensitive match against known names
    for (const def of defsList) {
      if (def.names.has(clean)) return def.abbr;
    }

    // 2. Pattern match (e.g. BM Staff)
    for (const def of defsList) {
      if (def.pattern && def.pattern.test(clean)) return def.abbr;
    }

    // 3. Case-insensitive match against known names
    for (const def of defsList) {
      for (const name of def.names) {
        if (name.toLowerCase() === lower) return def.abbr;
      }
    }

    // 4. If clean has " - ", parse and match abbreviation or fullName
    if (clean.includes(' - ')) {
      const parsed = parseOfficeEntry(clean);
      if (parsed.abbreviation && map.has(parsed.abbreviation.toLowerCase())) {
        return map.get(parsed.abbreviation.toLowerCase())!.abbr;
      }
      for (const def of defsList) {
        for (const name of def.names) {
          if (name.toLowerCase() === parsed.fullName.toLowerCase()) return def.abbr;
        }
      }
    }

    // 5. Check if clean itself matches any abbreviation directly
    if (map.has(lower)) {
      return map.get(lower)!.abbr;
    }

    return null;
  };

  return { defs: defsList, matchOffice };
}

function getAppointmentMatrixCategory(status: string): 'regular' | 'casual' | 'jobOrder' | 'consultant' {
  const s = (status || '').trim().toLowerCase();
  if (['permanent', 'elective', 'co-terminous', 'coterminous', 'temporary'].includes(s)) return 'regular';
  if (s === 'casual') return 'casual';
  if (s === 'job order' || s === 'joborder') return 'jobOrder';
  return 'consultant';
}

// Get Office and Hospital Scanning Status Matrix
router.get('/scanning-status/office-matrix', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo } = req.query;

    // Optional date filter for documents
    const docDateFilter: any = {};
    if (dateFrom || dateTo) {
      docDateFilter.createdAt = {};
      if (dateFrom) docDateFilter.createdAt.gte = new Date(String(dateFrom));
      if (dateTo) {
        const to = new Date(String(dateTo));
        to.setHours(23, 59, 59, 999);
        docDateFilter.createdAt.lte = to;
      }
    }

    // 1. Employee counts per office and appointment status (ACTIVE ONLY)
    const empCounts = await prisma.employee.findMany({
      where: {
        status: 'Active',
      },
      select: {
        id: true,
        officeName: true,
        appointmentStatus: true,
      },
    });

    // Fetch system settings to dynamically resolve all offices & hospitals
    const settings = await prisma.systemSetting.findFirst({
      select: { officeNames: true },
    });
    const settingsOfficeNames = (settings?.officeNames as string[]) || [];
    const { defs, matchOffice } = buildDynamicOfficeMap(settingsOfficeNames);

    // Initialize rows for all offices dynamically
    const rows = defs.map((def) => ({
      abbreviation: def.abbr,
      name: def.name,
      type: def.type,
      employees: { regular: 0, casual: 0, jobOrder: 0, consultant: 0, total: 0 },
      pdf: { regular: 0, casual: 0, jobOrder: 0, consultant: 0, total: 0 },
      file201: { regular: 0, casual: 0, jobOrder: 0, consultant: 0, total: 0 },
      overall: '-',
      remarks: '',
    }));

    const rowsMap = new Map(rows.map((r) => [r.abbreviation, r]));

    // Populate employee counts
    empCounts.forEach((item) => {
      const abbr = matchOffice(item.officeName);
      if (abbr && rowsMap.has(abbr)) {
        const row = rowsMap.get(abbr)!;
        const cat = getAppointmentMatrixCategory(item.appointmentStatus);
        row.employees[cat]++;
        row.employees.total++;
      }
    });

    // Helper to query yearly counts for a category filter
    const countYearly = async (categoryWhere: any, targetField: 'pdf' | 'file201') => {
      const docs = await prisma.document.findMany({
        where: {
          ...categoryWhere,
          ...docDateFilter,
          employee: {
            status: 'Active',
          },
        },
        select: {
          employeeId: true,
          createdAt: true,
          employee: {
            select: {
              officeName: true,
              appointmentStatus: true,
            },
          },
        },
      });

      // Group by unique (employeeId, year)
      const seen = new Set<string>();

      docs.forEach((doc) => {
        const abbr = matchOffice(doc.employee.officeName);
        if (!abbr || !rowsMap.has(abbr)) return;

        const cat = getAppointmentMatrixCategory(doc.employee.appointmentStatus);
        const year = new Date(doc.createdAt).getFullYear();
        const key = `${doc.employeeId}_${year}`;

        if (!seen.has(key)) {
          seen.add(key);
          const row = rowsMap.get(abbr)!;
          row[targetField][cat]++;
          row[targetField].total++;
        }
      });
    };

    // 2. PDF count: employees with 'Position / Job Description' documents (yearly)
    await countYearly({ category: 'Position / Job Description' }, 'pdf');

    // 3. 201 File count: employees with documents in any other category (yearly)
    await countYearly({ category: { not: 'Position / Job Description' } }, 'file201');

    // 4. Compute totals
    const totals = {
      employees: { regular: 0, casual: 0, jobOrder: 0, consultant: 0, total: 0 },
      pdf: { regular: 0, casual: 0, jobOrder: 0, consultant: 0, total: 0 },
      file201: { regular: 0, casual: 0, jobOrder: 0, consultant: 0, total: 0 },
    };

    rows.forEach((row) => {
      totals.employees.regular += row.employees.regular;
      totals.employees.casual += row.employees.casual;
      totals.employees.jobOrder += row.employees.jobOrder;
      totals.employees.consultant += row.employees.consultant;
      totals.employees.total += row.employees.total;

      totals.pdf.regular += row.pdf.regular;
      totals.pdf.casual += row.pdf.casual;
      totals.pdf.jobOrder += row.pdf.jobOrder;
      totals.pdf.consultant += row.pdf.consultant;
      totals.pdf.total += row.pdf.total;

      totals.file201.regular += row.file201.regular;
      totals.file201.casual += row.file201.casual;
      totals.file201.jobOrder += row.file201.jobOrder;
      totals.file201.consultant += row.file201.consultant;
      totals.file201.total += row.file201.total;
    });

    // Filter to only offices that have at least 1 active employee
    const activeRows = rows.filter((row) => row.employees.total > 0);

    res.json({
      success: true,
      rows: activeRows,
      totals,
    });
  } catch (error: any) {
    console.error('Error fetching office scanning matrix:', error);
    res.status(500).json({ error: 'Failed to fetch office scanning matrix', details: error.message });
  }
});

// Get Scanning Status / Progress overview across all employees
router.get('/scanning-status', async (req: Request, res: Response) => {
  try {
    const { search, office, employeeStatus, scanFilter, page = '1', limit = '10', sortBy = 'updatedAt' } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Build filter for employees
    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { id: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (office && office !== 'All') {
      where.officeName = office as string;
    }

    if (employeeStatus && employeeStatus !== 'all') {
      where.status = employeeStatus as string;
    }

    // Scanning status filter (All, Scanned / With Docs, Unscanned / Without Docs)
    if (scanFilter === 'with_docs') {
      where.documents = { some: {} };
    } else if (scanFilter === 'without_docs') {
      where.documents = { none: {} };
    }

    let orderByClause: any = [{ documents: { _count: 'desc' } }, { lastName: 'asc' }];
    const orderDir = ((req.query.sortOrder as string) || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    if (sortBy === 'scannedCount') {
      orderByClause = [{ documents: { _count: orderDir } }, { lastName: 'asc' }];
    } else if (sortBy === 'name') {
      orderByClause = [{ lastName: orderDir }, { firstName: orderDir }];
    } else if (sortBy === 'id') {
      orderByClause = { id: orderDir };
    } else if (sortBy === 'office') {
      orderByClause = [{ officeName: orderDir }, { lastName: 'asc' }];
    } else if (sortBy === 'position') {
      orderByClause = [{ position: orderDir }, { lastName: 'asc' }];
    } else if (sortBy === 'status') {
      orderByClause = [{ status: orderDir }, { lastName: 'asc' }];
    } else if (sortBy === 'updatedAt' || sortBy === 'latest') {
      orderByClause = { updatedAt: orderDir };
    }

        const [employees, total] = await Promise.all([
          prisma.employee.findMany({
            where,
            skip,
            take: limitNum,
            orderBy: orderByClause,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              position: true,
              officeName: true,
              appointmentStatus: true,
              status: true,
              profilePicture: true,
              updatedAt: true,
              documents: {
                select: {
                  id: true,
                  fileName: true,
                  category: true,
                  fileSize: true,
                  createdAt: true,
                  mimeType: true,
                },
                orderBy: { createdAt: 'desc' },
              },
            },
          }),
          prisma.employee.count({ where }),
        ]);

        // Format results with scanning summary per employee
        const rows = (employees as any[]).map((emp) => {
          const docs = emp.documents || [];
          const totalDocs = docs.length;
          const latestDoc = docs[0];
          const categoriesScanned = Array.from(new Set(docs.map((d: any) => d.category)));

          return {
            id: emp.id,
            employeeNumber: emp.id,
            firstName: emp.firstName,
            lastName: emp.lastName,
            middleName: emp.middleName,
            fullName: [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' '),
            position: emp.position || '-',
            officeName: emp.officeName || '-',
            employmentType: emp.appointmentStatus || '-',
            appointmentStatus: emp.appointmentStatus || '-',
            status: emp.status,
            profilePicture: emp.profilePicture,
            scannedDocumentsCount: totalDocs,
            hasScannedDocuments: totalDocs > 0,
            categoriesCount: categoriesScanned.length,
            categories: categoriesScanned,
            lastScannedAt: latestDoc?.createdAt || null,
            documents: docs,
            _count: {
              documents: totalDocs,
            },
          };
        });

    // KPI stats based on current office/search filter (ignoring scanFilter so KPIs show the full scope)
    const filterScopeWhere: any = {};
    if (search) {
      filterScopeWhere.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { id: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    if (office && office !== 'All') {
      filterScopeWhere.officeName = office as string;
    }
    if (employeeStatus && employeeStatus !== 'all') {
      filterScopeWhere.status = employeeStatus as string;
    }

    const totalEmployeesInScope = await prisma.employee.count({ where: filterScopeWhere });

    const employeesWithDocsCount = await prisma.employee.count({
      where: {
        ...filterScopeWhere,
        documents: { some: {} },
      },
    });

    const totalDocsInScope = await prisma.document.count({
      where: {
        employee: filterScopeWhere,
      },
    });

    // Active & Inactive counts in this filtered scope
    const activeEmployeesCount = await prisma.employee.count({
      where: {
        ...filterScopeWhere,
        status: 'Active'
      }
    });

    const inactiveEmployeesCount = await prisma.employee.count({
      where: {
        ...filterScopeWhere,
        status: 'Inactive'
      }
    });

    // Distinct offices among all employees for dropdown options
    const distinctOffices = await prisma.employee.findMany({
      select: { officeName: true },
      distinct: ['officeName'],
      orderBy: { officeName: 'asc' }
    });
    const offices = Array.from(new Set(distinctOffices.map((o: any) => {
      const raw = String(o.officeName || '').trim();
      if (raw.includes(' - ')) {
        const parts = raw.split(' - ').map((p: string) => p.trim());
        return parts.slice(1).join(' - ') || parts[0];
      }
      return raw;
    }).filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b));

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      stats: {
        employeesWithScannedFiles: employeesWithDocsCount,
        totalDocumentsScanned: totalDocsInScope,
        averageFilesPerEmployee:
          employeesWithDocsCount > 0 ? +(totalDocsInScope / employeesWithDocsCount).toFixed(1) : 0,
        totalEmployeesInScope,
        activeEmployeesCount,
        inactiveEmployeesCount,
      },
      offices,
    });
  } catch (error: any) {
    console.error('Error fetching scanning status:', error);
    res.status(500).json({ error: 'Failed to fetch scanning status', details: error.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        employee: true,
      },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Get documents by employee ID
router.get('/employee/:employeeId', async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;

    const documents = await prisma.document.findMany({
      where: { employeeId },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(documents);
  } catch (error) {
    console.error('Error fetching employee documents:', error);
    res.status(500).json({ error: 'Failed to fetch employee documents' });
  }
});

// Serve document file from disk (with fallback for legacy base64 records)
router.get('/:id/file', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const document = await prisma.document.findUnique({ where: { id } });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const mimeType = document.mimeType || 'application/pdf';
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.fileName)}"`);

    // Legacy: filePath contains base64 data URI (data:application/pdf;base64,...)
    if (document.filePath.startsWith('data:')) {
      const base64Data = document.filePath.split(',')[1];
      if (!base64Data) {
        return res.status(500).json({ error: 'Invalid base64 data' });
      }
      const buffer = Buffer.from(base64Data, 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buffer.length);
      return res.end(buffer);
    }

    // New: filePath is an absolute path on disk
    let resolvedPath = document.filePath;
    if (!fs.existsSync(resolvedPath)) {
      const baseUploads = process.env.UPLOADS_DIR || path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'ERMS', 'uploads');
      const defaultDocsBase = path.join(baseUploads, 'documents');
      
      const relIdx = document.filePath.indexOf('documents');
      if (relIdx !== -1) {
        const subPath = document.filePath.substring(relIdx + 9);
        const candidate = path.join(defaultDocsBase, subPath);
        if (fs.existsSync(candidate)) {
          resolvedPath = candidate;
        }
      }
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', mimeType);
    fs.createReadStream(resolvedPath).pipe(res);
  } catch (error) {
    console.error('Error serving document file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Create document (multipart/form-data with actual file)
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  uploadDocumentFile.single('file')(req, res, (err: any) => {
    if (err) {
      console.error('[document] Multer upload error:', err);
      return res.status(400).json({ error: err.message || 'Corrupted file or invalid upload format' });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const {
      employeeId,
      category,
      fileName,
      fileSize,
      mimeType,
      aoNumber,
      aoYear,
      aoType,
      detailedTo,
      detailedDivision,
      detailedFunction,
      detailedDate,
      detailedOrderFrom,
      detailedOrderTo,
      designatedPositionFunction,
      designatedOrderFrom,
      designatedOrderTo,
      recalledFrom,
      recalledTo,
      recalledOrderFrom,
      recalledOrderTo,
      appointmentFrom,
      appointmentTo,
      autoRename,
      compressionLevel
    } = req.body;
    const uploadedFile = req.file;

    console.log('[document] Upload received:', {
      fileName,
      filePath: uploadedFile?.path,
      mimeType: uploadedFile?.mimetype,
      size: uploadedFile?.size,
    });

    if (!employeeId || !category || !fileName || !uploadedFile) {
      if (uploadedFile?.path && fs.existsSync(uploadedFile.path)) {
        try { fs.unlinkSync(uploadedFile.path); } catch (_) {}
      }
      return res.status(400).json({ error: 'Missing required fields or file' });
    }

    // Verify file is not empty
    if (uploadedFile.size === 0) {
      if (uploadedFile.path && fs.existsSync(uploadedFile.path)) {
        try { fs.unlinkSync(uploadedFile.path); } catch (_) {}
      }
      return res.status(400).json({ error: `File "${fileName}" is empty or corrupted (0 bytes).` });
    }

    // Verify PDF magic header '%PDF'
    try {
      const fd = fs.openSync(uploadedFile.path, 'r');
      const buffer = Buffer.alloc(5);
      fs.readSync(fd, buffer, 0, 5, 0);
      fs.closeSync(fd);
      const header = buffer.toString('ascii');
      if (!header.startsWith('%PDF')) {
        try { fs.unlinkSync(uploadedFile.path); } catch (_) {}
        return res.status(400).json({ error: `File "${fileName}" is not a valid PDF or is corrupted.` });
      }
    } catch (headerErr: any) {
      if (uploadedFile.path && fs.existsSync(uploadedFile.path)) {
        try { fs.unlinkSync(uploadedFile.path); } catch (_) {}
      }
      return res.status(400).json({ error: `File "${fileName}" cannot be read and is corrupted.` });
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      if (uploadedFile.path && fs.existsSync(uploadedFile.path)) {
        try { fs.unlinkSync(uploadedFile.path); } catch (_) {}
      }
      return res.status(404).json({ error: 'Employee not found' });
    }

    let finalFileName = fileName;
    let finalFilePath = uploadedFile.path;

    const isAutoRenameEnabled = autoRename === 'true';

    if (category === 'Administrative Order' && isAutoRenameEnabled) {
      const surname = employee.lastName.trim().toUpperCase();
      const firstName = employee.firstName.trim().toUpperCase();
      const middleInitial = employee.middleName && employee.middleName.trim() !== ''
        ? employee.middleName.trim().charAt(0).toUpperCase()
        : '';
      
      const namePart = middleInitial 
        ? `${surname}, ${firstName}, ${middleInitial}.`
        : `${surname}, ${firstName}`;
      
      const aoNum = aoNumber 
        ? aoNumber.trim() 
        : (employee.aoNumber ? employee.aoNumber.trim() : 'NO AO');
      const aoYr = aoYear 
        ? aoYear.trim() 
        : (employee.aoYear ? employee.aoYear.trim() : 'NO SERIES');
      
      // Filename format: SURNAME, FIRST NAME, MIDDLE INITIAL_AO. NO, S. NO.pdf
      const ext = path.extname(uploadedFile.originalname) || '.pdf';
      const newBaseName = `${namePart}_AO. ${aoNum}, S. ${aoYr}`.replace(/[/\\?%*:|"<>]/g, '-');
      finalFileName = `${newBaseName}${ext}`;
    }

    // Check if a document with the same name already exists for this employee in the same category
    const duplicate = await prisma.document.findFirst({
      where: {
        employeeId,
        fileName: finalFileName,
        category,
      },
    });

    if (duplicate) {
      if (req.body.replace === 'true') {
        try {
          if (duplicate.filePath && fs.existsSync(duplicate.filePath) && duplicate.filePath !== uploadedFile.path) {
            fs.unlinkSync(duplicate.filePath);
          }
        } catch (err) {
          console.error('Error deleting old physical file during replacement:', err);
        }
        await prisma.document.delete({
          where: { id: duplicate.id },
        });
      } else {
        // Safely remove only the new temp file without touching existing file
        if (uploadedFile.path && fs.existsSync(uploadedFile.path)) {
          try { fs.unlinkSync(uploadedFile.path); } catch (_) {}
        }
        return res.status(409).json({ error: 'A document with this name already exists' });
      }
    }

    // Ensure the physical file on disk matches finalFileName for ALL documents and categories
    const destDir = path.dirname(uploadedFile.path);
    const targetFilePath = path.join(destDir, finalFileName);
    if (uploadedFile.path !== targetFilePath) {
      try {
        if (fs.existsSync(targetFilePath)) {
          fs.unlinkSync(targetFilePath);
        }
        if (fs.existsSync(uploadedFile.path)) {
          fs.renameSync(uploadedFile.path, targetFilePath);
          finalFilePath = targetFilePath;
          console.log(`[document] Renamed document file from ${uploadedFile.path} to ${targetFilePath}`);
        }
      } catch (renameError) {
        console.error('[document] Error renaming document file:', renameError);
      }
    }

    const userId = req.headers['x-user-id'] as string || 'system';
    const userName = req.headers['x-user-name'] as string || 'System';

    let finalFileSize = parseInt(fileSize) || uploadedFile.size || 0;

    // Try to compress the PDF
    try {
      console.log(`[document] Attempting to compress ${finalFilePath} with level ${compressionLevel}...`);
      const compressedPath = await compressPDF(finalFilePath, compressionLevel);
      if (compressedPath) {
        fs.unlinkSync(finalFilePath);
        fs.renameSync(compressedPath, finalFilePath);
        const newStats = fs.statSync(finalFilePath);
        finalFileSize = newStats.size;
        console.log(`[document] Successfully compressed PDF. New size: ${finalFileSize}`);
      } else {
        console.log(`[document] Compression skipped or didn't reduce size.`);
      }
    } catch (compressErr) {
      console.error('[document] Failed to compress PDF, skipping...', compressErr);
    }

    const document = await prisma.document.create({
      data: {
        employeeId,
        category,
        fileName: finalFileName,
        filePath: finalFilePath,
        fileSize: finalFileSize,
        mimeType: mimeType || uploadedFile.mimetype || 'application/pdf',
        uploadedBy: userName,
        aoNumber: aoNumber || null,
        aoYear: aoYear || null,
        aoType: aoType || null,
        detailedTo: detailedTo || null,
        detailedDivision: detailedDivision || null,
        detailedFunction: detailedFunction || null,
        detailedDate: toNullableDate(detailedDate),
        detailedOrderFrom: toNullableDate(detailedOrderFrom),
        detailedOrderTo: toNullableDate(detailedOrderTo),
        designatedPositionFunction: designatedPositionFunction || null,
        designatedOrderFrom: toNullableDate(designatedOrderFrom),
        designatedOrderTo: toNullableDate(designatedOrderTo),
        recalledFrom: recalledFrom || null,
        recalledTo: recalledTo || null,
        recalledOrderFrom: toNullableDate(recalledOrderFrom),
        recalledOrderTo: toNullableDate(recalledOrderTo),
        appointmentFrom: toNullableDate(appointmentFrom),
        appointmentTo: toNullableDate(appointmentTo),
      },
    });

    // Auto-populate custom dynamic options from AO fields
    await checkAndAddDropdownOptions({
      officeNames: [detailedTo],
      positions: [designatedPositionFunction],
    });

    await createAuditLog(prisma, {
      userId,
      userName,
      action: 'upload',
      entity: 'document',
      entityId: document.id,
      entityName: finalFileName,
      details: {
        category,
        employeeName: getEmployeeName(employee),
        fileSize: uploadedFile.size,
      },
    });

    getIO()?.emit('documentsUpdated');
    getIO()?.emit('employeeUpdated');

    res.status(201).json(document);
  } catch (error: any) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Failed to create document', details: error.message });
  }
});

// Update document
router.put('/:id', requireSuperadminApproval, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { category, fileName } = req.body;

    const document = await prisma.document.update({
      where: { id },
      data: {
        ...(category && { category }),
        ...(fileName && { fileName }),
      },
    });

    getIO()?.emit('documentsUpdated');
    getIO()?.emit('employeeUpdated');

    res.json(document);
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete document
router.delete('/:id', requireSuperadminApproval, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get document and employee info before deleting
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        employee: true,
      },
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get user info from headers
    const userId = req.headers['x-user-id'] as string || 'system';
    const userName = req.headers['x-user-name'] as string || 'System';
    const authorizingUserName = req.headers['x-authorizing-user-name'] as string;

    // Delete physical file if it exists
    try {
      if (fs.existsSync(document.filePath)) {
        fs.unlinkSync(document.filePath);
        console.log(`Deleted physical file: ${document.filePath}`);
      }
    } catch (fileError) {
      console.error(`Error deleting physical file: ${fileError}`);
      // Continue with database deletion even if file deletion fails
    }

    // Delete document from database
    await prisma.document.delete({
      where: { id },
    });

    // If it is an Administrative Order document, clear employee's active AO fields ONLY if they match this document's info,
    // or if the deleted document has no specific AO info (legacy).
    if (document.category === 'Administrative Order') {
      const emp = document.employee;
      const isMatchingActiveAo = emp && document.aoNumber && emp.aoNumber === document.aoNumber && emp.aoYear === document.aoYear;

      if (isMatchingActiveAo) {
        try {
          await prisma.employee.update({
            where: { id: document.employeeId },
            data: {
              aoNumber: null,
              aoYear: null,
              aoType: null,
              detailedTo: null,
              detailedDivision: null,
              detailedFunction: null,
              detailedDate: null,
              detailedOrderFrom: null,
              detailedOrderTo: null,
              designatedPositionFunction: null,
              designatedOrderFrom: null,
              designatedOrderTo: null,
              isDetailed: false,
            },
          });
          console.log(`Cleared active AO fields for employee ${document.employeeId} after Administrative Order document deletion.`);
        } catch (empUpdateError) {
          console.error(`Error clearing AO fields for employee ${document.employeeId}:`, empUpdateError);
        }
      } else {
        console.log(`Not clearing active AO fields for employee ${document.employeeId} because deleted document is not the active AO.`);
      }
    }

    // Create audit log for document deletion
    await createAuditLog(prisma, {
      userId,
      userName,
      action: 'delete',
      entity: 'document',
      entityId: id,
      entityName: document.fileName,
      details: {
        category: document.category,
        employeeName: getEmployeeName(document.employee),
        authorizingUserName: authorizingUserName || userName,
      },
    });

    getIO()?.emit('documentsUpdated');
    getIO()?.emit('employeeUpdated');

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Bulk delete documents
router.post('/bulk-delete', requireSuperadminApproval, async (req: Request, res: Response) => {
  try {
    const { ids, documentNames } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty document IDs array' });
    }

    // Get user info from headers
    const userId = req.headers['x-user-id'] as string || 'system';
    const userName = req.headers['x-user-name'] as string || 'System';
    const authorizingUserName = req.headers['x-authorizing-user-name'] as string;

    // Get all documents before deleting
    const documents = await prisma.document.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      include: {
        employee: true,
      },
    });

    // Delete physical files
    let deletedFilesCount = 0;
    for (const doc of documents) {
      try {
        if (fs.existsSync(doc.filePath)) {
          fs.unlinkSync(doc.filePath);
          deletedFilesCount++;
          console.log(`Deleted physical file: ${doc.filePath}`);
        }
      } catch (fileError) {
        console.error(`Error deleting file ${doc.filePath}:`, fileError);
      }
    }

    // Delete documents from database
    const result = await prisma.document.deleteMany({
      where: {
        id: {
          in: ids,
        },
      },
    });

    // Find any documents that are in the Administrative Order category and update their employees conditionally
    const aoDocuments = documents.filter(doc => doc.category === 'Administrative Order');
    if (aoDocuments.length > 0) {
      try {
        for (const doc of aoDocuments) {
          const emp = doc.employee;
          const isMatchingActiveAo = emp && doc.aoNumber && emp.aoNumber === doc.aoNumber && emp.aoYear === doc.aoYear;

          if (isMatchingActiveAo) {
            await prisma.employee.update({
              where: { id: doc.employeeId },
              data: {
                aoNumber: null,
                aoYear: null,
                aoType: null,
                detailedTo: null,
                detailedDivision: null,
                detailedFunction: null,
                detailedDate: null,
                detailedOrderFrom: null,
                detailedOrderTo: null,
                designatedPositionFunction: null,
                designatedOrderFrom: null,
                designatedOrderTo: null,
                isDetailed: false,
              },
            });
            console.log(`Cleared active AO fields for employee ${doc.employeeId} during bulk Administrative Order document deletion.`);
          }
        }
      } catch (empUpdateError) {
        console.error('Error clearing AO fields during bulk delete:', empUpdateError);
      }
    }

    // Create bulk delete audit log
    const count = result.count;
    const authorizerInfo = authorizingUserName ? ` (Authorized by: ${authorizingUserName})` : '';
    const description = `${userName} deleted ${count} document${count > 1 ? 's' : ''}${authorizerInfo}`;

    const auditData: any = {
      userId,
      action: 'delete',
      entity: 'document',
      entityId: 'bulk',
      details: description,
    };

    // Add metadata if documentNames is provided
    if (documentNames && documentNames.length > 0) {
      auditData.metadata = {
        documents: documentNames.map((doc: any) => ({
          file_name: doc.fileName,
          category: doc.category,
        })),
        authorizingUserName: authorizingUserName || userName,
      };
    }

    await prisma.auditLog.create({
      data: auditData,
    });

    getIO()?.emit('documentsUpdated');
    getIO()?.emit('employeeUpdated');

    res.json({
      message: `Successfully deleted ${result.count} document(s)`,
      deletedCount: result.count,
      deletedFiles: deletedFilesCount,
    });
  } catch (error) {
    console.error('Error bulk deleting documents:', error);
    res.status(500).json({ error: 'Failed to bulk delete documents' });
  }
});

// Get document statistics
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const [total, byCategory, totalSize] = await Promise.all([
      prisma.document.count(),
      prisma.document.groupBy({
        by: ['category'],
        _count: true,
      }),
      prisma.document.aggregate({
        _sum: {
          fileSize: true,
        },
      }),
    ]);

    res.json({
      total,
      byCategory,
      totalSize: totalSize._sum.fileSize || 0,
    });
  } catch (error) {
    console.error('Error fetching document statistics:', error);
    res.status(500).json({ error: 'Failed to fetch document statistics' });
  }
});

export default router;
