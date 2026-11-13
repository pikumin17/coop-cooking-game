/** キーボード入力を管理し、移動状態と単発操作を分離する。 */
export function createInput(win) {
  const pressed = new Set();
  const doc = win.document;
  let enabled = true;
  let action = () => {};
  let menu = () => {};
  /** 入力欄への操作かを判定する。 */
  function editing(target) {
    return Boolean(target && (target.closest?.("input, textarea") || target.isContentEditable));
  }
  /** 押下状態をすべて解除する。 */
  function clear() {
    pressed.clear();
  }
  /** 単発操作と押下開始を処理する。 */
  function keydown(event) {
    if (!enabled || editing(event.target)) {
      clear();
      return;
    }
    const code = event.code;
    if (code === "Space" || code.startsWith("Arrow")) {
      event.preventDefault();
    }
    if (event.repeat) {
      return;
    }
    pressed.add(code);
    if (code === "Space") {
      action({ a: "grab" });
    } else if (code === "ShiftLeft" || code === "ShiftRight") {
      action({ a: "dash" });
    } else if (/^Digit[1-4]$/.test(code)) {
      action({ a: "emote", n: Number(code.slice(-1)) });
    } else if (code === "Escape") {
      menu();
    }
  }
  /** キーを離したら状態を解除する。 */
  function keyup(event) {
    pressed.delete(event.code);
  }
  win.addEventListener("keydown", keydown);
  win.addEventListener("keyup", keyup);
  win.addEventListener("blur", clear);
  doc.addEventListener("visibilitychange", clear);
  return {
    /** 現在の移動・刻み入力を取得する。 */
    state() {
      if (!enabled || editing(doc.activeElement)) {
        clear();
        return { mx: 0, my: 0, chop: false };
      }
      const has = (...codes) => Number(codes.some((code) => pressed.has(code)));
      return {
        mx: has("KeyD", "ArrowRight") - has("KeyA", "ArrowLeft"),
        my: has("KeyS", "ArrowDown") - has("KeyW", "ArrowUp"),
        chop: pressed.has("KeyE"),
      };
    },
    /** 単発操作の通知先を設定する。 */
    onAction(cb) { action = cb; },
    /** メニュー操作の通知先を設定する。 */
    onMenu(cb) { menu = cb; },
    /** 入力を有効化・無効化する。 */
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) {
        clear();
      }
    },
    /** 登録したイベントを解除する。 */
    dispose() {
      clear();
      win.removeEventListener("keydown", keydown);
      win.removeEventListener("keyup", keyup);
      win.removeEventListener("blur", clear);
      doc.removeEventListener("visibilitychange", clear);
    },
  };
}
