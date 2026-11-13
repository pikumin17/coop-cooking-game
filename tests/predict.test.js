import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPredictor } from '../src/game/predict.js';
import { STAGES } from '../src/data/stages.js';

const DT = 1 / 60;
const EPS = 1e-6;

// 浮動小数点の比較用ヘルパー
function assertNear(actual, expected, eps = EPS, message) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    message ?? `期待値 ${expected} に対して実際値 ${actual}（許容誤差 ${eps}）`
  );
}

test('補正なし: record(1) 後に誤差 0.02 未満で reconcile しても pos が変わらない', () => {
  const p = createPredictor(STAGES.kado, 2.5, 2.5);
  p.record(1);
  const before = { ...p.pos };

  // 同じ位置での reconcile
  p.reconcile(before.x, before.y, 1);
  assertNear(p.pos.x, before.x);
  assertNear(p.pos.y, before.y);

  // 誤差 0.02 未満での reconcile
  p.reconcile(before.x + 0.01, before.y, 1);
  assertNear(p.pos.x, before.x);
  assertNear(p.pos.y, before.y);
});

test('小さい誤差の補正: pos は 0.3 補正され、renderPos は直後はほぼ変わらず step で pos に近づく', () => {
  const p = createPredictor(STAGES.kado, 2.5, 2.5);
  const right = { mx: 1, my: 0, chop: false };

  p.step(right, DT);
  p.record(1);
  const rec1 = { ...p.pos };

  p.step(right, DT);
  p.record(2);

  const beforePos = { ...p.pos };
  const beforeRender = p.renderPos();

  // 記録[1] より 0.3 ずれたホスト位置で補正する
  p.reconcile(rec1.x + 0.3, rec1.y, 1);

  assertNear(p.pos.x, beforePos.x + 0.3);
  assertNear(p.pos.y, beforePos.y);

  const afterRender = p.renderPos();
  assertNear(afterRender.x, beforeRender.x, 0.05);
  assertNear(afterRender.y, beforeRender.y, 0.05);

  // step を重ねると表示オフセットが減衰し renderPos が pos に近づく
  const initialGap = Math.abs(afterRender.x - p.pos.x);
  for (let i = 0; i < 15; i += 1) {
    p.step({ mx: 0, my: 0, chop: false }, DT);
  }
  const laterGap = Math.abs(p.renderPos().x - p.pos.x);
  assert.ok(laterGap < initialGap, 'step を重ねると renderPos が pos に近づくこと');
});

test('大きい誤差: 誤差 1.5 以上の reconcile で pos と renderPos がホスト位置に一致する', () => {
  const p = createPredictor(STAGES.kado, 2.5, 2.5);
  p.record(1);

  const hx = p.pos.x + 1.6;
  const hy = p.pos.y;
  p.reconcile(hx, hy, 1);

  assertNear(p.pos.x, hx);
  assertNear(p.pos.y, hy);

  const rendered = p.renderPos();
  assertNear(rendered.x, hx);
  assertNear(rendered.y, hy);
});

test('移動中に引き戻されない: 古い ack に対する小さい誤差の reconcile でも renderPos.x が後退しない', () => {
  const p = createPredictor(STAGES.kado, 2.5, 2.5);
  const right = { mx: 1, my: 0, chop: false };

  p.step(right, DT);
  p.record(1);
  const rec1 = { ...p.pos };

  p.step(right, DT);
  p.record(2);
  p.step(right, DT);
  p.record(3);

  const beforeRenderX = p.renderPos().x;

  // 古い ack=1 に対して後方へ小さい誤差 (0.1) の補正を受ける
  p.reconcile(rec1.x - 0.1, rec1.y, 1);

  let prevRenderX = p.renderPos().x;
  assert.ok(prevRenderX >= beforeRenderX - EPS, '補正直後に renderPos.x が後退しないこと');

  // そのまま右へ移動し続けても renderPos.x が後退しない
  for (let i = 0; i < 3; i += 1) {
    p.step(right, DT);
    const nextRenderX = p.renderPos().x;
    assert.ok(nextRenderX >= prevRenderX - EPS, '移動継続中も renderPos.x が後退しないこと');
    prevRenderX = nextRenderX;
  }
});

test('ack より古い記録が捨てられる: reconcile 後に同じまたは古い ack で再補正されない', () => {
  const p = createPredictor(STAGES.kado, 2.5, 2.5);
  const right = { mx: 1, my: 0, chop: false };

  p.step(right, DT);
  p.record(1);
  const rec1 = { ...p.pos };

  p.step(right, DT);
  p.record(2);
  const rec2 = { ...p.pos };

  p.reconcile(rec2.x + 0.2, rec2.y, 2);
  const afterFirst = { ...p.pos };

  // 同じ ack での再 reconcile では二重に補正されない
  p.reconcile(rec2.x + 0.2, rec2.y, 2);
  assertNear(p.pos.x, afterFirst.x);
  assertNear(p.pos.y, afterFirst.y);

  // より古い ack でも補正されない
  p.reconcile(rec1.x + 0.2, rec1.y, 1);
  assertNear(p.pos.x, afterFirst.x);
  assertNear(p.pos.y, afterFirst.y);
});
