import { useEffect, useState, type FormEvent } from 'react';
import { ARCHIVIUM_URL } from '../App';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import Breadcrumbs from '../components/Breadcrumbs';
import { withDefaultTabs } from '../layout/typeConfig';
import { toShortname } from '../util';
import type { Campaign } from './Campaign';

type NewItem = {
  title: string,
  shortname: string,
  item_type: string,
  obj_data: any,
};

interface Props {
  fixedType?: string;
}

export default function NewItem({ fixedType }: Props) {
  const navigate = useNavigate();
  const { campaignShortname } = useParams();
  const [searchParams] = useSearchParams();
  const itemType = fixedType ?? searchParams.get('type') ?? '';

  const [error, setError] = useState<string | null>(null);
  // Like Archivium, the shortname follows the title until it's edited by hand.
  const [editedShortname, setEditedShortname] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [newItem, setNewItem] = useState<NewItem>({
    title: '',
    shortname: '',
    item_type: itemType,
    obj_data: {},
  });

  useEffect(() => {
    fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}`, { credentials: 'include' }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      setCampaign({
        ...data,
        created_at: new Date(data.created_at),
        updated_at: new Date(data.updated_at),
      });
    });
  }, [campaignShortname]);

  async function postItem(e: FormEvent) {
    e.preventDefault();

    if (!newItem.item_type) {
      setError('Please choose a category.');
      return;
    }

    // Start with the tabs the campaign configures for this type, as Archivium's own form does.
    const objData = withDefaultTabs(newItem.obj_data, campaign?.obj_data, newItem.item_type);

    const response = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...newItem, obj_data: objData }),
    });

    if (!response.ok) {
      setError(await response.json());
      return;
    }

    if (newItem.item_type === 'location') {
      const mapResponse = await fetch(`${ARCHIVIUM_URL}/api/universes/${campaignShortname}/items/${newItem.shortname}`, {
        credentials: 'include',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newItem.title,
          // This save replaces obj_data, so it has to carry the new item's tabs too.
          obj_data: objData,
          map: { id: null, width: 1000, height: 1000, image_id: null, locations: [] },
        }),
      });

      if (!mapResponse.ok) {
        setError(await mapResponse.json());
        return;
      }

      navigate(`/campaigns/${campaignShortname}/maps/${newItem.shortname}`);
      return;
    }

    navigate(`/campaigns/${campaignShortname}`);
  }

  return <>
    <Breadcrumbs campaign={campaignShortname} current={fixedType === 'location' ? 'New map' : 'New item'} />
    <h1>New {fixedType === 'location' ? 'Map' : 'Item'}</h1>
    <form onSubmit={postItem}>
      <div className='inputGroup'>
        <input value={newItem.title} onChange={({ target }) => setNewItem({ ...newItem, title: target.value, ...(editedShortname ? {} : { shortname: toShortname(target.value) }) })} placeholder='Title' />
      </div>
      <div className='inputGroup'>
        <input value={newItem.shortname} onChange={({ target }) => { setEditedShortname(true); setNewItem({ ...newItem, shortname: target.value }); }} placeholder='Shortname' />
      </div>
      {!fixedType && <div className='inputGroup'>
        <select value={newItem.item_type} onChange={({ target }) => setNewItem({ ...newItem, item_type: target.value })}>
          <option value='' disabled>Select a category</option>
          {campaign && Object.entries(campaign.obj_data.cats).map(([key, cat]: [string, any]) => (
            <option key={key} value={key}>{cat[0]}</option>
          ))}
        </select>
      </div>}
      <div className='d-flex align-center gap-3'>
        <input type='submit' />
        <Link className='link link-animated' to={`/campaigns/${campaignShortname}`}>Cancel</Link>
      </div>
      {error && <div>
        <span className='color-error'>{error}</span>
      </div>}
    </form>
  </>;
}
