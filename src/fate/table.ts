import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { ARCHIVIUM_URL } from '../App';
import { isLive, useSyncedDoc, type SyncStatus } from '../sync';
import { ROLL_LOG_SIZE, type Roll } from './dice';
import { FATE_TABLE_LAYOUT, FATE_TABLE_LAYOUT_ID } from './tableLayout';

// Campaign-wide state that players can write: the dice log and the journal. The
// `room/` doc is GM-only, so this lives in a fixed "Table Notes" item instead: its
// `scene/<campaign>/table-notes` doc is authorized by the item's permissions like any
// scene (players with write access can write, spectators can read), and the item gives
// the state somewhere to be saved: obj_data.rollLog, and the journal as the item's
// 'fate-table' layout tab so Archivium shows it too (see fate/tableLayout.ts).

export const TABLE_ITEM = 'table-notes';
const TABLE_TITLE = 'Table Notes';
const ROLL_LOG_KEY = 'rollLog';

const itemUrl = (campaign: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}/items/${TABLE_ITEM}`;
const universeUrl = (campaign: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}`;

type SavedTable = { rolls: Roll[], journal: string };

const parseObjData = (objData: unknown): Record<string, any> =>
  (typeof objData === 'string' ? JSON.parse(objData) : objData) ?? {};

function journalOf(objData: Record<string, any>): string {
  const journal = objData.layoutTabs?.[FATE_TABLE_LAYOUT_ID]?.journal;
  return typeof journal === 'string' ? journal : '';
}

async function putData(url: string, data: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/data`, {
    credentials: 'include',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Couldn't save the table notes (${response.status}).`);
}

// Campaigns made before the journal existed don't have its tab type yet; a GM adds it.
// The data endpoint merges top-level keys only, so the stored tab types are kept.
async function ensureTabType(campaign: string, universeObjData: Record<string, any>): Promise<void> {
  const tabTypes = universeObjData.tabTypes ?? {};
  if (tabTypes[FATE_TABLE_LAYOUT_ID]) return;
  await putData(universeUrl(campaign), { tabTypes: { ...tabTypes, [FATE_TABLE_LAYOUT_ID]: FATE_TABLE_LAYOUT } });
}

// Makes sure the campaign has its table item, creating it if this user may. Resolves
// to the saved state, or null if there's no table item to use.
async function ensureTableItem(campaign: string, gm: boolean): Promise<SavedTable | null> {
  const universe = await fetch(universeUrl(campaign), { credentials: 'include' });
  if (!universe.ok) return null;
  const universeObjData = parseObjData((await universe.json()).obj_data);
  if (gm) ensureTabType(campaign, universeObjData).catch(() => {});

  const existing = await fetch(itemUrl(campaign), { credentials: 'include' });
  if (existing.ok) {
    const objData = parseObjData((await existing.json()).obj_data);
    return { rolls: Array.isArray(objData[ROLL_LOG_KEY]) ? objData[ROLL_LOG_KEY] : [], journal: journalOf(objData) };
  }
  // Archivium answers 403 rather than 404 for items that don't exist, so either may
  // mean it hasn't been created yet; creating it fails harmlessly if we may not.
  if (existing.status !== 404 && existing.status !== 403) return null;

  // File it as a note if the campaign has that category (Fate campaigns do).
  const cats = Object.keys(universeObjData.cats ?? {});
  const itemType = cats.includes('note') ? 'note' : cats[0];
  if (!itemType) return null;
  const created = await fetch(`${universeUrl(campaign)}/items`, {
    credentials: 'include',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: TABLE_TITLE,
      shortname: TABLE_ITEM,
      item_type: itemType,
      obj_data: { [ROLL_LOG_KEY]: [], layoutTabs: { [FATE_TABLE_LAYOUT_ID]: { journal: '' } } },
    }),
  });
  // Someone else may have created it at the same moment.
  const empty = { rolls: [], journal: '' };
  if (created.ok) return empty;
  return (await fetch(itemUrl(campaign), { credentials: 'include' })).ok ? empty : null;
}

