import { useEffect, useRef, useState } from 'react';
import type { ConflictKind } from '../fate/combat';
import type { ConsequenceSlot, StressTrack } from '../fate/stress';

// What taking a hit marks: one stress box, and consequences with their names.
export type Hit = {
  box: { path: string, index: number } | null;
  consequences: { path: string, text: string }[];
};

type Props = {
  label: string;
  stress: StressTrack[];
  // Every consequence slot the character has (filled ones can't take more).
  slots: ConsequenceSlot[];
  // The conflict's kind, whose stress track is suggested first.
  kind?: ConflictKind;
  onApply: (hit: Hit) => void;
  onClose: () => void;
};

// Fate Core: a hit is absorbed by checking at most one stress box, worth its number in
// shifts, and any number of free consequence slots, worth their badges. Whatever's
// left over takes the character out.
export default function TakeHitDialog({ label, stress, slots, kind, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [shifts, setShifts] = useState('');
  const [box, setBox] = useState<Hit['box']>(null);
  const [chosen, setChosen] = useState<{ [path: string]: string }>({});

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const hit = Math.max(0, parseInt(shifts, 10) || 0);
  const boxValue = box ? box.index + 1 : 0;
  const consequenceValue = Object.keys(chosen).reduce((sum, path) => sum + Number(slots.find(s => s.path === path)?.badge ?? 0), 0);
  const remaining = hit - boxValue - consequenceValue;
  const unnamed = Object.values(chosen).some(text => !text.trim());

  // The conflict's own track first (a physical conflict's hits are usually physical).
  const tracks = [...stress].sort((a, b) => Number(b.path.endsWith(`.${kind}`)) - Number(a.path.endsWith(`.${kind}`)));

  const toggleSlot = (path: string) => setChosen(current => {
    if (path in current) {
      const { [path]: _, ...rest } = current;
      return rest;
    }
    return { ...current, [path]: '' };
  });

  const apply = () => {
    onApply({ box, consequences: Object.entries(chosen).map(([path, text]) => ({ path, text: text.trim() })) });
    onClose();
  };

  return <dialog
    ref={dialog}
    aria-labelledby='take-hit-title'
    onClose={onClose}
    onClick={e => { if (e.target === dialog.current) dialog.current?.close(); }}
    style={{
      width: 'min(26rem, calc(100vw - 2rem))', padding: '1rem', borderRadius: 8,
      border: '1px solid var(--tab-border-color, #4f4f4f)', background: 'var(--tab-color, #2a2a2a)', color: 'var(--text-color)',
    }}
  >
    <form method='dialog' className='d-flex flex-col gap-2' onSubmit={e => { e.preventDefault(); if (hit > 0 && !unnamed) apply(); }}>
      <h3 id='take-hit-title' className='ma-0'>{label} takes a hit</h3>

      <label className='d-flex align-center gap-1'>
        Shifts
        <input
          type='number'
          min={1}
          autoFocus
          value={shifts}
          onChange={({ target }) => setShifts(target.value)}
          style={{ width: '5em' }}
        />
      </label>

      {hit > 0 && <>
        <div className='d-flex flex-col gap-1'>
          <b>Stress <small style={{ fontWeight: 'normal', opacity: 0.7 }}>(one box, worth its number)</small></b>
          {tracks.map(track => (
            <div key={track.path} className='d-flex align-center gap-1 flex-wrap'>
              <span style={{ minWidth: '4.5rem' }}>{track.label}</span>
              {track.boxes.map((b, index) => {
                const selected = box?.path === track.path && box.index === index;
                return <button
                  key={index}
                  type='button'
                  aria-pressed={selected}
                  disabled={!b.enabled || b.checked}
                  title={b.checked ? 'Already marked' : !b.enabled ? 'Not available' : `Absorbs ${index + 1}`}
                  onClick={() => setBox(selected ? null : { path: track.path, index })}
                  style={{
                    width: '2rem', fontWeight: 'bold',
                    outline: selected ? '2px solid #f5c542' : undefined,
                    textDecoration: b.checked ? 'line-through' : undefined,
                  }}
                >{index + 1}</button>;
              })}
            </div>
          ))}
        </div>

        <div className='d-flex flex-col gap-1'>
          <b>Consequences</b>
          {slots.map(slot => {
            const taken = Boolean(slot.text.trim());
            const selected = slot.path in chosen;
            return <div key={slot.path} className='d-flex flex-col gap-0'>
              <label className='d-flex align-center gap-1' style={{ opacity: taken ? 0.6 : 1 }}>
                <input type='checkbox' checked={selected} disabled={taken} onChange={() => toggleSlot(slot.path)} />
                <b style={{ width: '1rem' }}>{slot.badge}</b>
                <span>{slot.label}</span>
                {taken && <i style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {slot.text}</i>}
              </label>
              {selected && <input
                aria-label={`Name the ${slot.label} consequence`}
                placeholder='Name the consequence, e.g. Broken Arm'
                autoFocus
                value={chosen[slot.path]}
                onChange={({ target }) => setChosen(current => ({ ...current, [slot.path]: target.value }))}
                style={{ marginLeft: '1.6rem' }}
              />}
            </div>;
          })}
        </div>

        <div role='status' style={{ fontSize: '1.1em' }}>
          {remaining > 0
            ? <><b>{remaining}</b> {remaining === 1 ? 'shift' : 'shifts'} left to absorb</>
            : remaining === 0
              ? <b>Hit absorbed</b>
              : <><b>Hit absorbed</b> <small style={{ opacity: 0.7 }}>({-remaining} to spare)</small></>}
        </div>
        {remaining > 0 && <small style={{ opacity: 0.8 }}>
          Anything that isn't absorbed takes {label} out, unless they concede first.
        </small>}
        {unnamed && <small style={{ opacity: 0.8 }}>Name each consequence to take the hit.</small>}
      </>}

      <div className='d-flex gap-1 justify-end'>
        <button type='button' onClick={() => dialog.current?.close()}>Cancel</button>
        <button type='submit' disabled={hit === 0 || unnamed || (!box && Object.keys(chosen).length === 0)}>
          {remaining > 0 ? 'Mark these (taken out)' : 'Take the hit'}
        </button>
      </div>
    </form>
  </dialog>;
}
