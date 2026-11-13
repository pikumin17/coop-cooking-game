import { T } from "../data/text.js";
import { TILE_LEGEND } from "../data/stages.js";
import { RECIPES } from "../data/recipes.js";
import { INGREDIENTS } from "../data/ingredients.js";
import { PALETTE, drawTile, drawItem, drawPlayer } from "./shapes.js";
import { drawTopHud, drawBottomHud } from "./hud.js";

/** レシピと皿の内容を順序によらず照合する。 */
function isComplete(item) {
  if (!item?.plate) {
    return false;
  }
  const contents = item.c.map(({ k, s }) => `${k}:${s}`).sort().join("|");
  return Object.values(RECIPES).some((recipe) => recipe.needs.length === item.c.length
    && recipe.needs.map(({ item: k, state: s }) => `${k}:${s}`).sort().join("|") === contents);
}

/** キャンバスに論理座標のゲーム画面を描画する。 */
export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const cache = new WeakMap();
  let scale = 1;
  /** シミュレーションに依存せず描画用タイルを解析する。 */
  function tilesFor(stage) {
    if (!cache.has(stage)) {
      cache.set(stage, stage.grid.map((row) => Array.from(row, (char) => {
        const value = stage.legend?.[char] ?? TILE_LEGEND[char];
        const [type, box] = value.split(":");
        return box === undefined ? { type } : { type, box };
      })));
    }
    return cache.get(stage);
  }
  /** 表示サイズと画素密度を反映する。 */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.ownerDocument.defaultView.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round((rect.width || 832) * dpr));
    canvas.height = Math.max(1, Math.round((rect.height || 720) * dpr));
    scale = canvas.width / 832;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  /** 進行度バーを描画する。 */
  function progress(x, y, ratio, color) {
    ctx.fillStyle = PALETTE.outline;
    ctx.fillRect(x + 8, y + 52, 48, 7);
    ctx.fillStyle = color;
    ctx.fillRect(x + 9, y + 53, 46 * Math.max(0, Math.min(1, ratio)), 5);
  }
  /** スナップショットを描画する。 */
  function render(view, ctx2) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = PALETTE.outline;
    ctx.fillRect(0, 0, 832, 720);
    if (!view) {
      return;
    }
    ctx.save();
    const { stage, roster, selfSlot, target, ping, effects, now } = ctx2;
    const tiles = tilesFor(stage);
    tiles.forEach((row, y) => row.forEach((tile, x) => {
      drawTile(ctx, tile, x * 64, 72 + y * 64, 64, now / 1000);
    }));
    for (const [key, item] of view.items) {
      const [x, y] = key.split(",").map(Number);
      drawItem(ctx, item, x * 64 + 32, 72 + y * 64 + 32, 44, isComplete(item));
    }
    for (const [key, item] of view.items) {
      if (item.plate) {
        continue;
      }
      const [x, y] = key.split(",").map(Number);
      const tile = tiles[y]?.[x];
      const { chop, cook } = INGREDIENTS[item.k] ?? {};
      const px = x * 64;
      const py = 72 + y * 64;
      if (tile?.type === "board" && chop && item.s === chop.from && item.p > 0) {
        progress(px, py, item.p / chop.time, "#3FA34D");
      }
      if (tile?.type === "stove" && cook) {
        if (item.s === cook.from) {
          progress(px, py, item.p / cook.time, "#FF8A3D");
        } else if (item.s === "cooked") {
          progress(px, py, item.p / cook.burnAfter, "#FF8A3D");
          if (item.p >= cook.burnAfter - cook.warnBefore && now % 500 < 250) {
            ctx.fillStyle = "#D64545";
            ctx.font = "bold 28px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("！", px + 32, py + 25);
          }
        }
      }
    }
    for (const player of view.players) {
      const cx = player.x * 64;
      const cy = 72 + player.y * 64;
      drawPlayer(ctx, player.slot, cx, cy, player.fx, player.fy, 48, player.slot === selfSlot);
      if (player.held) {
        drawItem(ctx, player.held, cx + player.fx * 18, cy + player.fy * 18 - 5, 28, isComplete(player.held));
      }
      const entry = roster instanceof Map ? roster.get(player.slot) : roster?.[player.slot];
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.font = "bold 12px sans-serif";
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3;
      ctx.strokeText(entry?.name ?? "", cx, cy - 29);
      ctx.fillStyle = PALETTE.outline;
      ctx.fillText(entry?.name ?? "", cx, cy - 29);
      if (player.emote > 0) {
        const text = T.emotes[player.emote - 1] ?? "";
        const width = ctx.measureText(text).width + 18;
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.roundRect(cx - width / 2, cy - 66, width, 26, 7);
        ctx.fill();
        ctx.fillStyle = PALETTE.outline;
        ctx.fillText(text, cx, cy - 48);
      }
    }
    if (target) {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3;
      ctx.strokeRect(target.x * 64 + 2, 72 + target.y * 64 + 2, 60, 60);
    }
    drawTopHud(ctx, view, stage);
    drawBottomHud(ctx, view, stage, view.players.length, ping);
    effects?.draw(ctx);
    if (view.phase === "countdown") {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 96px sans-serif";
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 8;
      const count = String(Math.ceil(view.countdown));
      ctx.strokeText(count, 416, 360);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(count, 416, 360);
    }
    ctx.restore();
  }
  resize();
  return { resize, render };
}
