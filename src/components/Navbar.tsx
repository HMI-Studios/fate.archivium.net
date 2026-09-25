import { Link, Outlet } from 'react-router';
import { ARCHIVIUM_URL } from '../App';
import { useTheme } from '../theme';

type NavbarProps = {
  user: any,
};

export default function Navbar(props: NavbarProps) {
  const { user } = props;
  const theme = useTheme();
  
  return <>
    <header>
      <nav className='navbar mb-0'>
        <ul className='navbarBtns shrink-1 scroll-x'>
          <li className='navbarBtn'>
            <Link className='navbarBtnLink navbarText' to='/'>Campaigns</Link>
          </li>
          <li className='navbarBtn'>
            <a className='navbarBtnLink navbarText' href={ARCHIVIUM_URL}>Archivium</a>
          </li>
        </ul>
        <ul className='navbarBtns'>
          <li className='navbarBtn'>
            <span className='navbarBtnLink navbarText'>Logged in as {user.username}</span>
          </li>
        </ul>
      </nav>
    </header>

    <main>
      <div className='page'>
        {/* As in Archivium's layout, glass themes put the page on a frosted pane. */}
        <div className={theme.glass ? 'glass-pane' : undefined}>
          <Outlet />
        </div>
      </div>
    </main>
  </>;
}
