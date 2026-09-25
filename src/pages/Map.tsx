import { Link, useParams } from 'react-router';
import { archiviumItemUrl, useTitle } from '../components/Breadcrumbs';
import SceneCanvas from '../components/SceneCanvas';

interface Props {
  user: any;
}

export default function Map({ user }: Props) {
  const { campaignShortname, mapShortname } = useParams();
  const campaignTitle = useTitle(campaignShortname ?? null);
  const mapTitle = useTitle(campaignShortname && mapShortname ? `${campaignShortname}/items/${mapShortname}` : null);

  if (!mapShortname || !campaignShortname) return <>No map specified!</>;

  return (
    <SceneCanvas
      key={mapShortname}
      campaignShortname={campaignShortname}
      sceneShortname={mapShortname}
      userName={user?.username}
      header={<>
        <Link className='link link-animated' to={`/campaigns/${campaignShortname}`}>‹ {campaignTitle ?? campaignShortname}</Link>
        <b style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{mapTitle ?? mapShortname}</b>
      </>}
      headerEnd={<>
        <Link className='link link-animated' to={`/campaigns/${campaignShortname}/play`}>Game room</Link>
        <a className='link link-animated' href={archiviumItemUrl(campaignShortname, mapShortname)}>Open in Archivium</a>
      </>}
    />
  );
}
