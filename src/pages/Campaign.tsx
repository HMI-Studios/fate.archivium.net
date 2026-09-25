import { useEffect, useState } from 'react';
import { ARCHIVIUM_URL } from '../App';
import { Link, useParams, useSearchParams } from 'react-router';
import Breadcrumbs, { archiviumUniverseUrl } from '../components/Breadcrumbs';
import CampaignStunts from '../components/CampaignStunts';
import { isGameMaster, PERMS } from '../perms';

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

type Tab = {
  key: string,
  label: string,
  itemType?: string,
  itemPath?: (campaign: string, item: string) => string,
  newLabel?: string,
  newPath?: (campaign: string) => string,
};

const characterPath = (campaign: string, item: string) => `/campaigns/${campaign}/characters/${item}`;
const newItemPath = (type: string) => (campaign: string) => `/campaigns/${campaign}/items/new?type=${type}`;

// The campaign page's tabs, in order; the first is shown by default.
const tabs: Tab[] = [
  { key: 'characters', label: 'Characters', itemType: 'pc', itemPath: characterPath, newLabel: 'New Character', newPath: newItemPath('pc') },
  { key: 'npcs', label: 'NPCs', itemType: 'npc', itemPath: characterPath, newLabel: 'New NPC', newPath: newItemPath('npc') },
  { key: 'monsters', label: 'Monsters', itemType: 'monster', itemPath: characterPath, newLabel: 'New Monster', newPath: newItemPath('monster') },
  { key: 'maps', label: 'Maps', itemType: 'location', itemPath: (campaign, item) => `/campaigns/${campaign}/maps/${item}`, newLabel: 'New Map', newPath: campaign => `/campaigns/${campaign}/maps/new` },
  { key: 'stunts', label: 'Stunts' },
];

export default function Campaign(props) {
  const { user } = props;
  const { campaignShortname } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [items, setItems] = useState<any | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

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

  const selectedTab = tabs.find(tab => tab.key === searchParams.get('tab')) ?? tabs[0];
  // Like Archivium, the open tab is kept in the address, so reloading stays on it.
  const selectTab = (key: string) => setSearchParams(params => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    return next;
  }, { replace: true });

  if (!campaign) return <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;
  
  const canWrite = (campaign.author_permissions[user.id] ?? 0) >= PERMS.WRITE;

  return <>
    <Breadcrumbs campaign={campaign.shortname} />
    <h1>{campaign.title}</h1>
    <div className='d-flex gap-3 flex-wrap'>
      <Link className='link link-animated' to={`/campaigns/${campaign.shortname}/play`}>Enter the game room</Link>
      <Link className='link link-animated' to={`/campaigns/${campaign.shortname}/journal`}>Journal</Link>
      <Link className='link link-animated' to={`/campaigns/${campaign.shortname}/players`}>Players</Link>
      {isGameMaster(campaign, user) && <Link className='link link-animated' to={`/campaigns/${campaign.shortname}/settings`}>Settings</Link>}
      <a className='link link-animated' href={archiviumUniverseUrl(campaign.shortname)}>Open in Archivium</a>
    </div>

    <ul className='navbarBtns gap-1 mt-3 mb-2 scroll-x' role='tablist'>
      {tabs.map(tab => (
        <li
          key={tab.key}
          className={`navbarBtn${tab.key === selectedTab.key ? ' selected' : ''}`}
          role='tab'
          aria-selected={tab.key === selectedTab.key}
          tabIndex={0}
          onClick={() => selectTab(tab.key)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTab(tab.key); } }}
        >
          <h3 className='navbarBtnLink navbarText ma-0'>{tab.label}</h3>
        </li>
      ))}
    </ul>

    <div role='tabpanel'>
      {selectedTab.key === 'stunts'
        ? <CampaignStunts campaign={campaign.shortname} universeObjData={campaign.obj_data} canCreate={canWrite} />
        : <>
          {selectedTab.newLabel && (selectedTab.key !== 'maps' || canWrite) && (
            <Link className='link link-animated ml-2' to={selectedTab.newPath!(campaign.shortname)}>{selectedTab.newLabel}</Link>
          )}
          <ul>
            {items.filter(item => item.item_type === selectedTab.itemType).map(item => (<li key={item.shortname}>
              <Link className='link link-animated' to={selectedTab.itemPath!(campaign.shortname, item.shortname)}>{item.title}</Link>
            </li>))}
          </ul>
        </>}
    </div>
  </>;
}
