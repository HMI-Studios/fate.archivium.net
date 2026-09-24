import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import Breadcrumbs, { archiviumItemUrl } from '../components/Breadcrumbs';
import SceneCanvas from '../components/SceneCanvas';
import { isLive, useSyncedDoc } from '../sync';
import { isGameMaster } from '../perms';
import type { Campaign } from './Campaign';


type SceneItem = {
  shortname: string;
  title: string;
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

  if (!campaignShortname) return <>No campaign specified!</>;

  if (!campaign || !scenes) return <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;

  const isGM = isGameMaster(campaign, user);
  const activeScene = liveActiveScene !== undefined ? liveActiveScene : (savedRoom?.activeScene ?? null);
  const sceneTitle = (shortname: string | null) => scenes.find(s => s.shortname === shortname)?.title ?? shortname;

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

  const offlineNotice = room?.status === 'offline' && (
    <p className='ma-0 mb-1'><small>Couldn't connect to the live room, so scene changes won't show up until you reload.</small></p>
  );

  // Hiding is only soft for now: players' screens only ever load the active scene,
  // but they can still read other scenes through the API. When Archivium can hide
  // items, unrevealed scenes should be hidden there too; `scene/` docs already
  // defer to item permissions, so this view needs no change for that.
  const breadcrumbs = <Breadcrumbs campaign={campaignShortname} current='Game room' />;

  if (!isGM) {
    return <>
      {breadcrumbs}
      <h1 className='mb-1'>{campaign.title}</h1>
      {offlineNotice}
      {activeScene
        ? <>
          <h2 className='mt-0 mb-1'>{sceneTitle(activeScene)}</h2>
          <SceneCanvas key={activeScene} campaignShortname={campaignShortname} sceneShortname={activeScene} gm={false} userName={user.username} />
        </>
        : <p>Waiting for the GM to show a scene…</p>}
    </>;
  }

  const shownScene = editingScene ?? activeScene;

  return <>
    {breadcrumbs}
    <h1 className='mb-1'>{campaign.title}</h1>
    {offlineNotice}
    <div className='d-flex gap-3'>
      <div style={{ flex: '0 0 220px' }}>
        <h3 className='mt-0 mb-1'>Scenes</h3>
        <p className='ma-0 mb-2'><small>
          Players see: <b>{activeScene ? sceneTitle(activeScene) : 'nothing'}</b>
        </small></p>
        <ul className='ma-0 pa-0 d-flex flex-col gap-1' style={{ listStyle: 'none' }}>
          {scenes.map(scene => {
            const isActive = scene.shortname === activeScene;
            const isOpen = scene.shortname === shownScene;
            return (
              <li key={scene.shortname} className='d-flex flex-col gap-0'>
                <a
                  className='link link-animated'
                  style={{ fontWeight: isOpen ? 'bold' : undefined, cursor: 'pointer' }}
                  onClick={() => setEditingScene(scene.shortname)}
                >
                  {scene.title}{isActive && ' (live)'}
                </a>
                {!isActive && isOpen && (
                  <button disabled={!canDrive} onClick={() => showToPlayers(scene.shortname)}>Show to players</button>
                )}
              </li>
            );
          })}
        </ul>
        {activeScene && <button className='mt-2' disabled={!canDrive} onClick={() => showToPlayers(null)}>Hide scene from players</button>}
        <p className='mt-2'>
          <Link className='link link-animated' to={`/campaigns/${campaignShortname}/maps/new`}>New scene</Link>
        </p>
        <p className='ma-0'>
          <Link className='link link-animated' to={`/campaigns/${campaignShortname}/players`}>Players</Link>
          {' · '}
          <Link className='link link-animated' to={`/campaigns/${campaignShortname}/settings`}>Campaign settings</Link>
        </p>
      </div>
      <div className='grow-1' style={{ minWidth: 0 }}>
        {shownScene
          ? <>
            <h2 className='mt-0 mb-1'>
              {sceneTitle(shownScene)}
              {shownScene !== activeScene && <small> (players can't see this)</small>}
            </h2>
            <p className='ma-0 mb-1'>
              <small><a className='link link-animated' href={archiviumItemUrl(campaignShortname, shownScene)}>Prepare this scene in Archivium</a></small>
            </p>
            <SceneCanvas key={shownScene} campaignShortname={campaignShortname} sceneShortname={shownScene} userName={user.username} />
          </>
          : <p>Pick a scene to edit, then show it to the players when it's ready.</p>}
      </div>
    </div>
  </>;
}
