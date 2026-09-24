import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import { FieldCaption, SheetRow, SheetSection, fieldStyle, textareaStyle } from '../components/SheetSection';
import {
  CORE_SKILLS,
  MAX_STRESS_BOXES,
  hasExtraMildMental,
  hasExtraMildPhysical,
  mentalStressBoxes,
  normalizeCharacter,
  physicalStressBoxes,
  refresh,
  validateCharacter,
  type Consequences,
  type FateCharacter,
  type Stunt,
} from '../fate/character';
import { ConsequenceRow, SkillPyramid, StressTrack } from '../fate/SheetWidgets';
import { debounce } from '../util';

// Rows of the skill ladder, as on the Fate Core sheet.
const SKILL_RATINGS = [5, 4, 3, 2, 1];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// The big boxed numbers in the top corner of the paper sheet.
function StatBox({ label, children }: { label: string, children: ReactNode }) {
  return <div
    className='d-flex flex-col align-center justify-center gap-1 pa-2'
    style={{
      minWidth: '6rem',
      border: '1px solid var(--table-border-color)',
      borderRadius: '0.5rem',
      background: 'var(--sheet-color)',
    }}
  >
    <span className='lora text-small' style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
    {children}
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

  const setStunt = (index: number, changes: Partial<Stunt>) => {
    const stunts = [...character.stunts];
    stunts[index] = { ...stunts[index], ...changes };
    update({ stunts });
  };

  const setConsequence = (key: keyof Consequences, value: string) => {
    update({ consequences: { ...character.consequences, [key]: value } });
  };

  const problems = validateCharacter(character);

  return <div className='d-flex flex-col gap-3'>
    <div className='d-flex justify-between align-center flex-wrap gap-2'>
      <Link className='link link-animated' to={`/campaigns/${campaignShortname}`}>← Back to campaign</Link>
      <span className={saveStatus === 'error' ? 'color-error' : undefined} style={{ color: saveStatus === 'error' ? undefined : 'var(--light-text-color)' }}>
        {saveStatus === 'saving' && 'Saving...'}
        {saveStatus === 'saved' && 'Saved'}
        {saveStatus === 'error' && 'Failed to save changes.'}
      </span>
    </div>

    {/* ID band: name and description, with refresh and fate points in the corner. */}
    <div className='d-flex gap-3 flex-wrap'>
      <SheetSection title='ID' style={{ flex: '1 1 20rem' }}>
        <div className='d-flex flex-col'>
          <span className='lora big-text'>{title}</span>
          <span className='text-small' style={{ color: 'var(--light-text-color)' }}>Name</span>
        </div>
        <div className='d-flex flex-col'>
          <textarea id='description' style={{ ...textareaStyle, minHeight: '3rem' }} value={character.description} onChange={({ target }) => update({ description: target.value })} />
          <FieldCaption htmlFor='description'>Description</FieldCaption>
        </div>
      </SheetSection>
      <div className='d-flex gap-2'>
        <StatBox label='Refresh'>
          <span className='lora' style={{ fontSize: '2rem', lineHeight: 1 }}>{refresh(character)}</span>
        </StatBox>
        <StatBox label='Fate Points'>
          <input
            aria-label='Fate points'
            type='number'
            min={0}
            className='center'
            style={{ width: '4rem', fontSize: '1.5rem' }}
            value={character.fatePoints ?? refresh(character)}
            onChange={({ target }) => update({ fatePoints: target.value === '' ? null : Number(target.value) })}
          />
        </StatBox>
      </div>
    </div>

    {problems.length > 0 && <ul className='my-0'>
      {problems.map(problem => <li key={problem} className='color-error'>{problem}</li>)}
    </ul>}

    <SheetRow>
      <SheetSection title='Aspects'>
        <div className='d-flex flex-col'>
          <input id='high-concept' style={fieldStyle} value={character.highConcept} onChange={({ target }) => update({ highConcept: target.value })} />
          <FieldCaption htmlFor='high-concept'>High Concept</FieldCaption>
        </div>
        <div className='d-flex flex-col'>
          <input id='trouble' style={fieldStyle} value={character.trouble} onChange={({ target }) => update({ trouble: target.value })} />
          <FieldCaption htmlFor='trouble'>Trouble</FieldCaption>
        </div>
        {character.aspects.map((aspect, i) => (
          <input key={i} aria-label={`Aspect ${i + 1}`} style={fieldStyle} value={aspect} onChange={({ target }) => setAspect(i, target.value)} />
        ))}
      </SheetSection>

      <SheetSection title='Skills'>
        <SkillPyramid
          skills={character.skills}
          skillList={CORE_SKILLS}
          ratings={SKILL_RATINGS}
          onChange={skills => update({ skills })}
        />
      </SheetSection>
    </SheetRow>

    <SheetRow>
      <SheetSection title='Extras'>
        <textarea aria-label='Extras' style={{ ...textareaStyle, minHeight: '8rem' }} value={character.extras} onChange={({ target }) => update({ extras: target.value })} />
      </SheetSection>

      <SheetSection title='Stunts'>
        {character.stunts.map((stunt, i) => (
          <div key={i} className='d-flex flex-col gap-1'>
            <div className='d-flex gap-1'>
              <input aria-label={`Stunt ${i + 1} name`} placeholder='Stunt name' style={fieldStyle} value={stunt.name} onChange={({ target }) => setStunt(i, { name: target.value })} />
              <button type='button' onClick={() => update({ stunts: character.stunts.filter((_, j) => j !== i) })}>Remove</button>
            </div>
            <textarea aria-label={`Stunt ${i + 1} description`} placeholder='What the stunt does' style={{ ...textareaStyle, minHeight: '3rem' }} value={stunt.description} onChange={({ target }) => setStunt(i, { description: target.value })} />
          </div>
        ))}
        <div>
          <button type='button' onClick={() => update({ stunts: [...character.stunts, { name: '', description: '' }] })}>Add Stunt</button>
        </div>
      </SheetSection>
    </SheetRow>

    <SheetRow>
      <SheetSection title='Stress'>
        <StressTrack
          label='Physical'
          boxes={MAX_STRESS_BOXES}
          available={physicalStressBoxes(character)}
          checked={character.stress.physical}
          unlockHint='Unlocked by a higher Physique'
          onChange={physical => update({ stress: { ...character.stress, physical } })}
        />
        <StressTrack
          label='Mental'
          boxes={MAX_STRESS_BOXES}
          available={mentalStressBoxes(character)}
          checked={character.stress.mental}
          unlockHint='Unlocked by a higher Will'
          onChange={mental => update({ stress: { ...character.stress, mental } })}
        />
      </SheetSection>

      <SheetSection title='Consequences'>
        <ConsequenceRow id='consequence-mild' shifts={2} label='Mild' value={character.consequences.mild} onChange={value => setConsequence('mild', value)} />
        <ConsequenceRow id='consequence-moderate' shifts={4} label='Moderate' value={character.consequences.moderate} onChange={value => setConsequence('moderate', value)} />
        <ConsequenceRow id='consequence-severe' shifts={6} label='Severe' value={character.consequences.severe} onChange={value => setConsequence('severe', value)} />
        <ConsequenceRow
          id='consequence-mild-physical'
          shifts={2}
          label='Mild (physical)'
          value={character.consequences.mildPhysical}
          disabled={!hasExtraMildPhysical(character)}
          hint='Unlocked by Superb (+5) Physique'
          onChange={value => setConsequence('mildPhysical', value)}
        />
        <ConsequenceRow
          id='consequence-mild-mental'
          shifts={2}
          label='Mild (mental)'
          value={character.consequences.mildMental}
          disabled={!hasExtraMildMental(character)}
          hint='Unlocked by Superb (+5) Will'
          onChange={value => setConsequence('mildMental', value)}
        />
      </SheetSection>
    </SheetRow>
  </div>;
}
