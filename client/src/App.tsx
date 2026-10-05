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

  const leftRoom = useRef<string | null>(null);
  useEffect(() => {
    const onState = (v: RoomView) => {
      if (v.roomCode !== leftRoom.current) setView(v);
    };
    socket.on('state', onState);
    return () => {
      socket.off('state', onState);
    };
  }, []);

  // Socket.IO reconnects with a fresh socket the server doesn't know; reclaim the seat.
  const connectedBefore = useRef(socket.connected);
  useEffect(() => {
    const onConnect = () => {
      if (!connectedBefore.current) {
        connectedBefore.current = true;
        return;
      }
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return;
      socket.timeout(5000).emit('resume', { token }, (err, r) => {
        if (err) return;
        if (r.ok) return setView(r.view);
        localStorage.removeItem(TOKEN_KEY);
        setView(null);
        setNotice('Your game is no longer available.');
      });
    };
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
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
    leftRoom.current = view?.roomCode ?? null;
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
          leftRoom.current = null;
          setNotice(null);
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
