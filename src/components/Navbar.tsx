import { Outlet } from 'react-router';

type NavbarProps = {
  user: any,
};

export default function Navbar(props: NavbarProps) {
  const { user } = props;
  
  return <>
    <header>
      <nav className='navbar mb-0'>
        <ul className='navbarBtns shrink-1 scroll-x'></ul>
        <ul className='navbarBtns'>
          <li className='navbarBtn'>
            <span className='navbarBtnLink navbarText'>Logged in as {user.username}</span>
          </li>
        </ul>
      </nav>
    </header>

    <main>
      <div className='page'>
        <Outlet />
      </div>
    </main>
  </>;
}
