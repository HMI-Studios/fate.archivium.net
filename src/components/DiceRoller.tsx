import { useRef, useState } from 'react';
import { diceTotal, FATE_SKILLS, isBonus, ladderLabel, rollTotal, signed, type FateDie, type InvokeEffect, type Roll, type RollInvoke } from '../fate/dice';
import type { SceneCharacter } from './AspectsPanel';
import SideDrawer from './SideDrawer';

// An aspect that can be invoked on a roll.
export type InvokableAspect = {
  id: string;
  name: string;
  freeInvokes: number;
  // Whose it is, for telling the choices apart.
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
  onInvoke: (rollId: string, aspectId: string, effect: InvokeEffect) => void;
}

const FACES: { [die: number]: string } = { [-1]: '−', 0: '', 1: '+' };

function Die({ value, small = false }: { value: FateDie, small?: boolean }) {
  return (
    <span
      aria-label={value === 1 ? 'plus' : value === -1 ? 'minus' : 'blank'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: small ? '1.1em' : '1.6em', height: small ? '1.1em' : '1.6em',
        border: '1px solid var(--light-text-color, #888)', borderRadius: 4,
        fontWeight: 'bold', fontSize: small ? '0.8em' : '1.1em',
        opacity: small ? 0.7 : 1,
      }}
    >{FACES[value]}</span>
  );
}

function invokeText(invoke: RollInvoke): string {
  return isBonus(invoke)
    ? `${invoke.aspect} +2 (${invoke.paidWith})`
    : `${invoke.aspect}: reroll (${invoke.paidWith})`;
}

function RollEntry({ roll, aspects, fatePoints, canInvoke, onInvoke }: {
  roll: Roll,
  aspects: InvokableAspect[],
  fatePoints: number | undefined,
  canInvoke: boolean,
  onInvoke: (aspectId: string, effect: InvokeEffect) => void,
}) {
  const [choosing, setChoosing] = useState(false);
  const [pick, setPick] = useState('');
  const total = rollTotal(roll);
  const who = roll.character?.title ?? roll.by;
  const parts = [
    `dice ${signed(diceTotal(roll.dice))}`,
    roll.skill ? `${roll.skill} ${signed(roll.skillRating)}` : null,
    roll.modifier ? `modifier ${signed(roll.modifier)}` : null,
    ...roll.invokes.map(invokeText),
  ].filter(Boolean);
  const replaced = roll.invokes.filter(i => i.previousDice);

  const pickAspect = aspects.find(a => a.id === pick);
  const noFatePoint = Boolean(pickAspect && pickAspect.freeInvokes === 0 && roll.character && (fatePoints ?? 0) <= 0);

  const invoke = (effect: InvokeEffect) => {
    onInvoke(pick, effect);
    setPick('');
    setChoosing(false);
  };

  return (
    <li className='d-flex flex-col gap-1' style={{ borderTop: '1px solid var(--tab-border-color, rgba(128, 128, 128, 0.3))', paddingTop: 6 }}>
      <small>
        <b>{who}</b>{roll.skill && ` · ${roll.skill}`}
        {roll.character && roll.by && <span style={{ opacity: 0.7 }}> (rolled by {roll.by})</span>}
      </small>
      <div className='d-flex align-center gap-1 flex-wrap'>
        {roll.dice.map((die, i) => <Die key={i} value={die} />)}
        <b className='ml-1' style={{ fontSize: '1.15em' }}>{ladderLabel(total)}</b>
      </div>
      {replaced.length > 0 && (
        <small className='d-flex align-center gap-1 flex-wrap' style={{ opacity: 0.8 }}>
          Rerolled from
          {replaced.map((invoke, i) => (
            <span key={i} className='d-flex gap-0'>{invoke.previousDice!.map((die, j) => <Die key={j} value={die} small />)}</span>
          ))}
        </small>
      )}
      <small style={{ opacity: 0.8 }}>{parts.join(', ')}</small>
      {canInvoke && !choosing && aspects.length > 0 && (
        <button onClick={() => setChoosing(true)}>Invoke an aspect</button>
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
          <div className='d-flex gap-1 flex-wrap'>
            <button disabled={!pick || noFatePoint} onClick={() => invoke('bonus')}>+2</button>
            <button disabled={!pick || noFatePoint} onClick={() => invoke('reroll')}>Reroll</button>
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

  // Rolls made while the drawer was closed are counted on its tab.
  const [open, setOpen] = useState(true);
  const seenUntil = useRef(0);
  const newest = rolls[0]?.at ?? 0;
  if (open && newest > seenUntil.current) seenUntil.current = newest;
  const unseen = open ? 0 : rolls.filter(r => r.at > seenUntil.current).length;

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
    <SideDrawer title='Dice' storageKey='fate.diceDrawerOpen' badge={unseen} onOpenChange={setOpen}>
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
            <div className='d-flex align-center gap-1'>
              <label className='d-flex align-center gap-1'>
                <small>Modifier</small>
                <input type='number' value={modifier} onChange={({ target }) => setModifier(Number(target.value) || 0)} style={{ width: '4em' }} />
              </label>
              <button type='submit' className='grow-1'>Roll 4dF</button>
            </div>
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
              onInvoke={(aspectId, effect) => onInvoke(r.id, aspectId, effect)}
            />
          ))}
        </ul>
      </div>
    </SideDrawer>
  );
}
