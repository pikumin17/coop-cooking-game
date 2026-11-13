import { DEFAULT_NAME } from "./config.js";
import { T } from "./data/text.js";
import { STAGES } from "./data/stages.js";
import { parseStage } from "./sim/world.js";
import { targetTile } from "./sim/movement.js";
import { createHostSession } from "./game/hostSession.js";
import { createAudio } from "./audio.js";
import { createInput } from "./input.js";
import { createRenderer } from "./render/renderer.js";

const params = new URLSearchParams(window.location.search);
const options = {
  room: params.get("room"),
  solo: params.get("solo") === "1",
  debug: params.get("debug") === "1",
  lag: params.get("lag"),
  seed: params.get("seed"),
};
let name = DEFAULT_NAME;
try {
  name = localStorage.getItem("harapeko.name") || DEFAULT_NAME;
} catch {
  // 保存領域を使えないブラウザーでは既定名で開始する。
}
const canvas = document.querySelector("#game");
const screens = document.querySelector("#screens");
const overlay = document.querySelector("#overlay");
const renderer = createRenderer(canvas);
const input = createInput(window);
const audio = createAudio();
const stage = STAGES.kado;
const { tiles } = parseStage(stage);
let latestView = null;
let roster = new Map([[0, { name }]]);
let session = null;
let menuOpen = false;
let resultOpen = false;

/** 初回操作でブラウザーの音声制限を解除する。 */
function unlockAudio() {
  audio.resume();
  window.removeEventListener("keydown", unlockAudio);
  window.removeEventListener("pointerdown", unlockAudio);
}
window.addEventListener("keydown", unlockAudio);
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("resize", renderer.resize);

/** 現在の表示から自分が向いているマスを求める。 */
function currentTarget() {
  const player = latestView?.players.find((entry) => entry.slot === 0);
  return player ? targetTile({ x: player.x, y: player.y, fx: player.fx, fy: player.fy }, tiles) : null;
}

/** パネル用のボタンを作成する。 */
function button(label, callback) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.addEventListener("click", callback);
  return node;
}

/** 見出し付きの簡易パネルを作成する。 */
function panel(title) {
  const node = document.createElement("section");
  node.className = "panel";
  const heading = document.createElement("h2");
  heading.textContent = title;
  node.append(heading);
  return node;
}

/** 結果やメニューが表示されている間は操作を止める。 */
function syncInput() {
  input.setEnabled(Boolean(session) && !menuOpen && !resultOpen);
}

/** 結果パネルと操作ロックを解除する。 */
function clearResult() {
  resultOpen = false;
  screens.replaceChildren();
  syncInput();
}

/** 合計得点、星、全体成績を安全なテキストとして表示する。 */
function onResult(result) {
  resultOpen = true;
  syncInput();
  const node = panel(T.resultTitle);
  const score = document.createElement("p");
  score.textContent = `${T.totalCoins}: ${result.score}`;
  const stars = document.createElement("p");
  stars.textContent = "★".repeat(Math.max(0, Math.min(3, result.stars)));
  node.append(score, stars);
  for (const [label, key] of [
    [T.servedCount, "served"],
    [T.expiredCount, "expired"],
    [T.tipsTotal, "tips"],
    [T.burntCount, "burnt"],
  ]) {
    const line = document.createElement("p");
    line.textContent = `${label}: ${result[key] ?? 0}`;
    node.append(line);
  }
  node.append(
    button(T.again, () => {
      clearResult();
      session.again();
    }),
    button(T.toLobby, () => {
      session.toLobby();
      clearResult();
    }),
  );
  screens.replaceChildren(node);
}

/** シミュレーションイベントを効果音へ対応付ける。 */
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
    const sound = event.e === "phase"
      ? ({ playing: "start", result: "end" })[event.phase]
      : sounds[event.e];
    if (sound) {
      audio.play(sound);
    }
  }
}

/** エラーは既存文言を使って表示する。 */
function onError(error) {
  console.error(error);
  screens.replaceChildren(panel(T.errConnect));
}

/** メニューだけを閉じ、ゲームの操作を再開する。 */
function closeMenu() {
  menuOpen = false;
  overlay.replaceChildren();
  syncInput();
}
input.onMenu(() => {
  if (!session) {
    return;
  }
  if (menuOpen) {
    closeMenu();
    return;
  }
  menuOpen = true;
  syncInput();
  const node = panel(T.menuTitle);
  node.append(
    button(T.resume, closeMenu),
    button(T.quitToTitle, () => {
      session.leave();
      window.location.search = "";
    }),
  );
  overlay.replaceChildren(node);
});
input.onAction((action) => {
  if (!session) {
    return;
  }
  if (action.a === "grab") {
    const target = currentTarget();
    if (target) {
      session.action({ a: "grab", x: target.x, y: target.y });
    }
  } else {
    session.action(action);
  }
});

if (options.solo) {
  session = createHostSession({
    name,
    stageId: "kado",
    offline: true,
    onView(view) { latestView = view; },
    onRoster(value) {
      roster = Array.isArray(value)
        ? new Map(value.map((entry) => [entry.slot, entry]))
        : value;
    },
    onResult,
    onEvents,
    onError,
  });
  session.start();
  // ループ開始後にシード指定のワールドへ差し替える。
  if (options.seed !== null && Number.isFinite(Number(options.seed)) && session.game?.start) {
    session.game.start(Number(options.seed));
  }
} else {
  const node = panel(T.title);
  const message = document.createElement("p");
  message.textContent = `${T.soloOffline} (?solo=1)`;
  node.append(message);
  screens.replaceChildren(node);
}
syncInput();

let previousTime = performance.now();
let fps = 0;
/** 毎フレーム入力を送り、最新表示を描画する。 */
function frame(now) {
  const elapsed = now - previousTime;
  previousTime = now;
  if (elapsed > 0) {
    fps = fps * 0.9 + (1000 / elapsed) * 0.1;
  }
  session?.input(input.state());
  renderer.render(latestView, {
    stage,
    roster,
    selfSlot: 0,
    target: currentTarget(),
    ping: null,
    effects: null,
    now,
  });
  if (options.debug) {
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 150, 17);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`fps ${Math.round(fps)} tick ${latestView?.tick ?? 0}`, 3, 3);
    ctx.restore();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
