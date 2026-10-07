# サイズ体感ビューア

縦・横・高さ（mm / cm / m）を入力すると3Dの箱を表示し、iPhone・たばこ・冷蔵庫・自動車など
身近なものと並べて大きさを体感できる静的Webアプリです。three.js を CDN から読み込むためビルド不要です。

## GitHub Pages で公開する
1. このフォルダをリポジトリのルートにして push
2. Settings → Pages → Branch を `main` / `(root)` に設定

## ローカル確認
ES Modules を使うため `file://` では動きません。

    python -m http.server 8000

## 比較対象の追加
`objects.js` に `{ id, size, names: { ja, en }, type, dims: [横, 高さ, 奥行](mm), color }` を追加してください。

## 多言語対応
日本語（既定）と英語に対応しています。サイドバー右上の国旗ボタンで切り替えられ、選択は `localStorage` と共有URLに保存されます。
`?lang=en` のように URL で指定することもできます。文言は `i18n.js` の `DICT` に追加します。
