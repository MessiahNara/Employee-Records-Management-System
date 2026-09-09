export interface ProvincialOffice {
  abbreviation: string;
  fullName: string;
  aliases?: string[];
}

export const DEFAULT_PROVINCIAL_OFFICES: ProvincialOffice[] = [
  { abbreviation: 'Accounting', fullName: 'Provincial Accounting Office', aliases: ['PAO'] },
  { abbreviation: 'Agriculture', fullName: 'Provincial Agriculture Office', aliases: ['PAgO', 'OPA', 'OPAg'] },
  { abbreviation: 'Archives', fullName: 'Provincial Archives and Records Center', aliases: ['PARC', 'Records', 'Provincial Archives', 'Archives and Records Center'] },
  { abbreviation: 'Assessor', fullName: 'Provincial Assessment Office', aliases: ['PAssO', 'PASSO'] },
  { abbreviation: 'BAC', fullName: 'Bids and Awards Committee', aliases: ['Bids and Awards', 'Bids and Awards Committee Office'] },
  { abbreviation: 'BM Staff', fullName: 'Office of the Board Members Staff', aliases: ['BM', 'BM Staff', 'Board Member Staff', 'Office of the BM Staff', 'Board Members Staff'] },
  { abbreviation: 'Board Members', fullName: 'Office of the Sangguniang Panlalawigan Members', aliases: ['SP', 'Sangguniang Panlalawigan', 'SP Members', 'OSP'] },
  { abbreviation: 'Board Secretary', fullName: 'Office of the Provincial Board Secretary', aliases: ['SP Secretary', 'Board Sec'] },
  { abbreviation: 'Budget', fullName: 'Provincial Budget Office', aliases: ['PBO'] },
  { abbreviation: 'Capitol Resort', fullName: 'Capitol Resort Hotel', aliases: ['CRH'] },
  { abbreviation: 'CRHOD', fullName: 'Capitol Resort Hotel Operations Division', aliases: ['Hotel Operations'] },
  { abbreviation: 'COA', fullName: 'Commission on Audit', aliases: ['COA Office'] },
  { abbreviation: 'CSC', fullName: 'Civil Service Commission', aliases: ['Civil Service', 'Civil Service Commission Office'] },
  { abbreviation: 'Engineering', fullName: 'Provincial Engineering Office', aliases: ['PEO'] },
  { abbreviation: 'GSO', fullName: 'General Services Office', aliases: ['General Services'] },
  { abbreviation: 'Housing', fullName: 'Provincial Human Settlements and Urban Development Authority', aliases: ['PHSUD', 'PHSUDA', 'Settlements'] },
  { abbreviation: 'HRMDO', fullName: 'Human Resource Management and Development Office', aliases: ['HR', 'HRMD', 'HRMO', 'Human Resource', 'Human Resources'] },
  { abbreviation: 'IAD', fullName: 'Internal Audit Division', aliases: ['Internal Audit'] },
  { abbreviation: 'Jail', fullName: 'Pangasinan Provincial Jail', aliases: ['PPJ', 'Provincial Jail'] },
  { abbreviation: 'Legal', fullName: 'Provincial Legal Office', aliases: ['PLO'] },
  { abbreviation: 'Library', fullName: 'Pangasinan Provincial Library', aliases: ['PPL'] },
  { abbreviation: 'MISO', fullName: 'Management Information Service Office', aliases: ['MIS', 'Management Information Systems'] },
  { abbreviation: 'PDRRMO', fullName: 'Provincial Disaster Risk Reduction and Management Office', aliases: ['Disaster Risk', 'PDRRMC'] },
  { abbreviation: 'PEDIPO', fullName: 'Provincial Economic Development and Investment Promotion Office', aliases: ['Investment Promotion', 'Economic Development'] },
  { abbreviation: 'PENRO', fullName: 'Provincial Government - Environment and Natural Resources Office', aliases: ['Environment', 'PG-ENRO'] },
  { abbreviation: 'PESO', fullName: 'Public Employment Services Office', aliases: ['Employment Services'] },
  { abbreviation: 'PGO', fullName: 'Provincial Governor\'s Office', aliases: ['Governor', 'Gov', 'Provincial Governor', 'OPG'] },
  { abbreviation: 'PHMSO', fullName: 'Provincial Hospital Management Services Office', aliases: ['Hospital Management'] },
  { abbreviation: 'PHO', fullName: 'Provincial Health Office', aliases: ['Health Office', 'Provincial Health'] },
  { abbreviation: 'PIMRO', fullName: 'Pangasinan Information and Media Relations Office', aliases: ['PIO', 'Media Relations'] },
  { abbreviation: 'PPC', fullName: 'Pangasinan Polytechnic College', aliases: ['Polytechnic College'] },
  { abbreviation: 'PPCLDO', fullName: 'Provincial Population Cooperative and Livelihood Development Office', aliases: ['Cooperative', 'Livelihood Development'] },
  { abbreviation: 'PPDO', fullName: 'Provincial Planning and Development Office', aliases: ['Planning and Development'] },
  { abbreviation: 'PSWDO', fullName: 'Provincial Social Welfare and Development Office', aliases: ['Social Welfare'] },
  { abbreviation: 'Reformation', fullName: 'Pangasinan Reformation Center', aliases: ['PRC', 'Pangasinan Reformation'] },
  { abbreviation: 'TESDA', fullName: 'Technical Education and Skills Development Authority', aliases: ['Skills Development', 'TESDA Pangasinan'] },
  { abbreviation: 'Tourism', fullName: 'Provincial Tourism and Cultural Affairs Office', aliases: ['PTCAO', 'Tourism and Cultural Affairs'] },
  { abbreviation: 'Treasury', fullName: 'Provincial Treasury Office', aliases: ['PTO'] },
  { abbreviation: 'Veterinary', fullName: 'Provincial Veterinary Office', aliases: ['PVO'] },
  { abbreviation: 'Vice Gov', fullName: 'Provincial Vice Governor\'s Office', aliases: ['PVGO', 'Vice Governor', 'Vice Governor\'s Office', 'OPVG'] },
  { abbreviation: 'Alaminos', fullName: 'Western Pangasinan District Hospital', aliases: ['WPDH', 'Western Pangasinan'] },
  { abbreviation: 'Asingan', fullName: 'Asingan Community Hospital', aliases: ['ACH'] },
  { abbreviation: 'Bayambang', fullName: 'Bayambang District Hospital', aliases: ['BDH'] },
  { abbreviation: 'Bolinao', fullName: 'Bolinao Community Hospital', aliases: ['BCH'] },
  { abbreviation: 'Dasol', fullName: 'Dasol Community Hospital', aliases: ['DCH'] },
  { abbreviation: 'Lingayen', fullName: 'Lingayen District Hospital', aliases: ['LDH'] },
  { abbreviation: 'Manaoag', fullName: 'Manaoag Community Hospital', aliases: ['MCH'] },
  { abbreviation: 'Mangatarem', fullName: 'Mangatarem District Hospital', aliases: ['MDH'] },
  { abbreviation: 'Mapandan', fullName: 'Mapandan Community Hospital', aliases: ['MCH Mapandan'] },
  { abbreviation: 'Pozorrubio', fullName: 'Pozorrubio Community Hospital', aliases: ['Pozzorrubio', 'PCH'] },
  { abbreviation: 'PPH San Carlos', fullName: 'Pangasinan Provincial Hospital', aliases: ['PPH', 'San Carlos', 'Pangasinan Provincial Hospital San Carlos'] },
  { abbreviation: 'Tayug', fullName: 'Eastern Pangasinan District Hospital', aliases: ['EPDH', 'Eastern Pangasinan'] },
  { abbreviation: 'Umingan', fullName: 'Umingan Community Hospital', aliases: ['UCH'] },
  { abbreviation: 'Urdaneta', fullName: 'Urdaneta District Hospital', aliases: ['UDH'] },
];

