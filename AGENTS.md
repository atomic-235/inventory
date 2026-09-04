# AGENTS.md

## Project

Personal home inventory app ("inventory"): a lightweight PWA tracking belongings
(CSV-based, no backend). See `inventory.csv` for the data columns.

## Stack

- Vite + vanilla TypeScript (no framework) + Preact for UI
- zod v4 (pydantic-equivalent schema validation, `z.toJSONSchema()`, `z.input`)
- wa-sqlite on OPFS (dedicated worker) for storage
- `getUserMedia` camera + `fetch` to an abstract OpenAI-compatible vision API (Venice)
- Vitest (unit) + Playwright (E2E)
- GitHub Pages (runtime server-independent via offline service worker); deploy via
  `.github/workflows/deploy.yml`. `base: './'` so it works under any GH Pages subpath.
- pnpm monorepo: `packages/core` (`@inventory/core`, browser-safe domain logic),
  `packages/tui` (`@inventory/tui`, Ink TUI + node:sqlite `Db`), `packages/mcp`
  (`@inventory/mcp`, stdio MCP server wrapping the TUI's `Db`).

## MCP server (`packages/mcp`)

A local stdio MCP server registered in `opencode.json` under the name
`inventory`. It re-exposes the TUI's exact DB operations (`Db` from
`@inventory/tui/db`, same migrations, auto-resolving lookups, tombstones,
cycle-guard) so an agent can talk to the live SQLite DB "as if from the TUI".

- Tool names are prefixed `inventory_` when called: `inventory_list_items`,
  `inventory_list_all_items`, `inventory_get_item`, `inventory_find_items`,
  `inventory_add_item`, `inventory_update_item`, `inventory_remove_item`,
  `inventory_list_lookups`, `inventory_add_lookup`, `inventory_rename_lookup`,
  `inventory_remove_lookup`, `inventory_tree`.
- `add_item`/`update_item` accept `parent` (container item name, resolved to id)
  or `parent_id` (UUID); category/unit/condition are free strings auto-resolved
  as lookups, same as the TUI.
- DB path: `~/.local/share/inventory/inventory.db` (respects `XDG_DATA_HOME`).
- The server exposes **tools only, no resources**, so it will NOT show up in
  `list_mcp_resources` — that only lists resource-bearing servers. Don't conclude
  the server is disconnected from that.
- `packages/tui/package.json` gained an `exports` map (`./db`, `./config`) solely
  so the MCP can import the live `Db`; keep it when touching tui.
- Rebuild/restart opencode after changing the server or `opencode.json`.

## Commands

```sh
# enter dev shell (direnv auto-loads, or `nix develop`)
pnpm dev          # vite dev server on 127.0.0.1:5173 (manual use)
pnpm build        # tsc && vite build
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright E2E (spawns own vite on 127.0.0.1:4173)
```

Run all commands inside `nix develop` / direnv. Do NOT wrap with `nix develop` if
direnv is already active.

## Test commands / expectations

- `pnpm test` → Vitest, unit tests in `tests/**/*.test.ts`
- `pnpm test:e2e` → Playwright, specs in `e2e/*.spec.ts`
- Always `2>&1 | tee /tmp/opencode/<name>.log` for command output; do NOT use `tail`.
- Never assume Playwright browsers match — `@playwright/test` is pinned to `1.61.1`
  to match the Nix-provided chromium (revision 1228). Bump both together.

## Gotchas / learnings

### Proxy breaks localhost dev server (ROOT CAUSE of hangs)
This machine sets `http_proxy`/`https_proxy=http://127.0.0.1:20172` with no
`no_proxy`. All requests to `127.0.0.1` (including Playwright's `webServer` health
check and `curl`) get routed through that proxy, which returns `503`. Symptom:
vite prints "ready" but Playwright hangs/times out, and `curl http://127.0.0.1:PORT/`
returns `503`.

Fix (already in `flake.nix` shellHook):
```sh
export no_proxy="localhost,127.0.0.1,${no_proxy}"
export NO_PROXY="localhost,127.0.0.1,${NO_PROXY}"
```
After editing `flake.nix`, reload direnv (`direnv reload` / re-`allow`) before
expecting the new env to take effect.

### Playwright webServer config (must match baseURL port)
`webServer.url` (health check) and `use.baseURL` must use the SAME port, or
`page.goto('/')` will hit the wrong URL. Current: both on `127.0.0.1:4173`, while
manual `pnpm dev` uses `5173`. Keep them in sync when changing.

- `command: 'pnpm exec vite build && pnpm exec vite preview --host 127.0.0.1
  --port 4173 --strictPort'` — serves the **production build** (NOT the dev
  server), because the dev server's on-demand dependency optimization triggers a
  mid-test page reload ("optimized dependencies changed. reloading") that
  destroys `page.evaluate` execution contexts.
- `stdout: 'pipe'` / `stderr: 'pipe'` — default `'ignore'` hides output and makes
  hangs undiagnosable.
- `gracefulShutdown: { signal: 'SIGTERM', timeout: 500 }`.

### Orphan vite processes
Aborted `pnpm test:e2e` runs can leave vite holding the port. `strictPort: true`
makes a stale port fail fast ("Port already in use"). Clean up with:
```sh
pkill -f vite.js
```

### Chromium executable override
Nix `playwright-driver.browsers-chromium` ships only full chromium, not the
`chromium_headless_shell` Playwright wants for headless mode. Point Playwright at
the full binary via env:
```
INVENTORY_CHROMIUM=${pkgs.playwright-driver.browsers-chromium}/chromium-1228/chrome-linux64/chrome
```
and `use.launchOptions.executablePath: process.env.INVENTORY_CHROMIUM` in
`playwright.config.ts`.

### VPN / non-TTY myths
A non-TTY environment is NOT the cause of vite/Playwright hangs. Vite has no
`isTTY` dependency on its startup path. The real causes were (a) the proxy above,
(b) wrong baseURL port, (c) orphan port conflicts.

### wa-sqlite worker must serialize SQLite operations
`wa-sqlite`'s `Factory` allocates a single shared 8-byte return-value buffer
(`Module._malloc(8)`), so two concurrent `sqlite3` calls on the JS side corrupt
each other → `SQLITE_MISUSE` ("bad parameter or other API misuse"). The
`db-worker` message handler MUST process one request at a time (a `tail = tail
.then(() => handle(req))` promise chain), never let `onmessage` handlers run
concurrently. Adding an on-mount `refresh()` that races an insert is what
surfaced it.

## Secrets

- API key is entered at runtime into browser localStorage, never committed or
  bundled. `.env`/`.env.*` are gitignored except `.env.example`.
- `OPENAI_BASE_URL` in the environment points to a proxy; do not commit it.