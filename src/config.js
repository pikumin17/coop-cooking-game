// 通信プロトコルのバージョン。
export const PROTOCOL_VERSION = 1;

// シミュレーションの更新頻度（Hz）。位置や距離はマス単位で扱う。
export const TICK_RATE = 60;

// スナップショットの配信間隔（ティック数、20Hz）。
export const SNAP_EVERY_TICKS = 3;

// 入力送信間隔の目安（ミリ秒）。
export const INPUT_SEND_MS = 33;

// プレイヤーの通常移動速度（マス/秒）。
export const PLAYER_SPEED = 4;

// ダッシュ中の移動速度（マス/秒）。
export const DASH_SPEED = 8;

// ダッシュの継続時間（秒）。
export const DASH_TIME = 0.25;

// ダッシュのクールダウン時間（秒）。
export const DASH_COOLDOWN = 1.0;

// プレイヤーの当たり判定の半径（マス）。
export const PLAYER_RADIUS = 0.35;

// 対象マスを決めるための前方距離（マス）。
export const TARGET_OFFSET = 0.6;

// 取得操作（act:grab）を採用する距離（マス、計画書C5）。
export const GRAB_ACCEPT_DIST = 1.5;

// 同時に参加できるプレイヤーの最大人数。
export const MAX_PLAYERS = 4;

// 接続先を識別するピアIDの接頭辞。
export const PEER_ID_PREFIX = "harapeko-yokocho-v1-";

// 生存確認の送信間隔（ミリ秒）。
export const PING_INTERVAL_MS = 2000;

// 無受信のまま経過すると切断と判定する時間（ミリ秒）。
export const TIMEOUT_MS = 5000;

// プレイヤー名の最大文字数。
export const NAME_MAX = 8;

// プレイヤー名が未指定の場合の既定名。
export const DEFAULT_NAME = "コック";

// 補間表示を遅延させるティック数（100ミリ秒）。
export const INTERP_DELAY_TICKS = 6;
