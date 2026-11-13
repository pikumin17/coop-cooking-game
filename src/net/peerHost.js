import { getPeerClass } from "./peerLoader.js";
import { generateCode, toPeerId } from "./roomcode.js";

/**
 * ルームを公開し、クライアント接続を管理する。
 * @param {object} callbacks - 接続、受信、切断時の通知先。
 * @param {Function} callbacks.onConnect - 接続 ID の通知先。
 * @param {Function} callbacks.onMessage - 接続 ID と未検証メッセージの通知先。
 * @param {Function} callbacks.onDisconnect - 切断した接続 ID の通知先。
 * @returns {{open: Function, send: Function, broadcast: Function, close: Function}} ホスト操作。
 */
export function createPeerHost({ onConnect, onMessage, onDisconnect }) {
  const connections = new Map();
  let peer = null;
  let nextConnId = 1;
  let opening = null;
  let cancelOpen = null;

  /**
   * 最大 5 回の ID 取得を試み、公開したルームコードを返す。
   * @returns {Promise<string>} ルームコード。
   */
  function open() {
    if (opening) {
      return opening;
    }
    opening = new Promise((resolve, reject) => {
      const PeerClass = getPeerClass();
      let attempts = 0;
      let settled = false;

      /**
       * 公開の失敗を確定し、Peer を破棄する。
       * @param {Error} error - 失敗理由。
       */
      function fail(error) {
        if (settled) {
          return;
        }
        settled = true;
        cancelOpen = null;
        const failedPeer = peer;
        peer = null;
        reject(error);
        failedPeer?.destroy();
      }

      cancelOpen = () => fail(new Error("host-closed"));

      /** ID 衝突時には古い Peer を破棄して作り直す。 */
      function attempt() {
        attempts += 1;
        const code = generateCode();
        const currentPeer = new PeerClass(toPeerId(code));
        peer = currentPeer;
        let reconnectAttempted = false;

        currentPeer.on("open", () => {
          if (peer !== currentPeer || settled) {
            return;
          }
          settled = true;
          cancelOpen = null;
          resolve(code);
        });
        currentPeer.on("error", (error) => {
          if (peer !== currentPeer || settled) {
            return;
          }
          if (error.type === "unavailable-id" && attempts < 5) {
            peer = null;
            currentPeer.destroy();
            try {
              attempt();
            } catch (retryError) {
              fail(retryError);
            }
          } else {
            fail(error);
          }
        });
        currentPeer.on("disconnected", () => {
          if (peer === currentPeer && !reconnectAttempted) {
            reconnectAttempted = true;
            currentPeer.reconnect();
          }
        });
        currentPeer.on("connection", (conn) => {
          if (peer !== currentPeer) {
            conn.close();
            return;
          }
          const connId = String(nextConnId++);
          let disconnected = false;
          connections.set(connId, conn);

          /** 切断通知を接続ごとに一度だけ送る。 */
          function disconnect() {
            if (disconnected) {
              return;
            }
            disconnected = true;
            connections.delete(connId);
            onDisconnect?.(connId);
          }

          conn.on("open", () => {
            if (!disconnected) {
              onConnect?.(connId);
            }
          });
          conn.on("data", (msg) => {
            if (!disconnected) {
              onMessage?.(connId, msg);
            }
          });
          conn.on("close", disconnect);
          conn.on("error", disconnect);
        });
      }

      attempt();
    });
    return opening;
  }

  /**
   * 指定接続へメッセージを送る。
   * @param {string} connId - 接続 ID。
   * @param {*} msg - 送信するメッセージ。
   */
  function send(connId, msg) {
    connections.get(connId)?.send(msg);
  }

  /**
   * 全接続へメッセージを送る。
   * @param {*} msg - 送信するメッセージ。
   */
  function broadcast(msg) {
    for (const conn of connections.values()) {
      conn.send(msg);
    }
  }

  /**
   * 指定接続、またはホスト全体を閉じる。
   * @param {string} [connId] - 省略時は全接続と Peer を破棄する。
   */
  function close(connId) {
    if (connId !== undefined) {
      connections.get(connId)?.close();
      return;
    }
    for (const conn of [...connections.values()]) {
      conn.close();
    }
    connections.clear();
    cancelOpen?.();
    const closingPeer = peer;
    peer = null;
    closingPeer?.destroy();
  }

  return { open, send, broadcast, close, };
}
