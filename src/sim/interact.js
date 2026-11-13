import { INGREDIENTS } from "../data/ingredients.js";
import { RECIPES } from "../data/recipes.js";
import { STAGES } from "../data/stages.js";
import { onOrderRemoved } from "./orders.js";

/**
 * 調理台が食材の現在状態を受け入れるかを返す。
 * @param {string} tileType タイル種別
 * @param {Object|null} item 対象の食材または皿
 * @returns {boolean} 配置可能か
 */
export function canHold(tileType, item) {
  // 計画書B5/B6: 皿は置けず、各工程の開始状態だけを受け入れる。
  if (!item || item.plate) return false;
  const ingredient = INGREDIENTS[item.k];
  if (tileType === "board") {
    return Boolean(ingredient?.chop && item.s === ingredient.chop.from);
  }
  if (tileType === "stove") {
    return Boolean(ingredient?.cook
      && (item.s === ingredient.cook.from || item.s === "cooked"));
  }
  return false;
}

/**
 * 種類と状態を照合し、同じ必要食材を二度使わずに部分集合を判定する。
 * @param {Object[]} contents 皿の中身
 * @param {Object[]} needs レシピの必要食材
 * @returns {boolean} 必要食材の部分集合か
 */
function matchesSubset(contents, needs) {
  // 計画書B3: 種類だけでなく状態も一致させる。
  const remaining = needs.slice();
  return contents.every((ing) => {
    const index = remaining.findIndex((need) => need.item === ing.k && need.state === ing.s);
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

/**
 * 食材を加えても、対象レシピのいずれかを完成させられるかを返す。
 * @param {Object[]} plateContents 皿の中身
 * @param {Object} ing 追加する食材
 * @param {string[]} recipeKeys 対象レシピのキー
 * @returns {boolean} 盛り付け可能か
 */
export function canAddToPlate(plateContents, ing, recipeKeys) {
  // 計画書B3: 焦げ、同種の重複、完成不能な組み合わせを禁止する。
  if (!ing || ing.plate || ing.s === "burnt"
    || plateContents.some((content) => content.k === ing.k)) return false;
  const contents = [...plateContents, ing];
  return recipeKeys.some((key) => {
    const recipe = RECIPES[key];
    return Boolean(recipe && matchesSubset(contents, recipe.needs));
  });
}

/**
 * 順序によらず中身が完全一致する最初のレシピを返す。
 * @param {Object[]} plateContents 皿の中身
 * @param {string[]} recipeKeys 対象レシピのキー
 * @returns {string|null} 完成レシピのキー
 */
export function isComplete(plateContents, recipeKeys) {
  // 計画書2.4/B3: 個数と種類と状態のすべてを一致させる。
  return recipeKeys.find((key) => {
    const recipe = RECIPES[key];
    return recipe && plateContents.length === recipe.needs.length
      && matchesSubset(plateContents, recipe.needs);
  }) ?? null;
}

/**
 * 対象マスの取る・置く・盛り付け・提供操作を状態へ反映する。
 * @param {Object} state ワールド状態
 * @param {number} slot 操作するプレイヤー枠
 * @param {number} tx 対象マスの横座標
 * @param {number} ty 対象マスの縦座標
 * @returns {void}
 */
export function grab(state, slot, tx, ty) {
  const stage = STAGES[state.stageId];
  const player = state.players[slot];
  const tile = state.tiles[ty]?.[tx];
  if (!tile || !player) return;
  const itemKey = tx + "," + ty;
  const I = state.items[itemKey] ?? null;
  const H = player.held;
  // 計画書2.2: 操作イベントは共通の形式で記録する。
  const ev = (e) => state.events.push({ e, slot });

  switch (tile.type) {
    case "box":
      if (!H) {
        player.held = { k: tile.box, s: "raw", p: 0 };
        ev("grab");
      }
      return;
    case "shelf":
      if (!H && state.shelf > 0) {
        player.held = { plate: true, c: [] };
        state.shelf--;
        ev("grab");
      } else if (H?.plate && H.c.length === 0) {
        player.held = null;
        state.shelf++;
        ev("place");
      }
      return;
    case "serve": {
      if (!H) return;
      // 計画書B8: 食材や未完成の皿も、提供できない場合はブザーにする。
      const recipe = H.plate ? isComplete(H.c, stage.recipes) : null;
      let orderIndex = -1;
      if (recipe !== null) {
        state.orders.forEach((order, index) => {
          if (order.recipe === recipe && order.left > 0
            && (orderIndex < 0 || order.left < state.orders[orderIndex].left)) {
            orderIndex = index;
          }
        });
      }
      if (orderIndex < 0) {
        ev("buzz");
        return;
      }
      // 計画書2.4: 最も期限の近い有効注文へ提供し、報酬と皿の返却を予約する。
      const order = state.orders[orderIndex];
      const price = RECIPES[recipe].price;
      const tip = Math.round(price * stage.tipRate * (order.left / order.limit));
      const coins = price + tip;
      state.score += coins;
      state.stats.served++;
      state.stats.tips += tip;
      player.stats.served++;
      state.orders.splice(orderIndex, 1);
      state.returning.push(stage.plateReturn);
      player.held = null;
      state.events.push({ e: "serve", slot, recipe, coins, x: tx, y: ty });
      onOrderRemoved(state, stage);
      return;
    }
    case "trash":
      if (H && !H.plate) {
        player.held = null;
        ev("trash");
      } else if (H?.plate && H.c.length > 0) {
        H.c = [];
        ev("trash");
      }
      return;
    case "counter":
    case "board":
    case "stove":
      // 計画書2.4/B5/B6: 取り出しは共通、食材の配置だけ台の条件で制限する。
      if (!H && I) {
        player.held = I;
        delete state.items[itemKey];
        ev("grab");
      } else if (H && !H.plate && !I
        && (tile.type === "counter" || canHold(tile.type, H))) {
        state.items[itemKey] = H;
        player.held = null;
        ev("place");
      } else if (H && !H.plate && I?.plate
        && canAddToPlate(I.c, H, stage.recipes)) {
        I.c.push({ k: H.k, s: H.s });
        player.held = null;
        player.stats.plated++;
        ev("place");
      } else if (H?.plate && I && !I.plate
        && canAddToPlate(H.c, I, stage.recipes)) {
        H.c.push({ k: I.k, s: I.s });
        delete state.items[itemKey];
        player.stats.plated++;
        ev("place");
      }
      return;
    default:
      // 計画書B7: 床と判定表にない組み合わせは無音で何もしない。
      return;
  }
}
