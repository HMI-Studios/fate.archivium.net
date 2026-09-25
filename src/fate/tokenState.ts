// Monsters are the one kind of character whose tokens don't share a sheet: each monster
// token gets its own copy of the stats that change in play (stress, consequences and
// their free invokes, fate points), laid over the monster's sheet, which still supplies
// skills and everything else. The copies are scoped to the scene: they live in its live doc (the
// `tokenStates` map, saved to the scene item as obj_data.tokenStates so a reconnect
// doesn't lose them) and are dropped when the token is deleted or the scene ends.
//
// PCs and NPCs keep a single sheet shared by all their tokens.

export const MONSTER_TYPE = 'monster';

export const TOKEN_STATES_KEY = 'tokenStates';

// The sheet keys a monster token keeps its own copy of.
export const TOKEN_STATE_KEYS = ['stress', 'consequences', 'consequenceInvokes', 'fatePoints'] as const;

export type TokenState = Partial<Record<typeof TOKEN_STATE_KEYS[number], unknown>>;

// Who can be targeted and roll in a scene. PCs and NPCs are keyed by item shortname;
// monster tokens by token id, since each one is separate.
const TOKEN_ACTOR_PREFIX = 'token:';
export const tokenActorKey = (tokenId: string) => `${TOKEN_ACTOR_PREFIX}${tokenId}`;
export const tokenIdOfActor = (key: string | null | undefined) => key?.startsWith(TOKEN_ACTOR_PREFIX) ? key.slice(TOKEN_ACTOR_PREFIX.length) : null;

// A monster token's view of its sheet: the monster's sheet with the token's own copy of
// its changing stats laid over it. Until the token's stats change, it has the sheet's.
export function tokenSheet(sheet: Record<string, unknown> | undefined, state: TokenState | undefined): Record<string, unknown> {
  const view = { ...(sheet ?? {}) };
  for (const key of TOKEN_STATE_KEYS) {
    if (state?.[key] !== undefined) view[key] = state[key];
  }
  return view;
}
