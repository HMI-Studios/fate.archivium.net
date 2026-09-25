import { useEffect, useState, type KeyboardEvent } from 'react';
import { archiviumItemUrl } from './Breadcrumbs';
import type { EntryListField } from '../layout/core';
import {
  createStunt,
  fetchStunt,
  linkOf,
  listStunts,
  saveStuntDescription,
  STUNT_LINK_KEY,
  type Stunt,
  type StuntEntry,
  type StuntSummary,
} from '../fate/stunts';
import { debounce } from '../util';

// How many matching stunts the picker lists at once.
const MAX_OPTIONS = 8;

type Option = { kind: 'stunt', stunt: StuntSummary } | { kind: 'create', name: string };

type PickerProps = {
  id: string,
  label: string,
  // What the box shows when it isn't being typed in.
  value: string,
  // Linked entries search without changing their name; others type their name as before.
  linked: boolean,
  catalog: StuntSummary[],
  // Stunts already on the sheet, which aren't offered again.
  exclude: Set<string>,
  disabled: boolean,
  onType: (name: string) => void,
  onPick: (option: Option) => void,
};

// A text box that suggests the campaign's stunts, and offers to make a new one.
function StuntPicker({ id, label, value, linked, catalog, exclude, disabled, onType, onPick }: PickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const text = query ?? value;
  const needle = text.trim().toLowerCase();
  const matches = catalog
    .filter(stunt => !exclude.has(stunt.shortname) && stunt.title.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.title.toLowerCase().startsWith(needle)) - Number(a.title.toLowerCase().startsWith(needle)))
    .slice(0, MAX_OPTIONS);
  const exact = catalog.some(stunt => stunt.title.trim().toLowerCase() === needle);
  const options: Option[] = [
    ...matches.map(stunt => ({ kind: 'stunt' as const, stunt })),
    ...(needle && !exact ? [{ kind: 'create' as const, name: text.trim() }] : []),
  ];
  const shown = open && options.length > 0;
  const activeIndex = Math.min(active, options.length - 1);

  const close = () => {
    setOpen(false);
    setQuery(null);
    setActive(0);
  };
  const pick = (option: Option) => {
    close();
    onPick(option);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + options.length) % Math.max(options.length, 1));
    } else if (e.key === 'Enter' && shown) {
      e.preventDefault();
      pick(options[activeIndex]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      close();
    }
  };

  return <div className='grow-1' style={{ position: 'relative' }}>
    <input
      id={id}
      className='w-100'
      style={{ boxSizing: 'border-box' }}
      role='combobox'
      aria-label={label}
      aria-autocomplete='list'
      aria-expanded={shown}
      aria-controls={`${id}-options`}
      aria-activedescendant={shown ? `${id}-option-${activeIndex}` : undefined}
      placeholder={linked ? 'Search stunts' : 'Stunt name'}
      disabled={disabled}
      value={text}
      onFocus={() => setOpen(true)}
      onBlur={close}
      onKeyDown={onKeyDown}
      onChange={({ target }) => {
        setOpen(true);
        setActive(0);
        if (linked) setQuery(target.value);
        else onType(target.value);
      }}
    />
    {shown && <ul
      id={`${id}-options`}
      role='listbox'
      aria-label='Campaign stunts'
      style={{
        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
        margin: '2px 0 0', padding: '0.25rem 0', listStyle: 'none',
        background: 'var(--sheet-color)', color: 'var(--text-color)',
        border: '1px solid var(--input-border-color)', borderRadius: '0.25rem',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)', maxHeight: '16rem', overflowY: 'auto',
      }}
    >
      {options.map((option, i) => (
        <li
          key={option.kind === 'stunt' ? option.stunt.shortname : 'create'}
          id={`${id}-option-${i}`}
          role='option'
          aria-selected={i === activeIndex}
          style={{
            padding: '0.3rem 0.6rem', cursor: 'pointer',
            background: i === activeIndex ? 'var(--menu-color)' : undefined,
            fontStyle: option.kind === 'create' ? 'italic' : undefined,
          }}
          // Keep focus in the box, so blurring doesn't close the list before the click.
          onMouseDown={e => e.preventDefault()}
          onMouseEnter={() => setActive(i)}
          onClick={() => pick(option)}
        >
          {option.kind === 'stunt' ? option.stunt.title : `Create stunt "${option.name}"`}
        </li>
      ))}
    </ul>}
  </div>;
}

