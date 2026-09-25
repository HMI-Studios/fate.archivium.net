import { useEffect, useState, type ReactNode } from 'react';
import { TOPBAR_HEIGHT } from './PlayLayout';

// A panel docked to an edge of the game room that slides open and closed over the
// canvas, with a tab to toggle it that stays visible while it's closed (like D&D
// Beyond's game log).

function readOpen(storageKey: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === null ? fallback : stored === '1';
  } catch {
    return fallback;
  }
}

interface Props {
  title: string;
  side?: 'left' | 'right';
  // Remembers, per browser, whether the drawer was left open.
  storageKey: string;
  defaultOpen?: boolean;
  // Shown on the tab while the drawer is closed, e.g. a count of new entries.
  badge?: number;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export const DRAWER_WIDTH = 'min(22rem, 92vw)';

export default function SideDrawer({ title, side = 'right', storageKey, defaultOpen = true, badge, onOpenChange, children }: Props) {
  const [open, setOpen] = useState(() => readOpen(storageKey, defaultOpen));

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      // Not remembering is fine.
    }
    onOpenChange?.(open);
  }, [open]);

  const left = side === 'left';
  // Arrows point the way the drawer will move.
  const arrow = open === left ? '‹' : '›';

  return (
    <aside
      aria-label={title}
      style={{
        position: 'absolute',
        top: TOPBAR_HEIGHT,
        [side]: 0,
        bottom: 0,
        width: DRAWER_WIDTH,
        zIndex: 20,
        transform: open ? 'none' : `translateX(${left ? `calc(-1 * ${DRAWER_WIDTH})` : DRAWER_WIDTH})`,
        transition: 'transform 0.2s ease',
      }}
    >
      <button
        aria-expanded={open}
        aria-label={open ? `Hide ${title}` : `Show ${title}`}
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'absolute',
          top: '1rem',
          ...(left
            ? { left: '100%', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }
            : { right: '100%', borderTopRightRadius: 0, borderBottomRightRadius: 0 }),
          padding: '0.5rem 0.4rem',
          writingMode: 'vertical-rl',
          whiteSpace: 'nowrap',
        }}
      >
        {arrow} {title}{!open && badge ? ` (${badge})` : ''}
      </button>
      <div
        style={{
          height: '100%',
          overflowY: 'auto',
          padding: '0.75rem',
          boxSizing: 'border-box',
          background: 'var(--sheet-color, #333)',
          [left ? 'borderRight' : 'borderLeft']: '1px solid var(--tab-border-color, #4f4f4f)',
          boxShadow: open ? `${left ? '' : '-'}0.25rem 0 0.75rem rgb(0 0 0 / 25%)` : 'none',
        }}
      >
        {children}
      </div>
    </aside>
  );
}
