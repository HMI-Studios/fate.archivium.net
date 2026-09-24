import { Link, useParams } from 'react-router';
import Breadcrumbs, { archiviumItemUrl } from '../components/Breadcrumbs';
import SceneCanvas from '../components/SceneCanvas';

interface Props {
  user: any;
}

export default function Map({ user }: Props) {
  const { campaignShortname, mapShortname } = useParams();

  if (!mapShortname || !campaignShortname) return <>No map specified!</>;

  return <>
    <Breadcrumbs campaign={campaignShortname} item={mapShortname} />
    <div className='d-flex align-center gap-3 flex-wrap mb-2'>
      <Link className='link link-animated' to={`/campaigns/${campaignShortname}/play`}>Game room</Link>
      <a className='link link-animated' href={archiviumItemUrl(campaignShortname, mapShortname)}>Open in Archivium</a>
    </div>
    <SceneCanvas key={mapShortname} campaignShortname={campaignShortname} sceneShortname={mapShortname} userName={user?.username} />
  </>;
}
