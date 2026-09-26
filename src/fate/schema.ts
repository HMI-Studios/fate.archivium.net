import { ARCHIVIUM_URL } from '../App';
import type { TabLayout } from '../layout/core';
import type { TypeConfigs } from '../layout/typeConfig';
import { migratedAspects } from './aspects';
import { FATE_CORE_LAYOUT_ID } from './coreLayout';
import { layoutTabData, updateLayoutTab } from './sheetData';
import { FATE_SHEET_CATEGORIES, FATE_UNIVERSE_DATA } from './universeData';

// Keeping campaigns up to date with the app's Fate sheets. Every campaign stores its own
// copy of the Fate tab types (so it can customise them in Archivium), and sheets store
// data in the shape their layout expects. When the app's layouts or data shapes change,
// a campaign is upgraded the next time one of its GMs opens it: its stored layouts are
// replaced with the app's, and its sheets migrated.
//
// A layout the campaign has changed since the app last wrote it isn't replaced without
// the GM's say-so. To tell, the campaign records a fingerprint of each layout the app
// wrote (or the GM chose not to take) under obj_data.fateSchema.
//
// To change a layout: just change it; campaigns pick it up by its fingerprint. To change
// the shape of sheet data: add a migration below (they must be safe to run twice), and
// make pages read old data too (e.g. aspectsForLayout), since players may open sheets
// before a GM has upgraded the campaign.

export const FATE_SCHEMA_KEY = 'fateSchema';

type SheetMigration = {
  version: number,
  description: string,
  tabType: string,
  categories: string[],
  migrate: (sheet: Record<string, unknown>) => Record<string, unknown>,
};

// Campaigns from before these records existed are at version 1.
const MIGRATIONS: SheetMigration[] = [
  {
    version: 2,
    description: 'High Concept, Trouble and aspects become {name, note} rows, for backstory notes',
    tabType: FATE_CORE_LAYOUT_ID,
    categories: FATE_SHEET_CATEGORIES,
    migrate: migratedAspects,
  },
];

export const FATE_SCHEMA_VERSION = Math.max(1, ...MIGRATIONS.map(m => m.version));

type LayoutRecord = {
  // Fingerprint of the layout the app last wrote.
  written?: string,
  // Fingerprint of an app layout the GM chose not to take, keeping the campaign's own.
  declined?: string,
};

export type SchemaRecord = {
  version: number,
  layouts: { [tabTypeId: string]: LayoutRecord },
};

// Key order doesn't matter to a layout, so it doesn't change its fingerprint.
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// FNV-1a: plenty to tell layouts apart. A layout's `root` is left out: it's left over
// from an older format, and Archivium ignores it.
export function fingerprint(layout: unknown): string {
  const { root: _, ...rest } = (layout && typeof layout === 'object' ? layout : {}) as Record<string, unknown>;
  let hash = 0x811c9dc5;
  for (const char of stableJson(layout && typeof layout === 'object' ? rest : layout)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const APP_LAYOUTS: { [id: string]: TabLayout } = FATE_UNIVERSE_DATA.tabTypes;

// What a brand new campaign records: it starts with the app's current everything.
export function initialSchemaRecord(): SchemaRecord {
  return {
    version: FATE_SCHEMA_VERSION,
    layouts: Object.fromEntries(Object.entries(APP_LAYOUTS).map(([id, layout]) => [id, { written: fingerprint(layout) }])),
  };
}

function readRecord(objData: Record<string, any>): SchemaRecord {
  const stored = objData[FATE_SCHEMA_KEY];
  return {
    version: typeof stored?.version === 'number' ? stored.version : 1,
    layouts: stored?.layouts && typeof stored.layouts === 'object' ? stored.layouts : {},
  };
}

export type LayoutQuestion = {
  id: string,
  title: string,
  // 'customised': changed in Archivium since the app wrote it; 'unknown': the campaign
  // predates these records, so there's no telling whether it was changed.
  reason: 'customised' | 'unknown',
};

export type SchemaStatus = {
  needed: boolean,
  // Layouts to replace without asking (missing, or unchanged since the app wrote them).
  replace: string[],
  // Layouts the GM has to decide on.
  ask: LayoutQuestion[],
};

export function schemaStatus(universeObjData: unknown): SchemaStatus {
  const objData = (universeObjData && typeof universeObjData === 'object' ? universeObjData : {}) as Record<string, any>;
  if (!objData.isFateCampaign) return { needed: false, replace: [], ask: [] };
  const record = readRecord(objData);
  const stored: Record<string, unknown> = objData.tabTypes && typeof objData.tabTypes === 'object' ? objData.tabTypes : {};

  const replace: string[] = [];
  const ask: LayoutQuestion[] = [];
  let recordsBehind = false;
  for (const [id, layout] of Object.entries(APP_LAYOUTS)) {
    const appPrint = fingerprint(layout);
    const own = record.layouts[id] ?? {};
    if (!(id in stored)) {
      replace.push(id);
      continue;
    }
    const storedPrint = fingerprint(stored[id]);
    if (storedPrint === appPrint) {
      if (own.written !== appPrint) recordsBehind = true;
    } else if (own.declined === appPrint) {
      // The GM already chose to keep the campaign's own for this version of the app's.
    } else if (own.written === storedPrint) {
      replace.push(id);
    } else {
      ask.push({ id, title: layout.title, reason: own.written ? 'customised' : 'unknown' });
    }
  }

  return {
    needed: record.version < FATE_SCHEMA_VERSION || replace.length > 0 || ask.length > 0 || recordsBehind,
    replace,
    ask,
  };
}

const universeUrl = (campaign: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}`;

async function fetchUniverseObjData(campaign: string): Promise<Record<string, any>> {
  const response = await fetch(universeUrl(campaign), { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not load the campaign (${response.status}).`);
  const data = await response.json();
  return (typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data) ?? {};
}

