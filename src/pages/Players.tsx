import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import Breadcrumbs from '../components/Breadcrumbs';
import { approveRequest, cancelInvite, denyRequest, fetchInvites, fetchRequests, inviteUser, joinLink, setPermission, userExists, type AccessListing } from '../fate/members';
import { CAMPAIGN_ROLES, isGameMaster, PERMS, roleLabel } from '../perms';
import { syncVaults } from '../fate/vaults';
import type { Campaign } from './Campaign';

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
  const [invites, setInvites] = useState<AccessListing[]>([]);
  const [requests, setRequests] = useState<AccessListing[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [linkLevel, setLinkLevel] = useState<number>(PERMS.WRITE);

  const load = async () => {
    const response = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' });
    if (!response.ok) throw new Error(`Could not load the campaign (${response.status}).`);
    const data: Campaign = await response.json();
    setCampaign(data);
    // Only admins can see pending invitations and requests.
    if (isGameMaster(data, user)) {
      const [pendingInvites, pendingRequests] = await Promise.all([fetchInvites(data.shortname), fetchRequests(data.shortname)]);
      setInvites(pendingInvites);
      setRequests(pendingRequests);
    }
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
      await load();
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
                  // New GMs join the vaults of hidden characters; demoted ones leave them.
                  await syncVaults(campaignShortname);
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
                  await syncVaults(campaignShortname);
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
          {CAMPAIGN_ROLES.map(r => `${r.label}: ${r.description.toLowerCase()}.`).join(' ')} They'll see the
          invitation in their campaign list here, and get an Archivium notification.
        </small></p>

        <h3 className='mb-1'>Join link</h3>
        <div className='d-flex gap-2 flex-wrap align-center'>
          <select aria-label='Role the link asks for' value={linkLevel} onChange={({ target }) => setLinkLevel(Number(target.value))}>
            {assignable.filter(r => r.level < PERMS.OWNER).map(r => <option key={r.level} value={r.level}>{r.label}</option>)}
          </select>
          <button onClick={() => copy(joinLink(campaignShortname, linkLevel))}>
            {copied === joinLink(campaignShortname, linkLevel) ? 'Copied' : 'Copy join link'}
          </button>
        </div>
        <p className='ma-0 mt-1'><small style={{ opacity: 0.8 }}>
          Anyone with the link can ask to join with that role, including people who don't have an Archivium
          account yet (they can make one on the way). Their requests show up below for you to approve.
        </small></p>

        {requests.length > 0 && <>
          <h3 className='mb-1'>Asking to join</h3>
          <ul className='ma-0 pa-0 d-flex flex-col gap-1' style={{ listStyle: 'none' }}>
            {requests.map(request => (
              <li key={request.username} className='d-flex align-center gap-2 flex-wrap'>
                <span><b>{request.username}</b> as {roleLabel(request.permission_level).toLowerCase()}</span>
                <button disabled={busy || request.permission_level > myLevel} onClick={() => run(async () => {
                  await approveRequest(campaignShortname, request.username, request.permission_level);
                  await load();
                })}>Approve</button>
                <button disabled={busy} onClick={() => run(async () => {
                  await denyRequest(campaignShortname, request.username);
                  await load();
                })}>Deny</button>
              </li>
            ))}
          </ul>
        </>}

        {invites.length > 0 && <>
          <h3 className='mb-1'>Invited</h3>
          <ul className='ma-0 pa-0 d-flex flex-col gap-1' style={{ listStyle: 'none' }}>
            {invites.map(invite => {
              const link = joinLink(campaignShortname, invite.permission_level);
              return (
                <li key={invite.username} className='d-flex align-center gap-2 flex-wrap'>
                  <span>
                    <b>{invite.username}</b> as {roleLabel(invite.permission_level).toLowerCase()}
                    {invite.inviter_username && <small style={{ opacity: 0.8 }}> (invited by {invite.inviter_username})</small>}
                  </span>
                  <button onClick={() => copy(link)} title={link}>{copied === link ? 'Copied' : 'Copy join link'}</button>
                  <button disabled={busy} onClick={() => run(async () => {
                    await cancelInvite(campaignShortname, invite.username);
                    await load();
                  })}>Cancel</button>
                </li>
              );
            })}
          </ul>
        </>}
      </>
      : <p>Only the GM can invite people or change roles.</p>}
  </>;
}
