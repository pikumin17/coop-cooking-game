/**
 * Web Audio API を用いて効果音をリアルタイム合成するモジュール。
 * 音声ファイルを使用せず、発振器（OscillatorNode）とエンベロープ（GainNode）のみで生成する。
 */

/** マスターゲインの既定値（控えめな音量） */
const MASTER_GAIN = 0.3;

/**
 * 1音分のトーンをスケジュールする。
 * 再生ごとに新規ノードを生成して使い捨てるため、多重再生時にも破綻しない。
 * @param {AudioContext} ctx - 対象の AudioContext
 * @param {AudioNode} destination - 出力先ノード（マスターゲイン等）
 * @param {object} spec - トーン定義
 * @param {OscillatorType} [spec.type="sine"] - 波形種別
 * @param {number} spec.freq - 開始周波数（Hz）
 * @param {number} [spec.freqEnd] - 終了周波数（Hz、省略時は一定）
 * @param {number} [spec.delay=0] - 再生開始までの遅延（秒）
 * @param {number} spec.duration - 持続時間（秒）
 * @param {number} [spec.gain=0.5] - ピークゲイン（0〜1）
 * @param {number} [spec.attack=0.005] - アタック時間（秒）
 */
function playTone(ctx, destination, spec) {
  const {
    type = "sine",
    freq,
    freqEnd,
    delay = 0,
    duration,
    gain = 0.5,
    attack = 0.005,
  } = spec;

  const startTime = ctx.currentTime + delay;
  const endTime = startTime + duration;
  const attackEnd = Math.min(startTime + attack, endTime);

  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (typeof freqEnd === "number" && freqEnd > 0) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, endTime);
  }

  // クリックノイズを防ぐため 0 からアタックし、終了時に 0 へ減衰させる
  env.gain.setValueAtTime(0.0001, startTime);
  env.gain.linearRampToValueAtTime(gain, attackEnd);
  env.gain.exponentialRampToValueAtTime(0.0001, endTime);

  osc.connect(env);
  env.connect(destination);

  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };

  osc.start(startTime);
  osc.stop(endTime + 0.01);
}

/**
 * 効果音名ごとの合成レシピ（14種）。
 * 各要素は playTone に渡すトーン配列を返す。
 * @type {Record<string, Array<Parameters<typeof playTone>[2]>>}
 */
const SOUND_RECIPES = {
  // 短い高音1発
  grab: [
    { type: "sine", freq: 660, freqEnd: 880, duration: 0.06, gain: 0.45 },
  ],
  // 少し低い1発
  place: [
    { type: "sine", freq: 340, freqEnd: 230, duration: 0.065, gain: 0.5 },
  ],
  // 短いノイズ的クリック（短い矩形波）
  chop: [
    { type: "square", freq: 190, freqEnd: 75, duration: 0.04, gain: 0.35, attack: 0.002 },
  ],
  // 2音上昇
  chopDone: [
    { type: "triangle", freq: 523.25, duration: 0.08, delay: 0, gain: 0.45 },
    { type: "triangle", freq: 783.99, duration: 0.14, delay: 0.075, gain: 0.5 },
  ],
  // 明るい3音アルペジオ
  serve: [
    { type: "sine", freq: 523.25, duration: 0.09, delay: 0, gain: 0.45 },
    { type: "sine", freq: 659.25, duration: 0.09, delay: 0.07, gain: 0.45 },
    { type: "sine", freq: 783.99, duration: 0.18, delay: 0.14, gain: 0.55 },
  ],
  // 低いノコギリ波 0.25秒
  buzz: [
    { type: "sawtooth", freq: 110, duration: 0.25, gain: 0.35 },
  ],
  // 下降2音
  expire: [
    { type: "triangle", freq: 392.0, duration: 0.12, delay: 0, gain: 0.45 },
    { type: "sawtooth", freq: 261.63, freqEnd: 220.0, duration: 0.2, delay: 0.11, gain: 0.35 },
  ],
  // 短い警告2回
  burnWarn: [
    { type: "square", freq: 880, duration: 0.06, delay: 0, gain: 0.3, attack: 0.003 },
    { type: "square", freq: 880, duration: 0.06, delay: 0.1, gain: 0.3, attack: 0.003 },
  ],
  // 低い持続音
  burnt: [
    { type: "sawtooth", freq: 98, freqEnd: 65, duration: 0.45, gain: 0.4, attack: 0.01 },
  ],
  // 軽い2音
  orderNew: [
    { type: "sine", freq: 587.33, duration: 0.07, delay: 0, gain: 0.35 },
    { type: "sine", freq: 880.0, duration: 0.11, delay: 0.065, gain: 0.4 },
  ],
  // 短いビープ
  count: [
    { type: "sine", freq: 600, duration: 0.08, gain: 0.4 },
  ],
  // 上昇3音
  start: [
    { type: "triangle", freq: 440.0, duration: 0.08, delay: 0, gain: 0.45 },
    { type: "triangle", freq: 554.37, duration: 0.08, delay: 0.08, gain: 0.45 },
    { type: "triangle", freq: 659.25, duration: 0.2, delay: 0.16, gain: 0.55 },
  ],
  // 下降3音
  end: [
    { type: "triangle", freq: 659.25, duration: 0.1, delay: 0, gain: 0.45 },
    { type: "triangle", freq: 523.25, duration: 0.1, delay: 0.1, gain: 0.45 },
    { type: "triangle", freq: 392.0, duration: 0.24, delay: 0.2, gain: 0.5 },
  ],
  // かわいい1音
  emote: [
    { type: "sine", freq: 784.0, freqEnd: 1174.66, duration: 0.11, gain: 0.42 },
  ],
};

/**
 * 効果音プレイヤーを生成する。
 * AudioContext は初期状態では生成せず、resume() 呼び出し時に遅延生成する。
 * @returns {{ resume: () => Promise<void>, play: (name: string) => void }} オーディオ制御オブジェクト
 */
export function createAudio() {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let masterGain = null;

  /**
   * AudioContext を遅延生成し、suspended 状態であれば再開する。
   * ブラウザの自動再生制限対策としてユーザー操作ハンドラ内から呼ぶことを想定する。
   * @returns {Promise<void>}
   */
  async function resume() {
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    if (!ctx) {
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(MASTER_GAIN, ctx.currentTime);
      masterGain.connect(ctx.destination);
    }

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // 自動再生制限等で拒否された場合も例外を外へ漏らさない
      }
    }
  }

  /**
   * 指定された名前の効果音を合成して再生する。
   * AudioContext が未生成の場合、または未定義の効果音名の場合は何もしない。
   * @param {string} name - 効果音名
   */
  function play(name) {
    if (!ctx || !masterGain) {
      return;
    }

    const recipe = SOUND_RECIPES[name];
    if (!recipe) {
      return;
    }

    for (const tone of recipe) {
      playTone(ctx, masterGain, tone);
    }
  }

  return {
    resume,
    play,
  };
}
