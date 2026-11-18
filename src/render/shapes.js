import { RECIPES } from "../data/recipes.js";

/**
 * 描画全体で共有するカラーパレット。
 * @type {{
 *   outline: string,
 *   floorA: string,
 *   floorB: string,
 *   counter: string,
 *   counterTop: string,
 *   boxWood: string,
 *   board: string,
 *   stove: string,
 *   heat: string,
 *   serve: string,
 *   trash: string,
 *   plate: string,
 *   plateEdge: string,
 *   gold: string,
 *   playerColors: string[],
 *   leaf: string,
 *   tomato: string,
 *   bread: string,
 *   meatRaw: string,
 *   meatCooked: string,
 *   burnt: string,
 *   noodleRaw: string,
 *   noodleCooked: string,
 * }}
 */
export const PALETTE = {
  outline: "#3B2F2F",
  floorA: "#F3E3C3",
  floorB: "#EAD7B0",
  counter: "#B9855A",
  counterTop: "#D9A877",
  boxWood: "#8C5A3C",
  board: "#E8C99A",
  stove: "#4A4A4A",
  heat: "#FF8A3D",
  serve: "#2A9D8F",
  trash: "#8A8D91",
  plate: "#FFFFFF",
  plateEdge: "#C9CDD2",
  gold: "#E9B44C",
  playerColors: [
    "#E4572E",
    "#2E86DE",
    "#F2C14E",
    "#9B5DE5",
  ],
  leaf: "#7BC950",
  tomato: "#E63946",
  bread: "#E0B26B",
  meatRaw: "#F28B9B",
  meatCooked: "#8B5A2B",
  burnt: "#2B2B2B",
  noodleRaw: "#F6E7A1",
  noodleCooked: "#F4D35E",
};

/**
 * 共通の輪郭線幅（ピクセル）。
 * @type {number}
 */
const OUTLINE_WIDTH = 2;

/**
 * 輪郭線用の標準スタイルをコンテキストへ設定する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} [lineWidth=OUTLINE_WIDTH] - 線幅
 */
function applyOutlineStyle(ctx, lineWidth = OUTLINE_WIDTH) {
  ctx.strokeStyle = PALETTE.outline;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
}

/**
 * 角丸矩形のパスを作成する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} x - 左上X座標
 * @param {number} y - 左上Y座標
 * @param {number} w - 幅
 * @param {number} h - 高さ
 * @param {number} r - 角丸半径
 */
function traceRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * 塗りと2px輪郭を持つ角丸矩形を描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} x - 左上X座標
 * @param {number} y - 左上Y座標
 * @param {number} w - 幅
 * @param {number} h - 高さ
 * @param {number} r - 角丸半径
 * @param {string} fillColor - 塗りつぶし色
 */
function fillOutlinedRoundRect(ctx, x, y, w, h, r, fillColor) {
  traceRoundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fillColor;
  ctx.fill();
  applyOutlineStyle(ctx);
  ctx.stroke();
}

/**
 * 塗りと2px輪郭を持つ円を描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} cx - 中心X座標
 * @param {number} cy - 中心Y座標
 * @param {number} radius - 半径
 * @param {string} fillColor - 塗りつぶし色
 */
function fillOutlinedCircle(ctx, cx, cy, radius, fillColor) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  applyOutlineStyle(ctx);
  ctx.stroke();
}

/**
 * カウンター台（天板と縁）を描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} px - 左上X座標
 * @param {number} py - 左上Y座標
 * @param {number} size - タイルサイズ
 */
function drawCounterBase(ctx, px, py, size) {
  const pad = 1;
  const r = size * 0.14;
  fillOutlinedRoundRect(
    ctx,
    px + pad,
    py + pad,
    size - pad * 2,
    size - pad * 2,
    r,
    PALETTE.counter,
  );
  const topInset = size * 0.08;
  traceRoundRect(
    ctx,
    px + topInset,
    py + topInset,
    size - topInset * 2,
    size - topInset * 2.2,
    r * 0.7,
  );
  ctx.fillStyle = PALETTE.counterTop;
  ctx.fill();
}

/**
 * コンロの五徳（円形バーナー）を1つ描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} cx - 中心X座標
 * @param {number} cy - 中心Y座標
 * @param {number} r - 半径
 * @param {number} t - 経過時間
 */
