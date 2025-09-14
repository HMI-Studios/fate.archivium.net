import { Route, Routes } from 'react-router';

export type AppProps = {
};

export default function App(props: AppProps) {
  
  return (
    <Routes>
      <Route path='/' element={<p>test</p>}>
      </Route>
    </Routes>
  );
}
