import type { ConflictKind } from './combat';
import type { StressTrack } from './stress';

// Mobs (Fate Core, "Creating and Playing the Opposition"): identical nameless NPCs
// grouped to act as one. The GM groups monster tokens of the same monster into a mob
// (TokenShape.mob holds its id), which then:
// - takes one turn, and rolls once, with the teamwork bonus: +1 for each other member
//   who has the skill at Average (+1) or better;
// - takes hits as a group: whatever a hit has left over after taking out one member
//   carries on to the next;
// - breaks up when it's down to one member, who can join another mob (or flee).
//
// A mob is a scene actor of its own (keyed like a monster token, by its id), with its
// own aspects and fate points; its members keep their own stress and consequences.

export const MOB_PREFIX = 'mob-';
export const isMobId = (id: string | null | undefined) => Boolean(id?.startsWith(MOB_PREFIX));
export const newMobId = () => `${MOB_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Fate Core's teamwork: everyone helping who has the skill at Average (+1) or better
// adds +1. A mob's members are identical, so either all of them help or none do.
export const teamworkBonus = (helpers: number, rating: number) => rating >= 1 ? Math.max(0, helpers) : 0;

export type MobMember = { tokenId: string, label: string, stress: StressTrack[] };

// What a hit on a mob does to one member: marks a stress box, or takes them out.
export type MobHitStep = {
  tokenId: string;
  label: string;
  // How many of the hit's shifts this member took.
  shifts: number;
  box: { path: string, index: number } | null;
  takenOut: boolean;
};

// The track a hit in this kind of conflict marks: its own (physical or mental), or the
// first there is.
const trackFor = (stress: StressTrack[], kind: ConflictKind | undefined) =>
  stress.find(track => track.path.endsWith(`.${kind}`)) ?? stress[0];

// Works through the members in order. Nameless NPCs don't take consequences: each
// one soaks what one stress box can (the smallest free box big enough), and anything
// more takes them out, using up a shift more than their biggest free box; the rest
// goes on to the next member. Returns the steps, and any shifts left over once
// everyone's out.
export function planMobHit(members: MobMember[], shifts: number, kind?: ConflictKind): { steps: MobHitStep[], leftOver: number } {
  const steps: MobHitStep[] = [];
  let remaining = shifts;
  for (const member of members) {
    if (remaining <= 0) break;
    const track = trackFor(member.stress, kind);
    const free = (track?.boxes ?? [])
      .map((box, index) => ({ index, value: index + 1, usable: box.enabled && !box.checked }))
      .filter(box => box.usable);
    const fits = free.find(box => box.value >= remaining);
    if (fits && track) {
      steps.push({ tokenId: member.tokenId, label: member.label, shifts: remaining, box: { path: track.path, index: fits.index }, takenOut: false });
      remaining = 0;
      break;
    }
    const takesOut = (free.length ? free[free.length - 1].value : 0) + 1;
    steps.push({ tokenId: member.tokenId, label: member.label, shifts: Math.min(takesOut, remaining), box: null, takenOut: true });
    remaining -= takesOut;
  }
  return { steps, leftOver: Math.max(0, remaining) };
}

// Colours telling mobs apart on the map, in the order the mobs are first seen.
export const MOB_COLORS = ['#ff8c1a', '#29c4d6', '#f04da0', '#9bd12e', '#ffd21a', '#8f7cff'];