export const formatOfficeEntry = (abbr: string, fullName: string): string => {
  const cleanAbbr = (abbr || '').trim();
  const cleanFull = (fullName || '').trim();
  if (cleanAbbr && cleanFull) {
    if (cleanFull.toLowerCase().startsWith(`${cleanAbbr.toLowerCase()} - `)) {
      return cleanFull;
    }
    return `${cleanAbbr} - ${cleanFull}`;
  }
  return cleanFull || cleanAbbr;
};

const dynamicOfficeRegistry = new Map<string, string>();
const dynamicAbbreviationRegistry = new Map<string, string>();

export const registerOfficePair = (abbreviation: string, fullName: string) => {
  const abbr = abbreviation.trim();
  const full = fullName.trim();
  if (abbr && full) {
    dynamicOfficeRegistry.set(abbr.toLowerCase(), full);
    dynamicOfficeRegistry.set(full.toLowerCase(), full);
    dynamicAbbreviationRegistry.set(full.toLowerCase(), abbr);
  }
};

export const registerOfficeOptions = (entries: (string | null | undefined)[]) => {
  for (const entry of entries) {
    if (!entry) continue;
    const trimmed = entry.trim();
    if (trimmed.includes(' - ')) {
      const parsed = parseOfficeEntry(trimmed);
      if (parsed.abbreviation && parsed.fullName) {
        registerOfficePair(parsed.abbreviation, parsed.fullName);
      }
    }
  }
};

