# はらぺこ横丁キッチン 実装計画書（v1）

対象：`design.md`（設計書 v1）
役割：指揮・レビュー（本書の作成者）、メイン実装 Worker（GPT-6.1 Sol）、補助 Worker（Gemini Hydrogen）

本書は `design.md` に優先する。本書で確定した修正は設計書の該当箇所を上書きする。本書に書かれていない点は設計書に従う。

---

## 1. 設計レビュー

### 1.1 総評

設計書はゲームルール・画面・ネットワーク方針・マイルストーンまでそろっていて、実装に入れる水準にある。ただし次の4点はWorkerの解釈がぶれる、または実装後に作り直しになるおそれがあるので、ここで確定させる。

1. 依存ライブラリの配布方法（指示と設計書が食い違っている）
2. 食材の状態遷移と「盛り付けられる条件」の定義
3. 参加者側の移動予測の補正方法（設計書の方式ではラバーバンドが起きる）
4. 注文発生タイマーの細かい挙動

### 1.2 指摘と確定事項

#### A. 依存・構成

| # | 指摘 | 確定事項 |
|---|---|---|
| A1 | 設計書 10.1 は PeerJS を `vendor/` に同梱するとしているが、今回の指示は「PeerJS のみ CDN」 | **CDN から読み込む**。`vendor/` は作らない。jsDelivr のバージョン固定URLを `index.html` に通常の `<script>` で置く：`https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js`。実装開始時に npm で最新の 1.x を確認し、それに固定する。PeerJS への参照は `src/net/peerLoader.js` の1か所だけに閉じ込める（`globalThis.Peer ?? globalThis.peerjs?.Peer`） |
| A2 | `tests/` を Node で動かすとき、`.js` が ES Modules と判定される保証がない | ルートに依存なしの `package.json` を置き、`{"type":"module","private":true,"scripts":{"test":"node --test tests/"}}` とする。ビルド工程は追加しない |
| A3 | `simWorker.js` は sim に置かれているが、中身はタイマーだけで sim ではない | `src/game/tickWorker.js` に移す。sim は DOM・Worker・時刻APIに一切触れない |
| A4 | ホストのゲーム進行、通信、画面遷移の結合部がファイル構成にない | `src/game/` を新設し、`hostGame`（オフラインでも動く進行管理）、`hostSession` / `clientSession`（通信と進行の結合）、`predict`、`interp` を置く（2章） |
| A5 | 公開ブランチ：リポジトリの現ブランチは `master`、指示は main | 公開前に `master` を `main` に改名し、Pages の公開元を `main` の `/`（ルート）にする（7章） |
| A6 | PeerJS ブローカーが落ちているとソロでも遊べない | ルーム作成に失敗したときのダイアログに「1人で遊ぶ（オフライン）」を出す。開発用に `?solo=1` で通信なしのソロを直接起動できるようにする |

#### B. ゲームルール

| # | 指摘 | 確定事項 |
|---|---|---|
| B1 | 4.2 の状態列（raw→chopped→cooked→burnt）が全食材に当てはまらない。麺は chopped を経由しない | 食材ごとに工程を定義する：`chop: {from, to, time}`、`cook: {from, time, burnAfter}`。状態値は `raw` / `chopped` / `cooked` / `burnt` の4つのまま使う |
| B2 | 進行度の持ち方がはっきりしない | 食材に `p`（**現在の状態で経過した秒数**）を1つだけ持たせ、状態が変わったら0に戻す。どの食材もどの状態でも進む工程は1つまでなので、衝突は起きない |
| B3 | 「盛り付け可能」の条件があいまい。たとえば麺＋リーフのように、どのレシピにもならない皿を作れてしまう | **盛り付け条件**：①食材が `burnt` でない、②同じ種類の食材がまだ皿にない、③（今の中身＋その食材）が、ステージのレシピのどれか1つの `needs` の部分集合になる（種類と状態の両方が一致）。設計書 4.2 の「皿に載せられる状態」の列は廃止し、レシピから導く |
| B4 | 「完成品」の判定：リーフだけの皿は「みどりサラダ」として完成しているが、トマトも足せる | 中身がいずれかのレシピの `needs` と**完全に一致**すれば完成品（金の縁）。完成していても、B3 を満たす食材なら追加できる |
| B5 | まな板に置ける物、切るときの条件があいまい | まな板に置けるのは `chop` を持ち、かつ `s === chop.from` の食材だけ。**切る条件**：`E` を押している、手ぶら、対象マスがまな板で、その上に切れる食材がある。移動はロックしない（予測と食い違わないようにするため）。同じまな板を複数人で切っても速さは1倍のまま |
| B6 | コンロに置ける物 | `cook` を持ち、かつ `s === cook.from` または `s === "cooked"` の食材（`cooked` を戻すと焦げに向けて続きから進む）。`burnt` は置けない |
| B7 | 4.3 の表で抜けている組み合わせ（皿に皿、食材に食材、皿を持って食材ボックス など） | 何も起きない。ブザーは鳴らさない。ブザーは提供カウンターで失敗したときだけ鳴らす（2.4 の判定表が正） |
| B8 | 提供カウンターで食材や未完成の皿を出したとき | 受け付けず、ブザーを鳴らす（`ev: buzz`） |
| B9 | 注文発生タイマーの細部（上限で保留したあと／0件になったとき） | 2.4 の `orders.js` 擬似コードに従う |
| B10 | 「最初の2件はサラダ系に固定」の決め方 | ステージデータに `openingOrders: ["green_salad", "red_green_salad"]` を持たせ、その順で出す |
| B11 | 終了時に残っている注文の扱い | 減点しない |
| B12 | カウントダウン中の挙動 | プレイヤーは動けない。タイマー、注文、加熱も止まる。注文の「開始3秒後」は `playing` に入った時点から数える |
| B13 | 結果画面のプレイヤー別集計の数え方 | 切った回数：切り終えたtickに `E` を押していた全員に+1。盛り付けた回数：皿に食材を1つ載せた操作をした人に+1。提供した回数：提供した人に+1。途中で抜けたプレイヤーは結果に載せない |
| B14 | 斜め向きのとき、対象マスが床になって何もできないことがある | 向きベクトルの0.6先の点が床なら、x成分だけ、y成分だけの点の順に試し、最初に見つかった床以外のマスを対象にする |
| B15 | 名前が空欄のとき | 「コック」を使う。最大8文字。制御文字は取り除く |

