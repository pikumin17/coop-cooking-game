import { STAGES } from "../data/stages.js";
import { createWorld, addPlayer, removePlayer, tileAt } from "../sim/world.js";
import { step } from "../sim/step.js";
import { grab } from "../sim/interact.js";
import { tryDash } from "../sim/movement.js";
import { encodeSnap, decodeSnap, buildResult } from "../sim/snapshot.js";

/** 計画書2.5: 通信に依存せず、名簿とゲームの進行を管理する。 */
export function createHostGame(stageId) {
  const roster = new Map();
  const stage = STAGES[stageId];
  let world = null;

  return {
    roster,
    stage,
    get phase() {
      return world?.phase ?? "lobby";
    },
    get world() {
      return world;
    },
    /** 参加者を登録し、進行中ならワールドにも追加する。 */
    addPlayer(slot, name) {
      roster.set(slot, { name, ready: false });
      if (world && (world.phase === "countdown" || world.phase === "playing")) {
        addPlayer(world, slot, name);
      }
    },
    /** 名簿とワールドから参加者を削除する。 */
    removePlayer(slot) {
      roster.delete(slot);
      if (world?.players[slot]) {
        removePlayer(world, slot);
      }
    },
    /** 参加者の準備状態を更新する。 */
    setReady(slot, ok) {
      const entry = roster.get(slot);
      if (entry) {
        entry.ready = ok;
      }
    },
    /** 最新入力と確認済み入力番号を保存する。 */
    setInput(slot, { mx, my, chop, seq }) {
      const player = world?.players[slot];
      if (player) {
        player.input = { mx, my, chop, seq };
        player.ack = seq;
      }
    },
    /** 計画書C5: 対象マスへの距離を検証して単発操作を適用する。 */
    act(slot, a) {
      const player = world?.players[slot];
      if (!player) {
        return;
      }
      if (a.a === "grab") {
        const { x, y } = a;
        if (!Number.isInteger(x) || !Number.isInteger(y)) {
          return;
        }
        const tile = tileAt(world, x, y);
        if (tile && tile.type !== "floor"
          && Math.hypot(player.x - x - 0.5, player.y - y - 0.5) <= 1.5) {
          grab(world, slot, x, y);
        }
      } else if (a.a === "dash") {
        tryDash(player);
      } else if (a.a === "emote") {
        player.emote = a.n;
        player.emoteT = 2;
      }
    },
    /** 現在の名簿とシードからワールドを作り直す。 */
    start(seed) {
      const players = Array.from(roster, ([slot, { name }]) => ({ slot, name }));
      world = createWorld(stageId, seed, players);
    },
    /** 固定時間だけ進め、発生したイベントを返す。 */
    tick(dt) {
      return world ? step(world, stage, dt) : [];
    },
    /** 通信用スナップショットを取得する。 */
    snap() {
      return world ? encodeSnap(world) : null;
    },
    /** 計画書2.4: ホストも通信と同じ変換経路で表示状態を作る。 */
    view() {
      return world ? decodeSnap(encodeSnap(world)) : null;
    },
    /** 現在の名簿を反映した結果を取得する。 */
    result() {
      return world ? buildResult(world, stage, roster) : null;
    },
    /** ワールドを破棄して全員の準備状態を解除する。 */
    backToLobby() {
      world = null;
      for (const entry of roster.values()) {
        entry.ready = false;
      }
    },
  };
}
