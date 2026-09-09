import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Well-known sub-offices / aliases mapping if not explicitly in settings
const KNOWN_ALIASES: Record<string, string[]> = {
  'GSO': [
    'General Services Office',
    'General Services Office - BPSSD Security Services',
    'General Services Office - BPSSD Utility Services',
    'General Services Office - Narciso Ramos Sports & Civic Center'
  ],
  'PGO': [
    'Provincial Governor\'s Office',
    'PGO Archive',
    'Special Events',
    'Task Force Kalikasan',
    'Health and Wellness',
    'Provincial Prosecutor Office'
  ],
};

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

async function test() {
  const settings = await prisma.systemSetting.findFirst();
  const rawOfficeNames: string[] = (settings?.officeNames as string[]) || [];

  // Build dynamic definitions from system_settings.officeNames
  interface OfficeDef {
    abbr: string;
    names: Set<string>;
    type: 'Department' | 'Hospital';
    order: number;
  }

  const defsMap = new Map<string, OfficeDef>();
  let orderIndex = 0;

  for (const entry of rawOfficeNames) {
    const trimmed = (entry || '').trim();
    if (!trimmed) continue;

    const { abbreviation, fullName } = parseOfficeEntry(trimmed);
    const abbr = abbreviation || fullName;
    const name = fullName || abbreviation;

    const isHospital =
      name.toLowerCase().includes('hospital') ||
      abbr.toLowerCase().includes('hospital');

    if (!defsMap.has(abbr)) {
      defsMap.set(abbr, {
        abbr,
        names: new Set<string>(),
        type: isHospital ? 'Hospital' : 'Department',
        order: orderIndex++,
      });
    }

    const def = defsMap.get(abbr)!;
    def.names.add(name);
    def.names.add(trimmed); // In case employee.officeName stores the full "CRHOD - Capitol Resort Hotel Operations Division"
    def.names.add(abbr);    // In case employee.officeName stores just "CRHOD"

    // Add known aliases if any
    if (KNOWN_ALIASES[abbr]) {
      KNOWN_ALIASES[abbr].forEach(alias => def.names.add(alias));
    }
  }

  // Also support BM Staff pattern
  const defs = Array.from(defsMap.values());

  function matchOffice(officeName: string): string | null {
    if (!officeName) return null;
    const clean = officeName.trim();

    // 1. Direct match in defs
    for (const d of defs) {
      if (d.names.has(clean)) return d.abbr;
    }

    // 2. Case-insensitive exact match
    const lower = clean.toLowerCase();
    for (const d of defs) {
      for (const n of d.names) {
        if (n.toLowerCase() === lower) return d.abbr;
      }
    }

    // 3. BM Staff prefix regex if clean starts with "Office of BM "
    if (/^Office of BM /i.test(clean) && defsMap.has('BM Staff')) {
      return 'BM Staff';
    }

    // 4. Check if clean has " - " format and match by abbr or fullName
    if (clean.includes(' - ')) {
      const parsed = parseOfficeEntry(clean);
      if (parsed.abbreviation && defsMap.has(parsed.abbreviation)) return parsed.abbreviation;
      for (const d of defs) {
        if (d.names.has(parsed.fullName)) return d.abbr;
      }
    }

    // 5. If it's a known alias in KNOWN_ALIASES
    for (const [abbr, aliases] of Object.entries(KNOWN_ALIASES)) {
      if (aliases.some(a => a.toLowerCase() === lower)) {
        if (defsMap.has(abbr)) return abbr;
      }
    }

    return null;
  }

  const empCounts = await prisma.employee.groupBy({
    by: ['officeName'],
    _count: true,
  });

  let matchedCount = 0;
  let unmatchedCount = 0;
  const resultsByAbbr: Record<string, { count: number; offices: string[] }> = {};

  for (const emp of empCounts) {
    const abbr = matchOffice(emp.officeName);
    if (abbr) {
      matchedCount += emp._count;
      if (!resultsByAbbr[abbr]) resultsByAbbr[abbr] = { count: 0, offices: [] };
      resultsByAbbr[abbr].count += emp._count;
      resultsByAbbr[abbr].offices.push(`${emp.officeName} (${emp._count})`);
    } else {
      unmatchedCount += emp._count;
      console.log(`UNMATCHED: "${emp.officeName}" with ${emp._count} employees`);
    }
  }

  console.log(`\nTOTAL EMPLOYEES: matched=${matchedCount}, unmatched=${unmatchedCount}`);
  console.log('\n--- CRHOD & CAPITOL RESORT SPECIFICALLY ---');
  console.log('CRHOD:', resultsByAbbr['CRHOD']);
  console.log('Capitol Resort:', resultsByAbbr['Capitol Resort']);

  console.log('\n--- ALL GENERATED MATRIX ROWS (COUNT: ' + defs.length + ') ---');
  defs.forEach(d => {
    const res = resultsByAbbr[d.abbr];
    console.log(`[${d.type}] ${d.abbr} -> ${res ? res.count : 0} employees`);
  });
}

test().finally(() => prisma.$disconnect());
