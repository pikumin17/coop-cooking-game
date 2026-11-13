import { DEFAULT_NAME } from "./config.js";
import { T } from "./data/text.js";
import { STAGES } from "./data/stages.js";
import { parseStage } from "./sim/world.js";
import { targetTile } from "./sim/movement.js";
import { createHostSession } from "./game/hostSession.js";
import { createClientSession } from "./game/clientSession.js";
import { normalizeCode, isValidCode } from "./net/roomcode.js";
import { createScreens } from "./ui/screens.js";
import { createAudio } from "./audio.js";
import { createInput } from "./input.js";
import { createRenderer } from "./render/renderer.js";
import { createEffects } from "./render/effects.js";
import { showHowto, showMenu, showDialog } from "./ui/overlays.js";

const params = new URLSearchParams(window.location.search);
const options = {
  room: params.get("room"),
  solo: params.get("solo") === "1",
  debug: params.get("debug") === "1",
  lag: Math.max(0, Number(params.get("lag")) || 0),
  seed: params.has("seed") && Number.isFinite(Number(params.get("seed")))
    ? Number(params.get("seed"))
    : undefined,
};
let name = DEFAULT_NAME;
try {
  name = localStorage.getItem("harapeko.name") || name;
} catch {
  // 保存できない環境でも遊べるようにする。
}

const canvas = document.querySelector("#game");
const root = document.querySelector("#screens");
const overlay = document.querySelector("#overlay");
const renderer = createRenderer(canvas);
const input = createInput(window);
const audio = createAudio();
const effects = createEffects();
const stage = STAGES.kado;
const { tiles } = parseStage(stage);
let screen = "title";
let current = null;
let latestView = null;
let roster = [];
let code = null;
let overlayOpen = false;
// オーバーレイ自身が閉じた場合も入力状態を同期する。
new MutationObserver(syncInput).observe(overlay, { childList: true });
const screens = createScreens(root, {
  onCreate(value) {
    createHost(value, false);
  },
  onJoin: join,
  onReady(ready) {
    if (current?.kind === "client") {
      current.session?.setReady(ready);
    }
  },
  onStart() {
    if (current?.kind === "host" && current.session) {
      current.session.start(options.seed);
      showGame();
    }
  },
  onAgain() {
    if (current?.kind === "host" && current.session) {
      current.session.again();
      showGame();
    }
  },
  onToLobby() {
    if (current?.kind === "host" && current.session) {
      current.session.toLobby();
      showLobby();
    }
  },
  onLeave: toTitle,
  onSoloOffline(value) {
    createHost(value, true);
  },
  onHowto() {
    showHowto(overlay);
    syncInput();
  },
});

/** 初回操作で音声制限を解除する。 */
function unlockAudio() {
  audio.resume();
  window.removeEventListener("keydown", unlockAudio);
  window.removeEventListener("pointerdown", unlockAudio);
}
window.addEventListener("keydown", unlockAudio);
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("resize", renderer.resize);

/** 名前の保存が禁止されていても開始を妨げない。 */
function saveName(value) {
  name = value || DEFAULT_NAME;
  try {
    localStorage.setItem("harapeko.name", name);
  } catch {
    // 今回のセッションではメモリー上の名前を使う。
  }
}

/** パネルの開閉に合わせてゲーム入力を切り替える。 */
function syncInput() {
  overlayOpen = overlay.hasChildNodes();
  input.setEnabled(screen === "game" && !overlayOpen);
}

function panel(title) {
  const node = document.createElement("section");
  node.className = "panel";
  const heading = document.createElement("h2");
  heading.textContent = title;
  node.append(heading);
  return node;
}

function showOverlay(node) {
  overlayOpen = true;
  overlay.replaceChildren(node);
  syncInput();
}

function closeOverlay() {
  overlayOpen = false;
  overlay.replaceChildren();
  syncInput();
}

/** 先に参照を外し、退室中や旧接続からの通知を無視する。 */
function clearSession() {
  const previous = current;
  current = null;
  previous?.session?.leave();
  latestView = null;
  roster = [];
  code = null;
  closeOverlay();
}

function toTitle(error) {
  clearSession();
  screen = "title";
  screens.show("title", { name, error });
  syncInput();
}

function selfSlot() {
  return current?.kind === "host" ? 0 : current?.session?.slot ?? null;
}

function lobbyData() {
  return {
    code,
    roster,
    isHost: current?.kind === "host",
    selfSlot: selfSlot(),
  };
}

function showLobby() {
  const updating = screen === "lobby";
  screen = "lobby";
  closeOverlay();
  if (updating) {
    screens.update("lobby", lobbyData());
  } else {
    screens.show("lobby", lobbyData());
  }
  syncInput();
}

function showGame() {
  screen = "game";
  screens.show("none");
  closeOverlay();
}

/** ロビーの古い表示をゲーム再開と誤認しないように破棄する。 */
function receiveView(view) {
  if (!view) {
    return;
  }
  latestView = view;
  if ((view.phase === "countdown" || view.phase === "playing")
      && screen !== "game" && screen !== "result") {
    showGame();
  }
}

/** セッション生成中の同期通知にも対応し、旧セッションを隔離する。 */
function callbacks(record) {
  return {
    onView(view) {
      if (current === record) {
        receiveView(view);
      }
    },
    onRoster(players, phase) {
      if (current !== record) {
        return;
      }
      roster = players;
      if (phase === "lobby") {
        latestView = null;
        showLobby();
      } else if (screen === "lobby") {
        screens.update("lobby", lobbyData());
      }
    },
    onResult(result) {
      if (current !== record) {
        return;
      }
      screen = "result";
      closeOverlay();
      screens.show("result", { ...result, isHost: record.kind === "host" });
    },
    onEvents(events) {
      if (current === record) {
        onEvents(events);
      }
    },
  };
}

