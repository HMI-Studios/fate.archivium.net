import { useEffect, useRef, useState } from 'react';
import type { ConflictKind } from '../fate/combat';
import { planMobHit, type MobHitStep, type MobMember } from '../fate/mobs';

type Props = {
  label: string;
  members: MobMember[];
  // The conflict's kind, whose stress track takes the hit.
  kind?: ConflictKind;
  onApply: (steps: MobHitStep[]) => void;
  onClose: () => void;
};

// A hit on a mob (Fate Core): it takes out one member after another, each one's
// leftover shifts going on to the next, until a member can soak what's left with a
// stress box and whatever consequences their sheet gives them (none, for nameless NPCs
// with theirs set by hand). The GM picks who's hit first; the rest follow in order. The
// consequences planned are named here, as they are when a character takes a hit.
export default function MobHitDialog({ label, members, kind, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [shifts, setShifts] = useState('');
  const [first, setFirst] = useState(members[0]?.tokenId ?? '');
  // Names for the consequences planned, by member and slot.
  const [names, setNames] = useState<{ [key: string]: string }>({});
  const nameKey = (tokenId: string, path: string) => `${tokenId}:${path}`;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const hit = Math.max(0, parseInt(shifts, 10) || 0);
  const start = Math.max(0, members.findIndex(m => m.tokenId === first));
  const ordered = [...members.slice(start), ...members.slice(0, start)];
  const { steps, leftOver } = planMobHit(ordered, hit, kind);
  const out = steps.filter(step => step.takenOut).length;
  const unnamed = steps.some(step => step.consequences.some(slot => !names[nameKey(step.tokenId, slot.path)]?.trim()));

  const apply = () => {
    onApply(steps.map(step => ({
      ...step,
      consequences: step.consequences.map(slot => ({ ...slot, text: names[nameKey(step.tokenId, slot.path)].trim() })),
    })));
    dialog.current?.close();
  };

  return <dialog
    ref={dialog}
    aria-labelledby='mob-hit-title'
    onClose={onClose}
    onClick={e => { if (e.target === dialog.current) dialog.current?.close(); }}
    style={{
      width: 'min(26rem, calc(100vw - 2rem))', padding: '1rem', borderRadius: 8,
      border: '1px solid var(--tab-border-color, #4f4f4f)', background: 'var(--tab-color, #2a2a2a)', color: 'var(--text-color)',
    }}
  >
    <form method='dialog' className='d-flex flex-col gap-2' onSubmit={e => { e.preventDefault(); if (hit > 0 && !unnamed) apply(); }}>
      <h3 id='mob-hit-title' className='ma-0'>{label} takes a hit</h3>
      <small style={{ opacity: 0.8 }}>
        Whatever it takes to take out one member carries on to the next. Members take the
        consequences their sheet gives them: set a monster's stress and consequences by hand
        on its sheet (nameless NPCs have none).
      </small>

      <div className='d-flex gap-2 flex-wrap align-center'>
        <label className='d-flex align-center gap-1'>
          Shifts
          <input type='number' min={1} autoFocus value={shifts} onChange={({ target }) => setShifts(target.value)} style={{ width: '5em' }} />
        </label>
        {members.length > 1 && <label className='d-flex align-center gap-1'>
          Hits
          <select value={first} onChange={({ target }) => setFirst(target.value)} aria-label='Who the hit lands on first'>
            {members.map(m => <option key={m.tokenId} value={m.tokenId}>{m.label}</option>)}
          </select>
          first
        </label>}
      </div>

      {hit > 0 && <>
        <ol className='ma-0 d-flex flex-col gap-0' style={{ paddingLeft: '1.25rem' }}>
          {steps.map(step => <li key={step.tokenId}>
            <b>{step.label}</b>{' '}
            {step.takenOut
              ? <>is <b>taken out</b> <small style={{ opacity: 0.7 }}>({step.shifts} {step.shifts === 1 ? 'shift' : 'shifts'})</small></>
              : <>{[
                ...(step.box ? [`marks stress box ${step.box.index + 1}`] : []),
                ...(step.consequences.length ? [`takes ${step.consequences.map(slot => `${slot.label.toLowerCase()} (${slot.badge})`).join(' and ')} ${step.consequences.length === 1 ? 'consequence' : 'consequences'}`] : []),
              ].join(' and ')}</>}
            {step.consequences.map(slot => <input
              key={slot.path}
              aria-label={`Name ${step.label}'s ${slot.label} consequence`}
              placeholder={`${slot.label} consequence, e.g. Twisted Ankle`}
              value={names[nameKey(step.tokenId, slot.path)] ?? ''}
              onChange={({ target }) => setNames(current => ({ ...current, [nameKey(step.tokenId, slot.path)]: target.value }))}
              style={{ display: 'block', width: '100%', marginTop: 2 }}
            />)}
          </li>)}
        </ol>
        <div role='status'>
          {out === members.length
            ? <><b>The whole mob is taken out</b>{leftOver > 0 && <small style={{ opacity: 0.7 }}> ({leftOver} to spare)</small>}</>
            : out > 0
              ? <b>{out} taken out, {members.length - out} left</b>
              : <b>Hit absorbed</b>}
          {members.length - out === 1 && <small style={{ display: 'block', opacity: 0.8 }}>
            The last one left breaks away from the mob: they can join another mob, or flee.
          </small>}
          {unnamed && <small style={{ display: 'block', opacity: 0.8 }}>Name each consequence to take the hit.</small>}
        </div>
      </>}

      <div className='d-flex gap-1 justify-end'>
        <button type='button' onClick={() => dialog.current?.close()}>Cancel</button>
        <button type='submit' disabled={hit === 0 || unnamed}>Take the hit</button>
      </div>
    </form>
  </dialog>;
}
