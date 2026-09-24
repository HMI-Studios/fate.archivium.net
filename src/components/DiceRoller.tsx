import { useState } from 'react';
import { diceTotal, FATE_SKILLS, ladderLabel, rollTotal, signed, type FateDie, type Roll } from '../fate/dice';
import type { SceneCharacter } from './AspectsPanel';

// An aspect that can be invoked for +2 on a roll.
export type InvokableAspect = {
  id: string;
  name: string;
  freeInvokes: number;
  // Whose it is, for grouping the choices.
  ownerTitle: string;
};

interface Props {
  rolls: Roll[];
  characters: SceneCharacter[];
  skills: { [shortname: string]: { [skill: string]: number } };
  fatePoints: { [shortname: string]: number };
  aspects: InvokableAspect[];
  canRoll: boolean;
  onRoll: (roll: Pick<Roll, 'character' | 'skill' | 'skillRating' | 'modifier'>) => void;
  onInvoke: (rollId: string, aspectId: string) => void;
}

const FACES: { [die: number]: string } = { [-1]: '−', 0: '', 1: '+' };

function Die({ value }: { value: FateDie }) {
  return (
    <span
      aria-label={value === 1 ? 'plus' : value === -1 ? 'minus' : 'blank'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '1.6em', height: '1.6em', border: '1px solid var(--light-text-color, #888)', borderRadius: 4,
        fontWeight: 'bold', fontSize: '1.1em',
      }}
    >{FACES[value]}</span>
  );
}

function RollEntry({ roll, aspects, fatePoints, canInvoke, onInvoke }: {
  roll: Roll,
  aspects: InvokableAspect[],
  fatePoints: number | undefined,
  canInvoke: boolean,
  onInvoke: (aspectId: string) => void,
}) {
  const [choosing, setChoosing] = useState(false);
  const [pick, setPick] = useState('');
  const total = rollTotal(roll);
  const who = roll.character?.title ?? roll.by;
  const parts = [
    `dice ${signed(diceTotal(roll.dice))}`,
    roll.skill ? `${roll.skill} ${signed(roll.skillRating)}` : null,
    roll.modifier ? `modifier ${signed(roll.modifier)}` : null,
    ...roll.invokes.map(i => `${i.aspect} +2 (${i.paidWith})`),
  ].filter(Boolean);

  const pickAspect = aspects.find(a => a.id === pick);
  const noFatePoint = pickAspect && pickAspect.freeInvokes === 0 && roll.character && (fatePoints ?? 0) <= 0;

  return (
    <li className='d-flex flex-col gap-1' style={{ borderTop: '1px solid rgba(128, 128, 128, 0.3)', paddingTop: 6 }}>
      <small>
        <b>{who}</b>{roll.skill && ` · ${roll.skill}`}
        {roll.character && roll.by && <span style={{ opacity: 0.7 }}> (rolled by {roll.by})</span>}
      </small>
      <div className='d-flex align-center gap-1 flex-wrap'>
        {roll.dice.map((die, i) => <Die key={i} value={die} />)}
        <b className='ml-1' style={{ fontSize: '1.15em' }}>{ladderLabel(total)}</b>
      </div>
      <small style={{ opacity: 0.8 }}>{parts.join(', ')}</small>
      {canInvoke && !choosing && aspects.length > 0 && (
        <button className='mt-0' onClick={() => setChoosing(true)}>Invoke an aspect (+2)</button>
      )}
      {canInvoke && choosing && (
        <div className='d-flex flex-col gap-1'>
          <select aria-label='Aspect to invoke' value={pick} onChange={({ target }) => setPick(target.value)}>
            <option value=''>Choose an aspect…</option>
            {aspects.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.ownerTitle}) · {a.freeInvokes > 0 ? 'free invoke' : 'fate point'}
              </option>
            ))}
          </select>
          {noFatePoint && <small className='color-error'>{who} has no fate points left.</small>}
          <div className='d-flex gap-1'>
            <button disabled={!pick || Boolean(noFatePoint)} onClick={() => { onInvoke(pick); setPick(''); setChoosing(false); }}>Invoke</button>
            <button onClick={() => { setPick(''); setChoosing(false); }}>Cancel</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function DiceRoller({ rolls, characters, skills, fatePoints, aspects, canRoll, onRoll, onInvoke }: Props) {
  const [character, setCharacter] = useState('');
  const [skill, setSkill] = useState('');
  const [modifier, setModifier] = useState(0);

  const chosen = characters.find(c => c.shortname === character);
  const ratings = chosen ? skills[chosen.shortname] ?? {} : {};
  // Rated skills first, best first; everything else is Mediocre (+0).
  const skillOptions = [...FATE_SKILLS].sort((a, b) => (ratings[b] ?? 0) - (ratings[a] ?? 0));

  const roll = () => onRoll({
    ...(chosen ? { character: { shortname: chosen.shortname, title: chosen.title } } : {}),
    ...(skill ? { skill } : {}),
    skillRating: skill ? ratings[skill] ?? 0 : 0,
    modifier,
  });

  return (
    <div className='d-flex flex-col gap-2'>
      <h3 className='ma-0'>Dice</h3>
      {canRoll && (
        <form className='d-flex flex-col gap-1' onSubmit={e => { e.preventDefault(); roll(); }}>
          <div className='d-flex gap-1 flex-wrap'>
            <select aria-label='Rolling character' value={character} onChange={({ target }) => { setCharacter(target.value); setSkill(''); }}>
              <option value=''>No character</option>
              {characters.map(c => (
                <option key={c.shortname} value={c.shortname}>
                  {c.title}{fatePoints[c.shortname] !== undefined && ` (${fatePoints[c.shortname]} FP)`}
                </option>
              ))}
            </select>
            <select aria-label='Skill' value={skill} onChange={({ target }) => setSkill(target.value)}>
              <option value=''>No skill</option>
              {skillOptions.map(s => <option key={s} value={s}>{s} ({signed(ratings[s] ?? 0)})</option>)}
            </select>
          </div>
          <label className='d-flex align-center gap-1'>
            <small>Modifier</small>
            <input type='number' value={modifier} onChange={({ target }) => setModifier(Number(target.value) || 0)} style={{ width: '4em' }} />
          </label>
          <button type='submit'>Roll 4dF</button>
        </form>
      )}
      {rolls.length === 0 && <small>No rolls yet.</small>}
      <ul className='ma-0 pa-0 d-flex flex-col gap-1' style={{ listStyle: 'none' }}>
        {rolls.map(r => (
          <RollEntry
            key={r.id}
            roll={r}
            aspects={aspects}
            fatePoints={r.character ? fatePoints[r.character.shortname] : undefined}
            canInvoke={canRoll}
            onInvoke={aspectId => onInvoke(r.id, aspectId)}
          />
        ))}
      </ul>
    </div>
  );
}
