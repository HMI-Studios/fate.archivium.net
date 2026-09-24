import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import Breadcrumbs from '../components/Breadcrumbs';
import { acceptInvite, declineInvite } from '../fate/members';
import { PERMS, roleLabel } from '../perms';

// Where an invitation link lands (see fate/members.ts joinLink). Archivium doesn't let
// invitees see a private campaign, or their invitation, before accepting, so this page
// works from the link: accepting fails if there's no matching invitation.

type Status = 'loading' | 'invited' | 'member' | 'accepted' | 'declined';

interface Props {
  user: any;
}

export default function JoinCampaign({ user }: Props) {
  const { campaignShortname } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const level = Number(searchParams.get('level')) || PERMS.WRITE;

  const [status, setStatus] = useState<Status>('loading');
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!campaignShortname) return;
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) {
        // Private campaigns can't be read until you've joined.
        setStatus('invited');
        return;
      }
      const campaign = await response.json();
      setTitle(campaign.title);
      setStatus((campaign.author_permissions?.[user.id] ?? 0) >= level ? 'member' : 'invited');
    }).catch(() => setStatus('invited'));
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
      <p className='ma-0'>You've been invited to join as a <b>{roleLabel(level).toLowerCase()}</b>, signed in as <b>{user.username}</b>.</p>
      <div className='d-flex gap-2'>
        <button disabled={busy} onClick={() => respond(true)}>Accept</button>
        <button disabled={busy} onClick={() => respond(false)}>Decline</button>
      </div>
    </>}
    {status === 'declined' && <p className='ma-0'>You've declined the invitation. <Link className='link link-animated' to='/'>Back to your campaigns</Link>.</p>}
    {error && <p className='color-error ma-0'>{error}</p>}
    <small style={{ opacity: 0.8 }}>Not {user.username}? <a className='link link-animated' href={`${ARCHIVIUM_URL}/login?${new URLSearchParams({ page: window.location.href })}`}>Log in as someone else</a>.</small>
  </div>;
}
