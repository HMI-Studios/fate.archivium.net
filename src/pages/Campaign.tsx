import { useEffect, useState } from 'react';
import { ARCHIVIUM_URL } from '../App';
import { Link, useParams } from 'react-router';

export type Campaign = {
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

export default function Campaign(props) {
  const { user } = props;
  const { campaignShortname } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [items, setItems] = useState<any | null>(null);

  useEffect(() => {
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' }).then(async (response) => {
      const responseData = await response.json();
      const data: Campaign = {
        ...responseData,
        created_at: new Date(responseData.created_at),
        updated_at: new Date(responseData.updated_at),
      };

      const itemsResponse = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items`, { credentials: 'include' });
      const itemsData = (await itemsResponse.json()).map((item: any) => ({
        ...item,
        created_at: new Date(item.created_at),
        updated_at: new Date(item.updated_at),
      }));
      setItems(itemsData);

      setCampaign(data);
    });
  }, []);

  if (!campaign) return <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;
  
  return <>
    <h1>{campaign.title}</h1>

    <h2>Characters</h2>
    <Link className='link link-animated ml-2' to={`/campaigns/${campaign.shortname}/maps/new`}>New Character</Link>
    <ul>
      {items.filter(item => item.item_type === 'pc').map(item => (<li key={item.shortname}>
        <Link className='link link-animated' to={`/campaigns/${campaign.shortname}/characters/${item.shortname}`}>{item.title}</Link>
      </li>))}
    </ul>

    <h2>Maps</h2>
    {campaign.author_permissions[user.id] >= 3 && <Link className='link link-animated ml-2' to={`/campaigns/${campaign.shortname}/maps/new`}>New Map</Link>}
    <ul>
      {items.filter(item => item.item_type === 'location').map(item => (<li key={item.shortname}>
        <Link className='link link-animated' to={`/campaigns/${campaign.shortname}/maps/${item.shortname}`}>{item.title}</Link>
      </li>))}
    </ul>
  </>;
}
