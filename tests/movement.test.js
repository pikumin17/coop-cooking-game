import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stepMovement, tryDash, targetTile } from "../src/sim/movement.js";

const DT = 1 / 60;

// 全マス floor のタイル配列 [y][x] を生成する
function createFloorTiles(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "floor" }))
  );
}

// targetTile の戻り値形式（タイル自体または座標付きオブジェクト）を吸収して検証する
function assertTarget(res, expectedX, expectedY, expectedTile) {
  assert.ok(res !== null && res !== undefined, "対象マスが見つかるべき");
  if (res.tile !== undefined) {
    assert.equal(res.x ?? res.tx, expectedX);
    assert.equal(res.y ?? res.ty, expectedY);
    assert.equal(res.tile, expectedTile);
  } else if ((res.x ?? res.tx) !== undefined && (res.y ?? res.ty) !== undefined) {
    assert.equal(res.x ?? res.tx, expectedX);
    assert.equal(res.y ?? res.ty, expectedY);
    if (res.type !== undefined) {
      assert.equal(res.type, expectedTile.type);
    }
  } else {
    assert.equal(res, expectedTile);
  }
}

describe("movement", () => {
  it("1. 壁で止まる: 右隣が counter のとき右へ1秒進んでも右端が壁の左端を超えない", () => {
    const tiles = createFloorTiles(5, 5);
    tiles[2][2] = { type: "counter" };

    const p = { x: 1.5, y: 2.5, fx: 1, fy: 0, dashT: 0, dashCd: 0 };
    for (let i = 0; i < 60; i++) {
      stepMovement(p, { mx: 1, my: 0 }, DT, tiles);
    }

    // 壁 (2, 2) の左端は x = 2。プレイヤー右端 p.x + 0.35 は 2 を超えない
    assert.ok(p.x > 1.5, "壁に当たるまでは右へ進んでいるべき");
    assert.ok(p.x + 0.35 <= 2 + 1e-6, "プレイヤーの右端が壁の左端を超えてはいけない");
    assert.ok(Math.abs(p.y - 2.5) < 0.01);
  });

  it("2. 壁沿いに滑る: 壁に向かって斜め入力でも壁に沿う方向には進む", () => {
    const tiles = createFloorTiles(5, 5);
    for (let y = 0; y < 5; y++) {
      tiles[y][2] = { type: "counter" };
    }

    const p = { x: 1.5, y: 1.5, fx: 1, fy: 0, dashT: 0, dashCd: 0 };
    for (let i = 0; i < 30; i++) {
      stepMovement(p, { mx: 1, my: 1 }, DT, tiles);
    }

    assert.ok(p.x + 0.35 <= 2 + 1e-6, "壁方向にはめり込まない");
    assert.ok(p.y > 2.0, "壁に沿った下方向には進むべき");
  });

  it("3. 斜めでも速さは4: 斜めに1秒進んだ距離が約4になる", () => {
    const tiles = createFloorTiles(7, 7);
    const startX = 1.5;
    const startY = 1.5;
    const p = { x: startX, y: startY, fx: 1, fy: 0, dashT: 0, dashCd: 0 };

    for (let i = 0; i < 60; i++) {
      stepMovement(p, { mx: 1, my: 1 }, DT, tiles);
    }

    const dist = Math.hypot(p.x - startX, p.y - startY);
    assert.ok(Math.abs(dist - 4) < 0.05, `斜め1秒の移動距離 ${dist} が約4であるべき`);
  });

  it("4. ダッシュ: 0.25秒間は速さ8でその後は4に戻り、クールダウン1秒後に再使用できる", () => {
    const tiles = createFloorTiles(12, 5);
    const p = { x: 1.5, y: 2.5, fx: 1, fy: 0, dashT: 0, dashCd: 0 };

    assert.equal(tryDash(p), true, "初回ダッシュは成功する");
    assert.equal(tryDash(p), false, "クールダウン中の連続ダッシュは失敗する");

    // 0.20秒（12フレーム）間は確実にダッシュ状態（速さ8 → 距離1.6）
    for (let i = 0; i < 12; i++) {
      stepMovement(p, { mx: 1, my: 0 }, DT, tiles);
    }
    assert.ok(Math.abs((p.x - 1.5) - 1.6) < 0.01, "ダッシュ中は速さ8で移動する");

    // ダッシュ終了境界（0.25秒）をまたいで 0.30秒（計18フレーム）まで進める
    for (let i = 0; i < 6; i++) {
      stepMovement(p, { mx: 1, my: 0 }, DT, tiles);
    }

    // 0.30秒〜0.55秒（15フレーム = 0.25秒間）は通常速度4に戻る（距離1.0）
    const xAfterDash = p.x;
    for (let i = 0; i < 15; i++) {
      stepMovement(p, { mx: 1, my: 0 }, DT, tiles);
    }
    assert.ok(Math.abs((p.x - xAfterDash) - 1.0) < 0.01, "ダッシュ終了後は速さ4に戻る");

    // 計58フレーム（約0.97秒）時点ではまだクールダウン1秒以内なので false
    for (let i = 0; i < 25; i++) {
      stepMovement(p, { mx: 1, my: 0 }, DT, tiles);
    }
    assert.equal(tryDash(p), false, "1秒未満ではダッシュできない");

    // 計61フレーム（1秒経過後）は再びダッシュ可能
    for (let i = 0; i < 3; i++) {
      stepMovement(p, { mx: 1, my: 0 }, DT, tiles);
    }
    assert.equal(tryDash(p), true, "クールダウン1秒経過後は再びダッシュできる");
  });

  it("5. 角を抜けない: 斜め先が solid の角に向かって進んでも solid タイル内に入らない", () => {
    const tiles = createFloorTiles(5, 5);
    tiles[2][2] = { type: "counter" };

    const p = { x: 1.5, y: 1.5, fx: 1, fy: 0, dashT: 0, dashCd: 0 };
    for (let i = 0; i < 60; i++) {
      stepMovement(p, { mx: 1, my: 1 }, DT, tiles);
      const inSolidTile = p.x >= 2 && p.x < 3 && p.y >= 2 && p.y < 3;
      assert.equal(inSolidTile, false, "プレイヤー中心が solid タイルの範囲内に入ってはいけない");
    }
  });

  it("6. targetTile: 上下左右と斜め代替規則（B14）および floor のみの null 判定", () => {
    const tiles = createFloorTiles(5, 5);
    tiles[1][2] = { type: "stove" }; // 上
    tiles[3][2] = { type: "sink" }; // 下
    tiles[2][1] = { type: "board" }; // 左
    tiles[2][3] = { type: "counter" }; // 右

    // 上下左右それぞれの正面の設備マスを返す
    assertTarget(targetTile({ x: 2.5, y: 2.5, fx: 0, fy: -1, dashT: 0, dashCd: 0 }, tiles), 2, 1, tiles[1][2]);
    assertTarget(targetTile({ x: 2.5, y: 2.5, fx: 0, fy: 1, dashT: 0, dashCd: 0 }, tiles), 2, 3, tiles[3][2]);
    assertTarget(targetTile({ x: 2.5, y: 2.5, fx: -1, fy: 0, dashT: 0, dashCd: 0 }, tiles), 1, 2, tiles[2][1]);
    assertTarget(targetTile({ x: 2.5, y: 2.5, fx: 1, fy: 0, dashT: 0, dashCd: 0 }, tiles), 3, 2, tiles[2][3]);

    // 斜め向きで前方 0.6 が floor (3, 3) のとき、x成分だけの代替で (3, 2) が見つかる
    const diagTilesX = createFloorTiles(5, 5);
    diagTilesX[2][3] = { type: "counter" };
    assertTarget(
      targetTile({ x: 2.7, y: 2.7, fx: Math.SQRT1_2, fy: Math.SQRT1_2, dashT: 0, dashCd: 0 }, diagTilesX),
      3,
      2,
      diagTilesX[2][3]
    );

    // 斜め向きで前方 0.6 と x成分だけ (3, 2) が floor のとき、y成分だけの代替で (2, 3) が見つかる
    const diagTilesY = createFloorTiles(5, 5);
    diagTilesY[3][2] = { type: "sink" };
    assertTarget(
      targetTile({ x: 2.7, y: 2.7, fx: Math.SQRT1_2, fy: Math.SQRT1_2, dashT: 0, dashCd: 0 }, diagTilesY),
      2,
      3,
      diagTilesY[3][2]
    );

    // すべて floor の方向では null を返す
    const floorOnly = createFloorTiles(5, 5);
    assert.equal(targetTile({ x: 2.5, y: 2.5, fx: 1, fy: 0, dashT: 0, dashCd: 0 }, floorOnly), null);
    assert.equal(
      targetTile({ x: 2.7, y: 2.7, fx: Math.SQRT1_2, fy: Math.SQRT1_2, dashT: 0, dashCd: 0 }, floorOnly),
      null
    );
  });
});
