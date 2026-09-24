import { useParams } from 'react-router';
import SceneCanvas from '../components/SceneCanvas';

interface Props {
  user: any;
}

export default function Map({ user }: Props) {
  const { campaignShortname, mapShortname } = useParams();

  if (!mapShortname || !campaignShortname) return <>No map specified!</>;

  return <SceneCanvas key={mapShortname} campaignShortname={campaignShortname} sceneShortname={mapShortname} userName={user?.username} />;
}
