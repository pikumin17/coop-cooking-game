/**
 * レシピ定義（データ層）。
 * ゲーム内で提供する料理の必要食材、報酬、制限時間、出現重みを定義する。
 */

/**
 * レシピに必要な食材と最終状態の定義。
 * @typedef {Object} RecipeIngredient
 * @property {string} item 食材ID
 * @property {"raw"|"chopped"|"cooked"} state 完成に必要な食材の最終状態
 */

/**
 * レシピ定義オブジェクト。
 * @typedef {Object} Recipe
 * @property {string} name 料理の表示名
 * @property {RecipeIngredient[]} needs 完成に必要な食材とその最終状態の配列
 * @property {number} price 提供時の報酬コイン
 * @property {number} timeLimit 注文の制限時間（秒）
 * @property {number} weight 注文発生の重み
 */

/**
 * レシピIDをキーとしたレシピ定義マップ。
 * @type {Record<string, Recipe>}
 */
export const RECIPES = {
  green_salad: {
    name: "みどりサラダ",
    needs: [
      { item: "leaf", state: "chopped" },
    ],
    price: 40,
    timeLimit: 50,
    weight: 30,
  },
  red_green_salad: {
    name: "あかみどりサラダ",
    needs: [
      { item: "leaf", state: "chopped" },
      { item: "tomato", state: "chopped" },
    ],
    price: 60,
    timeLimit: 60,
    weight: 30,
  },
  tomato_noodle: {
    name: "横丁トマト麺",
    needs: [
      { item: "noodle", state: "cooked" },
      { item: "tomato", state: "chopped" },
    ],
    price: 80,
    timeLimit: 70,
    weight: 20,
  },
  sizzle_sand: {
    name: "じゅうじゅうサンド",
    needs: [
      { item: "bread", state: "raw" },
      { item: "meat", state: "cooked" },
      { item: "leaf", state: "chopped" },
    ],
    price: 100,
    timeLimit: 85,
    weight: 20,
  },
};
