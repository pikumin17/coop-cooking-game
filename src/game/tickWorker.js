/** 計画書A3/C11: ホストの刻み専用ワーカー。 */
setInterval(() => {
  postMessage(0);
}, 1000 / 60);
