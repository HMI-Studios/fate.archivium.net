import { ladderRatings, numberValue, type NumberField, type RatingLadderField, type LayoutField } from '../layout/core';
import { FATE_CORE_LAYOUT } from './coreLayout';

// Fate dice rolls, shared in a scene's live doc (the `rolls` map) so everyone at the
// table sees them. A roll is 4dF plus a skill rating and a modifier; invoking an
// aspect afterwards either adds +2 or rerolls the dice, paid with a free invoke or a
// fate point.

export type FateDie = -1 | 0 | 1;

export type InvokeEffect = 'bonus' | 'reroll';

export type RollInvoke = {
  aspect: string;
  // The invoked aspect's id (see InvokableAspect); older invokes only have its name.
  aspectId?: string;
  paidWith: 'free invoke' | 'fate point';
  // Invokes from before rerolls existed have no effect: they were all +2.
  effect?: InvokeEffect;
  // For a reroll, the dice it replaced.
  previousDice?: FateDie[];
};

// An aspect can only be invoked once per roll for a fate point, though any number of
// its free invokes can be used on it (Fate Core).
export function paidInvokeUsed(roll: Pick<Roll, 'invokes'>, aspect: { id: string, name: string }): boolean {
  return roll.invokes.some(invoke => invoke.paidWith === 'fate point'
    && (invoke.aspectId ? invoke.aspectId === aspect.id : invoke.aspect === aspect.name));
}

export type Roll = {
  id: string;
  at: number;
  // Who clicked the button (Archivium username).
  by: string;
  // `key` is the scene actor (see fate/tokenState.ts): a monster token rolls and pays
  // fate points on its own. Rolls from before it only have the shortname.
  character?: { shortname: string, title: string, key?: string };
  skill?: string;
  skillRating: number;
  modifier: number;
  dice: FateDie[];
  invokes: RollInvoke[];
};

// How many rolls the campaign's dice log keeps (live and saved).
export const ROLL_LOG_SIZE = 100;

export function rollFateDice(): FateDie[] {
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, v => (v % 3) - 1 as FateDie);
}

export const diceTotal = (dice: FateDie[]) => dice.reduce<number>((sum, die) => sum + die, 0);

export const isBonus = (invoke: RollInvoke) => (invoke.effect ?? 'bonus') === 'bonus';

export const rollTotal = (roll: Roll) => diceTotal(roll.dice) + roll.skillRating + roll.modifier + 2 * roll.invokes.filter(isBonus).length;

const LADDER: { [value: number]: string } = {
  8: 'Legendary', 7: 'Epic', 6: 'Fantastic', 5: 'Superb', 4: 'Great', 3: 'Good',
  2: 'Fair', 1: 'Average', 0: 'Mediocre', [-1]: 'Poor', [-2]: 'Terrible',
};

export const signed = (value: number) => value > 0 ? `+${value}` : String(value);

// The ladder name for a result, e.g. "+3 Good"; beyond the ladder, the nearest end.
export function ladderLabel(value: number): string {
  const name = LADDER[Math.max(-2, Math.min(8, value))];
  return `${signed(value)} ${name}`;
}

/* Reading the Fate Core sheet */

const coreFields: LayoutField[] = FATE_CORE_LAYOUT.rows.flatMap(row => row.sections.flatMap(section => section.fields));
const skillsField = coreFields.find((f): f is RatingLadderField => f.widget === 'ratingLadder' && f.path === 'skills')!;
const fatePointsField = coreFields.find((f): f is NumberField => f.widget === 'number' && f.path === 'fatePoints')!;

export const FATE_SKILLS: string[] = skillsField.options;

export const skillRatings = (sheet: unknown): { [skill: string]: number } => ladderRatings(skillsField, sheet);

// Fate points on a sheet; a sheet that never set them has its refresh.
export const fatePoints = (sheet: unknown): number => numberValue(fatePointsField, sheet);
