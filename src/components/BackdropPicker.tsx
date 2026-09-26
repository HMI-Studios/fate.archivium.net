import { useEffect, useRef, useState } from 'react';
import { ARCHIVIUM_URL } from '../App';
import { galleryImageUrl, uploadToGallery, type GalleryImage } from '../fate/portrait';

type Props = {
  campaign: string;
  scene: string;
  // The gallery image behind the room, or null for the theme's own backdrop.
  current: number | null;
  // Whether the campaign is premium (null while that's being checked).
  premium: boolean | null;
  onPick: (imageId: number | null) => void;
};

// Picks the game room's backdrop from the scene's gallery, in the GM's Map menu.
export default function BackdropPicker({ campaign, scene, current, premium, onPick }: Props) {
  // Loaded each time the menu opens, so images added in Archivium show up.
  const [gallery, setGallery] = useState<GalleryImage[] | null>(null);
  const [hasGalleryTab, setHasGalleryTab] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!premium) return;
    let cancelled = false;
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaign}/items/${scene}`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`Couldn't load the scene's gallery (${response.status}).`)))
      .then(item => {
        if (cancelled) return;
        const objData = typeof item.obj_data === 'string' ? JSON.parse(item.obj_data) : item.obj_data;
        setGallery(item.gallery ?? []);
        setHasGalleryTab(objData?.gallery !== undefined);
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [campaign, scene, premium]);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const id = await uploadToGallery(campaign, scene, file, hasGalleryTab);
      setGallery(g => [{ id, name: file.name, label: '' }, ...(g ?? [])]);
      setHasGalleryTab(true);
      onPick(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const heading = <strong>Room backdrop</strong>;
  if (premium === null) return heading;
  if (!premium) {
    return <div className='d-flex flex-col gap-1'>
      {heading}
      <small>Premium campaigns can put an image from the scene's gallery behind the game room, in place of the theme's backdrop.</small>
    </div>;
  }

  const thumb = (selected: boolean): React.CSSProperties => ({
    padding: 0, aspectRatio: '1', overflow: 'hidden', borderRadius: 4, cursor: 'pointer',
    border: `2px solid ${selected ? 'var(--link-color, #4af)' : 'transparent'}`,
  });

  return <div className='d-flex flex-col gap-1'>
    {heading}
    {error && <small style={{ color: 'var(--error-color, #f66)' }}>{error}</small>}
    {gallery === null && !error && <small>Loading the scene's gallery…</small>}
    {gallery?.length === 0 && <small>The scene's gallery is empty: upload an image to use it here.</small>}
    {gallery && gallery.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.25rem' }}>
      {gallery.map(image => <button
        key={image.id}
        type='button'
        style={thumb(image.id === current)}
        title={image.label || image.name}
        aria-label={`Use ${image.label || image.name} as the backdrop`}
        aria-pressed={image.id === current}
        onClick={() => onPick(image.id)}
      >
        <img src={galleryImageUrl(campaign, scene, image.id)} alt='' loading='lazy' style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </button>)}
    </div>}
    <div className='d-flex gap-1 flex-wrap'>
      <button type='button' disabled={uploading} onClick={() => fileInput.current?.click()} title="Adds the image to the scene's gallery">
        {uploading ? 'Uploading…' : 'Upload…'}
      </button>
      {current !== null && <button type='button' onClick={() => onPick(null)}>Use the theme's backdrop</button>}
    </div>
    <input
      ref={fileInput}
      type='file'
      accept='image/*'
      aria-label='Backdrop image'
      style={{ display: 'none' }}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) upload(file);
        e.target.value = '';
      }}
    />
  </div>;
}