function drawStoveBurner(ctx, cx, cy, r, t) {
  const pulse = 0.75 + 0.25 * Math.sin(t * 4);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.burnt;
  ctx.fill();
  applyOutlineStyle(ctx);
  ctx.stroke();

  // 五徳の十字サポート
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.85, cy);
  ctx.lineTo(cx + r * 0.85, cy);
  ctx.moveTo(cx, cy - r * 0.85);
  ctx.lineTo(cx, cy + r * 0.85);
  applyOutlineStyle(ctx);
  ctx.stroke();

  // 中央の火口
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.heat;
  ctx.fill();
  ctx.restore();
}

/**
 * タイル1マスを描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {{ type: string, box?: string }} tile - タイル情報
 * @param {number} px - 左上X座標（ピクセル）
 * @param {number} py - 左上Y座標（ピクセル）
 * @param {number} size - 1マスの幅・高さ（ピクセル）
 * @param {number} [t=0] - アニメーション用経過時間（秒）
 */
export function drawTile(ctx, tile, px, py, size, t = 0) {
  ctx.save();

  // 床は市松模様を基本として先に塗る
  const gx = Math.round(px / size);
  const gy = Math.round(py / size);
  const isEven = (((gx + gy) % 2) + 2) % 2 === 0;
  ctx.fillStyle = isEven ? PALETTE.floorA : PALETTE.floorB;
  ctx.fillRect(px, py, size, size);

  const cx = px + size * 0.5;
  const cy = py + size * 0.5;
  const pad = 1;
  const r = size * 0.14;

  switch (tile.type) {
    case "floor": {
      break;
    }
    case "counter": {
      drawCounterBase(ctx, px, py, size);
      break;
    }
    case "board": {
      drawCounterBase(ctx, px, py, size);
      const bw = size * 0.64;
      const bh = size * 0.5;
      fillOutlinedRoundRect(
        ctx,
        cx - bw * 0.5,
        cy - bh * 0.5,
        bw,
        bh,
        size * 0.08,
        PALETTE.board,
      );
      // 包丁を表す小さな線2本
      applyOutlineStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.24, cy - bh * 0.22);
      ctx.lineTo(cx + bw * 0.08, cy + bh * 0.1);
      ctx.moveTo(cx + bw * 0.04, cy - bh * 0.24);
      ctx.lineTo(cx + bw * 0.26, cy - bh * 0.02);
      ctx.stroke();
      break;
    }
    case "stove": {
      fillOutlinedRoundRect(
        ctx,
        px + pad,
        py + pad,
        size - pad * 2,
        size - pad * 2,
        r,
        PALETTE.stove,
      );
      const burnerR = size * 0.18;
      drawStoveBurner(ctx, cx - size * 0.2, cy - size * 0.08, burnerR, t);
      drawStoveBurner(ctx, cx + size * 0.2, cy + size * 0.14, burnerR, t);
      break;
    }
    case "box": {
      fillOutlinedRoundRect(
        ctx,
        px + pad,
        py + pad,
        size - pad * 2,
        size - pad * 2,
        r,
        PALETTE.boxWood,
      );
      // 木箱の枠線
      const inner = size * 0.14;
      traceRoundRect(
        ctx,
        px + inner,
        py + inner,
        size - inner * 2,
        size - inner * 2,
        r * 0.5,
      );
      ctx.fillStyle = PALETTE.counter;
      ctx.fill();
      applyOutlineStyle(ctx);
      ctx.stroke();
      if (tile.box) {
        drawIngredient(ctx, tile.box, "raw", cx, cy, size * 0.52);
      }
      break;
    }
    case "shelf": {
      drawCounterBase(ctx, px, py, size);
      const plateR = size * 0.24;
      const offsets = [
        { dx: -size * 0.06, dy: size * 0.07 },
        { dx: 0, dy: 0 },
        { dx: size * 0.06, dy: -size * 0.07 },
      ];
      for (const offset of offsets) {
        fillOutlinedCircle(
          ctx,
          cx + offset.dx,
          cy + offset.dy,
          plateR,
          PALETTE.plate,
        );
      }
      break;
    }
    case "serve": {
      fillOutlinedRoundRect(
        ctx,
        px + pad,
        py + pad,
        size - pad * 2,
        size - pad * 2,
        r,
        PALETTE.serve,
      );
      // 右向き矢印
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.28, cy + size * 0.12);
      ctx.lineTo(cx + size * 0.04, cy + size * 0.12);
      ctx.lineTo(cx + size * 0.04, cy + size * 0.02);
      ctx.lineTo(cx + size * 0.26, cy + size * 0.18);
      ctx.lineTo(cx + size * 0.04, cy + size * 0.34);
      ctx.lineTo(cx + size * 0.04, cy + size * 0.24);
      ctx.lineTo(cx - size * 0.28, cy + size * 0.24);
      ctx.closePath();
      ctx.fillStyle = PALETTE.plate;
      ctx.fill();
      applyOutlineStyle(ctx);
      ctx.stroke();

      // 呼び出しベルの図形
      const bellX = cx;
      const bellY = cy - size * 0.12;
      const bellR = size * 0.15;
      ctx.beginPath();
      ctx.arc(bellX, bellY, bellR, Math.PI, 0);
      ctx.lineTo(bellX + bellR * 1.15, bellY + size * 0.05);
      ctx.lineTo(bellX - bellR * 1.15, bellY + size * 0.05);
      ctx.closePath();
      ctx.fillStyle = PALETTE.gold;
      ctx.fill();
      applyOutlineStyle(ctx);
      ctx.stroke();

      fillOutlinedCircle(
        ctx,
        bellX,
        bellY - bellR - size * 0.02,
        size * 0.04,
        PALETTE.gold,
      );
      break;
    }
    case "trash": {
      const binR = size * 0.34;
      fillOutlinedCircle(ctx, cx, cy, binR, PALETTE.trash);
      // フタの線
      applyOutlineStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(cx - binR * 0.65, cy - size * 0.06);
      ctx.lineTo(cx + binR * 0.65, cy - size * 0.06);
      ctx.moveTo(cx - binR * 0.35, cy + size * 0.08);
      ctx.lineTo(cx + binR * 0.35, cy + size * 0.08);
      ctx.stroke();
      break;
    }
    default: {
      break;
    }
  }

  ctx.restore();
}

