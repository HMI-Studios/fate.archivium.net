import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import Breadcrumbs from '../components/Breadcrumbs';
import { acceptInvite, declineInvite, fetchMyInvites } from '../fate/members';
import { PERMS, roleLabel } from '../perms';

// Where an invitation link lands (see fate/members.ts joinLink). The invitation itself
// comes from the user's pending invitations; the link's level is only a fallback.

type Status = 'loading' | 'invited' | 'uninvited' | 'member' | 'accepted' | 'declined';

interface Props {
  user: any;
}

export default function JoinCampaign({ user }: Props) {
  const { campaignShortname } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [level, setLevel] = useState(Number(searchParams.get('level')) || PERMS.WRITE);
  const [inviter, setInviter] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>('loading');
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!campaignShortname) return;
    (async () => {
      const invite = (await fetchMyInvites().catch(() => [])).find(i => i.universe_shortname === campaignShortname);
      if (invite) {
        setLevel(invite.permission_level);
        setTitle(invite.universe_title);
        setInviter(invite.inviter_username);
      }
      // Private campaigns can't be read until you've joined.
      const response = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' }).catch(() => null);
      const campaign = response?.ok ? await response.json() : null;
      if (campaign) setTitle(campaign.title);
      const myLevel = campaign?.author_permissions?.[user.id] ?? 0;
      if (invite && invite.permission_level > myLevel) setStatus('invited');
      else if (myLevel > 0) setStatus('member');
      else setStatus('uninvited');
    })();
  }, [campaignShortname]);

  if (!campaignShortname) return <>No campaign specified!</>;

  const name = title ?? campaignShortname;

  const respond = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (accept) {
        await acceptInvite(campaignShortname, user.username, level);
        setStatus('accepted');
        navigate(`/campaigns/${campaignShortname}`);
      } else {
        await declineInvite(campaignShortname, user.username);
        setStatus('declined');
      }
    } catch {
      setError(accept
        ? `Couldn't join. There may be no invitation for ${user.username} as ${roleLabel(level).toLowerCase()} in this campaign; ask the GM to check it was sent to the right username.`
        : "Couldn't decline the invitation.");
    }
    setBusy(false);
  };

  return <div className='d-flex flex-col gap-2'>
    <Breadcrumbs current={`Join ${name}`} />
    <h1 className='mb-0'>Join {name}</h1>
    {status === 'loading' && <div className='loader' />}
    {status === 'member' && <p className='ma-0'>
      You're already in this campaign. <Link className='link link-animated' to={`/campaigns/${campaignShortname}`}>Go to it</Link>.
    </p>}
    {status === 'invited' && <>
      <p className='ma-0'>
        {inviter ? <><b>{inviter}</b> invited you</> : "You've been invited"} to join as a <b>{roleLabel(level).toLowerCase()}</b>, signed in as <b>{user.username}</b>.
      </p>
      <div className='d-flex gap-2'>
        <button disabled={busy} onClick={() => respond(true)}>Accept</button>
        <button disabled={busy} onClick={() => respond(false)}>Decline</button>
      </div>
    </>}
    {status === 'uninvited' && <p className='ma-0'>
      There's no invitation to this campaign for <b>{user.username}</b>. It may have been cancelled, or sent to a different username.
    </p>}
    {status === 'declined' && <p className='ma-0'>You've declined the invitation. <Link className='link link-animated' to='/'>Back to your campaigns</Link>.</p>}
    {error && <p className='color-error ma-0'>{error}</p>}
    <small style={{ opacity: 0.8 }}>Not {user.username}? <a className='link link-animated' href={`${ARCHIVIUM_URL}/login?${new URLSearchParams({ page: window.location.href })}`}>Log in as someone else</a>.</small>
  </div>;
}
