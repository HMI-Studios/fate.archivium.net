import { ARCHIVIUM_URL } from '../App';

// Sheet data has no live sync, and more than one place can write it (the sheet
// page, and the scene panel moving aspects onto a character). Saves therefore
// only send the top-level sheet keys that changed, applied over a fresh copy,
// so edits to different parts of the sheet don't overwrite each other.

type SheetRoot = Record<string, unknown>;

const itemUrl = (campaign: string, item: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}/items/${item}`;

function asRoot(value: unknown): SheetRoot {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as SheetRoot : {};
}

export async function fetchSheetRoot(campaign: string, item: string, root: string): Promise<SheetRoot> {
  const response = await fetch(itemUrl(campaign, item), { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not load ${item} (${response.status}).`);
  const data = await response.json();
  const objData = typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data;
  return asRoot(objData?.[root]);
}

async function putSheetRoot(campaign: string, item: string, root: string, value: SheetRoot): Promise<void> {
  const response = await fetch(`${itemUrl(campaign, item)}/data`, {
    credentials: 'include',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ [root]: value }),
  });
  if (!response.ok) throw new Error(`Could not save ${item} (${response.status}).`);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Save `next`, given that it was edited from `base`. Returns what was saved.
export async function saveSheetChanges(campaign: string, item: string, root: string, base: unknown, next: unknown): Promise<SheetRoot> {
  const baseRoot = asRoot(base);
  const nextRoot = asRoot(next);
  const merged = { ...await fetchSheetRoot(campaign, item, root) };
  for (const key of new Set([...Object.keys(baseRoot), ...Object.keys(nextRoot)])) {
    if (same(baseRoot[key], nextRoot[key])) continue;
    if (nextRoot[key] === undefined) delete merged[key];
    else merged[key] = nextRoot[key];
  }
  await putSheetRoot(campaign, item, root, merged);
  return merged;
}

// Apply a change to one key of the freshest copy of a sheet, e.g. to append to a list.
export async function updateSheetKey<T>(campaign: string, item: string, root: string, key: string, update: (current: T | undefined) => T): Promise<void> {
  const fresh = await fetchSheetRoot(campaign, item, root);
  await putSheetRoot(campaign, item, root, { ...fresh, [key]: update(fresh[key] as T | undefined) });
}
