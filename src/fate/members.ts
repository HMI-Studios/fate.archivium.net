import { ARCHIVIUM_URL } from '../App';

// Campaign membership through Archivium's universe permission API: invitations (sent
// by admins), requests to join (sent by users), and members' permission levels.

const universeUrl = (campaign: string) => `${ARCHIVIUM_URL}/api/universes/${campaign}`;

async function send(url: string, method: string, body?: unknown): Promise<void> {
  const response = await fetch(url, {
    credentials: 'include',
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
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

// An invitation to the signed-in user (GET /api/me/invites).
export type MyInvite = {
  universe_shortname: string;
  universe_title: string;
  permission_level: number;
  inviter_username: string | null;
};

// A pending invitation or request to join, as a campaign admin sees it.
export type AccessListing = {
  username: string;
  permission_level: number;
  inviter_username: string | null;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Archivium said no (${response.status}).`);
  return await response.json();
}

export const fetchMyInvites = () => getJson<MyInvite[]>(`${ARCHIVIUM_URL}/api/me/invites`);
export const fetchInvites = (campaign: string) => getJson<AccessListing[]>(`${universeUrl(campaign)}/invites`);
export const fetchRequests = (campaign: string) => getJson<AccessListing[]>(`${universeUrl(campaign)}/requests`);

export async function userExists(username: string): Promise<boolean> {
  const response = await fetch(`${ARCHIVIUM_URL}/api/users/${encodeURIComponent(username)}`, { credentials: 'include' });
  return response.ok;
}

export const inviteUser = (campaign: string, username: string, permissionLevel: number) =>
  send(`${universeUrl(campaign)}/invite/${encodeURIComponent(username)}`, 'PUT', { permissionLevel });

export const cancelInvite = (campaign: string, username: string) =>
  send(`${universeUrl(campaign)}/invite/${encodeURIComponent(username)}`, 'DELETE');

// Sets a member's level; 0 removes them from the campaign.
export const setPermission = (campaign: string, username: string, permissionLevel: number) =>
  send(`${universeUrl(campaign)}/perms`, 'PUT', { username, permissionLevel });

// Accepting an invitation is setting your own level to the invited one; Archivium
// applies it on behalf of the admin who invited you, and refuses if there's no such
// invitation.
export const acceptInvite = (campaign: string, username: string, permissionLevel: number) =>
  setPermission(campaign, username, permissionLevel);

// Asking to join: any signed-in user can ask for a level on any campaign, and its
// admins approve or deny it (Archivium notifies the owner).
export const requestAccess = (campaign: string, permissionLevel: number) =>
  send(`${universeUrl(campaign)}/request`, 'PUT', { permissionLevel });

export const declineInvite = (campaign: string, username: string) =>
  send(`${universeUrl(campaign)}/request/${encodeURIComponent(username)}`, 'DELETE');

// A GM answering someone's request to join: approving gives them the level they asked for.
export const approveRequest = (campaign: string, username: string, permissionLevel: number) =>
  setPermission(campaign, username, permissionLevel);

export const denyRequest = declineInvite;

// A link to a campaign's join page. Someone invited can accept there; anyone else can
// ask to join with the link's role, for the GM to approve.
export const joinLink = (campaign: string, permissionLevel: number) =>
  `${window.location.origin}/campaigns/${campaign}/join?level=${permissionLevel}`;

// A join link followed while logged out is remembered, per browser, in case logging in
// or creating an account doesn't bring its visitor back to it (Archivium's usually do).
const PENDING_JOIN_KEY = 'fate.pendingJoin';
const JOIN_PATH = /^\/campaigns\/([^/]+)\/join$/;

export type PendingJoin = { campaign: string, url: string };

// Resolves to the campaign being joined, if this is a join page.
export function rememberPendingJoin(): string | null {
  const match = JOIN_PATH.exec(window.location.pathname);
  if (!match) return null;
  try {
    window.localStorage.setItem(PENDING_JOIN_KEY, JSON.stringify({ campaign: match[1], url: window.location.pathname + window.location.search }));
  } catch {
    // Not remembering is fine.
  }
  return match[1];
}

export function pendingJoin(): PendingJoin | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PENDING_JOIN_KEY) ?? 'null');
    return stored && typeof stored.campaign === 'string' && typeof stored.url === 'string' ? stored : null;
  } catch {
    return null;
  }
}

export function forgetPendingJoin(): void {
  try {
    window.localStorage.removeItem(PENDING_JOIN_KEY);
  } catch {
    // Nothing to forget.
  }
}
