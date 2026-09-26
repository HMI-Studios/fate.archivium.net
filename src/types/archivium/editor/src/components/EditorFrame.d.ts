import type { Editor } from '@tiptap/react';
import type { JSX } from 'react';

export type LinkType = 'link' | 'image' | 'videoembed';

export default function EditorFrame(props: {
  id: string,
  editor: Editor,
  getLink: (url: string, type: LinkType) => Promise<[string | null, { [attr: string]: any }?]>,
  itemTitles?: Record<string, string>,
  itemGroups?: Record<string, string>,
  gallery?: { id: number, name: string, label: string }[],
}): JSX.Element;
