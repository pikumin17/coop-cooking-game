import { test } from "node:test";
import assert from "node:assert/strict";

import { PROTOCOL_VERSION } from "../src/config.js";
import {
  validateFromClient,
  validateFromHost,
  sanitizeName,
} from "../src/net/protocol.js";
import { createWorld } from "../src/sim/world.js";
import { encodeSnap, decodeSnap } from "../src/sim/snapshot.js";

test("1. 正常な hello は通り、名前が整形される", () => {
  const res = validateFromClient({
    t: "hello",
    name: "あいうえお\u0000かきくけこ",
    v: PROTOCOL_VERSION,
  });

  assert.deepEqual(res, {
    t: "hello",
    name: "あいうえおかきく",
    v: PROTOCOL_VERSION,
  });
});

test("2. バージョンが違う hello は null", () => {
  const res = validateFromClient({
    t: "hello",
    name: "たろう",
    v: PROTOCOL_VERSION + 1,
  });

  assert.equal(res, null);
});

test("3. in の入力検証とクランプ", () => {
  // mx が 5 なら 1 にクランプされる
  const clamped = validateFromClient({
    t: "in",
    seq: 0,
    mx: 5,
    my: -3,
    chop: false,
  });
  assert.deepEqual(clamped, {
    t: "in",
    seq: 0,
    mx: 1,
    my: -1,
    chop: false,
  });

  // mx が文字列なら null
  assert.equal(
    validateFromClient({
      t: "in",
      seq: 1,
      mx: "5",
      my: 0,
      chop: false,
    }),
    null,
  );

  // seq が -1 なら null
  assert.equal(
    validateFromClient({
      t: "in",
      seq: -1,
      mx: 0,
      my: 0,
      chop: false,
    }),
    null,
  );

  // seq が非整数なら null
  assert.equal(
    validateFromClient({
      t: "in",
      seq: 1.5,
      mx: 0,
      my: 0,
      chop: false,
    }),
    null,
  );
});

test("4. act emote の n の範囲検証", () => {
  // n が 9 なら null
  assert.equal(
    validateFromClient({ t: "act", a: "emote", n: 9 }),
    null,
  );

  // n が 2 なら通る
  assert.deepEqual(
    validateFromClient({ t: "act", a: "emote", n: 2 }),
    { t: "act", a: "emote", n: 2 },
  );
});

test("5. 未知の t や、オブジェクトでない入力は null", () => {
  const invalidInputs = [
    { t: "unknown" },
    null,
    undefined,
    "hello",
    123,
    true,
    [],
  ];

  for (const input of invalidInputs) {
    assert.equal(validateFromClient(input), null);
    assert.equal(validateFromHost(input), null);
  }
});

test("6. sanitizeName の文字数制限・制御文字除去・空文字フォールバック", () => {
  // 10文字の名前は8文字になる
  assert.equal(sanitizeName("1234567890"), "12345678");

  // 制御文字（\u0000 など）を含む名前から制御文字が消える
  assert.equal(sanitizeName("ab\u0000cd\u001f"), "abcd");

  // 空文字は "コック" になる
  assert.equal(sanitizeName(""), "コック");
});

test("7. snap の往復で tick・score・shelf・players の長さが保たれる", () => {
  const world = createWorld("kado", 1, [{ slot: 0, name: "a" }]);
  const snap = encodeSnap(world);
  const wire = JSON.parse(JSON.stringify(snap));
  const decoded = decodeSnap(wire);

  assert.ok(decoded !== null && typeof decoded === "object");
  assert.equal(decoded.tick, world.tick);
  assert.equal(decoded.score, world.score);
  assert.equal(decoded.shelf, world.shelf);
  assert.equal(decoded.players.length, Object.keys(world.players).length);
});
