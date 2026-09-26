import { useEffect, useState } from 'react';
import { ARCHIVIUM_URL } from '../App';

// Character portraits are images in the item's Archivium gallery; the sheet stores
// which one (obj_data.fate.portrait = gallery image id).

export const PORTRAIT_KEY = 'portrait';
// The gallery image a portrait was cropped from, so it can be cropped again from the whole
// picture; portraits cropped from a new upload have none (only the crop is uploaded).
export const PORTRAIT_SOURCE_KEY = 'portraitSource';
// Whether the portrait is a crop made in this app, which can be deleted when it's replaced.
export const PORTRAIT_CROP_KEY = 'portraitCrop';

export type Portrait = { id: number, source: number | null, crop: boolean };

export type GalleryImage = {
  id: number;
  name: string;
  label: string;
  // A tiny blurred preview as a data URI, when Archivium has one.
  preview?: string | null;
};

const itemUrl = (campaign: string, item: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}/items/${item}`;

export const galleryImageUrl = (campaign: string, item: string, imageId: number) => `${itemUrl(campaign, item)}/gallery/images/${imageId}`;

export function portraitId(sheet: unknown, key = PORTRAIT_KEY): number | null {
  const value = sheet && typeof sheet === 'object' ? (sheet as Record<string, unknown>)[key] : undefined;
  return typeof value === 'number' ? value : null;
}

export function portraitOf(sheet: unknown): Portrait | null {
  const id = portraitId(sheet);
  if (id === null) return null;
  return { id, source: portraitId(sheet, PORTRAIT_SOURCE_KEY), crop: (sheet as Record<string, unknown>)[PORTRAIT_CROP_KEY] === true };
}

// A sheet with `portrait` (or none) instead of its current one.
export function withPortrait(sheet: unknown, portrait: Portrait | null): Record<string, unknown> {
  const { [PORTRAIT_KEY]: _, [PORTRAIT_SOURCE_KEY]: _source, [PORTRAIT_CROP_KEY]: _crop, ...rest } = (sheet ?? {}) as Record<string, unknown>;
  if (!portrait) return rest;
  return {
    ...rest,
    [PORTRAIT_KEY]: portrait.id,
    ...(portrait.source !== null ? { [PORTRAIT_SOURCE_KEY]: portrait.source } : {}),
    ...(portrait.crop ? { [PORTRAIT_CROP_KEY]: true } : {}),
  };
}

// Uploads an image to the item's gallery and returns its id. Items only show a
// Gallery tab in Archivium when they have one, so this adds it if it's missing.
export async function uploadToGallery(campaign: string, item: string, file: File, hasGalleryTab: boolean): Promise<number> {
  const formData = new FormData();
  formData.append('image', file);
  const response = await fetch(`${itemUrl(campaign, item)}/gallery/upload`, {
    credentials: 'include',
    method: 'POST',
    body: formData,
  });
  if (response.status === 507) throw new Error('This campaign is out of image storage.');
  if (!response.ok) throw new Error(`Couldn't upload the image (${response.status}).`);
  const { insertId } = await response.json();

  if (!hasGalleryTab) {
    await fetch(`${itemUrl(campaign, item)}/data`, {
      credentials: 'include',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gallery: { title: 'Gallery' } }),
    });
  }
  return insertId;
}

// Deletes an image from the item's gallery and returns what's left in it. Archivium has
// no endpoint for this: like its own editor, it saves the whole item with the image left
// out of its gallery. The rest of the item is sent back as it's fetched here, just
// before, so only an edit saved in the moment between the two would be lost.
export async function deleteGalleryImage(campaign: string, item: string, imageId: number): Promise<GalleryImage[]> {
  const fetched = await fetch(itemUrl(campaign, item), { credentials: 'include' });
  if (!fetched.ok) throw new Error(`Couldn't load ${item} (${fetched.status}).`);
  const current = await fetched.json();
  const gallery = ((current.gallery ?? []) as GalleryImage[]).filter(image => image.id !== imageId);
  const response = await fetch(itemUrl(campaign, item), {
    credentials: 'include',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: current.title,
      item_type: current.item_type,
      obj_data: typeof current.obj_data === 'string' ? JSON.parse(current.obj_data) : current.obj_data,
      // Saving an item replaces its tags, so they're sent back too.
      tags: current.tags ?? [],
      gallery: gallery.map(({ id, name, label }) => ({ id, name, label })),
    }),
  });
  if (!response.ok) throw new Error(`Couldn't delete the image (${response.status}).`);
  return gallery;
}

// Loads an image for drawing on a canvas; null until it has loaded (or if it fails).
export function useCanvasImage(url: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImage(null);
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'use-credentials';
    img.onload = () => { if (!cancelled) setImage(img); };
    img.src = url;
    return () => { cancelled = true; };
  }, [url]);
  return image;
}
