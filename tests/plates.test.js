import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../src/sim/world.js";
import { grab } from "../src/sim/interact.js";
import { step } from "../src/sim/step.js";
import { encodeSnap, decodeSnap } from "../src/sim/snapshot.js";
import { STAGES } from "../src/data/stages.js";

/**
 * テスト用の初期ワールドを生成する
 */
function setupWorld(seed = 1) {
  const world = createWorld("kado", seed, [{ slot: 0, name: "a" }]);
  world.phase = "playing";
  world.timeLeft = 180;
  return world;
}

/**
 * ワールド内の皿の枚数を箇所ごとに集計する
 */
function countPlates(world) {
  const shelf = world.shelf;
  const held = Object.values(world.players).filter((p) => p?.held?.plate).length;
  const returning = world.returning.length;
  const placed = Object.values(world.items).filter((item) => item?.plate).length;
  const total = shelf + held + returning + placed;
  return { shelf, held, returning, placed, total };
}

test("皿の総数不変: 取得・盛り付け・提供を通じて総数4枚が保たれる", () => {
  const world = setupWorld(1);

  // 生成直後は棚に4枚
  assert.deepEqual(countPlates(world), {
    shelf: 4,
    held: 0,
    returning: 0,
    placed: 0,
    total: 4,
  });

  // 皿棚 (10,0) から皿を取る
  grab(world, 0, 10, 0);
  assert.deepEqual(countPlates(world), {
    shelf: 3,
    held: 1,
    returning: 0,
    placed: 0,
    total: 4,
  });

  // まな板 (4,0) に刻んだ葉を置き、皿ですくう
  world.items["4,0"] = { k: "leaf", s: "chopped", p: 0 };
  grab(world, 0, 4, 0);
  assert.ok(world.players[0].held?.plate);
  assert.ok(Array.isArray(world.players[0].held?.c) && world.players[0].held.c.length > 0);
  assert.equal(countPlates(world).total, 4);

  // 注文を入れて提供口 (12,1) で提供する
  world.orders = [{ id: 1, recipe: "green_salad", left: 90, limit: 90 }];
  grab(world, 0, 12, 1);
  assert.deepEqual(countPlates(world), {
    shelf: 3,
    held: 0,
    returning: 1,
    placed: 0,
    total: 4,
  });
});

test("提供と返却のタイミング: 5秒後は返却待ちのまま、6.2秒後に棚へ戻る", () => {
  const world = setupWorld(2);

  // 皿を取り、刻んだ葉を盛って提供する
  grab(world, 0, 10, 0);
  world.items["4,0"] = { k: "leaf", s: "chopped", p: 0 };
  grab(world, 0, 4, 0);
  world.orders = [{ id: 1, recipe: "green_salad", left: 90, limit: 90 }];
  grab(world, 0, 12, 1);

  // 提供直後は shelf 3・returning 1
  assert.equal(world.shelf, 3);
  assert.equal(world.returning.length, 1);

  // 5秒分（300フレーム）進めてもまだ返却されない
  for (let i = 0; i < 300; i += 1) {
    step(world, STAGES.kado, 1 / 60);
  }
  assert.equal(world.shelf, 3);
  assert.equal(countPlates(world).total, 4);

  // 合計6.2秒分（追加で72フレーム）進めると棚に戻る
  for (let i = 0; i < 72; i += 1) {
    step(world, STAGES.kado, 1 / 60);
  }
  assert.deepEqual(countPlates(world), {
    shelf: 4,
    held: 0,
    returning: 0,
    placed: 0,
    total: 4,
  });
});

test("皿は増えない: 中身入りの皿を持って皿棚をgrabしても上書きや増加が起きない", () => {
  const world = setupWorld(3);

  // 皿を取って中身を盛る
  grab(world, 0, 10, 0);
  world.items["4,0"] = { k: "leaf", s: "chopped", p: 0 };
  grab(world, 0, 4, 0);
  const heldBefore = structuredClone(world.players[0].held);

  // 皿棚 (10,0) を再度 grab する
  grab(world, 0, 10, 0);

  assert.deepEqual(world.players[0].held, heldBefore);
  assert.equal(world.shelf, 3);
  assert.equal(countPlates(world).total, 4);
});

test("snapshot往復: 棚3・手持ち1の状態がencode/JSON/decode後も維持される", () => {
  const world = setupWorld(4);

  // 空の皿を1枚持つ（棚3・手持ち1）
  grab(world, 0, 10, 0);

  const wire = JSON.parse(JSON.stringify(encodeSnap(world)));
  const view = decodeSnap(wire);

  const heldPlates = view.players.filter((p) => p.held?.plate === true).length;
  const placedPlates = Array.from(view.items.values()).filter((item) => item?.plate).length;

  assert.equal(view.shelf, 3);
  assert.equal(heldPlates, 1);
  assert.equal(view.shelf + heldPlates + placedPlates, 4);
});
