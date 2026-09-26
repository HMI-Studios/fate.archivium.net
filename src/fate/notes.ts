import { ARCHIVIUM_URL } from '../App';
import { asBody, bodyFromText, isPlainBody, textFromBody } from './body';

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
  text: string,
  // False when the note has formatting (from Archivium's editor) that editing it here
  // as plain text would lose.
  plain: boolean,
  items: NoteItem[],
};

const itemNotesUrl = (campaign: string, item: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}/items/${item}/notes`;

export const noteUrl = (uuid: string) => `${ARCHIVIUM_URL}/notes/${uuid}`;
export const myNotesUrl = `${ARCHIVIUM_URL}/notes`;

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
    return { uuid: null, title: `Notes on ${itemTitle}`.slice(0, 64), text: '', plain: true, items: [[itemTitle, item, '', campaign]] };
  }

  // The list only has the start of each note's text.
  const full = await fetch(`${itemNotesUrl(campaign, item)}/${mine.uuid}`, { credentials: 'include' });
  if (!full.ok) throw new Error(`Could not load your notes (${full.status}).`);
  const note: ApiNote = await full.json();
  const body = asBody(note.body);
  return {
    uuid: note.uuid,
    title: note.title ?? '',
    text: body ? textFromBody(body) : '',
    plain: body ? isPlainBody(body) : true,
    items: (note.items ?? []).filter((entry): entry is NoteItem => Array.isArray(entry)),
  };
}

// Saves the note's text, making the note if it's new. Returns the note as saved.
export async function savePersonalNote(campaign: string, item: string, user: NoteUser, note: PersonalNote, text: string): Promise<PersonalNote> {
  const body = text.trim() ? bodyFromText(text) : null;
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
    return { ...note, uuid: await response.json(), text };
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
  return { ...note, text };
}
