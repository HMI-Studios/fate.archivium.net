import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import { FATE_CORE_LAYOUT } from '../fate/coreLayout';
import { portraitOf, withPortrait, type GalleryImage } from '../fate/portrait';
import { layoutTabData, saveSheetChanges } from '../fate/sheetData';
import Breadcrumbs, { archiviumItemUrl } from '../components/Breadcrumbs';
import PersonalNotes from '../components/PersonalNotes';
import { panelStyle } from '../components/PlayLayout';
import PortraitSlot from '../components/PortraitSlot';
import RichEntryList from '../components/RichEntryList';
import StuntList from '../components/StuntList';
import TakeHitDialog from '../components/TakeHitDialog';
import VisibilityControls from '../components/VisibilityControls';
import { claimOf, type Claim } from '../fate/vaults';
import { consequenceSlots, stressTracks, withHit } from '../fate/stress';
import { fetchStunt, linkOf, STUNTS_PATH, withStuntCopies, type Stunt, type StuntEntry } from '../fate/stunts';
import { aspectsForLayout } from '../fate/aspects';
import { entryListValues, type TabLayout } from '../layout/core';
import { tabTypesOf } from '../layout/typeConfig';
import LayoutTabEditor from '../layout/LayoutTabEditor';
import { LAYOUT_TAB_CSS } from '../layout/styles';
import { debounce } from '../util';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function parseObjData(objData: unknown): any {
  return typeof objData === 'string' ? JSON.parse(objData) : objData;
}

// Whether the notes panel was left open, per browser.
const NOTES_OPEN_KEY = 'fate.sheetNotesOpen';
function readNotesOpen(): boolean {
  try {
    return window.localStorage.getItem(NOTES_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Character({ user }: { user: any }) {
  const { campaignShortname, characterShortname } = useParams();
  const [title, setTitle] = useState<string | null>(null);
  const [layout, setLayout] = useState<TabLayout | null>(null);
  const [data, setData] = useState<unknown>(null);
  // The latest data, for changes made after something slow (like an upload) finishes.
  const dataRef = useRef(data);
  dataRef.current = data;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [takingHit, setTakingHit] = useState(false);
  const [notesOpen, setNotesOpen] = useState(() => readNotesOpen());
  const toggleNotes = (open: boolean) => {
    setNotesOpen(open);
    try {
      window.localStorage.setItem(NOTES_OPEN_KEY, open ? '1' : '0');
    } catch {
      // Not remembering is fine.
    }
  };
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [hasGalleryTab, setHasGalleryTab] = useState(false);
  // The sheet data as last loaded or saved, to work out what the user changed.
  const base = useRef<unknown>(null);
  const [universeObjData, setUniverseObjData] = useState<unknown>(null);
  // Who's in the campaign, and who can see this character (see fate/vaults.ts).
  const [universe, setUniverse] = useState<{ author_permissions: { [id: number]: number }, authors: { [id: number]: string } } | null>(null);
  const [access, setAccess] = useState<{ itemType: string, vaultShort: string | null, vaultTitle: string | null, claim: Claim | null } | null>(null);
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
        const status = itemResponse.ok ? campaignResponse.status : itemResponse.status;
        // The campaign itself is checked before this page is shown (CampaignGate), so
        // it's the character that can't be read: hidden in a vault, or not there
        // (Archivium says 403 for both).
        setLoadError(status === 403 || status === 404
          ? "This character isn't there, or is hidden from you: the GMs can keep characters to themselves, and players can keep theirs to themselves and the GMs."
          : `Couldn't load the character (${status}).`);
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
      setUniverse(campaign);
      setAccess({ itemType: item.item_type, vaultShort: item.vault_short ?? null, vaultTitle: item.vault ?? null, claim: claimOf(parseObjData(item.obj_data)) });
      // Read in the shape of the campaign's layout, which may not have been upgraded yet.
      const sheetData = aspectsForLayout(layoutTabData(parseObjData(item.obj_data), sheetLayout.id), sheetLayout);
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

  if (loadError) return <div className='d-flex flex-col gap-2'>
    <Breadcrumbs campaign={campaignShortname} current={characterShortname} />
    <p className='ma-0'>{loadError}</p>
    <div><Link className='link link-animated' to={`/campaigns/${campaignShortname}`}>Back to the campaign</Link></div>
  </div>;

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
      {user && universe && access && campaignShortname && characterShortname && <VisibilityControls
        campaign={campaignShortname}
        item={characterShortname}
        itemType={access.itemType}
        vaultShort={access.vaultShort}
        vaultTitle={access.vaultTitle}
        claim={access.claim}
        user={user}
        universe={universe}
        onChange={(vaultShort, vaultTitle, claim) => setAccess(a => a && { ...a, vaultShort, vaultTitle, claim })}
      />}
      <span className={saveStatus === 'error' ? 'color-error' : undefined} style={{ color: saveStatus === 'error' ? undefined : 'var(--light-text-color)' }}>
        {saveStatus === 'saving' && 'Saving...'}
        {saveStatus === 'saved' && 'Saved'}
        {saveStatus === 'error' && 'Failed to save changes.'}
      </span>
    </div>
    {/* Sheet layouts have no image field, so the portrait sits beside the sheet in this app only. */}
    {campaignShortname && characterShortname && <div className='d-flex justify-between align-start gap-3'>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}><PortraitSlot
      campaignShortname={campaignShortname}
      characterShortname={characterShortname}
      title={title}
      portrait={portraitOf(data)}
      gallery={gallery}
      hasGalleryTab={hasGalleryTab}
      onChange={portrait => {
        const next = withPortrait(dataRef.current, portrait);
        setData(next);
        save(next);
      }}
      onGalleryChange={next => {
        setGallery(next);
        setHasGalleryTab(true);
      }}
      /></div>
      <button type='button' style={{ whiteSpace: 'nowrap' }} aria-pressed={notesOpen} onClick={() => toggleNotes(!notesOpen)} title='Your own notes on this character, which only you can see'>My notes</button>
    </div>}
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
        // Stunts are handled below; other entry lists with multiline parts (aspects'
        // backstories) take rich text. High Concept and Trouble are entryLists too (so
        // they render just like the other aspects), but always hold exactly one row.
        if (field.widget === 'entryList' && field.path !== STUNTS_PATH && field.fields.some(f => f.multiline) && campaignShortname) {
          return <RichEntryList
            field={field}
            id={id}
            campaign={campaignShortname}
            entries={entryListValues(field, data)}
            onChange={entries => set(field.path, entries)}
            single={field.path === 'highConcept' || field.path === 'trouble'}
          />;
        }
        // Stunts are picked from, or added to, the campaign's shared stunts.
        if (field.widget !== 'entryList' || field.path !== STUNTS_PATH || !field.fields.some(f => f.key === 'name')) return undefined;
        if (!campaignShortname) return undefined;
        return <StuntList
          editor={user}
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
    {/* Floats over the sheet, so it stays in view while scrolling through it (outside
        the page's glass pane, whose blur would otherwise pin it to the pane). */}
    {notesOpen && campaignShortname && characterShortname && createPortal(<div style={{
      ...panelStyle,
      position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 30,
      width: 'min(32rem, calc(100vw - 2rem))', padding: '0.75rem', boxSizing: 'border-box',
    }}>
      <PersonalNotes
        campaign={campaignShortname}
        item={characterShortname}
        itemTitle={title}
        user={user}
        maxHeight='60vh'
        onClose={() => toggleNotes(false)}
      />
    </div>, document.body)}
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
