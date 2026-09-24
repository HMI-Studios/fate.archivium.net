import { useState } from 'react';
import { galleryImageUrl, uploadToGallery, type GalleryImage } from '../fate/portrait';

interface Props {
  campaignShortname: string;
  characterShortname: string;
  title: string;
  portrait: number | null;
  gallery: GalleryImage[];
  hasGalleryTab: boolean;
  onChange: (portrait: number | null) => void;
  onGalleryChange: (gallery: GalleryImage[]) => void;
}

const SIZE = '9rem';

export default function PortraitSlot({ campaignShortname, characterShortname, title, portrait, gallery, hasGalleryTab, onChange, onGalleryChange }: Props) {
  const [choosing, setChoosing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const id = await uploadToGallery(campaignShortname, characterShortname, file, hasGalleryTab);
      onGalleryChange([{ id, name: file.name, label: '' }, ...gallery]);
      onChange(id);
      setChoosing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload the image.");
    }
    setUploading(false);
  };

  return (
    <div className='d-flex gap-3 align-center flex-wrap'>
      <div
        style={{
          width: SIZE, height: SIZE, flex: `0 0 ${SIZE}`, borderRadius: '50%', overflow: 'hidden',
          border: '2px solid var(--tab-border-color, #4f4f4f)', background: 'var(--tab-color, #2a2a2a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {portrait !== null
          ? <img
            src={galleryImageUrl(campaignShortname, characterShortname, portrait)}
            alt={`Portrait of ${title}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          : <small style={{ opacity: 0.7 }}>No portrait</small>}
      </div>
      <div className='d-flex flex-col gap-1'>
        <label className='d-flex flex-col gap-1'>
          <small>Upload a portrait (it's added to the character's gallery)</small>
          <input
            type='file'
            accept='image/*'
            disabled={uploading}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = '';
            }}
          />
        </label>
        <div className='d-flex gap-1 flex-wrap'>
          {gallery.length > 0 && (
            <button type='button' onClick={() => setChoosing(c => !c)}>{choosing ? 'Done' : 'Choose from gallery'}</button>
          )}
          {portrait !== null && <button type='button' onClick={() => onChange(null)}>Remove portrait</button>}
        </div>
        {uploading && <small>Uploading…</small>}
        {error && <small className='color-error'>{error}</small>}
      </div>
      {choosing && (
        <div className='d-flex gap-1 flex-wrap w-100'>
          {gallery.map(image => (
            <button
              key={image.id}
              type='button'
              title={image.label || image.name}
              aria-pressed={image.id === portrait}
              onClick={() => { onChange(image.id); setChoosing(false); }}
              style={{
                padding: 2, width: '4.5rem', height: '4.5rem',
                outline: image.id === portrait ? '2px solid var(--link-color, #46b9f2)' : undefined,
              }}
            >
              <img
                src={galleryImageUrl(campaignShortname, characterShortname, image.id)}
                alt={image.label || image.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
