/**
 * 食材。p は現在の状態での経過秒。
 * @typedef {Object} Ingredient
 * @property {string} k 食材ID
 * @property {"raw"|"chopped"|"cooked"|"burnt"} s 食材の状態
 * @property {number} p 経過秒
 */

/**
 * 皿。c は盛り付け済みの食材。
 * @typedef {Object} Plate
 * @property {true} plate 皿の識別フラグ
 * @property {Array<{k: string, s: string}>} c 皿の内容
 */

/**
 * 手持ちまたは設置された物。
 * @typedef {Ingredient|Plate|null} Item
 */

/**
 * 静的なタイル。
 * @typedef {Object} Tile
 * @property {"floor"|"counter"|"board"|"stove"|"box"|"shelf"|"serve"|"trash"} type 種別
 * @property {string} [box] 食材ボックスの食材ID
 */

/**
 * プレイヤーの同期状態。位置はマス単位、向きは8方向の単位ベクトル。
 * @typedef {Object} Player
 * @property {number} slot 参加枠（0〜3）
 * @property {string} name 表示名
 * @property {number} x 中心の横座標
 * @property {number} y 中心の縦座標
 * @property {number} fx 向きの横成分
 * @property {number} fy 向きの縦成分
 * @property {Item} held 手持ちの物
 * @property {number} dashT ダッシュ残り秒
 * @property {number} dashCd ダッシュ再使用までの秒数
 * @property {number} emote エモート番号（0〜4）
 * @property {number} emoteT エモート残り秒
 * @property {{mx: number, my: number, chop: boolean, seq: number}} input 最新入力
 * @property {number} ack 最後に適用した入力番号
 * @property {{served: number, chopped: number, plated: number}} stats 個人成績
 */

/**
 * ホストが保持するワールド状態。
 * @typedef {Object} WorldState
 * @property {string} stageId ステージID
 * @property {number} playerCount 注文ルールに用いる参加人数
 * @property {"countdown"|"playing"|"result"} phase 進行状態
 * @property {number} tick 更新回数
 * @property {number} countdown 開始までの秒数
 * @property {number} timeLeft 残り秒
 * @property {number} elapsed 経過秒
 * @property {number} score 得点
 * @property {{served: number, expired: number, tips: number, burnt: number}} stats 全体成績
 * @property {Tile[][]} tiles 静的なマス配列（行、列の順）
 * @property {Object<string, Item>} items マスキーで管理する設置物
 * @property {Object<number, Player>} players 参加枠ごとのプレイヤー
 * @property {Array<{id: number, recipe: string, limit: number, left: number}>} orders 注文一覧
 * @property {number} nextOrderId 次の注文番号
 * @property {number} nextSpawnAt 次の注文の発生時刻
 * @property {number} spawnedCount 発生済み注文数
 * @property {number} shelf 皿棚の在庫
 * @property {number[]} returning 返却待ちの皿の残り秒
 * @property {{s: number}} rng 決定論的な乱数状態
 * @property {Event[]} events 更新ごとに取り出すイベント
 * @property {Object<string, number>} chopSfxT マスごとの刻み音タイマー
 */

/**
 * 効果音や表示に通知するイベント。
 * @typedef {(
 *   {e: "serve", slot: number, recipe: string, coins: number, x: number, y: number}|
 *   {e: "expire"|"orderNew", recipe: string}|
 *   {e: "buzz"|"grab"|"place"|"trash", slot: number}|
 *   {e: "chop"|"chopDone"|"cooked"|"burnWarn"|"burnt", x: number, y: number}|
 *   {e: "phase", phase: "countdown"|"playing"|"result"}
 * )} Event
 */

import { STAGES, TILE_LEGEND } from "../data/stages.js";
import { createRng } from "./rng.js";

const stageCache = new WeakMap();

/**
 * ステージの文字列をタイルと初期位置に変換し、定義ごとに再利用する。
 * @param {import("../data/stages.js").StageDefinition} stage ステージ定義
 * @returns {{tiles: Tile[][], spawns: Array<{x: number, y: number}>, width: number, height: number}} 解析結果
 */