#### C. ネットワーク

| # | 指摘 | 確定事項 |
|---|---|---|
| C1 | 7.5-1「ホストの位置へ少しずつ寄せる」では、ホストの位置が常にRTT/2ほど遅れているため、移動中はずっと後ろへ引き戻される（ラバーバンド） | **ack方式**にする。ホストは snap にプレイヤーごとの `ack`（最後に適用した `in.seq`）を入れる。参加者は送信時点の予測位置を `seq` ごとに記録し、`誤差 = ホストの位置 − 記録[ack]` で補正する（2.5 `predict.js`） |
| C2 | 参加者の予測を何Hzで刻むかがない | 参加者も固定 60Hz（1/60秒）のアキュムレータで `movement.js` の同じ関数を回す |
| C3 | 補間するのは位置だけで、台の上のアイテムは最新の snap で描くと、取る前に物が消えて見える | 他プレイヤーの位置は補間する。台上アイテムと他プレイヤーの所持品は補間ペアの古い側（a）の snap を使う。HUD（注文・スコア・残り時間）と自分の所持品は最新の snap を使う |
| C4 | 補間に受信時刻を使うとジッタが出る | ホストの tick から時刻を推定する（2.5 `interp.js`）。描画時刻は推定tickから6tick（100ms）前 |
| C5 | `act:grab` を「1.2マス以内なら採用」する基準点があいまい | ホスト側のプレイヤー中心から申告マスの中心までの距離が **1.5マス以下**で、そのマスが床以外なら採用する |
| C6 | 「ロビーへ戻る」を参加者に伝えるメッセージがない | `lobby` メッセージを「名簿＋フェーズ」の配信として扱い、`phase` フィールドを持たせる。フェーズが変わるたび、名簿が変わるたびに全員へ送る |
| C7 | 途中参加者が result やカウントダウン中に入ったときの初期化 | `welcome` の直後に `lobby` を送り、フェーズが `result` なら最後の `result` も再送する |
| C8 | ロビーでは定期的に届くメッセージがないので、5秒タイムアウトが誤作動する | 参加者は全フェーズで2秒ごとに `ping` を送り、ホストは `pong` を返す。双方とも「最後に何か受信してから5秒」で切断と判定する |
| C9 | `ev` を tick ごとに送ると、メッセージ数が増えやすい | 1tickに出たイベントを1通にまとめる：`{t:"ev", list:[...]}`。切る音のイベントは1枚のまな板につき0.25秒に1回まで |
| C10 | 他のピアから届く名前や中身をそのまま信用している | `protocol.js` で型、範囲、長さを検証し、不正なメッセージは捨てる。名前は必ず `textContent` で表示し、`innerHTML` は使わない |
| C11 | Web Worker を使っても、メインスレッド側の処理が遅れることがある | Worker は約16msごとに `tick` を送るだけにする。メインスレッドで `performance.now()` の差分からアキュムレータを回し、1回の追いつき処理は最大15step（250ms）に抑える。M2で「ホストのタブを裏に回して30秒」の確認を必須にする |
| C12 | ホストが `Esc` メニューから退出したとき | 全員に `bye` を送ってからピアを閉じる。`pagehide` でも可能な範囲で `bye` を送る |
| C13 | PeerJS の既定のシリアライズは binary | `serialization: "json"` を明示する。オプション名は実装時に現行のドキュメントで確認する |

#### D. 入力・その他

| # | 指摘 | 確定事項 |
|---|---|---|
| D1 | IMEがオンだとキー判定がずれる。キーリピートでダッシュが暴発する。フォーカスが外れるとキーが押されたままになる | `KeyboardEvent.code` で判定する。`repeat` は無視する。`blur` / `visibilitychange` で全キーを解除する。入力欄にフォーカスがある間はゲーム入力を無効にする。Space と矢印キーは `preventDefault` する |
| D2 | AudioContext は自動再生の制限を受ける | 最初のボタン操作で `resume()` する |
| D3 | ステージデータの誤りを検出する手段がない | `tests/stage.test.js` で検証する：行幅がそろっている、初期位置が4つ、触れる設備はすべて床に隣接している、凡例にない文字がない（設計書のグリッドは目視で確認済みで、問題なし） |
| D4 | 皿が4枚で足りるか（4人・上限5件） | M3のバランス調整で確認する項目に入れる。数値は `stages.js` の `plates` で変えられる |

---

## 2. 最終ファイル構成とインターフェース

### 2.1 ツリー

```
index.html
style.css
.nojekyll
package.json            {"type":"module"} とテストスクリプトのみ
README.md
docs/
  manual-test.md        手動確認チェックリスト
  balance.md            テストプレイの記録（M3）
src/
  main.js               起動、画面遷移、セッション管理、描画ループ
  config.js             定数
  input.js              キーボード → 抽象入力
  audio.js              効果音の合成
  data/
    ingredients.js
    recipes.js
    stages.js
    text.js             UIの文言をすべてここに集める
  sim/                  ★DOM・時刻API・乱数APIに触れない純粋層
    rng.js
    world.js
    movement.js
    interact.js
    orders.js
    step.js
    snapshot.js
  game/
    hostGame.js         フェーズ管理つきのホスト側ゲーム（通信なしでも動く）
    hostSession.js      hostGame ＋ peerHost
    clientSession.js    peerClient ＋ predict ＋ interp
    predict.js
    interp.js
    tickWorker.js
  net/
    peerLoader.js
    protocol.js
    roomcode.js
    peerHost.js
    peerClient.js
  render/
    renderer.js
    shapes.js
    hud.js
    effects.js
  ui/
    screens.js
    overlays.js
tests/
  stage.test.js
  movement.test.js
  interact.test.js
  step.test.js
  orders.test.js
  plates.test.js
  protocol.test.js
  predict.test.js
```

