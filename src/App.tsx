import { LoaderCircle } from "lucide-react";
import { GameRoom } from "./components/GameRoom";
import { Lobby } from "./components/Lobby";
import { useGameRoom } from "./hooks/useGameRoom";

export default function App() {
  const gameRoom = useGameRoom();

  if (gameRoom.roomCode && (!gameRoom.room || !gameRoom.player)) {
    return <main className="loading-screen"><LoaderCircle className="spin" /><strong>正在同步任務房間…</strong></main>;
  }

  if (!gameRoom.roomCode || !gameRoom.room || !gameRoom.player) {
    return <Lobby loading={gameRoom.loading} error={gameRoom.error} onEnter={gameRoom.enterLiveRoom} onDemo={gameRoom.beginDemo} />;
  }

  return (
    <GameRoom
      roomCode={gameRoom.roomCode}
      room={gameRoom.room}
      messages={gameRoom.messages}
      player={gameRoom.player}
      isDemo={gameRoom.isDemo}
      onDifficulty={gameRoom.chooseDifficulty}
      onStart={gameRoom.start}
      onReveal={gameRoom.reveal}
      onFlag={gameRoom.flag}
      onChat={gameRoom.chat}
      onLeave={gameRoom.leave}
    />
  );
}
