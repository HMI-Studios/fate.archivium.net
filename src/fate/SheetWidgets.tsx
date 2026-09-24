import { fieldStyle } from '../components/SheetSection';
import { ladderLabel } from './character';

// Skills laid out as the ladder on the paper sheet: one row per rating, with
// the skills at that rating slotted into it, plus an empty slot to add one.
export function SkillPyramid({ skills, skillList, ratings, onChange }: {
  skills: { [skill: string]: number },
  skillList: string[],
  ratings: number[],
  onChange: (skills: { [skill: string]: number }) => void,
}) {
  const unassigned = skillList.filter(skill => !skills[skill]);

  const replace = (oldSkill: string, newSkill: string, rating: number) => {
    const next = { ...skills };
    delete next[oldSkill];
    if (newSkill) next[newSkill] = rating;
    onChange(next);
  };

  return <div className='d-flex flex-col gap-2'>
    {ratings.map(rating => {
      const atRating = Object.keys(skills).filter(skill => skills[skill] === rating).sort();
      const label = ladderLabel(rating);
      return <div key={rating} className='d-flex align-center gap-2'>
        <span className='lora' style={{ minWidth: '7.5rem' }}>{label}</span>
        <div className='d-flex flex-wrap gap-1 grow-1'>
          {atRating.map(skill => (
            <select
              key={skill}
              aria-label={`${label} skill`}
              value={skill}
              onChange={({ target }) => replace(skill, target.value, rating)}
            >
              <option value={skill}>{skill}</option>
              {unassigned.map(other => <option key={other} value={other}>{other}</option>)}
              <option value=''>(remove)</option>
            </select>
          ))}
          {unassigned.length > 0 && <select
            aria-label={`Add ${label} skill`}
            value=''
            onChange={({ target }) => replace('', target.value, rating)}
            style={{ color: 'var(--light-text-color)' }}
          >
            <option value=''>+ Add</option>
            {unassigned.map(skill => <option key={skill} value={skill}>{skill}</option>)}
          </select>}
        </div>
      </div>;
    })}
  </div>;
}

// A row of numbered stress boxes. Boxes past `available` are shown but
// greyed out, like the boxes on the paper sheet that only a high enough
// Physique or Will unlocks.
export function StressTrack({ label, boxes, available, checked, unlockHint, onChange }: {
  label: string,
  boxes: number,
  available: number,
  checked: boolean[],
  unlockHint: string,
  onChange: (checked: boolean[]) => void,
}) {
  return <div className='d-flex align-center gap-3'>
    <strong className='lora' style={{ minWidth: '4.5rem' }}>{label}</strong>
    <div className='d-flex gap-2'>
      {Array.from({ length: boxes }, (_, i) => {
        const enabled = i < available;
        return <label
          key={i}
          title={enabled ? undefined : unlockHint}
          className='d-flex flex-col align-center'
          style={{
            width: '2.25rem',
            padding: '0.25rem 0',
            border: '1px solid var(--input-border-color)',
            borderRadius: '0.25rem',
            opacity: enabled ? 1 : 0.35,
          }}
        >
          <span className='text-small'>{i + 1}</span>
          <input
            type='checkbox'
            aria-label={`${label} stress box ${i + 1}`}
            disabled={!enabled}
            checked={enabled && (checked[i] ?? false)}
            onChange={({ target }) => {
              const next = Array.from({ length: available }, (_, j) => checked[j] ?? false);
              next[i] = target.checked;
              onChange(next);
            }}
          />
        </label>;
      })}
    </div>
  </div>;
}

// One consequence slot: its shift value in a box, and the consequence aspect.
export function ConsequenceRow({ id, shifts, label, value, disabled, hint, onChange }: {
  id: string,
  shifts: number,
  label: string,
  value: string,
  disabled?: boolean,
  hint?: string,
  onChange: (value: string) => void,
}) {
  return <div className='d-flex align-center gap-2' style={{ opacity: disabled ? 0.35 : 1 }} title={disabled ? hint : undefined}>
    <span
      className='lora d-flex justify-center align-center'
      style={{
        minWidth: '2rem',
        height: '2rem',
        border: '1px solid var(--input-border-color)',
        borderRadius: '0.25rem',
        fontWeight: 'bold',
      }}
    >
      {shifts}
    </span>
    <label htmlFor={id} style={{ minWidth: '5rem' }}>{label}</label>
    <input id={id} style={fieldStyle} disabled={disabled} value={value} onChange={({ target }) => onChange(target.value)} />
  </div>;
}
