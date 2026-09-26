import { ARCHIVIUM_URL } from '../App';
import { PERMS } from '../perms';

// Who can see a character, through Archivium's vaults (archivium src/api/models/vault.ts).
// An item in a vault can only be read by the vault's members, and by the universe's
// owner, instead of by everyone in the universe. This app keeps two kinds of vault:
//
// - `fate-gm`, the GMs' (everything only GMs may see);
// - `fate-player-<user id>`, one per player who has claimed a PC, holding that player
//   and the GMs (for PCs the player keeps to themselves).
//
// Co-GMs don't get into vaults by being universe admins, so every GM is made a member
// of each of these vaults (see syncVaults). They're owners there: only a vault's owners
// can add other owners.

export const GM_VAULT = 'fate-gm';
const PLAYER_VAULT_PREFIX = 'fate-player-';
export const playerVault = (userId: number) => `${PLAYER_VAULT_PREFIX}${userId}`;
const playerOfVault = (shortname: string): number | null => {
  if (!shortname.startsWith(PLAYER_VAULT_PREFIX)) return null;
  const id = Number(shortname.slice(PLAYER_VAULT_PREFIX.length));
  return Number.isInteger(id) ? id : null;
};

// Where a character's claim is kept (top level of its obj_data): the player who plays it.
export const CLAIM_KEY = 'claimedBy';
export type Claim = { id: number, username: string };

export function claimOf(objData: unknown): Claim | null {
  const claim = objData && typeof objData === 'object' ? (objData as Record<string, unknown>)[CLAIM_KEY] : null;
  if (!claim || typeof claim !== 'object') return null;
  const { id, username } = claim as Record<string, unknown>;
  return typeof id === 'number' && typeof username === 'string' ? { id, username } : null;
}

// Who can see an item: everyone in the campaign, the GMs only, a player (who claimed
// it) and the GMs, or the members of some other vault made in Archivium.
export type Visibility =
  | { kind: 'everyone' }
  | { kind: 'gms' }
  | { kind: 'player', userId: number }
  | { kind: 'other', vault: string };

export function visibilityOf(vaultShort: string | null | undefined): Visibility {
  if (!vaultShort) return { kind: 'everyone' };
  if (vaultShort === GM_VAULT) return { kind: 'gms' };
  const player = playerOfVault(vaultShort);
  return player !== null ? { kind: 'player', userId: player } : { kind: 'other', vault: vaultShort };
}

export type Vault = {
  shortname: string,
  title: string,
  authors: { [id: number]: string },
  author_permissions: { [id: number]: number },
  requester_permissions: number,
};

type Universe = {
  author_permissions: { [id: number]: number },
  authors: { [id: number]: string },
};

const universeUrl = (campaign: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}`;

async function send(url: string, method: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    credentials: 'include',
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `Archivium said no (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data === 'string') message = data;
      else if (data?.error) message = data.error;
    } catch {
      // Keep the status message.
    }
    throw new Error(message);
  }
}

