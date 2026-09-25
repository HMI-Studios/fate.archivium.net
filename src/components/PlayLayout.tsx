import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

// The game room's full-screen layout, like D&D Beyond's maps: the canvas fills the
// window, with a slim bar along the top and everything else in panels over it
// (SideDrawers at the edges, popovers from the bar, floating toolbars).

export const TOPBAR_HEIGHT = '2.75rem';

// Covers the whole window. Pages using it are routed outside the navbar.
export function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: 'var(--page-color, #444)' }}>
      {children}
    </div>
  );
}

export const panelStyle: CSSProperties = {
  background: 'var(--sheet-color, #333)',
  border: '1px solid var(--menu-border-color, #6e6e6e)',
  borderRadius: 6,
  boxShadow: '0 0.25rem 0.75rem rgb(0 0 0 / 25%)',
};

export function TopBar({ left, right }: { left: ReactNode, right?: ReactNode }) {
  return (
    <div
      className='d-flex align-center gap-2'
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: TOPBAR_HEIGHT, zIndex: 25,
        padding: '0 0.75rem', boxSizing: 'border-box',
        background: 'var(--menu-color, #666)',
        borderBottom: '1px solid var(--menu-border-color, #6e6e6e)',
      }}
    >
      <div className='d-flex align-center gap-2' style={{ minWidth: 0, flex: '1 1 auto', whiteSpace: 'nowrap', overflow: 'hidden' }}>{left}</div>
      {right && <div className='d-flex align-center gap-2' style={{ flex: '0 1 auto', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' }}>{right}</div>}
    </div>
  );
}

// A button in the top bar that opens a panel below it, closed by clicking elsewhere.
// The panel is rendered outside the bar so it isn't clipped by it.
export function TopBarMenu({ label, children }: { label: ReactNode, children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      <button aria-expanded={open} onClick={() => setOpen(o => !o)}>{label} ▾</button>
      {open && (
        <div
          style={{
            ...panelStyle,
            position: 'fixed', top: `calc(${TOPBAR_HEIGHT} + 0.25rem)`, left: '0.5rem', zIndex: 40,
            width: 'min(18rem, calc(100vw - 1rem))', maxHeight: `calc(100vh - ${TOPBAR_HEIGHT} - 1rem)`,
            overflowY: 'auto', padding: '0.75rem', boxSizing: 'border-box',
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
