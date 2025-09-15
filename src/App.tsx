import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';
import Navbar from './components/Navbar';
import Home from './pages/Home';

const ArchiviumURL = 'https://dev.archivium.net';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`${ArchiviumURL}/api/me`, { credentials: 'include' }).then(async (response) => {
      const data = await response.json()
      setUser(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <>
    <p>Loading, please wait...</p>
  </>;

  if (!user) {
    const pageQuery = new URLSearchParams();
    pageQuery.append('page', window.location.href);
    return <>
      To proceed, please go to Archivium and <a href={`${ArchiviumURL}/login?${pageQuery}`}>log in</a>.
    </>;
  }
  
  return (
    <Routes>
      <Route path='/' element={<Navbar user={user} />}>
        <Route index element={<Home />} />
      </Route>
    </Routes>
  );
}
