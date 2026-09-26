import { useEffect, useRef, useState } from 'react';
import { loadPersonalNote, noteUrl, savePersonalNote, type NoteUser, type PersonalNote } from '../fate/notes';

type Status = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  campaign: string;
  item: string;
  itemTitle: string;
  user: NoteUser;
  rows?: number;
  // Shows a close button, for when the notes are in a panel of their own.
  onClose?: () => void;
}

// The user's private notes on a character, NPC or monster, saved as they type.
export default function PersonalNotes({ campaign, item, itemTitle, user, rows = 4, onClose }: Props) {
  const [note, setNote] = useState<PersonalNote | null>(null);
  const [text, setText] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  // Saves run one after another, so a new note is only made once.
  const noteRef = useRef<PersonalNote | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<{ text: string, timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setLoadError(null);
    setStatus('idle');
    loadPersonalNote(campaign, item, itemTitle, user).then(loaded => {
      if (cancelled) return;
      noteRef.current = loaded;
      setNote(loaded);
      setText(loaded.text);
    }).catch(error => { if (!cancelled) setLoadError(error.message); });
    return () => {
      cancelled = true;
      flush();
    };
  }, [campaign, item, user.id]);

  const save = (next: string) => {
    queue.current = queue.current.then(async () => {
      const current = noteRef.current;
      if (!current || current.text === next) return;
      // Nothing is made for notes that were never written.
      if (!current.uuid && !next.trim()) return;
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
    const next = pending.current.text;
    pending.current = null;
    save(next);
  };

  const change = (next: string) => {
    setText(next);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { text: next, timer: setTimeout(flush, 800) };
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

  return <div className='d-flex flex-col gap-1'>
    <div className='d-flex justify-between align-center gap-2'>
      <b>My notes</b>
      <div className='d-flex align-center gap-2'>
        <small className={status === 'error' ? 'color-error' : undefined} style={{ color: status === 'error' ? undefined : 'var(--light-text-color)' }}>{statusText}</small>
        {onClose && <button type='button' onClick={onClose} aria-label='Close my notes' title='Close (your notes are kept)'>×</button>}
      </div>
    </div>
    {loadError && <span className='color-error'>{loadError}</span>}
    {!loadError && !note && <small style={{ color: 'var(--light-text-color)' }}>Loading...</small>}
    {note && !note.plain && note.uuid && <>
      <div style={{ whiteSpace: 'pre-wrap' }}>{note.text}</div>
      <small style={{ color: 'var(--light-text-color)' }}>
        This note has formatting that can't be edited here: <a className='link link-animated' href={noteUrl(note.uuid)}>edit it in Archivium</a>.
      </small>
    </>}
    {note && note.plain && <>
      <textarea
        aria-label={`My notes on ${itemTitle}`}
        placeholder={`Anything you want to remember about ${itemTitle}`}
        value={text}
        rows={rows}
        onChange={({ target }) => change(target.value)}
        onBlur={flush}
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '0.5rem', font: 'inherit' }}
      />
      {hint}
    </>}
  </div>;
}
