import { Route, Routes } from 'react-router-dom';
import Landing from './pages/Landing';
import HostGame from './pages/HostGame';
import HostAdmin from './pages/HostAdmin';
import JoinPage from './pages/JoinPage';
import PlayerGame from './pages/PlayerGame';
import HistoryList from './pages/HistoryList';
import HistoryDetail from './pages/HistoryDetail';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/host" element={<HostGame />} />
      <Route path="/host/admin" element={<HostAdmin />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/join/:code" element={<JoinPage />} />
      <Route path="/play" element={<PlayerGame />} />
      <Route path="/history" element={<HistoryList />} />
      <Route path="/history/:id" element={<HistoryDetail />} />
    </Routes>
  );
}
