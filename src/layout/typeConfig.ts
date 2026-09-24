import { getPath, validateLayout, type SheetLayout } from './core';

// The read side of Archivium's per-type item config (archivium src/lib/itemTypeConfig.ts),
// trimmed to what this app needs. Keep in sync with that file.
//
// Stored on the universe: obj_data.sheets.layouts holds layouts by id, and
// obj_data.typeConfigs[itemType].sheet names the layout an item type uses.

export type ItemTypeConfig = {
  defaultTabs?: string[],
  customTabs?: string[],
  sheet?: string,
};

export type TypeConfigs = { [itemType: string]: ItemTypeConfig };

export function typeConfigFor(universeObjData: unknown, itemType: string): ItemTypeConfig {
  const config = getPath(universeObjData, 'typeConfigs') as TypeConfigs | undefined;
  const typeConfig = config?.[itemType];
  return typeConfig && typeof typeConfig === 'object' ? typeConfig : {};
}

export function sheetLayouts(universeObjData: unknown): { [id: string]: SheetLayout } {
  const layouts = getPath(universeObjData, 'sheets.layouts');
  return layouts && typeof layouts === 'object' ? layouts as { [id: string]: SheetLayout } : {};
}

// The sheet layout attached to an item type, or null if there is none or the
// stored layout is malformed.
export function layoutForType(universeObjData: unknown, itemType: string): SheetLayout | null {
  const id = typeConfigFor(universeObjData, itemType).sheet;
  if (!id) return null;
  const layout = sheetLayouts(universeObjData)[id];
  if (!layout || validateLayout(layout).length > 0) return null;
  return layout;
}