/**
 * 波打つ円または歪んだ円のパスを描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} cx - 中心X座標
 * @param {number} cy - 中心Y座標
 * @param {number} baseR - 基準半径
 * @param {number} steps - 分割数
 * @param {(angle: number) => number} radiusFn - 角度に応じた半径倍率関数
 * @param {string} fillColor - 塗りつぶし色
 */
function fillOrganicBlob(ctx, cx, cy, baseR, steps, radiusFn, fillColor) {
  ctx.beginPath();
  for (let i = 0; i < steps; i += 1) {
    const angle = (Math.PI * 2 * i) / steps;
    const rad = baseR * radiusFn(angle);
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  applyOutlineStyle(ctx);
  ctx.stroke();
}

/**
 * 麺のジグザグ束を描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} cx - 中心X座標
 * @param {number} cy - 中心Y座標
 * @param {number} size - 描画目安サイズ
 * @param {string} strandColor - 麺本体の色
 * @param {string} borderColor - 輪郭色
 */
function drawNoodleBundle(ctx, cx, cy, size, strandColor, borderColor) {
  const halfW = size * 0.34;
  const rows = [-size * 0.14, 0, size * 0.14];
  const waveAmp = size * 0.06;
  const strandWidth = Math.max(3, size * 0.1);

  const traceStrands = () => {
    ctx.beginPath();
    for (const rowOffset of rows) {
      const y = cy + rowOffset;
      ctx.moveTo(cx - halfW, y);
      ctx.lineTo(cx - halfW * 0.35, y - waveAmp);
      ctx.lineTo(cx + halfW * 0.35, y + waveAmp);
      ctx.lineTo(cx + halfW, y);
    }
  };

  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  traceStrands();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = strandWidth + OUTLINE_WIDTH * 2;
  ctx.stroke();

  traceStrands();
  ctx.strokeStyle = strandColor;
  ctx.lineWidth = strandWidth;
  ctx.stroke();
}

/**
 * 食材を種類と状態に応じて描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {string} k - 食材種別（"leaf" | "tomato" | "bread" | "meat" | "noodle"）
 * @param {string} s - 状態（"raw" | "chopped" | "cooked" | "burnt"）
 * @param {number} cx - 中心X座標（ピクセル）
 * @param {number} cy - 中心Y座標（ピクセル）
 * @param {number} size - 一辺の目安サイズ（ピクセル）
 */
export function drawIngredient(ctx, k, s, cx, cy, size) {
  ctx.save();
  const r = size * 0.38;

  switch (k) {
    case "leaf": {
      if (s === "chopped") {
        const pieces = [
          { dx: -size * 0.16, dy: -size * 0.1, rot: -0.5 },
          { dx: size * 0.16, dy: -size * 0.06, rot: 0.4 },
          { dx: -size * 0.02, dy: size * 0.16, rot: 0.1 },
        ];
        for (const piece of pieces) {
          ctx.save();
          ctx.translate(cx + piece.dx, cy + piece.dy);
          ctx.rotate(piece.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, size * 0.16, size * 0.09, 0, 0, Math.PI * 2);
          ctx.fillStyle = PALETTE.leaf;
          ctx.fill();
          applyOutlineStyle(ctx);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        fillOrganicBlob(
          ctx,
          cx,
          cy,
          r,
          28,
          (angle) => 1 + 0.14 * Math.sin(angle * 7),
          PALETTE.leaf,
        );
      }
      break;
    }
    case "tomato": {
      if (s === "chopped") {
        const slices = [
          { dx: -size * 0.1, dy: -size * 0.06, rot: -0.35 },
          { dx: size * 0.12, dy: size * 0.1, rot: 0.25 },
        ];
        for (const slice of slices) {
          ctx.save();
          ctx.translate(cx + slice.dx, cy + slice.dy);
          ctx.rotate(slice.rot);
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.24, 0, Math.PI);
          ctx.closePath();
          ctx.fillStyle = PALETTE.tomato;
          ctx.fill();
          applyOutlineStyle(ctx);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        fillOutlinedCircle(ctx, cx, cy, r, PALETTE.tomato);
        // 緑のヘタ
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.55);
        ctx.lineTo(cx - r * 0.4, cy - r * 0.9);
        ctx.lineTo(cx - r * 0.12, cy - r * 0.5);
        ctx.lineTo(cx, cy - r * 0.95);
        ctx.lineTo(cx + r * 0.12, cy - r * 0.5);
        ctx.lineTo(cx + r * 0.4, cy - r * 0.9);
        ctx.closePath();
        ctx.fillStyle = PALETTE.leaf;
        ctx.fill();
        applyOutlineStyle(ctx);
        ctx.stroke();
      }
      break;
    }
    case "bread": {
      const bw = size * 0.72;
      const bh = size * 0.52;
      fillOutlinedRoundRect(
        ctx,
        cx - bw * 0.5,
        cy - bh * 0.5,
        bw,
        bh,
        size * 0.16,
        PALETTE.bread,
      );
      applyOutlineStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.16, cy - bh * 0.2);
      ctx.lineTo(cx - bw * 0.04, cy + bh * 0.14);
      ctx.moveTo(cx + bw * 0.08, cy - bh * 0.2);
      ctx.lineTo(cx + bw * 0.2, cy + bh * 0.14);
      ctx.stroke();
      break;
    }
    case "meat": {
      if (s === "chopped") {
        fillOutlinedCircle(ctx, cx, cy, r * 0.92, PALETTE.meatRaw);
      } else if (s === "cooked") {
        fillOutlinedCircle(ctx, cx, cy, r * 0.92, PALETTE.meatCooked);
        applyOutlineStyle(ctx);
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.45, cy - r * 0.2);
        ctx.lineTo(cx + r * 0.45, cy - r * 0.2);
        ctx.moveTo(cx - r * 0.45, cy + r * 0.2);
        ctx.lineTo(cx + r * 0.45, cy + r * 0.2);
        ctx.stroke();
      } else if (s === "burnt") {
        fillOutlinedCircle(ctx, cx, cy + size * 0.04, r * 0.88, PALETTE.burnt);
        // 焦げの煙（灰色の小さな円2つ）
        fillOutlinedCircle(
          ctx,
          cx - size * 0.14,
          cy - size * 0.26,
          size * 0.08,
          PALETTE.trash,
        );
        fillOutlinedCircle(
          ctx,
          cx + size * 0.12,
          cy - size * 0.34,
          size * 0.1,
          PALETTE.trash,
        );
      } else {
        fillOrganicBlob(
          ctx,
          cx,
          cy,
          r,
          20,
          (angle) => 0.94 + 0.14 * Math.cos(angle * 3) + 0.08 * Math.sin(angle * 2),
          PALETTE.meatRaw,
        );
      }
      break;
    }
    case "noodle": {
      if (s === "cooked") {
        fillOutlinedCircle(ctx, cx, cy, r, PALETTE.noodleCooked);
        // 渦巻き線
        ctx.beginPath();
        const turns = 2.2;
        const maxR = r * 0.72;
        const totalSteps = 28;
        for (let i = 0; i <= totalSteps; i += 1) {
          const ratio = i / totalSteps;
          const angle = ratio * Math.PI * 2 * turns;
          const rad = ratio * maxR;
          const x = cx + Math.cos(angle) * rad;
          const y = cy + Math.sin(angle) * rad;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        applyOutlineStyle(ctx);
        ctx.stroke();
      } else if (s === "burnt") {
        drawNoodleBundle(ctx, cx, cy, size, PALETTE.burnt, PALETTE.plateEdge);
      } else {
        drawNoodleBundle(ctx, cx, cy, size, PALETTE.noodleRaw, PALETTE.outline);
      }
      break;
    }
    default: {
      break;
    }
  }

  ctx.restore();
}

