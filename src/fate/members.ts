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

export const declineInvite = (campaign: string, username: string) =>
  send(`${universeUrl(campaign)}/request/${encodeURIComponent(username)}`, 'DELETE');

// A GM answering someone's request to join: approving gives them the level they asked for.
export const approveRequest = (campaign: string, username: string, permissionLevel: number) =>
  setPermission(campaign, username, permissionLevel);

export const denyRequest = declineInvite;

// A link straight to an invitation, for sending to the invitee (they also see it in
// their campaign list).
export const joinLink = (campaign: string, permissionLevel: number) =>
  `${window.location.origin}/campaigns/${campaign}/join?level=${permissionLevel}`;
