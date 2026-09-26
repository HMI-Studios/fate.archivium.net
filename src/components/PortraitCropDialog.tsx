import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// Cropping a picture to a square portrait before it's uploaded: drag to move it in the
// frame and zoom in, with the circle portraits are shown in marked on the square.

type Props = {
  // An image file, or the URL of one Archivium already has (readable across origins).
  source: File | string;
  // Whether to keep it a PNG (which may be see-through); otherwise it becomes a JPEG.
  png: boolean;
  onCrop: (image: Blob) => void;
  // Uses the picture as it is, centred in the frame as before.
  onUseWhole: () => void;
  onClose: () => void;
};

// The frame, on screen.
const FRAME = 288;
const MAX_ZOOM = 4;
// Portraits are made at most this many pixels across.
const MAX_OUTPUT = 1024;

type View = { zoom: number, x: number, y: number };

export default function PortraitCropDialog({ source, png, onCrop, onUseWhole, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  // The image's top-left corner in the frame, and how far it's zoomed in from just covering it.
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ pointerX: number, pointerY: number, x: number, y: number } | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const img = new Image();
    img.crossOrigin = 'use-credentials';
    img.onload = () => {
      setImage(img);
      setView(centred(img, 1));
    };
    img.onerror = () => setFailed(true);
    img.src = url;
    return () => { if (typeof source !== 'string') URL.revokeObjectURL(url); };
  }, [source]);

  const baseScale = image ? FRAME / Math.min(image.naturalWidth, image.naturalHeight) : 1;
  const scale = baseScale * view.zoom;

  // Keeps the image covering the whole frame.
  const clamp = (next: View): View => {
    if (!image) return next;
    const s = baseScale * next.zoom;
    return {
      zoom: next.zoom,
      x: Math.min(0, Math.max(FRAME - image.naturalWidth * s, next.x)),
      y: Math.min(0, Math.max(FRAME - image.naturalHeight * s, next.y)),
    };
  };

  function centred(img: HTMLImageElement, zoom: number): View {
    const s = FRAME / Math.min(img.naturalWidth, img.naturalHeight) * zoom;
    return { zoom, x: (FRAME - img.naturalWidth * s) / 2, y: (FRAME - img.naturalHeight * s) / 2 };
  }

  // Zooms keeping the frame's centre on the same part of the picture.
  const zoomTo = (zoom: number) => setView(current => {
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
    const ratio = next / current.zoom;
    const centre = FRAME / 2;
    return clamp({ zoom: next, x: centre - (centre - current.x) * ratio, y: centre - (centre - current.y) * ratio });
  });

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerX: e.clientX, pointerY: e.clientY, x: view.x, y: view.y };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    setView(current => clamp({ ...current, x: start.x + e.clientX - start.pointerX, y: start.y + e.clientY - start.pointerY }));
  };
  const onPointerUp = () => { drag.current = null; };

  const crop = () => {
    if (!image) return;
    const side = FRAME / scale;
    const size = Math.round(Math.min(MAX_OUTPUT, side));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')!.drawImage(image, -view.x / scale, -view.y / scale, side, side, 0, 0, size, size);
    const type = png ? 'image/png' : 'image/jpeg';
    canvas.toBlob(blob => {
      if (blob) onCrop(blob);
      dialog.current?.close();
    }, type, 0.92);
  };

  return <dialog
    ref={dialog}
    aria-labelledby='crop-title'
    onClose={onClose}
    style={{
      padding: '1rem', borderRadius: 8, border: '1px solid var(--tab-border-color, #4f4f4f)',
      background: 'var(--tab-color, #2a2a2a)', color: 'var(--text-color)',
    }}
  >
    <div className='d-flex flex-col gap-2' style={{ width: FRAME }}>
      <h3 id='crop-title' className='ma-0'>Position the portrait</h3>
      <small style={{ opacity: 0.8 }}>Drag to move it, and zoom in to fit it to the circle.</small>
      <div
        role='img'
        aria-label='Portrait crop'
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={e => zoomTo(view.zoom * Math.exp(-e.deltaY * 0.0015))}
        style={{
          position: 'relative', width: FRAME, height: FRAME, overflow: 'hidden', touchAction: 'none',
          cursor: drag.current ? 'grabbing' : 'grab', background: '#111', borderRadius: 4,
        }}
      >
        {image && <img
          src={image.src}
          alt=''
          draggable={false}
          style={{
            position: 'absolute', left: view.x, top: view.y, maxWidth: 'none',
            width: image.naturalWidth * scale, height: image.naturalHeight * scale, userSelect: 'none', pointerEvents: 'none',
          }}
        />}
        {/* The circle portraits are shown in; the corners outside it are dimmed. */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: '0 0 0 999px rgb(0 0 0 / 45%)', border: '2px solid rgb(255 255 255 / 70%)', pointerEvents: 'none' }} />
        {!image && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {failed ? "Couldn't load the image." : 'Loading…'}
        </span>}
      </div>
      <label className='d-flex align-center gap-1'>
        <small>Zoom</small>
        <input
          type='range'
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={view.zoom}
          disabled={!image}
          onChange={({ target }) => zoomTo(Number(target.value))}
          style={{ flex: '1 1 auto' }}
        />
      </label>
      <div className='d-flex gap-1 justify-end'>
        <button type='button' onClick={() => dialog.current?.close()}>Cancel</button>
        <button type='button' onClick={() => { onUseWhole(); dialog.current?.close(); }} title='Use the whole picture, without cropping it'>Don't crop</button>
        <button type='button' disabled={!image} onClick={crop}><b>Use this</b></button>
      </div>
    </div>
  </dialog>;
}
