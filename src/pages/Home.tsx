import { useEffect, useState } from 'react';
import { ARCHIVIUM_URL } from '../App';
import { Link, useNavigate } from 'react-router';
import { acceptInvite, declineInvite, fetchMyInvites, forgetPendingJoin, pendingJoin, type MyInvite } from '../fate/members';
import { roleLabel } from '../perms';
import { usePageTitle } from '../pageTitle';
import type { Campaign } from './Campaign';

interface Props {
  user: any;
}

export default function Home({ user }: Props) {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [invites, setInvites] = useState<MyInvite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A join link followed before signing in, if signing in didn't lead back to it.
  const [pending, setPending] = useState(pendingJoin);
  usePageTitle('Campaigns');

  useEffect(() => {
    fetch(`${ARCHIVIUM_URL}/api/universes`, { credentials: 'include' }).then(async (response) => {
      const data: Campaign[] = (await response.json()).map((campaign: any) => ({
        ...campaign,
        created_at: new Date(campaign.created_at),
        updated_at: new Date(campaign.updated_at),
        obj_data: typeof campaign.obj_data === 'string' ? JSON.parse(campaign.obj_data) : campaign.obj_data,
      }));
      setCampaigns(data.filter(c => c.obj_data.isFateCampaign));
    });
    // Invitations can be to any universe: whether a private one is a Fate campaign
    // isn't visible until you've joined.
    fetchMyInvites().then(setInvites).catch(() => {});
  }, []);

  const respond = async (invite: MyInvite, accept: boolean) => {
    setBusy(invite.universe_shortname);
    setError(null);
    try {
      if (accept) {
        await acceptInvite(invite.universe_shortname, user.username, invite.permission_level);
        navigate(`/campaigns/${invite.universe_shortname}`);
        return;
      }
      await declineInvite(invite.universe_shortname, user.username);
      setInvites(current => current.filter(i => i.universe_shortname !== invite.universe_shortname));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't answer the invitation.");
    }
    setBusy(null);
  };

  return <>
    {pending && <p className='ma-0 mb-2 d-flex align-center gap-2 flex-wrap'>
      <span>You were following a link to join <b>{pending.campaign}</b>.</span>
      <Link className='link link-animated' to={pending.url}>Continue</Link>
      <button onClick={() => { forgetPendingJoin(); setPending(null); }}>Dismiss</button>
    </p>}
    {invites.length > 0 && <>
      <h2 className='mb-1'>Invitations</h2>
      {error && <p className='color-error ma-0 mb-1'>{error}</p>}
      <ul className='ma-0 pa-0 d-flex flex-col gap-1 mb-3' style={{ listStyle: 'none' }}>
        {invites.map(invite => (
          <li key={invite.universe_shortname} className='d-flex align-center gap-2 flex-wrap'>
            <span>
              <b>{invite.universe_title}</b> as {roleLabel(invite.permission_level).toLowerCase()}
              {invite.inviter_username && <small style={{ opacity: 0.8 }}> (from {invite.inviter_username})</small>}
            </span>
            <button disabled={busy !== null} onClick={() => respond(invite, true)}>Accept</button>
            <button disabled={busy !== null} onClick={() => respond(invite, false)}>Decline</button>
          </li>
        ))}
      </ul>
    </>}

    <h1>Campaigns</h1>
    {campaigns ? <>
      <Link className='link link-animated ml-2' to='/new'>New Campaign</Link>
      {campaigns.length > 0 && <ul>
        {campaigns.map(campaign => (<li key={campaign.shortname}>
          <Link className='link link-animated' to={`/campaigns/${campaign.shortname}`}>{campaign.title}</Link>
        </li>))}
      </ul>}
    </> : <div className='loader ml-2' />}
  </>;
}