**依存の向き**（逆向きの import は禁止）

```
data ← sim ← game ← main
          ↖ net ↗
render, ui, input, audio ← main
```

- `render` は `data` と `sim/movement.js`（対象マスの計算）だけを import してよい。
- `sim` は `data` と `config` だけを import する。

### 2.2 共通データ構造（JSDoc typedef として `sim/world.js` に書く）

```js
/** 食材 */            // { k: "leaf", s: "raw", p: 0 }      p = 現在の状態での経過秒
/** 皿 */              // { plate: true, c: [{k:"leaf", s:"chopped"}] }
/** Item */            // 食材 | 皿 | null

/** タイル（静的） */  // { type: "floor"|"counter"|"board"|"stove"|"box"|"shelf"|"serve"|"trash", box?: "leaf" }

/** Player */
{
  slot: 0..3, name: string,
  x, y,                 // 中心座標（マス単位の float）
  fx, fy,               // 向き（8方向の単位ベクトル）
  held: Item,
  dashT, dashCd,        // 残り秒
  emote: 0..4, emoteT,
  input: { mx, my, chop, seq },
  ack: number,          // 最後に適用した in.seq
  stats: { served, chopped, plated }
}

/** WorldState（ホストのみが持つ） */
{
  stageId, playerCount,
  phase: "countdown"|"playing"|"result",
  tick, countdown, timeLeft, elapsed,   // 秒
  score,
  stats: { served, expired, tips, burnt },
  tiles: Tile[][],                       // [y][x]、静的
  items: { "x,y": Item },                // 床以外のマスに置かれた物
  players: { [slot]: Player },
  orders: [{ id, recipe, limit, left }],
  nextOrderId, nextSpawnAt, spawnedCount,
  shelf: number, returning: number[],    // 皿棚の在庫、戻り待ちの残り秒
  rng: RngState,
  events: Event[],                       // step ごとに取り出して空にする
  chopSfxT: { "x,y": number }
}
```

**Event**（`ev.list` の要素）

- `{e:"serve", slot, recipe, coins, x, y}`
- `{e:"expire", recipe}`
- `{e:"buzz", slot}`
- `{e:"chop", x, y}`
- `{e:"chopDone", x, y}`
- `{e:"cooked", x, y}`
- `{e:"burnWarn", x, y}`
- `{e:"burnt", x, y}`
- `{e:"orderNew", recipe}`
- `{e:"grab", slot}`
- `{e:"place", slot}`
- `{e:"trash", slot}`
- `{e:"phase", phase}`

### 2.3 data/

`ingredients.js`

```js
export const INGREDIENTS = {
  leaf:   { name: "リーフ", chop: { from: "raw", to: "chopped", time: 1.5 } },
  tomato: { name: "トマト", chop: { from: "raw", to: "chopped", time: 1.5 } },
  bread:  { name: "パン" },
  meat:   { name: "ミート", chop: { from: "raw", to: "chopped", time: 2.0 },
            cook: { from: "chopped", time: 8, burnAfter: 8, warnBefore: 4 } },
  noodle: { name: "麺",     cook: { from: "raw", time: 6, burnAfter: 8, warnBefore: 4 } },
};
```

`recipes.js`：設計書 10.3 の形どおり。

| キー | name | needs | price | timeLimit | weight |
|---|---|---|---|---|---|
| `green_salad` | みどりサラダ | leaf/chopped | 40 | 50 | 30 |
| `red_green_salad` | あかみどりサラダ | leaf/chopped, tomato/chopped | 60 | 60 | 30 |
| `tomato_noodle` | 横丁トマト麺 | noodle/cooked, tomato/chopped | 80 | 70 | 20 |
| `sizzle_sand` | じゅうじゅうサンド | bread/raw, meat/cooked, leaf/chopped | 100 | 85 | 20 |

`stages.js`：設計書 10.3 の `kado` に次を追加する。

```js
export const TILE_LEGEND = { ".":"floor", C:"counter", K:"board", S:"stove", P:"shelf", D:"serve", G:"trash",
                             "1":"floor", "2":"floor", "3":"floor", "4":"floor" };
// kado に追加するフィールド
openingOrders: ["green_salad", "red_green_salad"],
firstOrderDelay: 3, refillDelay: 2, expirePenalty: 20, tipRate: 0.3, plateReturn: 6,
```

- `legend` は `box:<食材>` だけを持ち、`TILE_LEGEND` を上書きする。
- 数字は初期位置（slot = 数字 − 1）。

`text.js`：`export const T = { title: "はらぺこ横丁キッチン", createRoom: "ルームを作る", ... }`。

- 画面に出す文字列はすべてここに置く（スタンプ文言、エラー文言、あそびかた本文を含む）。
- 置き換えが必要な文言は関数にする：`T.waitHost`、`T.ping(ms)`。

### 2.4 sim/

**`rng.js`**：`createRng(seed) → {s}`、`nextFloat(rng) → [0,1)`、`pickWeighted(rng, [[key, weight],...]) → key`。mulberry32 で実装する。状態はプレーンなオブジェクトにする（snapshot には入れない）。

**`world.js`**

- `parseStage(stage) → { tiles, spawns: [{x,y}×4], width, height }`。結果はキャッシュする。
- `createWorld(stageId, seed, roster: [{slot,name}]) → WorldState`
  - 状態は `phase="countdown"`、`countdown=3`、`timeLeft=duration`、`shelf=plates` から始める。
  - `playerCount = roster.length`。
- `addPlayer(state, slot, name)`：初期位置 = `spawns[slot]` のマス中心。
- `removePlayer(state, slot)`：皿を持っていれば `shelf++`。食材は消える。
- `tileAt(state, x, y)`、`isSolid(tile)`（floor 以外はすべて solid）。

**`movement.js`**（予測と共有するので、引数はすべて明示し、state 全体は受け取らない）

