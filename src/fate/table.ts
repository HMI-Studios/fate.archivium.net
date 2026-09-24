import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { ARCHIVIUM_URL } from '../App';
import { isLive, useSyncedDoc, type SyncStatus } from '../sync';
import type { Roll } from './dice';

// Campaign-wide state that players can write, like the dice log. The `room/` doc is
// GM-only, so this lives in a fixed "Table Notes" item instead: its `scene/<campaign>/
// table-notes` doc is authorized by the item's permissions like any scene (players
// with write access can write, spectators can read), and the item gives the state
// somewhere to be saved (obj_data.rollLog).

export const TABLE_ITEM = 'table-notes';
const TABLE_TITLE = 'Table Notes';
const ROLL_LOG_KEY = 'rollLog';

const itemUrl = (campaign: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}/items/${TABLE_ITEM}`;

// Makes sure the campaign has its table item, creating it if this user may. Resolves
// to the saved roll log, or null if there's no table item to use.
async function ensureTableItem(campaign: string): Promise<Roll[] | null> {
  const existing = await fetch(itemUrl(campaign), { credentials: 'include' });
  if (existing.ok) {
    const data = await existing.json();
    const objData = typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data;
    return Array.isArray(objData?.[ROLL_LOG_KEY]) ? objData[ROLL_LOG_KEY] : [];
  }
  // Archivium answers 403 rather than 404 for items that don't exist, so either may
  // mean it hasn't been created yet; creating it fails harmlessly if we may not.
  if (existing.status !== 404 && existing.status !== 403) return null;

  // File it as a note if the campaign has that category (Fate campaigns do).
  const universe = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaign}`, { credentials: 'include' });
  if (!universe.ok) return null;
  const cats = Object.keys((await universe.json()).obj_data?.cats ?? {});
  const itemType = cats.includes('note') ? 'note' : cats[0];
  if (!itemType) return null;
  const created = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaign}/items`, {
    credentials: 'include',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: TABLE_TITLE, shortname: TABLE_ITEM, item_type: itemType, obj_data: { [ROLL_LOG_KEY]: [] } }),
  });
  // Someone else may have created it at the same moment.
  if (created.ok) return [];
  return (await fetch(itemUrl(campaign), { credentials: 'include' })).ok ? [] : null;
}

export type TableDoc = {
  rolls: Roll[];
  // The live map of rolls, when this viewer may add to it.
  writableRolls: Y.Map<Roll> | null;
  status: SyncStatus | 'unavailable';
};

export function useTable(campaign: string): TableDoc {
  const [savedRolls, setSavedRolls] = useState<Roll[] | null | undefined>(undefined);
  const [liveRolls, setLiveRolls] = useState<Roll[]>([]);
  const seeded = useRef(false);

  useEffect(() => {
    setSavedRolls(undefined);
    seeded.current = false;
    ensureTableItem(campaign).then(setSavedRolls).catch(() => setSavedRolls(null));
  }, [campaign]);

  const doc = useSyncedDoc(savedRolls ? `scene/${campaign}/${TABLE_ITEM}` : null);
  const ydoc = doc?.ydoc;
  const yRolls = ydoc?.getMap<Roll>('rolls');
  const live = isLive(doc?.status);
  const canWrite = live && !doc?.readOnly;

  useEffect(() => {
    if (!ydoc || !yRolls || !doc) return;
    const update = () => setLiveRolls(Array.from(yRolls.values()).sort((a, b) => b.at - a.at));
    yRolls.observe(update);
    update();

    // Save our own changes; updates from the server were saved by whoever made them.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = (_: Uint8Array, origin: unknown) => {
      if (origin === doc.provider) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fetch(`${itemUrl(campaign)}/data`, {
          credentials: 'include',
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ [ROLL_LOG_KEY]: Array.from(yRolls.values()) }),
        }).catch(() => {});
      }, 500);
    };
    ydoc.on('update', onUpdate);
    return () => {
      yRolls.unobserve(update);
      ydoc.off('update', onUpdate);
      if (timer) clearTimeout(timer);
    };
  }, [ydoc]);

  // Seed the live doc from the saved log if nobody has opened the table since the
  // server started. Rolls are keyed by id, so clients seeding at once converge.
  useEffect(() => {
    if (!canWrite || !ydoc || !yRolls || !savedRolls || seeded.current) return;
    seeded.current = true;
    if (yRolls.size === 0) ydoc.transact(() => savedRolls.forEach(roll => yRolls.set(roll.id, roll)));
  }, [canWrite, ydoc, savedRolls]);

  if (savedRolls === null) return { rolls: [], writableRolls: null, status: 'unavailable' };
  return {
    rolls: live && (liveRolls.length > 0 || canWrite) ? liveRolls : (savedRolls ?? []),
    writableRolls: canWrite && yRolls ? yRolls : null,
    status: doc?.status ?? 'connecting',
  };
}
