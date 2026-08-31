# AGENTS.md

## Project

Personal home inventory app ("inventory"): a lightweight PWA tracking belongings
(CSV-based, no backend). See `inventory.csv` for the data columns.

## Stack

- Vite + vanilla TypeScript (no framework)
- zod v4 (pydantic-equivalent schema validation, `z.toJSONSchema()`)
- SQLite in-browser (planned: wa-sqlite on OPFS)
- `getUserMedia` camera + `fetch` to an abstract OpenAI-compatible vision API (Venice)
- Vitest (unit) + Playwright (E2E)
- GitHub Pages (runtime server-independent via offline service worker)

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

- `command: 'pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort'` (NOT
  `pnpm dev`, to avoid a pnpm grandchild that survives aborts as an orphan).
- `stdout: 'pipe'` / `stderr: 'pipe'` — default `'ignore'` hides vite output and
  makes hangs undiagnosable.
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

## Secrets

- API key is entered at runtime into browser localStorage, never committed or
  bundled. `.env`/`.env.*` are gitignored except `.env.example`.
- `OPENAI_BASE_URL` in the environment points to a proxy; do not commit it.