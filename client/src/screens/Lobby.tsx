import type { RoomView } from '@battleship/shared';

export default function Lobby({ view }: { view: RoomView }) {
  return (
    <div className="panel">
      <h2>Game code</h2>
      <div className="code">{view.roomCode}</div>
      <p className="muted">Share this code with a friend to start the game.</p>
      <p className="pulse">Waiting for opponent to join…</p>
    </div>
  );
}
