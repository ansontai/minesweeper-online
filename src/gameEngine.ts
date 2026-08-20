import type { BoardCell, Difficulty, DifficultyConfig, GameState } from "./types";

export const STARTING_LIVES = 255;

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  beginner: { label: "初級", rows: 9, cols: 9, mines: 10 },
  intermediate: { label: "中級", rows: 16, cols: 16, mines: 40 },
  expert: { label: "高級", rows: 16, cols: 30, mines: 99 },
};

export function createGame(
  difficulty: Difficulty,
  status: GameState["status"] = "waiting",
  revision = 0,
): GameState {
  const config = DIFFICULTIES[difficulty];
  return {
    revision,
    difficulty,
    rows: config.rows,
    cols: config.cols,
    mineCount: config.mines,
    lives: STARTING_LIVES,
    status,
    startedAt: null,
    endedAt: null,
    cells: Array.from({ length: config.rows * config.cols }, () => ({
      isMine: false,
      adjacent: 0,
      state: "hidden" as const,
    })),
  };
}

function neighbours(index: number, rows: number, cols: number): number[] {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const result: number[] = [];

  for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
    for (let colDelta = -1; colDelta <= 1; colDelta += 1) {
      if (rowDelta === 0 && colDelta === 0) continue;
      const nextRow = row + rowDelta;
      const nextCol = col + colDelta;
      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
        result.push(nextRow * cols + nextCol);
      }
    }
  }

  return result;
}

export function placeMines(
  game: GameState,
  safeIndex: number,
  random: () => number = Math.random,
): GameState {
  const cells = game.cells.map((cell) => ({ ...cell, isMine: false, adjacent: 0 }));
  const candidates = cells.map((_, index) => index).filter((index) => index !== safeIndex);

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }

  candidates.slice(0, game.mineCount).forEach((index) => {
    cells[index].isMine = true;
  });

  cells.forEach((cell, index) => {
    if (!cell.isMine) {
      cell.adjacent = neighbours(index, game.rows, game.cols).filter(
        (nearbyIndex) => cells[nearbyIndex].isMine,
      ).length;
    }
  });

  return { ...game, cells };
}

function floodReveal(cells: BoardCell[], start: number, rows: number, cols: number) {
  const queue = [start];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const index = queue.shift()!;
    if (visited.has(index)) continue;
    visited.add(index);

    const cell = cells[index];
    if (!cell || cell.isMine || cell.state === "flagged") continue;
    cell.state = "open";

    if (cell.adjacent === 0) {
      neighbours(index, rows, cols).forEach((nextIndex) => {
        if (!visited.has(nextIndex) && cells[nextIndex].state === "hidden") queue.push(nextIndex);
      });
    }
  }
}

function hasWon(cells: BoardCell[]) {
  return cells.every((cell) => cell.isMine || cell.state === "open");
}

export function revealCell(
  original: GameState,
  cellIndex: number,
  actorUid = "local",
  now = Date.now(),
  random: () => number = Math.random,
): GameState {
  if (!["ready", "playing"].includes(original.status)) return original;
  if (cellIndex < 0 || cellIndex >= original.cells.length) return original;
  if (["open", "flagged", "detonated", "revealed"].includes(original.cells[cellIndex].state)) return original;

  const game = original.status === "ready" ? placeMines(original, cellIndex, random) : original;
  const cells = game.cells.map((cell) => ({ ...cell }));
  let lives = game.lives;
  let status: GameState["status"] = "playing";
  let endedAt: number | null = null;

  if (cells[cellIndex].isMine) {
    cells[cellIndex].state = "detonated";
    lives = Math.max(0, lives - 1);
    if (lives === 0) {
      status = "lost";
      endedAt = now;
      cells.forEach((cell) => {
        if (cell.isMine && cell.state === "hidden") cell.state = "revealed";
      });
    }
  } else {
    floodReveal(cells, cellIndex, game.rows, game.cols);
    if (hasWon(cells)) {
      status = "won";
      endedAt = now;
      cells.forEach((cell) => {
        if (cell.isMine && cell.state === "hidden") cell.state = "flagged";
      });
    }
  }

  return {
    ...game,
    cells,
    lives,
    status,
    startedAt: game.startedAt ?? now,
    endedAt,
    revision: game.revision + 1,
    lastAction: { type: "reveal", actorUid, cellIndex, at: now },
  };
}

export function toggleFlag(
  game: GameState,
  cellIndex: number,
  actorUid = "local",
  now = Date.now(),
): GameState {
  if (!["ready", "playing"].includes(game.status)) return game;
  if (cellIndex < 0 || cellIndex >= game.cells.length) return game;
  const current = game.cells[cellIndex];
  if (!current || !["hidden", "flagged"].includes(current.state)) return game;

  const cells = game.cells.map((cell, index) =>
    index === cellIndex
      ? { ...cell, state: cell.state === "flagged" ? "hidden" as const : "flagged" as const }
      : { ...cell },
  );

  return {
    ...game,
    cells,
    revision: game.revision + 1,
    lastAction: { type: "flag", actorUid, cellIndex, at: now },
  };
}

export function countFlags(game: GameState) {
  return game.cells.filter((cell) => cell.state === "flagged").length;
}
