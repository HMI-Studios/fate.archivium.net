import type { TurnOrderMode } from './settings';

// A conflict's turn order, kept in the scene's live doc (the `combat` map, key
// `state`) and saved to the scene item as obj_data.combat. Combatants are tokens on
// the map, so several tokens of the same monster each get a turn.
//
// Two modes, picked per campaign when the conflict starts (see fate/settings.ts):
// initiative goes through `order` in turn; popcorn has whoever just acted pick who's
// next among those who haven't acted this round (`acted`).

export type ConflictKind = 'physical' | 'mental';

export type CombatState = {
  kind: ConflictKind;
  // Conflicts from before popcorn existed have no mode: they're initiative.
  mode?: TurnOrderMode;
  round: number;
  // Token ids in turn order (initiative), or just the combatants (popcorn).
  order: string[];
  // The token whose turn it is.
  current: string | null;
  // Popcorn: tokens that have acted this round, in the order they acted.
  acted?: string[];
};

export const modeOf = (state: CombatState): TurnOrderMode => state.mode ?? 'initiative';

// Fate Core's turn order: highest skill first, ties broken by the next skill.
export const INITIATIVE_SKILLS: { [kind in ConflictKind]: string[] } = {
  physical: ['Notice', 'Athletics', 'Physique'],
  mental: ['Empathy', 'Rapport', 'Will'],
};

export const CONFLICT_LABELS: { [kind in ConflictKind]: string } = {
  physical: 'Physical conflict',
  mental: 'Mental conflict',
};

export type Combatant = {
  tokenId: string;
  shortname: string;
};

export function initiativeOrder(combatants: Combatant[], kind: ConflictKind, skillsOf: (shortname: string) => { [skill: string]: number }): string[] {
  const score = (c: Combatant) => INITIATIVE_SKILLS[kind].map(skill => skillsOf(c.shortname)[skill] ?? 0);
  return [...combatants]
    .sort((a, b) => {
      const [sa, sb] = [score(a), score(b)];
      for (let i = 0; i < sa.length; i++) {
        if (sa[i] !== sb[i]) return sb[i] - sa[i];
      }
      return 0;
    })
    .map(c => c.tokenId);
}

// The turn after (or before) the current one, skipping tokens no longer on the map.
// Wrapping past the end starts a new round.
export function stepTurn(state: CombatState, present: Set<string>, direction: 1 | -1): CombatState {
  const order = state.order.filter(id => present.has(id));
  if (order.length === 0) return { ...state, current: null };
  const index = state.current ? order.indexOf(state.current) : -1;
  if (index < 0) return { ...state, current: order[0] };
  const next = index + direction;
  if (next >= order.length) return { ...state, current: order[0], round: state.round + 1 };
  if (next < 0) return state.round > 1 ? { ...state, current: order[order.length - 1], round: state.round - 1 } : state;
  return { ...state, current: order[next] };
}

export function moveInOrder(state: CombatState, tokenId: string, direction: 1 | -1): CombatState {
  const order = [...state.order];
  const i = order.indexOf(tokenId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= order.length) return state;
  [order[i], order[j]] = [order[j], order[i]];
  return { ...state, order };
}

/* Popcorn */

// Combatants still to act this round, other than whoever's acting now.
export function waitingToAct(state: CombatState, present: Set<string>): string[] {
  const acted = new Set(state.acted ?? []);
  return state.order.filter(id => present.has(id) && id !== state.current && !acted.has(id));
}

// The current combatant is done and hands the turn to someone who hasn't acted yet.
export function passTurn(state: CombatState, to: string): CombatState {
  const acted = [...(state.acted ?? []), ...(state.current ? [state.current] : [])];
  return { ...state, acted, current: to };
}

// Everyone has acted: the last to act picks who starts the next round (themselves included).
export function startNextRound(state: CombatState, first: string): CombatState {
  return { ...state, round: state.round + 1, acted: [], current: first };
}

// Take back the last pass: the previous combatant is acting again.
export function undoPass(state: CombatState): CombatState {
  const acted = [...(state.acted ?? [])];
  const previous = acted.pop();
  return previous ? { ...state, acted, current: previous } : state;
}

// The GM puts a combatant up without anyone being marked as having acted (e.g. to
// pick who goes first, or to fix a mistake).
export function setCurrent(state: CombatState, tokenId: string): CombatState {
  return { ...state, current: tokenId, acted: (state.acted ?? []).filter(id => id !== tokenId) };
}
