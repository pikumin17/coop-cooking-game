/**
 * CDN から読み込まれた PeerJS のコンストラクターを取得する。
 * @returns {Function} Peer のコンストラクター。
 * @throws {Error} PeerJS が読み込まれていない場合。
 */
export function getPeerClass() {
  if (typeof globalThis.Peer === "function") {
    return globalThis.Peer;
  }
  if (typeof globalThis.peerjs?.Peer === "function") {
    return globalThis.peerjs.Peer;
  }
  throw new Error("peerjs-missing");
}
