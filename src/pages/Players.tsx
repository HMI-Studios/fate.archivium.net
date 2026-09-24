import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import Breadcrumbs, { archiviumUniverseUrl } from '../components/Breadcrumbs';
import { cancelInvite, inviteUser, joinLink, setPermission, userExists } from '../fate/members';
import { CAMPAIGN_ROLES, isGameMaster, PERMS, roleLabel } from '../perms';
import type { Campaign } from './Campaign';

type SentInvite = { username: string, level: number };

interface Props {
  user: any;
}

export default function Players({ user }: Props) {
  const { campaignShortname } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState('');
  const [level, setLevel] = useState<number>(PERMS.WRITE);
  const [sent, setSent] = useState<SentInvite[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' });
    if (!response.ok) throw new Error(`Could not load the campaign (${response.status}).`);
    setCampaign(await response.json());
  };

  useEffect(() => {
    if (campaignShortname) load().catch(err => setError(err.message));
  }, [campaignShortname]);

  if (!campaignShortname) return <>No campaign specified!</>;
  if (!campaign) return error ? <span className='color-error'>{error}</span> : <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;

  const isGM = isGameMaster(campaign, user);
  const myLevel = campaign.author_permissions[user.id] ?? 0;
  const members = Object.entries(campaign.authors)
    .map(([id, name]) => ({ id: Number(id), username: name, level: campaign.author_permissions[Number(id)] ?? 0 }))
    .sort((a, b) => b.level - a.level || a.username.localeCompare(b.username));

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
    setBusy(false);
  };

  const invite = (e: FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    run(async () => {
      if (!await userExists(name)) throw new Error(`There's no Archivium user called "${name}".`);
      if (members.some(m => m.username === name)) throw new Error(`${name} is already in this campaign; change their role below instead.`);
      await inviteUser(campaignShortname, name, level);
      setSent(current => [{ username: name, level }, ...current.filter(s => s.username !== name)]);
      setUsername('');
    });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      window.prompt('Copy this link:', text);
    }
  };

  // Archivium lets admins set levels up to their own (owners can't be demoted by others).
  const canChange = (member: { id: number, level: number }) => isGM && member.id !== user.id && member.level <= myLevel;
  const assignable = CAMPAIGN_ROLES.filter(r => r.level <= myLevel);

  return <>
    <Breadcrumbs campaign={campaignShortname} current='Players' />
    <h1 className='mb-1'>Players</h1>
    {error && <p className='color-error ma-0 mb-2'>{error}</p>}

    <h2 className='mb-1'>In this campaign</h2>
    <ul className='ma-0 pa-0 d-flex flex-col gap-1' style={{ listStyle: 'none' }}>
      {members.map(member => (
        <li key={member.id} className='d-flex align-center gap-2 flex-wrap'>
          <b style={{ minWidth: '10rem' }}>{member.username}{member.id === user.id && ' (you)'}</b>
          {canChange(member) && member.level !== PERMS.OWNER
            ? <>
              <select
                aria-label={`${member.username}'s role`}
                value={member.level}
                disabled={busy}
                onChange={({ target }) => run(async () => {
                  await setPermission(campaignShortname, member.username, Number(target.value));
                  await load();
                })}
              >
                {!assignable.some(r => r.level === member.level) && <option value={member.level}>{roleLabel(member.level)}</option>}
                {assignable.map(r => <option key={r.level} value={r.level}>{r.label}</option>)}
              </select>
              <button disabled={busy} onClick={() => {
                if (!window.confirm(`Remove ${member.username} from the campaign?`)) return;
                run(async () => {
                  await setPermission(campaignShortname, member.username, PERMS.NONE);
                  await load();
                });
              }}>Remove</button>
            </>
            : <span>{roleLabel(member.level)}</span>}
        </li>
      ))}
    </ul>

    {isGM
      ? <>
        <h2 className='mb-1'>Invite someone</h2>
        <form className='d-flex gap-2 flex-wrap align-center' onSubmit={invite}>
          <input placeholder='Archivium username' aria-label='Username to invite' value={username} onChange={({ target }) => setUsername(target.value)} />
          <select aria-label='Role' value={level} onChange={({ target }) => setLevel(Number(target.value))}>
            {assignable.map(r => <option key={r.level} value={r.level} title={r.description}>{r.label}</option>)}
          </select>
          <button type='submit' disabled={busy || !username.trim()}>Invite</button>
        </form>
        <p className='ma-0 mt-1'><small style={{ opacity: 0.8 }}>
          {CAMPAIGN_ROLES.map(r => `${r.label}: ${r.description.toLowerCase()}.`).join(' ')} They get an Archivium
          notification, and a link to accept it here once you send it to them.
        </small></p>

        {sent.length > 0 && <>
          <h3 className='mb-1'>Invitations you've sent</h3>
          <ul className='ma-0 pa-0 d-flex flex-col gap-2' style={{ listStyle: 'none' }}>
            {sent.map(invite => {
              const link = joinLink(campaignShortname, invite.level);
              return (
                <li key={invite.username} className='d-flex flex-col gap-1'>
                  <span><b>{invite.username}</b> as {roleLabel(invite.level)}</span>
                  <span className='d-flex gap-2 flex-wrap align-center'>
                    <code style={{ overflowWrap: 'anywhere' }}>{link}</code>
                    <button onClick={() => copy(link)}>{copied === link ? 'Copied' : 'Copy link'}</button>
                    <button disabled={busy} onClick={() => run(async () => {
                      await cancelInvite(campaignShortname, invite.username);
                      setSent(current => current.filter(s => s.username !== invite.username));
                    })}>Cancel invitation</button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>}
        <p className='mt-3'><small style={{ opacity: 0.8 }}>
          Invitations sent earlier, and requests to join, are listed on the campaign's <a className='link link-animated' href={`${archiviumUniverseUrl(campaignShortname)}/permissions`}>permissions page in Archivium</a>.
        </small></p>
      </>
      : <p>Only the GM can invite people or change roles.</p>}
  </>;
}
