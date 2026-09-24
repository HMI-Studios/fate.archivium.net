import { getPath, isEnabled, setPath, textAt, trackBoxes, type CheckTrackField, type LayoutField, type SlotField } from '../layout/core';
import { FATE_CORE_LAYOUT } from './coreLayout';

// Stress tracks and consequences, read from a sheet through the Fate Core layout's
// own fields so they follow its rules (e.g. extra boxes from a higher Physique).

const coreFields: LayoutField[] = FATE_CORE_LAYOUT.rows.flatMap(row => row.sections.flatMap(section => section.fields));
const trackFields = coreFields.filter((f): f is CheckTrackField => f.widget === 'checkTrack');
const slotFields = coreFields.filter((f): f is SlotField => f.widget === 'slot');

export type StressTrack = {
  path: string;
  label: string;
  boxes: { checked: boolean, enabled: boolean }[];
};

export type Consequence = {
  label: string;
  badge: string;
  text: string;
};

export const stressTracks = (sheet: unknown): StressTrack[] => trackFields.map(field => ({
  path: field.path,
  label: field.label,
  boxes: trackBoxes(field, sheet),
}));

// The consequences a character has taken (filled, available slots).
export const takenConsequences = (sheet: unknown): Consequence[] => slotFields
  .filter(field => isEnabled(field.enabled, sheet) && textAt(sheet, field.path).trim())
  .map(field => ({ label: field.label, badge: field.badge, text: textAt(sheet, field.path) }));

export type ConsequenceSlot = Consequence & { path: string };

// Every consequence slot the sheet's rules make available, filled or not.
export const consequenceSlots = (sheet: unknown): ConsequenceSlot[] => slotFields
  .filter(field => isEnabled(field.enabled, sheet))
  .map(field => ({ path: field.path, label: field.label, badge: field.badge, text: textAt(sheet, field.path) }));

// The sheet's top-level key holding a track (e.g. `stress` for `stress.physical`),
// for saving it through a single-key update.
export const trackKey = (path: string) => path.split('.')[0];

// Returns the track's top-level value with one box ticked or cleared.
export function withBoxToggled(sheet: unknown, path: string, index: number): unknown {
  const key = trackKey(path);
  const current = getPath(sheet, path);
  const boxes = Array.isArray(current) ? [...current] : [];
  while (boxes.length <= index) boxes.push(false);
  boxes[index] = !boxes[index];
  return getPath(setPath(sheet ?? {}, path, boxes), key);
}
