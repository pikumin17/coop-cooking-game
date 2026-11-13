/**
 * ステージ共通のタイル記号と種別の対応表。
 * 数字 "1"〜"4" は床タイルであると同時に、プレイヤーの初期位置（slot = 数字 - 1）を表す。
 * @type {Record<string, string>}
 */
export const TILE_LEGEND = {
  ".": "floor",
  C: "counter",
  K: "board",
  S: "stove",
  P: "shelf",
  D: "serve",
  G: "trash",
  "1": "floor",
  "2": "floor",
  "3": "floor",
  "4": "floor",
};

/**
 * @typedef {Object} PlayerOrderRule
 * @property {number} interval - 新規注文が追加される基本間隔（秒）
 * @property {number} maxOrders - 同時に保持できる注文の最大数
 * @property {number} limitScale - レシピの制限時間に対する倍率
 * @property {number[]} stars - 1〜3つ星評価の達成スコア閾値（昇順の3要素配列）
 */

/**
 * @typedef {Object} StageDefinition
 * @property {string} name - ステージの表示名
 * @property {number} duration - 制限時間（秒）
 * @property {string[]} grid - ステージのレイアウトを表す文字列配列（各行が1行分のタイル記号列）
 * @property {Record<string, string>} legend - ステージ固有のタイル記号（主に食材ボックス）の上書き定義
 * @property {string[]} recipes - このステージで出題対象となるレシピIDの一覧
 * @property {number} plates - 初期配置されるお皿の枚数
 * @property {string[]} openingOrders - 開始直後に順番に発生する初期注文のレシピID一覧
 * @property {number} firstOrderDelay - ステージ開始から最初の注文が発生するまでの待機時間（秒）
 * @property {number} refillDelay - 注文が空になった際などに次の注文が補充されるまでの待機時間（秒）
 * @property {number} expirePenalty - 注文が時間切れになった際の減点スコア
 * @property {number} tipRate - 迅速な提供等に応じたチップ倍率
 * @property {number} plateReturn - 料理を提供してからお皿が返却されるまでの時間（秒）
 * @property {Record<number, PlayerOrderRule>} byPlayers - 参加人数（1〜4人）ごとの注文ルールおよびスター目標
 */

/**
 * ステージ定義のマップ。キーはステージID。
 * @type {Record<string, StageDefinition>}
 */
export const STAGES = {
  kado: {
    name: "横丁の角の店",
    duration: 180,
    grid: [
      "CLTCKKCSSCPCC",
      "C1.......2..D",
      "C...........D",
      "C...........C",
      "B..CCCCCC...C",
      "M...........C",
      "N...........G",
      "C3.......4..C",
      "CCCCKCCCCCCCC",
    ],
    legend: {
      L: "box:leaf",
      T: "box:tomato",
      B: "box:bread",
      M: "box:meat",
      N: "box:noodle",
    },
    recipes: [
      "green_salad",
      "red_green_salad",
      "tomato_noodle",
      "sizzle_sand",
    ],
    plates: 4,
    openingOrders: [
      "green_salad",
      "red_green_salad",
    ],
    firstOrderDelay: 3,
    refillDelay: 2,
    expirePenalty: 20,
    tipRate: 0.3,
    plateReturn: 6,
    byPlayers: {
      1: {
        interval: 22,
        maxOrders: 3,
        limitScale: 1.3,
        stars: [200, 350, 500],
      },
      2: {
        interval: 16,
        maxOrders: 4,
        limitScale: 1.0,
        stars: [300, 500, 700],
      },
      3: {
        interval: 13,
        maxOrders: 4,
        limitScale: 1.0,
        stars: [400, 650, 900],
      },
      4: {
        interval: 11,
        maxOrders: 5,
        limitScale: 1.0,
        stars: [500, 800, 1100],
      },
    },
  },
};
