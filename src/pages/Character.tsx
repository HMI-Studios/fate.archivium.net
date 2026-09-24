import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import {
  CORE_SKILLS,
  hasExtraMildMental,
  hasExtraMildPhysical,
  ladderLabel,
  mentalStressBoxes,
  normalizeCharacter,
  physicalStressBoxes,
  refresh,
  skillRating,
  validateCharacter,
  type Consequences,
  type FateCharacter,
  type Stunt,
} from '../fate/character';
import { debounce } from '../util';

const SKILL_RATINGS = [5, 4, 3, 2, 1, 0];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function StressTrack({ label, boxes, checked, onChange }: {
  label: string,
  boxes: number,
  checked: boolean[],
  onChange: (checked: boolean[]) => void,
}) {
  return <div>
    <strong>{label}</strong>{' '}
    {Array.from({ length: boxes }, (_, i) => (
      <label key={i} style={{ marginRight: 8 }}>
        <input
          type='checkbox'
          checked={checked[i] ?? false}
          onChange={({ target }) => {
            const next = Array.from({ length: boxes }, (_, j) => checked[j] ?? false);
            next[i] = target.checked;
            onChange(next);
          }}
        />
        {i + 1}
      </label>
    ))}
  </div>;
}

export default function Character() {
  const { campaignShortname, characterShortname } = useParams();
  const [title, setTitle] = useState<string | null>(null);
  const [character, setCharacter] = useState<FateCharacter | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${characterShortname}`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) {
        setLoadError(`Could not load character (${response.status}).`);
        return;
      }
      const data = await response.json();
      const objData = typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data;
      setTitle(data.title);
      setCharacter(normalizeCharacter(objData?.fate));
    });
  }, [campaignShortname, characterShortname]);

  if (loadError) return <span className='color-error'>{loadError}</span>;

  if (!character) return <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;

  // The data endpoint merges into obj_data, so this leaves the item's other
  // Archivium content (body, tabs, etc.) untouched.
  const save = (next: FateCharacter) => {
    setSaveStatus('saving');
    debounce('character-save', async () => {
      const response = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${characterShortname}/data`, {
        credentials: 'include',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fate: next }),
      });
      setSaveStatus(response.ok ? 'saved' : 'error');
    }, 800);
  };

  const update = (changes: Partial<FateCharacter>) => {
    const next = { ...character, ...changes };
    setCharacter(next);
    save(next);
  };

  const setAspect = (index: number, value: string) => {
    const aspects = [...character.aspects];
    aspects[index] = value;
    update({ aspects });
  };

  const setSkill = (skill: string, rating: number) => {
    const skills = { ...character.skills };
    if (rating === 0) delete skills[skill];
    else skills[skill] = rating;
    update({ skills });
  };

  const setStunt = (index: number, changes: Partial<Stunt>) => {
    const stunts = [...character.stunts];
    stunts[index] = { ...stunts[index], ...changes };
    update({ stunts });
  };

  const setConsequence = (key: keyof Consequences, value: string) => {
    update({ consequences: { ...character.consequences, [key]: value } });
  };

  const problems = validateCharacter(character);

  return <>
    <Link className='link link-animated' to={`/campaigns/${campaignShortname}`}>← Back to campaign</Link>
    <h1>{title}</h1>
    <div>
      {saveStatus === 'saving' && <span>Saving...</span>}
      {saveStatus === 'saved' && <span>Saved</span>}
      {saveStatus === 'error' && <span className='color-error'>Failed to save changes.</span>}
    </div>

    {problems.length > 0 && <ul>
      {problems.map(problem => <li key={problem} className='color-error'>{problem}</li>)}
    </ul>}

    <h2>Aspects</h2>
    <div className='inputGroup'>
      <label htmlFor='high-concept'>High Concept</label>
      <input id='high-concept' value={character.highConcept} onChange={({ target }) => update({ highConcept: target.value })} />
    </div>
    <div className='inputGroup'>
      <label htmlFor='trouble'>Trouble</label>
      <input id='trouble' value={character.trouble} onChange={({ target }) => update({ trouble: target.value })} />
    </div>
    {character.aspects.map((aspect, i) => (
      <div key={i} className='inputGroup'>
        <label htmlFor={`aspect-${i}`}>Aspect {i + 1}</label>
        <input id={`aspect-${i}`} value={aspect} onChange={({ target }) => setAspect(i, target.value)} />
      </div>
    ))}

    <h2>Skills</h2>
    {CORE_SKILLS.map(skill => (
      <div key={skill} className='inputGroup'>
        <label htmlFor={`skill-${skill}`}>{skill}</label>
        <select id={`skill-${skill}`} value={skillRating(character, skill)} onChange={({ target }) => setSkill(skill, Number(target.value))}>
          {SKILL_RATINGS.map(rating => <option key={rating} value={rating}>{ladderLabel(rating)}</option>)}
        </select>
      </div>
    ))}

    <h2>Stunts</h2>
    <div>Refresh: {refresh(character)}</div>
    {character.stunts.map((stunt, i) => (
      <div key={i} style={{ marginTop: 10 }}>
        <div className='inputGroup'>
          <input value={stunt.name} placeholder='Stunt name' onChange={({ target }) => setStunt(i, { name: target.value })} />
          <button type='button' onClick={() => update({ stunts: character.stunts.filter((_, j) => j !== i) })}>Remove</button>
        </div>
        <div className='inputGroup'>
          <textarea value={stunt.description} placeholder='What the stunt does' onChange={({ target }) => setStunt(i, { description: target.value })} />
        </div>
      </div>
    ))}
    <button type='button' onClick={() => update({ stunts: [...character.stunts, { name: '', description: '' }] })}>Add Stunt</button>

    <h2>Stress</h2>
    <StressTrack
      label='Physical'
      boxes={physicalStressBoxes(character)}
      checked={character.stress.physical}
      onChange={physical => update({ stress: { ...character.stress, physical } })}
    />
    <StressTrack
      label='Mental'
      boxes={mentalStressBoxes(character)}
      checked={character.stress.mental}
      onChange={mental => update({ stress: { ...character.stress, mental } })}
    />

    <h2>Consequences</h2>
    <div className='inputGroup'>
      <label htmlFor='consequence-mild'>Mild (2)</label>
      <input id='consequence-mild' value={character.consequences.mild} onChange={({ target }) => setConsequence('mild', target.value)} />
    </div>
    {hasExtraMildPhysical(character) && <div className='inputGroup'>
      <label htmlFor='consequence-mild-physical'>Mild, physical (2)</label>
      <input id='consequence-mild-physical' value={character.consequences.mildPhysical} onChange={({ target }) => setConsequence('mildPhysical', target.value)} />
    </div>}
    {hasExtraMildMental(character) && <div className='inputGroup'>
      <label htmlFor='consequence-mild-mental'>Mild, mental (2)</label>
      <input id='consequence-mild-mental' value={character.consequences.mildMental} onChange={({ target }) => setConsequence('mildMental', target.value)} />
    </div>}
    <div className='inputGroup'>
      <label htmlFor='consequence-moderate'>Moderate (4)</label>
      <input id='consequence-moderate' value={character.consequences.moderate} onChange={({ target }) => setConsequence('moderate', target.value)} />
    </div>
    <div className='inputGroup'>
      <label htmlFor='consequence-severe'>Severe (6)</label>
      <input id='consequence-severe' value={character.consequences.severe} onChange={({ target }) => setConsequence('severe', target.value)} />
    </div>

    <h2>Fate Points</h2>
    <div className='inputGroup'>
      <input
        aria-label='Fate points'
        type='number'
        min={0}
        value={character.fatePoints ?? refresh(character)}
        onChange={({ target }) => update({ fatePoints: target.value === '' ? null : Number(target.value) })}
      />
    </div>

    <h2>Extras</h2>
    <div className='inputGroup'>
      <textarea aria-label='Extras' value={character.extras} onChange={({ target }) => update({ extras: target.value })} />
    </div>

    <h2>Description</h2>
    <div className='inputGroup'>
      <textarea aria-label='Description' value={character.description} onChange={({ target }) => update({ description: target.value })} />
    </div>
  </>;
}
