import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';
import Navbar from './components/Navbar';
import Campaign from './pages/Campaign';
import CampaignSettings from './pages/CampaignSettings';
import JoinCampaign from './pages/JoinCampaign';
import Players from './pages/Players';
import JournalPage from './pages/JournalPage';
import { rememberPendingJoin } from './fate/members';
import Character from './pages/Character';
import Home from './pages/Home';
import NewCampaign from './pages/NewCampaign';
import NewItem from './pages/NewItem';
import Map from './pages/Map';
import Room from './pages/Room';
import { ThemeProvider } from './theme';

// Local test servers talk to dev Archivium (main only accepts requests from its own
// sites); the deployed app, and anything else, talks to main.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
export const ARCHIVIUM_URL = LOCAL_HOSTS.includes(window.location.hostname)
  ? 'https://dev.archivium.net'
  : 'https://archivium.net';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  // Set when Archivium couldn't be reached, so we can offer to try again instead of loading forever.
  const [failed, setFailed] = useState(false);

  const loadUser = () => {
    setLoading(true);
    setFailed(false);
    fetch(`${ARCHIVIUM_URL}/api/me`, { credentials: 'include' }).then(async (response) => {
      if (response.status >= 500) throw new Error(`Archivium responded ${response.status}`);
      const data = await response.json()
      setUser(data);
    }).catch(() => setFailed(true)).finally(() => setLoading(false));
  };

  useEffect(loadUser, []);

  if (failed) return <div className='d-flex flex-col gap-2 my-1 mx-4'>
    <h1 className='mb-0'>Fate on Archivium</h1>
    <p className='ma-0'>Couldn't reach Archivium to check whether you're signed in. It may be down, or your connection may have dropped.</p>
    <div><button onClick={loadUser}>Try again</button></div>
  </div>;

  if (loading) return <>
    <div style={{height: 'calc(50vh + 25px)'}} className='w-100 d-flex justify-center align-end'>
      <div className='loader' />
    </div>
  </>;

  if (!user) {
    const joining = rememberPendingJoin();
    // Archivium's login and sign-up pages send you back to `page` afterwards.
    const pageQuery = new URLSearchParams();
    pageQuery.append('page', window.location.href);
    return <div className='d-flex flex-col gap-2 my-1 mx-4'>
      <h1 className='mb-0'>Fate on Archivium</h1>
      {joining && <p className='ma-0'>
        You've been sent a link to join the campaign <b>{joining}</b>. Log in, or create an
        account if you don't have one yet, and you'll be brought back here to join.
      </p>}
      <p className='ma-0'>This app uses your Archivium account, and brings you back here once you're signed in.</p>
      <div className='d-flex gap-3 flex-wrap'>
        <a className='link link-animated' href={`${ARCHIVIUM_URL}/login?${pageQuery}`}>Log in</a>
        <a className='link link-animated' href={`${ARCHIVIUM_URL}/signup?${pageQuery}`}>Create an account</a>
      </div>
    </div>;
  }
  
  return (
    <ThemeProvider user={user}>
      <Routes>
        {/* The game room and maps fill the window, with their own top bar. */}
        <Route path='campaigns/:campaignShortname/play' element={<Room user={user} />} />
        <Route path='campaigns/:campaignShortname/maps/:mapShortname' element={<Map user={user} />} />
        <Route element={<Navbar user={user} />}>
          <Route index element={<Home user={user} />} />
          <Route path='new' element={<NewCampaign />} />
          <Route path='campaigns'>
            <Route path=':campaignShortname' element={<Campaign user={user} />} />
            <Route path=':campaignShortname/settings' element={<CampaignSettings user={user} />} />
            <Route path=':campaignShortname/players' element={<Players user={user} />} />
            <Route path=':campaignShortname/journal' element={<JournalPage user={user} />} />
            <Route path=':campaignShortname/join' element={<JoinCampaign user={user} />} />
            <Route path=':campaignShortname/items/new' element={<NewItem />} />
            <Route path=':campaignShortname/characters/:characterShortname' element={<Character />} />
            <Route path=':campaignShortname/maps/new' element={<NewItem fixedType='location' />} />
          </Route>
        </Route>
      </Routes>
    </ThemeProvider>
  );
}
