# 大阪需要サーチ

タクシー営業中の空車待機判断のための需要ダッシュボード。飲食店の閉店時刻・鉄道の運行状況・イベントの終演時刻を一覧表示します。
対象エリア：大阪市・堺市・東大阪市・八尾市・吹田市・豊中市。

ビルド不要のバニラHTML/CSS/JSです。ブラウザで `index.html` を開くだけで動作しますが、
複数人でデータを共有するには Firebase（無料枠）のセットアップが必要です。

## 1. Firebaseプロジェクトを作成する

1. https://console.firebase.google.com/ にアクセスし、Googleアカウントでログイン
2. 「プロジェクトを追加」→ 好きな名前（例: `osaka-demand-search`）を入力して作成
   - Googleアナリティクスは不要なのでオフのままでOK

## 2. Firestore Database を有効化する

1. 左メニューの「構築」→「Firestore Database」を開く
2. 「データベースの作成」をクリック
3. ロケーションは `asia-northeast1`（東京）または `asia-northeast2`（大阪）を選択
4. モードは「テストモード」で開始（後述のルールで上書きします）

## 3. ウェブアプリを登録して設定値を取得する

1. プロジェクトの設定（歯車アイコン）→「全般」タブ→「マイアプリ」
2. 「</>」（ウェブ）アイコンをクリックしてアプリを登録（Firebase Hostingの設定はスキップでOK）
3. 表示された `firebaseConfig` の値をコピーし、このフォルダの [firebase-config.js](firebase-config.js) に貼り付ける

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

## 4. セキュリティルールを設定する

1. Firestore Database →「ルール」タブを開く
2. このフォルダの [firestore.rules](firestore.rules) の内容をそのまま貼り付けて「公開」

初期状態は「誰でも読み書き可」の簡易設定です。少人数運用が前提のため必要最低限にしています。
荒らし対策が必要になった場合は Firebase Authentication の導入を検討してください。

## 5. GitHubリポジトリを作成してGitHub Pagesで公開する

```bash
git init
git add .
git commit -m "初回コミット"
```

1. GitHubで新しいリポジトリを作成（例: `osaka-demand-search`）
2. ローカルのリポジトリをプッシュ

```bash
git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
git branch -M main
git push -u origin main
```

3. GitHubのリポジトリ画面 →「Settings」→「Pages」
4. 「Source」を `Deploy from a branch` にし、Branch を `main` / `/(root)` に設定して保存
5. 数分後、`https://<ユーザー名>.github.io/<リポジトリ名>/` でアクセス可能になる

このURLを友人・同業者に共有すればログイン不要で閲覧・入力できます。

## データの更新・削除

- 各タブの「＋ 店舗を追加」「＋ 路線を追加」「＋ イベントを追加」から入力
- 初回アクセス時は動作確認用のサンプルデータが自動で入ります（店名末尾に「サンプル」と表記）
- 本番データを入れ始めたら、飲食店タブ・イベントタブの「サンプルを削除する」ボタンで一括削除できます
- 鉄道タブは運行状況（平常／遅延／見合わせ）をボタンでその場で切り替えられます（全員に即時反映）

## 鉄道の自動更新（全26路線）

GitHub Actionsが10分おきに各鉄道会社の運行情報を取得し、自動でステータスを更新します。手動更新の路線はありません。

| 会社 | 自動化した路線 |
|---|---|
| JR西日本 | JR京都線・JR神戸線・JR大阪環状線・JR阪和線・JRおおさか東線・JR大和路線・JR東西線 |
| 阪急電鉄 | 阪急京都線・阪急神戸線・阪急宝塚線 |
| 阪神電気鉄道 | 阪神本線 |
| 近畿日本鉄道 | 近鉄大阪線・近鉄奈良線 |
| 南海電気鉄道 | 南海本線・南海高野線 |
| Osaka Metro | 御堂筋線・谷町線・四つ橋線・中央線・千日前線・堺筋線・長堀鶴見緑地線・今里筋線・ニュートラム（全9路線） |
| 大阪モノレール | 大阪モノレール（公式サイト） |
| JR東海 | 新幹線(山陽・東海道)（公式サイト） |

仕組みは [scripts/update-train-status.js](scripts/update-train-status.js) と [.github/workflows/update-train-status.yml](.github/workflows/update-train-status.yml) です。GitHubにpushするだけで動作し、Osaka Metro用のAPIキー以外は追加のシークレット設定は不要です（Firestoreルールが「誰でも書き込み可」のため）。1社の取得に失敗しても他社の処理は止まらない設計にしています。

**注意点**

- いずれも各社の公式サポート対象ではない非公式・準公式エンドポイントを利用しているため、先方の仕様変更で予告なく取得できなくなる可能性があります
- **Osaka Metro（大阪メトロ）は運行情報の二次利用を公式サイトで明示的に禁止しています。** 利用者の判断により自己責任で自動化を行っています。規約リスクを避けたい場合は `scripts/update-train-status.js` の `fetchOsakaMetro` 呼び出しを外してください
- Osaka Metroの自動判定は、実際に障害が発生した際のレスポンス例を確認できないまま実装したベストエフォートです。誤判定の可能性があります
- GitHubの仕様上、リポジトリに60日間pushがないと定期実行（スケジュール）が自動停止します。これを防ぐため [.github/workflows/keep-alive.yml](.github/workflows/keep-alive.yml) が毎月1日に自動で小さなコミットを積み、60日を超える前に必ずpushが発生するようにしています（手動対応は基本的に不要）
- 自動更新の路線名の横には「自動」ラベルが表示されます。手動でボタンを押すとその場で上書きされますが、次の自動実行（最大10分後）で最新の公式情報に戻ります

## ファイル構成

```
index.html          画面本体（HTML+CSS+JS）
firebase-config.js   Firebase接続設定（要入力）
firestore.rules      Firestoreセキュリティルール
scripts/update-train-status.js       JR運行情報の自動取得スクリプト
.github/workflows/update-train-status.yml  10分おきの自動実行設定
README.md            このファイル
HANDOFF.md           経緯・意思決定の引き継ぎメモ
```

## 既知の未対応事項

- 会場・路線とエリア（市）の対応は目安ベースで、精査はしていません
- 複数人での本格利用時の運用ルール（誰が編集してよいか等）は未整理
