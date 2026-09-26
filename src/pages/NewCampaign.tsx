import { useState, type FormEvent } from 'react';
import { ARCHIVIUM_URL } from '../App';
import { Link, useNavigate } from 'react-router';
import Breadcrumbs from '../components/Breadcrumbs';
import { FATE_UNIVERSE_DATA } from '../fate/universeData';
import { FATE_SCHEMA_KEY, initialSchemaRecord } from '../fate/schema';
import { toShortname } from '../util';

type NewCampaign = {
  title: string,
  shortname: string,
  is_public: boolean,
  discussion_enabled: boolean,
  discussion_open: boolean,
  obj_data: any,
};

export default function NewCampaign() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // Like Archivium, the shortname follows the title until it's edited by hand.
  const [editedShortname, setEditedShortname] = useState(false);
  const [newCampaign, setNewCampaign] = useState<NewCampaign>({
    title: '',
    shortname: '',
    is_public: false,
    discussion_enabled: false,
    discussion_open: false,
    obj_data: {
      isFateCampaign: true,
      // Character and scene sheet layouts for Archivium to render; see fate/universeData.ts.
      ...FATE_UNIVERSE_DATA,
      // Which version of those layouts it has, for upgrading it later (fate/schema.ts).
      [FATE_SCHEMA_KEY]: initialSchemaRecord(),
      cats: {
        npc: [
          "NPC",
          "NPCs",
          "#e82c17"
        ],
        location: [
          "location",
          "locations",
          "#1a9e00"
        ],
        event: [
          "event",
          "events",
          "#9eabae"
        ],
        plotline: [
          "plotline",
          "plotlines",
          "#69d0fc"
        ],
        monster: [
          "monster",
          "monsters",
          "#ba40f2"
        ],
        item: [
          "item",
          "items",
          "#ffc107"
        ],
        pc: [
          "PC",
          "PCs",
          "#deddca"
        ],
        stunt: [
          "stunt",
          "stunts",
          "#6e89d8"
        ],
        scenario: [
          "scenario",
          "scenarios",
          "#707070"
        ],
        note: [
          "note",
          "notes",
          "#f1f0e9"
        ]
      }
    },
  });

  async function postCampaign(e: FormEvent) {
    e.preventDefault();

    const response = await fetch(`${ARCHIVIUM_URL}/api/universes`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newCampaign),
    });

    if (!response.ok) {
      setError(await response.json());
    }

    navigate('/');
  }
  
  return <>
    <Breadcrumbs current='New campaign' />
    <h1>New Campaign</h1>
    <form onSubmit={postCampaign}>
      <div className='inputGroup'>
        <input value={newCampaign.title} onChange={({ target }) => setNewCampaign({ ...newCampaign, title: target.value, ...(editedShortname ? {} : { shortname: toShortname(target.value) }) })} placeholder='Title' />
      </div>
      <div className='inputGroup'>
        <input value={newCampaign.shortname} onChange={({ target }) => { setEditedShortname(true); setNewCampaign({ ...newCampaign, shortname: target.value }); }} placeholder='Shortname' />
      </div>
      <div className='d-flex align-center gap-3'>
        <input type='submit' />
        <Link className='link link-animated' to='/'>Cancel</Link>
      </div>
      {error && <div>
        <span className='color-error'>{error}</span>
      </div>}
    </form>
  </>;
}
