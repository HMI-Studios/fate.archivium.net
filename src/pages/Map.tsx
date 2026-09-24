import { useParams } from 'react-router';
import SceneCanvas from '../components/SceneCanvas';

export default function Map() {
  const { campaignShortname, mapShortname } = useParams();

  if (!mapShortname || !campaignShortname) return <>No map specified!</>;

  return <SceneCanvas key={mapShortname} campaignShortname={campaignShortname} sceneShortname={mapShortname} />;
}
