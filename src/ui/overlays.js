import { T } from "../data/text.js";

/** パネルを表示し、自分のパネルだけを閉じる関数を返す。 */
function mount(overlayEl, panel) {
  overlayEl.replaceChildren(panel);
  return () => panel.remove();
}

/** 見出し付きのパネルを作る。 */
function createPanel(title) {
  const panel = document.createElement("section");
  panel.className = "panel";
  if (title) {
    const heading = document.createElement("h2");
    heading.textContent = title;
    panel.append(heading);
  }
  return panel;
}

/** 安全な文字列表示のボタンを作る。 */
function createButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

/** あそびかたを段落ごとに表示する。 */
export function showHowto(overlayEl) {
  const panel = createPanel(T.howto);
  for (const line of T.howtoBody) {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    panel.append(paragraph);
  }
  const close = mount(overlayEl, panel);
  panel.append(createButton(T.back, close));
  return close;
}

/** メニューを閉じてから再開または退室を通知する。 */
export function showMenu(overlayEl, { onResume, onLeave }) {
  const panel = createPanel(T.menuTitle);
  const close = mount(overlayEl, panel);
  panel.append(
    createButton(T.resume, () => {
      close();
      onResume();
    }),
    createButton(T.quitToTitle, () => {
      close();
      onLeave();
    }),
  );
  return close;
}

/** メッセージと選択肢を表示し、選択処理の後に閉じる。 */
export function showDialog(overlayEl, { message, buttons }) {
  const panel = createPanel();
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  panel.append(paragraph);
  const close = mount(overlayEl, panel);
  for (const { label, onClick } of buttons) {
    panel.append(createButton(label, () => {
      try {
        onClick();
      } finally {
        close();
      }
    }));
  }
  return close;
}
