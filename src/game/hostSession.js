import { createHostGame } from "./hostGame.js";

/** オフラインのホストゲームと固定刻みループを結合する。 */
export function createHostSession({
  name,
  stageId = "kado",
  offline,
  onView,
  onRoster,
  onResult,
  onEvents,
  onError,
}) {
  if (!offline) {
    throw new Error("オンラインのホストセッションは未実装です。");
  }

  const game = createHostGame(stageId);
  const dt = 1 / 60;
  let worker = null;
  let timer = null;
  let lastTime = 0;
  let accumulator = 0;
  let resultSent = false;
  let left = false;

  /** 現在の名簿とフェーズを通知する。 */
  function notifyRoster() {
    if (!left) {
      onRoster?.(Array.from(game.roster, ([slot, entry]) => ({
        slot,
        ...entry,
        host: slot === 0,
      })), game.phase);
    }
  }

  /** ワーカーと代替タイマーを停止する。 */
  function stopLoop() {
    worker?.terminate();
    worker = null;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** 計画書C11: 経過時間を蓄積し、一通知につき最大15回更新する。 */
  function pulse() {
    if (left) {
      return;
    }
    try {
      const now = performance.now();
      accumulator += Math.max(0, (now - lastTime) / 1000);
      lastTime = now;
      // 長時間の休止による追い付き処理は最大15刻みに制限する。
      accumulator = Math.min(accumulator, dt * 15);
      let ticks = 0;
      while (!left && accumulator >= dt && ticks < 15) {
        accumulator -= dt;
        ticks++;
        const events = game.tick(dt);
        if (events.length > 0) {
          onEvents?.(events);
        }
      }
      // 計画書2.4: 3刻みごとの配信に限らず、更新後は毎通知で描画する。
      if (!left && game.world) {
        onView?.(game.view());
      }
      if (!left && game.phase === "result" && !resultSent) {
        resultSent = true;
        onResult?.(game.result());
      }
    } catch (error) {
      stopLoop();
      if (!left) {
        onError?.(error);
      }
    }
  }

  /** ワーカーを優先し、利用できない場合は通常タイマーで刻む。 */
  function startLoop() {
    if (worker || timer !== null) {
      return;
    }
    try {
      worker = new Worker(new URL("./tickWorker.js", import.meta.url), { type: "module" });
      worker.onmessage = pulse;
      worker.onerror = (event) => {
        event.preventDefault();
        if (!left && worker) {
          worker.terminate();
          worker = null;
          timer = setInterval(pulse, 16);
        }
      };
    } catch {
      worker?.terminate();
      worker = null;
      timer = setInterval(pulse, 16);
    }
  }

  /** 新しいシードで開始し、結果通知と時間の蓄積を初期化する。 */
  function start() {
    if (left) {
      return;
    }
    game.start((Math.random() * 2147483647) | 0);
    resultSent = false;
    accumulator = 0;
    lastTime = performance.now();
    startLoop();
  }

  game.addPlayer(0, name);
  game.setReady(0, true);
  notifyRoster();

  return {
    code: null,
    start,
    /** 結果画面から新しいゲームを始める。 */
    again() {
      if (game.phase === "result") {
        start();
      }
    },
    /** ループを維持したままロビーへ戻す。 */
    toLobby() {
      if (!left) {
        game.backToLobby();
        notifyRoster();
      }
    },
    /** 退室後はループとすべての通知を停止する。 */
    leave() {
      left = true;
      stopLoop();
    },
    /** 自分の連続入力をゲームへ渡す。 */
    input(state) {
      if (!left) {
        game.setInput(0, { ...state, seq: 0 });
      }
    },
    /** 自分の単発操作をゲームへ渡す。 */
    action(a) {
      if (!left) {
        game.act(0, a);
      }
    },
    game,
  };
}
