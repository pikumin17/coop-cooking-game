import { PROTOCOL_VERSION, DEFAULT_NAME, NAME_MAX } from "../config.js";

/**
 * 値が null でなく配列でもないオブジェクトかを判定する。
 * @param {unknown} v
 * @returns {boolean}
 */
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 値が有限の数値かを判定する。
 * @param {unknown} v
 * @returns {boolean}
 */
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * 値が指定範囲内の整数かを判定する。
 * @param {unknown} v
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
function isIntInRange(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

/**
 * 数値を [min, max] の範囲にクランプする。
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * プレイヤー名をサニタイズする。
 * 文字列以外、制御文字のみ、または空白のみの入力は DEFAULT_NAME にフォールバックする。
 *
 * 不正値の例:
 * - null / 123 / {}（文字列でない → DEFAULT_NAME）
 * - "\u0000\u001f   "（制御文字と空白のみ → DEFAULT_NAME）
 *
 * @param {unknown} s - 入力された名前
 * @returns {string} 整形済みの名前
 */
export function sanitizeName(s) {
  if (typeof s !== "string") {
    return DEFAULT_NAME;
  }
  // ASCII 制御文字および C1 制御文字を除去してから前後の空白を取り除く
  const cleaned = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
  const truncated = Array.from(cleaned).slice(0, NAME_MAX).join("");
  return truncated.length > 0 ? truncated : DEFAULT_NAME;
}

/**
 * 参加者（クライアント）から受信したメッセージを検証・整形する。
 * 不正なメッセージの場合は null を返す。
 *
 * 不正値の例:
 * - null / "hello" / []（オブジェクトでない、または t が文字列でない）
 * - { t: "hello", name: "a", v: 999 }（v が PROTOCOL_VERSION と不一致）
 * - { t: "in", seq: -1, mx: 0, my: 0, chop: false }（seq が負数または小数）
 * - { t: "in", seq: 1, mx: "1", my: NaN, chop: false }（mx に文字列、my が NaN/Infinity）
 * - { t: "act", a: "grab", x: 64, y: -1 }（x/y が 0〜63 の整数でない）
 * - { t: "act", a: "emote", n: 9 }（emote の n が 1〜4 の整数でない）
 * - { t: "ping", t0: Infinity }（t0 が有限数でない）
 * - { t: "unknown" }（未知のメッセージ種別 t）
 *
 * @param {unknown} msg - 受信メッセージ
 * @returns {Record<string, unknown> | null} 整形済みメッセージ、または不正時は null
 */
export function validateFromClient(msg) {
  if (!isPlainObject(msg) || typeof msg.t !== "string") {
    return null;
  }

  switch (msg.t) {
    case "hello": {
      if (msg.v !== PROTOCOL_VERSION) {
        return null;
      }
      return {
        t: "hello",
        name: sanitizeName(msg.name),
        v: PROTOCOL_VERSION,
      };
    }

    case "ready": {
      return {
        t: "ready",
        ok: Boolean(msg.ok),
      };
    }

    case "in": {
      if (!Number.isInteger(msg.seq) || msg.seq < 0) {
        return null;
      }
      if (!isFiniteNumber(msg.mx) || !isFiniteNumber(msg.my)) {
        return null;
      }
      return {
        t: "in",
        seq: msg.seq,
        mx: clamp(msg.mx, -1, 1),
        my: clamp(msg.my, -1, 1),
        chop: Boolean(msg.chop),
      };
    }

    case "act": {
      if (msg.a === "grab") {
        if (!isIntInRange(msg.x, 0, 63) || !isIntInRange(msg.y, 0, 63)) {
          return null;
        }
        return {
          t: "act",
          a: "grab",
          x: msg.x,
          y: msg.y,
        };
      }
      if (msg.a === "dash") {
        return {
          t: "act",
          a: "dash",
        };
      }
      if (msg.a === "emote") {
        if (!isIntInRange(msg.n, 1, 4)) {
          return null;
        }
        return {
          t: "act",
          a: "emote",
          n: msg.n,
        };
      }
      return null;
    }

    case "ping": {
      if (!isFiniteNumber(msg.t0)) {
        return null;
      }
      return {
        t: "ping",
        t0: msg.t0,
      };
    }

    default:
      return null;
  }
}

/**
 * ホストから受信したメッセージを検証する（参加者側の受信検証）。
 * 不正なメッセージの場合は null を返す。
 *
 * 不正値の例:
 * - null / 42 / []（オブジェクトでない、または t が文字列でない）
 * - { t: "welcome", slot: 4, stage: "s1" }（slot が 0〜3 の整数でない）
 * - { t: "reject", reason: "banned" }（reason が "full" または "version" でない）
 * - { t: "lobby", players: "none", phase: "wait" }（players が配列でない）
 * - { t: "start", stage: "s1", seed: "abc" }（seed が有限数でない）
 * - { t: "snap", k: NaN }（k が有限数でない）
 * - { t: "snap", k: 5 }（pl / it / od が配列でない）
 * - { t: "ev", list: null }（list が配列でない）
 * - { t: "pong", t0: "123" }（t0 が有限数でない）
 * - { t: "unknown" }（未知のメッセージ種別 t）
 *
 * @param {unknown} msg - 受信メッセージ
 * @returns {Record<string, unknown> | null} 検証を通過したメッセージ、または不正時は null
 */
export function validateFromHost(msg) {
  if (!isPlainObject(msg) || typeof msg.t !== "string") {
    return null;
  }

  switch (msg.t) {
    case "welcome": {
      if (!isIntInRange(msg.slot, 0, 3) || typeof msg.stage !== "string") {
        return null;
      }
      return msg;
    }

    case "reject": {
      if (msg.reason !== "full" && msg.reason !== "version") {
        return null;
      }
      return msg;
    }

    case "lobby": {
      if (!Array.isArray(msg.players) || typeof msg.phase !== "string") {
        return null;
      }
      return msg;
    }

    case "start": {
      if (typeof msg.stage !== "string" || !isFiniteNumber(msg.seed)) {
        return null;
      }
      return msg;
    }

    case "snap": {
      if (!isFiniteNumber(msg.k)
        || !Array.isArray(msg.pl) || !Array.isArray(msg.it) || !Array.isArray(msg.od)) {
        return null;
      }
      return msg;
    }

    case "ev": {
      if (!Array.isArray(msg.list)) {
        return null;
      }
      return msg;
    }

    case "result": {
      return msg;
    }

    case "pong": {
      if (!isFiniteNumber(msg.t0)) {
        return null;
      }
      return msg;
    }

    case "bye": {
      return msg;
    }

    default:
      return null;
  }
}
