import { Outlet } from "react-router";

type NavbarProps = {
  user: any,
};

export default function Navbar(props: NavbarProps) {
  const { user } = props;
  
  return <>
    <nav>
      <span>Logged in as {user.username}</span>
    </nav>

    <Outlet />
  </>;
}
