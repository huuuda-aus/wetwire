import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateDistrict } from '../src/mapgen.ts';
import { districtSchema } from '../src/schema.ts';

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
        },
      ),
      { numRuns: 100 },
    );
  });
});
