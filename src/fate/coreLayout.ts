import type { Expr, TabLayout } from '../layout/core';

// The Fate Core character sheet as a declarative layout: an Archivium tab type. Data
// is stored on the character's item as obj_data.layoutTabs['fate-core']. New
// campaigns store this layout on the universe (see fate/universeData.ts), so
// Archivium can render the sheet too.

export const FATE_CORE_LAYOUT_ID = 'fate-core';

const CORE_SKILLS = [
  'Athletics', 'Burglary', 'Contacts', 'Crafts', 'Deceive', 'Drive',
  'Empathy', 'Fight', 'Investigate', 'Lore', 'Notice', 'Physique',
  'Provoke', 'Rapport', 'Resources', 'Shoot', 'Stealth', 'Will',
];

// Refresh starts at 3, and each stunt beyond the three free ones costs 1.
const refresh: Expr = { sub: [{ const: 3 }, { max: [{ const: 0 }, { sub: [{ count: 'stunts' }, { const: 3 }] }] }] };

// Characters who don't follow the PCs' rules for stress and consequences (Fate Core's
// nameless and supporting NPCs, say) have theirs set by hand: with `byHand` at 1, the
// sheet's own numbers of stress boxes and consequences (mild first) replace the rules'.
export const TOUGHNESS_PATHS = {
  byHand: 'toughness.byHand',
  physical: 'toughness.physical',
  mental: 'toughness.mental',
  consequences: 'toughness.consequences',
} as const;

// `set` when set by hand, otherwise `rule`. Expressions have no conditional, so this
// pushes whichever doesn't apply out of the way of a min (values are well under 100).
const byHand = (set: Expr, rule: Expr): Expr => ({ min: [
  { add: [set, { step: { path: TOUGHNESS_PATHS.byHand }, steps: [[1, 0]], else: 100 }] },
  { add: [rule, { step: { path: TOUGHNESS_PATHS.byHand }, steps: [[1, 100]], else: 0 }] },
] });

// Stress boxes: 2, 3 at Average/Fair, 4 at Good or better.
const stressBoxes = (skill: string, track: 'physical' | 'mental'): Expr => byHand(
  { path: TOUGHNESS_PATHS[track] },
  { step: { path: `skills.${skill}` }, steps: [[3, 4], [1, 3]], else: 2 },
);

// Whether a character has the consequence that comes `rank`th (1 = mild): everyone
// does by the rules.
const hasConsequence = (rank: number): Expr => ({ gte: [byHand({ path: TOUGHNESS_PATHS.consequences }, { const: 3 }), { const: rank }] });
const byHandHint = 'Stress and consequences are set by hand';

// Superb (+5) Physique / Will grants an extra mild consequence (unless the
// consequences are set by hand; see TOUGHNESS_PATHS).
const superb = (skill: string): Expr => byHand({ const: 0 }, { gte: [{ path: `skills.${skill}` }, { const: 5 }] });

