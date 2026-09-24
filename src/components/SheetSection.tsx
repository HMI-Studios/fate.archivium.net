import type { CSSProperties, ReactNode } from 'react';

// Shared styling for character-sheet-like pages, built on the Archivium
// stylesheet's theme variables so it follows light/dark mode.

export const fieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
};

// The Archivium stylesheet only styles textareas inside its editor, so match
// its input styling here.
export const textareaStyle: CSSProperties = {
  ...fieldStyle,
  minHeight: '5rem',
  padding: '0.5rem',
  resize: 'vertical',
  font: 'inherit',
  color: 'var(--text-color)',
  background: 'var(--sheet-color)',
  border: '1px solid var(--input-border-color)',
  borderRadius: '0.25rem',
};

// Lays its children out side by side, collapsing to a single column when
// there isn't room for two (no media queries needed).
export function SheetRow({ children }: { children: ReactNode }) {
  return <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))',
      gap: '0.75rem',
      alignItems: 'stretch',
    }}
  >
    {children}
  </div>;
}

export function SheetSection({ title, children, style }: { title: string, children: ReactNode, style?: CSSProperties }) {
  return <section
    style={{
      border: '1px solid var(--table-border-color)',
      borderRadius: '0.5rem',
      overflow: 'hidden',
      background: 'var(--sheet-color)',
      ...style,
    }}
  >
    <h2
      className='lora my-0 px-3 py-1'
      style={{
        background: 'var(--menu-color)',
        fontSize: '1rem',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}
    >
      {title}
    </h2>
    <div className='pa-3 d-flex flex-col gap-2'>
      {children}
    </div>
  </section>;
}

// A caption under a field, like the small print on a paper sheet.
export function FieldCaption({ htmlFor, children }: { htmlFor: string, children: ReactNode }) {
  return <label htmlFor={htmlFor} className='text-small' style={{ color: 'var(--light-text-color)' }}>
    {children}
  </label>;
}
