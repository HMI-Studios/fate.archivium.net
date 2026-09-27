import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { ARCHIVIUM_URL } from '../App';
import { isLive, useSyncedDoc, type SyncStatus } from '../sync';
import { ROLL_LOG_SIZE, type Roll } from './dice';

// Campaign-wide state that players can write: the dice log. The `room/` doc is GM-only,
// so this lives in a fixed "Table Notes" item instead: its `scene/<campaign>/table-notes`
// doc is authorized by the item's permissions like any scene (players with write access
// can write, spectators can read), and the item gives the log somewhere to be saved,
// obj_data.rollLog.
//
// The journal is an item of its own (fate/journal.ts), but its live document only lets in
// those who can write it. So that spectators still follow along, whoever saves the journal
// stamps it here, and everyone else reloads it.

export const TABLE_ITEM = 'table-notes';
const TABLE_TITLE = 'Table Notes';
const ROLL_LOG_KEY = 'rollLog';

const itemUrl = (campaign: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}/items/${TABLE_ITEM}`;
const universeUrl = (campaign: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}`;

type SavedTable = { rolls: Roll[] };

const parseObjData = (objData: unknown): Record<string, any> =>
  (typeof objData === 'string' ? JSON.parse(objData) : objData) ?? {};

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

// Makes sure the campaign has its table item, creating it if this user may. Resolves
// to the saved state, or null if there's no table item to use.
async function ensureTableItem(campaign: string): Promise<SavedTable | null> {
  const existing = await fetch(itemUrl(campaign), { credentials: 'include' });
  if (existing.ok) {
    const objData = parseObjData((await existing.json()).obj_data);
    return { rolls: Array.isArray(objData[ROLL_LOG_KEY]) ? objData[ROLL_LOG_KEY] : [] };
  }
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
      obj_data: { [ROLL_LOG_KEY]: [] },
    }),
  });
  // Someone else may have created it at the same moment.
  const empty = { rolls: [] };
  if (created.ok) return empty;
  return (await fetch(itemUrl(campaign), { credentials: 'include' })).ok ? empty : null;
}

// Saves the table's live state.
async function saveTable(campaign: string, rolls: Roll[]): Promise<void> {
  await putData(itemUrl(campaign), {
    [ROLL_LOG_KEY]: rolls.sort((a, b) => b.at - a.at).slice(0, ROLL_LOG_SIZE),
  });
}

export type TableDoc = {
  rolls: Roll[];
  // The live map of rolls, when this viewer may add to it.
  writableRolls: Y.Map<Roll> | null;
  canWrite: boolean;
  status: SyncStatus | 'unavailable';
  // When the journal was last saved (by anyone), to reload it by; null until known.
  journalSaved: number | null;
  // Tells everyone the journal has just been saved.
  stampJournal: () => void;
};

export function useTable(campaign: string): TableDoc {
  const [saved, setSaved] = useState<SavedTable | null | undefined>(undefined);
  const [liveRolls, setLiveRolls] = useState<Roll[]>([]);
  const [journalSaved, setJournalSaved] = useState<number | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    setSaved(undefined);
    seeded.current = false;
    ensureTableItem(campaign).then(setSaved).catch(() => setSaved(null));
  }, [campaign]);

  const doc = useSyncedDoc(saved ? `scene/${campaign}/${TABLE_ITEM}` : null);
  const ydoc = doc?.ydoc;
  const yRolls = ydoc?.getMap<Roll>('rolls');
  // The journal's save stamp (key `saved`). Not `journal`: that was the old plain-text
  // journal, and live docs from before may still have it.
  const yJournal = ydoc?.getMap<number>('journalStamp');
  const live = isLive(doc?.status);
  const canWrite = live && !doc?.readOnly;

  useEffect(() => {
    if (!ydoc || !yRolls || !yJournal || !doc) return;
    const update = () => setLiveRolls(Array.from(yRolls.values()).sort((a, b) => b.at - a.at));
    const updateJournal = () => setJournalSaved(yJournal.get('saved') ?? null);
    yRolls.observe(update);
    yJournal.observe(updateJournal);
    update();
    updateJournal();

    // Save our own changes; updates from the server were saved by whoever made them.
    // (The journal's stamp isn't saved: the journal is.)
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = (_: Uint8Array, origin: unknown) => {
      if (origin === doc.provider || origin === 'seed' || origin === 'stamp') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveTable(campaign, Array.from(yRolls.values())).catch(() => {});
      }, 800);
    };
    ydoc.on('update', onUpdate);
    return () => {
      yRolls.unobserve(update);
      yJournal.unobserve(updateJournal);
      ydoc.off('update', onUpdate);
      if (timer) clearTimeout(timer);
    };
  }, [ydoc]);

  // Seed the live doc from the saved state if nobody has opened the table since the
  // server started. Rolls are keyed by id, so clients seeding at once converge.
  useEffect(() => {
    if (!canWrite || !ydoc || !yRolls || !saved || seeded.current) return;
    seeded.current = true;
    if (yRolls.size === 0) ydoc.transact(() => saved.rolls.forEach(roll => yRolls.set(roll.id, roll)), 'seed');
  }, [canWrite, ydoc, saved]);

  const stampJournal = () => {
    if (canWrite && ydoc && yJournal) ydoc.transact(() => yJournal.set('saved', Date.now()), 'stamp');
  };

  if (saved === null) return { rolls: [], writableRolls: null, canWrite: false, status: 'unavailable', journalSaved: null, stampJournal };
  return {
    rolls: live && (liveRolls.length > 0 || canWrite) ? liveRolls : (saved?.rolls ?? []),
    writableRolls: canWrite && yRolls ? yRolls : null,
    canWrite,
    status: doc?.status ?? 'connecting',
    journalSaved,
    stampJournal,
  };
}
