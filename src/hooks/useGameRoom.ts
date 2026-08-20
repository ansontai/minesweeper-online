import { useCallback, useEffect, useMemo, useState } from "react";
import { createGame, revealCell, toggleFlag } from "../gameEngine";
import {
  authenticatePlayer,
  claimHostIfNeeded,
  createRoom,
  flagRoomCell,
  joinRoom,
  markPlayerOffline,
  revealRoomCell,
  sendMessage,
  setRoomDifficulty,
  startRound,
  subscribeToMessages,
  subscribeToRoom,
} from "../roomService";
import type { ChatMessage, Difficulty, PlayerIdentity, RoomData } from "../types";

function demoRoom(player: PlayerIdentity, difficulty: Difficulty): RoomData {
  const now = Date.now();
  return {
    meta: {
      hostUid: player.uid,
      difficulty,
      status: "waiting",
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
    },
    members: {
      [player.uid]: { ...player, joinedAt: now, online: true, lastSeen: now },
    },
    game: createGame(difficulty, "waiting"),
  };
}

export function useGameRoom() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [player, setPlayer] = useState<PlayerIdentity | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode || isDemo || !player) return;
    const stopRoom = subscribeToRoom(roomCode, (nextRoom) => {
      setRoom(nextRoom);
      if (nextRoom) void claimHostIfNeeded(roomCode, player.uid);
    });
    const stopMessages = subscribeToMessages(roomCode, setMessages);
    return () => {
      stopRoom();
      stopMessages();
    };
  }, [roomCode, isDemo, player]);

  useEffect(() => {
    const leave = () => {
      if (roomCode && player && !isDemo) void markPlayerOffline(roomCode, player.uid);
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [isDemo, player, roomCode]);

  const enterLiveRoom = useCallback(async (
    action: "create" | "join",
    nickname: string,
    difficulty: Difficulty,
    requestedCode?: string,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const identity = await authenticatePlayer(nickname);
      const code = action === "create"
        ? await createRoom(identity, difficulty)
        : await joinRoom(requestedCode ?? "", identity);
      setPlayer(identity);
      setRoomCode(code);
      setIsDemo(false);
      localStorage.setItem("minesweeper-nickname", identity.nickname);
      const url = new URL(window.location.href);
      url.searchParams.set("room", code);
      window.history.replaceState({}, "", url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法進入房間。");
    } finally {
      setLoading(false);
    }
  }, []);

  const beginDemo = useCallback((nickname: string, difficulty: Difficulty) => {
    const identity = { uid: "demo-host", nickname: nickname.trim().slice(0, 20) || "拆雷員" };
    setPlayer(identity);
    setRoomCode("DEMO01");
    setRoom(demoRoom(identity, difficulty));
    setMessages([]);
    setIsDemo(true);
    setError(null);
    localStorage.setItem("minesweeper-nickname", identity.nickname);
  }, []);

  const chooseDifficulty = useCallback(async (difficulty: Difficulty) => {
    if (!roomCode || !player) return;
    if (isDemo) {
      setRoom((current) => current ? {
        ...current,
        meta: { ...current.meta, difficulty },
        game: createGame(difficulty, "waiting", current.game.revision + 1),
      } : current);
      return;
    }
    await setRoomDifficulty(roomCode, difficulty, player);
  }, [isDemo, player, roomCode]);

  const start = useCallback(async () => {
    if (!roomCode || !player || !room) return;
    if (isDemo) {
      setRoom((current) => current ? {
        ...current,
        meta: { ...current.meta, status: "ready" },
        game: {
          ...createGame(current.meta.difficulty, "ready", current.game.revision + 1),
          lastAction: { type: current.game.status === "waiting" ? "start" : "reset", actorUid: player.uid, at: Date.now() },
        },
      } : current);
      return;
    }
    await startRound(roomCode, room.meta.difficulty, player);
  }, [isDemo, player, room, roomCode]);

  const reveal = useCallback(async (index: number) => {
    if (!roomCode || !player) return;
    if (isDemo) {
      setRoom((current) => current ? (() => {
        const game = revealCell(current.game, index, player.uid);
        return { ...current, meta: { ...current.meta, status: game.status }, game };
      })() : current);
      return;
    }
    await revealRoomCell(roomCode, index, player);
  }, [isDemo, player, roomCode]);

  const flag = useCallback(async (index: number) => {
    if (!roomCode || !player) return;
    if (isDemo) {
      setRoom((current) => current ? { ...current, game: toggleFlag(current.game, index, player.uid) } : current);
      return;
    }
    await flagRoomCell(roomCode, index, player);
  }, [isDemo, player, roomCode]);

  const chat = useCallback(async (text: string) => {
    if (!roomCode || !player || !text.trim()) return;
    if (isDemo) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        uid: player.uid,
        nickname: player.nickname,
        text: text.trim().slice(0, 300),
        createdAt: Date.now(),
      }].slice(-100));
      return;
    }
    await sendMessage(roomCode, player, text);
  }, [isDemo, player, roomCode]);

  const leave = useCallback(async () => {
    if (roomCode && player && !isDemo) await markPlayerOffline(roomCode, player.uid);
    setRoomCode(null);
    setRoom(null);
    setMessages([]);
    setPlayer(null);
    setIsDemo(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url);
  }, [isDemo, player, roomCode]);

  return useMemo(() => ({
    roomCode,
    room,
    messages,
    player,
    isDemo,
    loading,
    error,
    enterLiveRoom,
    beginDemo,
    chooseDifficulty,
    start,
    reveal,
    flag,
    chat,
    leave,
    clearError: () => setError(null),
  }), [roomCode, room, messages, player, isDemo, loading, error, enterLiveRoom, beginDemo, chooseDifficulty, start, reveal, flag, chat, leave]);
}
