import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import { FATE_CORE_LAYOUT } from '../fate/coreLayout';
import { type SheetLayout } from '../layout/core';
import { layoutForType } from '../layout/typeConfig';
import SheetRenderer from '../layout/SheetRenderer';
import { SHEET_LAYOUT_CSS } from '../layout/styles';
import { debounce } from '../util';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function parseObjData(objData: unknown): any {
  return typeof objData === 'string' ? JSON.parse(objData) : objData;
}

export default function Character() {
  const { campaignShortname, characterShortname } = useParams();
  const [title, setTitle] = useState<string | null>(null);
  const [layout, setLayout] = useState<SheetLayout | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    Promise.all([
      fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' }),
      fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${characterShortname}`, { credentials: 'include' }),
    ]).then(async ([campaignResponse, itemResponse]) => {
      if (!campaignResponse.ok || !itemResponse.ok) {
        setLoadError(`Could not load character (${itemResponse.ok ? campaignResponse.status : itemResponse.status}).`);
        return;
      }
      const campaign = await campaignResponse.json();
      const item = await itemResponse.json();
      // Campaigns created before sheet layouts were stored on the universe fall back to Fate Core.
      const sheetLayout = layoutForType(parseObjData(campaign.obj_data), item.item_type) ?? FATE_CORE_LAYOUT;
      setTitle(item.title);
      setLayout(sheetLayout);
      setData(parseObjData(item.obj_data)?.[sheetLayout.root] ?? {});
    });
  }, [campaignShortname, characterShortname]);

  if (loadError) return <span className='color-error'>{loadError}</span>;

  if (!layout || title === null) return <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;

  // The data endpoint merges into obj_data, so this leaves the item's other
  // Archivium content (body, tabs, etc.) untouched.
  const save = (next: unknown) => {
    setSaveStatus('saving');
    debounce('character-save', async () => {
      const response = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${characterShortname}/data`, {
        credentials: 'include',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [layout.root]: next }),
      });
      setSaveStatus(response.ok ? 'saved' : 'error');
    }, 800);
  };

  return <div className='d-flex flex-col gap-3'>
    <style>{SHEET_LAYOUT_CSS}</style>
    <div className='d-flex justify-between align-center flex-wrap gap-2'>
      <Link className='link link-animated' to={`/campaigns/${campaignShortname}`}>← Back to campaign</Link>
      <span className={saveStatus === 'error' ? 'color-error' : undefined} style={{ color: saveStatus === 'error' ? undefined : 'var(--light-text-color)' }}>
        {saveStatus === 'saving' && 'Saving...'}
        {saveStatus === 'saved' && 'Saved'}
        {saveStatus === 'error' && 'Failed to save changes.'}
      </span>
    </div>
    <SheetRenderer
      layout={layout}
      data={data}
      itemTitle={title}
      onChange={next => {
        setData(next);
        save(next);
      }}
    />
  </div>;
}
