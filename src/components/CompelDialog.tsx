import { useEffect, useRef } from 'react';
import type { Compel } from '../fate/compels';

// A compel waiting on the viewer's character (see fate/compels.ts): accepting it takes a
// fate point, refusing it pays one, which a character with none left can't do.
export default function CompelDialog({ compel, fatePoints, onAnswer, onLater }: {
  compel: Compel,
  // The character's fate points, once their sheet has loaded.
  fatePoints: number | undefined,
  onAnswer: (accept: boolean) => void,
  // Puts it off: it waits in the top bar until answered.
  onLater: () => void,
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const broke = fatePoints !== undefined && fatePoints <= 0;

  return <dialog
    ref={dialog}
    aria-labelledby='compel-title'
    // Escape puts it off rather than answering it.
    onCancel={e => { e.preventDefault(); onLater(); }}
    style={{
      width: 'min(26rem, calc(100vw - 2rem))', padding: '1rem', borderRadius: 8,
      border: '1px solid var(--tab-border-color, #4f4f4f)', background: 'var(--tab-color, #2a2a2a)', color: 'var(--text-color)',
    }}
  >
    <div className='d-flex flex-col gap-2'>
      <h3 id='compel-title' className='ma-0'>{compel.character.title} is compelled</h3>
      <div><i>{compel.aspect}</i></div>
      {compel.complication && <p className='ma-0' style={{ whiteSpace: 'pre-wrap' }}>{compel.complication}</p>}
      <small style={{ opacity: 0.8 }}>
        {compel.by || 'The GM'} offers you a fate point to let this complicate things. Refusing it costs you one.
      </small>
      <div>Fate points: <b>{fatePoints ?? '…'}</b></div>
      <div className='d-flex gap-2 flex-wrap' style={{ justifyContent: 'center' }}>
        <button
          disabled={broke || fatePoints === undefined}
          title={broke ? `${compel.character.title} has no fate points left to refuse it with` : undefined}
          onClick={() => onAnswer(false)}
        >Refuse<br/>(−1 fate point)</button>
        <button disabled={fatePoints === undefined} onClick={() => onAnswer(true)}><b>Accept<br/>(+1 fate point)</b></button>
      </div>
      <div className='d-flex gap-2 flex-wrap' style={{ justifyContent: 'center' }}>
        <button onClick={onLater}>Decide later</button>
      </div>
      {broke && <small style={{ opacity: 0.8 }}>With no fate points left, {compel.character.title} can't refuse.</small>}
    </div>
  </dialog>;
}
