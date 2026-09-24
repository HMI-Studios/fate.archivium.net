import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';
import Navbar from './components/Navbar';
import Campaign from './pages/Campaign';
import CampaignSettings from './pages/CampaignSettings';
import JoinCampaign from './pages/JoinCampaign';
import Players from './pages/Players';
import Character from './pages/Character';
import Home from './pages/Home';
import NewCampaign from './pages/NewCampaign';
import NewItem from './pages/NewItem';
import Map from './pages/Map';
import Room from './pages/Room';

export const ARCHIVIUM_URL = 'https://dev.archivium.net';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`${ARCHIVIUM_URL}/api/me`, { credentials: 'include' }).then(async (response) => {
      const data = await response.json()
      setUser(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;

  if (!user) {
    // Archivium's login and sign-up pages send you back to `page` afterwards.
    const pageQuery = new URLSearchParams();
    pageQuery.append('page', window.location.href);
    return <div className='d-flex flex-col gap-2'>
      <h1 className='mb-0'>Fate on Archivium</h1>
      <p className='ma-0'>This app uses your Archivium account, and brings you back here once you're signed in.</p>
      <div className='d-flex gap-3 flex-wrap'>
        <a className='link link-animated' href={`${ARCHIVIUM_URL}/login?${pageQuery}`}>Log in</a>
        <a className='link link-animated' href={`${ARCHIVIUM_URL}/signup?${pageQuery}`}>Create an account</a>
      </div>
    </div>;
  }
  
  return (
    <Routes>
      <Route element={<Navbar user={user} />}>
        <Route index element={<Home />} />
        <Route path='new' element={<NewCampaign />} />
        <Route path='campaigns'>
          <Route path=':campaignShortname' element={<Campaign user={user} />} />
          <Route path=':campaignShortname/play' element={<Room user={user} />} />
          <Route path=':campaignShortname/settings' element={<CampaignSettings user={user} />} />
          <Route path=':campaignShortname/players' element={<Players user={user} />} />
          <Route path=':campaignShortname/join' element={<JoinCampaign user={user} />} />
          <Route path=':campaignShortname/items/new' element={<NewItem />} />
          <Route path=':campaignShortname/characters/:characterShortname' element={<Character />} />
          <Route path=':campaignShortname/maps'>
            <Route path='new' element={<NewItem fixedType='location' />} />
            <Route path=':mapShortname' element={<Map user={user} />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
