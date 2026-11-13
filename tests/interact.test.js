import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, tileAt } from "../src/sim/world.js";
import { grab } from "../src/sim/interact.js";
import { step } from "../src/sim/step.js";
import { STAGES } from "../src/data/stages.js";
import { INGREDIENTS } from "../src/data/ingredients.js";

/**
 * テスト用のプレイ中ワールドを生成する。
 */
function makeWorld(players = [{ slot: 0, name: "a" }]) {
  const world = createWorld("kado", 1, players);
  world.phase = "playing";
  world.timeLeft = 180;
  return world;
}

test("1. リーフ箱 (1,0) を空手で grab すると生の leaf を持つ", () => {
  const world = makeWorld();
  grab(world, 0, 1, 0);
  assert.deepEqual(world.players[0].held, { k: "leaf", s: "raw", p: 0 });
});

test("2. まな板には生の leaf のみ置け、chopped の leaf は置けない", () => {
  const world = makeWorld();

  world.players[0].held = { k: "leaf", s: "raw", p: 0 };
  grab(world, 0, 4, 0);
  assert.deepEqual(world.items["4,0"], { k: "leaf", s: "raw", p: 0 });
  assert.equal(world.players[0].held, null);

  world.players[0].held = { k: "leaf", s: "chopped", p: 0 };
  grab(world, 0, 5, 0);
  assert.equal(world.items["5,0"], undefined);
  assert.deepEqual(world.players[0].held, { k: "leaf", s: "chopped", p: 0 });
});

test("3. コンロには raw の麺を置けるが、完成皿は置けない", () => {
  const world = makeWorld();

  world.players[0].held = { k: "noodle", s: "raw", p: 0 };
  grab(world, 0, 7, 0);
  assert.deepEqual(world.items["7,0"], { k: "noodle", s: "raw", p: 0 });
  assert.equal(world.players[0].held, null);

  const platedSalad = { plate: true, c: [{ k: "leaf", s: "chopped" }] };
  world.players[0].held = platedSalad;
  grab(world, 0, 8, 0);
  assert.equal(world.items["8,0"], undefined);
  assert.deepEqual(world.players[0].held, { plate: true, c: [{ k: "leaf", s: "chopped" }] });
});

test("4. カウンターには raw のトマトを置けるが、皿は置けない", () => {
  const world = makeWorld();

  world.players[0].held = { k: "tomato", s: "raw", p: 0 };
  grab(world, 0, 0, 0);
  assert.deepEqual(world.items["0,0"], { k: "tomato", s: "raw", p: 0 });
  assert.equal(world.players[0].held, null);

  world.players[0].held = { plate: true, c: [] };
  grab(world, 0, 9, 0);
  assert.equal(world.items["9,0"], undefined);
  assert.deepEqual(world.players[0].held, { plate: true, c: [] });
});

test("5. 皿棚は空手で皿を取得し、食材持ちでは変化せず、空の皿は返却できる", () => {
  const world = makeWorld();

  // 空手で皿を取る
  grab(world, 0, 10, 0);
  assert.equal(world.players[0].held?.plate, true);
  assert.equal(world.shelf, 3);
  const plate = world.players[0].held;

  // 食材持ちで皿棚を grab しても何も起きない
  world.players[0].held = { k: "leaf", s: "raw", p: 0 };
  const eventsBefore = world.events.length;
  grab(world, 0, 10, 0);
  assert.deepEqual(world.players[0].held, { k: "leaf", s: "raw", p: 0 });
  assert.equal(world.shelf, 3);
  assert.equal(world.events.length, eventsBefore);

  // 空の皿を持って皿棚を grab すると返却される
  world.players[0].held = plate;
  grab(world, 0, 10, 0);
  assert.equal(world.players[0].held, null);
  assert.equal(world.shelf, 4);
});

