import { useEffect, useState } from 'react';
import { ARCHIVIUM_URL } from '../App';

// Character portraits are images in the item's Archivium gallery; the sheet stores
// which one (obj_data.fate.portrait = gallery image id).

export const PORTRAIT_KEY = 'portrait';

export type GalleryImage = {
  id: number;
  name: string;
  label: string;
  // A tiny blurred preview as a data URI, when Archivium has one.
  preview?: string | null;
};

const itemUrl = (campaign: string, item: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}/items/${item}`;

export const galleryImageUrl = (campaign: string, item: string, imageId: number) => `${itemUrl(campaign, item)}/gallery/images/${imageId}`;

export function portraitId(sheet: unknown): number | null {
  const value = sheet && typeof sheet === 'object' ? (sheet as Record<string, unknown>)[PORTRAIT_KEY] : undefined;
  return typeof value === 'number' ? value : null;
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
