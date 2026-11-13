import { getPeerClass } from "./peerLoader.js";
import { toPeerId } from "./roomcode.js";

/**
 * ルームへ接続し、未検証のメッセージを受け渡す。
 * @param {string} code - 接続先のルームコード。
 * @param {object} callbacks - 受信、切断、エラー時の通知先。
 * @param {Function} callbacks.onMessage - メッセージの通知先。
 * @param {Function} callbacks.onClose - 切断の通知先。
 * @param {Function} callbacks.onError - エラー種別の通知先。
 * @returns {Promise<{send: Function, close: Function}>} 接続操作。
 */
export function connectPeerClient(code, { onMessage, onClose, onError }) {
  return new Promise((resolve, reject) => {
    const PeerClass = getPeerClass();
    const peer = new PeerClass();
    let conn = null;
    let settled = false;
    let connected = false;
    let closed = false;
    let closeNotified = false;
    const timer = setTimeout(() => {
      fail(new Error("connect-failed"));
    }, 10000);

    /**
     * 未完了の接続を失敗として確定し、リソースを解放する。
     * @param {Error} error - 失敗理由。
     */
    function fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
      close();
    }

    /**
     * 接続が開いている場合だけメッセージを送る。
     * @param {*} msg - 送信するメッセージ。
     */
    function send(msg) {
      if (!closed && conn?.open) {
        conn.send(msg);
      }
    }

    /** 接続と Peer を破棄する。 */
    function close() {
      if (closed) {
        return;
      }
      closed = true;
      conn?.close();
      peer.destroy();
    }

    peer.on("error", (error) => {
      if (closed) {
        return;
      }
      if (error.type === "peer-unavailable") {
        if (!settled) {
          fail(new Error("not-found"));
        } else if (connected) {
          onError?.("not-found");
        }
      } else {
        onError?.(error.type);
      }
    });
    peer.on("open", () => {
      if (closed || settled || conn) {
        return;
      }
      try {
        conn = peer.connect(toPeerId(code), {
          serialization: "json",
          reliable: true,
        });
        conn.on("open", () => {
          if (closed || settled) {
            return;
          }
          settled = true;
          connected = true;
          clearTimeout(timer);
          resolve({ send, close, });
        });
        conn.on("data", (msg) => {
          if (!closed) {
            onMessage?.(msg);
          }
        });
        conn.on("close", () => {
          if (!closeNotified) {
            closeNotified = true;
            onClose?.();
          }
        });
      } catch (error) {
        fail(error);
      }
    });
  });
}
