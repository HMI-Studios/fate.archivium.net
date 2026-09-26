import { useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
// Archivium's own rich-text editor (its extensions and toolbar), from the pinned
// `archivium` dependency. This module is loaded on demand, so the editor isn't in the
// main bundle.
import { editorExtensions, extractLinkData, type TiptapContext } from 'archivium/src/lib/editor';
import { indexedToJson, jsonToIndexed, type IndexedDocument } from 'archivium/src/lib/tiptapHelpers';
import EditorFrame from 'archivium/editor/src/components/EditorFrame';
import { ARCHIVIUM_URL } from '../App';

export type { IndexedDocument };

const universeLink = (universe: string) => `${ARCHIVIUM_URL}/universes/${universe}`;

interface Props {
  id: string;
  campaign: string;
  body: IndexedDocument | null;
  onChange: (body: IndexedDocument) => void;
}

// Which linked items exist, so links to missing ones show as such (like Archivium's).
// The campaign's own items are known from its item list; others are asked about.
async function fetchExists(query: Record<string, string[]>): Promise<Record<string, Record<string, boolean>>> {
  const response = await fetch(`${ARCHIVIUM_URL}/api/exists`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  return response.ok ? response.json() : {};
}

export default function RichNoteEditor(props: Props) {
  const { campaign, body } = props;
  // Items the editor can link to, keyed `universe/item` as Archivium's link picker expects.
  const [items, setItems] = useState<Record<string, string> | null>(null);
  const exists = useRef<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaign}/items`, { credentials: 'include' });
      const list: { shortname: string, title: string }[] = response.ok ? await response.json() : [];
      exists.current[campaign] = Object.fromEntries(list.map(item => [item.shortname, true]));
      // Links to other campaigns' items.
      const others: Record<string, string[]> = {};
      if (body) indexedToJson(body, href => {
        const link = extractLinkData(href);
        if (link.item && link.universe && link.universe !== campaign) (others[link.universe] ??= []).push(link.item);
      });
      if (Object.keys(others).length) Object.assign(exists.current, await fetchExists(others).catch(() => ({})));
      if (!cancelled) setItems(Object.fromEntries(list.map(item => [`${campaign}/${item.shortname}`, item.title])));
    })().catch(() => { if (!cancelled) setItems({}); });
    return () => { cancelled = true; };
  }, [campaign]);

  // Links only render right once it's known which items exist.
  if (!items) return <small style={{ color: 'var(--light-text-color)' }}>Loading...</small>;
  return <LoadedEditor {...props} items={items} exists={exists.current} />;
}

function LoadedEditor({ id, campaign, body, onChange, items, exists }: Props & {
  items: Record<string, string>,
  exists: Record<string, Record<string, boolean>>,
}) {
  const context: TiptapContext = useMemo(() => ({
    currentUniverse: campaign,
    universeLink,
    itemExists: (universe, item) => exists[universe]?.[item] ?? false,
    headings: [],
  }), [campaign]);

  const editor = useEditor({
    extensions: editorExtensions(true, context),
    content: body ? indexedToJson(body) : '',
    onUpdate: ({ editor }) => onChange(jsonToIndexed(editor.getJSON())),
  });

  const groups = useMemo(() => Object.fromEntries(Object.keys(items).map(key => [key, campaign])), [items, campaign]);

  return <EditorFrame
    id={id}
    editor={editor}
    getLink={async (url, type) => {
      const link = type === 'link' && url?.startsWith('@') ? extractLinkData(url) : null;
      const universe = link?.universe ?? campaign;
      if (link?.item && !(link.item in (exists[universe] ?? {}))) {
        const result = await fetchExists({ [universe]: [link.item] }).catch(() => ({}));
        exists[universe] = { ...exists[universe], [link.item]: Boolean(result[universe]?.[link.item]) };
      }
      return [url];
    }}
    itemTitles={items}
    itemGroups={groups}
  />;
}
