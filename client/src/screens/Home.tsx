import { type FormEvent, useState } from 'react';
import type { RoomView } from '@battleship/shared';
import { socket } from '../socket';

interface HomeProps {
  onJoined: (token: string, view: RoomView) => void;
}

export default function Home({ onJoined }: HomeProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = () => {
    setBusy(true);
    setError(null);
    socket.emit('createRoom', (r) => {
      setBusy(false);
      if (r.ok) onJoined(r.token, r.view);
      else setError(r.error);
    });
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    socket.emit('joinRoom', { roomCode: code }, (r) => {
      setBusy(false);
      if (r.ok) onJoined(r.token, r.view);
      else setError(r.error);
    });
  };

  return (
    <div className="panel home">
      <h2>Play Battleship</h2>
      <p className="muted">Sink your friend's fleet before they sink yours.</p>
      <button className="primary block" onClick={create} disabled={busy}>
        Create a game
      </button>
      <div className="divider">or join with a code</div>
      <form onSubmit={join} className="join-row">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE"
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" disabled={busy || code.trim().length !== 4}>
          Join
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
