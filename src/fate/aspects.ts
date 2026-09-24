// Aspects in play during a scene. They live in the scene's live doc (and are saved
// to the scene item as obj_data.sceneAspects), except that a temporary character
// aspect can be moved onto the character's sheet to outlast the scene.

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

// A temporary aspect as stored on a character sheet (Fate Core layout path `temporaryAspects`).
export type SheetAspect = {
  name?: string;
  note?: string;
};

export const TEMPORARY_ASPECTS_KEY = 'temporaryAspects';

export const ASPECT_KINDS: { kind: AspectKind, label: string, defaultInvokes: number, hint: string }[] = [
  { kind: 'situation', label: 'Situation', defaultInvokes: 0, hint: 'Part of the scene, gone when it ends' },
  { kind: 'advantage', label: 'Advantage', defaultInvokes: 1, hint: 'Created with Create an Advantage' },
  { kind: 'boost', label: 'Boost', defaultInvokes: 1, hint: 'Vanishes once invoked' },
  { kind: 'temporary', label: 'Temporary', defaultInvokes: 0, hint: 'Can be kept on the character when the scene ends' },
];

export const aspectKind = (kind: AspectKind) => ASPECT_KINDS.find(k => k.kind === kind)!;

export function sheetNote(aspect: SceneAspect): string {
  return aspect.freeInvokes > 0 ? `${aspect.freeInvokes} free invoke${aspect.freeInvokes === 1 ? '' : 's'}` : '';
}
