import { signInAnonymously } from "firebase/auth";
import {
  get,
  limitToLast,
  onDisconnect,
  onValue,
  push,
  query,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import { createGame, revealCell, toggleFlag } from "./gameEngine";
import { getFirebaseServices } from "./firebase";
import type { ChatMessage, Difficulty, GameState, PlayerIdentity, RoomData, RoomMember } from "./types";

const ROOM_LIFETIME = 24 * 60 * 60 * 1000;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeRoomCode() {
  return Array.from({ length: 6 }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join("");
}

function cleanNickname(nickname: string) {
  return nickname.trim().replace(/\s+/g, " ").slice(0, 20);
}

export async function authenticatePlayer(nickname: string): Promise<PlayerIdentity> {
  const cleaned = cleanNickname(nickname);
  if (!cleaned) throw new Error("請輸入暱稱。");
  const { auth } = getFirebaseServices();
  const credential = auth.currentUser ? { user: auth.currentUser } : await signInAnonymously(auth);
  return { uid: credential.user.uid, nickname: cleaned };
}

export async function createRoom(player: PlayerIdentity, difficulty: Difficulty) {
  const { database } = getFirebaseServices();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = makeRoomCode();
    const roomRef = ref(database, `rooms/${roomCode}`);
    const now = Date.now();
    const member: RoomMember = {
      uid: player.uid,
      nickname: player.nickname,
      joinedAt: now,
      online: true,
      lastSeen: now,
    };
    const room: RoomData = {
      meta: {
        hostUid: player.uid,
        difficulty,
        status: "waiting",
        createdAt: now,
        expiresAt: now + ROOM_LIFETIME,
      },
      members: { [player.uid]: member },
      game: createGame(difficulty, "waiting"),
    };

    const result = await runTransaction(roomRef, (current) => current ?? room, { applyLocally: false });
    if (result.committed && result.snapshot.child("meta/hostUid").val() === player.uid) {
      await registerPresence(roomCode, player);
      return roomCode;
    }
  }

  throw new Error("暫時無法建立房間，請稍後再試。");
}

export async function joinRoom(roomCode: string, player: PlayerIdentity) {
  const { database } = getFirebaseServices();
  const normalized = roomCode.trim().toUpperCase();
  const roomRef = ref(database, `rooms/${normalized}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) throw new Error("找不到這個房間，請確認房號。");
  const room = snapshot.val() as RoomData;
  if (room.meta.expiresAt <= Date.now()) {
    await remove(roomRef);
    throw new Error("這個房間已超過 24 小時並關閉。");
  }

  const now = Date.now();
  await set(ref(database, `rooms/${normalized}/members/${player.uid}`), {
    uid: player.uid,
    nickname: player.nickname,
    joinedAt: room.members?.[player.uid]?.joinedAt ?? now,
    online: true,
    lastSeen: now,
  } satisfies RoomMember);
  await registerPresence(normalized, player);
  return normalized;
}

async function registerPresence(roomCode: string, player: PlayerIdentity) {
  const { database } = getFirebaseServices();
  const memberRef = ref(database, `rooms/${roomCode}/members/${player.uid}`);
  await onDisconnect(memberRef).update({ online: false, lastSeen: serverTimestamp() });
}

export function subscribeToRoom(roomCode: string, onRoom: (room: RoomData | null) => void) {
  const { database } = getFirebaseServices();
  return onValue(ref(database, `rooms/${roomCode}`), (snapshot) => {
    onRoom(snapshot.exists() ? snapshot.val() as RoomData : null);
  });
}

export function subscribeToMessages(roomCode: string, onMessages: (messages: ChatMessage[]) => void) {
  const { database } = getFirebaseServices();
  const messagesQuery = query(ref(database, `rooms/${roomCode}/messages`), limitToLast(100));
  return onValue(messagesQuery, (snapshot) => {
    const value = snapshot.val() as Record<string, Omit<ChatMessage, "id">> | null;
    const messages = value
      ? Object.entries(value).map(([id, message]) => ({ id, ...message })).sort((a, b) => a.createdAt - b.createdAt)
      : [];
    onMessages(messages);
  });
}

export async function setRoomDifficulty(roomCode: string, difficulty: Difficulty, player: PlayerIdentity) {
  const { database } = getFirebaseServices();
  const roomRef = ref(database, `rooms/${roomCode}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return;
  const room = snapshot.val() as RoomData;
  if (room.meta.hostUid !== player.uid || room.game.status !== "waiting") return;
  const game = createGame(difficulty, "waiting", room.game.revision + 1);
  game.lastAction = { type: "reset", actorUid: player.uid, at: Date.now() };
  await update(roomRef, {
    "meta/difficulty": difficulty,
    game,
  });
}

export async function startRound(roomCode: string, difficulty: Difficulty, player: PlayerIdentity) {
  const { database } = getFirebaseServices();
  const roomRef = ref(database, `rooms/${roomCode}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return;
  const room = snapshot.val() as RoomData;
  if (room.meta.hostUid !== player.uid) return;
  const game = createGame(difficulty, "ready", room.game.revision + 1);
  game.lastAction = {
    type: room.game.status === "waiting" ? "start" : "reset",
    actorUid: player.uid,
    at: Date.now(),
  };
  await update(roomRef, {
    "meta/difficulty": difficulty,
    "meta/status": "ready",
    game,
  });
}

async function transactGame(
  roomCode: string,
  player: PlayerIdentity,
  reducer: (game: GameState) => GameState,
) {
  const { database } = getFirebaseServices();
  const gameRef = ref(database, `rooms/${roomCode}/game`);
  const result = await runTransaction(gameRef, (game: GameState | null) => game ? reducer(game) : game);
  if (result.committed) {
    const game = result.snapshot.val() as GameState;
    await update(ref(database, `rooms/${roomCode}/meta`), { status: game.status });
  }
  return result.committed;
}

export function revealRoomCell(roomCode: string, cellIndex: number, player: PlayerIdentity) {
  return transactGame(roomCode, player, (game) => revealCell(game, cellIndex, player.uid));
}

export function flagRoomCell(roomCode: string, cellIndex: number, player: PlayerIdentity) {
  return transactGame(roomCode, player, (game) => toggleFlag(game, cellIndex, player.uid));
}

export async function sendMessage(roomCode: string, player: PlayerIdentity, rawText: string) {
  const text = rawText.trim().slice(0, 300);
  if (!text) return;
  const { database } = getFirebaseServices();
  const messageRef = push(ref(database, `rooms/${roomCode}/messages`));
  await set(messageRef, {
    uid: player.uid,
    nickname: player.nickname,
    text,
    createdAt: Date.now(),
  });
}

export async function markPlayerOffline(roomCode: string, uid: string) {
  const { database } = getFirebaseServices();
  await update(ref(database, `rooms/${roomCode}/members/${uid}`), {
    online: false,
    lastSeen: serverTimestamp(),
  });
}

export async function claimHostIfNeeded(roomCode: string, uid: string) {
  const { database } = getFirebaseServices();
  const roomRef = ref(database, `rooms/${roomCode}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return;
  const room = snapshot.val() as RoomData;
  if (room.members?.[room.meta.hostUid]?.online) return;
  const nextHost = Object.values(room.members ?? {})
    .filter((member) => member.online)
    .sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (!nextHost || nextHost.uid !== uid) return;
  const hostRef = ref(database, `rooms/${roomCode}/meta/hostUid`);
  await runTransaction(hostRef, (currentHost: string | null) => {
    if (currentHost !== room.meta.hostUid) return;
    return uid;
  });
}
