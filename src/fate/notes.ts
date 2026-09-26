import { ARCHIVIUM_URL } from '../App';
import { asBody, type Body } from './body';

// Personal notes on a character, NPC or monster are the user's own private Archivium
// note linked to its item: nobody else can see a private note, the GM included, and it
// also shows in the user's notes on Archivium (and on the item's Notes tab, to them).
// A user's first private note on the item is theirs here; one is made on first write.

export type NoteUser = { id: number, username: string };

// [itemTitle, itemShortname, universeTitle, universeShortname]; Archivium only reads
// the shortnames.
type NoteItem = [string, string, string, string];

type ApiNote = {
  uuid: string,
  title: string,
  body: unknown,
  is_public: boolean | number,
  author_id: number,
  created_at: string,
  items?: (NoteItem | null)[] | null,
};

export type PersonalNote = {
  uuid: string | null,
  title: string,
  // Rich text, edited with Archivium's own editor.
  body: Body | null,
  items: NoteItem[],
};

const itemNotesUrl = (campaign: string, item: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}/items/${item}/notes`;

// Archivium's note editor, whose back link returns here.
export const noteUrl = (uuid: string) => `${ARCHIVIUM_URL}/notes/${uuid}?${new URLSearchParams({ returnTo: window.location.href })}`;

export async function loadPersonalNote(campaign: string, item: string, itemTitle: string, user: NoteUser): Promise<PersonalNote> {
  const response = await fetch(itemNotesUrl(campaign, item), { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not load your notes (${response.status}).`);
  const data = await response.json();
  // Archivium wraps the list in another array.
  const notes: ApiNote[] = Array.isArray(data?.[0]) ? data[0] : Array.isArray(data) ? data : [];
  const mine = notes
    .filter(note => note.author_id === user.id && !note.is_public)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  if (!mine) {
    return { uuid: null, title: `Notes on ${itemTitle}`.slice(0, 64), body: null, items: [[itemTitle, item, '', campaign]] };
  }

  // The list only has the start of each note's text.
  const full = await fetch(`${itemNotesUrl(campaign, item)}/${mine.uuid}`, { credentials: 'include' });
  if (!full.ok) throw new Error(`Could not load your notes (${full.status}).`);
  const note: ApiNote = await full.json();
  return {
    uuid: note.uuid,
    title: note.title ?? '',
    body: asBody(note.body),
    items: (note.items ?? []).filter((entry): entry is NoteItem => Array.isArray(entry)),
  };
}

// Whether a body has nothing in it worth keeping (no text, images or the like).
export function isEmptyBody(body: Body | null): boolean {
  return !body || (!body.text.trim() && body.structure.every(node => node.type === 'paragraph'));
}

// Saves the note's body, making the note if it's new. Returns the note as saved.
export async function savePersonalNote(campaign: string, item: string, user: NoteUser, note: PersonalNote, next: Body | null): Promise<PersonalNote> {
  const body = isEmptyBody(next) ? null : next;
  if (!note.uuid) {
    const response = await fetch(itemNotesUrl(campaign, item), {
      method: 'POST',
      credentials: 'include',
      // So a save started as the page closes still goes through.
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: note.title, is_public: false, body }),
    });
    if (!response.ok) throw new Error(`Could not save your notes (${response.status}).`);
    return { ...note, uuid: await response.json(), body };
  }
  // Archivium relinks the note to exactly the items sent, so the note's other links
  // (made in Archivium) are sent back too.
  const response = await fetch(`${ARCHIVIUM_URL}/api/users/${user.username}/notes/${note.uuid}`, {
    method: 'PUT',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: note.title, is_public: false, body, items: note.items }),
  });
  if (!response.ok) throw new Error(`Could not save your notes (${response.status}).`);
  return { ...note, body };
}
