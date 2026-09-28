import { useEffect, useState } from 'react';
import type { RoomView } from '@battleship/shared';
import { socket, TOKEN_KEY } from './socket';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Placement from './screens/Placement';
import Battle from './screens/Battle';

export default function App() {
  const [view, setView] = useState<RoomView | null>(null);
  const [resuming, setResuming] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  useEffect(() => {
    socket.on('state', setView);
    return () => {
      socket.off('state', setView);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    socket.emit('resume', { token }, (r) => {
      setResuming(false);
      if (r.ok) setView(r.view);
      else localStorage.removeItem(TOKEN_KEY);
    });
  }, []);

  const leave = () => {
    localStorage.removeItem(TOKEN_KEY);
    setView(null);
    socket.disconnect();
    socket.connect();
  };

  const content = resuming ? (
    <p className="muted">Reconnecting…</p>
  ) : !view ? (
    <Home
      onJoined={(token, v) => {
        localStorage.setItem(TOKEN_KEY, token);
        setView(v);
      }}
    />
  ) : view.phase === 'waiting' ? (
    <Lobby view={view} />
  ) : view.phase === 'placing' ? (
    <Placement view={view} />
  ) : (
    <Battle view={view} />
  );

  return (
    <div className="app">
      <header>
        <h1>Battleship</h1>
        {view && (
          <button className="ghost" onClick={leave}>
            Leave game
          </button>
        )}
      </header>
      <main>{content}</main>
    </div>
  );
}