- `stepMovement(p, input, dt, tiles)`
  - `p` は `{x,y,fx,fy,dashT,dashCd}`。速度は `(mx,my)` を正規化したベクトル × (`dashT>0 ? 8 : 4`)。
  - 衝突は x→y の順に軸ごとに解決し、円（半径0.35）と solid タイルのAABBで押し戻す。
  - 入力がゼロでなければ向きを8方向に量子化して更新する。`dashT`、`dashCd` を減らす。
- `tryDash(p)`：`dashCd <= 0` なら `dashT=0.25`、`dashCd=1.0` にして true を返す。
- `targetTile(p, tiles) → {x,y} | null`：0.6先の点で判定し、B14 の代替規則を適用する。

**`interact.js`**

- `canHold(tileType, item)`
- `canAddToPlate(plateContents, ing, recipeKeys)`
- `isComplete(plateContents, recipeKeys) → recipeKey | null`
- `grab(state, slot, tx, ty)`：判定表に従う。結果は state を変更し、events に積む。

**判定表**（H = 手の物、I = マスの物）

| タイル | H なし | H 食材 | H 皿 |
|---|---|---|---|
| box | 新しい生の食材を持つ | – | – |
| shelf | `shelf>0` なら空の皿を持ち、`shelf--` | – | 空の皿なら戻して `shelf++` |
| serve | – | buzz | 完成品で、一致する有効な注文があれば提供。そうでなければ buzz |
| trash | – | 消す | 中身があれば空にする |
| counter | I があれば取る | I なし→置く ／ I が皿で `canAddToPlate`→皿に載せる | I なし→置く ／ I が食材で `canAddToPlate`→すくう |
| board | I があれば取る | I なし＆`canHold`→置く | I が食材で `canAddToPlate`→すくう |
| stove | I があれば取る | I なし＆`canHold`→置く | I が食材で `canAddToPlate`→すくう |

**提供の処理**

1. `isComplete` が返したレシピと一致する注文のうち、`left` が最小のものを選ぶ。
2. `coins = price + round(price × tipRate × left/limit)` を `score` に加え、`stats` と `player.stats.served` を更新する。
3. 注文を消し、`returning.push(plateReturn)` して手を空にする。
4. `orders.onOrderRemoved(state, stage)` を呼ぶ。

**`orders.js`**

- `spawnOrder(state, stage)`
  - `spawnedCount < openingOrders.length` なら `openingOrders[spawnedCount]` を使う。
  - そうでなければ `pickWeighted` で選ぶ。
  - `limit = timeLimit × limitScale` とする。
- `updateOrders(state, stage, dt)`
  - 各注文の `left -= dt`。0以下になったら期限切れ：`score = max(0, score − expirePenalty)`、`stats.expired++` してから `onOrderRemoved` を呼ぶ。
  - `elapsed >= nextSpawnAt` かつ `orders.length < maxOrders` なら1件出し、`nextSpawnAt = elapsed + interval` にする。
- `onOrderRemoved(state, stage)`
  - `nextSpawnAt <= elapsed`（上限で保留中だった）なら `nextSpawnAt = elapsed + refillDelay`。
  - `orders.length === 0` なら `nextSpawnAt = min(nextSpawnAt, elapsed + refillDelay)`。
- `computeStars(score, stage, playerCount) → 0..3`

**`step.js`**：`step(state, stage, dt) → Event[]`（dt は常に 1/60）

- **countdown**：`countdown -= dt`。0以下になったら `playing` に移り、`nextSpawnAt = firstOrderDelay` にして `ev phase` を出す。
- **playing**：次の順に処理する。
  1. 各プレイヤーに `stepMovement` をかけ、エモート時間を減らす。
  2. 切る処理（B5）。まな板ごとに1tick1回まで。完了したら `s=to`、`p=0`、`chopDone` を出し、そのとき切っていた全員の `chopped++`。
  3. コンロの処理：生のものは time に達したら `cooked`。`cooked` は `burnAfter − warnBefore` を越えた瞬間に `burnWarn`、`burnAfter` で `burnt` と `stats.burnt++`。
  4. `returning` を減らし、0以下になったら `shelf++`。
  5. `updateOrders`。
  6. `timeLeft -= dt`。0以下になったら `phase="result"`。
- **result**：何もしない。
- 最後に `state.tick++`。events を返して空にする。

**`snapshot.js`**（形式を知っているのはこのファイルだけ）

- `encodeSnap(state) →`

```js
{ t:"snap", k:tick, ph, cd, tl, sc,
  pl:[[slot,x,y,fx,fy,held,dash01,emote,ack]], it:[[x,y,item]], od:[[id,recipe,left,limit]], sh }
```

  - 座標は小数3桁、秒は小数2桁に丸める。皿は `{c:[[k,s],...]}`、食材は `{k,s,p}` で表す。
- `decodeSnap(msg) → View`

```js
{ tick, phase, countdown, timeLeft, score,
  players:[{slot,x,y,fx,fy,held,dashing,emote,ack}], items: Map("x,y"→Item), orders:[...], shelf }
```

- `buildResult(state, stage, roster) →`

```js
{ t:"result", score, stars, cleared, served, expired, tips, burnt,
  players:[{slot,name,served,chopped,plated}] }
```

- ホストも `decodeSnap(encodeSnap(state))` で View を作って描画する。こうするとホストと参加者の見え方が一致することが保証される。

### 2.5 game/

**`hostGame.js`**：通信を知らない。

`createHostGame(stageId) →`

- `.roster`：`Map(slot → {name, ready})`
- `.phase`：`"lobby"|"countdown"|"playing"|"result"`
- `.addPlayer(slot, name)` / `.removePlayer(slot)`：ゲーム中なら world にも反映する。
- `.setInput(slot, {mx,my,chop,seq})`
- `.act(slot, {a:"grab",x,y} | {a:"dash"} | {a:"emote",n})`
  - grab は C5 で検証してから `grab` を呼ぶ。dash は `tryDash`。emote は `emote=n, emoteT=2`。
- `.start(seed)`：`createWorld` を呼び、countdown に入る。
- `.tick(dt) → Event[]`
- `.snap()`、`.view()`、`.result()`
- `.backToLobby()`：全員の ready を false に戻す。