test("6. 提供口で注文に合う完成皿を提供するとスコアと統計が増え、空の皿は buzz になる", () => {
  const world = makeWorld();
  const scoreBefore = world.score;
  const worldServedBefore = world.stats.served;
  const playerServedBefore = world.players[0].stats.served;

  world.orders = [{ id: 1, recipe: "green_salad", left: 90, limit: 90 }];
  world.players[0].held = { plate: true, c: [{ k: "leaf", s: "chopped" }] };
  grab(world, 0, 12, 1);

  assert.equal(world.score, scoreBefore + 52);
  assert.equal(world.stats.served, worldServedBefore + 1);
  assert.equal(world.players[0].stats.served, playerServedBefore + 1);
  assert.equal(world.orders.length, 0);
  assert.equal(world.returning.length, 1);
  assert.equal(world.players[0].held, null);

  // 空の皿では提供できず buzz イベントが出る
  world.events.length = 0;
  world.players[0].held = { plate: true, c: [] };
  grab(world, 0, 12, 1);

  assert.equal(world.score, scoreBefore + 52);
  assert.deepEqual(world.players[0].held, { plate: true, c: [] });
  assert.ok(world.events.some((ev) => ev.e === "buzz" && ev.slot === 0));
});

test("7. ゴミ箱では食材が捨てられ、中身入りの皿は中身だけ消えて皿が残る", () => {
  const world = makeWorld();

  world.players[0].held = { k: "leaf", s: "raw", p: 0 };
  world.events.length = 0;
  grab(world, 0, 12, 6);
  assert.equal(world.players[0].held, null);
  assert.ok(world.events.some((ev) => ev.e === "trash" && ev.slot === 0));

  world.players[0].held = { plate: true, c: [{ k: "leaf", s: "chopped" }] };
  grab(world, 0, 12, 6);
  assert.deepEqual(world.players[0].held, { plate: true, c: [] });
});

test("8. カウンター上の食材は空手で取り出せ、食材持ちでは取れない", () => {
  const world = makeWorld();

  world.items["0,0"] = { k: "tomato", s: "raw", p: 0 };
  assert.equal(tileAt(world, 0, 0).item, undefined);
  grab(world, 0, 0, 0);
  assert.deepEqual(world.players[0].held, { k: "tomato", s: "raw", p: 0 });
  assert.equal(world.items["0,0"], undefined);

  // すでに食材を持っているため島 (3,4) のトマトは取れない
  world.items["3,4"] = { k: "tomato", s: "raw", p: 0 };
  grab(world, 0, 3, 4);
  assert.deepEqual(world.players[0].held, { k: "tomato", s: "raw", p: 0 });
  assert.deepEqual(world.items["3,4"], { k: "tomato", s: "raw", p: 0 });
});

