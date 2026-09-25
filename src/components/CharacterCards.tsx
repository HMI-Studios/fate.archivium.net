import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import { FATE_CORE_LAYOUT_ID } from '../fate/coreLayout';
import { galleryImageUrl, portraitId } from '../fate/portrait';
import { layoutTabData } from '../fate/sheetData';

type Item = { shortname: string, title: string };

type Props = {
  campaign: string,
  items: Item[],
  // The category's colour, shown behind characters without a portrait.
  color?: string,
};

// Portrait ids by character shortname. The item list has no sheet data, so each
// character is fetched for it; ones that can't be read just have no portrait.
function usePortraits(campaign: string, items: Item[]): { [shortname: string]: number | null } {
  const [portraits, setPortraits] = useState<{ [shortname: string]: number | null }>({});
  const key = items.map(item => item.shortname).join(',');

  useEffect(() => {
    let cancelled = false;
    for (const { shortname } of items) {
      fetch(`${ARCHIVIUM_URL}/api/universes/${campaign}/items/${shortname}`, { credentials: 'include' })
        .then(async response => {
          if (!response.ok) return null;
          const item = await response.json();
          const objData = typeof item.obj_data === 'string' ? JSON.parse(item.obj_data) : item.obj_data;
          return portraitId(layoutTabData(objData, FATE_CORE_LAYOUT_ID));
        })
        .catch(() => null)
        .then(id => { if (!cancelled) setPortraits(current => ({ ...current, [shortname]: id })); });
    }
    return () => { cancelled = true; };
  }, [campaign, key]);

  return portraits;
}

// Dark or light text, whichever reads better on a #rrggbb background.
function textColorOn(background: string | undefined): string {
  const match = background?.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return 'var(--text-color)';
  const [r, g, b] = match.slice(1).map(hex => parseInt(hex, 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#333' : '#fff';
}

const initials = (title: string) => title.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('');

export default function CharacterCards({ campaign, items, color }: Props) {
  const portraits = usePortraits(campaign, items);

  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))', gap: '1rem' }}>
    {items.map(item => {
      const portrait = portraits[item.shortname];
      return <Link
        key={item.shortname}
        to={`/campaigns/${campaign}/characters/${item.shortname}`}
        className='card'
        style={{
          // Archivium's .card is laid out for its own lists; these cards stack an image over a name.
          display: 'flex', flexDirection: 'column', gridColumn: 'auto',
          color: 'var(--text-color)', textDecoration: 'none', background: 'var(--sheet-color)',
        }}
      >
        <div style={{
          aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: color ?? 'var(--tab-color)', overflow: 'hidden',
        }}>
          {typeof portrait === 'number'
            ? <img src={galleryImageUrl(campaign, item.shortname, portrait)} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : portrait === null && <span className='lora' style={{ fontSize: '2.5rem', color: textColorOn(color) }}>{initials(item.title)}</span>}
        </div>
        <div style={{ padding: '0.5rem 0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
          {item.title}
        </div>
      </Link>;
    })}
  </div>;
}
