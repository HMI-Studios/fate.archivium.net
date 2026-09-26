import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { glass, GLASS, useTheme } from '../theme';

// The game room's full-screen layout, like D&D Beyond's maps: the canvas fills the
// window, with a slim bar along the top and everything else in panels over it
// (SideDrawers at the edges, popovers from the bar, floating toolbars).

export const TOPBAR_HEIGHT = '2.75rem';

// Covers the whole window. Pages using it are routed outside the navbar.
export function FullScreen({ children }: { children: ReactNode }) {
  return (
    // Transparent, so a theme's backdrop on the page shows through. Clipped rather than
    // hidden, so focusing something in a closed drawer can't scroll the whole room.
    <div style={{ position: 'fixed', inset: 0, overflow: 'clip' }}>
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
  const theme = useTheme();
  return (
    <div
      className='d-flex align-center gap-2'
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: TOPBAR_HEIGHT, zIndex: 25,
        padding: '0 0.75rem', boxSizing: 'border-box',
        ...(theme.glass ? glass('var(--menu-color, #666)', GLASS.bars) : { background: 'var(--menu-color, #666)' }),
        borderBottom: '1px solid var(--menu-border-color, #6e6e6e)',
      }}
    >
      <div className='d-flex align-center gap-2' style={{ minWidth: 0, flex: '1 1 auto', whiteSpace: 'nowrap', overflow: 'hidden' }}>{left}</div>
      {right && <div className='d-flex align-center gap-2' style={{ flex: '0 1 auto', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden' }}>{right}</div>}
    </div>
  );
}

// A button that opens a panel, closed by clicking elsewhere or Esc. In the top bar the
// panel drops down from the bar's left edge (fixed, so the bar doesn't clip it); in a
// floating toolbar along the bottom it opens upwards, above the button.
export function MenuButton({ label, placement = 'topbar', title, width = 'min(18rem, calc(100vw - 1rem))', children }: {
  label: ReactNode,
  placement?: 'topbar' | 'above',
  title?: string,
  width?: string,
  children: (close: () => void) => ReactNode,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      // Dialogs opened from inside the panel (like the rich-text editor's link dialog)
      // live in #modal-anchor, but still belong to it.
      const target = e.target as Element;
      if (ref.current && !ref.current.contains(target) && !target.closest?.('#modal-anchor')) setOpen(false);
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
    <div ref={ref} style={placement === 'above' ? { position: 'relative', display: 'inline-flex' } : { display: 'contents' }}>
      <button aria-expanded={open} title={title} onClick={() => setOpen(o => !o)}>{label} {placement === 'above' ? '▴' : '▾'}</button>
      {open && (
        <div
          style={{
            ...panelStyle,
            ...(placement === 'above'
              ? { position: 'absolute', bottom: 'calc(100% + 0.6rem)', left: '50%', transform: 'translateX(-50%)', maxHeight: '60vh' }
              : { position: 'fixed', top: `calc(${TOPBAR_HEIGHT} + 0.25rem)`, left: '0.5rem', maxHeight: `calc(100vh - ${TOPBAR_HEIGHT} - 1rem)` }),
            zIndex: 40,
            width,
            overflowY: 'auto', padding: '0.75rem', boxSizing: 'border-box',
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
