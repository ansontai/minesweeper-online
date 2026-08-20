import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createGame } from "../src/gameEngine";

let testEnvironment: RulesTestEnvironment;
const now = Date.now();

function roomFor(hostUid: string) {
  return {
    meta: {
      hostUid,
      difficulty: "beginner",
      status: "waiting",
      createdAt: now,
      expiresAt: now + 60_000,
    },
    members: {
      [hostUid]: {
        uid: hostUid,
        nickname: "隊長",
        joinedAt: now,
        online: true,
        lastSeen: now,
      },
    },
    game: createGame("beginner", "waiting"),
  };
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: "demo-minesweeper-online",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync(resolve("database.rules.json"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("Realtime Database 安全規則", () => {
  it("允許匿名使用者建立自己主持的房間", async () => {
    const database = testEnvironment.authenticatedContext("host-a").database();
    await assertSucceeds(database.ref("rooms/ABC123").set(roomFor("host-a")));
  });

  it("拒絕冒用其他玩家身分", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context.database().ref("rooms/ROOM02").set(roomFor("host-b"));
    });
    const outsider = testEnvironment.authenticatedContext("outsider").database();
    await assertFails(outsider.ref("rooms/ROOM02/members/host-b").update({ nickname: "冒用者" }));
  });

  it("允許房間成員新增自己的合規訊息", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context.database().ref("rooms/ROOM03").set(roomFor("host-c"));
    });
    const member = testEnvironment.authenticatedContext("host-c").database();
    await assertSucceeds(member.ref("rooms/ROOM03/messages/m1").set({
      uid: "host-c",
      nickname: "隊長",
      text: "先開左上角。",
      createdAt: now,
    }));
  });

  it("拒絕超過 300 字的聊天室訊息", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context.database().ref("rooms/ROOM04").set(roomFor("host-d"));
    });
    const member = testEnvironment.authenticatedContext("host-d").database();
    await assertFails(member.ref("rooms/ROOM04/messages/m1").set({
      uid: "host-d",
      nickname: "隊長",
      text: "字".repeat(301),
      createdAt: now,
    }));
  });

  it("允許清除已過期的房間", async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      const expired = roomFor("host-e");
      expired.meta.expiresAt = now - 1;
      await context.database().ref("rooms/ROOM05").set(expired);
    });
    const player = testEnvironment.authenticatedContext("any-player").database();
    await assertSucceeds(player.ref("rooms/ROOM05").remove());
  });

  it("兩位玩家同時操作時會以 transaction 連續遞增版本", async () => {
    const room = roomFor("host-f");
    room.members["member-f"] = {
      uid: "member-f",
      nickname: "隊員",
      joinedAt: now + 1,
      online: true,
      lastSeen: now,
    };
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context.database().ref("rooms/ROOM06").set(room);
    });
    const hostGame = testEnvironment.authenticatedContext("host-f").database().ref("rooms/ROOM06/game");
    const memberGame = testEnvironment.authenticatedContext("member-f").database().ref("rooms/ROOM06/game");
    await Promise.all([hostGame.once("value"), memberGame.once("value")]);
    await Promise.all([
      hostGame.transaction((game) => ({ ...(game ?? room.game), revision: (game?.revision ?? room.game.revision) + 1 })),
      memberGame.transaction((game) => ({ ...(game ?? room.game), revision: (game?.revision ?? room.game.revision) + 1 })),
    ]);
    const result = await hostGame.once("value");
    if (result.child("revision").val() !== 2) throw new Error("並發版本未正確累加");
  });

  it("原隊長離線後允許在線成員接任", async () => {
    const room = roomFor("host-g");
    room.members["host-g"].online = false;
    room.members["member-g"] = {
      uid: "member-g",
      nickname: "接任隊長",
      joinedAt: now + 1,
      online: true,
      lastSeen: now,
    };
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context.database().ref("rooms/ROOM07").set(room);
    });
    const member = testEnvironment.authenticatedContext("member-g").database();
    await assertSucceeds(member.ref("rooms/ROOM07/meta/hostUid").set("member-g"));
  });
});
