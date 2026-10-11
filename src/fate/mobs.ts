import type { ConflictKind } from './combat';
import type { ConsequenceSlot, StressTrack } from './stress';

// Mobs (Fate Core, "Creating and Playing the Opposition"): identical nameless NPCs
// grouped to act as one. The GM groups monster tokens of the same monster into a mob
// (TokenShape.mob holds its id), which then:
// - takes one turn, and rolls once, with the teamwork bonus: +1 for each other member
//   who has the skill at Average (+1) or better;
// - takes hits as a group: whatever a hit has left over after taking out one member
//   carries on to the next (members soak with stress, and consequences if the GM lets them);
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

export type MobMember = {
  tokenId: string,
  label: string,
  stress: StressTrack[],
  // Their consequence slots (filled ones can't take more), if hits may use them.
  slots?: ConsequenceSlot[],
};

// What a hit on a mob does to one member: marks a stress box (and maybe consequences),
// or takes them out.
export type MobHitStep = {
  tokenId: string;
  label: string;
  // How many of the hit's shifts this member took.
  shifts: number;
  box: { path: string, index: number } | null;
  consequences: ConsequenceSlot[];
  takenOut: boolean;
};

// The track a hit in this kind of conflict marks: its own (physical or mental), or the
// first there is.
const trackFor = (stress: StressTrack[], kind: ConflictKind | undefined) =>
  stress.find(track => track.path.endsWith(`.${kind}`)) ?? stress[0];

// Every way a member could soak a hit: at most one free stress box, and any of their
// free consequence slots.
function soaks(member: MobMember, kind: ConflictKind | undefined, consequences: boolean) {
  const track = trackFor(member.stress, kind);
  const boxes = [null, ...(track?.boxes ?? []).flatMap((box, index) => box.enabled && !box.checked ? [{ path: track!.path, index }] : [])];
  const free = consequences ? (member.slots ?? []).filter(slot => !slot.text.trim()) : [];
  const sets = free.reduce<ConsequenceSlot[][]>((all, slot) => [...all, ...all.map(set => [...set, slot])], [[]]);
  return boxes.flatMap(box => sets.map(set => ({
    box,
    consequences: set,
    value: (box ? box.index + 1 : 0) + set.reduce((sum, slot) => sum + Number(slot.badge), 0),
  })));
}

const worst = (slots: ConsequenceSlot[]) => Math.max(0, ...slots.map(slot => Number(slot.badge)));

// Works through the members in order. Nameless NPCs don't take consequences (Fate
// Core), so by default each one soaks what one stress box can; with `consequences`
// (for tougher monsters) they can take consequences too. A member who can soak what's
// left of the hit does, as lightly as they can (the mildest worst consequence, then
// the fewest, then the smallest box); otherwise they're taken out, using up a shift more than they could
// have soaked, and the rest goes on to the next member. Returns the steps, and any
// shifts left over once everyone's out.
export function planMobHit(members: MobMember[], shifts: number, kind?: ConflictKind, consequences = false): { steps: MobHitStep[], leftOver: number } {
  const steps: MobHitStep[] = [];
  let remaining = shifts;
  for (const member of members) {
    if (remaining <= 0) break;
    const options = soaks(member, kind, consequences);
    const fits = options
      .filter(option => option.value >= remaining)
      .sort((a, b) => worst(a.consequences) - worst(b.consequences) || a.consequences.length - b.consequences.length || a.value - b.value)[0];
    if (fits) {
      steps.push({ tokenId: member.tokenId, label: member.label, shifts: remaining, box: fits.box, consequences: fits.consequences, takenOut: false });
      remaining = 0;
      break;
    }
    const takesOut = Math.max(...options.map(option => option.value)) + 1;
    steps.push({ tokenId: member.tokenId, label: member.label, shifts: Math.min(takesOut, remaining), box: null, consequences: [], takenOut: true });
    remaining -= takesOut;
  }
  return { steps, leftOver: Math.max(0, remaining) };
}

// Colours telling mobs apart on the map, in the order the mobs are first seen.
export const MOB_COLORS = ['#ff8c1a', '#29c4d6', '#f04da0', '#9bd12e', '#ffd21a', '#8f7cff'];
