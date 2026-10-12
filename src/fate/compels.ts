// Compels: the GM offers a player's character a fate point to have one of their
// aspects (or the scene's) complicate things. The player accepts and takes the fate
// point, or refuses and pays one. Compels are kept in the table doc (fate/table.ts)
// beside the dice log, so the table sees them in the log, and the player who has
// claimed the character answers them from the game room.

export type CompelStatus = 'pending' | 'accepted' | 'refused' | 'cancelled';

export type Compel = {
  id: string;
  at: number;
  // The GM who made it (Archivium username).
  by: string;
  character: { shortname: string, title: string };
  // The aspect compelled, as it was named then.
  aspect: string;
  // What goes wrong, if the GM said.
  complication?: string;
  status: CompelStatus;
  // Who answered (or cancelled) it, and when.
  answeredBy?: string;
  answeredAt?: number;
};

export const COMPEL_LOG_SIZE = 50;

export const newCompelId = (at: number) => `compel-${at}-${Math.random().toString(36).slice(2, 6)}`;

const STATUSES: CompelStatus[] = ['pending', 'accepted', 'refused', 'cancelled'];

export const isCompel = (value: unknown): value is Compel => {
  const compel = value as Compel;
  return Boolean(compel && typeof compel === 'object' && typeof compel.id === 'string' && typeof compel.at === 'number'
    && compel.character && typeof compel.character.shortname === 'string' && typeof compel.aspect === 'string'
    && STATUSES.includes(compel.status));
};
