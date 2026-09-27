import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import Breadcrumbs, { archiviumItemUrl } from '../components/Breadcrumbs';
import Journal from '../components/Journal';
import { JOURNAL_ITEM } from '../fate/journal';
import { useTable } from '../fate/table';
import type { Campaign } from './Campaign';

interface Props {
  user: any;
}

function CampaignJournal({ campaign, userName }: { campaign: string, userName?: string }) {
  const table = useTable(campaign);
  return <Journal campaign={campaign} table={table} userName={userName} rows={24} toolbar />;
}

export default function JournalPage({ user }: Props) {
  const { campaignShortname } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) throw new Error(`Could not load the campaign (${response.status}).`);
      setCampaign(await response.json());
    }).catch(err => setError(err.message));
  }, [campaignShortname]);

  if (!campaignShortname) return <>No campaign specified!</>;
  if (!campaign) return error ? <span className='color-error'>{error}</span> : <div className='loader ml-2' />;

  return <>
    <Breadcrumbs campaign={campaignShortname} current='Journal' />
    <h1 className='mb-1'>Journal</h1>
    <p className='ma-0 mb-2'>
      Quests, clues and anything else worth remembering; everyone at the table can write here, and it's also
      in the game room's dice drawer. <a className='link link-animated' href={archiviumItemUrl(campaignShortname, JOURNAL_ITEM)}>Open in Archivium</a>
    </p>
    <CampaignJournal campaign={campaignShortname} userName={user?.username} />
  </>;
}