export const FATE_CORE_LAYOUT: TabLayout = {
  version: 1,
  id: FATE_CORE_LAYOUT_ID,
  title: 'Character Sheet',
  rows: [
    {
      sections: [
        {
          title: 'ID',
          basis: '20rem',
          fields: [
            { widget: 'title', caption: 'Name' },
            { widget: 'text', path: 'description', caption: 'Description', multiline: true },
          ],
        },
        { title: 'Refresh', variant: 'stat', basis: '6rem', fields: [{ widget: 'computed', label: 'Refresh', value: refresh }] },
        { title: 'Fate Points', variant: 'stat', basis: '6rem', fields: [{ widget: 'number', path: 'fatePoints', label: 'Fate points', default: refresh, min: 0 }] },
      ],
    },
    {
      sections: [
        {
          // A one-entry entryList, same as 'aspects' below, so it renders identically
          // (bold name, plain backstory) instead of clashing with a plain text field.
          // The app hides its add/remove controls, so it always holds exactly one row.
          title: 'High Concept',
          fields: [{
            widget: 'entryList',
            path: 'highConcept',
            itemLabel: 'High Concept',
            addLabel: 'Add High Concept',
            fields: [
              { key: 'name', placeholder: 'High Concept' },
              { key: 'note', placeholder: 'Backstory', multiline: true },
            ],
          }],
        },
        {
          title: 'Trouble',
          fields: [{
            widget: 'entryList',
            path: 'trouble',
            itemLabel: 'Trouble',
            addLabel: 'Add Trouble',
            fields: [
              { key: 'name', placeholder: 'Trouble' },
              { key: 'note', placeholder: 'Backstory', multiline: true },
            ],
          }],
        },
      ],
    },
    {
      sections: [
        {
          title: 'Aspects',
          fields: [{
            widget: 'entryList',
            path: 'aspects',
            itemLabel: 'Aspect',
            addLabel: 'Add Aspect',
            fields: [
              { key: 'name', placeholder: 'Aspect' },
              { key: 'note', placeholder: 'Backstory', multiline: true },
            ],
          }],
        },
        {
          title: 'Skills',
          fields: [{
            widget: 'ratingLadder',
            path: 'skills',
            options: CORE_SKILLS,
            ratings: [
              { value: 5, label: 'Superb (+5)' },
              { value: 4, label: 'Great (+4)' },
              { value: 3, label: 'Good (+3)' },
              { value: 2, label: 'Fair (+2)' },
              { value: 1, label: 'Average (+1)' },
            ],
            rule: 'pyramid',
          }],
        },
      ],
    },
    {
      sections: [
        { title: 'Extras', fields: [{ widget: 'text', path: 'extras', label: 'Extras', multiline: true, rows: 6 }] },
        {
          title: 'Stunts',
          fields: [{
            widget: 'entryList',
            path: 'stunts',
            itemLabel: 'Stunt',
            addLabel: 'Add Stunt',
            fields: [
              { key: 'name', placeholder: 'Stunt name' },
              { key: 'description', placeholder: 'What the stunt does', multiline: true },
            ],
          }],
        },
      ],
    },
    {
      sections: [
        {
          title: 'Stress',
          fields: [
            { widget: 'checkTrack', path: 'stress.physical', label: 'Physical', boxes: 4, available: stressBoxes('Physique', 'physical'), lockedHint: 'Unlocked by a higher Physique' },
            { widget: 'checkTrack', path: 'stress.mental', label: 'Mental', boxes: 4, available: stressBoxes('Will', 'mental'), lockedHint: 'Unlocked by a higher Will' },
          ],
        },
        {
          title: 'Consequences',
          fields: [
            { widget: 'slot', path: 'consequences.mild', badge: '2', label: 'Mild', enabled: hasConsequence(1), lockedHint: byHandHint },
            { widget: 'slot', path: 'consequences.moderate', badge: '4', label: 'Moderate', enabled: hasConsequence(2), lockedHint: byHandHint },
            { widget: 'slot', path: 'consequences.severe', badge: '6', label: 'Severe', enabled: hasConsequence(3), lockedHint: byHandHint },
            { widget: 'slot', path: 'consequences.mildPhysical', badge: '2', label: 'Mild (physical)', enabled: superb('Physique'), lockedHint: 'Unlocked by Superb (+5) Physique' },
            { widget: 'slot', path: 'consequences.mildMental', badge: '2', label: 'Mild (mental)', enabled: superb('Will'), lockedHint: 'Unlocked by Superb (+5) Will' },
          ],
        },
      ],
    },
    {
      // The override above. This app hides this row and shows its own controls beside
      // the stress tracks instead (on monsters' and NPCs' sheets).
      sections: [
        { title: 'Set by hand (1 = yes)', variant: 'stat', basis: '9rem', fields: [{ widget: 'number', path: TOUGHNESS_PATHS.byHand, label: 'Stress and consequences set by hand (1) or by the rules (0)', min: 0 }] },
        { title: 'Physical stress boxes', variant: 'stat', basis: '9rem', fields: [{ widget: 'number', path: TOUGHNESS_PATHS.physical, label: 'Physical stress boxes, when set by hand', min: 0 }] },
        { title: 'Mental stress boxes', variant: 'stat', basis: '9rem', fields: [{ widget: 'number', path: TOUGHNESS_PATHS.mental, label: 'Mental stress boxes, when set by hand', min: 0 }] },
        { title: 'Consequences', variant: 'stat', basis: '9rem', fields: [{ widget: 'number', path: TOUGHNESS_PATHS.consequences, label: 'Consequences (mild first), when set by hand', min: 0 }] },
      ],
    },
    {
      sections: [
        {
          // Aspects that outlast a scene; the scene panel shows and edits these too.
          title: 'Temporary Aspects',
          fields: [{
            widget: 'entryList',
            path: 'temporaryAspects',
            itemLabel: 'Aspect',
            addLabel: 'Add Temporary Aspect',
            fields: [
              { key: 'name', placeholder: 'Aspect' },
              { key: 'invokes', placeholder: 'Free invokes' },
              { key: 'note', placeholder: 'How long it lasts' },
            ],
          }],
        },
      ],
    },
  ],
  checks: [
    { unless: { gte: [refresh, { const: 1 }] }, message: 'Too many stunts: refresh can\'t go below 1.' },
  ],
};
