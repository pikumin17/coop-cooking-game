import {
  PLAYER_SPEED,
  DASH_SPEED,
  DASH_TIME,
  DASH_COOLDOWN,
  PLAYER_RADIUS,
  TARGET_OFFSET,
} from "../config.js";

/**
 * 移動に必要なプレイヤーの状態。
 * @typedef {{x: number, y: number, fx: number, fy: number, dashT: number, dashCd: number}} MovingPlayer
 */

// 円とタイルの交差幅から、移動軸上の許容位置を求める。
function moveAxis(p, amount, axis, tiles) {
  if (amount === 0) {
    return;
  }
  const other = axis === "x" ? "y" : "x";
  let position = p[axis] + amount;
  const cx = axis === "x" ? position : p.x;
  const cy = axis === "y" ? position : p.y;
  for (let y = Math.floor(cy - PLAYER_RADIUS); y <= Math.floor(cy + PLAYER_RADIUS); y += 1) {
    for (let x = Math.floor(cx - PLAYER_RADIUS); x <= Math.floor(cx + PLAYER_RADIUS); x += 1) {
      if (tiles[y]?.[x]?.type === "floor") {
        continue;
      }
      const near = axis === "x" ? y : x;
      const nearest = Math.max(near, Math.min(p[other], near + 1));
      const distance = p[other] - nearest;
      if (Math.abs(distance) >= PLAYER_RADIUS) {
        continue;
      }
      const reach = Math.sqrt(PLAYER_RADIUS ** 2 - distance ** 2);
      const edge = axis === "x" ? x : y;
      if (position + reach <= edge || position - reach >= edge + 1) {
        continue;
      }
      position = amount > 0
        ? Math.min(position, edge - reach)
        : Math.max(position, edge + 1 + reach);
    }
  }
  p[axis] = position;
}

/**
 * 入力を正規化し、円とタイルの衝突を横、縦の順で解決して移動する。
 * @param {MovingPlayer} p 更新するプレイヤー
 * @param {{mx: number, my: number}} input 移動入力
 * @param {number} dt 経過秒（非負）
 * @param {import("./world.js").Tile[][]} tiles タイル配列
 */
export function stepMovement(p, input, dt, tiles) {
  const length = Math.hypot(input.mx, input.my);
  if (length > 0) {
    const angle = Math.round(Math.atan2(input.my, input.mx) / (Math.PI / 4));
    // 三角関数の微小誤差を避け、軸方向は正確なゼロにする。
    const directions = [
      [1, 0],
      [Math.SQRT1_2, Math.SQRT1_2],
      [0, 1],
      [-Math.SQRT1_2, Math.SQRT1_2],
      [-1, 0],
      [-Math.SQRT1_2, -Math.SQRT1_2],
      [0, -1],
      [Math.SQRT1_2, -Math.SQRT1_2],
    ];
    [p.fx, p.fy] = directions[(angle + 8) % 8];
    const distance = (p.dashT > 0 ? DASH_SPEED : PLAYER_SPEED) * dt;
    const dx = input.mx / length * distance;
    const dy = input.my / length * distance;
    // 大きな更新間隔でも壁を通り抜けないよう、小さな移動に分割する。
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / PLAYER_RADIUS));
    for (let i = 0; i < steps; i += 1) {
      moveAxis(p, dx / steps, "x", tiles);
      moveAxis(p, dy / steps, "y", tiles);
    }
  }
  p.dashT = Math.max(0, p.dashT - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
}

/**
 * 再使用待ちでなければダッシュを開始する。
 * @param {MovingPlayer} p 更新するプレイヤー
 * @returns {boolean} 開始できたか
 */
export function tryDash(p) {
  if (p.dashCd > 0) {
    return false;
  }
  p.dashT = DASH_TIME;
  p.dashCd = DASH_COOLDOWN;
  return true;
}

/**
 * 前方、横成分のみ、縦成分のみの順で床以外の操作対象を探す。
 * 範囲外や床だけの場合は null を返す。
 * @param {MovingPlayer} p プレイヤー
 * @param {import("./world.js").Tile[][]} tiles タイル配列
 * @returns {{x: number, y: number}|null} 対象マスの座標
 */
export function targetTile(p, tiles) {
  const candidates = [
    [p.x + p.fx * TARGET_OFFSET, p.y + p.fy * TARGET_OFFSET],
    [p.x + p.fx * TARGET_OFFSET, p.y],
    [p.x, p.y + p.fy * TARGET_OFFSET],
  ];
  for (const [px, py] of candidates) {
    const x = Math.floor(px);
    const y = Math.floor(py);
    const tile = tiles[y]?.[x];
    if (tile && tile.type !== "floor") {
      return { x, y };
    }
  }
  return null;
}
