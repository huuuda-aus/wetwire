// Batch-generates candidate districts for manual review. Usage:
//   pnpm --filter @wetwire/content gen-maps [count] [baseSeed] [width] [height] [roomCols] [roomRows]
//   pnpm format  # the written JSON/index files aren't Prettier-formatted yet
// Writes one JSON file per accepted map to data/districts/generated/, and rewrites
// data/districts/generated/index.ts so @wetwire/content picks them all up statically
// (browser-safe: no fs read at runtime). Maps that fail schema validation are skipped and
// reported — expected during generator development, not a reason to stop the batch.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { districtSchema } from '../src/schema.ts';
import { generateDistrict } from '../src/mapgen.ts';
import { GENERATED_DIR, rewriteBarrel } from './mapgen-lib.ts';

const count = Number(process.argv[2] ?? 10);
const baseSeed = Number(process.argv[3] ?? Date.now());
const width = process.argv[4] === undefined ? undefined : Number(process.argv[4]);
const height = process.argv[5] === undefined ? undefined : Number(process.argv[5]);
const roomCols = process.argv[6] === undefined ? undefined : Number(process.argv[6]);
const roomRows = process.argv[7] === undefined ? undefined : Number(process.argv[7]);

async function main(): Promise<void> {
  await mkdir(GENERATED_DIR, { recursive: true });
  const accepted: string[] = [];
  const rejected: { seed: number; reason: string }[] = [];

  for (let i = 0; i < count; i++) {
    const seed = baseSeed + i;
    const raw = generateDistrict(seed, {
      ...(width !== undefined && { width }),
      ...(height !== undefined && { height }),
      ...(roomCols !== undefined && { roomCols }),
      ...(roomRows !== undefined && { roomRows }),
    });
    const result = districtSchema.safeParse(raw);
    if (!result.success) {
      rejected.push({ seed, reason: result.error.issues.map((e) => e.message).join('; ') });
      continue;
    }
    const file = path.join(GENERATED_DIR, `${result.data.id}.json`);
    await writeFile(file, JSON.stringify(result.data, null, 2) + '\n');
    accepted.push(result.data.id);
  }

  await rewriteBarrel();

  console.log(`accepted ${accepted.length}/${count}: ${accepted.join(', ')}`);
  if (rejected.length > 0) {
    console.log(`rejected ${rejected.length}:`);
    for (const r of rejected) console.log(`  seed ${r.seed}: ${r.reason}`);
  }
}

await main();
