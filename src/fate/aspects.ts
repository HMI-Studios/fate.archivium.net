// Aspects in play during a scene. Most live in the scene's live doc, saved to the
// scene's sheet (obj_data.fateScene.aspects) so they can be prepared and read in
// Archivium. Temporary character aspects live on the character's sheet instead, so
// they outlast the scene; the scene panel shows and edits them alongside the rest.

export type AspectKind = 'situation' | 'advantage' | 'boost' | 'temporary';

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

// A scene aspect as stored on the scene sheet (Fate scene layout path `aspects`). The
// sheet only shows name, invokes and note; the rest ride along for the game room.
export type SceneSheetAspect = SheetAspect & {
  id?: string;
  kind?: string;
  target?: string | null;
  targetTitle?: string;
};

export const SCENE_ASPECTS_KEY = 'aspects';

const isKind = (kind: unknown): kind is AspectKind => ASPECT_KINDS.some(k => k.kind === kind);

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
];

export const aspectKind = (kind: AspectKind) => ASPECT_KINDS.find(k => k.kind === kind)!;