**`tickWorker.js`**：`setInterval(() => postMessage(0), 1000/60)`。読み込みは `new Worker(new URL("./tickWorker.js", import.meta.url), {type:"module"})` で行う。

**`hostSession.js`**

`createHostSession({name, offline, onView, onRoster, onResult, onEvents, onError}) → { code, start(), again(), toLobby(), leave() }`

- 内部で `hostGame` と、`offline` でなければ `peerHost` を持つ。
- **ループ**：Worker から通知が来るたびに `performance.now()` の差分をアキュムレータに足し、`hostGame.tick(1/60)` を最大15回まで回す。3tickごとに `broadcast(snap)`。イベントがあれば `broadcast({t:"ev",list})` して、`onEvents` でローカルにも渡す。
- **slot の割り当て**：空いている最小番号。ホスト自身は slot 0。
- **`hello` の処理**：版が違えば `reject version`、4人そろっていれば `reject full`。それ以外は `welcome` → `lobby` の順に送り、フェーズが result なら `result` も送る。
- 自分の入力は `input.js` から直接 `setInput` / `act` に渡す（seq は使わない）。

**`clientSession.js`**

`createClientSession({name, code, onView, onRoster, onResult, onEvents, onClosed(reason)})`

- `peerClient` で接続する。
- `welcome` を受け取ったら slot と stageId を確定し、predictor と interp を作る。
- 毎フレーム `update(now, inputState)` を呼ぶ：60Hz の固定ステップで predictor を進め、33msごとに `in` を送る。
- `getView(now)` は次をまとめて返す：interp で求めた他プレイヤーの位置、自分の位置は predictor、HUD は最新の snap、台上アイテムは補間ペアの a 側。
- 2秒ごとに `ping` を送る。5秒何も受信しなければ `onClosed("timeout")`。

**`predict.js`**：`createPredictor(stage, x, y) → { pos, step(input,dt), dash(), record(seq), reconcile(hx,hy,ack) , renderPos() }`

- `record(seq)`：`hist.push({seq,x,y})`
- `reconcile`
  1. `ack` 以下の記録を捨てる。
  2. `err = (hx,hy) − hist[ack]` を求める。
  3. `|err| < 0.02` なら何もしない。
  4. `|err| >= 1.5` なら `pos = (hx,hy)` にして、記録を消し、表示オフセットも0にする。
  5. それ以外なら `pos += err`、残りの記録にも `err` を足し、`visualOffset -= err` とする。
- `renderPos() = pos + visualOffset`。`visualOffset` は毎フレーム × 0.85 で0に近づける。

**`interp.js`**：`createInterp() → { push(view, nowMs), sample(nowMs) → {a, b, alpha, latest} }`

- 推定tick `est = latest.tick + (now − latestRecv) × 0.06` を求め、指数平滑する。
- 描画tick は `est − 6`。
- バッファは最大20件。

### 2.6 net/

**`peerLoader.js`**：`getPeerClass()`。読み込まれていなければ `Error("peerjs-missing")` を投げる。

**`roomcode.js`**

- `ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"`（0,O,1,I,L を除いた31文字）
- `generateCode(rand = Math.random)`
- `normalizeCode(s)`：大文字化し、許可されていない文字を除く。
- `isValidCode(s)`
- `toPeerId(code) = "harapeko-yokocho-v1-" + code`

**`protocol.js`**

- `PROTOCOL_VERSION` は `config.js` から読む。
- `validateFromClient(msg) → msg | null`：`hello`、`ready`、`in`（`mx,my` を [-1,1] に収める）、`act`、`ping`。
- `validateFromHost(msg) → msg | null`
- `sanitizeName(s)`

**`peerHost.js`**：`createPeerHost({onConnect(connId), onMessage(connId,msg), onDisconnect(connId)}) → { open(): Promise<code>, send(connId,msg), broadcast(msg), close(connId?) }`

- `unavailable-id` が返ったらコードを作り直して最大5回まで試す。
- ブローカーとの `disconnected` では `peer.reconnect()` を1回試す。
- `conn` は `serialization:"json"` で受ける。
- `connId` は文字列の連番。

**`peerClient.js`**：`connectPeerClient(code, {onMessage, onClose, onError}) → Promise<{send, close}>`

- 10秒以内に open しなければ `"connect-failed"`。
- `peer-unavailable` は `"not-found"` として返す。

### 2.7 render/・ui/・input/・audio/

**`input.js`**：`createInput(win) → { state() → {mx,my,chop}, onAction(cb), onMenu(cb), setEnabled(bool), dispose() }`

- `cb` に渡す値：`{a:"grab"}`、`{a:"dash"}`、`{a:"emote",n}`。grab の対象マスは session 側で付ける。
- D1 の対策を入れる。

**`shapes.js`**（純粋な描画関数。座標はピクセル）

- `drawTile(ctx, tile, px, py, size, t)`
- `drawIngredient(ctx, k, s, cx, cy, size)`
- `drawPlate(ctx, contents, cx, cy, size, complete)`
- `drawItem(...)`
- `drawPlayer(ctx, slot, cx, cy, fx, fy, size, isSelf)`
- `drawRecipeIcon(ctx, recipeKey, cx, cy, size)`
- 色は設計書 9章の値を `PALETTE` として export する。

**`renderer.js`**：`createRenderer(canvas) → { resize(), render(view, ctx2) }`

- `ctx2` は `{stage, roster, selfSlot, target, ping, effects, now}`。
- 論理解像度は 832×720。等比で拡縮し、devicePixelRatio にも対応する。
- 描く順番：床とタイル → アイテム → 進行バーと警告 → プレイヤー → 名前とスタンプ → 対象マスの白枠 → HUD → effects。

**`hud.js`**

- `drawTopHud(ctx, view, stage)`：注文チケット（最大5枚、1枚150px）、コイン、残り時間。
- `drawBottomHud(ctx, view, stage, playerCount, ping)`

**`effects.js`**：`createEffects() → { push(event, view), update(dt), draw(ctx) }`

- 浮かぶ「+115」、「3・2・1・開店！」、「閉店！」、ブザー時の揺れ。

