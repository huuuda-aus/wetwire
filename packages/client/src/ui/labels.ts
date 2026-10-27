import {
  DIR_NAMES,
  type CourierAction,
  type DeckerAction,
  type MatchState,
  type RazorAction,
} from '@wetwire/sim';

export function deckerLabel(s: MatchState, a: DeckerAction): string {
  const node = (id: string): string => s.rules.nodes[id]?.label ?? id;
  switch (a.type) {
    case 'hold':
      return 'Hold';
    case 'route':
      return `Route → ${node(a.target)}`;
    case 'blind':
      return `Blind ${node(a.target)}`;
    case 'unlock':
      return `Unlock ${node(a.target)}`;
    case 'ice':
      return 'Break ICE';
    case 'burn':
      return `Burn implants · ${a.target}`;
  }
}

export function courierLabel(a: CourierAction): string {
  if (a.type === 'move') return `Move ${DIR_NAMES[a.dir]}`;
  return a.type === 'mask' ? 'Mask (+10 overload)' : 'Wait';
}

export function razorLabel(a: RazorAction): string {
  if (a.type === 'move') return `Move ${DIR_NAMES[a.dir]}`;
  return a.type === 'strike' ? `Strike ${a.target}` : 'Wait';
}

export const MOVE_KEYS = ['W', 'D', 'S', 'A'] as const;
