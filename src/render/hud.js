import { T } from "../data/text.js";
import { RECIPES } from "../data/recipes.js";
import { PALETTE, drawRecipeIcon, drawIngredient } from "./shapes.js";

/** 上部の注文、コイン、残り時間を論理座標で描画する。 */
export function drawTopHud(ctx, view, stage) {
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  view.orders.slice(0, 5).forEach((order, index) => {
    const x = 4 + index * 156;
    const recipe = RECIPES[order.recipe];
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, 4, 150, 64);
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 4, 150, 64);
    drawRecipeIcon(ctx, order.recipe, x + 25, 30, 38);
    ctx.fillStyle = PALETTE.outline;
    ctx.font = "11px sans-serif";
    ctx.fillText(recipe?.name ?? "", x + 48, 19, 98);
    recipe?.needs.forEach((need, i) => {
      drawIngredient(ctx, need.item, need.state, x + 59 + i * 24, 41, 18);
    });
    const ratio = Math.max(0, Math.min(1, order.left / order.limit));
    ctx.fillStyle = "#DDD5C5";
    ctx.fillRect(x + 2, 60, 146, 6);
    if (order.left >= 10 || view.tick % 30 < 15) {
      ctx.fillStyle = ratio > 0.5 ? "#3FA34D" : ratio > 0.25 ? "#E9B44C" : "#D64545";
      ctx.fillRect(x + 2, 60, 146 * ratio, 6);
    }
  });
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(790, 18, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "bold 12px sans-serif";
  ctx.fillText(String(view.score), 800, 18, 30);
  const seconds = Math.max(0, Math.ceil(view.timeLeft));
  ctx.textAlign = "right";
  ctx.fillStyle = view.timeLeft <= 30 ? "#D64545" : "#FFFFFF";
  ctx.fillText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`, 828, 48);
  ctx.restore();
}

/** 下部の操作説明、次の星、通信状態を描画する。 */
export function drawBottomHud(ctx, view, stage, playerCount, pingMs) {
  ctx.save();
  ctx.fillStyle = "#F3E3C3";
  ctx.fillRect(0, 648, 832, 72);
  ctx.fillStyle = PALETTE.outline;
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(T.keysHelp, 12, 666, 808);
  const threshold = [...(stage.byPlayers[playerCount]?.stars ?? [])]
    .sort((a, b) => a - b).find((score) => score > view.score);
  ctx.textAlign = "center";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(threshold === undefined ? "★★★" : T.nextStar(threshold - view.score), 416, 699);
  if (pingMs !== null && pingMs !== undefined) {
    ctx.textAlign = "right";
    ctx.font = "11px sans-serif";
    ctx.fillStyle = pingMs >= 200 ? "#D64545" : PALETTE.outline;
    ctx.fillText(`${T.ping(pingMs)}${pingMs >= 200 ? ` ${T.unstable}` : ""}`, 820, 699);
  }
  ctx.restore();
}