/**
 * Resolves an office identifier against known defaults, aliases, and dynamic registry.
 */
function resolveOfficeNameExact(text: string): string | null {
  if (!text) return null;
  const lower = text.trim().toLowerCase();
  if (!lower || lower === '—' || lower === '-') return null;

  if (dynamicOfficeRegistry.has(lower)) {
    return dynamicOfficeRegistry.get(lower)!;
  }

  // Exact match by abbreviation
  const byAbbr = DEFAULT_PROVINCIAL_OFFICES.find(
    (o) => o.abbreviation && o.abbreviation.toLowerCase() === lower
  );
  if (byAbbr) return byAbbr.fullName;

  // Exact match by full name
  const byFull = DEFAULT_PROVINCIAL_OFFICES.find(
    (o) => o.fullName.toLowerCase() === lower
  );
  if (byFull) return byFull.fullName;

  // Match by aliases
  const byAlias = DEFAULT_PROVINCIAL_OFFICES.find(
    (o) => o.aliases && o.aliases.some((a) => a.toLowerCase() === lower)
  );
  if (byAlias) return byAlias.fullName;

  return null;
}

/**
 * Parses raw office entry string (e.g. "GSO - General Services Office", "Full Name (Abbr)", etc.)
 */
export const parseOfficeEntry = (entry: string): { abbreviation: string; fullName: string } => {
  if (!entry) return { abbreviation: '', fullName: '' };
  const trimmed = entry.trim();

  // 1. Dash-separated: "Abbr - Full Name" or "Full Name - Abbr"
  if (trimmed.includes(' - ')) {
    const parts = trimmed.split(' - ').map((p) => p.trim());
    const part0Match = DEFAULT_PROVINCIAL_OFFICES.find(
      (o) =>
        (o.abbreviation && o.abbreviation.toLowerCase() === parts[0].toLowerCase()) ||
        o.aliases?.some((a) => a.toLowerCase() === parts[0].toLowerCase())
    );
    const part1Match = DEFAULT_PROVINCIAL_OFFICES.find(
      (o) =>
        (o.abbreviation && o.abbreviation.toLowerCase() === parts[1].toLowerCase()) ||
        o.aliases?.some((a) => a.toLowerCase() === parts[1].toLowerCase())
    );

    if (part1Match && !part0Match) {
      return { abbreviation: parts[1], fullName: getOfficeFullName(parts[0]) };
    }
    return {
      abbreviation: parts[0],
      fullName: getOfficeFullName(parts.slice(1).join(' - ')),
    };
  }

  // 2. Parentheses: "Full Name (ABBR)" or "(ABBR) Full Name"
  const parenMatch = trimmed.match(/^(.+?)\s*\(([A-Za-z0-9\s/.-]+)\)$/) || trimmed.match(/^\(([A-Za-z0-9\s/.-]+)\)\s*(.+)$/);
  if (parenMatch) {
    const partA = parenMatch[1].trim();
    const partB = parenMatch[2].trim();
    const abbr = partB.length < partA.length ? partB : partA;
    const full = partB.length < partA.length ? partA : partB;
    return {
      abbreviation: abbr,
      fullName: getOfficeFullName(full),
    };
  }

  return {
    abbreviation: '',
    fullName: getOfficeFullName(trimmed),
  };
};

