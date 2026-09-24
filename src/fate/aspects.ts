// Aspects in play during a scene. Most live in the scene's live doc (and are saved
// to the scene item as obj_data.sceneAspects). Temporary character aspects live on
// the character's sheet instead, so they outlast the scene; the scene panel shows
// and edits them alongside the rest.

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

export const ASPECT_KINDS: { kind: AspectKind, label: string, defaultInvokes: number, hint: string }[] = [
  { kind: 'situation', label: 'Situation', defaultInvokes: 0, hint: 'Part of the scene, gone when it ends' },
  { kind: 'advantage', label: 'Advantage', defaultInvokes: 1, hint: 'Created with Create an Advantage' },
  { kind: 'boost', label: 'Boost', defaultInvokes: 1, hint: 'Vanishes once invoked' },
  { kind: 'temporary', label: 'Temporary', defaultInvokes: 0, hint: 'Kept on the character’s sheet, so it outlasts the scene' },
];

export const aspectKind = (kind: AspectKind) => ASPECT_KINDS.find(k => k.kind === kind)!;
