# 東北妖解録：Codex引き継ぎパック

1. このZIPを展開し、空のGitHubリポジトリにファイルとフォルダを登録する。
2. Codexでそのリポジトリを開き、`CODEX_PROMPT.md` の内容を送る。
3. Codexに `GAME_SPEC.md`・`chapters.json`・`cards.json` を読ませ、実装・テストする。
4. `assets/candidate_sheets/` は過去の生成画像から選んだ **6シートの候補**。授業で実際に使った最終版と一致するか、必ず見比べて確認する。違う場合はシート画像を差し替える。
5. 絵の中に焼き付いた旧文章と最新版の書本文が食い違う場合、必ず `chapters.json` の本文をHTMLで表示する。
6. GitHub Pagesへ公開する。URLを知る生徒はGitHub登録不要。

同梱内容：
- `GAME_SPEC.md` — 画面・ロジック・全7章・受入れテストの完全仕様。
- `chapters.json` — 全7章の確定原稿と正解カード21枚。
- `cards.json` — 全54枚のスート、ランク、名前、説明文、シート位置。
- `CODEX_PROMPT.md` — Codexに最初に送る指示文。
- `assets/candidate_sheets/` — 54枚の候補シート原画6枚（最終版は未確認）。
- `assets/backgrounds/` — 紙背景の候補。

**重要**：現時点で完成HTMLアプリは含まない。これはCodexに実装させるためのデータ・素材・仕様書。
