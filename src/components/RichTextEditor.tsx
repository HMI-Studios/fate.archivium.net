import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Extensions } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
// Archivium's own editor extensions and document format, from the pinned `archivium`
// dependency. This module is loaded on demand, through RichText.tsx.
import { editorExtensions, shorthandResolver, type TiptapContext } from 'archivium/src/lib/editor';
import { indexedToJson, jsonToIndexed } from 'archivium/src/lib/tiptapHelpers';
import { ARCHIVIUM_URL } from '../App';
import { asBody, sameBody, type Body } from '../fate/body';
import { PlainPreview, RICH_TEXT_CSS } from './RichText';

// A text box for rich text, without a toolbar: formatting comes from the usual
// shortcuts (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+8 for a list...), typing shorthands
// (**bold**, *italic*, "- " for a list, "> " for a quote...), a small menu over
// selected text, and "@" to link one of the campaign's items.

// Short fields leave out what only makes sense in a whole article.
const ARTICLE_ONLY = new Set(['aside', 'heading', 'image', 'iframe', 'toc']);


// The campaign's items, for "@" links and to tell links to missing items apart.
// Fetched once per campaign for all the fields on a page.
const campaignItems: { [campaign: string]: Promise<Record<string, { title: string }>> } = {};
function loadItems(campaign: string) {
  campaignItems[campaign] ??= fetch(`${ARCHIVIUM_URL}/api/universes/${campaign}/items`, { credentials: 'include' })
    .then(response => response.ok ? response.json() : [])
    .then((list: { shortname: string, title: string }[]) => Object.fromEntries(list.map(item => [item.shortname, { title: item.title }])))
    .catch(() => ({}));
  return campaignItems[campaign];
}

export type LiveDoc = {
  ydoc: Y.Doc,
  provider: HocuspocusProvider,
  // The item as the API returns it, for filling in a document nobody has opened yet.
  loadItem: () => Promise<Record<string, unknown>>,
  // Who's editing, shown by their cursor and in Archivium's list of who's there.
  user?: Record<string, unknown>,
};

export interface RichTextEditorProps {
  id?: string;
  ariaLabel: string;
  placeholder?: string;
  campaign: string;
  // The text to show. Without `live`, a change from outside (not from this editor)
  // replaces what's in the editor.
  value: Body;
  // `remote` is set for changes that came in from someone else editing the live document.
  onChange?: (body: Body, remote: boolean) => void;
  readOnly?: boolean;
  // Whole articles (like an item's body) keep everything Archivium's editor can make.
  article?: boolean;
  // Edit an Archivium item's live document (as its own editor does) instead of `value`.
  live?: LiveDoc;
}

export default function RichTextEditor(props: RichTextEditorProps) {
  const [items, setItems] = useState<Record<string, { title: string }> | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadItems(props.campaign).then(loaded => { if (!cancelled) setItems(loaded); });
    return () => { cancelled = true; };
  }, [props.campaign]);

  // Links only render right once it's known which items exist.
  if (!items) return <PlainPreview {...props} />;
  return <LoadedEditor {...props} items={items} />;
}

