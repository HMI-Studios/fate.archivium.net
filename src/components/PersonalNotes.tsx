import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Body } from '../fate/body';
import { isEmptyBody, loadPersonalNote, noteUrl, savePersonalNote, type NoteUser, type PersonalNote } from '../fate/notes';

// Archivium's editor is big, so it's only loaded once someone opens their notes.
const RichNoteEditor = lazy(() => import('./RichNoteEditor'));

// Archivium's editor toolbar sticks below Archivium's navbar; here it's in a panel of
// its own, so it sticks to the panel's top, and it's a little smaller to fit.
const EDITOR_CSS = `
.personal-notes .tiptap-navbar { top: 0; }
.personal-notes .tiptap-navbar button { font-size: 1.25rem; }
.personal-notes .tiptap { padding: 0.5rem 0.75rem 0.25rem; }
`;

const sameBody = (a: Body | null, b: Body | null) => JSON.stringify(a) === JSON.stringify(b);

type Status = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  campaign: string;
  item: string;
  itemTitle: string;
  user: NoteUser;
  // How tall the editor can grow before it scrolls.
  maxHeight?: string;
  // Shows a close button, for when the notes are in a panel of their own.
  onClose?: () => void;
}

// The user's private notes on a character, NPC or monster, saved as they type.
export default function PersonalNotes({ campaign, item, itemTitle, user, maxHeight = '16rem', onClose }: Props) {
  const [note, setNote] = useState<PersonalNote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  // Saves run one after another, so a new note is only made once.
  const noteRef = useRef<PersonalNote | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<{ body: Body | null, timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setLoadError(null);
    setStatus('idle');
    loadPersonalNote(campaign, item, itemTitle, user).then(loaded => {
      if (cancelled) return;
      noteRef.current = loaded;
      setNote(loaded);
    }).catch(error => { if (!cancelled) setLoadError(error.message); });
    return () => {
      cancelled = true;
      flush();
    };
  }, [campaign, item, user.id]);

  const save = (next: Body | null) => {
    queue.current = queue.current.then(async () => {
      const current = noteRef.current;
      if (!current || sameBody(current.body, next)) return;
      // Nothing is made for notes that were never written.
      if (!current.uuid && isEmptyBody(next)) return;
      setStatus('saving');
      try {
        noteRef.current = await savePersonalNote(campaign, item, user, current, next);
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    });
  };

  // Saves what's been typed now rather than after the pause.
  const flush = () => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    const next = pending.current.body;
    pending.current = null;
    save(next);
  };

  const change = (next: Body) => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { body: next, timer: setTimeout(flush, 800) };
  };

  // Save before the page goes away, too.
  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  // Known once the note's been made.
  const uuid = noteRef.current?.uuid ?? note?.uuid;
  const hint = <small style={{ color: 'var(--light-text-color)' }}>
    Only you can see these.{uuid && <> They're kept in your notes on Archivium: <a className='link link-animated' href={noteUrl(uuid)}>open in Archivium's editor</a>.</>}
  </small>;

  const statusText = status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : status === 'error' ? 'Failed to save.' : '';

  return <div className='d-flex flex-col gap-1 personal-notes'>
    <style>{EDITOR_CSS}</style>
    <div className='d-flex justify-between align-center gap-2'>
      <b>My notes</b>
      <div className='d-flex align-center gap-2'>
        <small className={status === 'error' ? 'color-error' : undefined} style={{ color: status === 'error' ? undefined : 'var(--light-text-color)' }}>{statusText}</small>
        {onClose && <button type='button' onClick={onClose} aria-label='Close my notes' title='Close (your notes are kept)'>×</button>}
      </div>
    </div>
    {loadError && <span className='color-error'>{loadError}</span>}
    {!loadError && !note && <small style={{ color: 'var(--light-text-color)' }}>Loading...</small>}
    {note && <>
      <div onBlur={flush} aria-label={`My notes on ${itemTitle}`} style={{ maxHeight, overflowY: 'auto' }}>
        <Suspense fallback={<small style={{ color: 'var(--light-text-color)' }}>Loading the editor...</small>}>
          <RichNoteEditor id={`notes-${item}`} campaign={campaign} body={note.body} onChange={change} />
        </Suspense>
      </div>
      {hint}
    </>}
  </div>;
}
