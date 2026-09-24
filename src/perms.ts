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