type Props = {
  field: EntryListField,
  id: string,
  campaign: string,
  universeObjData: unknown,
  entries: StuntEntry[],
  onChange: (entries: StuntEntry[]) => void,
  // The linked stunts' current text, by shortname.
  live: { [shortname: string]: Stunt },
  onLive: (stunt: Stunt) => void,
};

// The sheet's stunts, each either linked to one of the campaign's stunt items or
// (for stunts written before they were shared) just text on this sheet.
export default function StuntList({ field, id, campaign, universeObjData, entries, onChange, live, onLive }: Props) {
  const [catalog, setCatalog] = useState<StuntSummary[]>([]);
  const [creating, setCreating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = () => listStunts(campaign).then(setCatalog).catch(() => {});
  useEffect(() => { loadCatalog(); }, [campaign]);

  const setEntry = (index: number, entry: StuntEntry) => onChange(entries.map((e, i) => i === index ? entry : e));
  const linkEntry = (index: number, stunt: Stunt) => {
    onLive(stunt);
    const { [STUNT_LINK_KEY]: _, ...rest } = entries[index];
    setEntry(index, { ...rest, name: stunt.title, description: stunt.description, [STUNT_LINK_KEY]: stunt.shortname });
  };

  const pick = async (index: number, option: Option) => {
    setError(null);
    setCreating(index);
    try {
      if (option.kind === 'stunt') {
        linkEntry(index, await fetchStunt(campaign, option.stunt.shortname));
      } else {
        // A new stunt starts with whatever the entry says it does, if it isn't linked yet.
        const entry = entries[index];
        const description = linkOf(entry) ? '' : entry.description ?? '';
        const stunt = await createStunt(campaign, universeObjData, option.name, description);
        linkEntry(index, stunt);
        setCatalog(current => [...current, stunt].sort((a, b) => a.title.localeCompare(b.title)));
        loadCatalog();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(null);
    }
  };

  const describe = (index: number, description: string) => {
    const entry = entries[index];
    const shortname = linkOf(entry);
    const stunt = shortname ? live[shortname] : undefined;
    if (shortname && stunt) {
      // Changing a linked stunt changes it for everyone who has it.
      onLive({ ...stunt, description });
      debounce(`stunt-save-${shortname}`, () => {
        saveStuntDescription(campaign, shortname, description).catch(e => setError(e instanceof Error ? e.message : String(e)));
      }, 800);
    }
    setEntry(index, { ...entry, description });
  };

  const linkedHere = new Set(entries.map(linkOf).filter((s): s is string => Boolean(s)));

  return <>
    {entries.map((entry, i) => {
      const shortname = linkOf(entry);
      const stunt = shortname ? live[shortname] : undefined;
      const name = stunt?.title ?? entry.name ?? '';
      const description = stunt?.description ?? entry.description ?? '';
      const readOnly = Boolean(stunt && !stunt.plain);
      return <div key={i} className='d-flex flex-col gap-1'>
        <div className='d-flex gap-1'>
          <StuntPicker
            id={`${id}-${i}-name`}
            label={`${field.itemLabel} ${i + 1}`}
            value={creating === i ? 'Saving...' : name}
            linked={Boolean(shortname)}
            catalog={catalog}
            exclude={new Set([...linkedHere].filter(s => s !== shortname))}
            disabled={creating !== null}
            onType={value => setEntry(i, { ...entry, name: value })}
            onPick={option => pick(i, option)}
          />
          <button type='button' onClick={() => onChange(entries.filter((_, k) => k !== i))}>Remove</button>
        </div>
        <div className='tab-layout-field'>
          <textarea
            id={`${id}-${i}-description`}
            aria-label={`${field.itemLabel} ${i + 1} description`}
            className='tab-layout-textarea'
            placeholder='What the stunt does'
            readOnly={readOnly}
            value={description}
            onChange={({ target }) => describe(i, target.value)}
          />
        </div>
        {shortname && <span className='tab-layout-caption'>
          {readOnly
            ? 'This stunt has formatting, so edit it in Archivium. '
            : 'Shared with the campaign: changes apply to everyone who has this stunt. '}
          <a className='link link-animated' href={archiviumItemUrl(campaign, shortname)} target='_blank' rel='noreferrer'>Open in Archivium</a>
        </span>}
      </div>;
    })}
    {error && <span className='color-error'>{error}</span>}
    <div>
      <button type='button' onClick={() => onChange([...entries, { name: '', description: '' }])}>
        {field.addLabel}
      </button>
    </div>
  </>;
}
