import { useState } from 'react';
import { deleteGalleryImage, galleryImageUrl, uploadToGallery, type GalleryImage, type Portrait } from '../fate/portrait';
import PortraitCropDialog from './PortraitCropDialog';

interface Props {
  campaignShortname: string;
  characterShortname: string;
  title: string;
  portrait: Portrait | null;
  gallery: GalleryImage[];
  hasGalleryTab: boolean;
  onChange: (portrait: Portrait | null) => void;
  onGalleryChange: (gallery: GalleryImage[]) => void;
}

const SIZE = '9rem';

export default function PortraitSlot({ campaignShortname, characterShortname, title, portrait, gallery, hasGalleryTab, onChange, onGalleryChange }: Props) {
  const [choosing, setChoosing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A picture being cropped: a new file, or a gallery image (by id).
  const [cropping, setCropping] = useState<{ file: File } | { imageId: number } | null>(null);
  // The gallery image waiting for the user to confirm deleting it.
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);

  const imageUrl = (id: number) => galleryImageUrl(campaignShortname, characterShortname, id);
  const croppingName = !cropping ? '' : 'file' in cropping ? cropping.file.name : gallery.find(g => g.id === cropping.imageId)?.name ?? 'portrait';
  // A new portrait replaces the current one; if that's a crop made here, it can go.
  const replacing = portrait?.crop ? gallery.find(g => g.id === portrait.id) : undefined;
  const busy = uploading || deleting !== null;

  // Deletes an image from the gallery, and stops using it as the portrait (or its source),
  // which is `next` once it's gone.
  const remove = async (imageId: number, next = portrait) => {
    const remaining = await deleteGalleryImage(campaignShortname, characterShortname, imageId);
    onGalleryChange(remaining);
    const after = !next || next.id === imageId ? null : next.source === imageId ? { ...next, source: null } : next;
    if (JSON.stringify(after) !== JSON.stringify(portrait)) onChange(after);
  };

  const removeFromGallery = async (imageId: number) => {
    setDeleting(imageId);
    setError(null);
    try {
      await remove(imageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the image.");
    }
    setConfirmingDelete(null);
    setDeleting(null);
  };

  // Switches to a new portrait, deleting the crop it replaces (if any). The new portrait
  // is kept even if that fails.
  const replace = async (next: Portrait, replaced: number | null) => {
    if (replaced === null || replaced === next.id) return onChange(next);
    try {
      await remove(replaced, next);
    } catch {
      onChange(next.source === replaced ? { ...next, source: null } : next);
      setError("The new portrait is saved, but the previous crop couldn't be deleted from the gallery.");
    }
  };

  // Uploads a new portrait; `replaced` is the crop it replaces, to delete.
  const upload = async (file: File, source: number | null, crop: boolean, replaced: number | null) => {
    setUploading(true);
    setError(null);
    try {
      const id = await uploadToGallery(campaignShortname, characterShortname, file, hasGalleryTab);
      onGalleryChange([{ id, name: file.name, label: '' }, ...gallery]);
      await replace({ id, source, crop }, replaced);
      setChoosing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload the image.");
    }
    setUploading(false);
  };

  // Only the cropped portrait is uploaded, as a new gallery image.
  const uploadCrop = (image: Blob, deleteReplaced: boolean) => {
    if (!cropping) return;
    const extension = image.type === 'image/png' ? 'png' : 'jpg';
    const name = `${croppingName.replace(/\.[^.]+$/, '').replace(/-portrait$/, '')}-portrait.${extension}`;
    const source = 'imageId' in cropping ? cropping.imageId : null;
    upload(new File([image], name, { type: image.type }), source, true, deleteReplaced && replacing ? replacing.id : null);
  };

  // Uses a picture as it is.
  const useWhole = (deleteReplaced: boolean) => {
    if (!cropping) return;
    const replaced = deleteReplaced && replacing ? replacing.id : null;
    if ('file' in cropping) return upload(cropping.file, null, false, replaced);
    setError(null);
    setDeleting(replaced);
    replace({ id: cropping.imageId, source: null, crop: false }, replaced).finally(() => setDeleting(null));
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
            src={imageUrl(portrait.id)}
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
            disabled={busy}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) setCropping({ file });
              e.target.value = '';
            }}
          />
        </label>
        <div className='d-flex gap-1 flex-wrap'>
          {gallery.length > 0 && (
            <button type='button' onClick={() => setChoosing(c => !c)}>{choosing ? 'Done' : 'Gallery'}</button>
          )}
          {portrait !== null && <button
            type='button'
            disabled={busy}
            onClick={() => setCropping({ imageId: portrait.source ?? portrait.id })}
            title='Move or zoom the picture in its frame'
          >Adjust</button>}
          {portrait !== null && <button type='button' onClick={() => onChange(null)} title='Stop using a portrait (the picture stays in the gallery)'>Remove portrait</button>}
        </div>
        {uploading && <small>Uploading…</small>}
        {deleting !== null && <small>Deleting…</small>}
        {error && <small className='color-error'>{error}</small>}
      </div>
      {choosing && gallery.length > 0 && (
        <div className='d-flex flex-col gap-1 w-100'>
          <small style={{ opacity: 0.8 }}>
            Pick a picture to use as the portrait, or delete ones you don't need: the campaign can only hold so many images.
          </small>
          <div className='d-flex gap-1 flex-wrap'>
            {gallery.map(image => (
              <div key={image.id} style={{ position: 'relative', width: '4.5rem', height: '4.5rem' }}>
                <button
                  type='button'
                  title={`${image.label || image.name}${image.id === portrait?.id ? ' (the portrait)' : ''}`}
                  aria-pressed={image.id === portrait?.id}
                  disabled={busy}
                  onClick={() => { setChoosing(false); setCropping({ imageId: image.id }); }}
                  style={{
                    padding: 2, width: '100%', height: '100%',
                    outline: image.id === portrait?.id ? '2px solid var(--link-color, #46b9f2)' : undefined,
                  }}
                >
                  <img
                    src={imageUrl(image.id)}
                    alt={image.label || image.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </button>
                {confirmingDelete === image.id
                  ? <div
                    className='d-flex flex-col gap-1 align-center justify-center'
                    style={{ position: 'absolute', inset: 0, background: 'rgb(0 0 0 / 75%)', color: '#fff', borderRadius: 4 }}
                  >
                    <small>{deleting === image.id ? 'Deleting…' : 'Delete?'}</small>
                    {deleting !== image.id && <div className='d-flex gap-1'>
                      <button type='button' onClick={() => removeFromGallery(image.id)} title={`Delete ${image.name} from the gallery for good`} style={{ padding: '0 0.3rem' }}>Yes</button>
                      <button type='button' onClick={() => setConfirmingDelete(null)} style={{ padding: '0 0.3rem' }}>No</button>
                    </div>}
                  </div>
                  : <button
                    type='button'
                    aria-label={`Delete ${image.label || image.name}`}
                    title='Delete from the gallery'
                    disabled={busy}
                    onClick={() => setConfirmingDelete(image.id)}
                    style={{
                      position: 'absolute', top: 2, right: 2, width: '1.3rem', height: '1.3rem', padding: 0, lineHeight: 1,
                      borderRadius: '50%', background: 'rgb(0 0 0 / 65%)', color: '#fff', border: 'none',
                    }}
                  >×</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      {cropping && <PortraitCropDialog
        source={'file' in cropping ? cropping.file : imageUrl(cropping.imageId)}
        png={'file' in cropping ? cropping.file.type === 'image/png' : /\.png$/i.test(croppingName)}
        replacing={replacing?.name}
        onCrop={uploadCrop}
        onUseWhole={useWhole}
        onClose={() => setCropping(null)}
      />}
    </div>
  );
}
