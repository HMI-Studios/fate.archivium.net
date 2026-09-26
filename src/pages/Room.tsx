import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import { archiviumItemUrl } from '../components/Breadcrumbs';
import { FullScreen, TopBar, MenuButton } from '../components/PlayLayout';
import SceneCanvas from '../components/SceneCanvas';
import { isLive, useSyncedDoc } from '../sync';
import { isGameMaster } from '../perms';
import { GM_VAULT, setVisibility } from '../fate/vaults';
import { usePageTitle } from '../pageTitle';
import type { Campaign } from './Campaign';


type SceneItem = {
  shortname: string;
  title: string;
  // The vault it's in, if any: then players can't open it at all (see fate/vaults.ts).
  vault_short?: string | null;
  vault?: string | null;
};

// What the table as a whole is looking at. Persisted to the universe's obj_data so
// the room comes back the way the GM left it.
type RoomState = {
  activeScene: string | null;
};

interface Props {
  user: any;
}

export default function Room({ user }: Props) {
  const { campaignShortname } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [scenes, setScenes] = useState<SceneItem[] | null>(null);

  const room = useSyncedDoc(campaignShortname ? `room/${campaignShortname}` : null);
  const [liveActiveScene, setLiveActiveScene] = useState<string | null | undefined>(undefined);
  // The scene the GM has open, which may differ from what the players see.
  const [editingScene, setEditingScene] = useState<string | null>(null);
  // A scene being hidden or unhidden, and why the last attempt failed, if it did.
  const [moving, setMoving] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignShortname) return;
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) return;
      setCampaign(await response.json());
    });
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items?type=location`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) return;
      const items: (SceneItem & { item_type: string })[] = await response.json();
      setScenes(items.filter(item => item.item_type === 'location'));
    });
  }, [campaignShortname]);

  const yRoom = room?.ydoc.getMap<RoomState[keyof RoomState]>('room');

  useEffect(() => {
    if (!yRoom) return;
    const update = () => setLiveActiveScene(yRoom.has('activeScene') ? yRoom.get('activeScene') as string | null : undefined);
    yRoom.observe(update);
    update();
    return () => yRoom.unobserve(update);
  }, [room?.ydoc]);

  const savedRoom: RoomState | undefined = campaign?.obj_data?.room;
  const canDrive = isLive(room?.status) && !room?.readOnly;

  // Seed the live room from the last save if nobody has opened it since the server started.
  useEffect(() => {
    if (!canDrive || !yRoom || !campaign || yRoom.has('activeScene')) return;
    yRoom.set('activeScene', savedRoom?.activeScene ?? null);
  }, [canDrive, campaign]);

  const isGM = campaign ? isGameMaster(campaign, user) : false;
  const activeScene = liveActiveScene !== undefined ? liveActiveScene : (savedRoom?.activeScene ?? null);
  const sceneTitle = (shortname: string | null) => scenes?.find(s => s.shortname === shortname)?.title ?? shortname;
  // Players' screens only ever load the live scene, but they can read the others
  // through the API (and Archivium) unless a GM hides them in the GMs' vault.
  const shownScene = isGM ? editingScene ?? activeScene : activeScene;
  usePageTitle(shownScene ? sceneTitle(shownScene) : 'Game room', campaign?.title ?? campaignShortname);

  if (!campaignShortname) return <>No campaign specified!</>;

  if (!campaign || !scenes) return <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;

  const showToPlayers = async (shortname: string | null) => {
    if (!yRoom || !canDrive) return;
    yRoom.set('activeScene', shortname);
    await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/data`, {
      credentials: 'include',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ room: { activeScene: shortname } satisfies RoomState }),
    });
  };

  const isHidden = (shortname: string) => Boolean(scenes.find(s => s.shortname === shortname)?.vault_short);

  // Moves a scene into the GMs' vault, or out of it. A hidden scene is taken off the
  // players' screens first: live docs only check who may read them when they connect,
  // so anyone still connected would keep getting its changes.
  const setHidden = async (shortname: string, hidden: boolean): Promise<boolean> => {
    setMoving(shortname);
    setMoveError(null);
    try {
      if (hidden && shortname === activeScene) await showToPlayers(null);
      await setVisibility(campaignShortname, shortname, hidden ? { kind: 'gms' } : { kind: 'everyone' }, true);
      setScenes(current => current && current.map(s => s.shortname === shortname
        ? { ...s, vault_short: hidden ? GM_VAULT : null, vault: hidden ? 'GMs only' : null }
        : s));
      return true;
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setMoving(null);
    }
  };

  const scenesMenu = isGM && (
    <MenuButton label='Scenes'>
      {close => <div className='d-flex flex-col gap-2'>
        <small>Players see: <b>{activeScene ? sceneTitle(activeScene) : 'nothing'}</b></small>
        <ul className='ma-0 pa-0 d-flex flex-col gap-1' style={{ listStyle: 'none' }}>
          {scenes.map(scene => {
            const isActive = scene.shortname === activeScene;
            const isOpen = scene.shortname === shownScene;
            return (
              <li key={scene.shortname} className='d-flex flex-col gap-0'>
                <a
                  className='link link-animated'
                  style={{ fontWeight: isOpen ? 'bold' : undefined, cursor: 'pointer' }}
                  onClick={() => { setEditingScene(scene.shortname); close(); }}
                >
                  {scene.vault_short && <span title={`Hidden: only ${scene.vault ?? 'its vault'} can open it`}>🔒 </span>}
                  {scene.title}{isActive && ' (live)'}
                </a>
                {isOpen && <div className='d-flex gap-1 flex-wrap'>
                  {!isActive && <button
                    disabled={!canDrive || moving !== null}
                    title={scene.vault_short ? "Lets players open it again, and shows it to them" : undefined}
                    onClick={async () => { if (!scene.vault_short || await setHidden(scene.shortname, false)) showToPlayers(scene.shortname); }}
                  >{scene.vault_short ? 'Unhide and show to players' : 'Show to players'}</button>}
                  <button
                    disabled={moving !== null || (isActive && !canDrive)}
                    title={scene.vault_short
                      ? 'Takes it out of the GMs’ vault, so players can open it (it still isn’t shown until you show it)'
                      : 'Moves it into the GMs’ vault, so players can’t open it at all, even in Archivium'}
                    onClick={() => setHidden(scene.shortname, !scene.vault_short)}
                  >{moving === scene.shortname ? 'Saving…' : scene.vault_short ? 'Unhide' : isActive ? 'Stop showing and hide' : 'Hide from players'}</button>
                </div>}
              </li>
            );
          })}
        </ul>
        {moveError && <small className='color-error'>{moveError}</small>}
        {activeScene && <button disabled={!canDrive} onClick={() => showToPlayers(null)}>Show players nothing</button>}
        <div className='d-flex flex-col gap-1'>
          <Link className='link link-animated' to={`/campaigns/${campaignShortname}/maps/new`}>New scene</Link>
          {shownScene && <a className='link link-animated' href={archiviumItemUrl(campaignShortname, shownScene)}>Prepare this scene in Archivium</a>}
          <Link className='link link-animated' to={`/campaigns/${campaignShortname}/players`}>Players</Link>
          <Link className='link link-animated' to={`/campaigns/${campaignShortname}/settings`}>Campaign settings</Link>
        </div>
      </div>}
    </MenuButton>
  );

  const header = <>
    <Link className='link link-animated' to={`/campaigns/${campaignShortname}`} title='Back to the campaign'>‹ {campaign.title}</Link>
    {scenesMenu}
    {shownScene && <b style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sceneTitle(shownScene)}</b>}
    {isGM && shownScene && shownScene !== activeScene && <small>{isHidden(shownScene) ? '(hidden: GMs only)' : "(players can't see this)"}</small>}
    {isGM && shownScene && shownScene === activeScene && <small>(live)</small>}
  </>;
  const headerEnd = room?.status === 'offline' && (
    <small title="Couldn't connect to the live room, so scene changes won't show up until you reload.">Room offline</small>
  );

  if (!shownScene) {
    return <FullScreen>
      <TopBar left={header} right={headerEnd} />
      <div className='d-flex justify-center align-center' style={{ position: 'absolute', inset: 0, padding: '1rem', textAlign: 'center' }}>
        <p className='ma-0'>{isGM
          ? 'Pick a scene to edit from the Scenes menu, then show it to the players when it’s ready.'
          : 'Waiting for the GM to show a scene…'}</p>
      </div>
    </FullScreen>;
  }

  return <SceneCanvas
    key={shownScene}
    campaignShortname={campaignShortname}
    sceneShortname={shownScene}
    gm={isGM}
    userName={user.username}
    userId={user.id}
    header={header}
    headerEnd={headerEnd}
  />;
}
