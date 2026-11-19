import fs from 'fs';
import path from 'path';

// Load scanned tracks from local API or scan
async function main() {
  const res = await fetch('http://127.0.0.1:4000/local-api/tracks');
  const data = await res.json();
  const tracks = data.tracks || [];

  console.log('Total active tracks fetched:', tracks.length);

  // Map of artist string -> count of tracks
  const artistCounts = new Map<string, number>();
  for (const t of tracks) {
    const a = t.artist || 'Không rõ nghệ sĩ';
    artistCounts.set(a, (artistCounts.get(a) || 0) + 1);
  }

  // Key function: normalize for grouping
  // 1. Lowercase
  // 2. Remove accents/diacritics
  // 3. Remove punctuation and spaces
  function normalizeKey(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s\-_.,/&()]/g, '');
  }

  // Also case-only key:
  function caseOnlyKey(str: string): string {
    return str.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  const groups = new Map<string, string[]>();
  for (const a of artistCounts.keys()) {
    const key = caseOnlyKey(a);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  // Broader grouping (punctuation / accents / spaces)
  const broadGroups = new Map<string, string[]>();
  for (const a of artistCounts.keys()) {
    const key = normalizeKey(a);
    if (!broadGroups.has(key)) broadGroups.set(key, []);
    broadGroups.get(key)!.push(a);
  }

  console.log('\n--- Case & Whitespace Variations ---');
  const caseVariants: any[] = [];
  for (const [key, variants] of groups.entries()) {
    if (variants.length > 1) {
      caseVariants.push({
        key,
        variants: variants.map(v => ({ name: v, count: artistCounts.get(v) }))
      });
    }
  }
  console.log(JSON.stringify(caseVariants, null, 2));

  console.log('\n--- Broader Variations (hyphen, accents, symbols) ---');
  const broadVariants: any[] = [];
  for (const [key, variants] of broadGroups.entries()) {
    if (variants.length > 1) {
      broadVariants.push({
        key,
        variants: variants.map(v => ({ name: v, count: artistCounts.get(v) }))
      });
    }
  }
  console.log(JSON.stringify(broadVariants, null, 2));
}

main();

