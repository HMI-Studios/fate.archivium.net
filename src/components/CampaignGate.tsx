import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import { fetchMyInvites, type MyInvite } from '../fate/members';
import { roleLabel } from '../perms';

type State =
  | { step: 'loading' }
  | { step: 'ok' }
  // Signed in, but not in the campaign (Archivium says 403 for private campaigns).
  | { step: 'outside', invite: MyInvite | null }
  | { step: 'missing' }
  | { step: 'failed', status: number | null };

// In front of a campaign's pages: checks that the campaign can be read before showing
// them, so someone who isn't in it (or followed a wrong link) gets told so, and how to
// join, instead of pages that fail one request at a time.
export default function CampaignGate({ fullScreen = false }: { fullScreen?: boolean }) {
  const { campaignShortname } = useParams();
  const [state, setState] = useState<State>({ step: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!campaignShortname) return;
    let cancelled = false;
    setState({ step: 'loading' });
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' })
      .then(async response => {
        if (response.ok) return { step: 'ok' } as State;
        if (response.status === 404) return { step: 'missing' } as State;
        if (response.status === 401 || response.status === 403) {
          const invite = (await fetchMyInvites().catch(() => [])).find(i => i.universe_shortname === campaignShortname) ?? null;
          return { step: 'outside', invite } as State;
        }
        return { step: 'failed', status: response.status } as State;
      })
      .catch(() => ({ step: 'failed', status: null }) as State)
      .then(next => { if (!cancelled) setState(next); });
    return () => { cancelled = true; };
  }, [campaignShortname, attempt]);

  if (state.step === 'ok') return <Outlet />;

  if (state.step === 'loading') return <div style={{ height: 'calc(50vh + 25px)' }} className='w-100 d-flex justify-center align-end'>
    <div className='loader' />
  </div>;

  // The game room and maps have no page around them: they send people to the
  // campaign's page instead, which says the same within the site's layout.
  if (fullScreen) return <Navigate to={`/campaigns/${campaignShortname}`} replace />;

  const joinPath = `/campaigns/${campaignShortname}/join`;
  const back = <Link className='link link-animated' to='/'>Back to your campaigns</Link>;
  const content = (() => {
    switch (state.step) {
      case 'outside': return state.invite
        ? <>
          <h1 className='mb-0'>You're invited to {state.invite.universe_title}</h1>
          <p className='ma-0'>
            {state.invite.inviter_username ? <><b>{state.invite.inviter_username}</b> has invited you</> : "You've been invited"} to
            join as a <b>{roleLabel(state.invite.permission_level).toLowerCase()}</b>, but you haven't joined yet.
          </p>
          <div className='d-flex gap-3 flex-wrap'>
            <Link className='link link-animated' to={joinPath}>See the invitation</Link>
            {back}
          </div>
        </>
        : <>
          <h1 className='mb-0'>You're not in this campaign</h1>
          <p className='ma-0'>
            <b>{campaignShortname}</b> is private: only its players and GMs can see it. If you're meant to
            play in it, ask the GM for an invitation, or ask to join and they can let you in.
          </p>
          <div className='d-flex gap-3 flex-wrap'>
            <Link className='link link-animated' to={joinPath}>Ask to join</Link>
            {back}
          </div>
        </>;
      case 'missing': return <>
        <h1 className='mb-0'>No such campaign</h1>
        <p className='ma-0'>There's no campaign called <b>{campaignShortname}</b>. The link may be wrong, or the campaign may have been deleted or renamed.</p>
        <div>{back}</div>
      </>;
      case 'failed': return <>
        <h1 className='mb-0'>Couldn't load the campaign</h1>
        <p className='ma-0'>
          {state.status ? `Archivium had a problem (${state.status}).` : "Couldn't reach Archivium: it may be down, or your connection may have dropped."}
        </p>
        <div className='d-flex gap-3 flex-wrap align-center'>
          <button onClick={() => setAttempt(a => a + 1)}>Try again</button>
          {back}
        </div>
      </>;
    }
  })();

  return <div className='d-flex flex-col gap-2'>{content}</div>;
}
