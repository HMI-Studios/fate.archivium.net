import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { TableDoc } from '../fate/table';

// The campaign journal: one shared text everyone at the table can write in at once,
// kept in the table doc (fate/table.ts).

// Where a cursor ends up after a remote change, given the change as a Y.Text delta.
function shiftCursor(pos: number, delta: Y.YTextEvent['delta']): number {
  // `index` walks the text as it was before the change.
  let index = 0;
  let result = pos;
  for (const op of delta) {
    if (op.retain) {
      index += op.retain;
    } else if (op.insert) {
      if (index < pos) result += typeof op.insert === 'string' ? op.insert.length : 1;
    } else if (op.delete) {
      if (index < pos) result -= Math.min(op.delete, pos - index);
      index += op.delete;
    }
  }
  return result;
}

// Applies an edit made in the textarea as the smallest change to the shared text, so
// it merges with what others are typing.
function applyEdit(ytext: Y.Text, next: string) {
  const prev = ytext.toString();
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let prevEnd = prev.length;
  let nextEnd = next.length;
  while (prevEnd > start && nextEnd > start && prev[prevEnd - 1] === next[nextEnd - 1]) {
    prevEnd--;
    nextEnd--;
  }
  ytext.doc!.transact(() => {
    if (prevEnd > start) ytext.delete(start, prevEnd - start);
    if (nextEnd > start) ytext.insert(start, next.slice(start, nextEnd));
  });
}

interface Props {
  table: TableDoc;
  rows?: number;
}

export default function Journal({ table, rows = 16 }: Props) {
  const ytext = table.journal;
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!ytext) return;
    const update = (event?: Y.YTextEvent) => {
      const area = ref.current;
      // Keep our cursor on the same text when someone else types before it.
      if (event && !event.transaction.local && area && document.activeElement === area) {
        pendingSelection.current = [shiftCursor(area.selectionStart, event.delta), shiftCursor(area.selectionEnd, event.delta)];
      }
      setText(ytext.toString());
    };
    ytext.observe(update);
    update();
    return () => ytext.unobserve(update);
  }, [ytext]);

  useLayoutEffect(() => {
    if (!pendingSelection.current || !ref.current) return;
    ref.current.setSelectionRange(...pendingSelection.current);
    pendingSelection.current = null;
  }, [text]);

  // Until someone who can write has the live journal open, it's empty; show the saved one.
  const live = ytext && (text.length > 0 || table.canWrite);
  const value = live ? text : table.savedJournal;
  const editable = Boolean(ytext) && table.canWrite;

  return (
    <div className='d-flex flex-col gap-1'>
      <textarea
        ref={ref}
        aria-label='Journal'
        className='tab-layout-textarea'
        rows={rows}
        value={value}
        readOnly={!editable}
        placeholder={editable ? 'Quests, clues, names, loot… anyone at the table can write here.' : 'Nothing in the journal yet.'}
        onChange={({ target }) => ytext && editable && applyEdit(ytext, target.value)}
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
      />
      {table.status === 'unavailable' && <small>The journal isn't available in this campaign.</small>}
      {table.status === 'offline' && <small>Live sync is unavailable, so this is the last saved journal.</small>}
      {table.status === 'connecting' && <small>Connecting…</small>}
      {live && !editable && <small>You can read the journal but not write in it.</small>}
    </div>
  );
}
