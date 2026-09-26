import { ARCHIVIUM_URL } from '../App';
import { withDefaultTabs } from '../layout/typeConfig';
import { toShortname } from '../util';
import { asBody, bodyFromText, plainTextOf, type Body } from './body';

// Stunts are shared across a campaign as Archivium items of the stunt category, with
// the description as the item's body. A character sheet's stunt entry links to one by
// shortname (`item`) and keeps a copy of its name and description, so the sheet still
// reads (and counts towards refresh) in Archivium, which doesn't know about the link.
// This app shows the item's current text, and the copy catches up when the sheet is saved.

export const STUNT_CATEGORY = 'stunt';
// The sheet entry list that holds stunts, and the keys of its entries.
export const STUNTS_PATH = 'stunts';
export const STUNT_LINK_KEY = 'item';

export type StuntSummary = { shortname: string, title: string };

export type Stunt = StuntSummary & {
  // The item's body: rich text, as Archivium's editor makes it.
  body: Body,
  // The body as plain text, which sheets keep a copy of.
  description: string,
};

export const stuntOf = (summary: StuntSummary, body: Body): Stunt => ({ ...summary, body, description: plainTextOf(body) });

const itemsUrl = (campaign: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}/items`;

function readBody(objData: unknown): Body | null {
  return asBody(objData && typeof objData === 'object' ? (objData as Record<string, unknown>).body : null);
}

/* The campaign's stunts */

export async function listStunts(campaign: string): Promise<StuntSummary[]> {
  const response = await fetch(`${itemsUrl(campaign)}?type=${STUNT_CATEGORY}`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not load the campaign's stunts (${response.status}).`);
  const items: { shortname: string, title: string }[] = await response.json();
  return items.map(({ shortname, title }) => ({ shortname, title })).sort((a, b) => a.title.localeCompare(b.title));
}

// The stunt's item, as the API returns it.
export async function fetchStuntItem(campaign: string, shortname: string): Promise<Record<string, any>> {
  const response = await fetch(`${itemsUrl(campaign)}/${shortname}`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not load the stunt ${shortname} (${response.status}).`);
  return response.json();
}

export async function fetchStunt(campaign: string, shortname: string): Promise<Stunt> {
  const item = await fetchStuntItem(campaign, shortname);
  const body = readBody(typeof item.obj_data === 'string' ? JSON.parse(item.obj_data) : item.obj_data);
  return stuntOf({ shortname: item.shortname, title: item.title }, body ?? bodyFromText(''));
}

// A shortname for a new stunt that no existing item uses.
function freeShortname(name: string, taken: Set<string>): string {
  const base = toShortname(name) || toShortname(`stunt-${name}`) || STUNT_CATEGORY;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.substring(0, 64 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

async function allShortnames(campaign: string): Promise<Set<string>> {
  const response = await fetch(itemsUrl(campaign), { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not load the campaign's items (${response.status}).`);
  const items: { shortname: string }[] = await response.json();
  return new Set(items.map(item => item.shortname));
}

export async function createStunt(campaign: string, universeObjData: unknown, name: string, body: Body): Promise<Stunt> {
  const title = name.trim();
  // Someone else may take the shortname between checking and creating, so try again
  // with a fresh list if creating fails and the name has meanwhile been taken.
  for (let attempt = 0; ; attempt++) {
    const taken = await allShortnames(campaign);
    const shortname = freeShortname(title, taken);
    const response = await fetch(itemsUrl(campaign), {
      credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        shortname,
        item_type: STUNT_CATEGORY,
        obj_data: withDefaultTabs({ body }, universeObjData, STUNT_CATEGORY),
      }),
    });
    if (response.ok) return stuntOf({ shortname, title }, body);
    if (attempt >= 2 || !(await allShortnames(campaign)).has(shortname)) {
      throw new Error(`Could not create the stunt (${response.status}).`);
    }
  }
}

// Replaces the stunt's body. The data endpoint merges top-level obj_data keys, so
// the item's other content is kept.
export async function saveStuntBody(campaign: string, shortname: string, body: Body): Promise<void> {
  const response = await fetch(`${itemsUrl(campaign)}/${shortname}/data`, {
    credentials: 'include',
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(`Could not save the stunt (${response.status}).`);
}

/* Sheet entries */

// The entry's description is a plain-text copy for linked stunts; unlinked ones keep
// rich text beside it, like aspect backstories (src/fate/richFields.ts).
export type StuntEntry = Record<string, string>;

export const linkOf = (entry: StuntEntry): string | undefined => entry[STUNT_LINK_KEY] || undefined;

// Brings the copies of linked stunts' names and descriptions on a sheet up to date.
export function withStuntCopies(data: unknown, live: { [shortname: string]: Stunt }): unknown {
  if (!data || typeof data !== 'object') return data;
  const entries = (data as Record<string, unknown>)[STUNTS_PATH];
  if (!Array.isArray(entries)) return data;
  let changed = false;
  const next = entries.map(entry => {
    const stunt = entry && typeof entry === 'object' ? live[linkOf(entry)!] : undefined;
    if (!stunt || (entry.name === stunt.title && entry.description === stunt.description)) return entry;
    changed = true;
    return { ...entry, name: stunt.title, description: stunt.description };
  });
  return changed ? { ...data, [STUNTS_PATH]: next } : data;
}