/**
 * お皿と載っている食材を描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {Array<{ k: string, s: string }>} contents - お皿の上の食材リスト
 * @param {number} cx - 中心X座標（ピクセル）
 * @param {number} cy - 中心Y座標（ピクセル）
 * @param {number} size - お皿の目安サイズ（ピクセル）
 * @param {boolean} [complete=false] - 完成品として強調表示するか
 */
export function drawPlate(ctx, contents, cx, cy, size, complete = false) {
  ctx.save();

  const plateR = size * 0.44;
  fillOutlinedCircle(ctx, cx, cy, plateR, PALETTE.plate);

  // 内縁（完成時は金色で太くする）
  ctx.beginPath();
  ctx.arc(cx, cy, plateR * 0.78, 0, Math.PI * 2);
  ctx.strokeStyle = complete ? PALETTE.gold : PALETTE.plateEdge;
  ctx.lineWidth = complete ? Math.max(3, size * 0.09) : Math.max(2, size * 0.05);
  ctx.stroke();

  if (complete) {
    ctx.beginPath();
    ctx.arc(cx, cy, plateR + 2, 0, Math.PI * 2);
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const list = Array.isArray(contents) ? contents : [];
  const count = list.length;
  if (count === 1) {
    drawIngredient(ctx, list[0].k, list[0].s, cx, cy, size * 0.56);
  } else if (count > 1) {
    const spread = size * 0.13;
    const itemSize = size * 0.46;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count - Math.PI * 0.5;
      const ix = cx + Math.cos(angle) * spread;
      const iy = cy + Math.sin(angle) * spread;
      drawIngredient(ctx, list[i].k, list[i].s, ix, iy, itemSize);
    }
  }

  ctx.restore();
}