// The vaults the signed-in user can see.
export async function fetchVaults(campaign: string): Promise<Vault[]> {
  const response = await fetch(`${universeUrl(campaign)}/vaults`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Couldn't load the campaign's vaults (${response.status}).`);
  return await response.json();
}

async function fetchUniverse(campaign: string): Promise<Universe> {
  const response = await fetch(universeUrl(campaign), { credentials: 'include' });
  if (!response.ok) throw new Error(`Couldn't load the campaign (${response.status}).`);
  return await response.json();
}

const vaultTitle = (shortname: string, universe: Universe): string => {
  if (shortname === GM_VAULT) return 'GMs only';
  const player = playerOfVault(shortname);
  return `${player !== null ? universe.authors[player] ?? 'A player' : 'Someone'} and the GMs`;
};

// Who should be in one of this app's vaults, at what level: the GMs as owners, and in a
// player's vault the player (while they're still a player here) with write access.
function wantedMembers(shortname: string, universe: Universe): Map<number, number> {
  const wanted = new Map<number, number>();
  for (const [id, level] of Object.entries(universe.author_permissions)) {
    if (level >= PERMS.ADMIN) wanted.set(Number(id), PERMS.OWNER);
  }
  const player = playerOfVault(shortname);
  if (player !== null && !wanted.has(player) && (universe.author_permissions[player] ?? 0) >= PERMS.WRITE) {
    wanted.set(player, PERMS.WRITE);
  }
  return wanted;
}

// Brings a vault's members in line with the campaign's GMs and players. Only this
// app's vaults are touched.
async function syncMembers(campaign: string, vault: Vault, universe: Universe): Promise<void> {
  const wanted = wantedMembers(vault.shortname, universe);
  const url = `${universeUrl(campaign)}/vaults/${vault.shortname}/perms`;
  for (const [id, level] of wanted) {
    const username = universe.authors[id];
    if (username && vault.author_permissions[id] !== level) await send(url, 'PUT', { username, permissionLevel: level });
  }
  for (const [id, username] of Object.entries(vault.authors)) {
    if (!wanted.has(Number(id))) await send(url, 'PUT', { username, permissionLevel: PERMS.NONE });
  }
}

// Makes sure one of this app's vaults exists, with the right members. Only GMs can
// make vaults.
export async function ensureVault(campaign: string, shortname: string): Promise<void> {
  const universe = await fetchUniverse(campaign);
  let vault = (await fetchVaults(campaign)).find(v => v.shortname === shortname);
  if (!vault) {
    try {
      await send(`${universeUrl(campaign)}/vaults`, 'POST', { title: vaultTitle(shortname, universe), shortname });
    } catch (e) {
      // Someone else may have just made it.
      if (!(await fetchVaults(campaign)).some(v => v.shortname === shortname)) throw e;
    }
    vault = (await fetchVaults(campaign)).find(v => v.shortname === shortname);
    if (!vault) throw new Error("The vault was made, but can't be found.");
  }
  await syncMembers(campaign, vault, universe);
}

// Run when a GM opens the campaign, and after its members change: keeps every GM in
// all of this app's vaults, drops people who've left, and gives each player who has
// claimed a PC a vault of their own, so they can keep it to themselves.
export async function syncVaults(campaign: string): Promise<void> {
  const universe = await fetchUniverse(campaign);
  const vaults = await fetchVaults(campaign);
  for (const vault of vaults) {
    if (vault.shortname === GM_VAULT || playerOfVault(vault.shortname) !== null) await syncMembers(campaign, vault, universe);
  }

  const itemsResponse = await fetch(`${universeUrl(campaign)}/items?type=pc`, { credentials: 'include' });
  if (!itemsResponse.ok) return;
  const pcs: { shortname: string }[] = await itemsResponse.json();
  const claimers = new Set<number>();
  for (const { shortname } of pcs) {
    const response = await fetch(`${universeUrl(campaign)}/items/${shortname}`, { credentials: 'include' });
    if (!response.ok) continue;
    const item = await response.json();
    const claim = claimOf(typeof item.obj_data === 'string' ? JSON.parse(item.obj_data) : item.obj_data);
    if (claim && (universe.author_permissions[claim.id] ?? 0) >= PERMS.WRITE) claimers.add(claim.id);
  }
  for (const id of claimers) {
    if (!vaults.some(v => v.shortname === playerVault(id))) await ensureVault(campaign, playerVault(id));
  }
}

async function fetchItem(campaign: string, item: string): Promise<any> {
  const response = await fetch(`${universeUrl(campaign)}/items/${item}`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Couldn't load ${item} (${response.status}).`);
  return await response.json();
}

// Moves an item into a vault, or out of any (null). Archivium only does this by saving
// the whole item, so the rest of it is sent back as it's fetched here, just before.
export async function moveToVault(campaign: string, item: string, vault: string | null): Promise<void> {
  const current = await fetchItem(campaign, item);
  await send(`${universeUrl(campaign)}/items/${item}`, 'PUT', {
    title: current.title,
    item_type: current.item_type,
    obj_data: typeof current.obj_data === 'string' ? JSON.parse(current.obj_data) : current.obj_data,
    // Saving an item replaces its tags, so they're sent back too.
    tags: current.tags ?? [],
    vault_short: vault,
  });
}

const vaultFor = (visibility: Visibility): string | null => {
  switch (visibility.kind) {
    case 'everyone': return null;
    case 'gms': return GM_VAULT;
    case 'player': return playerVault(visibility.userId);
    case 'other': return visibility.vault;
  }
};

// Sets who can see an item. GMs make the vault if it's not there yet.
export async function setVisibility(campaign: string, item: string, visibility: Visibility, gm: boolean): Promise<void> {
  const vault = vaultFor(visibility);
  if (vault && gm && visibility.kind !== 'other') await ensureVault(campaign, vault);
  await moveToVault(campaign, item, vault);
}

// Claims a PC for a player, unless someone else already has it. Returns who has it.
export async function claim(campaign: string, item: string, player: Claim): Promise<Claim> {
  const { obj_data } = await fetchItem(campaign, item);
  const current = claimOf(typeof obj_data === 'string' ? JSON.parse(obj_data) : obj_data);
  if (current && current.id !== player.id) return current;
  await send(`${universeUrl(campaign)}/items/${item}/data`, 'PUT', { [CLAIM_KEY]: { id: player.id, username: player.username } });
  return player;
}

// Lets go of a PC. One kept to its player is shown to everyone again first, since it
// can't stay in their vault (and a player can't move it to the GMs').
export async function unclaim(campaign: string, item: string): Promise<void> {
  const current = await fetchItem(campaign, item);
  if (visibilityOf(current.vault_short).kind === 'player') await moveToVault(campaign, item, null);
  await send(`${universeUrl(campaign)}/items/${item}/data`, 'PUT', { [CLAIM_KEY]: null });
}
