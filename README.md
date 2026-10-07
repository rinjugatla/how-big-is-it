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
`objects.js` に `{ id, name, type, dims: [横, 高さ, 奥行](mm), color }` を追加してください。
