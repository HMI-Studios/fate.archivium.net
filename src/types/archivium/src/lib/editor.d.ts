import type { Extensions } from '@tiptap/core';

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

export function editorExtensions(editMode: boolean, context?: TiptapContext): Extensions;
