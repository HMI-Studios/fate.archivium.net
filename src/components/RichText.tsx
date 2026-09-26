import { lazy, Suspense } from 'react';
import type { Body } from '../fate/body';
import type { RichTextEditorProps } from './RichTextEditor';

// Rich text fields (see RichTextEditor.tsx). Archivium's editor is big, so it's loaded
// on demand; until it's there, the text shows as it will look, in the same box.
const RichTextEditor = lazy(() => import('./RichTextEditor'));

export type { LiveDoc, RichTextEditorProps } from './RichTextEditor';

export default function RichText(props: RichTextEditorProps) {
  return <Suspense fallback={<PlainPreview value={props.value} placeholder={props.placeholder} />}>
    <RichTextEditor {...props} />
  </Suspense>;
}

export const RICH_TEXT_CSS = `
.fate-rich .tiptap {
  min-height: 3rem;
  padding: 0.5rem;
  color: var(--text-color);
  background-color: var(--sheet-color);
  border: 1px solid var(--input-border-color);
  border-radius: 0.25rem;
  white-space: pre-wrap;
}
.fate-rich .tiptap:focus { outline: 1px solid var(--input-border-color); }
.fate-rich .tiptap > :first-child { margin-top: 0; }
.fate-rich .tiptap > :last-child { margin-bottom: 0; }
.fate-rich .tiptap p { margin: 0; }
.fate-rich .tiptap ul, .fate-rich .tiptap ol { margin: 0.25rem 0; padding-left: 1.5rem; }
.fate-rich .tiptap blockquote { margin: 0.25rem 0; padding-left: 0.75rem; border-left: 3px solid var(--input-border-color); }
.fate-rich .tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--light-text-color);
  float: left;
  height: 0;
  pointer-events: none;
}
.fate-rich-menu {
  display: flex;
  gap: 0.125rem;
  padding: 0.125rem;
  background: var(--menu-color);
  border: 1px solid var(--menu-border-color, #6e6e6e);
  border-radius: 0.25rem;
  box-shadow: 0 0.25rem 0.75rem rgb(0 0 0 / 25%);
}
.fate-rich-menu button { border: 0; padding: 0.125rem 0.25rem; font-size: 1.25rem; background: none; cursor: pointer; }
.fate-rich-menu button.is-active { background-color: #ddd; color: #222; }
`;

// Stands in (looking the same) while the editor loads.
export function PlainPreview({ value, placeholder }: { value: Body, placeholder?: string }) {
  const text = value.text.trim();
  return <div className='fate-rich'>
    <style>{RICH_TEXT_CSS}</style>
    <div className='tiptap' style={{ opacity: 0.8 }}>
      {text ? value.text.replace(/\n$/, '') : <span style={{ color: 'var(--light-text-color)' }}>{placeholder}</span>}
    </div>
  </div>;
}

