import { RECIPES } from "../data/recipes.js";
import { pickWeighted } from "./rng.js";

/**
 * 計画書2.4: 初期注文列または重み付き抽選から注文を追加する。
 * @param {import("./world.js").WorldState} state 更新する状態
 * @param {object} stage ステージ定義
 */
export function spawnOrder(state, stage) {
  const recipe = state.spawnedCount < stage.openingOrders.length
    ? stage.openingOrders[state.spawnedCount]
    : pickWeighted(state.rng, stage.recipes.map((key) => [key, RECIPES[key].weight]));
  const limit = RECIPES[recipe].timeLimit * stage.byPlayers[state.playerCount].limitScale;
  state.orders.push({ id: state.nextOrderId++, recipe, limit, left: limit });
  state.spawnedCount++;
  state.events.push({ e: "orderNew", recipe });
}

/**
 * 計画書2.4・B9: 注文除去後の補充待ち時間を設定する。
 * @param {import("./world.js").WorldState} state 更新する状態
 * @param {object} stage ステージ定義
 */
export function onOrderRemoved(state, stage) {
  if (state.nextSpawnAt <= state.elapsed) {
    state.nextSpawnAt = state.elapsed + stage.refillDelay;
  }
  if (state.orders.length === 0) {
    state.nextSpawnAt = Math.min(state.nextSpawnAt, state.elapsed + stage.refillDelay);
  }
}

/**
 * 計画書2.4・B9: 期限切れを処理し、空きがあれば注文を一件発生させる。
 * @param {import("./world.js").WorldState} state 更新する状態
 * @param {object} stage ステージ定義
 * @param {number} dt 経過秒
 */
export function updateOrders(state, stage, dt) {
  for (let i = 0; i < state.orders.length;) {
    const order = state.orders[i];
    order.left -= dt;
    if (order.left <= 0) {
      state.orders.splice(i, 1);
      state.score = Math.max(0, state.score - stage.expirePenalty);
      state.stats.expired++;
      state.events.push({ e: "expire", recipe: order.recipe });
      onOrderRemoved(state, stage);
    } else {
      i++;
    }
  }
  const settings = stage.byPlayers[state.playerCount];
  if (state.elapsed >= state.nextSpawnAt && state.orders.length < settings.maxOrders) {
    spawnOrder(state, stage);
    state.nextSpawnAt = state.elapsed + settings.interval;
  }
}

/**
 * 計画書B11: 得点が到達した星の閾値数を返す。
 * @param {number} score 得点
 * @param {object} stage ステージ定義
 * @param {number} playerCount 人数
 * @returns {number} 星の数
 */
export function computeStars(score, stage, playerCount) {
  return stage.byPlayers[playerCount].stars.filter((threshold) => score >= threshold).length;
}
