import { createHostGame } from "./hostGame.js";
import { PROTOCOL_VERSION } from "../config.js";
import { createPeerHost } from "../net/peerHost.js";
import { sanitizeName, validateFromClient } from "../net/protocol.js";

/** ホストゲーム、任意の通信と固定刻みループを結合する。 */
export function createHostSession({
  name,
  stageId = "kado",
  offline,
  onView,
  onRoster,
  onResult,
  onEvents,
  onError,
  onCode,
}) {
  const game = createHostGame(stageId);
  const dt = 1 / 60;
  let worker = null;
  let timer = null;
  let lastTime = 0;
  let accumulator = 0;
  let resultSent = false;
  let left = false;
  let peerHost = null;
  let tickCount = 0;
  let tickFailures = 0;
  let snapBytes = 0;
  const connections = new Map();

  /** 現在の名簿を通信と画面で共用する。 */
  function lobbyMessage() {
    return {
      t: "lobby",
      players: Array.from(game.roster, ([slot, entry]) => ({
        slot,
        ...entry,
        host: slot === 0,
      })),
      phase: game.phase,
    };
  }

  /** 現在の名簿とフェーズを全員に通知する。 */
  function notifyRoster() {
    if (!left) {
      const message = lobbyMessage();
      peerHost?.broadcast(message);
      onRoster?.(message.players, message.phase);
    }
  }

  /** 検証した参加者メッセージを対応するスロットへ適用する。 */
  function onMessage(connId, raw) {
    if (left) {
      return;
    }
    if (raw?.t === "hello" && raw.v !== PROTOCOL_VERSION) {
      peerHost.send(connId, { t: "reject", reason: "version" });
      peerHost.close(connId);
      return;
    }
    const msg = validateFromClient(raw);
    if (!msg) {
      return;
    }
    if (msg.t === "hello") {
      // 同じ接続からの再挨拶で参加枠を増やさない。
      if (connections.has(connId)) {
        return;
      }
      const slot = [1, 2, 3].find((candidate) => !game.roster.has(candidate));
      if (game.roster.size >= 4 || slot === undefined) {
        peerHost.send(connId, { t: "reject", reason: "full" });
        peerHost.close(connId);
        return;
      }
      game.addPlayer(slot, sanitizeName(msg.name));
      connections.set(connId, slot);
      peerHost.send(connId, { t: "welcome", slot, stage: stageId });
      const snap = game.snap();
      if (snap) {
        peerHost.send(connId, snap);
      }
      peerHost.send(connId, lobbyMessage());
      notifyRoster();
      if (game.phase === "result") {
        peerHost.send(connId, game.result());
      }
      return;
    }
    if (msg.t === "ping") {
      peerHost.send(connId, { t: "pong", t0: msg.t0 });
      return;
    }
    const slot = connections.get(connId);
    if (slot === undefined) {
      return;
    }
    switch (msg.t) {
      case "ready":
        game.setReady(slot, msg.ok);
        notifyRoster();
        break;
      case "in":
        game.setInput(slot, { mx: msg.mx, my: msg.my, chop: msg.chop, seq: msg.seq });
        break;
      case "act":
        game.act(slot, msg);
        break;
    }
  }

  /** 切断した参加者を名簿とワールドから取り除く。 */
  function onDisconnect(connId) {
    const slot = connections.get(connId);
    if (!left && slot !== undefined) {
      game.removePlayer(slot);
      connections.delete(connId);
      notifyRoster();
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
        let events;
        try {
          events = game.tick(dt);
          tickFailures = 0;
        } catch (error) {
          tickFailures++;
          // 1回だけの失敗では部屋を解体せず、その刻みを飛ばして継続する。連続失敗時だけ従来どおり異常終了する。
          if (tickFailures >= 3) {
            throw error;
          }
          break;
        }
        if (events.length > 0) {
          peerHost?.broadcast({ t: "ev", list: events });
          onEvents?.(events);
        }
        tickCount++;
        if (!left && peerHost && tickCount % 3 === 0) {
          const snap = game.snap();
          if (snap) {
            snapBytes = new TextEncoder().encode(JSON.stringify(snap)).length;
            peerHost.broadcast(snap);
          }
        }
      }
      // 計画書2.4: 3刻みごとの配信に限らず、更新後は毎通知で描画する。
      if (!left && game.world) {
        onView?.(game.view());
      }
      if (!left && game.phase === "result" && !resultSent) {
        resultSent = true;
        const result = game.result();
        peerHost?.broadcast(result);
        onResult?.(result);
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
  function start(seed = (Math.random() * 2147483647) | 0) {
    if (left) {
      return;
    }
    game.start(seed);
    peerHost?.broadcast({ t: "start", stage: stageId, seed });
    tickCount = 0;
    resultSent = false;
    accumulator = 0;
    lastTime = performance.now();
    startLoop();
  }

  game.addPlayer(0, name);
  game.setReady(0, true);
  notifyRoster();

  const session = {
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
      if (left) {
        return;
      }
      left = true;
      stopLoop();
      try {
        peerHost?.broadcast({ t: "bye" });
      } finally {
        peerHost?.close();
        connections.clear();
      }
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
    /** 直近に配信したスナップの通信量を返す。 */
    debugInfo() {
      return { snapBytes, };
    },
    game,
  };

  if (!offline) {
    try {
      peerHost = createPeerHost({ onMessage, onDisconnect });
      Promise.resolve(peerHost.open()).then((code) => {
        if (!left) {
          session.code = code;
          onCode?.(code);
        }
      }).catch((error) => {
        if (!left) {
          onError?.(error);
        }
      });
    } catch (error) {
      onError?.(error);
    }
  }

  return session;
}