export function parseStage(stage) {
  if (stageCache.has(stage)) {
    return stageCache.get(stage);
  }
  const spawns = [];
  const tiles = stage.grid.map((row, y) => Array.from(row, (char, x) => {
    if (/^[1-4]$/.test(char)) {
      spawns[Number(char) - 1] = { x: x + 0.5, y: y + 0.5 };
      return { type: "floor" };
    }
    const value = stage.legend?.[char] ?? TILE_LEGEND[char];
    if (!value) {
      throw new Error(`未定義のタイル記号: ${char}`);
    }
    const [type, box] = value.split(":");
    return box === undefined ? { type } : { type, box };
  }));
  const parsed = {
    tiles,
    spawns,
    width: stage.grid[0]?.length ?? 0,
    height: tiles.length,
  };
  stageCache.set(stage, parsed);
  return parsed;
}

/**
 * シードと参加者一覧から初期ワールドを生成する。
 * @param {string} stageId ステージID
 * @param {number} seed 乱数シード
 * @param {Array<{slot: number, name: string}>} roster 参加者一覧
 * @returns {WorldState} 初期状態
 */
export function createWorld(stageId, seed, roster) {
  const stage = STAGES[stageId];
  if (!stage) {
    throw new Error(`未定義のステージ: ${stageId}`);
  }
  const state = {
    stageId,
    playerCount: roster.length,
    phase: "countdown",
    countdown: 3,
    tick: 0,
    timeLeft: stage.duration,
    elapsed: 0,
    score: 0,
    stats: { served: 0, expired: 0, tips: 0, burnt: 0 },
    tiles: parseStage(stage).tiles,
    items: {},
    players: {},
    orders: [],
    nextOrderId: 1,
    nextSpawnAt: stage.firstOrderDelay,
    spawnedCount: 0,
    shelf: stage.plates,
    returning: [],
    rng: createRng(seed),
    events: [],
    chopSfxT: {},
  };
  for (const { slot, name } of roster) {
    addPlayer(state, slot, name);
  }
  return state;
}

/**
 * 指定した参加枠をステージの初期位置に追加する。
 * @param {WorldState} state ワールド状態
 * @param {number} slot 参加枠
 * @param {string} name 表示名
 */
export function addPlayer(state, slot, name) {
  const spawn = parseStage(STAGES[state.stageId]).spawns[slot];
  if (!spawn) {
    throw new Error(`初期位置のない参加枠: ${slot}`);
  }
  state.players[slot] = {
    slot,
    name,
    x: spawn.x,
    y: spawn.y,
    fx: 0,
    fy: 1,
    held: null,
    dashT: 0,
    dashCd: 0,
    emote: 0,
    emoteT: 0,
    input: { mx: 0, my: 0, chop: false, seq: 0 },
    ack: 0,
    stats: { served: 0, chopped: 0, plated: 0 },
  };
}

/**
 * 退室者を削除し、手持ちの皿だけを棚に戻す。
 * @param {WorldState} state ワールド状態
 * @param {number} slot 参加枠
 */
export function removePlayer(state, slot) {
  if (state.players[slot]?.held?.plate) {
    state.shelf += 1;
  }
  delete state.players[slot];
}

/**
 * 指定マスのタイルを取得する。範囲外は null。
 * @param {WorldState} state ワールド状態
 * @param {number} x 列番号
 * @param {number} y 行番号
 * @returns {Tile|null} タイル
 */
export function tileAt(state, x, y) {
  return state.tiles[y]?.[x] ?? null;
}

/**
 * 床以外と範囲外を衝突対象と判定する。
 * @param {Tile|null} tile タイル
 * @returns {boolean} 衝突対象か
 */
export function isSolid(tile) {
  return tile == null || tile.type !== "floor";
}

/**
 * 設置物に用いるマスキーを生成する。
 * @param {number} x 列番号
 * @param {number} y 行番号
 * @returns {string} マスキー
 */
export function key(x, y) {
  return `${x},${y}`;
}