/**
 * 手持ちまたは台上のアイテム（お皿または単体食材）を描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {{ plate?: boolean, c?: Array<{ k: string, s: string }>, k?: string, s?: string } | null | undefined} item - アイテム情報
 * @param {number} cx - 中心X座標（ピクセル）
 * @param {number} cy - 中心Y座標（ピクセル）
 * @param {number} size - 描画目安サイズ（ピクセル）
 * @param {boolean} [complete=false] - お皿が完成レシピを満たしているか
 */
export function drawItem(ctx, item, cx, cy, size, complete = false) {
  if (!item) {
    return;
  }
  if (item.plate) {
    drawPlate(ctx, item.c ?? [], cx, cy, size, complete);
    return;
  }
  if (item.k) {
    drawIngredient(ctx, item.k, item.s ?? "raw", cx, cy, size);
  }
}

/**
 * プレイヤーのコック帽をスロット別デザインで描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} slot - プレイヤースロット（0〜3）
 * @param {number} cx - 帽子中心X座標
 * @param {number} baseY - 帽子下端Y座標
 * @param {number} size - プレイヤー基準サイズ
 * @param {string} bandColor - 帯の色（プレイヤー体色）
 */
function drawChefHat(ctx, slot, cx, baseY, size, bandColor) {
  const hatW = size * 0.44;
  const bandH = size * 0.1;

  switch (slot % 4) {
    case 0: {
      // 丸いコック帽（白い膨らみ）
      const puffY = baseY - size * 0.14;
      fillOutlinedCircle(ctx, cx - hatW * 0.28, puffY, size * 0.12, PALETTE.plate);
      fillOutlinedCircle(ctx, cx + hatW * 0.28, puffY, size * 0.12, PALETTE.plate);
      fillOutlinedCircle(ctx, cx, puffY - size * 0.04, size * 0.15, PALETTE.plate);
      break;
    }
    case 1: {
      // 四角い帽子
      const h = size * 0.24;
      fillOutlinedRoundRect(
        ctx,
        cx - hatW * 0.46,
        baseY - h,
        hatW * 0.92,
        h,
        size * 0.04,
        PALETTE.plate,
      );
      break;
    }
    case 2: {
      // 三角ずきん
      ctx.beginPath();
      ctx.moveTo(cx, baseY - size * 0.28);
      ctx.lineTo(cx + hatW * 0.55, baseY);
      ctx.lineTo(cx - hatW * 0.55, baseY);
      ctx.closePath();
      ctx.fillStyle = PALETTE.plate;
      ctx.fill();
      applyOutlineStyle(ctx);
      ctx.stroke();
      break;
    }
    default: {
      // とんがり帽
      ctx.beginPath();
      ctx.moveTo(cx, baseY - size * 0.38);
      ctx.lineTo(cx + hatW * 0.44, baseY);
      ctx.lineTo(cx - hatW * 0.44, baseY);
      ctx.closePath();
      ctx.fillStyle = PALETTE.plate;
      ctx.fill();
      applyOutlineStyle(ctx);
      ctx.stroke();
      break;
    }
  }

  // 体色の帯
  fillOutlinedRoundRect(
    ctx,
    cx - hatW * 0.48,
    baseY - bandH * 0.6,
    hatW * 0.96,
    bandH,
    size * 0.03,
    bandColor,
  );
}