test("9. 切る3条件が揃うと p が進み、いずれかが欠けると進まない", () => {
  // 3条件が揃う場合: 30 tick で約 0.5 進む
  const world = makeWorld();
  world.items["4,0"] = { k: "leaf", s: "raw", p: 0 };
  const player = world.players[0];
  player.x = 4.5;
  player.y = 1.5;
  player.fx = 0;
  player.fy = -1;
  player.input = { mx: 0, my: 0, chop: true };

  for (let i = 0; i < 30; i++) {
    step(world, STAGES.kado, 1 / 60);
  }
  assert.ok(INGREDIENTS.leaf.chop.time > 0);
  assert.ok(Math.abs(world.items["4,0"].p - 0.5) < 0.05);

  // (a) held がある場合
  const worldHeld = makeWorld();
  worldHeld.items["4,0"] = { k: "leaf", s: "raw", p: 0 };
  const playerHeld = worldHeld.players[0];
  playerHeld.held = { k: "tomato", s: "raw", p: 0 };
  playerHeld.x = 4.5;
  playerHeld.y = 1.5;
  playerHeld.fx = 0;
  playerHeld.fy = -1;
  playerHeld.input = { mx: 0, my: 0, chop: true };

  for (let i = 0; i < 30; i++) {
    step(worldHeld, STAGES.kado, 1 / 60);
  }
  assert.equal(worldHeld.items["4,0"].p, 0);

  // (b) 向きの先がカウンター (3,4) の場合
  const worldCounter = makeWorld();
  worldCounter.items["3,4"] = { k: "leaf", s: "raw", p: 0 };
  const playerCounter = worldCounter.players[0];
  playerCounter.x = 3.5;
  playerCounter.y = 3.5;
  playerCounter.fx = 0;
  playerCounter.fy = 1;
  playerCounter.input = { mx: 0, my: 0, chop: true };

  for (let i = 0; i < 30; i++) {
    step(worldCounter, STAGES.kado, 1 / 60);
  }
  assert.equal(worldCounter.items["3,4"].p, 0);

  // (c) まな板 (5,0) の item が切断定義のない麺の場合
  const worldNoodle = makeWorld();
  worldNoodle.items["5,0"] = { k: "noodle", s: "raw", p: 0 };
  const playerNoodle = worldNoodle.players[0];
  playerNoodle.x = 5.5;
  playerNoodle.y = 1.5;
  playerNoodle.fx = 0;
  playerNoodle.fy = -1;
  playerNoodle.input = { mx: 0, my: 0, chop: true };

  for (let i = 0; i < 30; i++) {
    step(worldNoodle, STAGES.kado, 1 / 60);
  }
  assert.equal(worldNoodle.items["5,0"].p, 0);
});

test("10. 2人で同時に切っても切断速度は1人のときと同じ1倍である", () => {
  const solo = makeWorld([{ slot: 0, name: "a" }]);
  solo.items["4,0"] = { k: "leaf", s: "raw", p: 0 };
  solo.players[0].x = 4.5;
  solo.players[0].y = 1.5;
  solo.players[0].fx = 0;
  solo.players[0].fy = -1;
  solo.players[0].input = { mx: 0, my: 0, chop: true };

  for (let i = 0; i < 30; i++) {
    step(solo, STAGES.kado, 1 / 60);
  }

  const duo = makeWorld([
    { slot: 0, name: "a" },
    { slot: 1, name: "b" },
  ]);
  duo.items["4,0"] = { k: "leaf", s: "raw", p: 0 };
  for (const slot of [0, 1]) {
    duo.players[slot].x = 4.5;
    duo.players[slot].y = 1.5;
    duo.players[slot].fx = 0;
    duo.players[slot].fy = -1;
    duo.players[slot].input = { mx: 0, my: 0, chop: true };
  }

  for (let i = 0; i < 30; i++) {
    step(duo, STAGES.kado, 1 / 60);
  }

  assert.ok(Math.abs(duo.items["4,0"].p - solo.items["4,0"].p) <= 0.02);
});

test("11. 皿を持って chopped leaf をすくうことができ、raw の leaf はすくえない", () => {
  const worldChopped = makeWorld();
  worldChopped.items["4,0"] = { k: "leaf", s: "chopped", p: 0 };
  worldChopped.players[0].held = { plate: true, c: [] };
  const platedBefore = worldChopped.players[0].stats.plated;

  grab(worldChopped, 0, 4, 0);
  assert.deepEqual(worldChopped.players[0].held.c, [{ k: "leaf", s: "chopped" }]);
  assert.equal(worldChopped.items["4,0"], undefined);
  assert.equal(worldChopped.players[0].stats.plated, platedBefore + 1);

  const worldRaw = makeWorld();
  worldRaw.items["4,0"] = { k: "leaf", s: "raw", p: 0 };
  worldRaw.players[0].held = { plate: true, c: [] };

  grab(worldRaw, 0, 4, 0);
  assert.deepEqual(worldRaw.items["4,0"], { k: "leaf", s: "raw", p: 0 });
  assert.deepEqual(worldRaw.players[0].held.c, []);
});
