import { ARCHIVIUM_URL } from '../App';
import { layoutTabsOf } from '../layout/typeConfig';

// Sheet data lives in an item's layout tabs (obj_data.layoutTabs[<tab type id>]). It
// has no live sync, and more than one place can write it (the sheet page, and a
// scene panel moving aspects or ticking stress). Writes are therefore applied over a
// fresh copy: of the item's other layout tabs, which the data endpoint would otherwise
// replace since it only merges top-level keys, and of the tab itself, so edits to
// different parts of a sheet don't overwrite each other.

type TabData = Record<string, unknown>;

// Where the Fate tabs kept their data before Archivium had layout tabs. Items that
// haven't been migrated are still read from there; saving moves them to layoutTabs.
const LEGACY_KEYS: { [tabTypeId: string]: string } = {
  'fate-core': 'fate',
  'fate-scene': 'fateScene',
};

const itemUrl = (campaign: string, item: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}/items/${item}`;

function asTabData(value: unknown): TabData {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as TabData : {};
}

// A layout tab's data from an item's obj_data (falling back to its pre-layout-tab key).
export function layoutTabData(objData: unknown, tabId: string): TabData {
  const data = objData && typeof objData === 'object' ? objData as Record<string, any> : {};
  const tabs = layoutTabsOf(data);
  if (tabs[tabId] !== undefined) return asTabData(tabs[tabId]);
  return asTabData(LEGACY_KEYS[tabId] ? data[LEGACY_KEYS[tabId]] : undefined);
}

async function fetchObjData(campaign: string, item: string): Promise<Record<string, any>> {
  const response = await fetch(itemUrl(campaign, item), { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not load ${item} (${response.status}).`);
  const data = await response.json();
  return (typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data) ?? {};
}

export async function fetchLayoutTab(campaign: string, item: string, tabId: string): Promise<TabData> {
  return layoutTabData(await fetchObjData(campaign, item), tabId);
}

// Write one layout tab, computed from its freshest copy, along with any other
// top-level obj_data keys in `extra`. Returns what was written to the tab.
export async function updateLayoutTab(campaign: string, item: string, tabId: string, update: (fresh: TabData) => TabData, extra: Record<string, unknown> = {}): Promise<TabData> {
  const objData = await fetchObjData(campaign, item);
  const value = update(layoutTabData(objData, tabId));
  const response = await fetch(`${itemUrl(campaign, item)}/data`, {
    credentials: 'include',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...extra, layoutTabs: { ...layoutTabsOf(objData), [tabId]: value } }),
  });
  if (!response.ok) throw new Error(`Could not save ${item} (${response.status}).`);
  return value;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Save `next`, given that it was edited from `base`: only the top-level keys that
// changed are applied. Returns what was saved.
export async function saveSheetChanges(campaign: string, item: string, tabId: string, base: unknown, next: unknown): Promise<TabData> {
  const baseData = asTabData(base);
  const nextData = asTabData(next);
  return updateLayoutTab(campaign, item, tabId, fresh => {
    const merged = { ...fresh };
    for (const key of new Set([...Object.keys(baseData), ...Object.keys(nextData)])) {
      if (same(baseData[key], nextData[key])) continue;
      if (nextData[key] === undefined) delete merged[key];
      else merged[key] = nextData[key];
    }
    return merged;
  });
}

// Apply a change to one key of the freshest copy of a sheet, e.g. to append to a
// list. Returns the key's new value.
export async function updateSheetKey<T>(campaign: string, item: string, tabId: string, key: string, update: (current: T | undefined) => T): Promise<T> {
  const saved = await updateLayoutTab(campaign, item, tabId, fresh => ({ ...fresh, [key]: update(fresh[key] as T | undefined) }));
  return saved[key] as T;
}
