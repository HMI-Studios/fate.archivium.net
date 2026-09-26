import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Extendable, Extensions } from '@tiptap/core';
import type * as Y from 'yjs';
// The editor's commands (toggleBold and so on) are declared by the extensions it uses.
import type {} from '@tiptap/starter-kit';

export interface TiptapContext {
  currentUniverse: string | null;
  universeLink: (universe: string) => string;
  itemExists: (universe: string, item: string) => boolean;
  resolveItemExists?: (shorthand: string) => Promise<void>;
  headings: { title: string, level: number }[];
  items?: () => Record<string, { title: string, tags?: string[] }>;
}

export type LinkData = {
  universe?: string,
  item?: string,
  hash?: string,
  query?: string,
};

export function extractLinkData(href: string): LinkData;

export function editorExtensions(
  editMode: boolean,
  context?: TiptapContext,
  collabOptions?: { ydoc: Y.Doc, field?: string, provider: HocuspocusProvider },
  imageExtension?: Extendable,
): Extensions;

// An href as the editor stores it (like "@item" for one of the universe's items) as a URL.
export function shorthandResolver(href: string, ctx: TiptapContext | undefined): { href: string, exists?: boolean };
