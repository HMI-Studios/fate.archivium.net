import type { SheetLayout } from '../layout/core';
import type { TypeConfigs } from '../layout/typeConfig';
import { FATE_CORE_LAYOUT, FATE_CORE_LAYOUT_ID } from './coreLayout';
import { FATE_SCENE_LAYOUT, FATE_SCENE_LAYOUT_ID } from './sceneLayout';

// Character-like categories that get the Fate Core sheet.
export const FATE_SHEET_CATEGORIES = ['pc', 'npc', 'monster'];

// The category scenes (maps) are created with.
export const FATE_SCENE_CATEGORY = 'location';

// Universe obj_data keys that attach the Fate sheets to item types, so Archivium
// can show and edit them too.
export const FATE_UNIVERSE_DATA: { sheets: { layouts: { [id: string]: SheetLayout } }, typeConfigs: TypeConfigs } = {
  sheets: {
    layouts: {
      [FATE_CORE_LAYOUT_ID]: FATE_CORE_LAYOUT,
      [FATE_SCENE_LAYOUT_ID]: FATE_SCENE_LAYOUT,
    },
  },
  typeConfigs: {
    ...Object.fromEntries(FATE_SHEET_CATEGORIES.map(category => [category, { sheet: FATE_CORE_LAYOUT_ID }])),
    [FATE_SCENE_CATEGORY]: { sheet: FATE_SCENE_LAYOUT_ID },
  },
};
