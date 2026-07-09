import { Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import HostGame from './pages/HostGame';
import JoinPage from './pages/JoinPage';
import PlayerGame from './pages/PlayerGame';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/host" element={<HostGame />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/join/:code" element={<JoinPage />} />
      <Route path="/play" element={<PlayerGame />} />
    </Routes>
  );
}
