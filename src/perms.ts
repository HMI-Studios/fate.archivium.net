// Archivium's permission levels (archivium src/api/utils.ts `perms`).
export const PERMS = {
  NONE: 0,
  READ: 1,
  COMMENT: 2,
  WRITE: 3,
  ADMIN: 4,
  OWNER: 5,
} as const;

// Universe admins run the table: they're the GM.
export function isGameMaster(campaign: { author_permissions: { [author: number]: number } }, user: { id: number } | null | undefined): boolean {
  return Boolean(user) && (campaign.author_permissions[user!.id] ?? 0) >= PERMS.ADMIN;
}

// The roles this app offers when inviting people, as Archivium permission levels.
// Players need write access to fill in their sheets and move their tokens.
export const CAMPAIGN_ROLES: { level: number, label: string, description: string }[] = [
  { level: PERMS.WRITE, label: 'Player', description: 'Plays in the game room, edits sheets and scenes' },
  { level: PERMS.READ, label: 'Spectator', description: "Watches the game room, can't change anything" },
  { level: PERMS.ADMIN, label: 'Co-GM', description: 'Runs the table and manages players' },
];

export function roleLabel(level: number | undefined): string {
  if (level === PERMS.OWNER) return 'Owner';
  if (level === PERMS.COMMENT) return 'Commenter';
  return CAMPAIGN_ROLES.find(r => r.level === level)?.label ?? 'No access';
}
