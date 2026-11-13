import { T } from "../data/text.js";

/** イベントから秒単位で寿命を管理する描画演出を作る。 */
export function createEffects() {
  let entries = [];
  let shake = 0;

  /** 最新のビューとイベントを受け取り、必要な演出だけを積む。 */
  function push(event, view) {
    if (event.e === "serve") {
      entries.push({
        text: `+${event.coins}`,
        x: event.x * 64 + 32,
        y: 72 + event.y * 64 + 32,
        floating: true,
        remaining: 1,
      });
    } else if (event.e === "phase") {
      const phase = event.phase ?? view?.phase;
      const text = phase === "playing" ? T.open : phase === "result" ? T.close : null;
      if (text) {
        entries.push({ text, x: 416, y: 360, floating: false, remaining: 1 });
      }
    } else if (event.e === "buzz") {
      shake = 0.25;
    }
  }

  /** 経過秒数に応じて演出を進め、寿命を迎えたものを捨てる。 */
  function update(dt) {
    const elapsed = Math.max(0, dt);
    shake = Math.max(0, shake - elapsed);
    for (const entry of entries) {
      entry.remaining -= elapsed;
    }
    entries = entries.filter((entry) => entry.remaining > 0);
  }

  /** 描画済みの画面を横揺れさせ、縁取り文字を重ねる。 */
  function draw(ctx) {
    ctx.save();
    if (shake > 0) {
      const offset = Math.sin((0.25 - shake) * 90) * 4 * (shake / 0.25);
      ctx.translate(offset, 0);
      // 自分自身をコピーし、描画済みのフィールドと HUD も揺らす。
      ctx.drawImage(ctx.canvas, 0, 0, 832, 720);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#4A2C20";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineJoin = "round";
    for (const entry of entries) {
      ctx.globalAlpha = entry.floating ? entry.remaining : 1;
      ctx.font = `bold ${entry.floating ? 32 : 80}px sans-serif`;
      ctx.lineWidth = entry.floating ? 5 : 8;
      const y = entry.y - (entry.floating ? (1 - entry.remaining) * 48 : 0);
      ctx.strokeText(entry.text, entry.x, y);
      ctx.fillText(entry.text, entry.x, y);
    }
    ctx.restore();
  }

  return { push, update, draw };
}
