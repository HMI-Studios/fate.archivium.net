import { useState } from 'react';
import type { Compel } from '../fate/compels';
import type { Consequence, StressTrack } from '../fate/stress';
import { panelStyle } from './PlayLayout';

// The GM's screen: the GM's own fate points for the scene, and how the players'
// characters in it are doing, with a compel for each.

export type GmScreenCharacter = {
  shortname: string;
  title: string;
  // Who has claimed them, if anyone: the player a compel goes to.
  player: string | null;
  fatePoints: number;
  refresh: number;
  stress: StressTrack[];
  consequences: Consequence[];
  // Their aspects' names, to compel.
  aspects: string[];
};

interface Props {
  gmFatePoints: number;
  // One per PC in the scene, until the GM spends or changes them.
  startingFatePoints: number;
  onAdjustPool?: (delta: number) => void;
  characters: GmScreenCharacter[];
  // The scene's own aspects, which can be compelled too.
  sceneAspects: string[];
  // Recent compels, newest first.
  compels: Compel[];
  canCompel: boolean;
  onCompel: (character: GmScreenCharacter, aspect: string, complication: string) => void;
  onCancelCompel: (id: string) => void;
  onClose: () => void;
}

const STATUS_TEXT: { [status in Compel['status']]: string } = {
  pending: 'waiting',
  accepted: 'accepted',
  refused: 'refused',
  cancelled: 'cancelled',
};

function Boxes({ track }: { track: StressTrack }) {
  const boxes = track.boxes.filter(box => box.enabled);
  return <span title={`${track.label} stress: ${boxes.filter(b => b.checked).length} of ${boxes.length} boxes checked`}>
    {track.label} {boxes.map((box, i) => <span key={i} aria-hidden>{box.checked ? '☒' : '☐'}</span>)}
  </span>;
}

function CharacterRow({ character, sceneAspects, compels, canCompel, onCompel, onCancelCompel }: {
  character: GmScreenCharacter,
  sceneAspects: string[],
  compels: Compel[],
  canCompel: boolean,
  onCompel: Props['onCompel'],
  onCancelCompel: Props['onCancelCompel'],
}) {
  const [composing, setComposing] = useState(false);
  const [aspect, setAspect] = useState('');
  const [complication, setComplication] = useState('');
  const latest = compels.find(c => c.character.shortname === character.shortname);
  const pending = latest?.status === 'pending' ? latest : undefined;
  const choices = [...character.aspects, ...sceneAspects.filter(a => !character.aspects.includes(a))];
  const chosen = aspect || choices[0] || '';

  const send = () => {
    if (!chosen) return;
    onCompel(character, chosen, complication.trim());
    setComposing(false);
    setAspect('');
    setComplication('');
  };

  return <li className='d-flex flex-col gap-1' style={{ borderTop: '1px solid var(--tab-border-color, rgba(128, 128, 128, 0.3))', paddingTop: 6 }}>
    <div className='d-flex align-center gap-1 flex-wrap' style={{ justifyContent: 'space-between' }}>
      <span>
        <b>{character.title}</b>
        <small style={{ opacity: 0.7 }}> {character.player ? `(${character.player})` : '(no player)'}</small>
      </span>
      <span title={`Refresh ${character.refresh}`}><b>{character.fatePoints}</b> FP <small style={{ opacity: 0.7 }}>/ refresh {character.refresh}</small></span>
    </div>
    <small className='d-flex gap-2 flex-wrap'>
      {character.stress.map(track => <Boxes key={track.path} track={track} />)}
    </small>
    {character.consequences.length > 0 && <small>
      {character.consequences.map(c => `${c.label}: ${c.text}`).join(' · ')}
    </small>}
    {pending ? <small className='d-flex align-center gap-1 flex-wrap'>
      Compelled on <i>{pending.aspect}</i>; waiting for {character.player ?? 'their player'}…
      {canCompel && <button onClick={() => onCancelCompel(pending.id)}>Cancel</button>}
    </small> : <>
      {latest && <small style={{ opacity: 0.8 }}>Last compel, on <i>{latest.aspect}</i>: {STATUS_TEXT[latest.status]}</small>}
      {canCompel && !composing && <button
        disabled={!character.player || choices.length === 0}
        title={!character.player ? 'No player has claimed this character to answer a compel' : choices.length === 0 ? 'They have no aspects yet' : 'Offer them a fate point to have an aspect complicate things'}
        onClick={() => setComposing(true)}
        style={{ alignSelf: 'flex-start' }}
      >Compel</button>}
      {canCompel && composing && <form className='d-flex flex-col gap-1' onSubmit={e => { e.preventDefault(); send(); }}>
        <select aria-label='Aspect to compel' value={chosen} onChange={({ target }) => setAspect(target.value)}>
          {character.aspects.length > 0 && <optgroup label={character.title}>
            {character.aspects.map(a => <option key={a} value={a}>{a}</option>)}
          </optgroup>}
          {sceneAspects.some(a => !character.aspects.includes(a)) && <optgroup label='Scene'>
            {sceneAspects.filter(a => !character.aspects.includes(a)).map(a => <option key={a} value={a}>{a}</option>)}
          </optgroup>}
        </select>
        <textarea
          aria-label='What goes wrong'
          placeholder='What goes wrong (optional)'
          rows={2}
          value={complication}
          onChange={({ target }) => setComplication(target.value)}
        />
        <div className='d-flex gap-1'>
          <button type='submit' className='grow-1'><b>Send compel</b></button>
          <button type='button' onClick={() => setComposing(false)}>Cancel</button>
        </div>
      </form>}
    </>}
  </li>;
}

export default function GmScreen({ gmFatePoints, startingFatePoints, onAdjustPool, characters, sceneAspects, compels, canCompel, onCompel, onCancelCompel, onClose }: Props) {
  return <div className='d-flex flex-col gap-2' style={{ ...panelStyle, padding: '0.5rem 0.75rem', width: 'min(24rem, calc(100vw - 1rem))', maxHeight: '70vh', overflowY: 'auto', boxSizing: 'border-box' }}>
    <div className='d-flex align-center gap-1' style={{ justifyContent: 'space-between' }}>
      <b>GM screen</b>
      <button onClick={onClose} aria-label='Close the GM screen'>×</button>
    </div>
    <div className='d-flex align-center gap-1 flex-wrap'>
      <span>Your fate points</span>
      {onAdjustPool && <button onClick={() => onAdjustPool(-1)} disabled={gmFatePoints <= 0} aria-label='One fewer'>−</button>}
      <b style={{ minWidth: '1.5em', textAlign: 'center' }}>{gmFatePoints}</b>
      {onAdjustPool && <button onClick={() => onAdjustPool(1)} aria-label='One more'>+</button>}
    </div>
    <small style={{ opacity: 0.8 }}>
      NPCs and monsters invoke with these. Each scene starts you with one per PC in it
      (this one, {startingFatePoints}).
    </small>
    {characters.length === 0
      ? <small>No players' characters are in this scene.</small>
      : <ul className='ma-0 pa-0 d-flex flex-col gap-1' style={{ listStyle: 'none' }}>
        {characters.map(character => <CharacterRow
          key={character.shortname}
          character={character}
          sceneAspects={sceneAspects}
          compels={compels}
          canCompel={canCompel}
          onCompel={onCompel}
          onCancelCompel={onCancelCompel}
        />)}
      </ul>}
  </div>;
}
