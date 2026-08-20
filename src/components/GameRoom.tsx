import { useEffect, useRef, useState } from "react";
import { Bomb, Check, Copy, DoorOpen, Flag, HeartPulse, MessageCircle, Radio, RotateCcw, ShieldCheck, Timer, Users } from "lucide-react";
import { countFlags, DIFFICULTIES } from "../gameEngine";
import type { ChatMessage, Difficulty, PlayerIdentity, RoomData } from "../types";
import { ChatPanel } from "./ChatPanel";

interface GameRoomProps {
  roomCode: string;
  room: RoomData;
  messages: ChatMessage[];
  player: PlayerIdentity;
  isDemo: boolean;
  onDifficulty: (difficulty: Difficulty) => Promise<void> | void;
  onStart: () => Promise<void> | void;
  onReveal: (index: number) => Promise<void> | void;
  onFlag: (index: number) => Promise<void> | void;
  onChat: (text: string) => Promise<void> | void;
  onLeave: () => Promise<void> | void;
}

function formatElapsed(startedAt: number | null, endedAt: number | null, now: number) {
  if (!startedAt) return "00:00";
  const seconds = Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function statusText(status: RoomData["game"]["status"]) {
  return ({ waiting: "等待隊長部署", ready: "任務就緒", playing: "拆雷進行中", won: "任務完成", lost: "任務失敗" })[status];
}

export function GameRoom({ roomCode, room, messages, player, isDemo, onDifficulty, onStart, onReveal, onFlag, onChat, onLeave }: GameRoomProps) {
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const game = room.game;
  const members = Object.values(room.members ?? {}).sort((a, b) => a.joinedAt - b.joinedAt);
  const onlineCount = members.filter((member) => member.online).length;
  const isHost = room.meta.hostUid === player.uid;
  const flags = countFlags(game);
  const remainingMines = Math.max(0, game.mineCount - flags);

  useEffect(() => {
    if (game.status !== "playing") return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [game.status]);

  const copyInvite = async () => {
    const url = new URL(window.location.href);
    if (!isDemo) url.searchParams.set("room", roomCode);
    await navigator.clipboard.writeText(isDemo ? `示範房間 ${roomCode}` : url.toString());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const startLongPress = (index: number) => {
    longPressed.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      void onFlag(index);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 500);
  };

  const finishPress = (index: number) => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    if (!longPressed.current) void onReveal(index);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL} onClick={(event) => { event.preventDefault(); void onLeave(); }}>
          <span className="brand-mark"><Bomb size={20} /></span><span>拆雷小隊</span>
        </a>
        {isDemo && <span className="demo-badge">本機示範</span>}
        <button className="room-pill" type="button" onClick={copyInvite}>{copied ? <Check size={14} /> : <Copy size={14} />} 房間 {roomCode}</button>
        <div className="online"><span /> {onlineCount} 人在線</div>
        <button className="leave-button" type="button" onClick={() => void onLeave()} aria-label="離開房間"><DoorOpen size={18} /></button>
      </header>

      <section className="game-layout">
        <div className="game-column">
          <div className="mission-heading">
            <div><p className="eyebrow"><span /> {statusText(game.status)}</p><h1>{DIFFICULTIES[game.difficulty].label}任務</h1></div>
            <div className="member-summary"><Users size={16} /> {members.map((member) => member.nickname).join("、")}</div>
          </div>

          {game.status === "waiting" && (
            <div className="mission-setup">
              <div><strong>選擇任務難度</strong><small>{isHost ? "所有隊員都會使用同一張棋盤。" : "等待隊長選擇難度並開始。"}</small></div>
              <div className="inline-difficulties">
                {(Object.entries(DIFFICULTIES) as [Difficulty, (typeof DIFFICULTIES)[Difficulty]][]).map(([key, config]) => (
                  <button disabled={!isHost} className={room.meta.difficulty === key ? "selected" : ""} key={key} type="button" onClick={() => void onDifficulty(key)}><strong>{config.label}</strong><span>{config.rows}×{config.cols}</span></button>
                ))}
              </div>
              {isHost && <button className="deploy-button" type="button" onClick={() => void onStart()}>開始任務 <Radio size={16} /></button>}
            </div>
          )}

          <div className="status-strip">
            <div><span>共享生命</span><strong>{game.lives}</strong><small><HeartPulse size={14} /> HP</small></div>
            <div><span>剩餘地雷</span><strong>{remainingMines.toString().padStart(2, "0")}</strong><small><Flag size={13} /></small></div>
            <div><span>任務時間</span><strong>{formatElapsed(game.startedAt, game.endedAt, now)}</strong><small><Timer size={13} /></small></div>
            {isHost && game.status !== "waiting" && <button type="button" onClick={() => void onStart()}><RotateCcw size={15} /> 重新部署</button>}
          </div>

          <div className={`board-wrap status-${game.status}`}>
            <div className={`board board-${game.cols}`} role="grid" aria-label={`${DIFFICULTIES[game.difficulty].label}踩地雷棋盤`} style={{ gridTemplateColumns: `repeat(${game.cols}, var(--cell))` }}>
              {game.cells.map((cell, index) => {
                const interactive = ["ready", "playing"].includes(game.status);
                const row = Math.floor(index / game.cols) + 1;
                const col = index % game.cols + 1;
                return (
                  <button
                    className={`cell ${cell.state}`}
                    key={index}
                    type="button"
                    role="gridcell"
                    disabled={!interactive}
                    aria-label={`第 ${row} 列第 ${col} 格，${cell.state === "flagged" ? "已插旗" : cell.state === "hidden" ? "未翻開" : cell.isMine ? "地雷" : `${cell.adjacent} 顆相鄰地雷`}`}
                    onContextMenu={(event) => { event.preventDefault(); if (interactive) void onFlag(index); }}
                    onPointerDown={(event) => interactive && event.button === 0 && startLongPress(index)}
                    onPointerUp={(event) => interactive && event.button === 0 && finishPress(index)}
                    onPointerLeave={() => { if (longPressTimer.current) window.clearTimeout(longPressTimer.current); }}
                    onKeyDown={(event) => {
                      if (!interactive) return;
                      if (event.key.toLowerCase() === "f") { event.preventDefault(); void onFlag(index); }
                    }}
                  >
                    {cell.state === "flagged" && <Flag size={Math.max(12, game.cols > 16 ? 14 : 18)} fill="currentColor" />}
                    {["detonated", "revealed"].includes(cell.state) && cell.isMine && <Bomb size={Math.max(12, game.cols > 16 ? 14 : 18)} />}
                    {cell.state === "open" && cell.adjacent > 0 && <span data-number={cell.adjacent}>{cell.adjacent}</span>}
                  </button>
                );
              })}
            </div>

            {game.status === "waiting" && <div className="board-overlay"><Radio size={28} /><strong>等待任務部署</strong><span>隊長開始後即可共同拆雷</span></div>}
            {game.status === "won" && <div className="board-overlay result won"><ShieldCheck size={34} /><strong>任務完成</strong><span>所有安全區域都已排除</span></div>}
            {game.status === "lost" && <div className="board-overlay result lost"><Bomb size={34} /><strong>生命耗盡</strong><span>重新部署，再試一次</span></div>}
            <div className="board-note"><ShieldCheck size={16} /> 首次點擊保證安全 · 右鍵或長按格子可插旗</div>
          </div>
        </div>

        <button className="mobile-chat-button" type="button" onClick={() => setChatOpen(true)}><MessageCircle size={18} /> 小隊通訊 {messages.length > 0 && <span>{Math.min(messages.length, 99)}</span>}</button>
        <ChatPanel messages={messages} members={members} hostUid={room.meta.hostUid} player={player} open={chatOpen} onClose={() => setChatOpen(false)} onSend={onChat} />
      </section>
    </main>
  );
}
