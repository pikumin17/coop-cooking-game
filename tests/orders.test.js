import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../src/sim/world.js";
import { step } from "../src/sim/step.js";
import { STAGES } from "../src/data/stages.js";

const DT = 1 / 60;
const ONE_PLAYER = [{ slot: 0, name: "P1" }];

function createPlayingWorld(seed = 1) {
  const world = createWorld("kado", seed, ONE_PLAYER);
  world.phase = "playing";
  world.timeLeft = 180;
  return world;
}

test("最初の2件は openingOrders の通りの順番で発生する", () => {
  const world = createPlayingWorld(1);
  const recipes = [];
  const maxTicks = 60 * 60;

  for (let i = 0; i < maxTicks && recipes.length < 2; i++) {
    const events = step(world, STAGES.kado, DT);
    for (const ev of events) {
      if (ev.e === "orderNew") {
        recipes.push(ev.recipe);
      }
    }
  }

  assert.equal(recipes.length, 2);
  assert.deepEqual(recipes, STAGES.kado.openingOrders);
});

test("2件目から3件目の注文発生間隔が interval (22秒 ±0.1秒) である", () => {
  const world = createPlayingWorld(1);
  const spawnTimes = [];
  const maxTicks = 60 * 60;

  for (let i = 0; i < maxTicks && spawnTimes.length < 3; i++) {
    const events = step(world, STAGES.kado, DT);
    for (const ev of events) {
      if (ev.e === "orderNew") {
        spawnTimes.push(world.elapsed);
      }
    }
  }

  assert.equal(spawnTimes.length, 3);
  const interval = spawnTimes[2] - spawnTimes[1];
  assert.ok(
    Math.abs(interval - 22) <= 0.1,
    `2件目と3件目の発生間隔が想定外です: ${interval}`
  );
});

test("注文数が上限3件のときは新規発生せず、1件減ると次の step で即補充される", () => {
  const world = createPlayingWorld(1);
  world.orders = [
    { id: 1, recipe: "green_salad", left: 999, limit: 999 },
    { id: 2, recipe: "green_salad", left: 999, limit: 999 },
    { id: 3, recipe: "green_salad", left: 999, limit: 999 },
  ];
  world.nextSpawnAt = 0;

  const eventsFull = step(world, STAGES.kado, DT);
  const spawnedWhileFull = eventsFull.filter((ev) => ev.e === "orderNew");
  assert.equal(spawnedWhileFull.length, 0);
  assert.equal(world.orders.length, 3);

  world.orders.pop();
  assert.equal(world.orders.length, 2);

  const eventsAfterRemove = step(world, STAGES.kado, DT);
  const spawnedAfterRemove = eventsAfterRemove.filter((ev) => ev.e === "orderNew");
  assert.equal(spawnedAfterRemove.length, 1);
  assert.equal(world.orders.length, 3);
});

test("期限切れで注文が0件になった場合、refillDelay (2秒) 後に新しい注文が補充される", () => {
  const world = createPlayingWorld(1);
  world.orders = [{ id: 1, recipe: "green_salad", left: 0.01, limit: 30 }];
  world.nextSpawnAt = 9999;

  // 最初の step (1/60秒 ≒ 0.0167秒) で left <= 0 になり期限切れで消える
  step(world, STAGES.kado, DT);
  assert.equal(world.orders.length, 0);

  // その後 1.9 秒分 (114 tick) 進めてもまだ 0 件のまま
  for (let i = 0; i < 114; i++) {
    step(world, STAGES.kado, DT);
  }
  assert.equal(world.orders.length, 0);

  // 合計 2.2 秒分 (132 tick: 残り 18 tick) まで進めると 1 件補充される
  for (let i = 0; i < 18; i++) {
    step(world, STAGES.kado, DT);
  }
  assert.equal(world.orders.length, 1);
});

test("注文の期限切れでスコアから 20 減点され、0 未満にはならない", () => {
  const worldA = createPlayingWorld(1);
  worldA.score = 100;
  worldA.orders = [{ id: 1, recipe: "green_salad", left: 0.01, limit: 30 }];
  worldA.nextSpawnAt = 9999;

  step(worldA, STAGES.kado, DT);
  assert.equal(worldA.score, 80);

  const worldB = createPlayingWorld(1);
  worldB.score = 10;
  worldB.orders = [{ id: 1, recipe: "green_salad", left: 0.01, limit: 30 }];
  worldB.nextSpawnAt = 9999;

  step(worldB, STAGES.kado, DT);
  assert.equal(worldB.score, 0);
});

test("同じシードでは発生する注文列が完全に再現され、別シードでも3件以上発生する", () => {
  const ticks = 4000;

  const collectRecipes = (seed) => {
    const world = createPlayingWorld(seed);
    const recipes = [];
    for (let i = 0; i < ticks; i++) {
      const events = step(world, STAGES.kado, DT);
      for (const ev of events) {
        if (ev.e === "orderNew") {
          recipes.push(ev.recipe);
        }
      }
    }
    return recipes;
  };

  const recipes42a = collectRecipes(42);
  const recipes42b = collectRecipes(42);
  assert.deepEqual(recipes42a, recipes42b);
  assert.ok(recipes42a.length >= 3);

  const recipes7 = collectRecipes(7);
  assert.ok(recipes7.length >= 3);
});
