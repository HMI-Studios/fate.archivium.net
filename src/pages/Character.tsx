import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import { FATE_CORE_LAYOUT } from '../fate/coreLayout';
import { portraitId, PORTRAIT_KEY, type GalleryImage } from '../fate/portrait';
import { layoutTabData, saveSheetChanges } from '../fate/sheetData';
import Breadcrumbs, { archiviumItemUrl } from '../components/Breadcrumbs';
import PortraitSlot from '../components/PortraitSlot';
import StuntList from '../components/StuntList';
import TakeHitDialog from '../components/TakeHitDialog';
import { consequenceSlots, stressTracks, withHit } from '../fate/stress';
import { fetchStunt, linkOf, STUNTS_PATH, withStuntCopies, type Stunt, type StuntEntry } from '../fate/stunts';
import { migratedAspects } from '../fate/aspects';
import { entryListValues, type TabLayout } from '../layout/core';
import { tabTypesOf } from '../layout/typeConfig';
import LayoutTabEditor from '../layout/LayoutTabEditor';
import { LAYOUT_TAB_CSS } from '../layout/styles';
import { debounce } from '../util';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function parseObjData(objData: unknown): any {
  return typeof objData === 'string' ? JSON.parse(objData) : objData;
}

export default function Character() {
  const { campaignShortname, characterShortname } = useParams();
  const [title, setTitle] = useState<string | null>(null);
  const [layout, setLayout] = useState<TabLayout | null>(null);
  const [data, setData] = useState<unknown>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [takingHit, setTakingHit] = useState(false);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [hasGalleryTab, setHasGalleryTab] = useState(false);
  // The sheet data as last loaded or saved, to work out what the user changed.
  const base = useRef<unknown>(null);
  const [universeObjData, setUniverseObjData] = useState<unknown>(null);
  // The current text of the campaign stunts this sheet links to, by shortname. Kept
  // in a ref too, so saves (which run later) copy the latest text onto the sheet.
  const [liveStunts, setLiveStunts] = useState<{ [shortname: string]: Stunt }>({});
  const liveStuntsRef = useRef(liveStunts);
  const updateLiveStunt = (stunt: Stunt) => {
    liveStuntsRef.current = { ...liveStuntsRef.current, [stunt.shortname]: stunt };
    setLiveStunts(liveStuntsRef.current);
  };

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
      // The campaign's own copy of the Fate Core tab type, if it has one (it may have
      // been customized in Archivium); campaigns without one use the built-in layout.
      const sheetLayout = tabTypesOf(parseObjData(campaign.obj_data))[FATE_CORE_LAYOUT.id] ?? FATE_CORE_LAYOUT;
      setTitle(item.title);
      setGallery(item.gallery ?? []);
      setHasGalleryTab(parseObjData(item.obj_data)?.gallery !== undefined);
      setLayout(sheetLayout);
      setUniverseObjData(parseObjData(campaign.obj_data));
      const sheetData = migratedAspects(layoutTabData(parseObjData(item.obj_data), sheetLayout.id));
      base.current = sheetData;
      setData(sheetData);
      const stunts = sheetData[STUNTS_PATH];
      const linked = new Set((Array.isArray(stunts) ? stunts : []).map(entry => entry && typeof entry === 'object' ? linkOf(entry) : undefined));
      for (const shortname of linked) {
        // A stunt that's gone or unreadable just shows the sheet's copy.
        if (shortname) fetchStunt(campaignShortname!, shortname).then(updateLiveStunt).catch(() => {});
      }
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
        const saved = await saveSheetChanges(campaignShortname, characterShortname, layout.id, base.current, withStuntCopies(next, liveStuntsRef.current));
        base.current = saved;
        // Show what was saved elsewhere too, unless the user has kept typing.
        setData((current: unknown) => current === next ? saved : current);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 800);
  };

  // The Take a hit button goes under the sheet's last stress track.
  const lastTrack = layout.rows.flatMap(row => row.sections.flatMap(section => section.fields)).filter(field => field.widget === 'checkTrack').pop();

  return <div className='d-flex flex-col gap-3'>
    <style>{LAYOUT_TAB_CSS}</style>
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
    <LayoutTabEditor
      layout={layout}
      data={data}
      itemTitle={title}
      onChange={next => {
        setData(next);
        save(next);
      }}
      renderField={(field, { id, data, set, standard }) => {
        if (field === lastTrack) return <>
          {standard}
          <div>
            <button type='button' onClick={() => setTakingHit(true)} title='Work out which stress and consequences absorb a hit'>Take a hit</button>
          </div>
        </>;
        // High Concept and Trouble are entryLists too (so they render just like the
        // other aspects), but always hold exactly one row: no add/remove controls.
        if (field.widget === 'entryList' && (field.path === 'highConcept' || field.path === 'trouble')) {
          const entry = (entryListValues(field, data)[0] ?? {}) as Record<string, string>;
          const setField = (key: string, value: string) => set(field.path, [{ ...entry, [key]: value }]);
          return <div className='d-flex flex-col gap-1'>
            {field.fields.map(({ key, placeholder, multiline }) => {
              const props = {
                id: `${id}-${key}`,
                'aria-label': `${field.itemLabel} ${placeholder}`,
                placeholder,
                value: typeof entry[key] === 'string' ? entry[key] : '',
              };
              return multiline
                ? <textarea key={key} {...props} className='tab-layout-textarea' onChange={({ target }) => setField(key, target.value)} />
                : <input key={key} {...props} onChange={({ target }) => setField(key, target.value)} />;
            })}
          </div>;
        }
        // Stunts are picked from, or added to, the campaign's shared stunts.
        if (field.widget !== 'entryList' || field.path !== STUNTS_PATH || !field.fields.some(f => f.key === 'name')) return undefined;
        if (!campaignShortname) return undefined;
        return <StuntList
          field={field}
          id={id}
          campaign={campaignShortname}
          universeObjData={universeObjData}
          entries={entryListValues(field, data) as StuntEntry[]}
          onChange={entries => set(field.path, entries)}
          live={liveStunts}
          onLive={updateLiveStunt}
        />;
      }}
    />
    {takingHit && <TakeHitDialog
      label={title}
      stress={stressTracks(data)}
      slots={consequenceSlots(data)}
      onApply={hit => {
        const next = withHit(data, hit).sheet;
        setData(next);
        save(next);
      }}
      onClose={() => setTakingHit(false)}
    />}
  </div>;
}
