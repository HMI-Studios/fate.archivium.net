import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import { FATE_CORE_LAYOUT } from '../fate/coreLayout';
import { portraitId, PORTRAIT_KEY, type GalleryImage } from '../fate/portrait';
import { saveSheetChanges } from '../fate/sheetData';
import Breadcrumbs, { archiviumItemUrl } from '../components/Breadcrumbs';
import PortraitSlot from '../components/PortraitSlot';
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
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [hasGalleryTab, setHasGalleryTab] = useState(false);
  // The sheet data as last loaded or saved, to work out what the user changed.
  const base = useRef<unknown>(null);

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
      setGallery(item.gallery ?? []);
      setHasGalleryTab(parseObjData(item.obj_data)?.gallery !== undefined);
      setLayout(sheetLayout);
      const sheetData = parseObjData(item.obj_data)?.[sheetLayout.root] ?? {};
      base.current = sheetData;
      setData(sheetData);
    });
  }, [campaignShortname, characterShortname]);

  if (loadError) return <span className='color-error'>{loadError}</span>;

  if (!layout || title === null) return <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;

  // Only the parts of the sheet the user changed are saved, over the latest copy,
  // so changes made elsewhere meanwhile (e.g. from a scene) are kept.
  const save = (next: unknown) => {
    if (!campaignShortname || !characterShortname) return;
    setSaveStatus('saving');
    debounce('character-save', async () => {
      try {
        const saved = await saveSheetChanges(campaignShortname, characterShortname, layout.root, base.current, next);
        base.current = saved;
        // Show what was saved elsewhere too, unless the user has kept typing.
        setData((current: unknown) => current === next ? saved : current);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 800);
  };

  return <div className='d-flex flex-col gap-3'>
    <style>{SHEET_LAYOUT_CSS}</style>
    <div className='d-flex justify-between align-center flex-wrap gap-2'>
      <Breadcrumbs campaign={campaignShortname} current={title} />
      <div className='d-flex align-center gap-3 flex-wrap'>
        <Link className='link link-animated' to={`/campaigns/${campaignShortname}/play`}>Game room</Link>
        {campaignShortname && characterShortname && <a className='link link-animated' href={archiviumItemUrl(campaignShortname, characterShortname)}>Open in Archivium</a>}
      </div>
      <span className={saveStatus === 'error' ? 'color-error' : undefined} style={{ color: saveStatus === 'error' ? undefined : 'var(--light-text-color)' }}>
        {saveStatus === 'saving' && 'Saving...'}
        {saveStatus === 'saved' && 'Saved'}
        {saveStatus === 'error' && 'Failed to save changes.'}
      </span>
    </div>
    {/* Sheet layouts have no image field, so the portrait sits beside the sheet in this app only. */}
    {campaignShortname && characterShortname && <PortraitSlot
      campaignShortname={campaignShortname}
      characterShortname={characterShortname}
      title={title}
      portrait={portraitId(data)}
      gallery={gallery}
      hasGalleryTab={hasGalleryTab}
      onChange={portrait => {
        const { [PORTRAIT_KEY]: _, ...rest } = (data ?? {}) as Record<string, unknown>;
        const next = portrait === null ? rest : { ...rest, [PORTRAIT_KEY]: portrait };
        setData(next);
        save(next);
      }}
      onGalleryChange={next => {
        setGallery(next);
        setHasGalleryTab(true);
      }}
    />}
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
