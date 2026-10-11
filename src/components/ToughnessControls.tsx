import { TOUGHNESS_PATHS } from '../fate/coreLayout';
import { getPath, isEnabled, setPath, trackBoxes, type CheckTrackField, type SlotField, type TabLayout } from '../layout/core';

const CONSEQUENCE_CHOICES = ['None', 'Mild', 'Mild and moderate', 'Mild, moderate and severe'];

const fieldsOf = (layout: TabLayout) => layout.rows.flatMap(row => row.sections.flatMap(section => section.fields));

// Whether the layout has the stress and consequences override (campaigns get it once
// a GM's visit upgrades their layout).
export const hasToughness = (layout: TabLayout) => fieldsOf(layout).some(field => 'path' in field && field.path === TOUGHNESS_PATHS.byHand);

// The override's own fields, shown by ToughnessControls instead.
export const isToughnessField = (path: string) => (Object.values(TOUGHNESS_PATHS) as string[]).includes(path);

type Props = {
  layout: TabLayout;
  data: unknown;
  set: (path: string, value: unknown) => void;
};

// Sets a character's stress boxes and consequences by hand, for those who don't follow
// the PCs' rules (Fate Core's nameless and supporting NPCs, or tougher monsters).
// The sheet's layout does the rest: see TOUGHNESS_PATHS.
export default function ToughnessControls({ layout, data, set }: Props) {
  const fields = fieldsOf(layout);
  const tracks = (['physical', 'mental'] as const)
    .map(track => ({ track, field: fields.find((f): f is CheckTrackField => f.widget === 'checkTrack' && f.path === `stress.${track}`) }))
    .filter((t): t is { track: 'physical' | 'mental', field: CheckTrackField } => t.field !== undefined);
  const slots = ['mild', 'moderate', 'severe']
    .map(rank => fields.find((f): f is SlotField => f.widget === 'slot' && f.path === `consequences.${rank}`))
    .filter((f): f is SlotField => f !== undefined);

  const on = Number(getPath(data, TOUGHNESS_PATHS.byHand)) >= 1;
  const byRules = setPath(data ?? {}, TOUGHNESS_PATHS.byHand, 0);
  const boxes = (field: CheckTrackField, sheet: unknown) => trackBoxes(field, sheet).filter(box => box.enabled).length;
  const consequences = (sheet: unknown) => slots.filter(slot => isEnabled(slot.enabled, sheet)).length;
  const current = (getPath(data, 'toughness') ?? {}) as Record<string, unknown>;

  // Starts from what the rules give, so ticking the box changes nothing until a number does.
  const setByHand = (checked: boolean) => set('toughness', checked
    ? {
      ...current,
      byHand: 1,
      ...Object.fromEntries(tracks.map(({ track, field }) => [track, boxes(field, byRules)])),
      consequences: consequences(byRules),
    }
    : { ...current, byHand: 0 });

  return <div className='d-flex flex-col gap-1'>
    <label className='d-flex align-center gap-1' title="For characters who don't follow the PCs' rules, like nameless NPCs (Average: no boxes, Fair: 1, Good: 2, no consequences)">
      <input type='checkbox' checked={on} onChange={({ target }) => setByHand(target.checked)} />
      Set stress and consequences by hand
    </label>
    {on && <div className='d-flex align-center gap-2 flex-wrap'>
      {tracks.map(({ track, field }) => <label key={track} className='d-flex align-center gap-1'>
        {field.label}
        <select value={boxes(field, data)} onChange={({ target }) => set(TOUGHNESS_PATHS[track], Number(target.value))}>
          {Array.from({ length: field.boxes + 1 }, (_, n) => <option key={n} value={n}>{n === 1 ? '1 box' : `${n} boxes`}</option>)}
        </select>
      </label>)}
      {slots.length > 0 && <label className='d-flex align-center gap-1'>
        Consequences
        <select value={consequences(data)} onChange={({ target }) => set(TOUGHNESS_PATHS.consequences, Number(target.value))}>
          {CONSEQUENCE_CHOICES.slice(0, slots.length + 1).map((choice, n) => <option key={n} value={n}>{choice}</option>)}
        </select>
      </label>}
    </div>}
  </div>;
}
