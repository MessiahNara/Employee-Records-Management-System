import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Built-in base provincial offices with their canonical abbreviations
const BASE_OFFICES: { abbr: string; name: string; type: 'Department' | 'Hospital'; aliases?: string[] }[] = [
  { abbr: 'Accounting', name: 'Provincial Accounting Office', type: 'Department' },
  { abbr: 'Agriculture', name: 'Provincial Agriculture Office', type: 'Department' },
  { abbr: 'Archives', name: 'Provincial Archives and Records Center', type: 'Department' },
  { abbr: 'Assessor', name: 'Provincial Assessment Office', type: 'Department' },
  { abbr: 'BAC', name: 'Bids and Awards Committee', type: 'Department' },
  { abbr: 'BM Staff', name: 'BM Staff', type: 'Department' },
  { abbr: 'Board Members', name: 'Office of the Sangguniang Panlalawigan Members', type: 'Department' },
  { abbr: 'Board Secretary', name: 'Office of the Provincial Board Secretary', type: 'Department' },
  { abbr: 'Budget', name: 'Provincial Budget Office', type: 'Department' },
  { abbr: 'Capitol Resort', name: 'Capitol Resort Hotel', type: 'Department' },
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
  names: Set<string>;
  type: 'Department' | 'Hospital';
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
      names: new Set([base.name, base.abbr]),
      type: base.type,
      pattern: base.abbr === 'BM Staff' ? /^Office of BM /i : undefined,
    };
    if (base.aliases) {
      base.aliases.forEach(a => def.names.add(a));
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

  const defsList = Array.from(map.values());

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

async function run() {
  const settings = await prisma.systemSetting.findFirst();
  const settingsOfficeNames = (settings?.officeNames as string[]) || [];

  const { defs, matchOffice } = buildDynamicOfficeMap(settingsOfficeNames);

  console.log(`Total dynamic office definitions: ${defs.length}`);

  const empCounts = await prisma.employee.groupBy({
    by: ['officeName'],
    _count: true,
  });

  let matched = 0;
  let unmatched = 0;
  const breakdown: Record<string, number> = {};

  for (const emp of empCounts) {
    const abbr = matchOffice(emp.officeName);
    if (abbr) {
      matched += emp._count;
      breakdown[abbr] = (breakdown[abbr] || 0) + emp._count;
    } else {
      unmatched += emp._count;
      console.log(`UNMATCHED: "${emp.officeName}" (${emp._count})`);
    }
  }

  console.log(`\nRESULTS: Matched=${matched}, Unmatched=${unmatched}`);
  console.log(`CRHOD count: ${breakdown['CRHOD']}`);
  console.log(`Capitol Resort count: ${breakdown['Capitol Resort']}`);
  console.log(`PENRO count: ${breakdown['PENRO']}`);
  console.log(`GSO count: ${breakdown['GSO']}`);
  console.log(`PGO count: ${breakdown['PGO']}`);
  console.log(`BM Staff count: ${breakdown['BM Staff']}`);

  // Test what happens if we simulate the user adding a NEW office with acronym in settings!
  console.log('\n--- SIMULATING USER ADDING A NEW OFFICE WITH ACRONYM ---');
  const testSettings = [...settingsOfficeNames, 'NHO - New Hospital Operations', 'CTO - City Technology Office'];
  const dynamic = buildDynamicOfficeMap(testSettings);
  console.log('NHO in defs?', dynamic.defs.some(d => d.abbr === 'NHO'));
  console.log('NHO type:', dynamic.defs.find(d => d.abbr === 'NHO')?.type);
  console.log('CTO in defs?', dynamic.defs.some(d => d.abbr === 'CTO'));
  console.log('CTO type:', dynamic.defs.find(d => d.abbr === 'CTO')?.type);
  console.log('Matched "New Hospital Operations":', dynamic.matchOffice('New Hospital Operations'));
  console.log('Matched "NHO - New Hospital Operations":', dynamic.matchOffice('NHO - New Hospital Operations'));
  console.log('Matched "CTO":', dynamic.matchOffice('CTO'));
}

run().finally(() => prisma.$disconnect());
