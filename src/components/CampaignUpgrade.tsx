import { useEffect, useRef, useState } from 'react';
import { matchPath, useLocation } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import { schemaStatus, upgradeCampaign, type LayoutQuestion } from '../fate/schema';
import { isGameMaster } from '../perms';
import { panelStyle } from './PlayLayout';

type State =
  | { step: 'idle' }
  | { step: 'asking', questions: LayoutQuestion[] }
  | { step: 'upgrading', done: number, total: number }
  | { step: 'done' }
  | { step: 'failed', message: string };

// When a GM opens a campaign whose Fate sheets are behind the app's, brings them up to
// date (see fate/schema.ts), asking first about any sheet layout the campaign has changed.
export default function CampaignUpgrade({ user }: { user: { id: number } | null }) {
  const { pathname } = useLocation();
  const campaign = matchPath('/campaigns/:campaignShortname/*', pathname)?.params.campaignShortname
    ?? matchPath('/campaigns/:campaignShortname', pathname)?.params.campaignShortname;
  const [state, setState] = useState<State>({ step: 'idle' });
  // Campaigns already checked while this page has been open.
  const checked = useRef(new Set<string>());

  const run = (shortname: string, accept: string[]) => {
    setState({ step: 'upgrading', done: 0, total: 0 });
    upgradeCampaign(shortname, accept, (done, total) => setState({ step: 'upgrading', done, total }))
      .then(() => setState({ step: 'done' }))
      .catch(e => setState({ step: 'failed', message: e instanceof Error ? e.message : String(e) }));
  };

  useEffect(() => {
    if (!campaign || !user || checked.current.has(campaign)) return;
    checked.current.add(campaign);
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaign}`, { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .then(universe => {
        if (!universe || !isGameMaster(universe, user)) return;
        const status = schemaStatus(typeof universe.obj_data === 'string' ? JSON.parse(universe.obj_data) : universe.obj_data);
        if (!status.needed) return;
        if (status.ask.length > 0) setState({ step: 'asking', questions: status.ask });
        else run(campaign, []);
      })
      .catch(() => {});
  }, [campaign, user]);

  if (state.step === 'idle' || !campaign) return null;

  const names = state.step === 'asking' ? state.questions.map(q => `"${q.title}"`).join(' and ') : '';
  const allUnknown = state.step === 'asking' && state.questions.every(q => q.reason === 'unknown');
  const several = state.step === 'asking' && state.questions.length > 1;

  return <div
    role='status'
    className='d-flex flex-col gap-1'
    style={{ ...panelStyle, position: 'fixed', left: '1rem', bottom: '1rem', zIndex: 100, maxWidth: 'min(26rem, calc(100vw - 2rem))', padding: '0.6rem 0.75rem' }}
  >
    {state.step === 'asking' && <>
      <b>The Fate sheets have been updated</b>
      <span>
        {allUnknown
          ? `This campaign's ${names} ${several ? 'layouts are' : 'layout is'} from before the app kept track of changes, so ${several ? 'they' : 'it'} may have been customised in Archivium.`
          : `This campaign's ${names} ${several ? 'layouts have' : 'layout has'} been changed in Archivium.`}
        {' '}Replace {several ? 'them' : 'it'} with the new version? Any changes made to {several ? 'them' : 'it'} would be lost.
      </span>
      <div className='d-flex gap-1 justify-end'>
        <button onClick={() => run(campaign, [])} title="Keep this campaign's layout; you'll be asked again when the app's next changes">Keep ours</button>
        <button onClick={() => run(campaign, state.questions.map(q => q.id))}><b>Update</b></button>
      </div>
    </>}
    {state.step === 'upgrading' && <span>
      Updating this campaign's Fate sheets{state.total > 0 ? ` (${state.done} of ${state.total})` : ''}…
    </span>}
    {state.step === 'done' && <>
      <span>This campaign's Fate sheets are up to date. Reload to see the changes.</span>
      <div className='d-flex gap-1 justify-end'>
        <button onClick={() => setState({ step: 'idle' })}>Later</button>
        <button onClick={() => window.location.reload()}><b>Reload</b></button>
      </div>
    </>}
    {state.step === 'failed' && <>
      <span className='color-error'>Couldn't finish updating this campaign's Fate sheets: {state.message} It'll be tried again next time.</span>
      <div className='d-flex justify-end'>
        <button onClick={() => setState({ step: 'idle' })}>Dismiss</button>
      </div>
    </>}
  </div>;
}