/** ルーム作成失敗時はタイトル上でオフライン開始も選べるようにする。 */
function showRoomFailed() {
  toTitle(T.roomFailed);
  showDialog(overlay, {
    message: T.roomFailed,
    buttons: [
      {
        label: T.soloOffline,
        onClick: () => {
          closeOverlay();
          createHost(name, true);
        },
      },
      { label: T.toTitle, onClick: () => toTitle() },
    ],
  });
  syncInput();
}

function createHost(value, offline) {
  clearSession();
  saveName(value);
  const record = { kind: "host", session: null };
  current = record;
  try {
    record.session = createHostSession({
      name,
      stageId: "kado",
      offline,
      ...callbacks(record),
      onCode(value) {
        if (current === record) {
          code = value;
          if (screen === "lobby") {
            screens.update("lobby", lobbyData());
          }
        }
      },
      onError() {
        if (current === record) {
          showRoomFailed();
        }
      },
    });
    if (current !== record) {
      record.session.leave();
      return;
    }
    if (offline) {
      record.session.start(options.seed);
      showGame();
    }
  } catch {
    if (current === record) {
      showRoomFailed();
    }
  }
}

function join(value, rawCode) {
  const normalized = normalizeCode(rawCode);
  if (!isValidCode(normalized)) {
    screen = "join";
    closeOverlay();
    screens.show("join", { name: value, error: T.errBadCode });
    return;
  }
  clearSession();
  saveName(value);
  screen = "join";
  code = normalized;
  screens.show("none");
  showOverlay(panel(T.connecting));
  const record = { kind: "client", session: null };
  current = record;
  try {
    record.session = createClientSession({
      name,
      code: normalized,
      lag: options.lag,
      ...callbacks(record),
      onClosed(reason) {
        if (current !== record) {
          return;
        }
        const errors = {
          full: T.errFull,
          version: T.errVersion,
          "not-found": T.errNotFound,
          "host-left": T.hostClosed,
          timeout: T.hostClosed,
          closed: T.hostClosed,
        };
        toTitle(errors[reason] || T.errConnect);
      },
    });
    if (current !== record) {
      record.session.leave();
    }
  } catch {
    if (current === record) {
      toTitle(T.errConnect);
    }
  }
}

/** M1 と同じイベント名で効果音を再生する。 */
function onEvents(events) {
  const sounds = {
    serve: "serve",
    buzz: "buzz",
    chop: "chop",
    chopDone: "chopDone",
    expire: "expire",
    burnt: "burnt",
    burnWarn: "burnWarn",
    cooked: "chopDone",
    orderNew: "orderNew",
    grab: "grab",
    place: "place",
    trash: "place",
  };
  for (const event of events) {
    effects.push(event, latestView);
    const sound = event.e === "phase"
      ? ({ playing: "start", result: "end" })[event.phase]
      : sounds[event.e];
    if (sound) {
      audio.play(sound);
    }
  }
}

/** ホストの操作対象は最新の自プレイヤーの向きから求める。 */
function currentTarget() {
  const player = latestView?.players.find((entry) => entry.slot === selfSlot());
  return player ? targetTile({ x: player.x, y: player.y, fx: player.fx, fy: player.fy }, tiles) : null;
}

input.onAction((action) => {
  if (screen !== "game" || overlayOpen || !current?.session) {
    return;
  }
  if (current.kind === "host" && action.a === "grab") {
    const target = currentTarget();
    if (target) {
      current.session.action({ a: "grab", x: target.x, y: target.y });
    }
  } else {
    current.session.action(action);
  }
});
input.onMenu(() => {
  if (overlayOpen) {
    closeOverlay();
    return;
  }
  if (screen !== "game") {
    return;
  }
  showMenu(overlay, {
    onResume() {},
    onLeave: () => toTitle(),
  });
  syncInput();
});

if (options.room !== null) {
  join(name, options.room);
} else if (options.solo) {
  createHost(name, true);
} else {
  toTitle();
}
syncInput();
renderer.resize();

let previousTime = performance.now();
let fps = 0;
/** ロビーでもスナップを確認し、クライアントの開始を検出する。 */
function frame(now) {
  const elapsed = now - previousTime;
  previousTime = now;
  effects.update(elapsed / 1000);
  if (elapsed > 0) {
    fps = fps * 0.9 + (1000 / elapsed) * 0.1;
  }
  const record = current;
  if (record?.kind === "client" && record.session) {
    record.session.update(now, input.state());
    if (current === record) {
      receiveView(record.session.getView(now));
    }
  }
  if ((screen === "game" || screen === "result") && record?.session && current === record) {
    if (record.kind === "host") {
      record.session.input(input.state());
    }
    if (current === record) {
      const ping = record.kind === "client" ? record.session.getPing() : null;
      renderer.render(latestView, {
        stage,
        roster: Object.fromEntries(roster.map((player) => [player.slot, { name: player.name }])),
        selfSlot: selfSlot(),
        target: record.kind === "host" ? currentTarget() : null,
        ping,
        effects,
        now,
      });
      if (options.debug) {
        const debug = record.kind === "client"
          ? record.session.getDebug()
          : record.session.debugInfo();
        const error = record.kind === "client" ? ` err ${debug.lastErr.toFixed(3)}` : "";
        const ctx = canvas.getContext("2d");
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, 480, 17);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "11px monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`fps ${Math.round(fps)} tick ${latestView?.tick ?? 0} ${T.ping(ping == null ? "-" : Math.round(ping))} snap ${debug.snapBytes}B${error}`, 3, 3);
        ctx.restore();
      }
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
