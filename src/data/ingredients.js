/**
 * 食材の状態を表す文字列リテラル型。
 * - "raw": 生（初期状態）
 * - "chopped": 刻み済み
 * - "cooked": 加熱完了
 * - "burnt": 焦げ（加熱しすぎ）
 * @typedef {"raw" | "chopped" | "cooked" | "burnt"} IngredientState
 */

/**
 * 食材の識別子を表す文字列リテラル型。
 * @typedef {"leaf" | "tomato" | "bread" | "meat" | "noodle"} IngredientId
 */

/**
 * 「切る（chop）」による状態遷移の定義。
 * @typedef {Object} ChopSpec
 * @property {IngredientState} from 切る操作を開始できる元の状態
 * @property {IngredientState} to 切り終えた後の状態
 * @property {number} time 切るのに必要な秒数
 */

/**
 * 「加熱（cook）」による状態遷移の定義。
 * 加熱が完了すると "cooked" になり、さらに放置すると "burnt" へ遷移する。
 * @typedef {Object} CookSpec
 * @property {IngredientState} from 加熱を開始できる元の状態
 * @property {number} time 加熱完了（"cooked"）になるまでの秒数
 * @property {number} burnAfter "cooked" になってからこげる（"burnt" になる）までの秒数
 * @property {number} warnBefore こげる何秒前にこげ警告を出すかの秒数
 */

/**
 * 1種類の食材のマスター定義。
 * @typedef {Object} IngredientDef
 * @property {string} name 画面表示用の食材名（日本語）
 * @property {ChopSpec} [chop] 切ることができる食材の場合の遷移定義
 * @property {CookSpec} [cook] 加熱できる食材の場合の遷移定義
 */

/**
 * ゲーム内で扱う全食材のマスターデータ定義。
 * キーは食材ID、値はその食材の表示名および状態遷移ルールを保持する。
 * @type {Record<IngredientId, IngredientDef>}
 */
export const INGREDIENTS = {
  leaf: {
    name: "リーフ",
    chop: {
      from: "raw",
      to: "chopped",
      time: 1.5,
    },
  },
  tomato: {
    name: "トマト",
    chop: {
      from: "raw",
      to: "chopped",
      time: 1.5,
    },
  },
  bread: {
    name: "パン",
  },
  meat: {
    name: "ミート",
    chop: {
      from: "raw",
      to: "chopped",
      time: 2.0,
    },
    cook: {
      from: "chopped",
      time: 8,
      burnAfter: 8,
      warnBefore: 4,
    },
  },
  noodle: {
    name: "麺",
    cook: {
      from: "raw",
      time: 6,
      burnAfter: 8,
      warnBefore: 4,
    },
  },
};
