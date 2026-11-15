import { defaultEntityResolutionService } from '../src/services/entityResolutionService';

async function main() {
  console.log('Running Entity Resolution Preview on full library...');
  const res = await defaultEntityResolutionService.preview({ forceItunes: true });
  console.log('STATS:', JSON.stringify(res.stats, null, 2));
  console.log('CSV Report Path:', res.csvReportPath);
  console.log('Total candidates:', res.candidates.length);
  const changed = res.candidates.filter(c => c.isChanged);
  console.log('Changed candidates count:', changed.length);
  for (const c of changed.slice(0, 5)) {
    console.log(`- [${c.source}] (${c.confidence}) ${c.originalArtist} - ${c.originalTitle} => ${c.resolvedArtist} - ${c.resolvedTitle}`);
  }
}

main().catch((err) => {
  console.error('Preview error:', err);
  process.exit(1);
});