// Saves the table's live state, keeping any other layout tabs the item has.
async function saveTable(campaign: string, rolls: Roll[], journal: string): Promise<void> {
  const response = await fetch(itemUrl(campaign), { credentials: 'include' });
  if (!response.ok) throw new Error(`Couldn't load the table notes (${response.status}).`);
  const layoutTabs = parseObjData((await response.json()).obj_data).layoutTabs ?? {};
  await putData(itemUrl(campaign), {
    [ROLL_LOG_KEY]: rolls.sort((a, b) => b.at - a.at).slice(0, ROLL_LOG_SIZE),
    layoutTabs: { ...layoutTabs, [FATE_TABLE_LAYOUT_ID]: { ...layoutTabs[FATE_TABLE_LAYOUT_ID], journal } },
  });
}

// Every client that finds the live journal empty seeds it from the saved one. Seeding
// from a doc with a fixed client id gives everyone the same insert (same id, same
// content), which Yjs applies only once, so clients seeding at the same time don't
// duplicate the text.
function seedJournal(ydoc: Y.Doc, journal: string) {
  const seed = new Y.Doc();
  seed.clientID = 0;
  seed.getText('journal').insert(0, journal);
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seed), 'seed');
  seed.destroy();
}

export type TableDoc = {
  rolls: Roll[];
  // The live map of rolls, when this viewer may add to it.
  writableRolls: Y.Map<Roll> | null;
  // The live journal, once connected (read-only viewers get it too, to follow along).
  journal: Y.Text | null;
  // The saved journal, for when there's no live one.
  savedJournal: string;
  canWrite: boolean;
  status: SyncStatus | 'unavailable';
};

export function useTable(campaign: string, gm: boolean): TableDoc {
  const [saved, setSaved] = useState<SavedTable | null | undefined>(undefined);
  const [liveRolls, setLiveRolls] = useState<Roll[]>([]);
  const seeded = useRef(false);

  useEffect(() => {
    setSaved(undefined);
    seeded.current = false;
    ensureTableItem(campaign, gm).then(setSaved).catch(() => setSaved(null));
  }, [campaign]);

  const doc = useSyncedDoc(saved ? `scene/${campaign}/${TABLE_ITEM}` : null);
  const ydoc = doc?.ydoc;
  const yRolls = ydoc?.getMap<Roll>('rolls');
  const yJournal = ydoc?.getText('journal');
  const live = isLive(doc?.status);
  const canWrite = live && !doc?.readOnly;

  useEffect(() => {
    if (!ydoc || !yRolls || !yJournal || !doc) return;
    const update = () => setLiveRolls(Array.from(yRolls.values()).sort((a, b) => b.at - a.at));
    yRolls.observe(update);
    update();

    // Save our own changes; updates from the server were saved by whoever made them.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = (_: Uint8Array, origin: unknown) => {
      if (origin === doc.provider || origin === 'seed') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveTable(campaign, Array.from(yRolls.values()), yJournal.toString()).catch(() => {});
      }, 800);
    };
    ydoc.on('update', onUpdate);
    return () => {
      yRolls.unobserve(update);
      ydoc.off('update', onUpdate);
      if (timer) clearTimeout(timer);
    };
  }, [ydoc]);

  // Seed the live doc from the saved state if nobody has opened the table since the
  // server started. Rolls are keyed by id, so clients seeding at once converge.
  useEffect(() => {
    if (!canWrite || !ydoc || !yRolls || !yJournal || !saved || seeded.current) return;
    seeded.current = true;
    if (yRolls.size === 0) ydoc.transact(() => saved.rolls.forEach(roll => yRolls.set(roll.id, roll)), 'seed');
    if (yJournal.length === 0 && saved.journal) seedJournal(ydoc, saved.journal);
  }, [canWrite, ydoc, saved]);

  if (saved === null) return { rolls: [], writableRolls: null, journal: null, savedJournal: '', canWrite: false, status: 'unavailable' };
  return {
    rolls: live && (liveRolls.length > 0 || canWrite) ? liveRolls : (saved?.rolls ?? []),
    writableRolls: canWrite && yRolls ? yRolls : null,
    journal: live && yJournal ? yJournal : null,
    savedJournal: saved?.journal ?? '',
    canWrite,
    status: doc?.status ?? 'connecting',
  };
}
