
import 'dotenv/config';

// This script clears InstantDB data for either the entire app (all entities)
// or a single table when passed via --table <name>.
//
// Usage:
//   node scripts/clear-db.mjs --all
//   node scripts/clear-db.mjs --table notes

const { NEXT_PUBLIC_INSTANT_APP_ID: INSTANT_APP_ID } = process.env;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { all: false, table: null, dryRun: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--all') out.all = true;
    else if ((a === '--table' || a === '-t') && args[i + 1]) {
      out.table = String(args[i + 1]);
      i += 1;
    }
    else if (a === '--dry-run' || a === '--dryrun') {
      out.dryRun = true;
    }
  }
  return out;
}

function getEntitiesToClear(requestedTable) {
  // Child-first order is safer when relationships exist
  const knownEntities = ['comments', 'activity', 'tasks', 'notes', 'folders'];
  if (!requestedTable) return knownEntities;
  if (!knownEntities.includes(requestedTable)) {
    throw new Error(`Unknown table: ${requestedTable}. Known: ${knownEntities.join(', ')}`);
  }
  return [requestedTable];
}

async function run() {
  if (!INSTANT_APP_ID) {
    throw new Error('NEXT_PUBLIC_INSTANT_APP_ID is not defined');
  }

  const { all, table, dryRun } = parseArgs();
  if (!all && !table) {
    console.log('Specify what to clear:');
    console.log('  --all                 Clear all tables');
    console.log('  --table <name>        Clear a single table (e.g., notes)');
    console.log('  --dry-run             Simulate only; do not delete');
    process.exit(1);
  }

  const { init } = await import('@instantdb/react');

  // Pass only appId; schema/types are not required at runtime for this script
  const db = init({ appId: INSTANT_APP_ID });

  const entities = getEntitiesToClear(table);
  const startTime = Date.now();
  console.log(`Connected to InstantDB app ${INSTANT_APP_ID}`);
  if (dryRun) {
    console.log('(dry run mode – no deletions will be performed)');
  }

  let totalDeleted = 0;

  for (const entity of entities) {
    process.stdout.write(`- Scanning ${entity}... `);
    const query = { [entity]: { $: { limit: 1000 } } };

    if (dryRun) {
      const res = await db.query(query);
      const rows = (res && res[entity]) || [];
      console.log(`found ${rows.length}${rows.length === 1000 ? ' (showing first 1000)' : ''}`);
      totalDeleted += rows.length;
      continue;
    }

    // Fetch in pages until exhausted (records will shrink as we delete)
    let deletedForEntity = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await db.query(query);
      const rows = (res && res[entity]) || [];
      if (!rows.length) break;

      // Chunk deletes to avoid oversized transactions
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const ops = chunk.map((r) => db.tx[entity][r.id].delete());
        await db.transact(ops);
        deletedForEntity += chunk.length;
        totalDeleted += chunk.length;
      }
    }

    console.log(`deleted ${deletedForEntity}`);
  }

  const ms = Date.now() - startTime;
  if (dryRun) {
    console.log(`Dry run complete. Would delete ${totalDeleted} records (sampled) in ~${ms}ms.`);
  } else {
    console.log(`Done. Deleted ${totalDeleted} records in ${ms}ms.`);
  }
}

run().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