// Upgrades a campaign (its GM must be the one signed in). `accept` lists the layouts the
// GM agreed to have replaced out of those asked about; the rest are kept. Sheets are
// migrated first and the campaign's record written last, so an upgrade that fails part
// way is simply tried again next time.
export async function upgradeCampaign(campaign: string, accept: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
  const before = await fetchUniverseObjData(campaign);
  const status = schemaStatus(before);
  const record = readRecord(before);
  const storedLayouts: Record<string, unknown> = before.tabTypes && typeof before.tabTypes === 'object' ? before.tabTypes : {};

  // Which of the app's layouts the campaign will have once this is done.
  const taking = new Set([...status.replace, ...accept]);
  const willMatch = (id: string) => taking.has(id) || fingerprint(storedLayouts[id]) === fingerprint(APP_LAYOUTS[id]);

  // Migrate the sheets of layouts the campaign is on (or moving to) the app's version of.
  // A layout it keeps its own version of keeps its sheets as they are.
  const pending = MIGRATIONS.filter(m => m.version > record.version && willMatch(m.tabType));
  if (pending.length > 0) {
    const response = await fetch(`${universeUrl(campaign)}/items`, { credentials: 'include' });
    if (!response.ok) throw new Error(`Could not list the campaign's items (${response.status}).`);
    const categories = new Set(pending.flatMap(m => m.categories));
    const items: { shortname: string, item_type: string }[] = (await response.json()).filter((item: { item_type: string }) => categories.has(item.item_type));
    let done = 0;
    onProgress?.(done, items.length);
    for (const item of items) {
      const migrations = pending.filter(m => m.categories.includes(item.item_type));
      for (const tabType of new Set(migrations.map(m => m.tabType))) {
        const apply = (sheet: Record<string, unknown>) => migrations.filter(m => m.tabType === tabType).reduce((current, m) => m.migrate(current), sheet);
        const itemResponse = await fetch(`${universeUrl(campaign)}/items/${item.shortname}`, { credentials: 'include' });
        if (!itemResponse.ok) continue;
        const data = await itemResponse.json();
        const sheet = layoutTabData(typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data, tabType);
        // Only sheets that have been filled in and actually change are written.
        if (Object.keys(sheet).length === 0 || JSON.stringify(apply(sheet)) === JSON.stringify(sheet)) continue;
        await updateLayoutTab(campaign, item.shortname, tabType, fresh => apply(fresh));
      }
      onProgress?.(++done, items.length);
    }
  }

  // Then the campaign's layouts and record, over a fresh copy (the data endpoint
  // replaces whole top-level keys).
  const fresh = await fetchUniverseObjData(campaign);
  const freshLayouts: Record<string, unknown> = fresh.tabTypes && typeof fresh.tabTypes === 'object' ? fresh.tabTypes : {};
  const tabTypes: Record<string, unknown> = { ...freshLayouts };
  const layouts: SchemaRecord['layouts'] = { ...readRecord(fresh).layouts };
  for (const [id, layout] of Object.entries(APP_LAYOUTS)) {
    const appPrint = fingerprint(layout);
    if (willMatch(id)) {
      tabTypes[id] = layout;
      layouts[id] = { written: appPrint };
    } else if (status.ask.some(q => q.id === id)) {
      layouts[id] = { ...layouts[id], declined: appPrint };
    }
  }
  // Item types keep whatever tab types they list, plus the app's.
  const typeConfigs: TypeConfigs = { ...(fresh.typeConfigs ?? {}) };
  for (const [type, config] of Object.entries(FATE_UNIVERSE_DATA.typeConfigs)) {
    const current = typeConfigs[type] ?? {};
    typeConfigs[type] = { ...current, tabTypes: [...new Set([...(current.tabTypes ?? []), ...(config.tabTypes ?? [])])] };
  }

  const response = await fetch(`${universeUrl(campaign)}/data`, {
    credentials: 'include',
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tabTypes, typeConfigs, [FATE_SCHEMA_KEY]: { version: FATE_SCHEMA_VERSION, layouts } }),
  });
  if (!response.ok) throw new Error(`Could not save the campaign (${response.status}).`);
}
