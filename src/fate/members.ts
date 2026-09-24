import { ARCHIVIUM_URL } from '../App';

// Campaign membership through Archivium's universe permission API.
//
// Archivium's API can send, cancel, accept and decline invitations, but can't list
// them: pending invitations only show on Archivium's own permissions page. So after
// inviting someone the GM gets a join link to send them (with the invited level, which
// accepting needs), and this app only knows about invitations it sent this session.

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

export const joinLink = (campaign: string, permissionLevel: number) =>
  `${window.location.origin}/campaigns/${campaign}/join?level=${permissionLevel}`;
