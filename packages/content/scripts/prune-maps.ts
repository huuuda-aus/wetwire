// Reviews and removes generated candidate districts. Usage:
//   pnpm --filter @wetwire/content prune-maps                 # list every generated map
//   pnpm --filter @wetwire/content prune-maps <id> [id...]     # delete those, rewrite the barrel
//   pnpm --filter @wetwire/content prune-maps --all            # delete every generated map
//   pnpm format  # the rewritten index.ts isn't Prettier-formatted yet
import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { GENERATED_DIR, rewriteBarrel } from './mapgen-lib.ts';
import type { District } from '../src/schema.ts';

async function listMaps(): Promise<void> {
  const files = (await readdir(GENERATED_DIR)).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.log('no generated maps saved');
    return;
  }
  for (const file of files) {
    const raw: unknown = JSON.parse(await readFile(path.join(GENERATED_DIR, file), 'utf8'));
    const d = raw as District;
    const h = d.rows.length;
    const w = d.rows[0]?.length ?? 0;
    console.log(
      `${d.id}  ${w}x${h}  doors=${d.doors.length}  cams=${d.cams.length}  hunters=${d.hunters.length}`,
    );
  }
  console.log(`\n${files.length} generated map(s). Prune with: prune-maps <id> [id...]`);
}

/** `generated-*.json` is the only shape this directory is ever supposed to hold (CLAUDE.md §6.7:
 * don't delete files you didn't create this session without checking) — refusing anything else
 * keeps a typo'd id from ever reaching outside what this tool itself writes. */
function isPruneable(id: string): boolean {
  return /^generated-[\w-]+$/.test(id);
}

async function prune(ids: readonly string[]): Promise<void> {
  const existing = new Set((await readdir(GENERATED_DIR)).filter((f) => f.endsWith('.json')));
  const removed: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const file = `${id}.json`;
    if (!isPruneable(id) || !existing.has(file)) {
      skipped.push(id);
      continue;
    }
    await rm(path.join(GENERATED_DIR, file));
    removed.push(id);
  }
  await rewriteBarrel();
  console.log(`removed ${removed.length}: ${removed.join(', ')}`);
  if (skipped.length > 0) console.log(`skipped (not found or not a generated map id): ${skipped.join(', ')}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    await listMaps();
    return;
  }
  if (args[0] === '--all') {
    const files = (await readdir(GENERATED_DIR)).filter((f) => f.endsWith('.json'));
    await prune(files.map((f) => f.replace(/\.json$/, '')));
    return;
  }
  await prune(args);
}

await main();
