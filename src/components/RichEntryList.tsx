import type { EntryListField } from '../layout/core';
import { richTextOf, withRichText } from '../fate/richFields';
import RichText from './RichText';

type Entry = Record<string, unknown>;

type Props = {
  field: EntryListField,
  id: string,
  campaign: string,
  entries: Entry[],
  onChange: (entries: Entry[]) => void,
  // Always exactly one entry (like High Concept): no add or remove buttons.
  single?: boolean,
};

// An entry list (like the layout editor's) whose multiline parts, like aspects'
// backstories, take rich text. See src/fate/richFields.ts for how it's stored.
export default function RichEntryList({ field, id, campaign, entries, onChange, single = false }: Props) {
  const shown = single ? [entries[0] ?? {}] : entries;
  const setEntry = (index: number, entry: Entry) => onChange(shown.map((e, i) => i === index ? entry : e));

  return <>
    {shown.map((entry, i) => {
      const label = single ? field.itemLabel : `${field.itemLabel} ${i + 1}`;
      return <div key={i} className='d-flex flex-col gap-1'>
        {field.fields.map(({ key, placeholder, multiline }, j) => {
          const inputId = `${id}-${i}-${key}`;
          const input = multiline
            ? <RichText
              id={inputId}
              ariaLabel={`${label} ${placeholder}`}
              placeholder={placeholder}
              campaign={campaign}
              value={richTextOf(entry, key)}
              onChange={body => setEntry(i, withRichText(entry, key, body))}
            />
            : <input
              id={inputId}
              aria-label={`${label} ${placeholder}`}
              placeholder={placeholder}
              className='grow-1'
              value={typeof entry[key] === 'string' ? entry[key] as string : ''}
              onChange={({ target }) => setEntry(i, { ...entry, [key]: target.value })}
            />;
          if (j > 0 || single) return <div key={key} className='tab-layout-field'>{input}</div>;
          return <div key={key} className='d-flex gap-1'>
            {input}
            <button type='button' onClick={() => onChange(entries.filter((_, k) => k !== i))}>Remove</button>
          </div>;
        })}
      </div>;
    })}
    {!single && <div>
      <button type='button' onClick={() => onChange([...entries, Object.fromEntries(field.fields.map(({ key }) => [key, '']))])}>
        {field.addLabel}
      </button>
    </div>}
  </>;
}
