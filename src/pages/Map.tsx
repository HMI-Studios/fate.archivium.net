import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import { archiviumItemUrl, useTitle } from '../components/Breadcrumbs';
import SceneCanvas from '../components/SceneCanvas';
import { isGameMaster } from '../perms';
import type { Campaign } from './Campaign';

interface Props {
  user: any;
}

export default function Map({ user }: Props) {
  const { campaignShortname, mapShortname } = useParams();
  const mapTitle = useTitle(campaignShortname && mapShortname ? `${campaignShortname}/items/${mapShortname}` : null);
  // Needed to know whether the viewer is the GM; undefined while loading, null if it can't be read.
  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined);

  useEffect(() => {
    if (!campaignShortname) return;
    setCampaign(undefined);
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' })
      .then(async response => setCampaign(response.ok ? await response.json() : null))
      .catch(() => setCampaign(null));
  }, [campaignShortname]);

  if (!mapShortname || !campaignShortname) return <>No map specified!</>;

  if (campaign === undefined) return <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;

  return (
    <SceneCanvas
      key={mapShortname}
      campaignShortname={campaignShortname}
      sceneShortname={mapShortname}
      gm={campaign ? isGameMaster(campaign, user) : false}
      userName={user?.username}
      userId={user?.id}
      header={<>
        <Link className='link link-animated' to={`/campaigns/${campaignShortname}`}>‹ {campaign?.title ?? campaignShortname}</Link>
        <b style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{mapTitle ?? mapShortname}</b>
      </>}
      headerEnd={<>
        <Link className='link link-animated' to={`/campaigns/${campaignShortname}/play`}>Game room</Link>
        <a className='link link-animated' href={archiviumItemUrl(campaignShortname, mapShortname)}>Open in Archivium</a>
      </>}
    />
  );
}
