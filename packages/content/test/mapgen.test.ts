import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateDistrict } from '../src/mapgen.ts';
import { districtSchema, type District } from '../src/schema.ts';

/** True where (x, y) is a strict one-tile-wide chokepoint — open on exactly one opposite pair of
 * sides, walled on the other pair. Mirrors mapgen.ts's own `isChoke`, kept independent here so
 * this test still catches a regression in that check itself, not just in its call site. */
function isChoke(rows: readonly string[], x: number, y: number): boolean {
  const open = (px: number, py: number): boolean => rows[py]?.[px] !== '#' && rows[py]?.[px] !== undefined;
  const horizOpen = open(x - 1, y) && open(x + 1, y);
  const vertOpen = open(x, y - 1) && open(x, y + 1);
  if (horizOpen && vertOpen) return false;
  if (horizOpen) return !open(x, y - 1) && !open(x, y + 1);
  if (vertOpen) return !open(x - 1, y) && !open(x + 1, y);
  return false;
}

describe('generateDistrict', () => {
  it('is deterministic: the same seed always produces the same district', () => {
    const a = generateDistrict(42);
    const b = generateDistrict(42);
    expect(a).toEqual(b);
  });

  it('produces a different layout for a different seed', () => {
    const a = generateDistrict(1);
    const b = generateDistrict(2);
    expect(a.rows).not.toEqual(b.rows);
  });

  it('always produces a district that passes districtSchema (reachability, tile placement, node refs)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (seed) => {
        const district = generateDistrict(seed);
        expect(() => districtSchema.parse(district)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });

  it('never places a door where a second open tile runs alongside it (a wide corridor makes it walk-aroundable)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (seed) => {
        const district: District = generateDistrict(seed);
        for (const door of district.doors) {
          expect(isChoke(district.rows, door.x, door.y)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('supports bigger maps via options, still passing districtSchema', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 16, max: 40 }),
        fc.integer({ min: 11, max: 30 }),
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 2, max: 5 }),
        (seed, width, height, roomCols, roomRows) => {
          const district = generateDistrict(seed, { width, height, roomCols, roomRows });
          expect(() => districtSchema.parse(district)).not.toThrow();
          for (const door of district.doors) {
            expect(isChoke(district.rows, door.x, door.y)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
