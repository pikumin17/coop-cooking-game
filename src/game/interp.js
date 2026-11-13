/** 計画書2.5・C4: 受信履歴から6刻み遅れの描画用スナップを選ぶ。 */
export function createInterp() {
  const buffer = [];
  let estTick = 0;
  let estAt = 0;

  return {
    /** 受信スナップを保存し、推定刻みを指数平滑する。 */
    push(view, nowMs) {
      const first = buffer.length === 0;
      buffer.push({ view, recv: nowMs, });
      if (buffer.length > 20) {
        buffer.shift();
      }
      const latest = buffer[buffer.length - 1];
      const rawEst = latest.view.tick + (nowMs - latest.recv) * 0.06;
      estTick = first ? view.tick : estTick + (rawEst - estTick) * 0.1;
      estAt = nowMs;
    },
    /** 描画刻みを挟む二つのビューと補間係数を返す。 */
    sample(nowMs) {
      if (buffer.length === 0) {
        return { a: null, b: null, alpha: 0, latest: null, };
      }
      const latest = buffer[buffer.length - 1].view;
      const tick = estTick + (nowMs - estAt) * 0.06 - 6;
      let a = null;
      let b = null;
      for (const { view } of buffer) {
        if (view.tick <= tick && (!a || view.tick > a.tick)) {
          a = view;
        }
        if (view.tick >= tick && (!b || view.tick < b.tick)) {
          b = view;
        }
      }
      a ??= b;
      b ??= a;
      const alpha = a === b || b.tick === a.tick
        ? 0
        : Math.max(0, Math.min(1, (tick - a.tick) / (b.tick - a.tick)));
      return { a, b, alpha, latest, };
    },
  };
}
