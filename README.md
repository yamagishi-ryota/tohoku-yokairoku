# 東北妖解録

東北地方を題材にした、班別Chromebook向けの静的学習ゲームです。54枚の札と七つの書を使い、選択・解放判定・札の管理・進行保存を行います。点数・無料ヒント・正答解説は表示しません。スタートページで目的とルールを読み、「次へ ― 旅を始める」で開始します。確定ルールは [GAME_SPEC.md](GAME_SPEC.md)、本文と判定は `chapters.json`、札の名前と説明は `cards.json` が基準です。

## 起動

Python 3 があれば、依存関係のインストールやビルドなしで遊べます。

```bash
cd /workspace/tohoku-yokairoku
python3 -m http.server 8000
```

通常の開発端末ではブラウザで `http://localhost:8000` を開きます。HTMLを直接ダブルクリックする方法（file://）ではJSONを取得できません。クラウド環境のループバックURLは公開URLではありません。生徒への配布には下記のGitHub Pagesを使用してください。

進行は同じ端末・ブラウザ・URLの `localStorage` に自動保存します。再読み込み後も不正解の60秒制限が続きます。保存できない場合は画面に警告します。別端末との同期はありません。ブラウザのデータ削除、シークレットモード終了、学校の管理設定で保存が消える場合があります。「最初から」は確認後に保存を初期化します。破損した保存は勝手に上書きせず、初期化を選ぶまで保持します。

外部API・ログイン・データベースは不要です。初回にデータと画像を読み込んだ後、ゲーム内操作は通信不要です。オフラインでの初回起動やオフライン再読み込みを保証するService Workerは使用していません。

## テストと配信用ビルド

Node.js 24、npm、Python 3 を使用します。テスト依存は開発時のみ必要で、配信するアプリにnpmライブラリは含みません。

```bash
npm ci
npm test
npx playwright install --with-deps chromium
npm run test:e2e
npm run build
```

`npm test` は判定、選択数、60秒制限、移動、お告げ3種、札の回収、他章の選択整理、両エンディング、保存の自動テストです。`npm run test:e2e` はPythonの一時サーバーとChromiumを起動し、1366×768で実際のクリック、再読み込み、全7章、エンディングを検証します。テスト用ブラウザ時刻を進めて60秒制限を検証するため、実際の待機は不要です。既存の `/usr/bin/chromium` があれば利用します。別の実行ファイルは `CHROMIUM_PATH=/path/to/chromium npm run test:e2e` で指定できます。テストサーバーの8765番ポートを空けてください。画面キャプチャは `test-results/` に保存します。

`npm run build` は配信対象のみを `dist/` にコピーします。`dist/` 内でも相対パスが使われるため、GitHub Pagesのリポジトリ配下URLに対応します。ビルド後は `python3 -m http.server 8000 --directory dist` で配信を確認できます。

Chromiumの1366×768と小型画面で自動検証しています。学校の実機Chromebookについては、タッチ操作・音量・管理ポリシー・授業ネットワークの最終確認を行ってください。1366×768・1366×640・1366×600では、最終章の全ボタンをスクロールなしで表示し、各本文を横1行に収めることを確認しています。小型画面や高い表示倍率では、可読性を優先して折り返し・縦スクロールで操作を継続できます。全54枚の並びは章が変わっても固定です。

## 画像について

**既存の6シートは候補素材のまま使用し、最終版かどうかは後で確認する方針です。** 新しいカード画像の生成や描き直しは行っていません。リポジトリ直下の `sheet_01_UNVERIFIED.png` ～ `sheet_06_UNVERIFIED.png` を、`cards.json` のシート番号・位置（左上から横方向に3×3）に沿って54枚に切り出し、`assets/cards/` に保存しています。原画は変更していません。6枚目は原画の右・下に白い余白があるため、単純な9等分ではなく実際のカード枠に沿って切り出しています。解放済み・捨て札でも、画像の明るさを落としません。状態はラベルで区別します。カード名は画像ボタンから独立した明るい帯に11pxの濃い文字で表示し、画像と名前が重ならない固定枠で配置します。

切り出しを再現する場合のみ、Pillowが必要です（アプリ起動・Nodeテスト・配信ビルドには不要）。

```bash
python3 -m venv .venv
.venv/bin/pip install Pillow==12.3.0
.venv/bin/python scripts/crop_cards.py
```

