import type { TabLayout } from '../layout/core';
import type { TypeConfigs } from '../layout/typeConfig';
import { FATE_CORE_LAYOUT, FATE_CORE_LAYOUT_ID } from './coreLayout';
import { FATE_SCENE_LAYOUT, FATE_SCENE_LAYOUT_ID } from './sceneLayout';

// Character-like categories that get the Fate Core sheet.
export const FATE_SHEET_CATEGORIES = ['pc', 'npc', 'monster'];

// The category scenes (maps) are created with.
export const FATE_SCENE_CATEGORY = 'location';

// Universe obj_data keys that give the item types their Fate tabs as Archivium tab
// types, so Archivium can show and edit them too.
export const FATE_UNIVERSE_DATA: { tabTypes: { [id: string]: TabLayout }, typeConfigs: TypeConfigs } = {
  tabTypes: {
    [FATE_CORE_LAYOUT_ID]: FATE_CORE_LAYOUT,
    [FATE_SCENE_LAYOUT_ID]: FATE_SCENE_LAYOUT,
  },
  typeConfigs: {
    ...Object.fromEntries(FATE_SHEET_CATEGORIES.map(category => [category, { tabTypes: [FATE_CORE_LAYOUT_ID] }])),
    [FATE_SCENE_CATEGORY]: { tabTypes: [FATE_SCENE_LAYOUT_ID] },
  },
};
