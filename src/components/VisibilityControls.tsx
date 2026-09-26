import { useEffect, useState } from 'react';
import { claim, fetchVaults, playerVault, setVisibility, unclaim, visibilityOf, type Claim, type Visibility } from '../fate/vaults';
import { isGameMaster, PERMS } from '../perms';

type Props = {
  campaign: string;
  item: string;
  itemType: string;
  // The item's vault, and its title, as Archivium gives them.
  vaultShort: string | null;
  vaultTitle: string | null;
  claim: Claim | null;
  user: { id: number, username: string };
  universe: { author_permissions: { [id: number]: number }, authors: { [id: number]: string } };
  onChange: (vaultShort: string | null, vaultTitle: string | null, claim: Claim | null) => void;
};

const key = (v: Visibility) => v.kind === 'player' ? `player-${v.userId}` : v.kind === 'other' ? `other-${v.vault}` : v.kind;

// Who can see a character (see fate/vaults.ts), and for PCs, who plays it. GMs choose
// between everyone in the campaign, the GMs only, and the PC's player and the GMs; the
// player who claimed a PC can keep it to themselves and the GMs, or show it to everyone.
export default function VisibilityControls({ campaign, item, itemType, vaultShort, vaultTitle, claim: claimed, user, universe, onChange }: Props) {
  const gm = isGameMaster(universe, user);
  const canWrite = (universe.author_permissions[user.id] ?? 0) >= PERMS.WRITE;
  const mine = claimed?.id === user.id;
  const current = visibilityOf(vaultShort);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // For a player who claimed this: whether their own vault is there yet (GMs make it).
  const [ownVault, setOwnVault] = useState<boolean | null>(null);

  useEffect(() => {
    if (gm || !mine) return;
    let cancelled = false;
    fetchVaults(campaign)
      .then(vaults => { if (!cancelled) setOwnVault(vaults.some(v => v.shortname === playerVault(user.id))); })
      .catch(() => { if (!cancelled) setOwnVault(false); });
    return () => { cancelled = true; };
  }, [campaign, gm, mine, user.id]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: number) => universe.authors[id] ?? (claimed?.id === id ? claimed.username : 'A player');
  const label = (v: Visibility): string => {
    switch (v.kind) {
      case 'everyone': return 'Everyone in the campaign';
      case 'gms': return 'GMs only';
      case 'player': return `${nameOf(v.userId)} and the GMs`;
      case 'other': return vaultTitle ? `Vault: ${vaultTitle}` : `Vault: ${v.vault}`;
    }
  };

  // What the viewer may pick from, starting with where it is now.
  const options: { visibility: Visibility, disabled?: boolean, note?: string }[] = [];
  const add = (visibility: Visibility, extra: { disabled?: boolean, note?: string } = {}) => {
    if (!options.some(o => key(o.visibility) === key(visibility))) options.push({ visibility, ...extra });
  };
  const ownOnly = current.kind === 'everyone' || (current.kind === 'player' && current.userId === user.id);
  const canChange = gm || (mine && ownOnly);
  if (canChange) {
    add({ kind: 'everyone' });
    if (gm) add({ kind: 'gms' });
    if (claimed && itemType === 'pc') {
      const waiting = !gm && ownVault === false;
      add({ kind: 'player', userId: claimed.id }, waiting ? { disabled: true, note: ' (once a GM has opened the campaign)' } : {});
    }
  }
  add(current);

  const pick = (next: Visibility) => run(async () => {
    await setVisibility(campaign, item, next, gm);
    const vault = next.kind === 'everyone' ? null : next.kind === 'gms' ? 'fate-gm' : next.kind === 'player' ? playerVault(next.userId) : next.vault;
    onChange(vault, next.kind === 'everyone' ? null : label(next), claimed);
  });

  return <div className='d-flex align-center gap-2 flex-wrap'>
    <label className='d-flex align-center gap-1'>
      <span>Seen by</span>
      {canChange
        ? <select
          value={key(current)}
          disabled={busy}
          onChange={({ target }) => {
            const next = options.find(o => key(o.visibility) === target.value)?.visibility;
            if (next) pick(next);
          }}
          title='Who can see this sheet (in Archivium too)'
        >
          {options.map(({ visibility, disabled, note }) => <option key={key(visibility)} value={key(visibility)} disabled={disabled}>
            {label(visibility)}{note ?? ''}
          </option>)}
        </select>
        : <b>{label(current)}</b>}
    </label>
    {itemType === 'pc' && <span className='d-flex align-center gap-1'>
      {claimed
        ? <>
          <span>Played by <b>{mine ? 'you' : claimed.username}</b></span>
          {(mine || gm) && <button type='button' disabled={busy} onClick={() => {
            const privateNow = current.kind === 'player';
            if (privateNow && !window.confirm(`${mine ? 'Letting go of this character' : `Taking this character from ${claimed.username}`} shows it to everyone in the campaign again. Go ahead?`)) return;
            run(async () => {
              await unclaim(campaign, item);
              onChange(privateNow ? null : vaultShort, privateNow ? null : vaultTitle, null);
            });
          }} title={mine ? 'Stop being the player of this character' : `Take this character away from ${claimed.username}`}>Unclaim</button>}
        </>
        : canWrite && <button type='button' disabled={busy} onClick={() => run(async () => {
          const holder = await claim(campaign, item, { id: user.id, username: user.username });
          if (holder.id !== user.id) setError(`${holder.username} has just claimed this character.`);
          onChange(vaultShort, vaultTitle, holder);
        })} title='Mark this as your character: you can then keep it to yourself and the GMs'>Claim</button>}
    </span>}
    {busy && <span style={{ color: 'var(--light-text-color)' }}>Saving…</span>}
    {error && <span className='color-error'>{error}</span>}
  </div>;
}
