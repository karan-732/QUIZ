import { useEffect, useState } from 'react';
import { socket } from '../lib/socket';

/**
 * Slim fixed banner that appears whenever the socket drops and clears itself
 * on reconnect. Mount once per page — it manages its own listeners.
 */
export default function ConnectionBanner() {
  const [offline, setOffline] = useState(!socket.connected);

  useEffect(() => {
    const onConnect = () => setOffline(false);
    const onDisconnect = () => setOffline(true);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setOffline(!socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-500/95 px-4 py-2 text-sm font-semibold text-amber-950 shadow-lg">
      <span className="inline-block h-2 w-2 rounded-full bg-amber-900 animate-pulse-dot" />
      Connection lost — reconnecting…
    </div>
  );
}