function LoadedEditor({ id, ariaLabel, placeholder, campaign, value, onChange, readOnly, article, live, items }: RichTextEditorProps & {
  items: Record<string, { title: string }>,
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // What this editor last reported, to tell its own changes from outside ones.
  const emitted = useRef<Body>(value);

  const [context] = useState<TiptapContext>(() => ({
    currentUniverse: campaign,
    universeLink: universe => `${ARCHIVIUM_URL}/universes/${universe}`,
    // Links to other campaigns' items aren't checked.
    itemExists: (universe, item) => universe !== campaign || item in items,
    headings: [],
    items: () => items,
  }));
  const [extensions] = useState<Extensions>(() => {
    const all = editorExtensions(true, context, live && { ydoc: live.ydoc, field: 'main', provider: live.provider });
    return [
      ...(article ? all : all.filter(extension => !ARTICLE_ONLY.has((extension as { name?: string }).name ?? ''))),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ];
  });

  const editor = useEditor({
    extensions,
    editable: !readOnly,
    content: live ? undefined : indexedToJson(value),
    editorProps: { attributes: { 'aria-label': ariaLabel, ...(id ? { id } : {}) } },
    onUpdate: ({ editor, transaction }) => {
      const body = jsonToIndexed(editor.getJSON()) as Body;
      emitted.current = body;
      // Changes the live document brings in are marked by its sync (as are this
      // editor's own undos, which are told apart).
      const sync = transaction.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean, isUndoRedoOperation?: boolean } | undefined;
      const remote = Boolean(sync?.isChangeOrigin && !sync.isUndoRedoOperation);
      // Archivium's item editor saves the item from the document's copy of its data,
      // so that copy has to keep up with the text (as it does in Archivium's editor).
      const yObjData = live?.ydoc.getMap('obj_data');
      if (yObjData && !remote && yObjData.size > 0) yObjData.set('body', body);
      onChangeRef.current?.(body, remote);
    },
  });

  // Whoever opens a live document first fills it in from the saved item, exactly as
  // Archivium's item editor (editor/src/pages/ItemEdit.tsx) does: its editor reads the
  // item and its data from the document rather than loading them itself, so they
  // must be there, not just the text.
  useEffect(() => {
    if (!live || !editor) return;
    const { ydoc, loadItem } = live;
    const config = ydoc.getMap('config');
    if (config.get('initialContentLoading')) return;
    config.set('initialContentLoading', true);
    loadItem().then(item => {
      if (config.get('initialContentLoaded') || editor.isDestroyed) return;
      const objData = (typeof item.obj_data === 'string' ? JSON.parse(item.obj_data) : item.obj_data ?? {}) as Record<string, unknown>;
      ydoc.transact(() => {
        config.set('itemExistsCache', { [campaign]: Object.fromEntries(Object.keys(items).map(item => [item, true])) });
        config.set('initialContentLoaded', true);
        const yItem = ydoc.getMap('item');
        for (const [key, value] of Object.entries({ ...item, obj_data: objData })) yItem.set(key, value);
        const yObjData = ydoc.getMap('obj_data');
        for (const [key, value] of Object.entries(objData)) yObjData.set(key, value);
      });
      const body = asBody(objData.body);
      if (body) editor.commands.setContent(indexedToJson(body));
    }).catch(() => {
      // Let someone else fill it in.
      config.set('initialContentLoading', false);
    });
  }, [live, editor]);

  // Shows changes made elsewhere (e.g. the sheet reloaded after a save).
  useEffect(() => {
    if (live || !editor) return;
    if (sameBody(value, emitted.current)) return;
    emitted.current = value;
    editor.commands.setContent(indexedToJson(value), { emitUpdate: false });
  }, [value, live, editor]);

  useEffect(() => { editor?.setEditable(!readOnly); }, [editor, readOnly]);

  // After the editor's cursor extension has announced its own default.
  useEffect(() => {
    if (live?.user && editor) live.provider.setAwarenessField('user', live.user);
  }, [live, editor]);

  return <div className='fate-rich'>
    <style>{RICH_TEXT_CSS}</style>
    {editor && !readOnly && <SelectionMenu editor={editor} context={context} />}
    <EditorContent editor={editor} />
  </div>;
}

// Formatting for selected text, mostly for touch screens (no shortcuts there).
function SelectionMenu({ editor, context }: { editor: Editor, context: TiptapContext }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      strike: editor.isActive('strike'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      link: selectedLink(editor, context),
    }),
  });
  const button = (icon: string, title: string, active: boolean, run: () => void) => <button
    type='button'
    className={`material-symbols-outlined${active ? ' is-active' : ''}`}
    title={title}
    aria-label={title}
    aria-pressed={active}
    onMouseDown={e => e.preventDefault()}
    onClick={run}
  >{icon}</button>;
  return <BubbleMenu editor={editor} className='fate-rich-menu'>
    {button('format_bold', 'Bold (Ctrl+B)', state.bold, () => editor.chain().focus().toggleBold().run())}
    {button('format_italic', 'Italic (Ctrl+I)', state.italic, () => editor.chain().focus().toggleItalic().run())}
    {button('strikethrough_s', 'Strikethrough (Ctrl+Shift+S)', state.strike, () => editor.chain().focus().toggleStrike().run())}
    {button('format_list_bulleted', 'Bullet list (Ctrl+Shift+8)', state.bulletList, () => editor.chain().focus().toggleBulletList().run())}
    {button('format_list_numbered', 'Numbered list (Ctrl+Shift+7)', state.orderedList, () => editor.chain().focus().toggleOrderedList().run())}
    {state.link && button('open_in_new', 'Open link', false, () => window.open(state.link!, '_blank', 'noopener'))}
  </BubbleMenu>;
}

// Where the selected text links to, when it's all (part of) one link. Only web links
// are opened.
function selectedLink(editor: Editor, context: TiptapContext): string | null {
  const { state } = editor;
  const { from, to } = state.selection;
  const hrefs = new Set<unknown>();
  state.doc.nodesBetween(from, to, node => {
    if (!node.isText) return;
    hrefs.add(node.marks.find(mark => mark.type.name === 'link')?.attrs.href);
  });
  const [href] = hrefs;
  if (hrefs.size !== 1 || typeof href !== 'string' || !href) return null;
  try {
    const url = new URL(shorthandResolver(href, context).href, location.href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
