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
    case 'lock':
      return `Lock ${node(a.target)}`;
    case 'ice':
      return 'Break ICE';
    case 'burn':
      return `Burn implants · ${a.target}`;
  }
}

export function courierLabel(a: CourierAction): string {
  switch (a.type) {
    case 'move':
      return `Move ${DIR_NAMES[a.dir]}`;
    case 'sprint':
      return `Sprint ${DIR_NAMES[a.dir]} (+8 overload)`;
    case 'mask':
      return 'Mask (+10 overload)';
    case 'wait':
      return 'Wait';
  }
}

export function razorLabel(a: RazorAction): string {
  switch (a.type) {
    case 'move':
      return `Move ${DIR_NAMES[a.dir]}`;
    case 'strike':
      return `Strike ${a.target}`;
    case 'heavy-strike':
      return `Heavy strike ${a.target} (2-tick wind-up)`;
    case 'guard':
      return `Guard ${a.target === 'wren' ? 'Wren' : 'Kade'}`;
    case 'wait':
      return 'Wait';
  }
}

export const MOVE_KEYS = ['W', 'D', 'S', 'A'] as const;
export const RAZOR_MOVE_KEYS = ['I', 'L', 'K', 'J'] as const;
