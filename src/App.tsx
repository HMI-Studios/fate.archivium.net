import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';
import Navbar from './components/Navbar';
import Campaign from './pages/Campaign';
import Home from './pages/Home';
import NewCampaign from './pages/NewCampaign';

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
    const pageQuery = new URLSearchParams();
    pageQuery.append('page', window.location.href);
    return <>
      To proceed, please go to Archivium and <a className='link link-animated' href={`${ARCHIVIUM_URL}/login?${pageQuery}`}>log in</a>.
    </>;
  }
  
  return (
    <Routes>
      <Route element={<Navbar user={user} />}>
        <Route index element={<Home />} />
        <Route path='new' element={<NewCampaign />} />
        <Route path='campaigns'>
          <Route path=':campaignShortname' element={<Campaign user={user} />} />
        </Route>
      </Route>
    </Routes>
  );
}
