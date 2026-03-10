# agent-skills

自分用Coding agnet skill

## Copilot hooks

`.github/hooks/hooks.json` で `postToolUse` を設定し、Markdown 用の `hooks/postToolUse/markdownlint-cli2.mjs` と JS/TS 用の `hooks/postToolUse/biome-oxlint.mjs` を実行します。

両方のフックは `toolName` に依存せず毎回実行され、Git の差分から dirty な対象ファイルを高速に抽出します。`git diff`, `git diff --cached`, `git ls-files --others --exclude-standard` を使って候補を集め、`.git/.copilot-hooks/` 配下の state と比較して、今回変わったファイルだけを対象にします。

lint は `markdownlint-cli2 --fix` を先に実行し、その後に通常の `markdownlint-cli2` を再実行します。自動修正で解決した内容は表示せず、fix 後も残った違反だけを表示します。

`markdownlint-cli2` が PATH にあればそれを使い、なければ `npx --yes markdownlint-cli2` にフォールバックします。

JS/TS 系 (`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`) は `Biome check --write` と `Oxlint --fix` を自動実行します。その後に `Biome check` と `Oxlint` を再実行し、自動修正後も残った違反だけを表示します。

`biome` と `oxlint` が PATH にあればそれを使い、なければ `npx --yes @biomejs/biome` と `npx --yes oxlint` にフォールバックします。
