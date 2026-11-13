import { parseStage } from "../sim/world.js";
import { stepMovement, tryDash } from "../sim/movement.js";

/** 計画書2.5・C1: ローカル移動の予測と確認済み入力の誤差補正を行う。 */
export function createPredictor(stage, x, y) {
  const { tiles } = parseStage(stage);
  const player = { x, y, fx: 0, fy: 1, dashT: 0, dashCd: 0, };
  const pos = { x, y, };
  const offset = { x: 0, y: 0, };
  let history = [];

  return {
    pos,
    /** 固定刻みで論理位置を進め、表示補正を減衰させる。 */
    step(input, dt) {
      stepMovement(player, input, dt, tiles);
      pos.x = player.x;
      pos.y = player.y;
      offset.x *= 0.85;
      offset.y *= 0.85;
    },
    /** ローカルでダッシュを先行開始する。 */
    dash() {
      return tryDash(player);
    },
    /** 入力送信時点の位置を直近120件まで記録する。 */
    record(seq) {
      history.push({ seq, x: pos.x, y: pos.y, });
      if (history.length > 120) {
        history.shift();
      }
    },
    /** ホストの確認位置との差分を未確認履歴にも反映する。 */
    reconcile(hx, hy, ack) {
      const rec = history.find((entry) => entry.seq === ack);
      if (!rec) {
        return;
      }
      const ex = hx - rec.x;
      const ey = hy - rec.y;
      const distance = Math.hypot(ex, ey);
      history = history.filter((entry) => entry.seq > ack);
      if (distance < 0.02) {
        return;
      }
      if (distance >= 1.5) {
        pos.x = player.x = hx;
        pos.y = player.y = hy;
        history = [];
        offset.x = 0;
        offset.y = 0;
        return;
      }
      player.x += ex;
      player.y += ey;
      pos.x = player.x;
      pos.y = player.y;
      for (const entry of history) {
        entry.x += ex;
        entry.y += ey;
      }
      offset.x -= ex;
      offset.y -= ey;
    },
    /** 補正を滑らかに適用した描画位置を返す。 */
    renderPos() {
      return { x: pos.x + offset.x, y: pos.y + offset.y, };
    },
  };
}
