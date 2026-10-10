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

/* Mobs (see fate/mobs.ts): a mob is one combatant, under its own id */

// Some combatants become others (members forming a mob, or a mob breaking up): they
// take the turn order place of the first of the old ones in it (or of one staying on,
// like a mob others join), and its turn if it was one of theirs; in popcorn they've
// acted if any of the old ones had. Combatants not in the conflict stay out of it.
export function replaceInOrder(state: CombatState, oldIds: string[], newIds: string[]): CombatState {
  const old = new Set(oldIds);
  const staying = state.order.findIndex(id => old.has(id) && newIds.includes(id));
  const at = staying >= 0 ? staying : state.order.findIndex(id => old.has(id));
  if (at < 0) return state;
  const fresh = [...new Set(newIds)];
  const kept = (ids: string[]) => ids.filter(id => !old.has(id) && !fresh.includes(id));
  const order = [...kept(state.order.slice(0, at)), ...fresh, ...kept(state.order.slice(at))];
  const acted = state.acted && (state.acted.some(id => old.has(id)) ? [...kept(state.acted), ...fresh] : kept(state.acted));
  const current = state.current && old.has(state.current) ? fresh[0] ?? null : state.current;
  return { ...state, order, current, ...(acted ? { acted } : {}) };
}

// A combatant joins the conflict right after another (e.g. leaving its mob), acting
// when it does; if that one isn't in the conflict, neither is the newcomer.
export function insertAfter(state: CombatState, afterId: string, id: string): CombatState {
  const at = state.order.indexOf(afterId);
  if (at < 0 || state.order.includes(id)) return state;
  const order = [...state.order.slice(0, at + 1), id, ...state.order.slice(at + 1)];
  const acted = state.acted?.includes(afterId) ? [...state.acted, id] : state.acted;
  return { ...state, order, ...(acted ? { acted } : {}) };
}

// A combatant leaves the conflict (e.g. taken out, or fled). In initiative, if it was
// their turn, the next one's starts; in popcorn, someone still waiting acts next.
export function withoutCombatant(state: CombatState, present: Set<string>, id: string): CombatState {
  if (!state.order.includes(id) && state.current !== id) return state;
  if (modeOf(state) === 'popcorn') {
    const next = state.current === id ? waitingToAct(state, present)[0] ?? null : state.current;
    const order = state.order.filter(other => other !== id);
    return { ...state, order, acted: (state.acted ?? []).filter(other => other !== id), current: next ?? order[0] ?? null };
  }
  const passed = state.current === id ? stepTurn(state, present, 1) : state;
  const order = passed.order.filter(other => other !== id);
  return { ...passed, order, current: passed.current === id ? order[0] ?? null : passed.current };
}
