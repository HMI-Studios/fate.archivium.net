import type { Expr, SheetLayout, SheetsConfig } from '../layout/core';

// The Fate Core character sheet as a declarative layout. Data is stored on
// the character's item as obj_data.fate. New campaigns store this layout on
// the universe (obj_data.sheets), so Archivium can render the sheet too.

export const FATE_CORE_LAYOUT_ID = 'fate-core';

const CORE_SKILLS = [
  'Athletics', 'Burglary', 'Contacts', 'Crafts', 'Deceive', 'Drive',
  'Empathy', 'Fight', 'Investigate', 'Lore', 'Notice', 'Physique',
  'Provoke', 'Rapport', 'Resources', 'Shoot', 'Stealth', 'Will',
];

// Refresh starts at 3, and each stunt beyond the three free ones costs 1.
const refresh: Expr = { sub: [{ const: 3 }, { max: [{ const: 0 }, { sub: [{ count: 'stunts' }, { const: 3 }] }] }] };

// Stress boxes: 2, 3 at Average/Fair, 4 at Good or better.
const stressBoxes = (skill: string): Expr => ({ step: { path: `skills.${skill}` }, steps: [[3, 4], [1, 3]], else: 2 });

// Superb (+5) Physique / Will grants an extra mild consequence.
const superb = (skill: string): Expr => ({ gte: [{ path: `skills.${skill}` }, { const: 5 }] });

export const FATE_CORE_LAYOUT: SheetLayout = {
  version: 1,
  id: FATE_CORE_LAYOUT_ID,
  title: 'Character Sheet',
  root: 'fate',
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
          title: 'Aspects',
          fields: [
            { widget: 'text', path: 'highConcept', caption: 'High Concept' },
            { widget: 'text', path: 'trouble', caption: 'Trouble' },
            { widget: 'textList', path: 'aspects', label: 'Aspect', count: 3 },
          ],
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
            { widget: 'checkTrack', path: 'stress.physical', label: 'Physical', boxes: 4, available: stressBoxes('Physique'), lockedHint: 'Unlocked by a higher Physique' },
            { widget: 'checkTrack', path: 'stress.mental', label: 'Mental', boxes: 4, available: stressBoxes('Will'), lockedHint: 'Unlocked by a higher Will' },
          ],
        },
        {
          title: 'Consequences',
          fields: [
            { widget: 'slot', path: 'consequences.mild', badge: '2', label: 'Mild' },
            { widget: 'slot', path: 'consequences.moderate', badge: '4', label: 'Moderate' },
            { widget: 'slot', path: 'consequences.severe', badge: '6', label: 'Severe' },
            { widget: 'slot', path: 'consequences.mildPhysical', badge: '2', label: 'Mild (physical)', enabled: superb('Physique'), lockedHint: 'Unlocked by Superb (+5) Physique' },
            { widget: 'slot', path: 'consequences.mildMental', badge: '2', label: 'Mild (mental)', enabled: superb('Will'), lockedHint: 'Unlocked by Superb (+5) Will' },
          ],
        },
      ],
    },
  ],
  checks: [
    { unless: { gte: [refresh, { const: 1 }] }, message: 'Too many stunts: refresh can\'t go below 1.' },
  ],
};

// Character-like categories that get the Fate Core sheet.
export const FATE_SHEET_CATEGORIES = ['pc', 'npc', 'monster'];

export const FATE_SHEETS_CONFIG: SheetsConfig = {
  layouts: { [FATE_CORE_LAYOUT_ID]: FATE_CORE_LAYOUT },
  categories: Object.fromEntries(FATE_SHEET_CATEGORIES.map(category => [category, FATE_CORE_LAYOUT_ID])),
};
