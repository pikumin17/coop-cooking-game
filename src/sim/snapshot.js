import { computeStars } from "./orders.js";

/** 数値を指定した小数桁数に丸める。 */
function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** 食材または皿を通信向けの形式に変換する。 */
function encodeItem(item) {
  if (item == null) {
    return null;
  }
  if (item.plate) {
    return { c: item.c.map(({ k, s }) => [k, s]) };
  }
  return { k: item.k, s: item.s, p: round(item.p, 2) };
}

/** 通信形式の食材または皿を表示用の形式に戻す。 */
function decodeItem(item) {
  if (item == null) {
    return null;
  }
  if (Array.isArray(item.c)) {
    return { plate: true, c: item.c.map(([k, s]) => ({ k, s })) };
  }
  return { k: item.k, s: item.s, p: item.p };
}

/** ワールド状態を通信するスナップショットに変換する。 */
export function encodeSnap(state) {
  return {
    t: "snap",
    k: state.tick,
    ph: state.phase,
    cd: round(state.countdown, 2),
    tl: round(state.timeLeft, 2),
    sc: state.score,
    pl: Object.values(state.players)
      .sort((a, b) => a.slot - b.slot)
      .map((player) => [
        player.slot,
        round(player.x, 3),
        round(player.y, 3),
        player.fx,
        player.fy,
        encodeItem(player.held),
        player.dashT > 0 ? 1 : 0,
        player.emoteT > 0 ? player.emote : 0,
        player.ack,
      ]),
    it: Object.entries(state.items).map(([key, item]) => {
      const [x, y] = key.split(",").map(Number);
      return [x, y, encodeItem(item)];
    }),
    od: state.orders.map(({ id, recipe, left, limit }) => [
      id,
      recipe,
      round(left, 2),
      round(limit, 2),
    ]),
    sh: state.shelf,
  };
}

/** スナップショットを描画側で利用する表示状態に復元する。 */
export function decodeSnap(msg) {
  return {
    tick: msg.k,
    phase: msg.ph,
    countdown: msg.cd,
    timeLeft: msg.tl,
    score: msg.sc,
    players: msg.pl.map(([slot, x, y, fx, fy, held, dash01, emote, ack]) => ({
      slot,
      x,
      y,
      fx,
      fy,
      held: decodeItem(held),
      dashing: dash01 === 1,
      emote,
      ack,
    })),
    items: new Map(msg.it.map(([x, y, item]) => [`${x},${y}`, decodeItem(item)])),
    orders: msg.od.map(([id, recipe, left, limit]) => ({ id, recipe, left, limit })),
    shelf: msg.sh,
  };
}

/** 終了時に在籍しているプレイヤーだけを含む結果を作成する。 */
export function buildResult(state, stage, roster) {
  const stars = computeStars(state.score, stage, state.playerCount);
  return {
    t: "result",
    score: state.score,
    stars,
    cleared: stars >= 1,
    served: state.stats.served,
    expired: state.stats.expired,
    tips: state.stats.tips,
    burnt: state.stats.burnt,
    players: Object.values(state.players)
      .sort((a, b) => a.slot - b.slot)
      .map((player) => {
        const entry = roster instanceof Map ? roster.get(player.slot) : roster?.[player.slot];
        return {
          slot: player.slot,
          name: entry?.name ?? player.name,
          served: player.stats.served,
          chopped: player.stats.chopped,
          plated: player.stats.plated,
        };
      }),
  };
}
