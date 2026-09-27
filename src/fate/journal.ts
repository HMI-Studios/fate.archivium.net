import { ARCHIVIUM_URL } from '../App';
import { withDefaultTabs } from '../layout/typeConfig';
import { asBody, bodyFromText, type Body } from './body';
import { TABLE_ITEM } from './table';

// The campaign journal: the main text of a "Journal" note of its own, so Archivium shows
// and edits it like any item's text. The app edits it in the item's live document, as
// Archivium's editor does, so everyone writing at once (here or in Archivium) merges.
//
// Journals used to be plain text on the Table Notes item (fate/table.ts), in its
// 'fate-table' layout tab. Whoever first opens the journal of such a campaign creates the
// note from that text, and clears the old copy.

export const JOURNAL_ITEM = 'table-journal';
const JOURNAL_TITLE = 'Journal';
const LEGACY_TAB = 'fate-table';

const universeUrl = (campaign: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}`;
const journalUrl = (campaign: string) => `${universeUrl(campaign)}/items/${JOURNAL_ITEM}`;

const parseObjData = (objData: unknown): Record<string, any> =>
  (typeof objData === 'string' ? JSON.parse(objData) : objData) ?? {};

const bodyOf = (item: Record<string, any>): Body => asBody(parseObjData(item.obj_data).body) ?? bodyFromText('');

// The journal's item, as the API returns it.
export async function fetchJournalItem(campaign: string): Promise<Record<string, any>> {
  const response = await fetch(journalUrl(campaign), { credentials: 'include' });
  if (!response.ok) throw new Error(`Couldn't load the journal (${response.status}).`);
  return response.json();
}

export async function fetchJournal(campaign: string): Promise<Body> {
  return bodyOf(await fetchJournalItem(campaign));
}

// Moves a journal kept on the Table Notes item into a new body. Returns its text, and
// how to clear the old copy once the new one is saved.
async function legacyJournal(campaign: string): Promise<{ text: string, clear: () => Promise<unknown> }> {
  const none = { text: '', clear: async () => {} };
  const response = await fetch(`${universeUrl(campaign)}/items/${TABLE_ITEM}`, { credentials: 'include' });
  if (!response.ok) return none;
  const layoutTabs = parseObjData((await response.json()).obj_data).layoutTabs;
  if (!layoutTabs || !(LEGACY_TAB in layoutTabs)) return none;
  const { [LEGACY_TAB]: legacy, ...rest } = layoutTabs;
  return {
    text: typeof legacy?.journal === 'string' ? legacy.journal : '',
    // The data endpoint merges top-level keys only, so the item's other tabs are sent back.
    clear: () => fetch(`${universeUrl(campaign)}/items/${TABLE_ITEM}/data`, {
      credentials: 'include',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layoutTabs: rest }),
    }),
  };
}

// Makes sure the campaign has its journal, creating it if this user may. Resolves to the
// saved text, or null if there's no journal to use.
export async function ensureJournal(campaign: string): Promise<Body | null> {
  const existing = await fetch(journalUrl(campaign), { credentials: 'include' });
  if (existing.ok) return bodyOf(await existing.json());
  // Archivium answers 403 rather than 404 for items that don't exist, so either may
  // mean it hasn't been created yet; creating it fails harmlessly if we may not.
  if (existing.status !== 404 && existing.status !== 403) return null;

  const universe = await fetch(universeUrl(campaign), { credentials: 'include' });
  if (!universe.ok) return null;
  const universeObjData = parseObjData((await universe.json()).obj_data);
  // File it as a note if the campaign has that category (Fate campaigns do).
  const cats = Object.keys(universeObjData.cats ?? {});
  const itemType = cats.includes('note') ? 'note' : cats[0];
  if (!itemType) return null;

  const legacy = await legacyJournal(campaign);
  const body = bodyFromText(legacy.text);
  const created = await fetch(`${universeUrl(campaign)}/items`, {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: JOURNAL_TITLE,
      shortname: JOURNAL_ITEM,
      item_type: itemType,
      obj_data: withDefaultTabs({ body }, universeObjData, itemType),
    }),
  });
  if (created.ok) {
    await legacy.clear().catch(() => {});
    return body;
  }
  // Someone else may have created it at the same moment.
  const again = await fetch(journalUrl(campaign), { credentials: 'include' });
  return again.ok ? bodyOf(await again.json()) : null;
}

// Replaces the journal's text. The data endpoint merges top-level obj_data keys, so the
// item's other content is kept.
export async function saveJournal(campaign: string, body: Body): Promise<void> {
  const response = await fetch(`${journalUrl(campaign)}/data`, {
    credentials: 'include',
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(`Couldn't save the journal (${response.status}).`);
}
