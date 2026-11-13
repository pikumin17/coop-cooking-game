import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../src/sim/world.js";
import { step } from "../src/sim/step.js";
import { grab } from "../src/sim/interact.js";
import { STAGES } from "../src/data/stages.js";
import { INGREDIENTS } from "../src/data/ingredients.js";

const DT = 1 / 60;

/**
 * 指定秒数ぶん step を実行し、発生したイベントをすべて集めて返す。
 */
function stepSeconds(world, sec) {
  const steps = Math.round(sec * 60);
  const events = [];
  for (let i = 0; i < steps; i++) {
    events.push(...step(world, STAGES.kado, DT));
  }
  return events;
}

function makeWorld() {
  return createWorld("kado", 1, [{ slot: 0, name: "a" }]);
}

test("countdown: 生成直後からカウントダウン終了で playing に遷移する", () => {
  const world = makeWorld();
  assert.equal(world.phase, "countdown");
  assert.equal(world.countdown, 3);
  assert.equal(world.timeLeft, 180);

  // 1秒経過してもまだカウントダウン中
  stepSeconds(world, 1);
  assert.equal(world.phase, "countdown");
  assert.equal(world.timeLeft, 180);

  // 合計3.2秒まで進めると playing に遷移する
  const events = stepSeconds(world, 2.2);
  assert.equal(world.phase, "playing");
  assert.ok(events.some((ev) => ev.e === "phase" && ev.phase === "playing"));
});

test("麺の調理: raw の麺をコンロで加熱すると cooked になる", () => {
  const world = makeWorld();
  world.phase = "playing";
  world.items["7,0"] = { k: "noodle", s: "raw", p: 0 };

  const events = stepSeconds(world, INGREDIENTS.noodle.cook.time + 0.2);
  assert.equal(world.items["7,0"].s, "cooked");
  assert.ok(events.some((ev) => ev.e === "cooked"));
});

test("こげ: cooked の後に放置すると burnt になり、以降は重複イベントが出ない", () => {
  const world = makeWorld();
  world.phase = "playing";
  world.items["7,0"] = { k: "noodle", s: "raw", p: 0 };

  // まず cooked にする
  stepSeconds(world, 6.2);
  assert.equal(world.items["7,0"].s, "cooked");

  // 更に8.2秒加熱すると焦げる
  const burnEvents = stepSeconds(world, 8.2);
  assert.equal(world.items["7,0"].s, "burnt");
  assert.equal(world.stats.burnt, 1);
  assert.ok(burnEvents.some((ev) => ev.e === "burnt"));

  // 更に2秒経過しても状態は変わらず cooked/burnt イベントは出ない
  const afterEvents = stepSeconds(world, 2);
  assert.equal(world.items["7,0"].s, "burnt");
  assert.equal(
    afterEvents.filter((ev) => ev.e === "cooked" || ev.e === "burnt").length,
    0
  );
});

test("警告: cooked から burnt までの間に burnWarn がちょうど1回発生する", () => {
  const world = makeWorld();
  world.phase = "playing";
  world.items["7,0"] = { k: "noodle", s: "raw", p: 0 };

  stepSeconds(world, INGREDIENTS.noodle.cook.time + 0.2);
  assert.equal(world.items["7,0"].s, "cooked");

  const events = stepSeconds(world, INGREDIENTS.noodle.cook.burnAfter + 0.2);
  assert.equal(world.items["7,0"].s, "burnt");
  const warns = events.filter((ev) => ev.e === "burnWarn");
  assert.equal(warns.length, 1);
});

test("終了: timeLeft 0 で result に遷移し、その後はイベントもスコア変化も起きない", () => {
  const world = makeWorld();
  world.phase = "playing";
  world.timeLeft = 0.01;

  const events = step(world, STAGES.kado, DT);
  assert.equal(world.phase, "result");
  assert.ok(events.some((ev) => ev.e === "phase" && ev.phase === "result"));

  const scoreBefore = world.score;
  const afterEvents = stepSeconds(world, 1);
  assert.equal(world.score, scoreBefore);
  assert.deepEqual(afterEvents, []);
});

test("皿の返却: 提供から6秒後に皿棚へ皿が戻る", () => {
  const world = makeWorld();
  world.phase = "playing";
  world.items["4,0"] = { k: "leaf", s: "chopped", p: 0 };
  world.orders = [{ id: 1, recipe: "green_salad", left: 90, limit: 90 }];

  // 皿棚(10,0)から皿を取り、まな板(4,0)のリーフをすくい、提供口(12,1)で提供する
  grab(world, 0, 10, 0);
  assert.equal(world.shelf, 3);
  grab(world, 0, 4, 0);
  grab(world, 0, 12, 1);
  assert.equal(world.shelf, 3);

  // 5秒時点ではまだ戻らない
  stepSeconds(world, 5);
  assert.equal(world.shelf, 3);

  // 合計6.2秒時点で皿棚に戻る
  stepSeconds(world, 1.2);
  assert.equal(world.shelf, 4);
});