**`screens.js`**：`createScreens(rootEl, handlers) → { show(name, data), update(name, data) }`

- `name` は `title` / `join` / `lobby` / `result` / `none`。
- `handlers` は `{onCreate(name), onJoin(name,code), onReady(b), onStart(), onAgain(), onToLobby(), onLeave(), onSoloOffline(), onHowto()}`。

**`overlays.js`**：`showHowto()`、`showMenu({onLeave})`、`showDialog({message, buttons})`。

**`audio.js`**：`createAudio() → { resume(), play(eventName) }`

- 鳴らすもの：`grab`、`place`、`chop`、`chopDone`、`serve`、`buzz`、`expire`、`burnWarn`、`burnt`、`orderNew`、`count`、`start`、`end`、`emote`。
- 発振器とエンベロープだけで作る。

**`main.js`**

1. 起動時に URL を読む（`room`、`solo`、`debug`、`lag`、`seed`）。
2. タイトル画面を出す。
3. セッションを作る（host / client / offline）。
4. rAF ループで描画する。
5. 終了や切断を受けたら画面を戻す。
6. 名前は `localStorage["harapeko.name"]` に保存する。
7. `?debug=1` では fps、tick、snap のバイト数、ping、予測誤差を左上に表示する。
8. `?lag=150` では参加者の送受信を `setTimeout` で遅らせる。

---

## 3. 実装順序

### M1：1人で遊べるコア

| 段階 | 内容 | 完了条件 |
|---|---|---|
| M1-1 | `package.json`、`.nojekyll`、`config.js`、`data/*`、`index.html`（canvas とオーバーレイ用の div）、`style.css` | HTTPサーバーで開くと何も表示されない画面が出て、コンソールにエラーがない |
| M1-2 | `sim/rng`、`world`、`movement` と `stage.test`、`movement.test` | `npm test` が通る |
| M1-3 | `interact`、`orders`、`step`、`snapshot` とテスト一式 | `npm test` が通る。Node から `createWorld` → `step` を 180秒 × 60回まわすと result に到達する |
| M1-4 | `hostGame`、`tickWorker`、`hostSession`（offline のみ）、`input`、`renderer`、`shapes`（仮の図形でよい）、`hud`、`main`（`?solo=1` で直接開始し、簡易の結果表示を出す） | 手動チェックリストの「1人プレイ」がすべて OK |

### M2：オンライン協力

| 段階 | 内容 | 完了条件 |
|---|---|---|
| M2-1 | `roomcode`、`protocol`、`peerLoader` と `protocol.test` | `npm test` が通る |
| M2-2 | `peerHost`、`peerClient`、`screens`（タイトル、参加、ロビー、結果）、ロビーの名簿・ready・開始 | 2ウィンドウでロビーに合流でき、ready と開始が同期する |
| M2-3 | `clientSession`、`predict`、`interp` と `predict.test`。snap と ev の配信 | 2ウィンドウで1ゲーム完走できる。`?lag=150` でも自キャラが即応し、相手が滑らかに動く |
| M2-4 | 途中参加、切断、`bye`、満員、版違い、ホストのタブを裏に回す確認、オフライン代替 | 手動チェックリストの「2ウィンドウ」がすべて OK。チャネルを1本のままにするか2本にするかを `docs/balance.md` に実測値つきで記録する |

### M3：仕上げと公開

| 段階 | 内容 | 完了条件 |
|---|---|---|
| M3-1 | `shapes` の作り込み、`audio`、`effects`、スタンプ、`overlays`（あそびかた、メニュー、ダイアログ）、結果画面の全項目、招待URL、文言を `text.js` に集約 | 画面に出る文字列のハードコードが0件（`text.js` 以外で日本語の文字列を grep して確認） |
| M3-2 | バランス調整（1〜4人それぞれで3回以上プレイ）、`docs/balance.md` | ★の到達状況が設計書 M3 の基準を満たす |
| M3-3 | README、名前の衝突検索、ブラウザの確認（Chrome、Edge、Firefox、Safari） | 結果を README に記載する |
| M3-4 | GitHub Pages 公開（7章） | 公開URLで、別回線の2台が1ゲーム完走できる |

---

## 4. Worker のタスク分解

### 4.1 共通ルール

- 1タスクにつき1コミットを目安にする。コミットメッセージは英語の命令形で書く（例：`Add interact rules`）。
- タスク完了時には、変更したファイル、`npm test` の結果、手動で確認した項目を報告する。
- 指揮担当がレビューしてから次のタスクに進む。
- インターフェース（2章）を変える必要が出たら、実装する前に指揮担当に相談する。

### 4.2 メイン実装（GPT-6.1 Sol）

| ID | ファイル | 前提 | 備考 |
|---|---|---|---|
| S1 | `index.html`、`style.css`、`.nojekyll`、`package.json`、`src/config.js` | – | PeerJS の script タグは M2-2 で追加する |
| S2 | `sim/world.js`、`sim/movement.js` | G1, G2 | 2.4 に従う |
| S3 | `sim/interact.js` | S2 | 判定表をそのまま実装する |
| S4 | `sim/orders.js`、`sim/step.js` | S3 | |
| S5 | `sim/snapshot.js` | S4 | |
| S6 | `game/hostGame.js`、`game/tickWorker.js`、`game/hostSession.js`（offline） | S5 | |
| S7 | `input.js`、`render/renderer.js`、`render/hud.js`、`main.js`（M1版） | S6, G4（仮版でも可） | |
| S8 | `net/peerLoader.js`、`net/peerHost.js`、`net/peerClient.js` | G3 | |
| S9 | `ui/screens.js`、`hostSession` へのネットワーク統合、`main.js`（M2版） | S8 | |
| S10 | `game/predict.js`、`game/interp.js`、`game/clientSession.js` | S9 | |
| S11 | 途中参加、切断、`bye`、オフライン代替、デバッグ用パラメータ | S10 | |
| S12 | `render/effects.js`、`ui/overlays.js`、スタンプ、結果画面の全項目、招待URL | S11, G5, G6 | |
| S13 | バランスの数値反映、ブラウザ互換の修正 | M3-2 の結果 | |

