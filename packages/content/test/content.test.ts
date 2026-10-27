import { describe, expect, it } from 'vitest';
import balanceJson from '../data/balance.json' with { type: 'json' };
import districtJson from '../data/ironbridge-dock-row.json' with { type: 'json' };
import { content, parseContent } from '../src/index.ts';

const clone = <T>(v: T): T => structuredClone(v);

describe('content validation', () => {
  it('loads the shipped district and balance files', () => {
    expect(content.district.rows).toHaveLength(11);
    expect(content.balance.payloads['standard']?.rate).toBe(3);
  });

  it('rejects a map whose rows differ in width', () => {
    const bad = clone(districtJson);
    bad.rows[3] = '#.###.....#....';
    expect(() => parseContent(bad, balanceJson)).toThrow(/same width/);
  });

  it('rejects a door that is not on a D tile', () => {
    const bad = clone(districtJson);
    bad.doors[0] = { id: 'DR1', name: 'DOOR-1', x: 1, y: 1 };
    expect(() => parseContent(bad, balanceJson)).toThrow(/D tile/);
  });

  it('rejects a link to an unknown node', () => {
    const bad = clone(districtJson);
    bad.links.push(['TERM', 'NOPE']);
    expect(() => parseContent(bad, balanceJson)).toThrow(/unknown node/);
  });

  it('rejects a negative cost and an unknown default payload', () => {
    const badCost = clone(balanceJson);
    badCost.net.costs.blind.load = -1;
    expect(() => parseContent(districtJson, badCost)).toThrow();
    const badDefault = clone(balanceJson);
    badDefault.defaultPayload = 'gigantic';
    expect(() => parseContent(districtJson, badDefault)).toThrow(/defaultPayload/);
  });
});
