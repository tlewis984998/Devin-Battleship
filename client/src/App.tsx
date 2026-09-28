import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '@battleship/shared';
import { socket, TOKEN_KEY } from './socket';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Placement from './screens/Placement';
import Battle from './screens/Battle';

export default function App() {
  const [view, setView] = useState<RoomView | null>(null);
  const [resuming, setResuming] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    socket.on('state', setView);
    return () => {
      socket.off('state', setView);
    };
  }, []);

  const resumeAttempted = useRef(false);
  useEffect(() => {
    if (resumeAttempted.current) return;
    resumeAttempted.current = true;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    socket.timeout(5000).emit('resume', { token }, (err, r) => {
      setResuming(false);
      if (err) {
        setNotice('Could not reach the server. Please try again.');
        return;
      }
      if (r.ok) setView(r.view);
      else localStorage.removeItem(TOKEN_KEY);
    });
  }, []);

  const leave = () => {
    socket.emit('leaveRoom', () => {});
    localStorage.removeItem(TOKEN_KEY);
    setView(null);
  };

  const content = resuming ? (
    <p className="muted">Reconnecting…</p>
  ) : !view ? (
    <>
      {notice && <p className="error">{notice}</p>}
      <Home
        onJoined={(token, v) => {
          localStorage.setItem(TOKEN_KEY, token);
          setView(v);
        }}
      />
    </>
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
