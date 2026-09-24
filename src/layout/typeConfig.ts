import { getPath, validateLayout, type SheetLayout } from './core';

// The parts of Archivium's per-type item config (archivium src/lib/itemTypeConfig.ts)
// that this app needs. Keep in sync with that file.
//
// Stored on the universe: obj_data.tabTypes holds layouts ("tab types") by id, and
// obj_data.typeConfigs[itemType].tabTypes lists the ones an item type starts with.
// Each item keeps a tab's data at obj_data.layoutTabs[<tab type id>].

export const DEFAULT_TAB_KINDS = ['body', 'lineage', 'map', 'timeline', 'gallery'] as const;
export type DefaultTabKind = typeof DEFAULT_TAB_KINDS[number];

export type ItemTypeConfig = {
  defaultTabs?: DefaultTabKind[],
  customTabs?: string[],
  tabTypes?: string[],
};

export type TypeConfigs = { [itemType: string]: ItemTypeConfig };

export type LayoutTabsData = { [tabTypeId: string]: unknown };

type ObjData = Record<string, any>;

export function typeConfigFor(universeObjData: unknown, itemType: string): ItemTypeConfig {
  const config = getPath(universeObjData, 'typeConfigs') as TypeConfigs | undefined;
  const typeConfig = config?.[itemType];
  return typeConfig && typeof typeConfig === 'object' ? typeConfig : {};
}

function storedTabTypes(universeObjData: unknown): { [id: string]: unknown } {
  const tabTypes = getPath(universeObjData, 'tabTypes');
  return tabTypes && typeof tabTypes === 'object' ? tabTypes as { [id: string]: unknown } : {};
}

// Malformed tab types are left out, so a bad layout can't break pages.
export function tabTypesOf(universeObjData: unknown): { [id: string]: SheetLayout } {
  const result: { [id: string]: SheetLayout } = {};
  for (const [id, layout] of Object.entries(storedTabTypes(universeObjData))) {
    if (validateLayout(layout).length === 0 && (layout as SheetLayout).id === id) result[id] = layout as SheetLayout;
  }
  return result;
}

export function layoutTabsOf(objData: ObjData | null | undefined): LayoutTabsData {
  return objData?.layoutTabs && typeof objData.layoutTabs === 'object' ? objData.layoutTabs : {};
}

function emptyTab(kind: DefaultTabKind): unknown {
  if (kind === 'body') return { text: '', structure: [] };
  // Built-in tabs only need a title to show up; their editors fill in the rest.
  return { title: kind.charAt(0).toUpperCase() + kind.slice(1) };
}

// Returns obj_data with any of the type's default tabs that are missing added, the
// way Archivium's own new-item form does. Existing tabs and data are never touched.
export function withDefaultTabs(objData: ObjData, universeObjData: unknown, itemType: string): ObjData {
  const config = typeConfigFor(universeObjData, itemType);
  const result: ObjData = { ...objData };
  for (const kind of config.defaultTabs ?? []) {
    if (!DEFAULT_TAB_KINDS.includes(kind) || result[kind] !== undefined) continue;
    result[kind] = emptyTab(kind);
  }
  for (const name of config.customTabs ?? []) {
    if (!name || result.tabs?.[name] !== undefined) continue;
    result.tabs = { ...result.tabs, [name]: {} };
  }
  const tabTypes = tabTypesOf(universeObjData);
  for (const id of config.tabTypes ?? []) {
    if (!(id in tabTypes) || layoutTabsOf(result)[id] !== undefined) continue;
    result.layoutTabs = { ...result.layoutTabs, [id]: {} };
  }
  return result;
}
