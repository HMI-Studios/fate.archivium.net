import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import Breadcrumbs, { archiviumUniverseUrl } from '../components/Breadcrumbs';
import { readSettings, saveSettings, TURN_ORDER_OPTIONS, type FateSettings } from '../fate/settings';
import { isGameMaster } from '../perms';
import type { Campaign } from './Campaign';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  user: any;
}

export default function CampaignSettings({ user }: Props) {
  const { campaignShortname } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [settings, setSettings] = useState<FateSettings | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignShortname) return;
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) {
        setError(`Could not load the campaign (${response.status}).`);
        return;
      }
      const data = await response.json();
      setCampaign(data);
      setSettings(readSettings(typeof data.obj_data === 'string' ? JSON.parse(data.obj_data) : data.obj_data));
    });
  }, [campaignShortname]);

  if (error) return <span className='color-error'>{error}</span>;
  if (!campaignShortname || !campaign || !settings) return <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;

  const canEdit = isGameMaster(campaign, user);

  const change = async (changes: Partial<FateSettings>) => {
    setSettings({ ...settings, ...changes });
    setStatus('saving');
    try {
      setSettings(await saveSettings(campaignShortname, changes));
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  return <>
    <Breadcrumbs campaign={campaignShortname} current='Settings' />
    <div className='d-flex justify-between align-center flex-wrap gap-2'>
      <h1 className='mb-1'>Campaign settings</h1>
      <small className={status === 'error' ? 'color-error' : undefined}>
        {status === 'saving' && 'Saving…'}
        {status === 'saved' && 'Saved'}
        {status === 'error' && "Couldn't save the settings."}
      </small>
    </div>
    {!canEdit && <p>Only the GM (a campaign admin) can change these settings.</p>}
    <p className='ma-0 mb-3'><small>
      These settings are for this app. Everything else about the campaign, such as its
      categories, sheet layouts and who can join, is set <a className='link link-animated' href={`${archiviumUniverseUrl(campaignShortname)}/edit`}>in Archivium</a>.
    </small></p>

    <fieldset className='d-flex flex-col gap-2' disabled={!canEdit} style={{ border: '1px solid var(--tab-border-color, #4f4f4f)', borderRadius: 6 }}>
      <legend><b>Turn order in conflicts</b></legend>
      {TURN_ORDER_OPTIONS.map(option => (
        <label key={option.mode} className='d-flex gap-2' style={{ alignItems: 'baseline' }}>
          <input
            type='radio'
            name='turnOrder'
            value={option.mode}
            checked={settings.turnOrder === option.mode}
            onChange={() => change({ turnOrder: option.mode })}
          />
          <span className='d-flex flex-col gap-0'>
            <span>{option.label}</span>
            <small style={{ opacity: 0.8 }}>{option.description}</small>
          </span>
        </label>
      ))}
      <small style={{ opacity: 0.8 }}>A conflict that's already running keeps the turn order it started with.</small>
    </fieldset>

    <p className='mt-3'>
      <Link className='link link-animated' to={`/campaigns/${campaignShortname}`}>Back to the campaign</Link>
    </p>
  </>;
}
