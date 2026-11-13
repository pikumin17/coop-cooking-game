import { INGREDIENTS } from "../data/ingredients.js";
import { stepMovement, targetTile } from "./movement.js";
import { updateOrders } from "./orders.js";

/**
 * 計画書B5・B11・B12・B13: 固定刻みで状態を更新し、蓄積イベントを返す。
 * @param {import("./world.js").WorldState} state 更新する状態
 * @param {object} stage ステージ定義
 * @param {number} dt 経過秒
 * @returns {object[]} 今回までに蓄積されたイベント
 */
export function step(state, stage, dt) {
  if (state.phase === "countdown") {
    // 計画書B12: 開始フレームはカウントダウン処理だけを行う。
    state.countdown -= dt;
    if (state.countdown <= 0) {
      state.phase = "playing";
      state.nextSpawnAt = stage.firstOrderDelay;
      state.events.push({ e: "phase", phase: "playing" });
    }
  } else if (state.phase === "playing") {
    state.elapsed += dt;
    const players = Object.values(state.players);
    for (const player of players) {
      stepMovement(player, player.input, dt, state.tiles);
      player.emoteT -= dt;
      if (player.emoteT <= 0) {
        player.emote = 0;
        player.emoteT = 0;
      }
    }

    // 計画書B5・B13: 協力人数によらず、まな板一枚につき等速で切る。
    for (let y = 0; y < state.tiles.length; y++) {
      for (let x = 0; x < state.tiles[y].length; x++) {
        if (state.tiles[y][x].type !== "board") {
          continue;
        }
        const key = `${x},${y}`;
        state.chopSfxT[key] = (state.chopSfxT[key] ?? 0) - dt;
        const item = state.items[key];
        const chop = item && !item.plate ? INGREDIENTS[item.k]?.chop : null;
        if (!chop || item.s !== chop.from) {
          continue;
        }
        const chopping = players.filter((player) => {
          if (!player.input.chop || player.held != null) {
            return false;
          }
          const target = targetTile(player, state.tiles);
          return target?.x === x && target.y === y;
        });
        if (chopping.length === 0) {
          continue;
        }
        item.p += dt;
        if (state.chopSfxT[key] <= 0) {
          state.events.push({ e: "chop", x, y });
          state.chopSfxT[key] = 0.25;
        }
        if (item.p >= chop.time) {
          item.s = chop.to;
          item.p = 0;
          state.events.push({ e: "chopDone", x, y });
          for (const player of chopping) {
            player.stats.chopped++;
          }
        }
      }
    }

    // 計画書B13: 調理完了後の加熱時間で警告と焦げを判定する。
    for (let y = 0; y < state.tiles.length; y++) {
      for (let x = 0; x < state.tiles[y].length; x++) {
        if (state.tiles[y][x].type !== "stove") {
          continue;
        }
        const item = state.items[`${x},${y}`];
        const cook = item && !item.plate ? INGREDIENTS[item.k]?.cook : null;
        if (!cook) {
          continue;
        }
        if (item.s === cook.from) {
          item.p += dt;
          if (item.p >= cook.time) {
            item.s = "cooked";
            item.p = 0;
            state.events.push({ e: "cooked", x, y });
          }
        } else if (item.s === "cooked") {
          const previous = item.p;
          item.p += dt;
          const warnAt = cook.burnAfter - cook.warnBefore;
          if (previous < warnAt && warnAt <= item.p) {
            state.events.push({ e: "burnWarn", x, y });
          }
          if (item.p >= cook.burnAfter) {
            item.s = "burnt";
            item.p = 0;
            state.stats.burnt++;
            state.events.push({ e: "burnt", x, y });
          }
        }
      }
    }

    state.returning = state.returning
      .map((remaining) => remaining - dt)
      .filter((remaining) => {
        if (remaining <= 0) {
          state.shelf++;
          return false;
        }
        return true;
      });
    updateOrders(state, stage, dt);

    // 計画書B11: 終了時に残った注文には追加の減点を行わない。
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.phase = "result";
      state.events.push({ e: "phase", phase: "result" });
    }
  }
  state.tick++;
  const events = state.events;
  state.events = [];
  return events;
}
