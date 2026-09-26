import { asBody, bodyFromText, isPlainBody, plainTextOf, type Body } from './body';

// Rich text in sheet fields that Archivium only knows as plain text (like aspect
// backstories): the field keeps its plain text, which is what Archivium shows and
// edits, and a rich copy sits beside it under `<key>Rich`. The copy only counts while
// its plain text still matches the field's, so if someone edits the text in Archivium
// their text wins and the formatting is dropped. Fields without formatting have no copy.

export const richKey = (key: string) => `${key}Rich`;

type Entry = Record<string, unknown>;

// What the field's editor shows.
export function richTextOf(entry: Entry, key: string): Body {
  const plain = typeof entry[key] === 'string' ? entry[key] as string : '';
  const rich = asBody(entry[richKey(key)]);
  return rich && plainTextOf(rich) === plain ? rich : bodyFromText(plain);
}

// The entry with the field set from its editor.
export function withRichText<T extends Entry>(entry: T, key: string, body: Body): T {
  const { [richKey(key)]: _old, ...rest } = entry;
  return { ...rest, [key]: plainTextOf(body), ...(isPlainBody(body) ? {} : { [richKey(key)]: body }) } as T;
}
