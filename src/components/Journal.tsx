import { useEffect, useMemo, useState } from 'react';
import type { Body } from '../fate/body';
import { ensureJournal, fetchJournal, fetchJournalItem, JOURNAL_ITEM, saveJournal } from '../fate/journal';
import type { TableDoc } from '../fate/table';
import { cursorUser, isLive, useSyncedDoc } from '../sync';
import { debounce } from '../util';
import RichText from './RichText';

// The campaign journal (fate/journal.ts): rich text everyone at the table can write in
// at once, in the journal item's live document. Those who can't open that document
// (spectators, or everyone while the sync server is down) see the last saved journal,
// reloaded whenever someone saves it.

interface Props {
  campaign: string;
  table: TableDoc;
  // The viewer's Archivium username, shown by their cursor.
  userName?: string;
  // Roughly how many lines tall the empty journal is.
  rows?: number;
  // Archivium's editor toolbar, for when the journal has the page to itself.
  toolbar?: boolean;
}

export default function Journal({ campaign, table, userName, rows = 16, toolbar }: Props) {
  // The saved journal; null if there's none to use.
  const [saved, setSaved] = useState<Body | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSaved(undefined);
    ensureJournal(campaign).then(setSaved).catch(() => setSaved(null));
  }, [campaign]);

  // Someone saved the journal: catch up, for those not following its live document.
  useEffect(() => {
    if (table.journalSaved === null || !saved) return;
    fetchJournal(campaign).then(setSaved).catch(() => {});
  }, [table.journalSaved]);

  const doc = useSyncedDoc(saved ? `item/${campaign}/${JOURNAL_ITEM}` : null);
  const live = useMemo(() => doc && {
    ydoc: doc.ydoc,
    provider: doc.provider,
    loadItem: () => fetchJournalItem(campaign),
    ...(userName ? { user: cursorUser(doc.provider, userName) } : {}),
  }, [doc?.ydoc, userName]);

  // Changes others make are saved by them.
  const onEdit = (body: Body, remote: boolean) => {
    if (remote) return;
    debounce(`journal-save-${campaign}`, () => {
      saveJournal(campaign, body)
        .then(() => { setError(null); table.stampJournal(); })
        .catch(e => setError(e instanceof Error ? e.message : String(e)));
    }, 800);
  };

  if (saved === undefined) return <div className='loader' />;
  if (saved === null) return <small>The journal isn't available in this campaign.</small>;

  const editing = doc && isLive(doc.status) && !doc.readOnly && live;
  const common = {
    ariaLabel: 'Journal',
    campaign,
    value: saved,
    article: true,
    placeholder: editing ? 'Quests, clues, names, loot… anyone at the table can write here.' : 'Nothing in the journal yet.',
  };
  return (
    <div className='d-flex flex-col gap-1 fate-journal'>
      <style>{`.fate-journal .fate-rich .tiptap { min-height: ${rows * 1.4}rem; }`}</style>
      {editing
        ? <RichText key='live' {...common} live={live} onChange={onEdit} toolbar={toolbar} />
        : <RichText key='saved' {...common} readOnly />}
      {error && <small className='color-error'>{error}</small>}
      {(!doc || doc.status === 'connecting') && <small>Connecting…</small>}
      {doc?.status === 'offline' && (table.status === 'offline'
        ? <small>Live sync is unavailable, so this is the last saved journal.</small>
        : <small>You can read the journal but not write in it. It updates as others write.</small>)}
    </div>
  );
}
