import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

async function run() {
  const settings = await prisma.systemSetting.findFirst();
  const offices: string[] = (settings?.officeNames as string[]) || [];

  const withAcronym: any[] = [];
  const withoutAcronym: any[] = [];

  for (const o of offices) {
    const parsed = parseOfficeEntry(o);
    if (parsed.abbreviation) {
      withAcronym.push({ orig: o, ...parsed });
    } else {
      withoutAcronym.push({ orig: o, ...parsed });
    }
  }

  console.log(`WITH ACRONYM (${withAcronym.length}):`);
  const uniqueAbbrs = new Set(withAcronym.map(w => w.abbreviation));
  console.log(`Unique abbreviations: ${uniqueAbbrs.size}`);
  Array.from(uniqueAbbrs).forEach(a => {
    const matches = withAcronym.filter(w => w.abbreviation === a);
    console.log(`  ${a}: ${matches.length} entries (${matches.map(m => m.fullName).slice(0, 2).join(', ')}${matches.length > 2 ? '...' : ''})`);
  });

  console.log(`\nWITHOUT ACRONYM (${withoutAcronym.length}):`);
  withoutAcronym.forEach(w => console.log(`  "${w.fullName}"`));
}

run().finally(() => prisma.$disconnect());
