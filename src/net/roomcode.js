/**
 * ルームコード生成と Peer ID 変換（net層）。
 * 視認性向上のため 0, O, 1, I, L を除外した 31 文字のアルファベットを用いる。
 */

/**
 * ルームコードに使用する 31 文字のアルファベット（0, O, 1, I, L を除外）。
 * @type {string}
 */
export const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const CODE_LENGTH = 4;
const PEER_ID_PREFIX = "harapeko-yokocho-v1-";

/**
 * 4 文字のルームコードを生成する。
 *
 * @param {() => number} [rand=Math.random] - [0, 1) の乱数を返す関数。
 * @returns {string} 生成された 4 文字のルームコード。
 */
export function generateCode(rand = Math.random) {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const index = Math.floor(rand() * ALPHABET.length);
    code += ALPHABET[index];
  }
  return code;
}

/**
 * 入力文字列を大文字化し、ALPHABET に含まれない文字を除去して正規化する。
 *
 * @param {string} s - 正規化対象の文字列。
 * @returns {string} 正規化後の文字列。文字列以外が渡された場合は空文字を返す。
 */
export function normalizeCode(s) {
  if (typeof s !== "string") {
    return "";
  }
  const upper = s.toUpperCase();
  let normalized = "";
  for (const ch of upper) {
    if (ALPHABET.includes(ch)) {
      normalized += ch;
    }
  }
  return normalized;
}

/**
 * 正規化後の文字列が有効なルームコード（ちょうど 4 文字）かどうかを判定する。
 *
 * @param {string} s - 判定対象の文字列。
 * @returns {boolean} 正規化後に 4 文字であれば true、それ以外は false。
 */
export function isValidCode(s) {
  return normalizeCode(s).length === CODE_LENGTH;
}

/**
 * ルームコードを PeerJS 用の Peer ID に変換する。
 *
 * @param {string} code - ルームコード。
 * @returns {string} プレフィックス付きの Peer ID。
 */
export function toPeerId(code) {
  return PEER_ID_PREFIX + code;
}
