import { useEffect, useState } from 'react';
import { ARCHIVIUM_URL } from '../App';
import { Link } from 'react-router';

type Campaign = {
  author_id: number,
  author_permissions: { [author: number]: number },
  authors: { [author: number]: string },
  created_at: Date,
  discussion_enabled: number,
  discussion_open: number,
  followers: { [author: number]: number },
  id: number,
  is_public: number,
  obj_data: any,
  owner: string,
  shortname: string,
  sponsoring_user: any | null,
  tier: any | null,
  title: string,
  updated_at: Date,
};

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);

  useEffect(() => {
    fetch(`${ARCHIVIUM_URL}/api/universes`, { credentials: 'include' }).then(async (response) => {
      const data: Campaign[] = (await response.json()).map((campaign: any) => ({
        ...campaign,
        created_at: new Date(campaign.created_at),
        updated_at: new Date(campaign.updated_at),
        obj_data: JSON.parse(campaign.obj_data),
      }));
      setCampaigns(data.filter(c => c.obj_data.isFateCampaign));
    });
  }, []);
  
  return <>
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
