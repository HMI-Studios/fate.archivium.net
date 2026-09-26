import type { TabLayout } from '../layout/core';
import { FATE_CORE_LAYOUT } from './coreLayout';

// Aspects in play during a scene. Most live in the scene's live doc, saved to the
// scene's sheet (obj_data.fateScene.aspects) so they can be prepared and read in
// Archivium. Temporary character aspects live on the character's sheet instead, so
// they outlast the scene; the scene panel shows and edits them alongside the rest.

export type AspectKind = 'situation' | 'advantage' | 'boost' | 'temporary' | 'consequence' | 'character';

export type SceneAspect = {
  id: string;
  name: string;
  kind: AspectKind;
  freeInvokes: number;
  // The character (item shortname) it's attached to, or null for the scene itself.
  target: string | null;
  // The character's title when the aspect was attached, for when its token is gone.
  targetTitle?: string;
  // Free text from the scene sheet, kept as-is.
  note?: string;
};

// A temporary aspect as stored on a character sheet (Fate Core layout path
// `temporaryAspects`). Sheet list fields are text, so invokes are a numeric string.
export type SheetAspect = {
  name?: string;
  invokes?: string;
  note?: string;
};

export function sheetInvokes(aspect: SheetAspect): number {
  return Math.max(0, parseInt(aspect.invokes ?? '', 10) || 0);
}

export function toSheetAspect(aspect: Pick<SceneAspect, 'name' | 'freeInvokes'>, note = ''): SheetAspect {
  return { name: aspect.name, invokes: aspect.freeInvokes > 0 ? String(aspect.freeInvokes) : '', note };
}

// Ids of sheet aspects shown in the scene panel: `sheet:<character>:<index>`.
export const sheetAspectId = (shortname: string, index: number) => `sheet:${shortname}:${index}`;

export function parseSheetAspectId(id: string): { shortname: string, index: number } | null {
  const match = /^sheet:(.+):(\d+)$/.exec(id);
  return match ? { shortname: match[1], index: Number(match[2]) } : null;
}

export const TEMPORARY_ASPECTS_KEY = 'temporaryAspects';

// Consequences are aspects too, shown and invoked alongside the rest. Their text lives
// in the sheet's consequence slots; their free invokes are kept beside them under a
// sheet key the layout doesn't show (a monster token keeps its own copy, see
// fate/tokenState.ts), keyed by slot path and remembering the text they were for, so a
// new consequence in the slot starts afresh. A consequence nobody has touched yet has
// the one free invoke taking it gives.
export const CONSEQUENCE_INVOKES_KEY = 'consequenceInvokes';

export type ConsequenceInvokes = { [slotPath: string]: { text: string, invokes: number } };

export function consequenceInvokes(sheet: Record<string, unknown> | undefined, path: string, text: string): number {
  const stored = (sheet?.[CONSEQUENCE_INVOKES_KEY] as ConsequenceInvokes | undefined)?.[path];
  return stored && stored.text === text ? Math.max(0, stored.invokes) : 1;
}

export function withConsequenceInvokes(current: unknown, path: string, text: string, invokes: number): ConsequenceInvokes {
  const stored = current && typeof current === 'object' ? current as ConsequenceInvokes : {};
  return { ...stored, [path]: { text, invokes: Math.max(0, invokes) } };
}

// Ids of consequences shown in the scene panel: `consequence:<actor key>:<slot path>`.
export const consequenceId = (actorKey: string, path: string) => `consequence:${actorKey}:${path}`;

export function parseConsequenceId(id: string): { actorKey: string, path: string } | null {
  const match = /^consequence:(.+):([^:]+)$/.exec(id);
  return match ? { actorKey: match[1], path: match[2] } : null;
}

// A scene aspect as stored on the scene sheet (Fate scene layout path `aspects`). The
// sheet only shows name, invokes and note; the rest ride along for the game room.
export type SceneSheetAspect = SheetAspect & {
  id?: string;
  kind?: string;
  target?: string | null;
  targetTitle?: string;
};

export const SCENE_ASPECTS_KEY = 'aspects';

// (Consequences come from character sheets, never the scene's.)
const isKind = (kind: unknown): kind is AspectKind => ADDABLE_ASPECT_KINDS.some(k => k.kind === kind);

// Entries written in Archivium have no kind or id: they're situation aspects on the
// scene, with ids from their position so clients loading them at once agree.
export function fromSceneSheet(entries: unknown): SceneAspect[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry): entry is SceneSheetAspect => Boolean(entry && typeof entry === 'object' && entry.name))
    .map((entry, i) => ({
      id: entry.id || `prep-${i}`,
      name: entry.name!,
      kind: isKind(entry.kind) ? entry.kind : 'situation',
      freeInvokes: sheetInvokes(entry),
      target: entry.target || null,
      ...(entry.targetTitle ? { targetTitle: entry.targetTitle } : {}),
      ...(entry.note ? { note: entry.note } : {}),
    }));
}

export function toSceneSheet(aspects: SceneAspect[]): SceneSheetAspect[] {
  return aspects.map(aspect => ({
    ...toSheetAspect(aspect, aspect.note ?? ''),
    id: aspect.id,
    kind: aspect.kind,
    target: aspect.target,
    ...(aspect.targetTitle ? { targetTitle: aspect.targetTitle } : {}),
  }));
}

