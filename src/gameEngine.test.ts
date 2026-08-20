import { describe, expect, it } from "vitest";
import { countFlags, createGame, DIFFICULTIES, placeMines, revealCell, STARTING_LIVES, toggleFlag } from "./gameEngine";

describe("踩地雷引擎", () => {
  it("建立標準三種難度", () => {
    expect(createGame("beginner").cells).toHaveLength(81);
    expect(createGame("intermediate").mineCount).toBe(40);
    expect(createGame("expert").cells).toHaveLength(480);
    expect(DIFFICULTIES.expert.mines).toBe(99);
  });

  it("每局提供 255 條共享生命", () => {
    expect(createGame("beginner").lives).toBe(STARTING_LIVES);
    expect(STARTING_LIVES).toBe(255);
  });

  it("佈雷數正確且首擊位置安全", () => {
    const game = placeMines(createGame("beginner", "ready"), 0, () => 0.5);
    expect(game.cells.filter((cell) => cell.isMine)).toHaveLength(10);
    expect(game.cells[0].isMine).toBe(false);
    game.cells.filter((cell) => !cell.isMine).forEach((cell) => {
      expect(cell.adjacent).toBeGreaterThanOrEqual(0);
      expect(cell.adjacent).toBeLessThanOrEqual(8);
    });
  });

  it("第一次翻格會啟動計時並保證安全", () => {
    const game = revealCell(createGame("beginner", "ready"), 12, "u1", 1000, () => 0);
    expect(game.cells[12].isMine).toBe(false);
    expect(game.cells[12].state).toBe("open");
    expect(game.startedAt).toBe(1000);
    expect(game.status).toBe("playing");
  });

  it("踩雷扣除一條共享生命並可繼續", () => {
    const placed = placeMines(createGame("beginner", "playing"), 0, () => 0);
    const mineIndex = placed.cells.findIndex((cell) => cell.isMine);
    const result = revealCell(placed, mineIndex, "u1", 1000);
    expect(result.lives).toBe(254);
    expect(result.cells[mineIndex].state).toBe("detonated");
    expect(result.status).toBe("playing");
  });

  it("支援插旗與取消插旗", () => {
    const game = createGame("beginner", "ready");
    const flagged = toggleFlag(game, 4);
    expect(flagged.cells[4].state).toBe("flagged");
    expect(countFlags(flagged)).toBe(1);
    expect(toggleFlag(flagged, 4).cells[4].state).toBe("hidden");
  });

  it("翻完所有安全格會勝利", () => {
    const game = placeMines(createGame("beginner", "playing"), 0, () => 0.25);
    game.cells.forEach((cell) => {
      if (!cell.isMine) cell.state = "open";
    });
    const safeIndex = game.cells.findIndex((cell) => !cell.isMine);
    game.cells[safeIndex].state = "hidden";
    const result = revealCell(game, safeIndex, "u1", 2000);
    expect(result.status).toBe("won");
    expect(result.endedAt).toBe(2000);
  });
});