/**
 * プレイヤーキャラクターを描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {number} slot - プレイヤースロット（0〜3）
 * @param {number} cx - 中心X座標（ピクセル）
 * @param {number} cy - 中心Y座標（ピクセル）
 * @param {number} fx - 向きベクトルX
 * @param {number} fy - 向きベクトルY
 * @param {number} size - 基準サイズ（ピクセル）
 * @param {boolean} [isSelf=false] - 自プレイヤーかどうか
 */
export function drawPlayer(ctx, slot, cx, cy, fx, fy, size, isSelf = false) {
  ctx.save();

  const colors = PALETTE.playerColors;
  const color = colors[((slot % colors.length) + colors.length) % colors.length];
  const bodyR = size * 0.33;

  // 向きベクトルを正規化
  const len = Math.hypot(fx, fy);
  const dx = len > 0 ? fx / len : 0;
  const dy = len > 0 ? fy / len : 1;
  const px = -dy;
  const py = dx;

  // 自プレイヤー足元の白いリング
  if (isSelf) {
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy + bodyR * 0.78,
      bodyR * 1.18,
      bodyR * 0.44,
      0,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = PALETTE.plate;
    ctx.lineWidth = Math.max(2.5, size * 0.06);
    ctx.stroke();
  }

  // 手（向き方向に小さな円2つ）
  const handR = size * 0.09;
  const handDist = bodyR * 0.95;
  const handSpread = bodyR * 0.62;
  fillOutlinedCircle(
    ctx,
    cx + dx * handDist + px * handSpread,
    cy + dy * handDist + py * handSpread,
    handR,
    color,
  );
  fillOutlinedCircle(
    ctx,
    cx + dx * handDist - px * handSpread,
    cy + dy * handDist - py * handSpread,
    handR,
    color,
  );

  // 丸い体
  fillOutlinedCircle(ctx, cx, cy, bodyR, color);

  // 目（向き方向に少し寄せた2つの点）
  const eyeDist = bodyR * 0.45;
  const eyeSpread = bodyR * 0.3;
  const eyeR = Math.max(2, size * 0.05);
  ctx.fillStyle = PALETTE.outline;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(
      cx + dx * eyeDist + px * eyeSpread * side,
      cy + dy * eyeDist + py * eyeSpread * side,
      eyeR,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // 上にコック帽
  drawChefHat(ctx, slot, cx, cy - bodyR * 0.68, size, color);

  ctx.restore();
}

/**
 * レシピの完成イメージアイコンをお皿付きで描画する。
 * @param {CanvasRenderingContext2D} ctx - 描画コンテキスト
 * @param {string} recipeKey - RECIPES のキー名
 * @param {number} cx - 中心X座標（ピクセル）
 * @param {number} cy - 中心Y座標（ピクセル）
 * @param {number} size - 描画目安サイズ（ピクセル）
 */
export function drawRecipeIcon(ctx, recipeKey, cx, cy, size) {
  const recipe = RECIPES[recipeKey];
  if (!recipe) {
    return;
  }
  drawPlate(ctx, recipe.needs.map(({ item, state }) => ({ k: item, s: state })), cx, cy, size, false);
}
