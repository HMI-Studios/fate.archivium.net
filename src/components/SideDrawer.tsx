import { useEffect, useState, type ReactNode } from 'react';

// A panel docked to the right edge of the window that slides open and closed, with a
// tab to toggle it that stays visible while it's closed (like D&D Beyond's game log).

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
  // Remembers, per browser, whether the drawer was left open.
  storageKey: string;
  defaultOpen?: boolean;
  // Shown on the tab while the drawer is closed, e.g. a count of new entries.
  badge?: number;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

const WIDTH = 'min(22rem, 92vw)';

export default function SideDrawer({ title, storageKey, defaultOpen = true, badge, onOpenChange, children }: Props) {
  const [open, setOpen] = useState(() => readOpen(storageKey, defaultOpen));

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, open ? '1' : '0');
    } catch {
      // Not remembering is fine.
    }
    onOpenChange?.(open);
  }, [open]);

  return (<>
    {/* On wide screens, make room for the open drawer instead of covering the page. */}
    {open && <style>{`@media (min-width: 60rem) { body { padding-right: ${WIDTH}; } }`}</style>}
    <aside
      aria-label={title}
      style={{
        position: 'fixed',
        top: 'calc(var(--navbar-height, 3.2rem) + 2 * var(--navbar-margin, 0.5rem))',
        right: 0,
        bottom: 0,
        width: WIDTH,
        zIndex: 20,
        transform: open ? 'none' : `translateX(${WIDTH})`,
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
          right: '100%',
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
          padding: '0.5rem 0.4rem',
          writingMode: 'vertical-rl',
          whiteSpace: 'nowrap',
        }}
      >
        {open ? '›' : '‹'} {title}{!open && badge ? ` (${badge})` : ''}
      </button>
      <div
        style={{
          height: '100%',
          overflowY: 'auto',
          padding: '0.75rem',
          boxSizing: 'border-box',
          background: 'var(--sheet-color, #333)',
          borderLeft: '1px solid var(--tab-border-color, #4f4f4f)',
          boxShadow: open ? '-0.25rem 0 0.75rem rgb(0 0 0 / 25%)' : 'none',
        }}
      >
        {children}
      </div>
    </aside>
  </>);
}
