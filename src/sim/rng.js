/**
 * シード値から決定論的な乱数状態を生成する。
 *
 * @param {number} [seed=0] - 初期シード値
 * @returns {{ s: number }} 乱数状態を表すプレーンオブジェクト
 */
export function createRng(seed = 0) {
  return {
    s: seed >>> 0,
  };
}

/**
 * mulberry32 アルゴリズムで [0, 1) の一様乱数を1つ生成し、状態を進める。
 *
 * @param {{ s: number }} rng - createRng で生成した乱数状態オブジェクト
 * @returns {number} 0 以上 1 未満の浮動小数点数
 */
export function nextFloat(rng) {
  // 状態を進めつつ 32bit 符号なし整数に正規化する
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * 重み付き配列から乱数でキーを1つ選択する。
 *
 * @template T
 * @param {{ s: number }} rng - createRng で生成した乱数状態オブジェクト
 * @param {Array<[T, number]>} entries - [キー, 重み] のペア配列
 * @returns {T} 選択されたキー
 */
export function pickWeighted(rng, entries) {
  if (!entries || entries.length === 0) {
    throw new Error("pickWeighted: entries must not be empty");
  }

  let totalWeight = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const weight = entries[i][1];
    if (weight > 0) {
      totalWeight += weight;
    }
  }

  if (totalWeight <= 0) {
    throw new Error("pickWeighted: total weight must be greater than 0");
  }

  let threshold = nextFloat(rng) * totalWeight;
  let lastPositiveKey = entries[0][0];

  for (let i = 0; i < entries.length; i += 1) {
    const [key, weight] = entries[i];
    if (weight <= 0) {
      continue;
    }
    lastPositiveKey = key;
    threshold -= weight;
    if (threshold < 0) {
      return key;
    }
  }

  // 浮動小数点誤差でループを抜けた場合は最後の正の重みを持つキーを返す
  return lastPositiveKey;
}
