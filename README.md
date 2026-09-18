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

## ファイル構成

```
index.html          画面本体（HTML+CSS+JS）
firebase-config.js   Firebase接続設定（要入力）
firestore.rules      Firestoreセキュリティルール
README.md            このファイル
HANDOFF.md           経緯・意思決定の引き継ぎメモ
```

## 既知の未対応事項

- 会場・路線とエリア（市）の対応は目安ベースで、精査はしていません
- 複数人での本格利用時の運用ルール（誰が編集してよいか等）は未整理
