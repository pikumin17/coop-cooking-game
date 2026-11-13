import { T } from "../data/text.js";

/** DOM を安全に組み立て、画面ごとの操作を通知する。 */
export function createScreens(rootEl, handlers) {
  let copyTimer = null;

  /** テキストだけを持つ要素を親へ追加する。 */
  function element(parent, tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) {
      node.textContent = text;
    }
    parent.appendChild(node);
    return node;
  }

  /** 通常の操作ボタンを追加する。 */
  function button(parent, text, onClick) {
    const node = element(parent, "button", text);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  /** ラベルに関連付けた入力欄を追加する。 */
  function input(parent, labelText, maxLength, value = "") {
    const label = element(parent, "label");
    element(label, "span", labelText);
    const node = element(label, "input");
    node.type = "text";
    node.maxLength = maxLength;
    node.value = value;
    return node;
  }

  /** タイトルと名前入力を表示する。 */
  function title(parent, data) {
    element(parent, "h1", T.title);
    if (data.error) {
      element(parent, "p", data.error).setAttribute("role", "alert");
    }
    const name = input(parent, T.nameLabel, 8, data.name ?? "");
    name.placeholder = T.namePlaceholder;
    button(parent, T.createRoom, () => handlers.onCreate(name.value));
    button(parent, T.joinRoom, () => show("join", { name: name.value }));
    button(parent, T.soloOffline, () => handlers.onSoloOffline(name.value));
    button(parent, T.howto, () => handlers.onHowto());
  }

  /** 大文字のルームコードを入力して参加する画面を表示する。 */
  function join(parent, data) {
    element(parent, "h1", T.joinRoom);
    if (data.error) {
      element(parent, "p", data.error).setAttribute("role", "alert");
    }
    const code = input(parent, T.codeLabel, 4);
    code.autocomplete = "off";
    code.addEventListener("input", () => {
      code.value = code.value.toUpperCase();
    });
    button(parent, T.join, () => handlers.onJoin(data.name, code.value.toUpperCase()));
    button(parent, T.back, () => show("title", { name: data.name }));
  }

  /** 名簿、招待リンクと準備操作を表示する。 */
  function lobby(parent, data) {
    const roster = data.roster ?? [];
    element(parent, "h1", T.lobbyTitle);
    element(parent, "p", data.code == null ? T.connecting : data.code);
    const copy = button(parent, T.inviteCopy, async () => {
      try {
        await navigator.clipboard.writeText(
          location.origin + location.pathname + "?room=" + data.code,
        );
        copy.textContent = T.copied;
        clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
          copy.textContent = T.inviteCopy;
        }, 2000);
      } catch {
        // コピーを許可されない環境では元のボタンを維持する。
      }
    });
    copy.disabled = data.code == null;
    const list = element(parent, "ul");
    for (let slot = 0; slot < 4; slot++) {
      const player = roster.find((entry) => entry.slot === slot);
      element(list, "li", player
        ? `${player.name}${player.host ? `（${T.hostMark}）` : ""}${player.ready ? ` ${T.ready}` : ""}`
        : T.slotEmpty);
    }
    if (data.isHost) {
      const allReady = roster.length > 0 && roster.every((player) => player.ready);
      button(parent, T.start, () => handlers.onStart()).disabled = !allReady;
      if (!allReady) {
        element(parent, "p", T.waitingReady);
      }
    } else {
      const self = roster.find((player) => player.slot === data.selfSlot);
      const ready = button(parent, T.ready, () => handlers.onReady(!self?.ready));
      ready.setAttribute("aria-pressed", String(Boolean(self?.ready)));
    }
    element(parent, "p", T.hostNote);
    button(parent, T.leave, () => handlers.onLeave());
  }

  /** 全体成績と参加者別の成績を表示する。 */
  function result(parent, data) {
    element(parent, "h1", T.resultTitle);
    element(parent, "p", data.cleared ? T.cleared : T.failed);
    element(parent, "p", "★".repeat(data.stars ?? 0));
    for (const [label, value] of [
      [T.totalCoins, data.score],
      [T.servedCount, data.served],
      [T.expiredCount, data.expired],
      [T.tipsTotal, data.tips],
      [T.burntCount, data.burnt],
    ]) {
      element(parent, "p", `${label}: ${value}`);
    }
    const list = element(parent, "ul");
    for (const player of data.players ?? []) {
      element(list, "li", `${player.name} ${T.statServed} ${player.served} ${T.statChopped} ${player.chopped} ${T.statPlated} ${player.plated}`);
    }
    if (data.isHost) {
      button(parent, T.again, () => handlers.onAgain());
      button(parent, T.toLobby, () => handlers.onToLobby());
    } else {
      element(parent, "p", T.waitHost());
    }
    button(parent, T.leave, () => handlers.onLeave());
  }

  /** 指定画面へ切り替える。none の場合は表示を空にする。 */
  function show(name, data = {}) {
    clearTimeout(copyTimer);
    copyTimer = null;
    rootEl.replaceChildren();
    const render = { title, join, lobby, result }[name];
    if (name === "none" || !render) {
      return;
    }
    const panel = element(rootEl, "section");
    panel.className = "screen screen-" + name;
    render(panel, data);
  }

  /** 最新データで画面を再描画する。 */
  function update(name, data) {
    show(name, data);
  }

  return { show, update, };
}