### 4.3 補助担当（Gemini Hydrogen）向けの独立タスク

どのタスクも、2章で関数シグネチャを固定してあるので、メイン実装を待たずに並行して進められる。

| ID | 成果物 | 内容と受け入れ条件 |
|---|---|---|
| G1 | `src/data/ingredients.js`、`recipes.js`、`stages.js` | 2.3 と設計書 5章・10.3 の数値をそのまま入れる。数値の創作はしない |
| G2 | `src/sim/rng.js`、`src/net/roomcode.js` | 2.4・2.6 の仕様どおり。DOM 非依存 |
| G3 | `src/net/protocol.js` | 全メッセージの検証関数と `sanitizeName`。不正値の例を JSDoc に書く |
| G4 | `src/render/shapes.js` | 設計書 9章の形と色。外部画像は使わない。確認用に `docs/shapes-preview.html`（全食材、全状態、全設備、4人分のキャラを並べる）も作る |
| G5 | `src/audio.js` | 2.7 の14種。音量は控えめにする（マスターゲイン0.3） |
| G6 | `src/data/text.js` | UI文言の全量（タイトル、参加、ロビー、ゲーム、結果、あそびかた本文、エラー、注意書き、スタンプ）。やさしい日本語で、絵文字は使わない |
| G7 | `tests/*.test.js` | 5章の観点を `node:test` と `node:assert/strict` で実装する。S2〜S5 の完成前は、シグネチャどおりに書いて skip しておいてよい |
| G8 | `docs/manual-test.md` | 6章の項目をチェックボックス形式にする |
| G9 | `README.md` | 遊び方、ローカル起動、公開URL、既知の制限、ライセンス（PeerJS MIT の表記） |
| G10 | 名前の衝突調査（M3） | 「はらぺこ横丁キッチン」と、レシピ名・キャラの見た目が既存作品と衝突していないかを Web で検索し、結果を報告する（ファイルには書かない） |

**テスト観点**（G7 で実装する）

- **stage**：行幅がそろっている。初期位置が4つ。触れる設備は床に隣接している。凡例の外の文字がない。
- **movement**：壁で止まる。壁沿いに滑る。斜めでも速さは4。ダッシュ中は8で、0.25秒で終わり、クールダウンは1秒。角を抜けない。
- **targetTile**：4方向、斜め、斜めの代替規則。
- **interact**：判定表の全セル。B3（どのレシピにもならない組み合わせは拒否）、B4（完成後の追加）、`burnt` は拒否。
- **step**：切る処理は `E`・手ぶら・まな板の3条件がそろったときだけ進む。2人で切っても1倍。麺は6秒で cooked、さらに8秒で burnt。焦げ警告は4秒前。下ろすと止まり、戻すと続きから進む。
- **orders**：1件目は3秒後。オープニングの順序。間隔。上限で保留して、空いたら2秒後に出る。0件になったら2秒後。期限切れの減点は0未満にならない。同じ料理なら残りが最小のものを消化する。チップ例は115。終了時は減点しない。同じシードなら同じ注文列になる。
- **plates**：シード付きのランダム操作を1万回行っても、皿の総数（棚、戻り待ち、台上、手持ち）が常に4。切断時に皿が棚へ戻る。
- **protocol**：snap の encode/decode を往復させても値が保たれる。不正メッセージを拒否する。`mx` を [-1,1] に収める。名前の長さを切り詰める。
- **predict**：誤差1.5以上で位置を直接合わせる。小さい誤差は ack 基準で補正し、移動中でも後ろへ戻されない。

---

## 5. コーディング規約

- **依存**：外部ライブラリは PeerJS だけ。jsDelivr のバージョン固定URLを `index.html` に通常の `<script>` で置き、その後に `<script type="module" src="src/main.js">` を置く。npm パッケージ、バンドラ、トランスパイラ、CSSフレームワークは使わない。
- **ビルドなし**：リポジトリの中身がそのまま公開物になる。`package.json` はテスト実行のためだけに置く。
- **ES Modules**：import は相対パスで、拡張子 `.js` まで書く。パスはすべて相対パスにする（先頭に `/` を付けない）。named export だけを使い、default export は使わない。
- **層の制約**：`src/data`、`src/sim` は `window`、`document`、`performance`、`Date`、`Math.random`、`localStorage` に触れない。時間は `dt` で受け取り、乱数は `rng.js` を使う。
- **単位**：sim の座標はマス、時間は秒。ピクセルは render の中だけで扱う。
- **命名**
  - 変数と関数は camelCase、定数は UPPER_SNAKE_CASE、ファイル名は camelCase。
  - データのキー（食材、レシピ、ステージ）は snake_case の英語。
  - 生成関数は `createXxx`。
- **コメント**：日本語で書く。識別子は英語。公開関数と主要な型には JSDoc を付ける（説明は日本語）。設計上の判断には、本書の項番を `// 計画書B3` のように添える。
- **書式**：インデント2スペース、セミコロンあり、文字列はダブルクォート、末尾カンマあり。1ファイルはおおむね400行以内。
- **文字列**：画面に出す文言は `data/text.js` に集める（`?debug=1` の表示は例外）。
- **安全**：他のピア由来の文字列は `textContent` で表示する。`innerHTML` は自分で書いた固定の文字列にだけ使う。受信したメッセージは必ず `protocol.js` で検証してから使う。
- **エラー**：通信エラーは画面に日本語で表示し、詳細は `console.warn` に出す。`try/catch` で握りつぶさない。

---

## 6. ローカル検証手順

### 6.1 起動

```sh
cd coop-cooking-game
npm test                          # Node 20以上。sim とプロトコルの単体テスト
python3 -m http.server 8000       # ES Modules は file:// では動かない
```

- ソロ（通信なし）：`http://localhost:8000/?solo=1`
- 通常：`http://localhost:8000/`
- デバッグ表示：URL に `&debug=1` を足す。参加者側を遅延させるなら `&lag=150` も足す。
- PeerJS ブローカーにつなぐため、通信の確認にはインターネット接続が必要。`localhost` はセキュアコンテキストなので、WebRTC とクリップボードが使える。