export const ASPECT_KINDS: { kind: AspectKind, label: string, defaultInvokes: number, hint: string }[] = [
  { kind: 'situation', label: 'Situation', defaultInvokes: 0, hint: 'Part of the scene, gone when it ends' },
  { kind: 'advantage', label: 'Advantage', defaultInvokes: 1, hint: 'Created with Create an Advantage' },
  { kind: 'boost', label: 'Boost', defaultInvokes: 1, hint: 'Vanishes once invoked' },
  { kind: 'temporary', label: 'Temporary', defaultInvokes: 0, hint: 'Kept on the character’s sheet, so it outlasts the scene' },
  // Not added from the panel: consequences are taken on the sheet or a combat card,
  // and character aspects are written on the sheet.
  { kind: 'consequence', label: 'Consequence', defaultInvokes: 1, hint: 'Taken to absorb a hit; whoever inflicted it gets a free invoke' },
  { kind: 'character', label: 'Character', defaultInvokes: 0, hint: 'From the character sheet; invoking it costs a fate point' },
];

// The kinds the panel can add.
export const ADDABLE_ASPECT_KINDS = ASPECT_KINDS.filter(k => k.kind !== 'consequence' && k.kind !== 'character');

// A character's own aspects, from the Fate Core sheet: high concept, trouble, and the
// rest. High Concept and Trouble are each a one-entry entryList (path 'highConcept' /
// 'trouble'), same shape as 'aspects', so all of them render identically; the app hides
// their add/remove controls so they always hold exactly one row.
const MAIN_ASPECT_KEYS: { key: string, label: string }[] = [
  { key: 'highConcept', label: 'High Concept' },
  { key: 'trouble', label: 'Trouble' },
];
export const MAIN_ASPECTS_KEY = 'aspects';

// An entry's name, whether it's still the old plain string or a migrated {name, note} row.
function aspectName(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') return (entry as { name: string }).name;
  return '';
}

function firstEntry(sheet: Record<string, unknown>, key: string): unknown {
  const value = sheet[key];
  return Array.isArray(value) ? value[0] : undefined;
}

export function mainAspects(sheet: Record<string, unknown> | undefined): { path: string, label: string, text: string }[] {
  if (!sheet) return [];
  const others = Array.isArray(sheet[MAIN_ASPECTS_KEY]) ? sheet[MAIN_ASPECTS_KEY] as unknown[] : [];
  return [
    ...MAIN_ASPECT_KEYS.map(({ key, label }) => ({ path: `${key}.0`, label, text: aspectName(firstEntry(sheet, key)) })),
    ...others.map((entry, i) => ({ path: `${MAIN_ASPECTS_KEY}.${i}`, label: 'Aspect', text: aspectName(entry) })),
  ].filter(aspect => aspect.text.trim());
}

type AspectRow = { name: string, note: string };

function toRow(entry: unknown): AspectRow {
  if (entry && typeof entry === 'object') {
    const { name, note } = entry as { name?: unknown, note?: unknown };
    if (typeof name === 'string' && typeof note === 'string') return entry as AspectRow;
    return { ...entry as object, name: typeof name === 'string' ? name : '', note: typeof note === 'string' ? note : '' };
  }
  return { name: typeof entry === 'string' ? entry : '', note: '' };
}

// Puts a sheet's own aspects in the shape a layout's fields expect. Sheets from before
// backstory notes keep High Concept and Trouble as strings (with a sibling '<key>Note'
// from an interim version) and the other aspects as a list of strings; since then they
// are all lists of {name, note} rows, High Concept and Trouble holding exactly one.
// A campaign's stored layout may be either version (campaigns keep their own copy until
// they're upgraded, see fate/schema.ts), so pages read sheets through this, and nothing
// shows up empty. Going back to the old shape drops the notes from what's shown.
export function aspectsForLayout(sheet: Record<string, unknown>, layout: TabLayout): Record<string, unknown> {
  const fields = layout.rows.flatMap(row => row.sections.flatMap(section => section.fields));
  const next = { ...sheet };
  let changed = false;
  const set = (key: string, value: unknown) => {
    if (JSON.stringify(next[key]) === JSON.stringify(value)) return;
    next[key] = value;
    changed = true;
  };

  for (const key of [...MAIN_ASPECT_KEYS.map(k => k.key), MAIN_ASPECTS_KEY]) {
    const field = fields.find(f => 'path' in f && f.path === key);
    if (!field) continue;
    const single = key !== MAIN_ASPECTS_KEY;
    const value = next[key];
    const list = Array.isArray(value) ? value : value === undefined ? [] : [value];

    if (field.widget === 'entryList') {
      const rows = list.map(toRow);
      const noteKey = `${key}Note`;
      if (single && typeof next[noteKey] === 'string') {
        if (rows.length === 0) rows.push({ name: '', note: '' });
        if (!rows[0].note) rows[0] = { ...rows[0], note: next[noteKey] as string };
        delete next[noteKey];
        changed = true;
      }
      // High Concept and Trouble always have their one row to edit.
      if (single && rows.length === 0) rows.push({ name: '', note: '' });
      set(key, rows);
    } else if (field.widget === 'text') {
      set(key, aspectName(list[0]));
    } else if (field.widget === 'textList') {
      set(key, list.map(aspectName));
    }
  }

  return changed ? next : sheet;
}

// A sheet in the current built-in layout's shape (see aspectsForLayout).
export const migratedAspects = (sheet: Record<string, unknown>) => aspectsForLayout(sheet, FATE_CORE_LAYOUT);

// Ids of character aspects shown in the scene panel: `main:<actor key>:<sheet path>`.
export const mainAspectId = (actorKey: string, path: string) => `main:${actorKey}:${path}`;

export const aspectKind = (kind: AspectKind) => ASPECT_KINDS.find(k => k.kind === kind)!;
