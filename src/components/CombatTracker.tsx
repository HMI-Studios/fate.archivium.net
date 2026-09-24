import { CONFLICT_LABELS, type CombatState, type ConflictKind } from '../fate/combat';
import type { Consequence, StressTrack } from '../fate/stress';

// A token on the map, as shown in the turn order.
export type CombatEntry = {
  tokenId: string;
  label: string;
  color: string;
  portraitUrl: string | null;
  stress: StressTrack[];
  consequences: Consequence[];
};

interface Props {
  state: CombatState | null;
  entries: CombatEntry[];
  // Only the GM runs the turn order; everyone sees it.
  canRun: boolean;
  // Whether the viewer may tick stress boxes (anyone who can edit the scene).
  canMarkStress: boolean;
  onToggleStress: (tokenId: string, path: string, index: number) => void;
  onStart: (kind: ConflictKind) => void;
  onStep: (direction: 1 | -1) => void;
  onEnd: () => void;
  onMove: (tokenId: string, direction: 1 | -1) => void;
  onRemove: (tokenId: string) => void;
  onAdd: (tokenId: string) => void;
}

const CURRENT_COLOR = '#f5c542';

function Face({ entry, size }: { entry: CombatEntry, size: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flex: `0 0 ${size}`,
      background: entry.color, border: `2px solid ${entry.color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#222', fontWeight: 'bold',
    }}>
      {entry.portraitUrl
        ? <img src={entry.portraitUrl} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : entry.label.slice(0, 1).toUpperCase()}
    </div>
  );
}

function StressRow({ track, canMark, onToggle }: { track: StressTrack, canMark: boolean, onToggle: (index: number) => void }) {
  return (
    <span className='d-flex align-center gap-0' title={`${track.label} stress`}>
      <small style={{ width: '0.9rem', opacity: 0.8 }}>{track.label.slice(0, 1)}</small>
      {track.boxes.map((box, i) => (
        <button
          key={i}
          type='button'
          aria-label={`${track.label} stress box ${i + 1}${box.checked ? ', marked' : ''}`}
          aria-pressed={box.checked}
          disabled={!canMark || !box.enabled}
          onClick={() => onToggle(i)}
          style={{
            width: '0.95rem', height: '0.95rem', padding: 0, margin: '0 1px', borderRadius: 2, minWidth: 0,
            opacity: box.enabled ? 1 : 0.25, lineHeight: 1, fontSize: '0.7rem',
            background: box.checked ? 'var(--light-text-color, #ddd)' : undefined,
            color: box.checked ? 'var(--sheet-color, #333)' : undefined,
          }}
        >{box.checked ? '✕' : ''}</button>
      ))}
    </span>
  );
}

export default function CombatTracker({ state, entries, canRun, canMarkStress, onToggleStress, onStart, onStep, onEnd, onMove, onRemove, onAdd }: Props) {
  if (!state) {
    if (!canRun || entries.length === 0) return null;
    return (
      <div className='d-flex align-center gap-2 flex-wrap mb-2'>
        <small>Start a conflict:</small>
        <button onClick={() => onStart('physical')} title='Turn order by Notice, then Athletics, then Physique'>Physical</button>
        <button onClick={() => onStart('mental')} title='Turn order by Empathy, then Rapport, then Will'>Mental</button>
      </div>
    );
  }

  const byId = new Map(entries.map(e => [e.tokenId, e]));
  const inOrder = state.order.filter(id => byId.has(id));
  const outside = entries.filter(e => !state.order.includes(e.tokenId));
  const current = state.current ? byId.get(state.current) : undefined;

  return (
    <section
      aria-label='Turn order'
      className='d-flex flex-col gap-1 mb-2 pa-1'
      style={{ border: '1px solid var(--tab-border-color, #4f4f4f)', borderRadius: 6, background: 'var(--tab-color, #2a2a2a)' }}
    >
      <div className='d-flex align-center gap-2 flex-wrap'>
        <b>{CONFLICT_LABELS[state.kind]}</b>
        <span>Round {state.round}</span>
        {current && <span>· <b>{current.label}</b>'s turn</span>}
        {canRun && (
          <span className='d-flex gap-1 flex-wrap' style={{ marginLeft: 'auto' }}>
            <button onClick={() => onStep(-1)}>‹ Previous</button>
            <button onClick={() => onStep(1)}><b>Next turn ›</b></button>
            <button onClick={() => { if (window.confirm('End the conflict?')) onEnd(); }}>End</button>
          </span>
        )}
      </div>
      <ol className='ma-0 pa-0 d-flex gap-2' style={{ listStyle: 'none', overflowX: 'auto', paddingBottom: 4 }}>
        {inOrder.map((id, i) => {
          const entry = byId.get(id)!;
          const isCurrent = id === state.current;
          return (
            <li
              key={id}
              aria-current={isCurrent ? 'step' : undefined}
              className='d-flex flex-col align-center gap-0'
              style={{
                flex: '0 0 auto', width: '7.5rem', padding: '0.35rem 0.25rem', borderRadius: 6,
                border: `2px solid ${isCurrent ? CURRENT_COLOR : 'transparent'}`,
                background: isCurrent ? 'rgb(245 197 66 / 12%)' : undefined,
              }}
            >
              <small style={{ opacity: 0.7 }}>{i + 1}</small>
              <Face entry={entry} size='2.75rem' />
              <small style={{ textAlign: 'center', overflowWrap: 'anywhere', lineHeight: 1.2, marginTop: 2 }}>{entry.label}</small>
              <div className='d-flex flex-col gap-0 mt-1'>
                {entry.stress.map(track => (
                  <StressRow key={track.path} track={track} canMark={canMarkStress} onToggle={index => onToggleStress(id, track.path, index)} />
                ))}
              </div>
              {entry.consequences.length > 0 && (
                <ul className='ma-0 pa-0 mt-1 w-100' style={{ listStyle: 'none' }}>
                  {entry.consequences.map(c => (
                    <li key={c.label} title={`${c.label} (${c.badge}): ${c.text}`} style={{ fontSize: '0.75rem', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <b>{c.badge}</b> <i>{c.text}</i>
                    </li>
                  ))}
                </ul>
              )}
              {canRun && (
                <span className='d-flex gap-0 mt-1'>
                  <button title='Earlier' aria-label={`Move ${entry.label} earlier`} disabled={i === 0} onClick={() => onMove(id, -1)} style={{ padding: '0 0.35rem' }}>‹</button>
                  <button title='Remove from the conflict' aria-label={`Remove ${entry.label} from the conflict`} onClick={() => onRemove(id)} style={{ padding: '0 0.35rem' }}>×</button>
                  <button title='Later' aria-label={`Move ${entry.label} later`} disabled={i === inOrder.length - 1} onClick={() => onMove(id, 1)} style={{ padding: '0 0.35rem' }}>›</button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {canRun && outside.length > 0 && (
        <div className='d-flex align-center gap-1 flex-wrap'>
          <small>Not in the conflict:</small>
          {outside.map(e => (
            <button key={e.tokenId} onClick={() => onAdd(e.tokenId)} title='Add at the end of the turn order'>+ {e.label}</button>
          ))}
        </div>
      )}
    </section>
  );
}