画像内に旧文章やスートの誤りが残っている場合でも、勝手に別の札へ置き換えません。名前・説明は拡大画面にJSONから表示し、判定にはIDだけを使います。画像が取得できない場合も札の名前・説明で操作できます。切り出し画像を確定素材とする前に、教師が全54枚の対応を確認してください。

妖の演出用に7体のイラストを生成し、既存カードを参照して黒・深い青緑・金の縁取りと写実的な質感に合わせ、`assets/yokai/atlas-cinematic.png` に同梱しました。既存のカード54枚は変更していません。成功・失敗は同じ出現アニメーションを使用し、成功時は姿を明かし、失敗時は暗くぼかして隠します。紙・山並み・エンディングの影はCSSの演出です。

書には筆文字書体「Yuji Syuku」を同梱し、外部フォントサービスへの接続なしで表示します。Google Fonts公式配布（https://github.com/google/fonts/tree/main/ofl/yujisyuku）のフォントをゲーム内の文字へサブセット化したものです。SIL Open Font License 1.1を `assets/fonts/OFL.txt` に同梱しています。原本から再作成する場合はFontToolsの `pyftsubset` で、JSONおよびUIの文字を含むテキストを `--text-file` に指定してください。

効果音と環境音はWeb Audioで端末内生成します。ユーザー操作でAudioContextの開始を待ってから、Chromebookのスピーカーでも聞こえやすい音域の音を鳴らします。「音を確認」は効果音OFFでも確認音を鳴らします。聞こえない場合は端末の音量・Chromeタブのミュート・出力先も確認してください。自動テストで音声コンテキストのrunning状態と非ゼロの波形を確認していますが、実機スピーカーからの音量は端末で確認してください。

お告げで「選びし札を問う」を購入した札は、質問した章だけに「確定」または「不要」を表示します。「組」の一致枚数は、質問当時の札の組み合わせと一緒に記録します。選択を変更しても記録は更新されず、無料の再判定にはなりません。全記録は「記録を見る」で確認でき、従来の保存データもそのまま引き継げます。

## GitHubへの変更反映

この作業環境の変更は、自動ではGitHubに反映されません。差分を確認してコミットし、作業ブランチへpushした後、Pull Requestをmainへマージしてください。

```bash
git switch -c feat/tohoku-yokairoku-app
git status --short
git add .gitignore README.md index.html style.css src scripts tests assets package.json package-lock.json .github/workflows/pages.yml
git commit -m "Implement Tohoku Yokairoku learning game"
git push -u origin feat/tohoku-yokairoku-app
```

すでに作業用ブランチがあれば、そのブランチを使えます。`dist/`、`node_modules/`、`test-results/` はコミットしません。

## GitHub Pages公開

1. GitHubのリポジトリで **Settings → Pages → Build and deployment → Source → GitHub Actions** を選びます。
2. 変更をmainに反映します。`.github/workflows/pages.yml` がロジックテスト、ブラウザテスト、ビルドを順に実行します。失敗時は公開しません。
3. Actionsの **Test and deploy Pages** が成功したら、Pages設定またはdeployジョブに表示される公開URLを開きます。通常は `https://yamagishi-ryota.github.io/tohoku-yokairoku/` ですが、実際のURLはGitHubの表示で確認してください。
4. 教師の端末と学校のChromebookで、札の拡大・効果音・保存・再読み込みを確認し、その公開URLを生徒へ配布します。公開サイトの閲覧に生徒のGitHub登録は不要です。

GitHub Pagesの公開設定・push・本番公開はこのローカル実装とは別の操作です。学校のフィルタリングでgithub.ioが許可されていることも確認してください。

## 構成

- `src/game.js` — UIから独立した判定・札の状態・進行・保存検証
- `src/audio.js` — ユーザー操作後の音声開始、効果音・環境音
- `tests/presentation.js` — 開始画面、音声波形、妖の演出、お告げ記録、全ボタンの画面内配置の検証
- `src/app.js` — 54枚の固定表示、操作・確認ダイアログ、保存、音、演出
- `tests/game.test.js` — ゲームロジックの自動テスト
- `tests/browser.js` — Chromiumでの操作・画面・保存・エンディング検証
- `scripts/crop_cards.py` — 既存シートの再現可能な切り出し
- `scripts/build.js` — 静的配信ファイルの生成

お告げの未確定詳細には仕様書の暫定ルールを採用しています。質問対象と代価は別、組の判定は奉納直前の選択、捨て札の質問は今回の奉納も含みます。これらは `src/game.js` の `oracle` 関数に分離しています。