### 6.2 1人プレイの確認項目（M1）

- [ ] コンソールにエラーがなく、カウントダウン「3・2・1・開店！」のあと開始する。カウントダウン中は動けない
- [ ] WASD と矢印キーで8方向に移動でき、斜めでも速すぎない。壁と設備で止まり、壁沿いに滑る
- [ ] Shift で短く加速し、1秒以内の連打では再発動しない
- [ ] 対象マスの白枠が、向いている設備に正しく出る（斜めのときも）
- [ ] 食材ボックス、作業台、まな板、コンロ、皿棚、提供カウンター、ゴミ箱が判定表どおりに動く
- [ ] 切る処理は E を押している間だけ進む。離しても進行度が残り、持ち去って戻しても残っている
- [ ] 麺は6秒、ミートは8秒で加熱が終わる。そこから4秒後に警告が点滅し、さらに4秒でこげる。こげたものは盛れない
- [ ] 4レシピすべてを作って提供できる。表示されたコインが「価格＋チップ」の式どおり
- [ ] 間違った料理は受け付けずブザーが鳴る。期限切れは−20で、0未満にならない
- [ ] 1件目は開始3秒後で、最初の2件はサラダ。上限を超えて注文が出ない
- [ ] 皿は最大4枚で、提供した6秒後に棚へ戻る
- [ ] 180秒で「閉店！」が出て結果画面に移り、数値が実際のプレイと合う
- [ ] `stages.js` の `duration` を30に変えると、コードを触らずに30秒で終わる
- [ ] IMEオンでも操作でき、ウィンドウからフォーカスが外れてもキーが押されたままにならない

### 6.3 2ウィンドウでの通信確認項目（M2）

使うのは、Chrome の通常ウィンドウ（ホスト）と、シークレットウィンドウまたは Firefox（参加者）。`localStorage` が分かれるので、名前を別々にできる。

- [ ] ホストがルームを作ると、4文字のコードと招待URLが出る。「招待URLをコピー」が動く
- [ ] 参加者がコード入力（小文字も可）と招待URLのどちらでも参加でき、ロビーに両者が色、帽子、名前つきで出る
- [ ] 参加者が準備OKにするまで、ホストの開始ボタンは押せない
- [ ] カウントダウンと開始が両画面で同期し、注文、スコア、残り時間が一致する
- [ ] 参加者の自キャラが、`?lag=150` でも入力に即応する。止まったときに後ろへ戻らない
- [ ] 相手のキャラが飛ばずに滑らかに動く（両方の画面で確認）
- [ ] 島越しの受け渡し、同じ物を同時に取る操作（片方だけ成功する）、2人で同じまな板を切る操作
- [ ] 提供の演出、効果音、スタンプが相手側にも出る（M3）
- [ ] 結果画面が両画面で一致する。参加者側は「ホストの操作を待っています」と表示される。「もう一度」「ロビーへ戻る」に両方が追従する
- [ ] ゲーム中に参加者がタブを閉じると、ホスト側は5秒以内にそのキャラが消え、持っていた皿が棚に戻る。ゲームは続く
- [ ] 同じコードで入り直すと、途中参加として出現する
- [ ] ゲーム中に3つ目のウィンドウから途中参加できる
- [ ] 5つ目のウィンドウは「満員です」になる
- [ ] 存在しないコードを入れると「ルームが見つかりません」が出る
- [ ] 版違いの表示を確認する（`?debug=1&pv=0` で送信する版を偽る）
- [ ] ホストが別タブに切り替えて30秒待っても、参加者側で残り時間が進み続ける
- [ ] ホストがタブを閉じると、参加者に「ホストとの接続が切れました」が出てタイトルへ戻る
- [ ] `?debug=1` で snap の大きさが 2KB 以下、ping が表示されている
- [ ] （M2完了時）別回線の2台でも同じことを確認する。片方はスマホのテザリングでよい

---

## 7. GitHub Pages 公開手順

公開は外部への発信にあたる。各手順の実行前に、ユーザーの承認を得る。特にリポジトリの公開設定の変更と、リモートブランチの削除は必ず確認してから行う。

```sh
# 0. 現状確認
gh auth status
git remote -v
gh repo view --json nameWithOwner,visibility,defaultBranchRef

# 1. ブランチを main に改名する（現状は master）
git branch -m master main

# 2a. リモートがない場合：公開リポジトリとして作成し、push する
gh repo create <リポジトリ名> --public --source=. --remote=origin --push

# 2b. リモートがある場合：push して、既定ブランチを切り替える
git push -u origin main
gh repo edit --default-branch main
git push origin --delete master          # 承認後に実行

# 3. 非公開なら公開にする（無料プランの Pages の条件。承認必須）
gh repo edit --visibility public --accept-visibility-change-consequences

# 4. Pages を main の / から配信する設定にする
gh api -X POST "repos/{owner}/{repo}/pages" -f "source[branch]=main" -f "source[path]=/"
#    すでに有効な場合は更新する
gh api -X PUT  "repos/{owner}/{repo}/pages" -f "source[branch]=main" -f "source[path]=/"

# 5. ビルド状況と URL を確認する
gh api "repos/{owner}/{repo}/pages/builds/latest" --jq .status    # built になるまで待つ
gh api "repos/{owner}/{repo}/pages" --jq .html_url

# 6. リポジトリの説明欄に URL を載せる
gh repo edit --homepage "<html_url>"
```

**公開後の確認**

- [ ] `<html_url>` を開いたとき、コンソールで ES Modules と PeerJS の CDN 読み込みにエラーがない（404 があればパスが相対になっているか、`.nojekyll` があるかを見る）
- [ ] `<html_url>?room=XXXX` の招待URLで、別回線の端末から参加できる
- [ ] 6.2 と 6.3 のうち主要な項目（1ゲーム完走、途中参加、ホストの切断）を公開URLで再確認する
- [ ] README に公開URLとブラウザの確認結果を記載して push する

<br>

**更新時の流れ**：`main` に push すると Pages が自動で再配信される。反映は数分以内。