/**
 * Resolves any office name or abbreviation to its full official name.
 * Used across generated reports and dropdowns so abbreviations are never shown.
 */
export const getOfficeFullName = (entry?: string | null): string => {
  if (!entry) return '';
  const trimmed = entry.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return trimmed;

  // 1. Remove parentheses with abbreviations, e.g. "Office Name (HRMDO)" -> "Office Name"
  const withoutParen = trimmed
    .replace(/\s*\([A-Za-z0-9\s/.-]+\)\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (withoutParen && withoutParen !== trimmed) {
    const resolvedParen = resolveOfficeNameExact(withoutParen);
    if (resolvedParen) return resolvedParen;
  }

  // 2. Remove brackets with abbreviations, e.g. "[GSO] Office Name" -> "Office Name"
  const withoutBracket = trimmed
    .replace(/\s*\[[A-Za-z0-9\s/.-]+\]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (withoutBracket && withoutBracket !== trimmed) {
    const resolvedBracket = resolveOfficeNameExact(withoutBracket);
    if (resolvedBracket) return resolvedBracket;
  }

  // 3. Handle dash separated "Abbr - Full Name" or "Full Name - Abbr"
  if (trimmed.includes(' - ')) {
    const parts = trimmed.split(' - ').map((p) => p.trim());
    const part1Resolved = resolveOfficeNameExact(parts.slice(1).join(' - '));
    if (part1Resolved) return part1Resolved;
    const part0Resolved = resolveOfficeNameExact(parts[0]);
    if (part0Resolved) return part0Resolved;
    // Always prefer the longer part (the full office name)
    const afterDash = parts.slice(1).join(' - ');
    if (afterDash && afterDash.length >= parts[0].length) {
      return afterDash;
    }
  }

  // 4. Direct exact resolution by abbreviation, full name, or alias
  const directResolved = resolveOfficeNameExact(trimmed);
  if (directResolved) return directResolved;

  // If withoutParen stripped an abbreviation tag and left a clean name, use it
  if (withoutParen && withoutParen.length > 2) {
    return withoutParen;
  }

  return trimmed;
};

/**
 * Resolves an office entry to its abbreviation (used exclusively in Office and Hospital Status).
 */
export const getOfficeAbbreviation = (entry?: string | null): string => {
  if (!entry) return '';
  const trimmed = entry.trim();
  if (!trimmed) return '';

  if (trimmed.includes(' - ')) {
    const parsed = parseOfficeEntry(trimmed);
    if (parsed.abbreviation) return parsed.abbreviation;
  }

  const lower = trimmed.toLowerCase();
  if (dynamicAbbreviationRegistry.has(lower)) {
    return dynamicAbbreviationRegistry.get(lower)!;
  }

  const matched = DEFAULT_PROVINCIAL_OFFICES.find(
    (o) =>
      (o.abbreviation && o.abbreviation.toLowerCase() === lower) ||
      o.fullName.toLowerCase() === lower ||
      (o.aliases && o.aliases.some((a) => a.toLowerCase() === lower))
  );
  if (matched && matched.abbreviation) {
    return matched.abbreviation;
  }

  return trimmed;
};

/**
 * Strips abbreviations from an array of office options and returns
 * clean, deduplicated, and sorted full office names for dropdowns.
 */
export const cleanOfficeDropdownOptions = (options: (string | null | undefined)[]): string[] => {
  registerOfficeOptions(options);
  const set = new Set<string>();
  const listToProcess = options && options.length > 0 ? options : DEFAULT_PROVINCIAL_OFFICES.map((o) => o.fullName);
  for (const opt of listToProcess) {
    if (!opt) continue;
    let clean = opt.trim();
    if (clean.includes(' - ')) {
      const parts = clean.split(' - ').map((p) => p.trim());
      clean = parts.slice(1).join(' - ') || parts[0];
    }
    const fullName = getOfficeFullName(clean);
    if (fullName && fullName !== '—' && fullName !== '-' && fullName.toLowerCase() !== 'all') {
      set.add(fullName);
    }
  }
  if (set.size === 0) {
    DEFAULT_PROVINCIAL_OFFICES.forEach((o) => set.add(o.fullName));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};
