import { PROTOCOL_VERSION } from "../config.js";
import { STAGES } from "../data/stages.js";
import { parseStage } from "../sim/world.js";
import { targetTile } from "../sim/movement.js";
import { decodeSnap } from "../sim/snapshot.js";
import { validateFromHost } from "../net/protocol.js";
import { connectPeerClient } from "../net/peerClient.js";
import { createPredictor } from "./predict.js";
import { createInterp } from "./interp.js";

/** 計画書2.5・C1・C4: 通信、ローカル予測、他プレイヤーの補間を束ねる。 */
export function createClientSession({
  name,
  code,
  lag = 0,
  onRoster,
  onResult,
  onEvents,
  onClosed,
}) {
  let connection = null;
  let ended = false;
  let slot = null;
  let stageId = null;
  let stage = null;
  let tiles = null;
  let predictor = null;
  let interp = null;
  let latestSnap = null;
  let seq = 0;
  let lastUpdate = null;
  let accumulator = 0;
  let lastInput = null;
  let lastPing = null;
  let lastReceived = performance.now();
  let pingMs = null;
  let snapBytes = 0;
  let lastErr = 0;
  const facing = { x: 0, y: 1, };
  const timers = new Set();

  /** 人工遅延の予約を含め、終了後の処理を抑止する。 */
  function defer(fn) {
    if (ended) {
      return;
    }
    if (lag > 0) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!ended) {
          fn();
        }
      }, lag);
      timers.add(timer);
    } else {
      fn();
    }
  }

  /** 未接続・終了後の送信を抑止する。 */
  function send(msg) {
    if (connection && !ended) {
      defer(() => connection.send(msg));
    }
  }

  /** 終了理由は一度だけ通知し、再入する切断通知を抑止する。 */
  function finish(reason, notify = true) {
    if (ended) {
      return;
    }
    ended = true;
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
    connection?.close();
    if (notify) {
      onClosed?.(reason);
    }
  }

  /** スポーンから予測と補間を作り直す。 */
  function reset(id) {
    stageId = id;
    stage = STAGES[stageId];
    const parsed = parseStage(stage);
    tiles = parsed.tiles;
    const spawn = parsed.spawns[slot];
    predictor = createPredictor(stage, spawn.x, spawn.y);
    interp = createInterp();
    latestSnap = null;
    accumulator = 0;
    lastUpdate = null;
    lastInput = null;
    lastPing = null;
    facing.x = 0;
    facing.y = 1;
  }

  /** 検証済みのホスト通知を各処理へ振り分ける。 */
  function receive(raw) {
    if (ended) {
      return;
    }
    const msg = validateFromHost(raw);
    if (!msg) {
      return;
    }
    lastReceived = performance.now();
    switch (msg.t) {
      case "welcome":
        slot = msg.slot;
        reset(msg.stage);
        break;
      case "reject":
        finish(msg.reason);
        break;
      case "lobby":
        onRoster?.(msg.players, msg.phase);
        break;
      case "start":
        if (slot !== null) {
          reset(msg.stage);
        }
        break;
      case "snap": {
        snapBytes = new TextEncoder().encode(JSON.stringify(msg)).length;
        if (!predictor || !interp) {
          break;
        }
        const view = decodeSnap(msg);
        interp.push(view, performance.now());
        const entry = view.players.find((player) => player.slot === slot);
        if (entry) {
          lastErr = Math.hypot(predictor.pos.x - entry.x, predictor.pos.y - entry.y);
          predictor.reconcile(entry.x, entry.y, entry.ack);
        }
        latestSnap = view;
        break;
      }
      case "ev":
        onEvents?.(msg.list);
        break;
      case "result":
        onResult?.(msg);
        break;
      case "pong":
        pingMs = performance.now() - msg.t0;
        break;
      case "bye":
        finish("host-left");
        break;
    }
  }

  connectPeerClient(code, {
    onMessage: (msg) => defer(() => receive(msg)),
    onClose: () => {
      // 接続前の切断は Promise の reject 経路で理由を確定する。
      if (connection) {
        finish("closed");
      }
    },
    onError: () => {},
  }).then((peer) => {
    if (ended) {
      peer.close();
      return;
    }
    connection = peer;
    lastReceived = performance.now();
    send({ t: "hello", name, v: PROTOCOL_VERSION, });
  }).catch((err) => {
    finish(err?.message === "not-found" ? "not-found" : "connect-failed");
  });

  return {
    /** 固定刻みの予測、約30Hzの入力送信、疎通確認を実行する。 */
    update(now, inputState) {
      if (ended || !connection || !predictor) {
        return;
      }
      if (now - lastReceived >= 5000) {
        finish("timeout");
        return;
      }
      const length = Math.hypot(inputState.mx, inputState.my);
      if (length > 0) {
        facing.x = inputState.mx / length;
        facing.y = inputState.my / length;
      }
      if (lastUpdate !== null) {
        accumulator += Math.max(0, (now - lastUpdate) / 1000);
      }
      lastUpdate = now;
      const dt = 1 / 60;
      accumulator = Math.min(accumulator, dt * 15);
      let steps = 0;
      while (accumulator >= dt && steps < 15) {
        predictor.step(inputState, dt);
        accumulator -= dt;
        steps += 1;
      }
      if (lastInput === null || now - lastInput >= 33) {
        lastInput = now;
        seq += 1;
        predictor.record(seq);
        send({
          t: "in",
          seq,
          mx: inputState.mx,
          my: inputState.my,
          chop: inputState.chop,
        });
      }
      if (lastPing === null || now - lastPing >= 2000) {
        lastPing = now;
        send({ t: "ping", t0: now, });
      }
    },
    /** 最新の状態情報に予測位置と遅延補間位置を合成する。 */
    getView(now) {
      if (ended || !connection || !interp || !latestSnap) {
        return null;
      }
      const { a, b, alpha, latest } = interp.sample(now);
      if (!latest) {
        return null;
      }
      const otherPlayers = new Map(b.players.map((player) => [player.slot, player]));
      return {
        ...latest,
        items: a.items,
        orders: a.orders,
        players: a.players.map((player) => {
          if (player.slot === slot) {
            return { ...player, ...predictor.renderPos(), };
          }
          const next = otherPlayers.get(player.slot);
          return next ? {
            ...player,
            x: player.x + (next.x - player.x) * alpha,
            y: player.y + (next.y - player.y) * alpha,
          } : { ...player, };
        }),
      };
    },
    /** 単発操作を送信し、ダッシュのみ先行予測する。 */
    action(a) {
      if (ended || !connection || !predictor) {
        return;
      }
      if (a.a === "grab") {
        const pos = predictor.renderPos();
        const target = targetTile({ ...pos, fx: facing.x, fy: facing.y, }, tiles);
        if (target) {
          send({ t: "act", a: "grab", x: target.x, y: target.y, });
        }
      } else if (a.a === "dash") {
        predictor.dash();
        send({ t: "act", a: "dash", });
      } else if (a.a === "emote") {
        send({ t: "act", a: "emote", n: a.n, });
      }
    },
    /** ロビーで準備状態を送信する。 */
    setReady(b) {
      send({ t: "ready", ok: b, });
    },
    /** 直近の往復遅延を返す。 */
    getPing() {
      return pingMs;
    },
    /** 直近の通信量と予測誤差を返す。 */
    getDebug() {
      return { snapBytes, lastErr, ping: pingMs, };
    },
    /** 通知を停止して退室する。 */
    leave() {
      finish(null, false);
    },
    /** welcome で割り当てられたスロットを公開する。 */
    get slot() {
      return slot;
    },
    /** 現在のステージ識別子を公開する。 */
    get stageId() {
      return stageId;
    },
  };
}
