export type Difficulty = "beginner" | "intermediate" | "expert";
export type CellState = "hidden" | "open" | "flagged" | "detonated" | "revealed";
export type GameStatus = "waiting" | "ready" | "playing" | "won" | "lost";

export interface DifficultyConfig {
  label: string;
  rows: number;
  cols: number;
  mines: number;
}

export interface BoardCell {
  isMine: boolean;
  adjacent: number;
  state: CellState;
}

export interface GameState {
  revision: number;
  difficulty: Difficulty;
  rows: number;
  cols: number;
  mineCount: number;
  lives: number;
  status: GameStatus;
  startedAt: number | null;
  endedAt: number | null;
  cells: BoardCell[];
  lastAction?: {
    type: "start" | "reveal" | "flag" | "reset";
    actorUid: string;
    cellIndex?: number;
    at: number;
  };
}

export interface RoomMeta {
  hostUid: string;
  difficulty: Difficulty;
  status: GameStatus;
  createdAt: number;
  expiresAt: number;
}

export interface RoomMember {
  uid: string;
  nickname: string;
  joinedAt: number;
  online: boolean;
  lastSeen: number;
}

export interface ChatMessage {
  id: string;
  uid: string;
  nickname: string;
  text: string;
  createdAt: number;
}

export interface RoomData {
  meta: RoomMeta;
  members: Record<string, RoomMember>;
  game: GameState;
  messages?: Record<string, Omit<ChatMessage, "id">>;
}

export interface PlayerIdentity {
  uid: string;
  nickname: string;
}
