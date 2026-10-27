import { describe, expect, it } from 'vitest';
import balanceJson from '../data/balance.json' with { type: 'json' };
import harrowYardsJson from '../data/districts/harrow-yards.json' with { type: 'json' };
import districtJson from '../data/ironbridge-dock-row.json' with { type: 'json' };
import implantsJson from '../data/implants.json' with { type: 'json' };
import rolesJson from '../data/roles.json' with { type: 'json' };
import { content, parseContent } from '../src/index.ts';

const clone = <T>(v: T): T => structuredClone(v);
const districts = [districtJson, harrowYardsJson];

describe('content validation', () => {
  it('loads the shipped district and balance files', () => {
    expect(content.district.rows).toHaveLength(11);
    expect(content.balance.payloads['standard']?.rate).toBe(3);
  });

  it('rejects a map whose rows differ in width', () => {
    const bad = clone(districtJson);
    bad.rows[3] = '#.###.....#....';
    expect(() => parseContent([bad], balanceJson)).toThrow(/same width/);
  });

  it('rejects a door that is not on a D tile', () => {
    const bad = clone(districtJson);
    bad.doors[0] = { id: 'DR1', name: 'DOOR-1', x: 1, y: 1 };
    expect(() => parseContent([bad], balanceJson)).toThrow(/D tile/);
  });

  it('rejects a link to an unknown node', () => {
    const bad = clone(districtJson);
    bad.links.push(['TERM', 'NOPE']);
    expect(() => parseContent([bad], balanceJson)).toThrow(/unknown node/);
  });

  it('rejects a negative cost and an unknown default payload', () => {
    const badCost = clone(balanceJson);
    badCost.net.costs.blind.load = -1;
    expect(() => parseContent(districts, badCost)).toThrow();
    const badDefault = clone(balanceJson);
    badDefault.defaultPayload = 'gigantic';
    expect(() => parseContent(districts, badDefault)).toThrow(/defaultPayload/);
  });

  it('loads every shipped district, with dock row as the default', () => {
    expect(content.districts).toHaveLength(2);
    expect(content.district.id).toBe('ironbridge-dock-row');
    expect(content.districts.map((d) => d.id).sort()).toEqual(['harrow-yards', 'ironbridge-dock-row']);
  });

  it('rejects two districts that share an id', () => {
    expect(() => parseContent([districtJson, districtJson], balanceJson)).toThrow(/duplicate district id/);
  });

  it('rejects a receiver that is unreachable even with every door open', () => {
    const bad = clone(districtJson);
    // Wall in all four neighbours of the receiver tile, same row widths, so this is
    // purely a connectivity break and not also a width mismatch.
    bad.rows = [
      '################',
      '#..............#',
      '#.####...#####.#',
      '#.###.....#..#.#',
      '#.###..#..#.#R##',
      '#.###.....D..#.#',
      '#...#..#..#....#',
      '#...#.....######',
      '#...D.....######',
      '#S.T#.....######',
      '################',
    ];
    expect(() => parseContent([bad], balanceJson)).toThrow(/unreachable/);
  });

  it('rejects a hunter that starts inside a wall', () => {
    const bad = clone(districtJson);
    const [first] = bad.hunters;
    if (!first) throw new Error('ironbridge-dock-row.json needs at least one hunter for this test');
    first.x = 0;
    first.y = 0;
    expect(() => parseContent([bad], balanceJson)).toThrow(/inside a wall/);
  });

  it('loads the six role kits and nine implants, each with a positive neural cost', () => {
    expect(content.roles).toHaveLength(6);
    expect(content.roles.map((r) => r.id).sort()).toEqual(
      ['courier', 'decker', 'fixer', 'hunter', 'razor', 'receiver'].sort(),
    );
    expect(content.implants).toHaveLength(9);
    for (const implant of content.implants) expect(implant.slotCost).toBeGreaterThan(0);
    expect(content.balance.neural.capacity).toBe(100);
  });

  it('rejects two roles that share an id', () => {
    const bad = clone(rolesJson);
    const [first, second] = bad;
    if (!first || !second) throw new Error('roles.json needs at least two roles for this test');
    second.id = first.id;
    expect(() => parseContent(districts, balanceJson, bad, implantsJson)).toThrow(/duplicate role id/);
  });

  it('rejects two actions on the same role sharing an id', () => {
    const bad = clone(rolesJson);
    const [role] = bad;
    const [first, second] = role?.actions ?? [];
    if (!first || !second) throw new Error('the first role needs at least two actions for this test');
    second.id = first.id;
    expect(() => parseContent(districts, balanceJson, bad, implantsJson)).toThrow(/duplicate action id/);
  });

  it('rejects two implants that share an id', () => {
    const bad = clone(implantsJson);
    const [first, second] = bad;
    if (!first || !second) throw new Error('implants.json needs at least two implants for this test');
    second.id = first.id;
    expect(() => parseContent(districts, balanceJson, rolesJson, bad)).toThrow(/duplicate implant id/);
  });

  it('rejects an implant with a non-positive slot cost', () => {
    const bad = clone(implantsJson);
    const [first] = bad;
    if (!first) throw new Error('implants.json needs at least one implant for this test');
    first.slotCost = 0;
    expect(() => parseContent(districts, balanceJson, rolesJson, bad)).toThrow();
  });
});
